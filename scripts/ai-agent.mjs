// scripts/ai-agent.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import readline from "readline";

const AI_BASE = process.env.AI_BASE_URL;
const AI_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run") || args.includes("-d");
const AUTO_YES = args.includes("--yes") || args.includes("-y");
const VERBOSE = args.includes("--verbose") || args.includes("-v");
const prompt = args.filter((a) => !a.startsWith("-")).join(" ");

if (!prompt) {
  console.log('Usage: node scripts/ai-agent.mjs [--dry-run] [--yes] [--verbose] "your prompt"');
  process.exit(1);
}

if (!AI_BASE || !AI_KEY) {
  console.error("❌ AI_BASE_URL or AI_API_KEY not set in .env");
  process.exit(1);
}

function getProjectStructure(dir = ".", depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return "";
  const skip = ["node_modules", ".astro", "dist", ".git", ".vscode"];
  let output = "";
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (skip.includes(entry.name) || entry.name.startsWith(".")) continue;
      const indent = "  ".repeat(depth);
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        output += `${indent}${entry.name}/\n`;
        output += getProjectStructure(fullPath, depth + 1, maxDepth);
      } else {
        output += `${indent}${entry.name}\n`;
      }
    }
  } catch (e) {}
  return output;
}

function readKeyFiles() {
  const files = ["package.json", "src/layouts/BaseLayout.astro", "src/lib/database.js", "src/lib/schemas.js"];
  const ctx = {};
  for (const f of files) {
    if (fs.existsSync(f)) {
      const c = fs.readFileSync(f, "utf-8");
      ctx[f] = c.length > 6000 ? c.substring(0, 6000) + "\n...[truncated]" : c;
    }
  }
  return ctx;
}

function readPageExamples() {
  const pages = ["src/pages/index.astro", "src/pages/list-your-business.astro", "src/pages/[state]/index.astro"];
  const ctx = {};
  for (const f of pages) {
    if (fs.existsSync(f)) {
      const c = fs.readFileSync(f, "utf-8");
      ctx[f] = c.length > 5000 ? c.substring(0, 5000) + "\n...[truncated]" : c;
    }
  }
  return ctx;
}

async function callGroq(system, user) {
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.3,
      max_tokens: 8000,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API ${res.status}: ${err.substring(0, 300)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

function parseAIResponse(text) {
  text = text.replace(/^```[a-z]*\s*\n?/gi, "").replace(/\n?```\s*$/gi, "");
  const ops = [];
  let m;
  const fileRe = /<file\s+path="([^"]+)"\s*>([\s\S]*?)<\/file>/gi;
  while ((m = fileRe.exec(text)) !== null) {
    ops.push({ type: "write", path: m[1].trim(), content: m[2].trim() + "\n" });
  }
  const delRe = /<delete\s+path="([^"]+)"\s*\/?>/gi;
  while ((m = delRe.exec(text)) !== null) {
    ops.push({ type: "delete", path: m[1].trim() });
  }
  const cmdRe = /<command>([\s\S]*?)<\/command>/gi;
  while ((m = cmdRe.exec(text)) !== null) {
    ops.push({ type: "command", cmd: m[1].trim() });
  }
  const explanation = text
    .replace(/<file[\s\S]*?<\/file>/gi, "")
    .replace(/<delete[\s\S]*?\/?>/gi, "")
    .replace(/<command>[\s\S]*?<\/command>/gi, "")
    .trim();
  return { ops, explanation };
}

function applyOps(ops) {
  for (const op of ops) {
    console.log(`\n── ${op.type.toUpperCase()}: ${op.path || op.cmd}`);
    if (op.type === "write") {
      const exists = fs.existsSync(op.path);
      console.log(`   ${exists ? "UPDATING" : "CREATING"} (${op.content.length} chars)`);
      console.log(`   Preview: ${op.content.substring(0, 300).split("\n").join("\n   ")}`);
      if (DRY_RUN) {
        console.log("   [DRY RUN] Skipped");
        continue;
      }
      if (exists) {
        fs.copyFileSync(op.path, `${op.path}.bak`);
        console.log(`   Backup: ${op.path}.bak`);
      }
      fs.mkdirSync(path.dirname(op.path), { recursive: true });
      fs.writeFileSync(op.path, op.content);
      console.log(`   ✅ Written`);
    } else if (op.type === "delete") {
      if (!fs.existsSync(op.path)) {
        console.log(`   ⚠️  Not found`);
        continue;
      }
      if (DRY_RUN) {
        console.log("   [DRY RUN] Skipped");
        continue;
      }
      fs.copyFileSync(op.path, `${op.path}.bak`);
      fs.unlinkSync(op.path);
      console.log(`   ✅ Deleted`);
    } else if (op.type === "command") {
      console.log(`   Running: ${op.cmd}`);
      if (DRY_RUN) {
        console.log("   [DRY RUN] Skipped");
        continue;
      }
      try {
        const out = execSync(op.cmd, { encoding: "utf-8", stdio: "pipe" });
        console.log(`   ✅ ${out.split("\n").slice(0, 3).join("\n   ")}`);
      } catch (err) {
        console.log(`   ⚠️  Failed: ${err.message}`);
      }
    }
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  DogCareFinder AI Agent                  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\nPrompt: ${prompt}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  console.log("📂 Reading project...");
  const structure = getProjectStructure();
  const keyFiles = readKeyFiles();
  const examples = readPageExamples();

  let ctx = `# PROJECT STRUCTURE\n\`\`\`\n${structure}\n\`\`\`\n\n`;
  for (const [f, c] of Object.entries(keyFiles)) {
    ctx += `## ${f}\n\`\`\`\n${c}\n\`\`\`\n\n`;
  }
  ctx += `# DESIGN REFERENCES\n\n`;
  for (const [f, c] of Object.entries(examples)) {
    ctx += `## ${f}\n\`\`\`astro\n${c}\n\`\`\`\n\n`;
  }

  const system = `You are an expert Astro + Tailwind developer for DogCareFinder (US dog care directory).

Design system:
- Colors: navy-900 #002955, forest-600 #5E7741, cream-100 #F7F4EC, gold-400 #C9952A
- Fonts: Fraunces (serif) headings, Inter (sans) body
- Icons: Font Awesome 6
- Astro SSG + Tailwind CDN
- Database: src/lib/database.js (fetchAllRecords, fetchBlogPosts)
- Schemas: src/lib/schemas.js (webPageSchema, breadcrumbSchema, itemListSchema, faqSchema, articleSchema, localBusinessSchema, serviceSchema, buildGraph)

Output format — for every file you create or modify:

<file path="src/pages/example.astro">
[COMPLETE file content]
</file>

Rules:
1. Return COMPLETE files, not diffs
2. No placeholders like "// rest of code"
3. Match the existing design exactly
4. Include all imports
5. Brief explanation is fine before file blocks`;

  console.log("🤖 Asking Groq...");
  const t0 = Date.now();
  const response = await callGroq(system, `${ctx}\n\n# TASK\n${prompt}`);
  console.log(`✅ Got response in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  if (VERBOSE) {
    console.log("──── RAW RESPONSE ────");
    console.log(response);
    console.log("─────────────────────\n");
  }

  const { ops, explanation } = parseAIResponse(response);

  if (explanation) {
    console.log("═══ EXPLANATION ═══");
    console.log(explanation);
    console.log("");
  }

  if (ops.length === 0) {
    console.log("⚠️  No file operations detected.");
    console.log("\nFull response:");
    console.log(response);
    return;
  }

  console.log("═══ PLANNED OPERATIONS ═══");
  const writes = ops.filter((o) => o.type === "write");
  const deletes = ops.filter((o) => o.type === "delete");
  const cmds = ops.filter((o) => o.type === "command");

  if (writes.length) {
    console.log(`\n📝 Files to write (${writes.length}):`);
    writes.forEach((w) => console.log(`   ${w.path} (${w.content.length} chars)`));
  }
  if (deletes.length) {
    console.log(`\n🗑️  Files to delete (${deletes.length}):`);
    deletes.forEach((d) => console.log(`   ${d.path}`));
  }
  if (cmds.length) {
    console.log(`\n⚙️  Commands to run (${cmds.length}):`);
    cmds.forEach((c) => console.log(`   ${c.cmd}`));
  }

  if (!AUTO_YES && !DRY_RUN) {
    console.log("");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => rl.question("Apply? (yes/no): ", resolve));
    rl.close();
    if (!answer.toLowerCase().startsWith("y")) {
      console.log("❌ Cancelled.");
      return;
    }
  }

  console.log("\n═══ APPLYING ═══");
  applyOps(ops);
  console.log("\n✅ Done.");
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
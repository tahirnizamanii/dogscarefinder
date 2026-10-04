// scripts/ai-agent.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import readline from "readline";

const AI_BASE = process.env.AI_BASE_URL;
const AI_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "llama-3.1-8b-instant";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run") || args.includes("-d");
const AUTO_YES = args.includes("--yes") || args.includes("-y");
const VERBOSE = args.includes("--verbose") || args.includes("-v");
const prompt = args.filter((a) => !a.startsWith("-")).join(" ");

if (!prompt) {
  console.log('Usage: node scripts/ai-agent.mjs [--dry-run] [--yes] [--verbose] "prompt"');
  process.exit(1);
}

if (!AI_BASE || !AI_KEY) {
  console.error("❌ AI_BASE_URL or AI_API_KEY not set in .env");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// AI CALL — OpenAI-compatible endpoint (Groq, Cerebras, etc.)
// ═══════════════════════════════════════════════════════════════

async function callAI(system, user) {
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API ${res.status}: ${err.substring(0, 400)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Empty response: ${JSON.stringify(data).substring(0, 300)}`);
  }
  return content;
}

// ═══════════════════════════════════════════════════════════════
// PARSE AI RESPONSE
// ═══════════════════════════════════════════════════════════════

function parseAIResponse(text) {
  text = text.replace(/^```[a-z]*\s*\n?/gi, "").replace(/\n?```\s*$/gi, "");
  const ops = [];
  let m;

  // <file path="...">content</file>
  const fileRe = /<file\s+path="([^"]+)"\s*>([\s\S]*?)<\/file>/gi;
  while ((m = fileRe.exec(text)) !== null) {
    ops.push({ type: "write", path: m[1].trim(), content: m[2].trim() + "\n" });
  }

  // <delete path="..."/>
  const delRe = /<delete\s+path="([^"]+)"\s*\/?>/gi;
  while ((m = delRe.exec(text)) !== null) {
    ops.push({ type: "delete", path: m[1].trim() });
  }

  // <command>...</command>
  const cmdRe = /<command>([\s\S]*?)<\/command>/gi;
  while ((m = cmdRe.exec(text)) !== null) {
    ops.push({ type: "command", cmd: m[1].trim() });
  }

  // Explanation = everything outside the tags
  const explanation = text
    .replace(/<file[\s\S]*?<\/file>/gi, "")
    .replace(/<delete[\s\S]*?\/?>/gi, "")
    .replace(/<command>[\s\S]*?<\/command>/gi, "")
    .trim();

  return { ops, explanation };
}

// ═══════════════════════════════════════════════════════════════
// APPLY OPERATIONS
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  DogCareFinder AI Agent                  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\nPrompt: ${prompt}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Model: ${AI_MODEL}\n`);

  // ═══ MINIMAL CONTEXT — only file paths, no contents ═══
  console.log("📂 Reading file list...");
  const fileList = [];
  try {
    const walk = (dir, depth = 0) => {
      if (depth > 3) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (["node_modules", ".astro", "dist", ".git", "public"].includes(e.name)) continue;
          if (e.name.startsWith(".")) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else if (e.name.endsWith(".astro") || e.name.endsWith(".js")) {
            fileList.push(full.replace(/\\/g, "/"));
          }
        }
      } catch {}
    };
    walk("src");
  } catch {}

  const ctx = `EXISTING FILES:\n${fileList.slice(0, 30).join("\n")}`;
  console.log(`   Files: ${fileList.length}, Context: ${ctx.length} chars\n`);

  // ═══ SUPER SHORT SYSTEM PROMPT — saves tokens ═══
  const system = `Astro+Tailwind developer for DogCareFinder (US dog care directory).

Design: navy-900 #002955, forest-600 #5E7741, cream-100 #F7F4EC, gold-400 #C9952A.
Fonts: Fraunces headings, Inter body. Icons: Font Awesome 6.

For every file, output EXACTLY:

<file path="src/pages/name.astro">
---
import BaseLayout from "../layouts/BaseLayout.astro";
import { webPageSchema, breadcrumbSchema } from "../lib/schemas.js";

const title = "Page | DogCareFinder";
const description = "Meta description";
const canonical = "https://dogcarefinder.com/page/";
const schemas = [
  webPageSchema(title, description, canonical),
  breadcrumbSchema([
    { name: "Home", url: "https://dogcarefinder.com/" },
    { name: "Page", url: canonical },
  ]),
];
---

<BaseLayout title={title} description={description} canonical={canonical} schemas={schemas}>
  <section>...content...</section>
</BaseLayout>
</file>

Rules:
- Complete files only, no placeholders
- No <html>/<head>/<body> tags
- Match the design system
- Include schemas array in every page
- Brief explanation BEFORE the <file> tags is fine`;

  console.log("🤖 Asking AI...");
  const t0 = Date.now();
  const response = await callAI(system, `${ctx}\n\nTASK: ${prompt}`);
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
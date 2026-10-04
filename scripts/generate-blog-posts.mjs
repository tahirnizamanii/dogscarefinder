// scripts/generate-blog-posts.mjs
import { getPool } from "./db.js";
import { pickImage } from "./lib/images.js";
import fs from "fs";

const AI_BASE = process.env.AI_BASE_URL;
const AI_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "llama-3.1-8b-instant";

const args = process.argv.slice(2);
const DEBUG = args.includes("--debug");
const LIMIT = parseInt((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 999;
const DELAY_MS = parseInt((args.find((a) => a.startsWith("--delay=")) || "").split("=")[1]) || 8000;

if (!AI_BASE || !AI_KEY) {
  console.error("AI_BASE_URL or AI_API_KEY missing");
  process.exit(1);
}

if (!fs.existsSync("topics.json")) {
  console.error("topics.json not found. Run: node scripts/generate-topics.mjs");
  process.exit(1);
}

const ALL_TOPICS = JSON.parse(fs.readFileSync("topics.json", "utf-8"));
console.log("Loaded " + ALL_TOPICS.length + " topics");

function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 200);
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildMeta(title, content) {
  const text = stripTags(content);
  const first = text.split(/[.!?]/)[0] || text;
  const base = (title + " - " + first + ".").trim();
  return base.length > 158 ? base.substring(0, 155) + "..." : base;
}

function buildExcerpt(content) {
  const text = stripTags(content);
  const sentences = text.match(/[^.!?]+[.!?]/g) || [text];
  const ex = sentences.slice(0, 2).join(" ").trim();
  return ex.length > 250 ? ex.substring(0, 250) + "..." : ex;
}

async function callAI(prompt, attempt) {
  attempt = attempt || 1;
  const maxAttempts = 3;
  const wait = Math.min(30, 5 * attempt);

  try {
    const res = await fetch(AI_BASE + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + AI_KEY,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 3500,
      }),
    });

    const raw = await res.text();
    if (DEBUG) console.log("      [DEBUG] " + res.status + " | " + raw.length + " chars");

    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        console.log("      Retry " + attempt + " (HTTP " + res.status + ") - wait " + wait + "s");
        await new Promise(function(r) { setTimeout(r, wait * 1000); });
        return callAI(prompt, attempt + 1);
      }
      throw new Error("HTTP " + res.status + ": " + raw.substring(0, 150));
    }

    const data = JSON.parse(raw);
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

    if (!content || content.trim().length < 200) {
      if (attempt < maxAttempts) {
        console.log("      Retry " + attempt + " (short) - wait " + wait + "s");
        await new Promise(function(r) { setTimeout(r, wait * 1000); });
        return callAI(prompt, attempt + 1);
      }
      throw new Error("Short content (" + (content ? content.length : 0) + " chars)");
    }
    return content;
  } catch (err) {
    if (attempt < maxAttempts && /ECONNRESET|fetch failed|socket/i.test(err.message)) {
      console.log("      Retry " + attempt + " (network) - wait " + wait + "s");
      await new Promise(function(r) { setTimeout(r, wait * 1000); });
      return callAI(prompt, attempt + 1);
    }
    throw err;
  }
}

function cleanHTML(raw) {
  let h = (raw || "").trim();
  h = h.replace(/^```(?:html|markdown|md)?\s*\n?/i, "");
  h = h.replace(/\n?```\s*$/i, "");
  h = h.replace(/<\/?(?:html|head|body|article|section|div)[^>]*>/gi, "");
  h = h.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "");
  h = h.replace(/\n{3,}/g, "\n\n").trim();
  return h;
}

function injectImages(html, category) {
  const sections = html.split(/(<\/h2>)/);
  let h2Count = 0;
  let imgIdx = 0;
  let result = "";
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section === "</h2>") {
      h2Count++;
      result += section;
      if (h2Count === 1 || h2Count === 3) {
        const img = pickImage(category, imgIdx++);
        result += "\n<figure class=\"article-image\">\n<img src=\"" + img.url + "\" alt=\"" + img.alt + "\" loading=\"lazy\" width=\"1200\" height=\"800\" />\n<figcaption>" + img.alt + "</figcaption>\n</figure>\n";
      }
      continue;
    }
    result += section;
  }
  return result;
}

async function generatePost(topic) {
  const prompt = "Write a comprehensive 1000-word blog post about: \"" + topic.title + "\"\n\nCategory: " + topic.category + "\n\nREQUIREMENTS:\n- Start with an intro <p> paragraph (no heading above)\n- Use 4 sections, each starting with <h2>\n- Write 2-3 <p> paragraphs under each <h2>\n- Include at least one <ul> list with <li> bullets\n- End with a conclusion <p> (no heading)\n- ONLY use: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>\n- NO <h1>, <html>, <body>, <article>, <div>, or markdown\n- Start directly with <p>\n- Write 900-1100 words\n\nBe specific and actionable.";

  const raw = await callAI(prompt);
  let content = cleanHTML(raw);

  if (content.length < 1500) throw new Error("Too short (" + content.length + " chars)");
  if (!/<(p|h2|ul|li)[\s>]/i.test(content)) throw new Error("No HTML tags");

  content = injectImages(content, topic.category);

  return {
    title: topic.title,
    slug: slugify(topic.title),
    meta: buildMeta(topic.title, content),
    excerpt: buildExcerpt(content),
    content: content,
    category: topic.category,
  };
}

async function main() {
  const pool = getPool();
  console.log("\nBatch generation");
  console.log("   Model: " + AI_MODEL);
  console.log("   Limit: " + LIMIT);
  console.log("   Delay: " + DELAY_MS + "ms\n");

  const [existing] = await pool.query("SELECT slug FROM blog_posts");
  const existingSlugs = new Set(existing.map(function(r) { return r.slug; }));
  console.log("   Already in DB: " + existingSlugs.size);

  const pending = ALL_TOPICS.filter(function(t) { return !existingSlugs.has(slugify(t.title)); });
  console.log("   Pending: " + pending.length + "\n");

  const batch = pending.slice(0, LIMIT);
  const total = batch.length;

  if (total === 0) {
    console.log("Nothing to do - all topics already published!");
    await pool.end();
    return;
  }

  console.log("   Will generate: " + total + " posts\n");

  let created = 0;
  let failed = 0;
  const failedTopics = [];

  for (let i = 0; i < batch.length; i++) {
    const topic = batch[i];
    try {
      console.log("   [" + (i + 1) + "/" + total + "] " + topic.title.substring(0, 65));
      const t0 = Date.now();
      const post = await generatePost(topic);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      const wordCount = stripTags(post.content).split(/\s+/).filter(Boolean).length;
      const readTime = Math.max(3, Math.min(15, Math.ceil(wordCount / 200)));
      const featuredImg = pickImage(topic.category, 0);

      await pool.query(
        "INSERT INTO blog_posts (title, slug, excerpt, content, meta_description, category, author, read_time, featured_image, publish_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
        [post.title, post.slug, post.excerpt, post.content, post.meta, post.category, "DogCareFinder Team", readTime, featuredImg.url]
      );

      console.log("   OK " + post.content.length + " chars, " + wordCount + "w, " + readTime + "min (" + elapsed + "s)");
      created++;

      if (i < batch.length - 1) {
        await new Promise(function(r) { setTimeout(r, DELAY_MS); });
      }
    } catch (err) {
      console.error("   FAIL " + err.message);
      failed++;
      failedTopics.push(topic);
      await new Promise(function(r) { setTimeout(r, 15000); });
    }

    if ((i + 1) % 10 === 0) {
      console.log("\n   PROGRESS: " + created + " created, " + failed + " failed\n");
    }
  }

  if (failedTopics.length > 0) {
    fs.writeFileSync("failed-topics.json", JSON.stringify(failedTopics, null, 2));
    console.log("\n   " + failedTopics.length + " failures saved to failed-topics.json");
  }

  console.log("\nDone. Created: " + created + ", Failed: " + failed);
  await pool.end();
}

main().catch(function(err) {
  console.error("Fatal:", err);
  process.exit(1);
});

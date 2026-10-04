// scripts/generate-provider-descriptions.mjs
import "dotenv/config";
import { getPool } from "./db.js";

const AI_BASE = process.env.AI_BASE_URL;
const AI_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "openai/gpt-oss-20b";

const args = process.argv.slice(2);
const LIMIT = parseInt((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 20;

if (!AI_BASE || !AI_KEY) {
  console.error("AI_BASE_URL or AI_API_KEY missing");
  process.exit(1);
}

async function generateDescription(listing) {
  const prompt = `Write a 150-200 word description for a dog care business directory listing.

Business: ${listing.business_name}
Category: ${listing.category}
Location: ${listing.city}, ${listing.state}
${listing.phone ? "Phone: " + listing.phone : ""}
${listing.website ? "Website: " + listing.website : ""}

Requirements:
- 2 short paragraphs
- Mention the category and location naturally
- Warm, professional tone
- Focus on services, trustworthiness, and local relevance
- Use <p> tags around each paragraph
- No <h1>, <h2>, <html>, or markdown
- Start directly with <p>

Return ONLY the HTML paragraphs.`;

  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).substring(0, 200)}`);
  const data = await res.json();
  let text = data.choices[0].message.content.trim();
  text = text.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  return text;
}

async function main() {
  const pool = getPool();
  const [listings] = await pool.query(
    "SELECT id, business_name, category, city, state, phone, website FROM listings WHERE description IS NULL OR description = '' ORDER BY id LIMIT ?",
    [LIMIT]
  );

  console.log(`Found ${listings.length} listings without descriptions\n`);
  let created = 0;
  let failed = 0;

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    try {
      console.log(`[${i + 1}/${listings.length}] ${l.business_name}`);
      const desc = await generateDescription(l);
      await pool.query("UPDATE listings SET description = ? WHERE id = ?", [desc, l.id]);
      console.log(`   OK ${desc.length} chars`);
      created++;
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`   FAIL ${err.message}`);
      failed++;
      await new Promise((r) => setTimeout(r, 8000));
    }
  }

  console.log(`\nDone. Created: ${created}, Failed: ${failed}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
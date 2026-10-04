// scripts/show-response.mjs
import "dotenv/config";

const AI_BASE = process.env.AI_BASE_URL;
const AI_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "qwen3.8-27b";

const res = await fetch(`${AI_BASE}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${AI_KEY}`,
  },
  body: JSON.stringify({
    model: AI_MODEL,
    messages: [
      { role: "user", content: 'Write one paragraph about dog grooming. Format: "META: x\nEXCERPT: y\nCONTENT:\n<p>text</p>"' },
    ],
    temperature: 0.7,
    max_tokens: 3000,
  }),
});

const raw = await res.text();
console.log("HTTP Status:", res.status);
console.log("Body length:", raw.length);
console.log("\n═══════════ FULL RAW BODY ═══════════");
console.log(raw);
console.log("═══════════ END ═══════════\n");
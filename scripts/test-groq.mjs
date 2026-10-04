// scripts/test-groq.mjs
import "dotenv/config";

const AI_BASE = process.env.AI_BASE_URL;
const AI_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL;

console.log("Testing Groq API...");
console.log("Base URL:", AI_BASE);
console.log("Model:", AI_MODEL);
console.log("Key prefix:", AI_KEY?.substring(0, 12) + "...");
console.log("");

const res = await fetch(`${AI_BASE}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${AI_KEY}`,
  },
  body: JSON.stringify({
    model: AI_MODEL,
    messages: [
      {
        role: "user",
        content: "Say 'Groq connection working' followed by the current date.",
      },
    ],
    max_tokens: 50,
  }),
});

console.log("HTTP Status:", res.status, res.statusText);
console.log("");

const raw = await res.text();
console.log("═══════════ RESPONSE ═══════════");
console.log(raw);
console.log("════════════════════════════════");
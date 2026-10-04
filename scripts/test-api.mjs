// scripts/test-api.mjs — Diagnostic test
import "dotenv/config";

const AI_BASE = process.env.AI_BASE_URL;
const AI_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "qwen3.8-27b";

console.log("Testing AI API...");
console.log("Base URL:", AI_BASE);
console.log("Model:", AI_MODEL);
console.log("Key prefix:", AI_KEY?.substring(0, 10) + "...");
console.log("");

const res = await fetch(`${AI_BASE}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${AI_KEY}`,
  },
  body: JSON.stringify({
    model: AI_MODEL,
    messages: [
      { role: "user", content: "Write a 200-word article about dog grooming. Return only HTML with <h2> and <p> tags, no markdown." }
    ],
    temperature: 0.7,
    max_tokens: 1000,
  }),
});

console.log("HTTP Status:", res.status, res.statusText);
console.log("");

const raw = await res.text();
console.log("=== RAW HTTP RESPONSE (first 3000 chars) ===");
console.log(raw.substring(0, 3000));
console.log("=== END RAW RESPONSE ===");
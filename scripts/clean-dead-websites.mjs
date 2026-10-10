// scripts/clean-dead-websites.mjs
// Checks the website URL of every listing in MySQL and clears the ones that
// are dead (DNS failure, timeout, 4xx/5xx). Run monthly via automation, or
// manually any time.
//
// Usage:
//   node scripts/clean-dead-websites.mjs --limit=500
//   node scripts/clean-dead-websites.mjs --dry-run --limit=10
import "dotenv/config";
import mysql from "mysql2/promise";

const LIMIT =
  parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) ||
  500;
const DRY_RUN = process.argv.includes("--dry-run");
const TIMEOUT_MS = 8000;
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// HEAD first (cheap); fall back to GET when a server refuses HEAD (403/405).
async function isWebsiteLive(url) {
  if (!url || !url.startsWith("http")) return false;
  const tryFetch = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "DogCareFinder/1.0 (+https://dogcarefinder.com)" },
      });
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const headStatus = await tryFetch("HEAD");
    if (headStatus >= 200 && headStatus < 400) return true;
    if (headStatus === 403 || headStatus === 405) {
      const getStatus = await tryFetch("GET");
      return getStatus >= 200 && getStatus < 400;
    }
    return false;
  } catch {
    return false;
  }
}

async function main() {
  console.log(
    `🧹 Checking website URLs (limit ${LIMIT})${DRY_RUN ? " — DRY RUN" : ""}\n`
  );

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:
      process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const [rows] = await conn.query(
    `SELECT id, business_name, website FROM listings
     WHERE website IS NOT NULL AND website != ''
     ORDER BY id ASC LIMIT ?`,
    [LIMIT]
  );
  console.log(`   Found ${rows.length} listings with websites\n`);

  let alive = 0;
  let dead = 0;

  for (const row of rows) {
    const live = await isWebsiteLive(row.website);
    if (live) {
      alive++;
    } else {
      dead++;
      console.log(`   ❌ dead: ${row.business_name} — ${row.website}`);
      if (!DRY_RUN) {
        await conn.query(`UPDATE listings SET website = '' WHERE id = ?`, [
          row.id,
        ]);
      }
    }
    if ((alive + dead) % 25 === 0) {
      console.log(`   … ${alive + dead}/${rows.length} checked`);
    }
    await sleep(DELAY_MS);
  }

  console.log(
    `\n🎉 Done. ${alive} alive, ${dead} dead${DRY_RUN ? " (no changes made)" : " (cleared)"}.`
  );
  await conn.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

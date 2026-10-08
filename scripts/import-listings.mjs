// scripts/import-listings.mjs
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 25;

async function main() {
  console.log(`🚀 Importing up to ${LIMIT} listings...\n`);

  // Load listings pool
  const poolPath = path.resolve("data/listings-pool.json");
  if (!fs.existsSync(poolPath)) {
    console.error("❌ data/listings-pool.json not found");
    process.exit(1);
  }

  const poolData = JSON.parse(fs.readFileSync(poolPath, "utf-8").replace(/^\uFEFF/, ""));
  console.log(`   Pool has ${poolData.length} listings`);

  // Connect to MySQL
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  // Get existing listings to avoid duplicates
  const [existing] = await conn.query("SELECT business_name, city, state FROM listings");
  const existingKeys = new Set(existing.map((r) => `${r.business_name}|${r.city}|${r.state}`));
  console.log(`   Already in DB: ${existingKeys.size}`);

  // Filter out ones we already have
  const pending = poolData.filter(
    (l) => !existingKeys.has(`${l.business_name}|${l.city}|${l.state}`)
  );
  console.log(`   Pending import: ${pending.length}\n`);

  const batch = pending.slice(0, LIMIT);
  if (batch.length === 0) {
    console.log("✅ All listings from pool are already imported!");
    await conn.end();
    return;
  }

  let inserted = 0;
  let failed = 0;

  for (const l of batch) {
    try {
      await conn.query(
        `INSERT INTO listings 
          (business_name, category, state, city, street_address, zip_code, phone, website, 
           rating, review_count, google_place_id, last_fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.business_name,
          l.category,
          l.state,
          l.city,
          l.street_address || "",
          l.zip_code || "",
          l.phone || "",
          l.website || "",
          l.rating ?? null,
          l.review_count ?? 0,
          l.google_place_id || null,
          l.last_fetched_at || Date.now(),
        ]
      );
      console.log(`   ✅ ${l.business_name} — ${l.city}, ${l.state}`);
      inserted++;
    } catch (err) {
      console.error(`   ❌ ${l.business_name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🎉 Done. Inserted ${inserted} new listings.`);
  if (failed > 0) console.log(`   ⚠️  ${failed} failed`);
  await conn.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
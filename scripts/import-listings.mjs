// scripts/import-listings.mjs
// Imports data/listings-pool.json into the MySQL `listings` table.
//  - New businesses → INSERT (up to --limit)
//  - Already-listed businesses with FRESHER pool data (last_fetched_at newer
//    than the DB row) → UPDATE rating, reviews, phone, website, address
//    (up to --update-limit). This is what keeps listings "live".
//
// Usage:
//   node scripts/import-listings.mjs --limit=50 --update-limit=500
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

const INSERT_LIMIT =
  parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 25;
const UPDATE_LIMIT =
  parseInt(
    process.argv.find((a) => a.startsWith("--update-limit="))?.split("=")[1]
  ) || 500;

async function main() {
  console.log(
    `🚀 Importing up to ${INSERT_LIMIT} new + ${UPDATE_LIMIT} refreshed listings...\n`
  );

  // Load listings pool
  const poolPath = path.resolve("data/listings-pool.json");
  if (!fs.existsSync(poolPath)) {
    console.error("❌ data/listings-pool.json not found");
    process.exit(1);
  }

  const poolData = JSON.parse(
    fs.readFileSync(poolPath, "utf-8").replace(/^\uFEFF/, "")
  );
  console.log(`   Pool has ${poolData.length} listings`);

  // Connect to MySQL
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:
      process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  // Index existing listings by google_place_id and by name|city|state
  const [existing] = await conn.query(
    `SELECT id, google_place_id, business_name, city, state, last_fetched_at
     FROM listings`
  );
  const byPlaceId = new Map();
  const byKey = new Map();
  for (const r of existing) {
    if (r.google_place_id) byPlaceId.set(r.google_place_id, r);
    byKey.set(`${r.business_name}|${r.city}|${r.state}`, r);
  }
  console.log(`   Already in DB: ${existing.length}`);

  const toInsert = [];
  const toUpdate = [];
  const seenNew = new Set(); // avoid double-inserting dupes within one run

  for (const l of poolData) {
    const match =
      (l.google_place_id && byPlaceId.get(l.google_place_id)) ||
      byKey.get(`${l.business_name}|${l.city}|${l.state}`);

    if (!match) {
      const key = `${l.business_name}|${l.city}|${l.state}`;
      if (!seenNew.has(key) && toInsert.length < INSERT_LIMIT) {
        seenNew.add(key);
        toInsert.push(l);
      }
      continue;
    }

    // Refresh only when the pool data is actually newer than the DB row.
    // (Pool entries without last_fetched_at — e.g. old OSM imports — are skipped.)
    const poolTs = Number(l.last_fetched_at) || 0;
    const dbTs = Number(match.last_fetched_at) || 0;
    if (poolTs > dbTs && toUpdate.length < UPDATE_LIMIT) {
      toUpdate.push({ l, id: match.id });
    }
  }

  console.log(`   New to insert: ${toInsert.length}`);
  console.log(`   Existing to refresh: ${toUpdate.length}\n`);

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const l of toInsert) {
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

  for (const { l, id } of toUpdate) {
    try {
      await conn.query(
        `UPDATE listings SET
           phone = ?, website = ?, street_address = ?, zip_code = ?,
           rating = ?, review_count = ?, last_fetched_at = ?
         WHERE id = ?`,
        [
          l.phone || "",
          l.website || "",
          l.street_address || "",
          l.zip_code || "",
          l.rating ?? null,
          l.review_count ?? 0,
          l.last_fetched_at,
          id,
        ]
      );
      console.log(`   🔄 ${l.business_name} — ${l.city}, ${l.state} (refreshed)`);
      updated++;
    } catch (err) {
      console.error(`   ❌ refresh ${l.business_name}: ${err.message}`);
      failed++;
    }
  }

  console.log(
    `\n🎉 Done. Inserted ${inserted}, refreshed ${updated}.`
  );
  if (failed > 0) console.log(`   ⚠️  ${failed} failed`);
  await conn.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

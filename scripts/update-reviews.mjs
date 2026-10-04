// scripts/update-reviews.mjs
import "dotenv/config";
import mysql from "mysql2/promise";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error("❌ GOOGLE_PLACES_API_KEY not set");
  process.exit(1);
}

const DELAY_MS = 250;

async function main() {
  console.log("🔄 Starting Google Reviews refresh...");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const [listings] = await conn.query(
    `SELECT id, google_place_id, business_name FROM listings 
     WHERE google_place_id IS NOT NULL AND google_place_id != ''`
  );

  console.log(`   Found ${listings.length} listings with Place IDs`);

  if (listings.length === 0) {
    console.log("⚠️  No listings have google_place_id set.");
    console.log("   Populate google_place_id first via the Google Places scraper.");
    await conn.end();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];

    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${l.google_place_id}`, {
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "rating,userRatingCount,reviews",
        },
      });

      if (!res.ok) {
        failed++;
        if (res.status === 404) {
          await conn.query("UPDATE listings SET google_place_id = NULL WHERE id = ?", [l.id]);
          console.log(`   ⚠️  ${l.business_name} — Place not found, cleared`);
        } else {
          console.error(`   ❌ ${l.business_name}: ${res.status}`);
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }

      const data = await res.json();

      await conn.query(
        `UPDATE listings 
         SET rating = ?, review_count = ?, reviews_json = ?, last_review_update = ?
         WHERE id = ?`,
        [
          data.rating ?? null,
          data.userRatingCount ?? 0,
          JSON.stringify(data.reviews || []),
          Date.now(),
          l.id,
        ]
      );

      updated++;
      if (updated % 50 === 0) console.log(`   ✅ ${updated} updated · ${failed} failed`);
    } catch (err) {
      failed++;
      console.error(`   ❌ ${l.business_name}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n🎉 Done. ${updated} updated · ${failed} failed`);
  await conn.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
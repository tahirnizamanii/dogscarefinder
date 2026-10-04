// scripts/import-listings.mjs
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

const LIMIT = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1]) || 10;

async function main() {
  console.log("Importing up to " + LIMIT + " listings...");

  const poolPath = path.resolve("data/listings-pool.json");
  if (!fs.existsSync(poolPath)) {
    console.error("data/listings-pool.json not found");
    process.exit(1);
  }

  const poolData = JSON.parse(fs.readFileSync(poolPath, "utf-8"));
  console.log("   Pool has " + poolData.length + " listings");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const [existing] = await conn.query("SELECT business_name, city, state FROM listings");
  const existingKeys = new Set(existing.map(r => r.business_name + "|" + r.city + "|" + r.state));
  console.log("   Already in DB: " + existingKeys.size);

  const pending = poolData.filter(l => !existingKeys.has(l.business_name + "|" + l.city + "|" + l.state));
  console.log("   Pending import: " + pending.length);

  const batch = pending.slice(0, LIMIT);
  if (batch.length === 0) {
    console.log("All listings from pool are already imported!");
    await conn.end();
    return;
  }

  let inserted = 0;
  for (const l of batch) {
    try {
      await conn.query(
        "INSERT INTO listings (business_name, category, state, city, street_address, zip_code, phone, website, rating, review_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          l.business_name, l.category, l.state, l.city,
          l.street_address || "", l.zip_code || "", l.phone || "", l.website || "",
          l.rating !== undefined ? l.rating : null,
          l.review_count !== undefined ? l.review_count : 0,
        ]
      );
      console.log("   OK " + l.business_name + " - " + l.city + ", " + l.state);
      inserted++;
    } catch (err) {
      console.error("   FAIL " + l.business_name + ": " + err.message);
    }
  }

  console.log("\nDone. Inserted " + inserted + " new listings.");
  await conn.end();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

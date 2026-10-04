// scripts/import-listings.mjs
import { getPool } from "./db.js";
import fs from "fs";
import path from "path";

const CSV_FILE = process.argv[2] || "./listings.csv";

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        values.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = (values[i] || "").replace(/^"|"$/g, "")));
    return row;
  });
}

async function main() {
  const filePath = path.resolve(CSV_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ CSV file not found: ${filePath}`);
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(filePath, "utf-8"));
  console.log(`📊 Parsed ${rows.length} rows from ${CSV_FILE}`);

  const pool = getPool();
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const businessName = row["Business Name"] || row.business_name || row.name;
    const category = row["Category"] || row.category;
    const state = (row["State"] || row.state || "").toUpperCase();
    const city = row["City"] || row.city;

    if (!businessName || !category || !state || !city) {
      console.log(`   ⏭ Skipping incomplete: ${businessName}`);
      skipped++;
      continue;
    }

    try {
      const [existing] = await pool.query(
        "SELECT id FROM listings WHERE business_name = ? AND city = ? AND state = ? LIMIT 1",
        [businessName, city, state]
      );
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await pool.query(
        `INSERT INTO listings 
          (business_name, category, state, city, street_address, zip_code, phone, website, rating, review_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessName,
          category,
          state,
          city,
          row["Street Address"] || row.street_address || "",
          row["Zip Code"] || row.zip_code || "",
          row["Phone"] || row.phone || "",
          row["Website"] || row.website || "",
          row["Rating"] ? parseFloat(row["Rating"]) : null,
          row["Review Count"] ? parseInt(row["Review Count"]) : 0,
        ]
      );
      inserted++;
      if (inserted % 50 === 0) console.log(`   ✅ Inserted ${inserted}...`);
    } catch (err) {
      console.error(`   ❌ Error on ${businessName}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Done. Inserted: ${inserted}, Skipped: ${skipped}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
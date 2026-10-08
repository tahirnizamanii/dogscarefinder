// .agents/skills/seo-doctor/fixers/prune-thin-pages.mjs
// Writes config/pruned-pages.json — pages with < MIN_LISTINGS that Astro should skip

import fs from "fs";
import path from "path";

const MIN_LISTINGS = 3;

export default async function pruneThinPages({ conn, dry, configDir }) {
  console.log("   Finding thin category pages (<" + MIN_LISTINGS + " listings)...");

  const [rows] = await conn.query(
    `SELECT state, city, category, COUNT(*) as count
     FROM listings
     WHERE state != '' AND city != '' AND category != ''
     GROUP BY state, city, category
     HAVING count < ?
     ORDER BY count ASC, state, city`,
    [MIN_LISTINGS]
  );

  console.log("   " + rows.length + " thin combinations found");

  const pruned = [];
  for (const r of rows) {
    const [cityTotal] = await conn.query(
      "SELECT COUNT(*) as total FROM listings WHERE state = ? AND city = ?",
      [r.state, r.city]
    );
    if (cityTotal[0].total >= MIN_LISTINGS) {
      pruned.push({
        state: r.state.toLowerCase(),
        city: r.city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        category: r.category.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        count: r.count,
      });
    }
  }

  console.log("   " + pruned.length + " category pages will be pruned");

  const outPath = path.join(configDir, "pruned-pages.json");
  if (!dry) {
    fs.writeFileSync(outPath, JSON.stringify(pruned, null, 2));
    console.log("   Wrote " + outPath);
  }

  return {
    message: pruned.length + " pages pruned",
    fixed: pruned.length,
  };
}
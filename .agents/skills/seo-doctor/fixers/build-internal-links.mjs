// .agents/skills/seo-doctor/fixers/build-internal-links.mjs
// Writes config/related-providers.json — cross-links between providers in same city

import fs from "fs";
import path from "path";

export default async function buildInternalLinks({ conn, dry, configDir }) {
  console.log("   Building provider cross-link graph...");

  const [rows] = await conn.query(
    `SELECT id, business_name, category, city, state, rating
     FROM listings
     WHERE claimed_by IS NULL OR claimed_by = ''`
  );

  console.log("   " + rows.length + " providers to link");

  const byCity = new Map();
  for (const r of rows) {
    const key = r.state + "|" + r.city;
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(r);
  }

  const links = {};

  for (const [key, group] of byCity) {
    group.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    for (const p of group) {
      const sameCat = group
        .filter((x) => x.id !== p.id && x.category === p.category)
        .slice(0, 3);
      const otherCat = group
        .filter((x) => x.id !== p.id && x.category !== p.category)
        .slice(0, 3);

      links[p.id] = {
        sameCategory: sameCat.map((x) => ({ id: x.id, name: x.business_name })),
        otherCategories: otherCat.map((x) => ({ id: x.id, name: x.business_name })),
      };
    }
  }

  const totalLinks = Object.values(links).reduce(
    (sum, l) => sum + l.sameCategory.length + l.otherCategories.length,
    0
  );

  console.log("   " + totalLinks + " cross-links computed");

  const outPath = path.join(configDir, "related-providers.json");
  if (!dry) {
    fs.writeFileSync(outPath, JSON.stringify(links, null, 2));
    console.log("   Wrote " + outPath);
  }

  return {
    message: totalLinks + " links across " + Object.keys(links).length + " providers",
    fixed: totalLinks,
  };
}
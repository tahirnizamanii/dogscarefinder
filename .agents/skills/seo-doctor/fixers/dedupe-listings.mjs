// .agents/skills/seo-doctor/fixers/dedupe-listings.mjs
// Merges duplicate listings by (normalized_name + city + state)
// Keeps the most complete record (has website, phone, reviews)

export default async function dedupeListings({ conn, dry }) {
  function normalizeName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/\b(inc|llc|co|corp|the|and)\b/g, "");
  }

  console.log("   Loading all listings...");
  const [rows] = await conn.query(
    `SELECT id, business_name, city, state, website, phone, rating, review_count, 
            google_place_id, claimed_by
     FROM listings
     ORDER BY id ASC`
  );

  console.log("   " + rows.length + " rows to check");

  const groups = new Map();
  for (const r of rows) {
    const key = normalizeName(r.business_name) + "|" + r.city + "|" + r.state;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  console.log("   Found " + dupGroups.length + " duplicate groups");

  if (dupGroups.length === 0) {
    return { message: "No duplicates found", fixed: 0, removed: 0 };
  }

  let removed = 0;
  let merged = 0;

  for (const group of dupGroups) {
    const scored = group.map((r) => {
      let score = 0;
      if (r.website) score += 10;
      if (r.phone) score += 5;
      if (r.google_place_id) score += 20;
      if (r.review_count > 0) score += r.review_count / 10;
      if (r.claimed_by) score += 1000;
      return { ...r, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const keeper = scored[0];
    const toRemove = scored.slice(1);

    console.log("   > Keeping: \"" + keeper.business_name + "\" (id " + keeper.id + ", score " + keeper.score.toFixed(1) + ")");
    for (const r of toRemove) {
      console.log("     x Removing: \"" + r.business_name + "\" (id " + r.id + ", score " + r.score.toFixed(1) + ")");
    }

    if (!dry) {
      for (const r of toRemove) {
        const updates = [];
        const values = [];
        if (!keeper.website && r.website) { updates.push("website = ?"); values.push(r.website); }
        if (!keeper.phone && r.phone) { updates.push("phone = ?"); values.push(r.phone); }
        if (!keeper.google_place_id && r.google_place_id) { updates.push("google_place_id = ?"); values.push(r.google_place_id); }
        if (values.length > 0) {
          values.push(keeper.id);
          await conn.query("UPDATE listings SET " + updates.join(", ") + " WHERE id = ?", values);
        }
        await conn.query("DELETE FROM listings WHERE id = ?", [r.id]);
        removed++;
      }
      merged++;
    }
  }

  return {
    message: dupGroups.length + " groups - " + (dry ? "would remove" : "removed") + " " + (dry ? dupGroups.reduce((a, g) => a + g.length - 1, 0) : removed),
    fixed: dupGroups.length,
    removed,
  };
}
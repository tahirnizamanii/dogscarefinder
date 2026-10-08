// .agents/skills/seo-doctor/fixers/fill-missing-fields.mjs
// Fills missing state/city/zip from similar listings

export default async function fillMissingFields({ conn, dry }) {
  console.log("   Checking for incomplete listings...");

  const [rows] = await conn.query(
    `SELECT id, business_name, city, state, zip_code, street_address
     FROM listings
     WHERE (state = '' OR state IS NULL)
        OR (city = '' OR city IS NULL)
        OR (zip_code IS NULL OR zip_code = '')
        OR state NOT REGEXP '^[A-Z]{2}$'`
  );

  console.log("   Found " + rows.length + " incomplete listings");

  if (rows.length === 0) {
    return { message: "All listings complete", fixed: 0 };
  }

  let fixed = 0;

  for (const r of rows) {
    const updates = [];
    const values = [];

    if (r.state && !/^[A-Z]{2}$/.test(r.state)) {
      const cleaned = r.state.toUpperCase().trim().slice(0, 2);
      if (/^[A-Z]{2}$/.test(cleaned)) {
        updates.push("state = ?");
        values.push(cleaned);
      }
    }

    if (r.zip_code) {
      const match = String(r.zip_code).match(/\d{5}/);
      if (match && match[0] !== r.zip_code) {
        updates.push("zip_code = ?");
        values.push(match[0]);
      }
    }

    if (!r.state && r.street_address) {
      const [siblings] = await conn.query(
        `SELECT state FROM listings 
         WHERE street_address = ? AND state IS NOT NULL AND state != '' 
         LIMIT 1`,
        [r.street_address]
      );
      if (siblings.length > 0) {
        updates.push("state = ?");
        values.push(siblings[0].state);
      }
    }

    if (!r.city && r.zip_code) {
      const [siblings] = await conn.query(
        `SELECT city FROM listings 
         WHERE zip_code = ? AND city IS NOT NULL AND city != '' 
         LIMIT 1`,
        [r.zip_code]
      );
      if (siblings.length > 0) {
        updates.push("city = ?");
        values.push(siblings[0].city);
      }
    }

    if (updates.length > 0) {
      console.log("   > \"" + r.business_name + "\" (id " + r.id + "): " + updates.length + " fields");
      if (!dry) {
        values.push(r.id);
        await conn.query("UPDATE listings SET " + updates.join(", ") + " WHERE id = ?", values);
        fixed++;
      }
    }
  }

  return {
    message: fixed + " listings repaired",
    fixed,
  };
}
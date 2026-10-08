// .agents/skills/seo-doctor/fixers/sync-google-reviews.mjs
// Fetches reviews for listings with google_place_id
// Skips cleanly if API is not available

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const DELAY_MS = 250;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export default async function syncGoogleReviews({ conn, dry }) {
  if (!API_KEY) {
    console.log("   SKIPPED - GOOGLE_PLACES_API_KEY not set");
    return { message: "SKIPPED (no API key)", fixed: 0, skipped: true };
  }

  console.log("   Finding listings needing review sync...");

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const [rows] = await conn.query(
    `SELECT id, business_name, google_place_id, last_review_update
     FROM listings
     WHERE google_place_id IS NOT NULL
       AND google_place_id != ''
       AND (reviews_json IS NULL OR last_review_update IS NULL OR last_review_update < ?)
     LIMIT 50`,
    [thirtyDaysAgo]
  );

  console.log("   " + rows.length + " listings need review sync");

  if (rows.length === 0) {
    return { message: "All reviews fresh", fixed: 0 };
  }

  let synced = 0;
  let apiError = 0;

  for (const r of rows) {
    try {
      const res = await fetch(
        "https://places.googleapis.com/v1/places/" + r.google_place_id,
        {
          headers: {
            "X-Goog-Api-Key": API_KEY,
            "X-Goog-FieldMask": "rating,userRatingCount,reviews",
          },
        }
      );

      if (!res.ok) {
        apiError++;
        if (apiError === 1) {
          // First error — check the reason and skip the whole fixer if it's a 403
          const err = await res.json().catch(() => ({}));
          const msg = err?.error?.message || "";
          if (res.status === 403 || msg.includes("not enabled") || msg.includes("billing")) {
            console.log("   SKIPPED - API unavailable: " + msg.slice(0, 100));
            return { message: "SKIPPED (API unavailable)", fixed: 0, skipped: true };
          }
        }
        if (apiError >= 5) break;
        await sleep(DELAY_MS);
        continue;
      }

      const data = await res.json();

      if (!dry) {
        await conn.query(
          `UPDATE listings 
           SET rating = ?, review_count = ?, reviews_json = ?, last_review_update = ?
           WHERE id = ?`,
          [
            data.rating || null,
            data.userRatingCount || 0,
            JSON.stringify(data.reviews || []),
            Date.now(),
            r.id,
          ]
        );
        synced++;
      } else {
        synced++;
      }

      console.log("   OK \"" + r.business_name + "\" " + data.rating + " stars");
    } catch (err) {
      apiError++;
      if (apiError >= 5) break;
    }
    await sleep(DELAY_MS);
  }

  return {
    message: (dry ? "would sync " : "synced ") + synced,
    fixed: synced,
  };
}
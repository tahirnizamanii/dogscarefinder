// .agents/skills/seo-doctor/fixers/enrich-google-places.mjs
// Fetches missing phone/website/place_id via Google Places API
// Skips cleanly if API is not available (no key, no billing, 403, etc.)

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const DELAY_MS = 400;
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Test if the API is usable — returns { ok: true } or { ok: false, reason }
async function testApi() {
  if (!API_KEY) return { ok: false, reason: "GOOGLE_PLACES_API_KEY not set" };

  try {
    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.displayName",
      },
      body: JSON.stringify({ textQuery: "test", maxResultCount: 1 }),
    });

    if (res.ok) return { ok: true };

    if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || "";
      if (msg.includes("not enabled") || msg.includes("blocked")) {
        return { ok: false, reason: "Places API (New) not enabled — see cloud.google.com/apis/library/places.googleapis.com" };
      }
      if (msg.includes("billing")) {
        return { ok: false, reason: "Billing account required — add one at console.cloud.google.com/billing" };
      }
      if (msg.includes("restrict") || msg.includes("not authorized")) {
        return { ok: false, reason: "API key restrictions block Places API (New) — edit key at console.cloud.google.com/apis/credentials" };
      }
      return { ok: false, reason: "403 Forbidden — " + msg.slice(0, 100) };
    }

    if (res.status === 400) {
      return { ok: false, reason: "Invalid API key format" };
    }

    return { ok: false, reason: "HTTP " + res.status };
  } catch (err) {
    return { ok: false, reason: "Network error: " + err.message };
  }
}

export default async function enrichGooglePlaces({ conn, dry }) {
  // ── Pre-flight: is the API usable? ────────────────────────
  console.log("   Testing Google Places API...");
  const test = await testApi();

  if (!test.ok) {
    console.log("   SKIPPED - " + test.reason);
    console.log("   (Other fixers continue normally)");
    return {
      message: "SKIPPED (API unavailable)",
      fixed: 0,
      skipped: true,
      reason: test.reason,
    };
  }

  console.log("   API is working. Fetching listings missing Google data...");

  const [rows] = await conn.query(
    `SELECT id, business_name, city, state, phone, website, google_place_id
     FROM listings
     WHERE (phone = '' OR phone IS NULL)
        OR (website = '' OR website IS NULL)
        OR google_place_id IS NULL
     LIMIT 100`
  );

  console.log("   " + rows.length + " listings need enrichment");

  if (rows.length === 0) {
    return { message: "All listings complete", fixed: 0 };
  }

  let enriched = 0;
  let apiCalls = 0;
  let apiError = 0;

  for (const r of rows) {
    try {
      const textQuery = r.business_name + " in " + r.city + ", " + r.state;
      const res = await fetch(PLACES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress," +
            "places.websiteUri,places.internationalPhoneNumber," +
            "places.rating,places.userRatingCount",
        },
        body: JSON.stringify({ textQuery, maxResultCount: 1 }),
      });
      apiCalls++;

      if (!res.ok) {
        apiError++;
        // If we suddenly start failing mid-run, stop making more calls
        if (apiError >= 5) {
          console.log("   Too many errors - stopping enrichment");
          break;
        }
        await sleep(DELAY_MS);
        continue;
      }

      const data = await res.json();
      const place = data.places && data.places[0];
      if (!place) {
        await sleep(DELAY_MS);
        continue;
      }

      const updates = [];
      const values = [];

      if (!r.google_place_id && place.id) {
        updates.push("google_place_id = ?");
        values.push(place.id);
      }
      if (!r.phone && place.internationalPhoneNumber) {
        updates.push("phone = ?");
        values.push(place.internationalPhoneNumber);
      }
      if (!r.website && place.websiteUri) {
        updates.push("website = ?");
        values.push(place.websiteUri);
      }
      if (place.rating && typeof place.rating === "number") {
        updates.push("rating = ?");
        values.push(place.rating);
      }
      if (place.userRatingCount && typeof place.userRatingCount === "number") {
        updates.push("review_count = ?");
        values.push(place.userRatingCount);
      }

      if (updates.length > 0) {
        console.log("   OK \"" + r.business_name + "\" +" + updates.length);
        if (!dry) {
          values.push(r.id);
          await conn.query("UPDATE listings SET " + updates.join(", ") + " WHERE id = ?", values);
          enriched++;
        }
      }
    } catch (err) {
      apiError++;
    }

    await sleep(DELAY_MS);
  }

  return {
    message: (dry ? "would enrich " : "enriched ") + enriched + " · " + apiCalls + " calls",
    fixed: enriched,
    apiCalls,
  };
}
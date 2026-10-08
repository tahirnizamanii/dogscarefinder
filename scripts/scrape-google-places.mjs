// scripts/scrape-google-places.mjs
// Fetches dog care businesses from Google Places API with website validation
import "dotenv/config";
import fs from "fs";
import path from "path";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error("❌ GOOGLE_PLACES_API_KEY not set in .env");
  process.exit(1);
}

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";
const DELAY_MS = 400;
const MAX_RESULTS = 20;
const WEBSITE_TIMEOUT = 8000;

const CATEGORIES = [
  { query: "dog groomer", slug: "Groomers" },
  { query: "dog trainer", slug: "Trainers" },
  { query: "dog boarding kennel", slug: "Boarding" },
  { query: "veterinarian", slug: "Vets" },
  { query: "dog therapy animal", slug: "Therapy" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Verify a website URL is live ───────────────────────────────────
async function isWebsiteLive(url) {
  if (!url || !url.startsWith("http")) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBSITE_TIMEOUT);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "DogCareFinder/1.0" },
    });
    clearTimeout(timer);
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

// ── Search one query in one location ───────────────────────────────
async function searchPlaces(query, city, state) {
  const textQuery = `${query} in ${city}, ${state}`;

  const res = await fetch(PLACES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri," +
        "places.internationalPhoneNumber,places.rating,places.userRatingCount," +
        "places.addressComponents,places.regularOpeningHours,places.location",
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: MAX_RESULTS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`   ⚠️  ${res.status}: ${err.substring(0, 150)}`);
    return [];
  }

  const data = await res.json();
  return data.places || [];
}

// ── Extract city/state/zip from Google's address components ────────
function parseAddressComponents(components) {
  let city = "", state = "", zip = "";
  for (const c of components || []) {
    if (c.types.includes("locality")) city = c.longText;
    if (c.types.includes("administrative_area_level_1")) state = c.shortText;
    if (c.types.includes("postal_code")) zip = c.longText;
  }
  return { city, state, zip };
}

// ── Transform Google Place → our listing shape ─────────────────────
async function transformPlace(place, categorySlug, fallbackCity, fallbackState) {
  const addr = parseAddressComponents(place.addressComponents);
  const street = (place.formattedAddress || "").split(",")[0] || "";

  const website = place.websiteUri || "";

  // ── Live website check ────────────────────────────────────────────
  const websiteLive = website ? await isWebsiteLive(website) : false;

  return {
    business_name: place.displayName?.text || "Unknown",
    category: categorySlug,
    state: addr.state || fallbackState,
    city: addr.city || fallbackCity,
    street_address: street,
    zip_code: addr.zip || "",
    phone: place.internationalPhoneNumber || "",
    website: websiteLive ? website : "",
    rating: place.rating ?? null,
    review_count: place.userRatingCount ?? 0,
    google_place_id: place.id || null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    last_fetched_at: Date.now(),
  };
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const citiesPath = path.resolve("data/cities.json");
  const poolPath = path.resolve("data/listings-pool.json");
  const progressPath = path.resolve("data/gplaces-progress.json");

  if (!fs.existsSync(citiesPath)) {
    console.error("❌ data/cities.json not found");
    process.exit(1);
  }

  const allCities = JSON.parse(fs.readFileSync(citiesPath, "utf-8"));

  let existing = [];
  if (fs.existsSync(poolPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(poolPath, "utf-8"));
    } catch { existing = []; }
  }

  let progress = [];
  if (fs.existsSync(progressPath)) {
    try {
      progress = JSON.parse(fs.readFileSync(progressPath, "utf-8"));
    } catch { progress = []; }
  }

  const progressSet = new Set(progress.map((p) => `${p.city}|${p.state}|${p.category}`));

  console.log(`📊 Pool: ${existing.length} listings`);
  console.log(`📊 Progress: ${progress.length} city-category combos done`);
  console.log(`📊 Cities: ${allCities.length}\n`);

  const seenKeys = new Set(
    existing.map((l) => `${l.business_name}|${l.city}|${l.state}`)
  );

  const newListings = [];
  let done = 0;

  const MAX_RUNTIME_MS = 14 * 60 * 1000;
  const startTime = Date.now();

  outer:
  for (const { city, state } of allCities) {
    for (const cat of CATEGORIES) {
      const progressKey = `${city}|${state}|${cat.slug}`;
      if (progressSet.has(progressKey)) continue;

      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`\n⏰ Time limit reached. Progress saved.`);
        break outer;
      }

      done++;
      console.log(`[${done}] ${cat.query} in ${city}, ${state}`);

      try {
        const places = await searchPlaces(cat.query, city, state);
        console.log(`   → ${places.length} results`);

        let added = 0;
        for (const place of places) {
          const listing = await transformPlace(place, cat.slug, city, state);
          const key = `${listing.business_name}|${listing.city}|${listing.state}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          newListings.push(listing);
          added++;
        }
        console.log(`   ✅ ${added} new (${newListings.length} total)`);

        progress.push({ city, state, category: cat.slug });
        progressSet.add(progressKey);

        // Save progress after every search
        fs.writeFileSync(poolPath, JSON.stringify([...existing, ...newListings], null, 2));
        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      } catch (err) {
        console.error(`   ❌ ${err.message}`);
      }

      await sleep(DELAY_MS);
    }
  }

  console.log(`\n🎉 Done. Added ${newListings.length} new listings.`);
  console.log(`   Pool now: ${existing.length + newListings.length}`);
  console.log(`   Progress: ${progress.length} combos complete`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
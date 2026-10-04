// scripts/scrape-osm.mjs
// Fetches dog care businesses from OpenStreetMap (free, legal, no API key)
import fs from "fs";
import path from "path";

// Multiple Overpass mirrors for load distribution
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const userAgent = "DogCareFinder/1.0 (contact@dogcarefinder.com)";

// Config
const DELAY_BETWEEN_CITIES = 3000;   // 3 sec between cities
const MAX_RETRIES = 2;                // retry failed cities
const RETRY_DELAY = 8000;             // 8 sec between retries
const FETCH_TIMEOUT = 30000;          // 30 sec per request

// ─── Strip BOM helper ──────────────────────────────────────
function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

// ─── Sleep helper ──────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Fetch with timeout ────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ─── Get city bounding box from Nominatim ─────────────────
async function getCityBounds(city, state) {
  const query = `${city}, ${state}, USA`;
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;

  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": userAgent },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  if (data.length === 0) return null;

  const bb = data[0].boundingbox;
  return {
    minLat: parseFloat(bb[0]),
    maxLat: parseFloat(bb[1]),
    minLon: parseFloat(bb[2]),
    maxLon: parseFloat(bb[3]),
  };
}

// ─── Query Overpass with retry across mirrors ─────────────
async function queryOverpass(bounds, attempt = 1) {
  const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

  const query = `
[out:json][timeout:60];
(
  node["amenity"="veterinary"](${bbox});
  way["amenity"="veterinary"](${bbox});
  node["shop"="pet_grooming"](${bbox});
  way["shop"="pet_grooming"](${bbox});
  node["shop"="pet"](${bbox});
  way["shop"="pet"](${bbox});
  node["amenity"="animal_boarding"](${bbox});
  way["amenity"="animal_boarding"](${bbox});
  node["amenity"="animal_shelter"](${bbox});
  way["amenity"="animal_shelter"](${bbox});
);
out center tags;
  `.trim();

  const mirror = OVERPASS_MIRRORS[(attempt - 1) % OVERPASS_MIRRORS.length];

  try {
    const res = await fetchWithTimeout(mirror, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 504 || res.status === 503 || res.status === 502) throw new Error("SERVER_ERROR");
    if (!res.ok) throw new Error(`Overpass ${res.status}`);

    const data = await res.json();
    return data.elements || [];
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.log(`   Retry ${attempt}/${MAX_RETRIES - 1} (${err.message}) after ${RETRY_DELAY / 1000}s`);
      await sleep(RETRY_DELAY);
      return queryOverpass(bounds, attempt + 1);
    }
    throw err;
  }
}

// ─── Categorize OSM tags → our category ────────────────────
function categorize(tags) {
  if (tags.amenity === "veterinary") return "Vets";
  if (tags.shop === "pet_grooming") return "Groomers";
  if (tags.amenity === "animal_boarding") return "Boarding";
  if (tags.amenity === "animal_shelter") return "Therapy";
  if (tags.shop === "pet") return "Groomers";
  return "Other";
}

// ─── Convert OSM element → our listing format ──────────────
function toListing(element, city, state) {
  const tags = element.tags || {};
  if (!tags.name) return null;

  const category = categorize(tags);
  if (category === "Other") return null;

  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");

  const phone = tags.phone || tags["contact:phone"] || "";
  const website = tags.website || tags["contact:website"] || "";

  if (!phone && !website && !street) return null;

  return {
    business_name: tags.name,
    category,
    state,
    city: tags["addr:city"] || city,
    street_address: street,
    zip_code: tags["addr:postcode"] || "",
    phone,
    website,
    rating: null,
    review_count: 0,
  };
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  const citiesPath = path.resolve("data/cities.json");
  const poolPath = path.resolve("data/listings-pool.json");
  const progressPath = path.resolve("data/scrape-progress.json");

  if (!fs.existsSync(citiesPath)) {
    console.error("data/cities.json not found");
    process.exit(1);
  }

  const allCities = readJson(citiesPath);

  let existing = [];
  if (fs.existsSync(poolPath)) {
    try {
      existing = readJson(poolPath);
    } catch (err) {
      console.error("Error reading pool file:", err.message);
      existing = [];
    }
  }

  let scrapedCities = [];
  if (fs.existsSync(progressPath)) {
    try {
      scrapedCities = readJson(progressPath);
    } catch (err) {
      scrapedCities = [];
    }
  }

  const scrapedSet = new Set(scrapedCities.map((c) => `${c.city}|${c.state}`));
  const citiesToScrape = allCities.filter(
    (c) => !scrapedSet.has(`${c.city}|${c.state}`)
  );

  if (citiesToScrape.length === 0) {
    console.log("All cities already scraped!");
    console.log(`   Pool has ${existing.length} listings`);
    return;
  }

  const existingKeys = new Set(
    existing.map((l) => `${l.business_name}|${l.city}|${l.state}`)
  );

  console.log(`Scraping ${citiesToScrape.length} cities (${scrapedCities.length}/${allCities.length} already done)`);
  console.log(`Pool currently has ${existing.length} listings\n`);

  const newListings = [];
  let cityIndex = 0;
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 12 * 60 * 1000; // 12 minutes max runtime

  for (const { city, state } of citiesToScrape) {
    cityIndex++;

    // Check time budget — exit gracefully if running long
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log(`\nTime limit reached. Saving progress and exiting.`);
      break;
    }

    console.log(`[${cityIndex}/${citiesToScrape.length}] ${city}, ${state}`);

    try {
      const bounds = await getCityBounds(city, state);
      if (!bounds) {
        console.log("   No bounds found, skipping");
        scrapedCities.push({ city, state });
        continue;
      }

      await sleep(1500);

      const elements = await queryOverpass(bounds);
      console.log(`   OSM returned ${elements.length} elements`);

      let added = 0;
      for (const el of elements) {
        const listing = toListing(el, city, state);
        if (!listing) continue;

        const key = `${listing.business_name}|${listing.city}|${listing.state}`;
        if (existingKeys.has(key)) continue;

        existingKeys.add(key);
        newListings.push(listing);
        added++;
      }

      console.log(`   Added ${added} new listings`);
      scrapedCities.push({ city, state });

      // Save after every city
      fs.writeFileSync(
        poolPath,
        JSON.stringify([...existing, ...newListings], null, 2),
        "utf-8"
      );
      fs.writeFileSync(
        progressPath,
        JSON.stringify(scrapedCities, null, 2),
        "utf-8"
      );

      await sleep(DELAY_BETWEEN_CITIES);
    } catch (err) {
      console.error(`   Error: ${err.message}`);
      await sleep(5000);
    }
  }

  console.log(`\nDone. Total added this run: ${newListings.length}`);
  console.log(`Pool now has ${existing.length + newListings.length} listings`);

  const combined = [...existing, ...newListings];
  const byCat = {};
  for (const l of combined) {
    byCat[l.category] = (byCat[l.category] || 0) + 1;
  }
  console.log("\nBy category:");
  for (const [cat, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${n}`);
  }

  console.log(`\nProgress: ${scrapedCities.length}/${allCities.length} cities scraped`);
  if (scrapedCities.length < allCities.length) {
    console.log(`   Run again to scrape the remaining ${allCities.length - scrapedCities.length} cities.`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
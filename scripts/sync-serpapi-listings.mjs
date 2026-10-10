// scripts/sync-serpapi-listings.mjs
// Fetches dog care businesses from Google Maps via SerpApi (free tier: 100
// searches/month, no credit card required) and merges them into
// data/listings-pool.json — the same pool consumed by import-listings.mjs.
//
// Usage:
//   SERPAPI_API_KEY=xxx node scripts/sync-serpapi-listings.mjs
//   node scripts/sync-serpapi-listings.mjs --budget=90 --limit=8
//   node scripts/sync-serpapi-listings.mjs --only="Austin,TX" --dry-run
//   node scripts/sync-serpapi-listings.mjs --reset-progress
//
// Flags:
//   --budget=N        Max SerpApi searches to spend this calendar month (default 90)
//   --limit=N         Max city×category combos to process this run (default 10)
//   --only="A,TX;B,CA"  Only process these cities (City,ST pairs, semicolon separated)
//   --dry-run         Don't call the API; transform a built-in fixture instead
//   --reset-progress  Clear serpapi-progress.json and start over
import "dotenv/config";
import fs from "fs";
import path from "path";

const API_KEY = process.env.SERPAPI_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!API_KEY && !DRY_RUN) {
  console.error("❌ SERPAPI_API_KEY not set in .env (get a free key at https://serpapi.com/users/sign_up)");
  process.exit(1);
}

const argVal = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : def;
};
const MONTHLY_BUDGET = parseInt(argVal("budget", "90"), 10);
const RUN_LIMIT = parseInt(argVal("limit", "10"), 10);
const ONLY = argVal("only", "");
const RESET = process.argv.includes("--reset-progress");

const DELAY_MS = 1500; // be gentle with the free tier
const MAX_RUNTIME_MS = 13 * 60 * 1000;
const WEBSITE_TIMEOUT = 8000;

const CATEGORIES = [
  { query: "dog groomer", slug: "Groomers" },
  { query: "dog trainer", slug: "Trainers" },
  { query: "dog boarding kennel", slug: "Boarding" },
  { query: "veterinarian", slug: "Vets" },
  { query: "dog daycare", slug: "Daycare" },
];

const SERPAPI_URL = "https://serpapi.com/search";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Monthly usage tracker ──────────────────────────────────────────
function loadUsage(usagePath) {
  try {
    return JSON.parse(fs.readFileSync(usagePath, "utf-8"));
  } catch {
    return {};
  }
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

// ── One Google Maps search via SerpApi ─────────────────────────────
async function searchSerpApi(query, city, state) {
  const q = `${query} in ${city}, ${state}`;
  const url =
    `${SERPAPI_URL}?engine=google_maps&q=${encodeURIComponent(q)}` +
    `&hl=en&gl=us&api_key=${API_KEY}`;

  const res = await fetch(url);
  if (res.status === 401) {
    throw new Error("AUTH: invalid SerpApi API key (401)");
  }
  if (res.status === 429) {
    throw new Error("QUOTA: SerpApi rate limit / monthly quota exhausted (429)");
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err.substring(0, 150)}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`SerpApi error: ${data.error}`);
  }
  return data.local_results || [];
}

// ── Parse "1435 Broadway, New York, NY 10018" ──────────────────────
function parseAddress(address, fallbackCity, fallbackState) {
  let street = "", city = fallbackCity, state = fallbackState, zip = "";
  if (address) {
    const m = address.match(/^(.*?),\s*([^,]+?),\s*([A-Z]{2})(?:\s+(\d{5}))?/);
    if (m) {
      street = m[1].trim();
      city = m[2].trim() || fallbackCity;
      state = m[3].trim() || fallbackState;
      zip = m[4] || "";
    } else {
      // Fallback: first chunk is the street
      street = address.split(",")[0].trim();
    }
  }
  return { street, city, state, zip };
}

// ── SerpApi local_result → pool listing shape ──────────────────────
async function transformResult(r, categorySlug, fallbackCity, fallbackState) {
  const addr = parseAddress(r.address || "", fallbackCity, fallbackState);
  const website = r.website || "";
  const websiteLive = website ? await isWebsiteLive(website) : false;
  const coords = r.gps_coordinates || {};

  return {
    business_name: r.title || "Unknown",
    category: categorySlug,
    state: addr.state,
    city: addr.city,
    street_address: addr.street,
    zip_code: addr.zip,
    phone: r.phone || "",
    website: websiteLive ? website : "",
    rating: typeof r.rating === "number" ? r.rating : null,
    review_count: Number(r.reviews) || 0,
    google_place_id: r.place_id || null,
    latitude: coords.latitude ?? null,
    longitude: coords.longitude ?? null,
    last_fetched_at: Date.now(),
    source: "serpapi",
  };
}

// ── Dry-run fixture (shape mirrors SerpApi local_results) ──────────
function dryRunFixture(city, state) {
  return [
    {
      title: `Happy Paws Grooming (${city})`,
      place_id: "ChIJDRYRUN000000000001",
      address: `123 Main St, ${city}, ${state} 75001`,
      phone: "(555) 123-4567",
      website: "https://example.com",
      rating: 4.8,
      reviews: 214,
      gps_coordinates: { latitude: 30.27, longitude: -97.74 },
    },
    {
      title: `Bark & Stay Boarding (${city})`,
      place_id: "ChIJDRYRUN000000000002",
      address: `456 Oak Ave, ${city}, ${state} 75002`,
      phone: "",
      website: "",
      rating: 4.5,
      reviews: 98,
      gps_coordinates: { latitude: 30.28, longitude: -97.75 },
    },
  ];
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const citiesPath = path.resolve("data/cities.json");
  const poolPath = path.resolve("data/listings-pool.json");
  const progressPath = path.resolve("data/serpapi-progress.json");
  const usagePath = path.resolve("data/serpapi-usage.json");

  if (!fs.existsSync(citiesPath)) {
    console.error("❌ data/cities.json not found");
    process.exit(1);
  }

  const readJson = (p, fb) => {
    try {
      const raw = fs.readFileSync(p, "utf-8").replace(/^\uFEFF/, "");
      return JSON.parse(raw);
    } catch {
      return fb;
    }
  };

  let allCities = readJson(citiesPath, []);
  let existing = readJson(poolPath, []);
  let progress = RESET ? [] : readJson(progressPath, []);
  const usage = loadUsage(usagePath);

  if (ONLY) {
    const wanted = new Set(
      ONLY.split(";").map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    allCities = allCities.filter((c) =>
      wanted.has(`${c.city},${c.state}`.toLowerCase())
    );
    console.log(`🎯 --only filter: ${allCities.length} cities`);
  }

  const mk = monthKey();
  const usedThisMonth = usage[mk] || 0;
  const remaining = MONTHLY_BUDGET - usedThisMonth;

  console.log(`📊 Pool: ${existing.length} listings`);
  console.log(`📊 SerpApi progress: ${progress.length} city×category combos done`);
  console.log(`📊 Monthly budget: ${usedThisMonth}/${MONTHLY_BUDGET} used (${remaining} left)`);
  if (DRY_RUN) console.log("🧪 DRY RUN — no API calls will be made\n");

  if (remaining <= 0 && !DRY_RUN) {
    console.log("⏸️  Monthly SerpApi budget exhausted. Nothing to do.");
    return;
  }

  const progressSet = new Set(progress.map((p) => `${p.city}|${p.state}|${p.category}`));
  const seenIds = new Set(existing.map((l) => l.google_place_id).filter(Boolean));
  const seenKeys = new Set(
    existing.map((l) => `${l.business_name}|${l.city}|${l.state}`)
  );

  const newListings = [];
  let done = 0;
  let spent = 0;
  const startTime = Date.now();
  let quotaHit = false;

  outer:
  for (const { city, state } of allCities) {
    for (const cat of CATEGORIES) {
      const progressKey = `${city}|${state}|${cat.slug}`;
      if (progressSet.has(progressKey)) continue;
      if (done >= RUN_LIMIT) break outer;
      if (spent >= remaining && !DRY_RUN) {
        console.log(`\n⏸️  Monthly budget reached (${MONTHLY_BUDGET}). Stopping.`);
        break outer;
      }
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`\n⏰ Time limit reached. Progress saved.`);
        break outer;
      }
      if (quotaHit) break outer;

      done++;
      console.log(`[${done}] ${cat.query} in ${city}, ${state}`);

      try {
        const results = DRY_RUN
          ? dryRunFixture(city, state)
          : await searchSerpApi(cat.query, city, state);
        if (!DRY_RUN) {
          spent++;
          usage[mk] = (usage[mk] || 0) + 1;
          fs.writeFileSync(usagePath, JSON.stringify(usage, null, 2));
        }
        console.log(`   → ${results.length} results`);

        let added = 0;
        for (const r of results) {
          const listing = await transformResult(r, cat.slug, city, state);
          // Dedup: prefer google_place_id, fall back to name|city|state
          if (listing.google_place_id && seenIds.has(listing.google_place_id)) continue;
          const key = `${listing.business_name}|${listing.city}|${listing.state}`;
          if (seenKeys.has(key)) continue;
          if (listing.google_place_id) seenIds.add(listing.google_place_id);
          seenKeys.add(key);
          newListings.push(listing);
          added++;
        }
        console.log(`   ✅ ${added} new (${newListings.length} total this run)`);

        progress.push({ city, state, category: cat.slug, at: new Date().toISOString() });
        progressSet.add(progressKey);

        // Crash-safe: persist after every search
        fs.writeFileSync(poolPath, JSON.stringify([...existing, ...newListings], null, 2));
        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      } catch (err) {
        console.error(`   ❌ ${err.message}`);
        if (/QUOTA|429/.test(err.message)) {
          quotaHit = true;
          console.log("   ⏸️  Stopping run — SerpApi quota issue. Progress saved.");
          break outer;
        }
        if (/AUTH|401/.test(err.message)) {
          console.log("   🛑 Stopping run — check SERPAPI_API_KEY.");
          break outer;
        }
      }

      await sleep(DELAY_MS);
    }
  }

  console.log(`\n🎉 Done. Added ${newListings.length} new listings this run.`);
  console.log(`   Pool now: ${existing.length + newListings.length}`);
  console.log(`   Combos complete: ${progress.length}`);
  if (!DRY_RUN) console.log(`   SerpApi used this month: ${usage[mk] || 0}/${MONTHLY_BUDGET}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

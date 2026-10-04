// src/lib/database.js

const AIRTABLE_BASE_ID = import.meta.env.AIRTABLE_BASE_ID;
const AIRTABLE_PAT = import.meta.env.AIRTABLE_PAT;
const LISTINGS_TABLE = "Imported table";
const BLOG_TABLE = "Blog Posts";

// ── Cache ────────────────────────────────────────────────────────────────
let _listingsCache = null;
let _blogCache = null;

// ── Generic paginated fetch ──────────────────────────────────────────────
async function fetchAll(tableName) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;
  const records = [];
  let offset = null;

  do {
    const params = new URLSearchParams();
    if (offset) params.set("offset", offset);
    const res = await fetch(`${url}?${params}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Airtable ${res.status}: ${txt}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return records;
}

// ── Listings ─────────────────────────────────────────────────────────────
export async function fetchAllRecords() {
  if (_listingsCache) return _listingsCache;
  try {
    const records = await fetchAll(LISTINGS_TABLE);
    if (records.length === 0) {
      _listingsCache = DEMO_LISTINGS;
      return _listingsCache;
    }
    _listingsCache = records.map(normalizeListing);
    return _listingsCache;
  } catch (err) {
    console.warn("⚠️ Airtable listings fetch failed — using demo data:", err.message);
    _listingsCache = DEMO_LISTINGS;
    return _listingsCache;
  }
}

function normalizeListing(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    businessName: f["Business Name"] || "Unnamed Provider",
    category: f["Category"] || "Other",
    state: (f["State"] || "").toUpperCase().trim(),
    city: (f["City"] || "").trim(),
    streetAddress: f["Street Address"] || "",
    zipCode: f["Zip Code"] || "",
    phone: f["Phone"] || "",
    website: f["Website"] || "",
    rating: typeof f["Rating"] === "number" ? f["Rating"] : null,
    reviewCount: typeof f["Review Count"] === "number" ? f["Review Count"] : 0,
  };
}

// ── Blog Posts ───────────────────────────────────────────────────────────
export async function fetchBlogPosts() {
  if (_blogCache) return _blogCache;
  try {
    const records = await fetchAll(BLOG_TABLE);
    _blogCache = records.map(normalizePost).sort(
      (a, b) => new Date(b.publishDate) - new Date(a.publishDate)
    );
    return _blogCache;
  } catch (err) {
    console.warn("⚠️ Blog fetch failed:", err.message);
    _blogCache = [];
    return _blogCache;
  }
}

function normalizePost(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    title: f["Title"] || "Untitled",
    slug: f["Slug"] || slugify(f["Title"] || record.id),
    excerpt: f["Excerpt"] || "",
    content: f["Content"] || "",
    category: f["Category"] || "Guides",
    author: f["Author"] || "DogCareFinder Team",
    publishDate: f["Publish Date"] || new Date().toISOString(),
    updatedDate: f["Updated Date"] || f["Publish Date"] || new Date().toISOString(),
    featuredImage: f["Featured Image"] || "",
    readTime: f["Read Time"] || 5,
    keywords: f["Keywords"] || "",
    relatedStates: f["Related States"] || [],
    relatedCategories: f["Related Categories"] || [],
  };
}

// ── Utilities ────────────────────────────────────────────────────────────
export function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function unslugify(slug) {
  return slug.split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function toUrlSegment(value) {
  return slugify(value);
}

export function renderStars(rating) {
  if (rating === null || rating === undefined) return "No rating";
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  const empty = 5 - full - (hasHalf ? 1 : 0);
  return "★".repeat(full) + (hasHalf ? "½" : "") + "☆".repeat(empty);
}

export function truncate(text, len = 160) {
  if (!text) return "";
  return text.length > len ? text.substring(0, len - 3).trim() + "..." : text;
}

// ── Demo fallback ────────────────────────────────────────────────────────
const DEMO_LISTINGS = [
  { id: "d1", businessName: "Happy Tails Grooming", category: "Groomers", state: "TX", city: "Austin", streetAddress: "123 Main St", zipCode: "78701", phone: "(512) 555-0100", website: "https://happytails.com", rating: 4.7, reviewCount: 85 },
  { id: "d2", businessName: "Austin Dog Trainers", category: "Trainers", state: "TX", city: "Austin", streetAddress: "456 Oak Ave", zipCode: "78702", phone: "(512) 555-0200", website: "https://austindogtrainers.com", rating: 4.9, reviewCount: 120 },
  { id: "d3", businessName: "Paws & Board", category: "Boarding", state: "CA", city: "Los Angeles", streetAddress: "789 Pine Rd", zipCode: "90001", phone: "(213) 555-0300", website: "https://pawsandboard.com", rating: 4.5, reviewCount: 60 },
  { id: "d4", businessName: "Golden Vet Clinic", category: "Vets", state: "CA", city: "Los Angeles", streetAddress: "321 Elm Blvd", zipCode: "90002", phone: "(213) 555-0400", website: "https://goldenvet.com", rating: 4.8, reviewCount: 210 },
  { id: "d5", businessName: "Bark Avenue Therapy", category: "Therapy", state: "NY", city: "New York", streetAddress: "100 Broadway", zipCode: "10001", phone: "(212) 555-0500", website: "https://barkavenuetherapy.com", rating: 4.6, reviewCount: 95 },
  { id: "d6", businessName: "Denver Dog Resort", category: "Boarding", state: "CO", city: "Denver", streetAddress: "555 Mountain Way", zipCode: "80202", phone: "(303) 555-0600", website: "https://denverdogresort.com", rating: 4.9, reviewCount: 180 },
];
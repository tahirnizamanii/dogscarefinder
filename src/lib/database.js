// src/lib/database.js
import mysql from "mysql2/promise";

// ── Environment helper — works in Astro AND plain Node.js ───────────────
function env(key) {
  // Try Astro's import.meta.env first
  try {
    if (typeof import.meta !== "undefined" && import.meta && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
  // Fallback to process.env (works in scripts)
  return process.env[key];
}

// ── Connection pool ─────────────────────────────────────────────────────
let _pool = null;

function getPool() {
  if (!_pool) {
    _pool = mysql.createPool({
      host: env("DB_HOST"),
      user: env("DB_USER"),
      password: env("DB_PASSWORD"),
      database: env("DB_NAME"),
      port: Number(env("DB_PORT")) || 3306,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000,
      ssl: env("DB_SSL") === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return _pool;
}

// ── Build-time cache ────────────────────────────────────────────────────
let _listingsCache = null;
let _blogCache = null;

// ── Utilities ───────────────────────────────────────────────────────────
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function unslugify(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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

// ── Listings ────────────────────────────────────────────────────────────
export async function fetchAllRecords() {
  if (_listingsCache) return _listingsCache;

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        id, business_name AS businessName, category, state, city,
        street_address AS streetAddress, zip_code AS zipCode,
        phone, website, rating, review_count AS reviewCount,
        description, featured
       FROM listings
       ORDER BY featured DESC, rating DESC, review_count DESC`
    );

    _listingsCache = rows.map((row) => {
      const baseSlug = `${row.businessName || "provider"}-${row.city || ""}-${row.state || ""}`;
      const slug = slugify(baseSlug).substring(0, 150);

      return {
        id: String(row.id),
        slug: slug,
        businessName: row.businessName || "Unnamed Provider",
        category: row.category || "Other",
        state: (row.state || "").toUpperCase().trim(),
        city: (row.city || "").trim(),
        streetAddress: row.streetAddress || "",
        zipCode: row.zipCode || "",
        phone: row.phone || "",
        website: row.website || "",
        rating: row.rating !== null ? Number(row.rating) : null,
        reviewCount: Number(row.reviewCount) || 0,
        description: row.description || "",
        featured: Boolean(row.featured),
      };
    });

    console.log(`✅ Loaded ${_listingsCache.length} listings from MySQL`);
    return _listingsCache;
  } catch (err) {
    console.error("❌ Listings fetch failed:", err.message);
    _listingsCache = [];
    return _listingsCache;
  }
}

// ── Blog Posts ──────────────────────────────────────────────────────────
export async function fetchBlogPosts() {
  if (_blogCache) return _blogCache;

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        id, title, slug, excerpt, content, meta_description AS metaDescription,
        category, author, featured_image AS featuredImage,
        read_time AS readTime, keywords, faq, related_states AS relatedStates,
        related_categories AS relatedCategories,
        publish_date AS publishDate, updated_date AS updatedDate, featured
       FROM blog_posts
       WHERE publish_date <= NOW()
       ORDER BY featured DESC, publish_date DESC`
    );

    _blogCache = rows.map((row) => ({
      id: String(row.id),
      title: row.title || "Untitled",
      slug: row.slug || slugify(row.title || String(row.id)),
      excerpt: row.excerpt || "",
      content: row.content || "",
      metaDescription: row.metaDescription || row.excerpt || row.title || "",
      category: row.category || "Guides",
      author: row.author || "DogCareFinder Team",
      featuredImage: row.featuredImage || "",
      readTime: Number(row.readTime) || 5,
      keywords: row.keywords || "",
      faq: row.faq ? (typeof row.faq === "string" ? JSON.parse(row.faq) : row.faq) : null,
      relatedStates: row.relatedStates ? row.relatedStates.split(",").map((s) => s.trim()) : [],
      relatedCategories: row.relatedCategories
        ? row.relatedCategories.split(",").map((s) => s.trim())
        : [],
      publishDate: row.publishDate ? new Date(row.publishDate).toISOString() : new Date().toISOString(),
      updatedDate: row.updatedDate ? new Date(row.updatedDate).toISOString() : new Date().toISOString(),
      featured: Boolean(row.featured),
    }));

    console.log(`✅ Loaded ${_blogCache.length} blog posts from MySQL`);
    return _blogCache;
  } catch (err) {
    console.error("❌ Blog fetch failed:", err.message);
    _blogCache = [];
    return _blogCache;
  }
}
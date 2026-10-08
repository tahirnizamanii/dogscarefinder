// src/lib/database.js
import mysql from "mysql2/promise";

// ── Environment helper — works in Astro AND plain Node.js ───────────────
function env(key) {
  try {
    if (typeof import.meta !== "undefined" && import.meta && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
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

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER SLUG BUILDER — short, SEO-friendly URLs
// ═══════════════════════════════════════════════════════════════════════
const FILLER_WORDS = new Set([
  "the", "and", "of", "for", "at", "in", "on", "with", "by", "to", "a", "an",
  "llc", "inc", "ltd", "co", "corp", "company",
  "dog", "dogs", "pet", "pets", "canine",
  "center", "centre", "shop", "store", "gift", "yard", "play",
  "adoption", "location", "branch", "outlet", "department",
]);

export function buildProviderSlug(businessName, city, state) {
  const citySlug = slugify(city || "");
  const stateSlug = (state || "").toLowerCase();

  // 1. Tokenize business name
  let tokens = slugify(businessName || "provider")
    .split("-")
    .filter(Boolean);

  // 2. Remove tokens that already appear in the city slug (redundant)
  const cityTokens = new Set(citySlug.split("-").filter(Boolean));
  tokens = tokens.filter((t) => !cityTokens.has(t));

  // 3. Remove filler words — but only if we still have at least 2 tokens left
  const stripped = tokens.filter((t) => !FILLER_WORDS.has(t));
  if (stripped.length >= 2) {
    tokens = stripped;
  }

  // 4. Hard cap on business-name tokens (keeps URL short)
  const MAX_TOKENS = 6;
  if (tokens.length > MAX_TOKENS) {
    tokens = tokens.slice(0, MAX_TOKENS);
  }

  const businessPart = tokens.join("-") || "provider";
  return `${businessPart}-${citySlug}-${stateSlug}`.substring(0, 120);
}

// ═══════════════════════════════════════════════════════════════════════
// LISTINGS
// ═══════════════════════════════════════════════════════════════════════
export async function fetchAllRecords() {
  if (_listingsCache) return _listingsCache;

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        id, business_name AS businessName, category, state, city,
        street_address AS streetAddress, zip_code AS zipCode,
        phone, website, rating, review_count AS reviewCount,
        description, featured,
        last_fetched_at AS lastFetchedAt,
        google_place_id AS googlePlaceId,
        reviews_json AS reviewsJson,
        last_review_update AS lastReviewUpdate,
        claimed_by AS claimedBy,
        claimed_at AS claimedAt,
        claim_verified AS claimVerified
       FROM listings
       ORDER BY featured DESC, rating DESC, review_count DESC`
    );

    _listingsCache = rows.map((row) => {
      const slug = buildProviderSlug(row.businessName, row.city, row.state);

      let reviews = null;
      try {
        reviews = row.reviewsJson
          ? (typeof row.reviewsJson === "string" ? JSON.parse(row.reviewsJson) : row.reviewsJson)
          : null;
      } catch (e) { reviews = null; }

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

        // ── Claim + review metadata ──
        lastFetchedAt: row.lastFetchedAt ? Number(row.lastFetchedAt) : null,
        googlePlaceId: row.googlePlaceId || null,
        reviewsJson: reviews,
        lastReviewUpdate: row.lastReviewUpdate ? Number(row.lastReviewUpdate) : null,
        claimedBy: row.claimedBy || null,
        claimedAt: row.claimedAt ? Number(row.claimedAt) : null,
        claimVerified: Boolean(row.claimVerified),
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

// ═══════════════════════════════════════════════════════════════════════
// BLOG POSTS
// ═══════════════════════════════════════════════════════════════════════
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
        related_state AS relatedState, related_city AS relatedCity,
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
      relatedState: row.relatedState || null,
      relatedCity: row.relatedCity || null,
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

// ═══════════════════════════════════════════════════════════════════════
// RELATED GUIDES — location-aware fallback chain
// ═══════════════════════════════════════════════════════════════════════
export async function fetchRelatedGuides(stateCode, cityName, limit = 3) {
  try {
    const pool = getPool();
    const collected = [];
    const seenIds = new Set();

    // 1. Guides tagged for this exact city + state
    if (cityName && stateCode) {
      const [cityRows] = await pool.query(
        `SELECT id, title, slug, excerpt, category, publish_date AS publishDate, featured_image AS featuredImage
         FROM blog_posts
         WHERE publish_date <= NOW()
           AND related_city = ? AND related_state = ?
         ORDER BY publish_date DESC LIMIT ?`,
        [cityName, stateCode, limit]
      );
      for (const r of cityRows) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); collected.push(r); }
      }
    }

    // 2. Guides tagged for this state
    if (collected.length < limit && stateCode) {
      const [stateRows] = await pool.query(
        `SELECT id, title, slug, excerpt, category, publish_date AS publishDate, featured_image AS featuredImage
         FROM blog_posts
         WHERE publish_date <= NOW()
           AND related_state = ?
           AND (related_city IS NULL OR related_city != ?)
         ORDER BY publish_date DESC LIMIT ?`,
        [stateCode, cityName || "", limit - collected.length]
      );
      for (const r of stateRows) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); collected.push(r); }
      }
    }

    // 3. National guides (no location tag)
    if (collected.length < limit) {
      const [natRows] = await pool.query(
        `SELECT id, title, slug, excerpt, category, publish_date AS publishDate, featured_image AS featuredImage
         FROM blog_posts
         WHERE publish_date <= NOW()
           AND related_state IS NULL
         ORDER BY featured DESC, publish_date DESC LIMIT ?`,
        [limit - collected.length]
      );
      for (const r of natRows) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); collected.push(r); }
      }
    }

    // 4. Last resort — any recent guides
    if (collected.length < limit) {
      const [anyRows] = await pool.query(
        `SELECT id, title, slug, excerpt, category, publish_date AS publishDate, featured_image AS featuredImage
         FROM blog_posts
         WHERE publish_date <= NOW()
         ORDER BY publish_date DESC LIMIT ?`,
        [limit - collected.length]
      );
      for (const r of anyRows) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); collected.push(r); }
      }
    }

    return collected.map((r) => ({
      id: String(r.id),
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt || "",
      category: r.category || "Guides",
      publishDate: r.publishDate ? new Date(r.publishDate).toISOString() : null,
      featuredImage: r.featuredImage || "",
    }));
  } catch (err) {
    console.error("❌ Related guides fetch failed:", err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CLAIMED LISTINGS — for provider dashboard
// ═══════════════════════════════════════════════════════════════════════
export async function fetchClaimedListings(userId) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        id, business_name AS businessName, category, state, city,
        street_address AS streetAddress, zip_code AS zipCode,
        phone, website, rating, review_count AS reviewCount,
        claimed_at AS claimedAt, claim_verified AS claimVerified
       FROM listings 
       WHERE claimed_by = ?
       ORDER BY claimed_at DESC`,
      [userId]
    );

    return rows.map((row) => ({
      id: String(row.id),
      businessName: row.businessName,
      category: row.category,
      state: row.state,
      city: row.city,
      streetAddress: row.streetAddress,
      zipCode: row.zipCode,
      phone: row.phone,
      website: row.website,
      rating: row.rating ? Number(row.rating) : null,
      reviewCount: Number(row.reviewCount) || 0,
      claimedAt: row.claimedAt ? Number(row.claimedAt) : null,
      claimVerified: Boolean(row.claimVerified),
      slug: buildProviderSlug(row.businessName, row.city, row.state),
    }));
  } catch (err) {
    console.error("❌ Claimed listings fetch failed:", err.message);
    return [];
  }
}
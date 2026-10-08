// .agents/skills/seo-doctor/fixers/validate-websites.mjs
// Validates every listing's website URL and clears dead ones.
// 100% free — uses Node.js fetch + DNS. No API key needed.

import dns from "dns/promises";

const CONCURRENCY = 8;          // how many websites to check at once
const HTTP_TIMEOUT = 8000;      // 8 seconds per request
const MAX_BODY_BYTES = 20000;   // only read first 20 KB to detect parked domains

// ── Parked domain signatures ─────────────────────────────────
const PARKED_PATTERNS = [
  /domain\s+for\s+sale/i,
  /buy\s+this\s+domain/i,
  /this\s+domain\s+is\s+for\s+sale/i,
  /godaddy\.com\/domainsearch/i,
  /sedo\.com/i,
  /hugedomains\.com/i,
  /dan\.com\/domain/i,
  /afternic\.com/i,
  /coming\s+soon/i,
  /under\s+construction/i,
  /website\s+not\s+found/i,
  /default\s+web\s+page/i,
  /apache2\s+ubuntu\s+default\s+page/i,
  /nginx\s+welcome\s+page/i,
  /index\s+of\s+\//i,
];

// ── Normalize a URL ──────────────────────────────────────────
function normalizeUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// ── DNS check ────────────────────────────────────────────────
async function domainResolves(url) {
  try {
    const host = new URL(url).hostname;
    await Promise.race([
      dns.lookup(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error("dns timeout")), 5000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ── HTTP check ───────────────────────────────────────────────
async function checkWebsite(url) {
  const result = { url, status: "unknown", reason: "" };

  // 1. DNS
  const resolves = await domainResolves(url);
  if (!resolves) {
    result.status = "dead";
    result.reason = "DNS does not resolve";
    return result;
  }

  // 2. HEAD request
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 DogCareFinderLinkChecker/1.0" },
    });
    clearTimeout(timer);

    if (res.status >= 200 && res.status < 400) {
      result.status = "live";
      result.reason = "HTTP " + res.status;
      return result;
    }

    if (res.status === 404 || res.status === 410) {
      result.status = "dead";
      result.reason = "HTTP " + res.status;
      return result;
    }

    // 403/405 — server blocks HEAD, try GET below
    if (res.status === 403 || res.status === 405 || res.status >= 500) {
      // fall through to GET
    } else {
      result.status = "dead";
      result.reason = "HTTP " + res.status;
      return result;
    }
  } catch (err) {
    // Some servers block HEAD entirely — fall through to GET
  }

  // 3. GET fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 DogCareFinderLinkChecker/1.0" },
    });
    clearTimeout(timer);

    if (res.status >= 400) {
      result.status = "dead";
      result.reason = "HTTP " + res.status;
      return result;
    }

    // 4. Parked-domain check (read first 20 KB only)
    const reader = res.body?.getReader();
    if (!reader) {
      result.status = "live";
      return result;
    }

    let chunks = [];
    let totalBytes = 0;
    while (totalBytes < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
    }
    try { reader.cancel(); } catch {}

    const body = new TextDecoder("utf-8", { fatal: false }).decode(
      Buffer.concat(chunks.map((c) => Buffer.from(c)))
    );

    for (const pattern of PARKED_PATTERNS) {
      if (pattern.test(body)) {
        result.status = "parked";
        result.reason = "Matches parked pattern: " + pattern.source.slice(0, 40);
        return result;
      }
    }

    // Real site with actual content
    if (body.length < 500) {
      result.status = "suspicious";
      result.reason = "Body too small (" + body.length + " bytes)";
      return result;
    }

    result.status = "live";
    result.reason = "HTTP " + res.status + " · " + body.length + " bytes";
    return result;
  } catch (err) {
    result.status = "dead";
    result.reason = "Network error: " + (err.message || "timeout");
    return result;
  }
}

// ── Concurrency runner ───────────────────────────────────────
async function runWithConcurrency(items, fn, limit) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FIXER
// ═══════════════════════════════════════════════════════════════
export default async function validateWebsites({ conn, dry }) {
  console.log("   Loading listings with websites...");

  const [rows] = await conn.query(
    `SELECT id, business_name, city, state, website
     FROM listings
     WHERE website IS NOT NULL AND website != ''
     ORDER BY id DESC`
  );

  console.log("   " + rows.length + " websites to check");
  console.log("   Concurrency: " + CONCURRENCY + " · timeout: " + (HTTP_TIMEOUT / 1000) + "s");
  console.log("");

  let checked = 0;
  const results = await runWithConcurrency(
    rows,
    async (r) => {
      const url = normalizeUrl(r.website);
      if (!url) {
        checked++;
        return { ...r, status: "invalid", reason: "Invalid URL format" };
      }
      const check = await checkWebsite(url);
      checked++;
      if (checked % 20 === 0) {
        console.log("   Progress: " + checked + "/" + rows.length);
      }
      return { ...r, status: check.status, reason: check.reason };
    },
    CONCURRENCY
  );

  // Categorize
  const live = results.filter((r) => r.status === "live");
  const dead = results.filter((r) => r.status === "dead");
  const parked = results.filter((r) => r.status === "parked");
  const suspicious = results.filter((r) => r.status === "suspicious");
  const invalid = results.filter((r) => r.status === "invalid");

  console.log("");
  console.log("   ─── Results ───");
  console.log("   ✅ Live:       " + live.length);
  console.log("   ❌ Dead:       " + dead.length);
  console.log("   ⚠️  Parked:     " + parked.length);
  console.log("   ⚠️  Suspicious: " + suspicious.length);
  console.log("   ❓ Invalid:    " + invalid.length);

  // Show a sample of dead ones
  if (dead.length > 0) {
    console.log("");
    console.log("   Sample dead websites:");
    for (const d of dead.slice(0, 10)) {
      console.log("     ✗ " + d.business_name + " (" + d.state + ") — " + d.reason);
    }
    if (dead.length > 10) console.log("     ... and " + (dead.length - 10) + " more");
  }

  // Apply fixes
  const toClear = [...dead, ...parked, ...invalid];
  if (!dry && toClear.length > 0) {
    console.log("");
    console.log("   Clearing " + toClear.length + " invalid website URLs...");

    // Batch update
    const ids = toClear.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const placeholders = batch.map(() => "?").join(",");
      await conn.query(
        `UPDATE listings SET website = '' WHERE id IN (${placeholders})`,
        batch
      );
    }
    console.log("   ✅ Cleared " + ids.length + " URLs");
  }

  return {
    message:
      (dry ? "would clear " : "cleared ") +
      toClear.length +
      " of " +
      rows.length +
      " (" +
      live.length +
      " live, " +
      dead.length +
      " dead, " +
      parked.length +
      " parked)",
    fixed: toClear.length,
    live: live.length,
    dead: dead.length,
    parked: parked.length,
  };
}
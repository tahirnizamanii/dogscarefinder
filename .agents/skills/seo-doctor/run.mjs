// .agents/skills/seo-doctor/run.mjs
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

import dedupeListings from "./fixers/dedupe-listings.mjs";
import fillMissingFields from "./fixers/fill-missing-fields.mjs";
import validateWebsites from "./fixers/validate-websites.mjs";
import enrichGooglePlaces from "./fixers/enrich-google-places.mjs";
import syncGoogleReviews from "./fixers/sync-google-reviews.mjs";
import pruneThinPages from "./fixers/prune-thin-pages.mjs";
import buildInternalLinks from "./fixers/build-internal-links.mjs";
import generateSitemap from "./fixers/generate-sitemap.mjs";

// ─── Mode detection ───────────────────────────────────────────
const DRY = process.argv.includes("--dry");
const PRE_BUILD = process.argv.includes("--pre");
const POST_BUILD = process.argv.includes("--post");
const RUN_ALL = !PRE_BUILD && !POST_BUILD;

const CONFIG_DIR = path.resolve("config");
const REPORTS_DIR = path.resolve("reports");

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ─── Banner ───────────────────────────────────────────────────
const mode = DRY ? "DRY RUN" : PRE_BUILD ? "PRE-BUILD" : POST_BUILD ? "POST-BUILD" : "FULL";

console.log("");
console.log("===============================================");
console.log("   SEO DOCTOR - Audit + Fix");
console.log("   Mode: " + mode);
console.log("===============================================");
console.log("");

const startTime = Date.now();
const results = [];

// ─── DB POOL (auto-reconnects on idle) ────────────────────────
let pool;
const needsDb = RUN_ALL || PRE_BUILD;

if (needsDb) {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      idleTimeout: 60000,
      connectTimeout: 20000,
    });

    const testConn = await pool.getConnection();
    await testConn.ping();
    testConn.release();

    console.log("Connected to MySQL (pool mode)");
    console.log("");
  } catch (err) {
    console.error("DB connection failed: " + err.message);
    process.exit(1);
  }
} else {
  console.log("Skipping DB connection (post-build mode)");
  console.log("");
}

// ─── Fixer runner ─────────────────────────────────────────────
async function runFixer(name, fn, args = {}) {
  const t0 = Date.now();
  console.log("--- " + name.toUpperCase() + " ---");

  try {
    const result = await fn({ conn: pool, dry: DRY, configDir: CONFIG_DIR, ...args });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log("OK " + name + ": " + (result.message || "done") + " (" + elapsed + "s)");
    results.push({ name, ...result, elapsed });
  } catch (err) {
    console.error("FAIL " + name + ": " + err.message);
    results.push({ name, error: err.message });
  }
  console.log("");
}

// ─── Pipeline ─────────────────────────────────────────────────
// PRE-BUILD: fix data + write config/ files Astro reads
// POST-BUILD: write dist/ files (sitemap, robots)
// FULL: run both (default when no flag given)

if (RUN_ALL || PRE_BUILD) {
  await runFixer("dedupe-listings", dedupeListings);
  await runFixer("fill-missing-fields", fillMissingFields);
  await runFixer("validate-websites", validateWebsites);
  await runFixer("enrich-google-places", enrichGooglePlaces);
  await runFixer("sync-google-reviews", syncGoogleReviews);
  await runFixer("prune-thin-pages", pruneThinPages);
  await runFixer("build-internal-links", buildInternalLinks);
}

if (RUN_ALL || POST_BUILD) {
  await runFixer("generate-sitemap", generateSitemap, { skipDb: true });
}

// ─── Report ───────────────────────────────────────────────────
const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
const today = new Date().toISOString().split("T")[0];

let report = "# SEO Doctor Report - " + today + "\n\n";
report += "**Mode:** " + mode + (DRY ? " (dry)" : "") + "\n";
report += "**Time:** " + totalTime + "s\n\n";
report += "## Fixer Results\n\n";
report += "| Fixer | Result | Time |\n|---|---|---|\n";
for (const r of results) {
  const status = r.error ? "FAIL " + r.error : "OK " + (r.message || "OK");
  report += "| " + r.name + " | " + status + " | " + (r.elapsed || "-") + "s |\n";
}

fs.writeFileSync(path.join(REPORTS_DIR, "seo-doctor-" + today + ".md"), report);

// ─── Summary ──────────────────────────────────────────────────
console.log("===============================================");
console.log("   COMPLETE - Total time: " + totalTime + "s");
console.log("===============================================");
console.log("");
console.log("Fixer summary:");
for (const r of results) {
  const icon = r.error ? "X" : "OK";
  console.log("   [" + icon + "] " + r.name.padEnd(28) + (r.message || r.error || ""));
}
console.log("");
console.log("Full report: reports/seo-doctor-" + today + ".md");
console.log("");

if (DRY) {
  console.log("This was a DRY RUN. Nothing was changed.");
  console.log("To apply fixes: npm run seo:doctor");
  console.log("");
}

if (pool) await pool.end();
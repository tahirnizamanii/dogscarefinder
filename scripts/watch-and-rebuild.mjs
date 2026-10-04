// scripts/watch-and-rebuild.mjs
import { getPool } from "./db.js";

const CF_HOOK = process.env.CLOUDFLARE_DEPLOY_HOOK;

if (!CF_HOOK) {
  console.error("❌ CLOUDFLARE_DEPLOY_HOOK env var missing");
  process.exit(1);
}

async function main() {
  const pool = getPool();
  const ts = new Date().toISOString();
  console.log(`[${ts}] Checking rebuild queue...`);

  try {
    const [rows] = await pool.query(
      "SELECT id, reason FROM rebuild_queue WHERE processed = 0 ORDER BY id ASC LIMIT 100"
    );

    if (rows.length === 0) {
      console.log("   No pending changes. Exiting.");
      process.exit(0);
    }

    console.log(`   Found ${rows.length} change(s). Triggering rebuild...`);

    const res = await fetch(CF_HOOK, { method: "POST" });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`Cloudflare hook failed ${res.status}: ${text}`);
    }

    console.log(`   ✅ Rebuild triggered`);

    const ids = rows.map((r) => r.id);
    await pool.query(
      `UPDATE rebuild_queue SET processed = 1 WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    console.log(`   Marked ${ids.length} signals as processed.`);
  } catch (err) {
    console.error("   ❌ Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
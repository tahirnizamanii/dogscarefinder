// src/index.ts
import { createConnection } from "mysql2/promise";
import bcrypt from "bcryptjs";

interface Env {
  HYPERDRIVE: Hyperdrive;
  RESEND_API_KEY?: string;
  CLOUDFLARE_DEPLOY_HOOK?: string;
}

// ─── CORS ───────────────────────────────────────────────────────
function corsHeaders(origin: string | null): Record<string, string> {
  const allowedPatterns = [
    /^https:\/\/[a-z0-9-]+\.dogscarefinder\.pages\.dev$/,
    /^https:\/\/dogscarefinder\.pages\.dev$/,
    /^https:\/\/main\.dogscarefinder\.pages\.dev$/,
    /^https:\/\/dogcarefinder\.com$/,
    /^https:\/\/www\.dogcarefinder\.com$/,
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ];

  let allowedOrigin = "https://dogscarefinder.pages.dev";
  if (origin && allowedPatterns.some((p) => p.test(origin))) {
    allowedOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data: any, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function db(env: Env) {
  return await createConnection({
    host: env.HYPERDRIVE.host,
    user: env.HYPERDRIVE.user,
    password: env.HYPERDRIVE.password,
    database: env.HYPERDRIVE.database,
    port: env.HYPERDRIVE.port,
    disableEval: true,
  });
}

async function getUserFromRequest(request: Request, env: Env): Promise<any> {
  const token = getCookie(request, "session");
  if (!token) return null;
  const conn = await db(env);
  const [rows]: any = await conn.query(
    "SELECT u.id, u.email, u.full_name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
    [token, Date.now()]
  );
  await conn.end();
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
async function handleSignup(request: Request, env: Env): Promise<Response> {
  try {
    const body: any = await request.json();
    const { email, password, fullName } = body;
    if (!email || !password) return json({ error: "Email and password required" }, 400);
    if (!isValidEmail(email)) return json({ error: "Invalid email address" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const normalizedEmail = email.toLowerCase().trim();
    const conn = await db(env);
    const [existing]: any = await conn.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing.length > 0) {
      await conn.end();
      return json({ error: "Email already registered" }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    const now = Date.now();

    await conn.query(
      "INSERT INTO users (id, email, password_hash, full_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'provider', ?, ?)",
      [id, normalizedEmail, passwordHash, fullName || "", now, now]
    );

    const token = generateToken();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
    await conn.query(
      "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      [token, id, now, expiresAt]
    );
    await conn.end();

    return json(
      { success: true, user: { id, email: normalizedEmail, fullName: fullName || "", role: "provider" } },
      201,
      { "Set-Cookie": `session=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${60 * 60 * 24 * 30}` }
    );
  } catch (err: any) {
    console.error("Signup error:", err);
    return json({ error: "Failed to create account: " + err.message }, 500);
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body: any = await request.json();
    const { email, password } = body;
    if (!email || !password) return json({ error: "Email and password required" }, 400);

    const normalizedEmail = email.toLowerCase().trim();
    const conn = await db(env);
    const [rows]: any = await conn.query(
      "SELECT id, email, password_hash, full_name, role FROM users WHERE email = ?",
      [normalizedEmail]
    );
    if (rows.length === 0) {
      await conn.end();
      return json({ error: "Invalid email or password" }, 401);
    }
    const user = rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await conn.end();
      return json({ error: "Invalid email or password" }, 401);
    }

    const now = Date.now();
    const token = generateToken();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
    await conn.query(
      "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      [token, user.id, now, expiresAt]
    );
    await conn.end();

    return json(
      { success: true, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } },
      200,
      { "Set-Cookie": `session=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${60 * 60 * 24 * 30}` }
    );
  } catch (err: any) {
    console.error("Login error:", err);
    return json({ error: "Login failed: " + err.message }, 500);
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, "session");
  if (token) {
    const conn = await db(env);
    await conn.query("DELETE FROM sessions WHERE token = ?", [token]);
    await conn.end();
  }
  return json({ success: true }, 200, {
    "Set-Cookie": "session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0",
  });
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  return json({ user });
}

// ═══════════════════════════════════════════════════════════════
// LISTINGS
// ═══════════════════════════════════════════════════════════════
async function handleSubmitListing(request: Request, env: Env): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) return json({ error: "You must be logged in" }, 401);

    const body: any = await request.json();
    const { businessName, category, state, city, streetAddress, zipCode, phone, website } = body;
    if (!businessName || !category || !state || !city) return json({ error: "Missing required fields" }, 400);

    const validCategories = ["Groomers", "Trainers", "Boarding", "Vets", "Therapy"];
    if (!validCategories.includes(category)) return json({ error: "Invalid category" }, 400);
    if (!/^[A-Z]{2}$/.test(String(state).toUpperCase())) return json({ error: "State must be 2-letter code" }, 400);

    const id = crypto.randomUUID();
    const now = Date.now();
    const conn = await db(env);
    await conn.query(
      "INSERT INTO listing_submissions (id, user_id, business_name, category, state, city, street_address, zip_code, phone, website, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      [id, user.id, businessName, category, state.toUpperCase(), city, streetAddress || "", zipCode || "", phone || "", website || "", now]
    );
    await conn.end();

    return json({ success: true, id, message: "Submission received. We'll review it within 24-48 hours." }, 201);
  } catch (err: any) {
    console.error("Submit error:", err);
    return json({ error: "Failed to submit listing: " + err.message }, 500);
  }
}

async function handleListSubmissions(request: Request, env: Env): Promise<Response> {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) return json({ error: "Not logged in" }, 401);

    const conn = await db(env);
    const [rows]: any = await conn.query(
      "SELECT id, business_name, category, state, city, status, created_at FROM listing_submissions WHERE user_id = ? ORDER BY created_at DESC",
      [user.id]
    );
    await conn.end();
    return json({ submissions: rows });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════
async function requireAdmin(request: Request, env: Env): Promise<any | null> {
  const user = await getUserFromRequest(request, env);
  if (!user || user.role !== "admin") return null;
  return user;
}

async function handleAdminListSubmissions(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admin access required" }, 403);

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending";

    const conn = await db(env);
    const [rows]: any = await conn.query(
      `SELECT 
        s.id, s.business_name, s.category, s.state, s.city,
        s.street_address, s.zip_code, s.phone, s.website,
        s.status, s.created_at,
        u.email AS submitter_email, u.full_name AS submitter_name
       FROM listing_submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = ?
       ORDER BY s.created_at DESC`,
      [status]
    );
    await conn.end();
    return json({ submissions: rows, status });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

async function handleAdminApprove(request: Request, env: Env, id: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admin access required" }, 403);

  try {
    const conn = await db(env);
    const [subs]: any = await conn.query("SELECT * FROM listing_submissions WHERE id = ?", [id]);
    if (subs.length === 0) {
      await conn.end();
      return json({ error: "Submission not found" }, 404);
    }
    const sub = subs[0];

    await conn.query(
      `INSERT INTO listings 
        (business_name, category, state, city, street_address, zip_code, phone, website, rating, review_count, last_fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      [
        sub.business_name, sub.category, sub.state, sub.city,
        sub.street_address || "", sub.zip_code || "",
        sub.phone || "", sub.website || "", Date.now(),
      ]
    );

    await conn.query("UPDATE listing_submissions SET status = 'approved' WHERE id = ?", [id]);
    await conn.end();

    // Trigger rebuild
    try {
      const hookUrl = (env as any).CLOUDFLARE_DEPLOY_HOOK;
      if (hookUrl) await fetch(hookUrl, { method: "POST" });
    } catch (e) { console.error("Deploy hook failed:", e); }

    return json({ success: true, id, message: "Approved and published" });
  } catch (err: any) {
    console.error("Admin approve error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleAdminReject(request: Request, env: Env, id: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admin access required" }, 403);
  try {
    const conn = await db(env);
    await conn.query("UPDATE listing_submissions SET status = 'rejected' WHERE id = ?", [id]);
    await conn.end();
    return json({ success: true, id, message: "Submission rejected" });
  } catch (err: any) {
    console.error("Admin reject error:", err);
    return json({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// CLAIMS
// ═══════════════════════════════════════════════════════════════
async function handleClaimStart(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: "Not authenticated" }, 401);

  try {
    const { listing_id, method } = await request.json() as any;
    if (!listing_id) return json({ error: "Missing listing_id" }, 400);
    if (!["domain_email", "phone_otp"].includes(method)) return json({ error: "Invalid method" }, 400);

    const conn = await db(env);
    const [listings]: any = await conn.query(
      "SELECT id, business_name, website, phone, claimed_by FROM listings WHERE id = ?",
      [listing_id]
    );
    if (listings.length === 0) { await conn.end(); return json({ error: "Listing not found" }, 404); }

    const listing = listings[0];
    if (listing.claimed_by) { await conn.end(); return json({ error: "This listing is already claimed" }, 409); }

    let target = "";
    if (method === "domain_email") {
      if (!listing.website) { await conn.end(); return json({ error: "No website on file" }, 400); }
      try {
        const url = listing.website.startsWith("http") ? listing.website : `https://${listing.website}`;
        const host = new URL(url).hostname.replace(/^www\./, "");
        target = `verify@${host}`;
      } catch { await conn.end(); return json({ error: "Invalid website URL" }, 400); }
    } else {
      if (!listing.phone) { await conn.end(); return json({ error: "No phone on file" }, 400); }
      target = listing.phone;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = Date.now();

    await conn.query(
      `INSERT INTO listing_claims 
         (listing_id, user_id, verification_method, verification_code, verification_email, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [listing_id, user.id, method, code, target, now]
    );
    await conn.end();

    if (method === "domain_email") {
      await sendVerificationEmail(env, target, listing.business_name, code);
    }

    return json({
      success: true,
      method,
      target: maskTarget(target, method),
      message: method === "domain_email"
        ? `Verification code sent to ${maskTarget(target, method)}`
        : `Verification code sent via SMS to ${maskTarget(target, method)}`,
    });
  } catch (err: any) {
    console.error("Claim start error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleClaimVerify(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: "Not authenticated" }, 401);

  try {
    const { listing_id, code } = await request.json() as any;
    if (!listing_id || !code) return json({ error: "Missing fields" }, 400);

    const conn = await db(env);
    const [claims]: any = await conn.query(
      `SELECT id, verification_code, attempts, created_at 
       FROM listing_claims 
       WHERE listing_id = ? AND user_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [listing_id, user.id]
    );
    if (claims.length === 0) { await conn.end(); return json({ error: "No pending claim" }, 404); }

    const claim = claims[0];

    if (Date.now() - Number(claim.created_at) > 24 * 60 * 60 * 1000) {
      await conn.query("UPDATE listing_claims SET status='expired' WHERE id = ?", [claim.id]);
      await conn.end();
      return json({ error: "Code expired. Start again." }, 410);
    }

    if (claim.attempts >= 5) {
      await conn.query("UPDATE listing_claims SET status='rejected' WHERE id = ?", [claim.id]);
      await conn.end();
      return json({ error: "Too many attempts. Contact support." }, 429);
    }

    if (claim.verification_code !== String(code).trim()) {
      await conn.query("UPDATE listing_claims SET attempts = attempts + 1 WHERE id = ?", [claim.id]);
      await conn.end();
      return json({ error: "Incorrect code" }, 400);
    }

    const now = Date.now();
    await conn.query("UPDATE listing_claims SET status='verified', verified_at=? WHERE id = ?", [now, claim.id]);
    await conn.query(
      "UPDATE listings SET claimed_by=?, claimed_at=?, claim_verified=1 WHERE id = ?",
      [user.id, now, listing_id]
    );
    await conn.end();

    // Trigger rebuild
    try {
      const hookUrl = (env as any).CLOUDFLARE_DEPLOY_HOOK;
      if (hookUrl) await fetch(hookUrl, { method: "POST" });
    } catch (e) {}

    return json({ success: true, message: "Listing claimed successfully" });
  } catch (err: any) {
    console.error("Claim verify error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleMyClaims(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: "Not authenticated" }, 401);

  try {
    const conn = await db(env);
    const [rows]: any = await conn.query(
      `SELECT id, business_name, category, city, state, phone, website, claimed_at, claim_verified
       FROM listings WHERE claimed_by = ? ORDER BY claimed_at DESC`,
      [user.id]
    );
    await conn.end();
    return json({ listings: rows });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

async function handleClaimUpdate(request: Request, env: Env, listingId: string): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: "Not authenticated" }, 401);

  try {
    const conn = await db(env);
    const [rows]: any = await conn.query("SELECT claimed_by FROM listings WHERE id = ?", [listingId]);
    if (rows.length === 0) { await conn.end(); return json({ error: "Not found" }, 404); }
    if (rows[0].claimed_by !== user.id) { await conn.end(); return json({ error: "Not your listing" }, 403); }

    const body: any = await request.json();
    const allowed = ["business_name", "description", "phone", "website", "street_address", "zip_code"];
    const updates: string[] = [];
    const values: any[] = [];
    for (const key of allowed) {
      if (body[key] !== undefined) { updates.push(`${key} = ?`); values.push(body[key]); }
    }
    if (updates.length === 0) { await conn.end(); return json({ error: "No valid fields" }, 400); }

    values.push(listingId);
    await conn.query(`UPDATE listings SET ${updates.join(", ")} WHERE id = ?`, values);
    await conn.end();

    try {
      const hookUrl = (env as any).CLOUDFLARE_DEPLOY_HOOK;
      if (hookUrl) await fetch(hookUrl, { method: "POST" });
    } catch (e) {}

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

async function handleAdminListClaims(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admin access required" }, 403);

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending";
    const conn = await db(env);
    const [rows]: any = await conn.query(
      `SELECT 
         c.id, c.listing_id, c.user_id, c.verification_method, c.verification_email,
         c.status, c.attempts, c.created_at, c.verified_at,
         l.business_name, l.category, l.city, l.state,
         u.email AS claimer_email, u.full_name AS claimer_name
       FROM listing_claims c
       LEFT JOIN listings l ON l.id = c.listing_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.status = ?
       ORDER BY c.created_at DESC`,
      [status]
    );
    await conn.end();
    return json({ claims: rows, status });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

// ─── Email helper (Resend) ────────────────────────────────────
async function sendVerificationEmail(env: Env, to: string, businessName: string, code: string) {
  const RESEND_KEY = env.RESEND_API_KEY;
  if (!RESEND_KEY) { console.error("RESEND_API_KEY not set — skipping email"); return; }

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#F7F4EC;">
      <div style="background:#002955;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">DogCareFinder</h1>
      </div>
      <div style="background:#fff;padding:32px 24px;border-radius:0 0 12px 12px;">
        <h2 style="color:#002955;font-family:Georgia,serif;margin:0 0 16px;font-size:22px;">
          Verify your claim
        </h2>
        <p style="color:#475569;line-height:1.6;margin:0 0 24px;">
          Someone is trying to claim <strong>${businessName}</strong> on DogCareFinder.
          If this was you, use the code below to verify ownership:
        </p>
        <div style="background:#F7F4EC;border:2px dashed #5E7741;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#002955;font-family:monospace;">
            ${code}
          </div>
        </div>
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
          This code expires in 24 hours. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:20px;">
        © ${new Date().getFullYear()} DogCareFinder
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "DogCareFinder <verify@dogcarefinder.com>",
        to: [to],
        subject: `Your verification code: ${code}`,
        html,
      }),
    });
    if (!res.ok) console.error("Resend error:", await res.text());
  } catch (err) {
    console.error("Email send failed:", err);
  }
}

function maskTarget(target: string, method: string) {
  if (method === "domain_email") {
    const [user, domain] = target.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return target.replace(/\d(?=\d{4})/g, "*");
}

// ═══════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════
async function handleHealth(env: Env): Promise<Response> {
  try {
    const conn = await db(env);
    await conn.query("SELECT 1");
    await conn.end();
    return json({ status: "healthy", db: "connected" });
  } catch (err: any) {
    return json({ status: "unhealthy", error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    let response: Response;
    try {
      const path = url.pathname;
      const method = request.method;

      if (path === "/" && method === "GET") {
        response = json({ status: "ok", service: "DogCareFinder API" });
      } else if (path === "/health" && method === "GET") {
        response = await handleHealth(env);

      // AUTH
      } else if (path === "/api/auth/signup" && method === "POST") {
        response = await handleSignup(request, env);
      } else if (path === "/api/auth/login" && method === "POST") {
        response = await handleLogin(request, env);
      } else if (path === "/api/auth/logout" && method === "POST") {
        response = await handleLogout(request, env);
      } else if (path === "/api/auth/me" && method === "GET") {
        response = await handleMe(request, env);

      // LISTINGS
      } else if (path === "/api/listings/submit" && method === "POST") {
        response = await handleSubmitListing(request, env);
      } else if (path === "/api/listings/" && method === "GET") {
        response = await handleListSubmissions(request, env);

      // ADMIN — submissions
      } else if (path === "/api/admin/submissions" && method === "GET") {
        response = await handleAdminListSubmissions(request, env);
      } else if (path.startsWith("/api/admin/submissions/") && path.endsWith("/approve") && method === "POST") {
        const id = path.replace("/api/admin/submissions/", "").replace("/approve", "");
        response = await handleAdminApprove(request, env, id);
      } else if (path.startsWith("/api/admin/submissions/") && path.endsWith("/reject") && method === "POST") {
        const id = path.replace("/api/admin/submissions/", "").replace("/reject", "");
        response = await handleAdminReject(request, env, id);

      // ADMIN — claims
      } else if (path === "/api/admin/claims" && method === "GET") {
        response = await handleAdminListClaims(request, env);

      // CLAIMS
      } else if (path === "/api/claims/start" && method === "POST") {
        response = await handleClaimStart(request, env);
      } else if (path === "/api/claims/verify" && method === "POST") {
        response = await handleClaimVerify(request, env);
      } else if (path === "/api/claims/mine" && method === "GET") {
        response = await handleMyClaims(request, env);
      } else if (/^\/api\/claims\/\d+\/update$/.test(path) && method === "POST") {
        const id = path.split("/")[3];
        response = await handleClaimUpdate(request, env, id);

      } else {
        response = json({ error: "Not found" }, 404);
      }
    } catch (err: any) {
      console.error("Fatal:", err);
      response = json({ error: err.message || "Internal error" }, 500);
    }

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};
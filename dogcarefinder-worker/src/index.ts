// src/index.ts
import { createConnection } from "mysql2/promise";
import bcrypt from "bcryptjs";

interface Env {
  HYPERDRIVE: Hyperdrive;
}

// ─── CORS — allows any *.dogscarefinder.pages.dev subdomain ────
function corsHeaders(origin: string | null): Record<string, string> {
  const allowedPatterns = [
    /^https:\/\/[a-z0-9-]+\.dogscarefinder\.pages\.dev$/,
    /^https:\/\/dogscarefinder\.pages\.dev$/,
    /^https:\/\/main\.dogscarefinder\.pages\.dev$/,
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

// ─── Handlers: Auth ─────────────────────────────────────────
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

// ─── Handlers: Listings ─────────────────────────────────────
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

// ─── Handlers: Admin ────────────────────────────────────────
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

    const [subs]: any = await conn.query(
      "SELECT * FROM listing_submissions WHERE id = ?",
      [id]
    );
    if (subs.length === 0) {
      await conn.end();
      return json({ error: "Submission not found" }, 404);
    }
    const sub = subs[0];

    // Insert into listings table
    await conn.query(
      `INSERT INTO listings 
        (business_name, category, state, city, street_address, zip_code, phone, website, rating, review_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
      [
        sub.business_name, sub.category, sub.state, sub.city,
        sub.street_address || "", sub.zip_code || "",
        sub.phone || "", sub.website || "",
      ]
    );

    // Mark submission as approved
    await conn.query(
      "UPDATE listing_submissions SET status = 'approved' WHERE id = ?",
      [id]
    );

    await conn.end();
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
    await conn.query(
      "UPDATE listing_submissions SET status = 'rejected' WHERE id = ?",
      [id]
    );
    await conn.end();
    return json({ success: true, id, message: "Submission rejected" });
  } catch (err: any) {
    console.error("Admin reject error:", err);
    return json({ error: err.message }, 500);
  }
}

// ─── Handlers: Health ───────────────────────────────────────
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

// ─── Router ─────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    let response: Response;
    try {
      const path = url.pathname;
      const method = request.method;

      // ── Root + health ────────────────────────────────────
      if (path === "/" && method === "GET") {
        response = json({ status: "ok", service: "DogCareFinder API" });
      } else if (path === "/health" && method === "GET") {
        response = await handleHealth(env);

      // ── Auth routes ──────────────────────────────────────
      } else if (path === "/api/auth/signup" && method === "POST") {
        response = await handleSignup(request, env);
      } else if (path === "/api/auth/login" && method === "POST") {
        response = await handleLogin(request, env);
      } else if (path === "/api/auth/logout" && method === "POST") {
        response = await handleLogout(request, env);
      } else if (path === "/api/auth/me" && method === "GET") {
        response = await handleMe(request, env);

      // ── Listing routes ───────────────────────────────────
      } else if (path === "/api/listings/submit" && method === "POST") {
        response = await handleSubmitListing(request, env);
      } else if (path === "/api/listings/" && method === "GET") {
        response = await handleListSubmissions(request, env);

      // ── Admin routes ─────────────────────────────────────
      } else if (path === "/api/admin/submissions" && method === "GET") {
        response = await handleAdminListSubmissions(request, env);
      } else if (path.startsWith("/api/admin/submissions/") && path.endsWith("/approve") && method === "POST") {
        const id = path.replace("/api/admin/submissions/", "").replace("/approve", "");
        response = await handleAdminApprove(request, env, id);
      } else if (path.startsWith("/api/admin/submissions/") && path.endsWith("/reject") && method === "POST") {
        const id = path.replace("/api/admin/submissions/", "").replace("/reject", "");
        response = await handleAdminReject(request, env, id);

      // ── 404 ───────────────────────────────────────────────
      } else {
        response = json({ error: "Not found" }, 404);
      }
    } catch (err: any) {
      console.error("Fatal:", err);
      response = json({ error: err.message || "Internal error" }, 500);
    }

    // Merge CORS headers into final response
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};
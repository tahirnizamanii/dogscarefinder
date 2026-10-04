// routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool } from "../server.js";

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function getUserFromRequest(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;

  const [rows] = await pool.query(
    "SELECT u.id, u.email, u.full_name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
    [match[1], Date.now()]
  );
  return rows[0] || null;
}

// POST /signup
router.post("/signup", async function (req, res) {
  try {
    const body = req.body;
    const email = body.email;
    const password = body.password;
    const fullName = body.fullName;

    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email address" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const normalizedEmail = email.toLowerCase().trim();

    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing.length > 0) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    const now = Date.now();

    await pool.query(
      "INSERT INTO users (id, email, password_hash, full_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'provider', ?, ?)",
      [id, normalizedEmail, passwordHash, fullName || "", now, now]
    );

    const token = generateToken();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
    await pool.query(
      "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      [token, id, now, expiresAt]
    );

    res.setHeader("Set-Cookie", "session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (60 * 60 * 24 * 30));
    res.status(201).json({
      success: true,
      user: { id: id, email: normalizedEmail, fullName: fullName || "", role: "provider" },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// POST /login
router.post("/login", async function (req, res) {
  try {
    const email = req.body.email;
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const normalizedEmail = email.toLowerCase().trim();
    const [rows] = await pool.query(
      "SELECT id, email, password_hash, full_name, role FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (rows.length === 0) return res.status(401).json({ error: "Invalid email or password" });
    const user = rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const now = Date.now();
    const token = generateToken();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
    await pool.query(
      "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      [token, user.id, now, expiresAt]
    );

    res.setHeader("Set-Cookie", "session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (60 * 60 * 24 * 30));
    res.json({
      success: true,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /logout
router.post("/logout", async function (req, res) {
  try {
    const cookie = req.headers.cookie || "";
    const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) {
      await pool.query("DELETE FROM sessions WHERE token = ?", [match[1]]);
    }
    res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
});

// GET /me
router.get("/me", async function (req, res) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.json({ user: null });
    res.json({ user: user });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;

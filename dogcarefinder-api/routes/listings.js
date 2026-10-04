// routes/listings.js
import express from "express";
import crypto from "crypto";
import { pool } from "../server.js";

const router = express.Router();

async function getUserFromRequest(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;
  const [rows] = await pool.query(
    "SELECT u.id, u.email, u.full_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
    [match[1], Date.now()]
  );
  return rows[0] || null;
}

// POST /submit
router.post("/submit", async function (req, res) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "You must be logged in" });

    const businessName = req.body.businessName;
    const category = req.body.category;
    const state = req.body.state;
    const city = req.body.city;
    const streetAddress = req.body.streetAddress;
    const zipCode = req.body.zipCode;
    const phone = req.body.phone;
    const website = req.body.website;

    if (!businessName || !category || !state || !city) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const validCategories = ["Groomers", "Trainers", "Boarding", "Vets", "Therapy"];
    if (validCategories.indexOf(category) === -1) {
      return res.status(400).json({ error: "Invalid category" });
    }

    if (!/^[A-Z]{2}$/.test(String(state).toUpperCase())) {
      return res.status(400).json({ error: "State must be a 2-letter code" });
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await pool.query(
      "INSERT INTO listing_submissions (id, user_id, business_name, category, state, city, street_address, zip_code, phone, website, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      [id, user.id, businessName, category, state.toUpperCase(), city, streetAddress || "", zipCode || "", phone || "", website || "", now]
    );

    res.status(201).json({
      success: true,
      id: id,
      message: "Submission received. We will review it within 24-48 hours.",
    });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: "Failed to submit listing" });
  }
});

// GET /
router.get("/", async function (req, res) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const [rows] = await pool.query(
      "SELECT id, business_name, category, state, city, status, created_at FROM listing_submissions WHERE user_id = ? ORDER BY created_at DESC",
      [user.id]
    );

    res.json({ submissions: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

export default router;

// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import authRoutes from "./routes/auth.js";
import listingRoutes from "./routes/listings.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Database pool
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(function (s) { return s.trim(); });

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/", function (req, res) {
  res.json({ status: "ok", service: "DogCareFinder API", time: new Date().toISOString() });
});

app.get("/health", async function (req, res) {
  try {
    const conn = await pool.getConnection();
    await conn.query("SELECT 1");
    conn.release();
    res.json({ status: "healthy", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);

// 404
app.use(function (req, res) {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(function (err, req, res, next) {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, function () {
  console.log("DogCareFinder API running on port " + PORT);
  console.log("Allowed origins: " + allowedOrigins.join(", "));
});

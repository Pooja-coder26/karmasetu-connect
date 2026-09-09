const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

/* =====================================================
   TEXTBEE
===================================================== */

const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;

if (!TEXTBEE_DEVICE_ID || !TEXTBEE_API_KEY) {
  console.log("WARNING: TextBee credentials are missing from .env");
} else {
  console.log("TextBee configuration loaded");
}

/* =====================================================
   OTP STORAGE
===================================================== */

const otpStore = new Map();

function normalizeIndianPhone(phone) {
  if (!phone || typeof phone !== "string") return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  let value = trimmed.replace(/[\s()-]/g, "");

  // If starts with +91 and 10 digits starting with 6-9
  if (/^\+91[6-9]\d{9}$/.test(value)) {
    return value;
  }

  // If starts with 91 and 10 digits starting with 6-9
  if (/^91[6-9]\d{9}$/.test(value)) {
    return "+" + value;
  }

  // If starts with 0 and 10 digits starting with 6-9
  if (/^0[6-9]\d{9}$/.test(value)) {
    return "+91" + value.slice(1);
  }

  // If exactly 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(value)) {
    return "+91" + value;
  }

  return null;
}

function normalizePhone(phone) {
  return normalizeIndianPhone(phone);
}

/* =====================================================
   ACTIVE OTP LOCKS & COOLDOWN (PREVENTS DUPLICATE SENDS)
===================================================== */

const activeOtpSendLocks = new Set();
const otpSendCooldownMap = new Map(); // normalizedPhone -> timestamp

function acquireOtpSendLock(phone) {
  const now = Date.now();
  const lastSent = otpSendCooldownMap.get(phone) || 0;

  if (activeOtpSendLocks.has(phone)) {
    return {
      allowed: false,
      reason: "An OTP request is already being processed. Please wait.",
    };
  }

  if (now - lastSent < 15000) {
    const waitSec = Math.ceil((15000 - (now - lastSent)) / 1000);
    return {
      allowed: false,
      reason: `Please wait ${waitSec}s before requesting another OTP.`,
    };
  }

  activeOtpSendLocks.add(phone);
  return { allowed: true };
}

function releaseOtpSendLock(phone, success = true) {
  activeOtpSendLocks.delete(phone);
  if (success) {
    otpSendCooldownMap.set(phone, Date.now());
  }
}

/* =====================================================
   LOGIN BRUTE-FORCE RATE LIMITER
===================================================== */

const failedLoginAttempts = new Map(); // identifier -> { count: number, lockedUntil: number }

function checkLoginRateLimit(identifier) {
  if (!identifier) return { allowed: true };
  const key = String(identifier).trim().toLowerCase();
  const record = failedLoginAttempts.get(key);
  if (!record) return { allowed: true };
  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      reason: `Too many failed login attempts. Please try again in ${remainingSec} seconds.`,
    };
  }
  if (record.lockedUntil && now >= record.lockedUntil) {
    failedLoginAttempts.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedLogin(identifier) {
  if (!identifier) return;
  const key = String(identifier).trim().toLowerCase();
  const now = Date.now();
  const record = failedLoginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = now + 60 * 1000; // 60s cooldown after 5 failed attempts
  }
  failedLoginAttempts.set(key, record);
}

function resetFailedLogin(identifier) {
  if (!identifier) return;
  const key = String(identifier).trim().toLowerCase();
  failedLoginAttempts.delete(key);
}

/* =====================================================
   SEND SMS USING TEXTBEE
===================================================== */

async function sendTextBeeSMS(phone, message) {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    throw new Error("Invalid phone number");
  }

  if (!TEXTBEE_DEVICE_ID || !TEXTBEE_API_KEY) {
    throw new Error(
      "TextBee Device ID or API Key is missing in .env"
    );
  }

  const url =
    `https://api.textbee.dev/api/v1/gateway/devices/` +
    `${TEXTBEE_DEVICE_ID}/send-sms`;

  // Explicitly pin SIM 1 ("Official" SIM) to prevent dual-SIM OnePlus phones from broadcasting over both SIMs
  const simSubscriptionId = Number(process.env.TEXTBEE_SIM_SUBSCRIPTION_ID || 1);

  try {
    const response = await axios.post(
      url,
      {
        recipients: [normalizedPhone],
        message: message,
        simSubscriptionId: simSubscriptionId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": TEXTBEE_API_KEY,
        },
        timeout: 30000,
      }
    );

    console.log(
      `TextBee SMS sent via SIM subscription ${simSubscriptionId}:`,
      normalizedPhone
    );

    return response.data;

  } catch (error) {
    console.log(
      "TextBee SMS Error:",
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Failed to send SMS"
    );
  }
}

/* =====================================================
   GENERATE OTP
===================================================== */

function generateOTP() {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

/* =====================================================
   MIDDLEWARE & SECURITY HEADERS
===================================================== */

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));

/* =====================================================
   AUTHENTICATION & AUTHORIZATION TOKENS (HMAC-SHA256)
===================================================== */

const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.JWT_SECRET ||
  "karmasetu-production-auth-secret-key-2026-secure";

function generateAuthToken(user) {
  const payload = {
    id: Number(user.id),
    role: String(user.role || "").toLowerCase(),
    name: user.name || "",
    email: user.email || null,
    phone: user.phone || null,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;

  try {
    const expectedSignature = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(encodedPayload)
      .digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader =
    req.headers["authorization"] || req.headers["x-auth-token"];

  let token = null;
  if (authHeader) {
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (typeof authHeader === "string") {
      token = authHeader.trim();
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // Check if user account is suspended
  db.query("SELECT status FROM users WHERE id = ?", [decoded.id], (statusErr, statusRows) => {
    if (statusErr) {
      console.error("Error verifying account status:", statusErr);
      return res.status(500).json({ message: "Database Error" });
    }

    if (statusRows && statusRows.length > 0 && String(statusRows[0].status || "").toUpperCase() === "SUSPENDED") {
      return res.status(403).json({ message: "Your account has been suspended by an administrator." });
    }

    req.user = decoded;
    next();
  });
}

function optionalAuthenticateToken(req, res, next) {
  const authHeader =
    req.headers["authorization"] || req.headers["x-auth-token"];

  let token = null;
  if (authHeader) {
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (typeof authHeader === "string") {
      token = authHeader.trim();
    }
  }

  if (token) {
    const decoded = verifyAuthToken(token);
    if (decoded) {
      db.query("SELECT status FROM users WHERE id = ?", [decoded.id], (statusErr, statusRows) => {
        if (!statusErr && statusRows && statusRows.length > 0 && String(statusRows[0].status || "").toUpperCase() === "SUSPENDED") {
          return next();
        }
        req.user = decoded;
        next();
      });
      return;
    }
  }

  next();
}

function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userRole = String(req.user.role || "").toLowerCase();
    const expected = String(requiredRole).toLowerCase();

    if (userRole !== expected) {
      return res.status(403).json({
        message: `Access denied: requires ${expected} role`,
      });
    }

    next();
  };
}

/* =====================================================
   HTTP SERVER
===================================================== */

const server = http.createServer(app);

/* =====================================================
   SOCKET.IO
===================================================== */

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE",
    ],
  },
});

/* =====================================================
   MYSQL
===================================================== */

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "karmasetu",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.query(`
  CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NOT NULL,
    reported_user_id INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    description TEXT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reports_reporter (reporter_id),
    INDEX idx_reports_reported (reported_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`, (err) => {
  if (err) console.error("Error ensuring reports table:", err);
});

db.query(`
  CREATE TABLE IF NOT EXISTS blocked_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    blocker_id INT NOT NULL,
    blocked_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_block (blocker_id, blocked_user_id),
    INDEX idx_blocked_users_blocker (blocker_id),
    INDEX idx_blocked_users_blocked (blocked_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`, (err) => {
  if (err) console.error("Error ensuring blocked_users table:", err);
});

// Ensure status and created_at columns exist on users table
db.query("SHOW COLUMNS FROM users LIKE 'status'", (err, rows) => {
  if (!err && (!rows || rows.length === 0)) {
    db.query("ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'", (altErr) => {
      if (altErr) console.error("Error adding status column to users:", altErr);
    });
  }
});

db.query("SHOW COLUMNS FROM users LIKE 'created_at'", (err, rows) => {
  if (!err && (!rows || rows.length === 0)) {
    db.query("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", (altErr) => {
      if (altErr) console.error("Error adding created_at column to users:", altErr);
    });
  }
});

// Seed admin if configured in .env and not already present
if (process.env.ADMIN_PASSWORD) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@karmasetu.com";
  db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1", async (err, rows) => {
    if (err) return console.error("Error checking admin user:", err);
    if (!rows || rows.length === 0) {
      try {
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        db.query(
          "INSERT INTO users (name, email, password, role, status, email_verified, phone_verified) VALUES (?, ?, ?, 'admin', 'ACTIVE', 1, 1)",
          ["KarmaSetu Administrator", adminEmail, hashedPassword],
          (insertErr) => {
            if (insertErr) console.error("Error seeding initial admin user:", insertErr);
            else console.log("Initial admin account seeded from environment configuration.");
          }
        );
      } catch (hashErr) {
        console.error("Error hashing admin password:", hashErr);
      }
    }
  });
}

const ALLOWED_REPORT_REASONS = [
  "Fake / suspicious account",
  "Wrong job information",
  "Harassment / inappropriate behaviour",
  "Payment issue",
  "Misconduct",
  "Other"
];

async function resolveBackendCoordinates(locationStr) {
  if (!locationStr) return null;
  const raw = String(locationStr).trim();
  if (!raw) return null;

  // Search queries ordered by specificity
  const queries = [
    // 1. Direct query scoped to India
    { q: raw, countrycodes: 'in' },
    // 2. Query with ', India' suffix
    { q: raw.toLowerCase().includes('india') ? raw : `${raw}, India` },
  ];

  // 3. If comma-separated (e.g. "Gauribidanur, Chikkaballapur, Karnataka")
  // Try first part + last part (e.g. "Gauribidanur, Karnataka")
  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 2) {
      queries.push({
        q: `${parts[0]}, ${parts[parts.length - 1]}`,
        countrycodes: 'in',
      });
    }
    if (parts.length >= 2) {
      queries.push({ q: parts[0], countrycodes: 'in' });
    }
  }

  // 4. Fallback: global query without country restriction
  queries.push({ q: raw });

  for (const item of queries) {
    try {
      let url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        item.q
      )}`;
      if (item.countrycodes) {
        url += `&countrycodes=${item.countrycodes}`;
      }
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'KarmaSetu-Backend/2.0',
          Accept: 'application/json',
        },
        timeout: 6000,
      });

      if (Array.isArray(res.data) && res.data.length > 0) {
        const lat = parseFloat(res.data[0].lat);
        const lng = parseFloat(res.data[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng };
        }
      }
    } catch (err) {
      // Continue to next query candidate
    }
  }

  return null;
}

function backfillJobCoordinates() {
  db.query("SELECT id, location, latitude, longitude FROM jobs", async (err, rows) => {
    if (err || !rows) return;
    for (const job of rows) {
      const lat = Number(job.latitude);
      const lng = Number(job.longitude);
      const loc = String(job.location || '').trim();
      const isInvalid =
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        (lat === 0 && lng === 0) ||
        (Math.abs(lat - 12.9716) < 0.0001 && Math.abs(lng - 77.5946) < 0.0001 && !loc.toLowerCase().includes("central"));

      if (isInvalid && loc) {
        const coords = await resolveBackendCoordinates(loc);
        if (coords) {
          db.query("UPDATE jobs SET latitude = ?, longitude = ? WHERE id = ?", [coords.lat, coords.lng, job.id], (uErr) => {
            if (!uErr) {
              console.log(`Backfilled job ${job.id} (${loc}) -> lat: ${coords.lat}, lng: ${coords.lng}`);
            }
          });
        }
      }
    }
  });
}

function ensureUserProfileColumns() {
  const query = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
  `;

  db.query(query, (err, rows) => {
    if (err || !rows) {
      console.log("Error checking users table schema:", err?.message || "Unknown error");
      return;
    }

    const existingCols = new Set(rows.map((r) => String(r.COLUMN_NAME).toLowerCase()));
    const neededCols = [
      { name: "profile_photo", type: "LONGTEXT NULL" },
      { name: "location", type: "VARCHAR(255) NULL" },
      { name: "skills", type: "TEXT NULL" },
      { name: "experience", type: "VARCHAR(100) NULL" },
      { name: "preferred_work_type", type: "VARCHAR(100) NULL" },
      { name: "company_name", type: "VARCHAR(255) NULL" },
    ];

    const missingCols = neededCols.filter(
      (col) => !existingCols.has(col.name.toLowerCase())
    );

    if (missingCols.length === 0) {
      console.log("Users table profile schema up to date");
      return;
    }

    missingCols.forEach((col) => {
      const alterSql = `ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`;
      db.query(alterSql, (alterErr) => {
        if (alterErr) {
          console.log(`Failed to add column ${col.name}:`, alterErr.message);
        } else {
          console.log(`Added missing column to users table: ${col.name}`);
        }
      });
    });
  });
}

function ensureJobStatusColumn() {
  const query = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'status'
  `;

  db.query(query, (err, rows) => {
    if (err || !rows) {
      console.log("Error checking jobs table schema:", err?.message || "Unknown error");
      return;
    }

    if (rows.length === 0) {
      const alterSql = "ALTER TABLE jobs ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'OPEN'";
      db.query(alterSql, (alterErr) => {
        if (alterErr) {
          console.log("Failed to add status column to jobs:", alterErr.message);
        } else {
          console.log("Added status column to jobs table");
          // Backfill: Only set jobs to HIRED when a valid hired application exists.
          const syncHiredSql = `
            UPDATE jobs j
            JOIN applications a ON j.id = a.job_id AND a.status = 'Hired'
            SET j.status = 'HIRED'
            WHERE j.status = 'OPEN'
          `;
          db.query(syncHiredSql, (syncErr) => {
            if (syncErr) console.log("Sync hired error:", syncErr.message);
            else console.log("Synchronized existing hired jobs status to HIRED");
          });
        }
      });
    } else {
      console.log("Jobs table status column up to date");
      // Backfill safe check: only set jobs to HIRED when a valid hired application exists and job is currently OPEN
      const syncHiredSql = `
        UPDATE jobs j
        JOIN applications a ON j.id = a.job_id AND a.status = 'Hired'
        SET j.status = 'HIRED'
        WHERE j.status = 'OPEN'
      `;
      db.query(syncHiredSql, (syncErr) => {
        if (syncErr) console.log("Sync hired error:", syncErr.message);
      });
    }
  });
}

db.getConnection((err, connection) => {
  if (err) {
    console.log(
      "MySQL Connection Error:",
      err
    );
  } else {
    connection.release();
    console.log("MySQL Connected");
    backfillJobCoordinates();
    ensureUserProfileColumns();
    ensureJobStatusColumn();
  }
});

/* =====================================================
   SOCKET CONNECTION
===================================================== */

io.on("connection", (socket) => {
  console.log(
    "Client connected:",
    socket.id
  );

  socket.on("disconnect", () => {
    console.log(
      "Client disconnected:",
      socket.id
    );
  });
});

/* =====================================================
   HOME
===================================================== */

app.get("/", (req, res) => {
  res.send("KarmaSetu Backend Running");
});

/* =====================================================
   SEND PHONE OTP
===================================================== */

app.post("/send-otp", async (req, res) => {
  const { phone } = req.body || {};

  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return res.status(400).json({
      success: false,
      message: "Phone number is required",
    });
  }

  const normalizedPhone = normalizeIndianPhone(phone);

  if (!normalizedPhone) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid 10-digit Indian phone number",
    });
  }

  const lock = acquireOtpSendLock(normalizedPhone);
  if (!lock.allowed) {
    return res.status(429).json({
      success: false,
      message: lock.reason,
    });
  }

  try {
    db.query(
      "SELECT id FROM users WHERE phone=?",
      [normalizedPhone],
      async (err, result) => {
        if (err) {
          console.log(err);
          releaseOtpSendLock(normalizedPhone, false);

          return res.status(500).json({
            success: false,
            message: "Database Error",
          });
        }

        if (result.length > 0) {
          releaseOtpSendLock(normalizedPhone, false);

          return res.status(400).json({
            success: false,
            message: "Phone number already registered",
          });
        }

        try {
          const otp = generateOTP();

          otpStore.set(
            `${normalizedPhone}:register`,
            {
              otp,
              expiresAt: Date.now() + 5 * 60 * 1000,
              verified: false,
            }
          );

          const message =
            `KarmaSetu Connect OTP: ${otp}. ` +
            `This OTP is valid for 5 minutes.`;

          await sendTextBeeSMS(
            normalizedPhone,
            message
          );

          releaseOtpSendLock(normalizedPhone, true);

          return res.json({
            success: true,
            message: "OTP sent successfully",
          });

        } catch (error) {
          releaseOtpSendLock(normalizedPhone, false);

          console.log(
            "OTP sending error:",
            error.message
          );

          return res.status(500).json({
            success: false,
            message:
              error.message ||
              "Failed to send OTP",
          });
        }
      }
    );

  } catch (error) {
    releaseOtpSendLock(normalizedPhone, false);
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
});

/* =====================================================
   VERIFY PHONE OTP
===================================================== */

app.post("/verify-otp", async (req, res) => {
  const {
    phone,
    code,
  } = req.body || {};

  if (!phone || typeof phone !== "string" || !phone.trim() || !code) {
    return res.status(400).json({
      success: false,
      message:
        "Phone number and OTP are required",
    });
  }

  const normalizedPhone =
    normalizeIndianPhone(phone);

  if (!normalizedPhone) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid 10-digit Indian phone number",
    });
  }

  const cleanedCode = String(code).trim();
  if (!/^\d{6}$/.test(cleanedCode)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid 6-digit OTP code",
    });
  }

  const otpData =
    otpStore.get(
      `${normalizedPhone}:register`
    );

  if (!otpData) {
    return res.status(400).json({
      success: false,
      message:
        "OTP not found. Please request a new OTP.",
    });
  }

  if (
    Date.now() >
    otpData.expiresAt
  ) {
    otpStore.delete(
      `${normalizedPhone}:register`
    );

    return res.status(400).json({
      success: false,
      message:
        "OTP expired. Please request a new OTP.",
    });
  }

  if (
    cleanedCode !==
    String(otpData.otp).trim()
  ) {
    otpData.attempts = (otpData.attempts || 0) + 1;
    if (otpData.attempts >= 5) {
      otpStore.delete(`${normalizedPhone}:register`);
      return res.status(400).json({
        success: false,
        message: "Too many failed attempts. This OTP has been invalidated. Please request a new OTP.",
      });
    }
    otpStore.set(`${normalizedPhone}:register`, otpData);
    return res.status(400).json({
      success: false,
      message: `Invalid OTP. ${5 - otpData.attempts} attempt(s) remaining.`,
    });
  }

  otpData.verified = true;

  otpStore.set(
    `${normalizedPhone}:register`,
    otpData
  );

  return res.json({
    success: true,
    message:
      "OTP verified successfully",
  });
});

/* =====================================================
   REGISTER
===================================================== */

app.post("/register", async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
    role,
    location,
    skills,
    experience,
    preferred_work_type,
    employer_type,
    company_name,
    profile_photo,
  } = req.body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName || trimmedName.length < 2) {
    return res.status(400).json({
      message: "Full Name is required and must be at least 2 characters long",
    });
  }

  const normalizedRole = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (!["worker", "employer"].includes(normalizedRole)) {
    return res.status(400).json({
      message: "Invalid role. Role must be 'worker' or 'employer'.",
    });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters long",
    });
  }

  if (!email && !phone) {
    return res.status(400).json({
      message: "Please enter phone number (or email)",
    });
  }

  // Validate optional or provided email format
  let cleanedEmail = null;
  if (email !== undefined && email !== null) {
    const trimmedEmail = String(email).trim().toLowerCase();
    if (trimmedEmail.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 100) {
        return res.status(400).json({ message: "Please provide a valid email address" });
      }
      cleanedEmail = trimmedEmail;
    }
  }

  try {
    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone || !/^\+91\d{10}$/.test(normalizedPhone)) {
        return res.status(400).json({
          message: "Invalid phone number format. Please provide a valid 10-digit Indian mobile number.",
        });
      }

      const otpData = otpStore.get(`${normalizedPhone}:register`);
      if (!otpData || !otpData.verified) {
        return res.status(400).json({
          message: "Please verify your phone number with OTP first",
        });
      }

      if (Date.now() > otpData.expiresAt) {
        otpStore.delete(`${normalizedPhone}:register`);
        return res.status(400).json({
          message: "OTP expired. Please verify again.",
        });
      }

      // Role-specific validation for phone registration
      const cleanedLocation = typeof location === "string" ? location.trim().slice(0, 255) : "";
      if (!cleanedLocation) {
        return res.status(400).json({ message: "Location / City is required" });
      }

      let cleanedSkills = null;
      let cleanedExperience = null;
      let cleanedPrefWork = null;
      let cleanedCompany = null;
      let cleanedPhoto = null;

      if (normalizedRole === "worker") {
        cleanedSkills = typeof skills === "string" ? skills.trim().slice(0, 1000) : "";
        if (!cleanedSkills) {
          return res.status(400).json({ message: "Skills / Trade is required for worker registration" });
        }
        cleanedExperience = typeof experience === "string" ? experience.trim().slice(0, 100) : "";
        if (!cleanedExperience) {
          return res.status(400).json({ message: "Experience level is required for worker registration" });
        }
        cleanedPrefWork = typeof preferred_work_type === "string" ? preferred_work_type.trim().slice(0, 100) : "";
        if (!cleanedPrefWork) {
          return res.status(400).json({ message: "Preferred work type is required for worker registration" });
        }
      } else if (normalizedRole === "employer") {
        const cleanedEmployerType = typeof employer_type === "string" ? employer_type.trim() : "";
        if (!cleanedEmployerType || !["Individual Employer", "Company / Organization"].includes(cleanedEmployerType)) {
          return res.status(400).json({
            message: "Employer Type is required ('Individual Employer' or 'Company / Organization')",
          });
        }

        if (cleanedEmployerType === "Company / Organization") {
          cleanedCompany = typeof company_name === "string" ? company_name.trim().slice(0, 255) : "";
          if (!cleanedCompany) {
            return res.status(400).json({
              message: "Company / Organization Name is required when Employer Type is Company / Organization",
            });
          }
        } else {
          cleanedCompany = null;
        }

        if (profile_photo && typeof profile_photo === "string" && profile_photo.trim().length > 0) {
          cleanedPhoto = profile_photo.trim();
          if (cleanedPhoto.length > 2 * 1024 * 1024) {
            return res.status(400).json({ message: "Company logo exceeds 2MB limit" });
          }
          const isAllowedScheme =
            /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(cleanedPhoto) ||
            /^https?:\/\//i.test(cleanedPhoto);
          if (!isAllowedScheme) {
            return res.status(400).json({
              message: "Invalid company logo format. Must be an image URL or base64 image.",
            });
          }
        }
      }

      // Check if phone number already exists
      const phoneCheck = await new Promise((resolve, reject) => {
        db.query("SELECT id FROM users WHERE phone = ?", [normalizedPhone], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });

      if (phoneCheck.length > 0) {
        return res.status(400).json({ message: "Phone number already registered" });
      }

      // Check if email already exists (if provided)
      if (cleanedEmail) {
        const emailCheck = await new Promise((resolve, reject) => {
          db.query("SELECT id FROM users WHERE email = ?", [cleanedEmail], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          });
        });

        if (emailCheck.length > 0) {
          return res.status(400).json({ message: "Email already registered" });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const sql = `
        INSERT INTO users
        (
          name,
          email,
          phone,
          password,
          role,
          email_verified,
          phone_verified,
          location,
          skills,
          experience,
          preferred_work_type,
          company_name,
          profile_photo
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        sql,
        [
          trimmedName,
          cleanedEmail,
          normalizedPhone,
          hashedPassword,
          normalizedRole,
          false,
          true,
          cleanedLocation,
          cleanedSkills,
          cleanedExperience,
          cleanedPrefWork,
          cleanedCompany,
          cleanedPhoto,
        ],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.log("Registration insert error:", insertErr);
            return res.status(500).json({ message: "Registration Failed" });
          }

          otpStore.delete(`${normalizedPhone}:register`);

          res.status(201).json({
            success: true,
            message: "Registration Successful",
            id: insertResult.insertId,
          });
        }
      );

      return;
    }

    // Legacy email registration flow (if only email provided)
    if (!cleanedEmail) {
      return res.status(400).json({ message: "Please enter a valid email address or phone number" });
    }

    const emailCheck = await new Promise((resolve, reject) => {
      db.query("SELECT id FROM users WHERE email = ?", [cleanedEmail], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    if (emailCheck.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Role-specific validation for email registration
    const cleanedLocationEmail = typeof location === "string" ? location.trim().slice(0, 255) : "";
    if (!cleanedLocationEmail) {
      return res.status(400).json({ message: "Location / City is required" });
    }

    let cleanedSkillsEmail = null;
    let cleanedExperienceEmail = null;
    let cleanedPrefWorkEmail = null;
    let cleanedCompanyEmail = null;
    let cleanedPhotoEmail = null;

    if (normalizedRole === "worker") {
      cleanedSkillsEmail = typeof skills === "string" ? skills.trim().slice(0, 1000) : "";
      if (!cleanedSkillsEmail) {
        return res.status(400).json({ message: "Skills / Trade is required for worker registration" });
      }
      cleanedExperienceEmail = typeof experience === "string" ? experience.trim().slice(0, 100) : "";
      if (!cleanedExperienceEmail) {
        return res.status(400).json({ message: "Experience level is required for worker registration" });
      }
      cleanedPrefWorkEmail = typeof preferred_work_type === "string" ? preferred_work_type.trim().slice(0, 100) : "";
      if (!cleanedPrefWorkEmail) {
        return res.status(400).json({ message: "Preferred work type is required for worker registration" });
      }
    } else if (normalizedRole === "employer") {
      const cleanedEmployerTypeEmail = typeof employer_type === "string" ? employer_type.trim() : "";
      if (!cleanedEmployerTypeEmail || !["Individual Employer", "Company / Organization"].includes(cleanedEmployerTypeEmail)) {
        return res.status(400).json({
          message: "Employer Type is required ('Individual Employer' or 'Company / Organization')",
        });
      }

      if (cleanedEmployerTypeEmail === "Company / Organization") {
        cleanedCompanyEmail = typeof company_name === "string" ? company_name.trim().slice(0, 255) : "";
        if (!cleanedCompanyEmail) {
          return res.status(400).json({
            message: "Company / Organization Name is required when Employer Type is Company / Organization",
          });
        }
      }

      if (profile_photo && typeof profile_photo === "string" && profile_photo.trim().length > 0) {
        cleanedPhotoEmail = profile_photo.trim();
        if (cleanedPhotoEmail.length > 2 * 1024 * 1024) {
          return res.status(400).json({ message: "Company logo exceeds 2MB limit" });
        }
        const isAllowedScheme =
          /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(cleanedPhotoEmail) ||
          /^https?:\/\//i.test(cleanedPhotoEmail);
        if (!isAllowedScheme) {
          return res.status(400).json({
            message: "Invalid company logo format. Must be an image URL or base64 image.",
          });
        }
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO users
      (
        name,
        email,
        phone,
        password,
        role,
        email_verified,
        phone_verified,
        location,
        skills,
        experience,
        preferred_work_type,
        company_name,
        profile_photo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        trimmedName,
        cleanedEmail,
        null,
        hashedPassword,
        normalizedRole,
        false,
        false,
        cleanedLocationEmail,
        cleanedSkillsEmail,
        cleanedExperienceEmail,
        cleanedPrefWorkEmail,
        cleanedCompanyEmail,
        cleanedPhotoEmail,
      ],
      (insertErr, insertResult) => {
        if (insertErr) {
          console.log("Registration insert error:", insertErr);
          return res.status(500).json({ message: "Registration Failed" });
        }

        res.status(201).json({
          success: true,
          message: "Registration Successful",
          id: insertResult.insertId,
        });
      }
    );
  } catch (error) {
    console.log("Registration error:", error);
    res.status(500).json({ message: "Registration Failed" });
  }
});

/* =====================================================
   LOGIN
===================================================== */

app.post("/login", (req, res) => {

  const {
    identifier,
    email,
    phone,
    password,
  } = req.body;

  let loginIdentifier =
    identifier ||
    email ||
    phone;

  if (
    !loginIdentifier ||
    !password
  ) {
    return res.status(400).json({
      message:
        "Email/Phone and password are required",
    });
  }

  if (
    /^\d{10}$/.test(
      String(loginIdentifier).trim()
    ) ||
    /^91\d{10}$/.test(
      String(loginIdentifier).trim()
    )
  ) {
    loginIdentifier =
      normalizePhone(
        loginIdentifier
      );
  }

  const rateLimitStatus = checkLoginRateLimit(loginIdentifier);
  if (!rateLimitStatus.allowed) {
    return res.status(429).json({
      message: rateLimitStatus.reason,
    });
  }

  const sql = `
    SELECT *
    FROM users
    WHERE email = ?
       OR phone = ?
    LIMIT 1
  `;

  db.query(
    sql,
    [
      loginIdentifier,
      loginIdentifier,
    ],
    async (err, result) => {

      if (err) {
        console.log(err);

        return res.status(500).json({
          message: "Database Error",
        });
      }

      if (result.length === 0) {
        recordFailedLogin(loginIdentifier);

        return res.status(401).json({
          message:
            "Invalid Email/Phone or Password",
        });
      }

      const user = result[0];

      try {

        const passwordValid =
          await bcrypt.compare(
            password,
            user.password
          );

        if (!passwordValid) {
          recordFailedLogin(loginIdentifier);

          return res.status(401).json({
            message:
              "Invalid Email/Phone or Password",
          });
        }

        if (user.status && String(user.status).toUpperCase() === "SUSPENDED") {
          return res.status(403).json({
            message: "Your account has been suspended by an administrator.",
          });
        }

        resetFailedLogin(loginIdentifier);

        const token = generateAuthToken(user);

        res.json({
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          token: token,
        });

      } catch (error) {

        console.log(
          "Login error:",
          error
        );

        res.status(500).json({
          message:
            "Login Failed",
        });
      }
    }
  );
});

/* =====================================================
   FORGOT PASSWORD - SEND OTP
===================================================== */

app.post(
  "/forgot-password/send-otp",
  async (req, res) => {
    const { phone } = req.body || {};

    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const normalizedPhone = normalizeIndianPhone(phone);

    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit Indian phone number",
      });
    }

    const lock = acquireOtpSendLock(normalizedPhone);
    if (!lock.allowed) {
      return res.status(429).json({
        success: false,
        message: lock.reason,
      });
    }

    try {
      db.query(
        "SELECT id FROM users WHERE phone=?",
        [normalizedPhone],
        async (err, result) => {
          if (err) {
            console.log(err);
            releaseOtpSendLock(normalizedPhone, false);

            return res.status(500).json({
              success: false,
              message: "Database Error",
            });
          }

          if (result.length === 0) {
            releaseOtpSendLock(normalizedPhone, false);

            return res.status(404).json({
              success: false,
              message: "No account found with this phone number",
            });
          }

          try {
            const otp = generateOTP();

            otpStore.set(
              `${normalizedPhone}:reset`,
              {
                otp,
                expiresAt: Date.now() + 5 * 60 * 1000,
                verified: false,
              }
            );

            const message =
              `KarmaSetu Connect password reset OTP: ${otp}. ` +
              `This OTP is valid for 5 minutes.`;

            await sendTextBeeSMS(
              normalizedPhone,
              message
            );

            releaseOtpSendLock(normalizedPhone, true);

            return res.json({
              success: true,
              message: "Password reset OTP sent",
            });

          } catch (error) {
            releaseOtpSendLock(normalizedPhone, false);

            console.log(
              "Reset OTP error:",
              error.message
            );

            return res.status(500).json({
              success: false,
              message:
                error.message ||
                "Failed to send OTP",
            });
          }
        }
      );
    } catch (error) {
      releaseOtpSendLock(normalizedPhone, false);
      console.log(error);

      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }
  }
);

/* =====================================================
   RESET PASSWORD
===================================================== */

app.post(
  "/forgot-password/reset",
  async (req, res) => {

    const {
      phone,
      code,
      newPassword,
    } = req.body;

    if (
      !phone ||
      !code ||
      !newPassword
    ) {
      return res.status(400).json({
        message:
          "Phone, OTP and new password are required",
      });
    }

    const normalizedPhone =
      normalizePhone(phone);

    if (!normalizedPhone || !/^\+91\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({
        message: "Invalid phone number format. Please provide a valid 10-digit Indian mobile number.",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long.",
      });
    }

    const otpData =
      otpStore.get(
        `${normalizedPhone}:reset`
      );

    if (!otpData) {
      return res.status(400).json({
        message:
          "OTP not found. Please request a new OTP.",
      });
    }

    if (
      Date.now() >
      otpData.expiresAt
    ) {
      otpStore.delete(
        `${normalizedPhone}:reset`
      );

      return res.status(400).json({
        message:
          "OTP expired",
        });
    }

    if (
      String(code).trim() !==
      String(otpData.otp)
    ) {
      otpData.attempts = (otpData.attempts || 0) + 1;
      if (otpData.attempts >= 5) {
        otpStore.delete(`${normalizedPhone}:reset`);
        return res.status(400).json({
          message: "Too many failed OTP attempts. This OTP has been invalidated. Please request a new OTP.",
        });
      }

      return res.status(400).json({
        message:
          "Invalid or expired OTP",
      });
    }

    try {

      const hashedPassword =
        await bcrypt.hash(
          newPassword,
          10
        );

      db.query(
        `
        UPDATE users
        SET password=?,
            phone_verified=TRUE
        WHERE phone=?
        `,
        [
          hashedPassword,
          normalizedPhone,
        ],
        (err, result) => {

          if (err) {
            console.log(err);

            return res.status(500).json({
              message:
                "Password update failed",
            });
          }

          if (
            result.affectedRows === 0
          ) {
            return res.status(404).json({
              message:
                "User not found",
            });
          }

          otpStore.delete(
            `${normalizedPhone}:reset`
          );

          res.json({
            success: true,
            message:
              "Password reset successfully",
          });
        }
      );

    } catch (error) {

      console.log(
        "Password reset error:",
        error.message
      );

      res.status(500).json({
        message:
          "Password reset failed",
      });
    }
  }
);

/* =====================================================
   ADD JOB
   MAP FIX: SAVE LATITUDE + LONGITUDE
===================================================== */

app.post("/add-job", authenticateToken, requireRole("employer"), async (req, res) => {

  const {
    title,
    work_type,
    description,
    wage,
    location,
    latitude,
    longitude,
  } = req.body;

  const employer_id = req.user.id;
  const numericWage = Number(wage);

  if (
    !title ||
    !String(title).trim() ||
    !description ||
    !String(description).trim() ||
    !numericWage ||
    isNaN(numericWage) ||
    numericWage <= 0 ||
    !location ||
    !String(location).trim()
  ) {
    return res.status(400).send(
      "Please fill all job details with valid values"
    );
  }

  let assignedWorkType = typeof work_type === 'string' && work_type.trim() ? work_type.trim() : '';

  if (!assignedWorkType && title) {
    const lowerTitle = String(title).toLowerCase();
    if (lowerTitle.includes('construct')) assignedWorkType = 'Construction';
    else if (lowerTitle.includes('plumb')) assignedWorkType = 'Plumbing';
    else if (lowerTitle.includes('electr')) assignedWorkType = 'Electrical';
    else if (lowerTitle.includes('paint')) assignedWorkType = 'Painting';
    else if (lowerTitle.includes('clean')) assignedWorkType = 'Cleaning';
    else if (lowerTitle.includes('garden')) assignedWorkType = 'Gardening';
    else if (lowerTitle.includes('driver') || lowerTitle.includes('driving')) assignedWorkType = 'Driver';
    else if (lowerTitle.includes('carpent')) assignedWorkType = 'Carpentry';
    else if (lowerTitle.includes('cook')) assignedWorkType = 'Cooking';
    else if (lowerTitle.includes('daily wage') || lowerTitle.includes('wage')) assignedWorkType = 'Any Daily Wage Work';
  }

  const rawDesc = String(description || '').trim();
  const finalDescription = assignedWorkType && !rawDesc.includes('Work Type:')
    ? `Work Type: ${assignedWorkType}\n${rawDesc}`.trim()
    : rawDesc;

  let finalLatitude = Number(latitude);
  let finalLongitude = Number(longitude);

  const isValidCoords =
    Number.isFinite(finalLatitude) &&
    Number.isFinite(finalLongitude) &&
    !(finalLatitude === 0 && finalLongitude === 0);

  if (!isValidCoords) {
    const resolved = await resolveBackendCoordinates(location);
    if (resolved) {
      finalLatitude = resolved.lat;
      finalLongitude = resolved.lng;
    }
  }

  if (
    !Number.isFinite(finalLatitude) ||
    !Number.isFinite(finalLongitude) ||
    (finalLatitude === 0 && finalLongitude === 0)
  ) {
    return res.status(400).send(
      `Could not determine coordinates for location "${location}". Please enter a valid city, town, village, or address in India.`
    );
  }

  console.log("POSTED LOCATION:", location);
  console.log("LATITUDE SAVED:", finalLatitude);
  console.log("LONGITUDE SAVED:", finalLongitude);

  const sql = `
    INSERT INTO jobs
    (
      title,
      description,
      wage,
      location,
      latitude,
      longitude,
      employer_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      title,
      finalDescription,
      wage,
      location,
      finalLatitude,
      finalLongitude,
      employer_id,
    ],
    (err, result) => {

      if (err) {
        console.log(
          "Job insert error:",
          err
        );

        return res.status(500).send(
          "Database Error"
        );
      }

      const jobId =
        result.insertId;

      console.log(
        "Job created:",
        title,
        "ID:",
        jobId
      );

      /* NEW JOB EVENT WITH COORDINATES */

      io.emit("jobAdded", {
        id: jobId,
        job_id: jobId,
        title,
        work_type: assignedWorkType || null,
        description: finalDescription,
        wage,
        location,
        latitude: finalLatitude,
        longitude: finalLongitude,
        employer_id,
        employer_name: req.user?.name || "Employer",
      });

      const workerSql =
        "SELECT id FROM users WHERE role='worker'";

      db.query(
        workerSql,
        (workerErr, workers) => {

          if (workerErr) {
            console.log(
              "Worker notification error:",
              workerErr
            );
          }

          if (
            !workerErr &&
            workers.length > 0
          ) {

            workers.forEach(
              (worker) => {

                const notificationSql = `
                  INSERT INTO notifications
                  (
                    user_id,
                    type,
                    title,
                    message,
                    job_id,
                    is_read
                  )
                  VALUES (?, ?, ?, ?, ?, ?)
                `;

                const notificationMessage =
                  `${title} • 📍 ${location} • ₹${wage}/day`;

                db.query(
                  notificationSql,
                  [
                    worker.id,
                    "job",
                    "New Job Posted",
                    notificationMessage,
                    jobId,
                    false,
                  ],
                  (notificationErr, notificationResult) => {

                    if (notificationErr) {
                      console.log(
                        "Notification insert error:",
                        notificationErr
                      );
                    }

                    const insertedNotificationId =
                      notificationResult?.insertId || null;

                    io.emit(
                      "jobNotification",
                      {
                        user_id: worker.id,
                        notification: {
                          id: insertedNotificationId,
                          type: "job",
                          title: "New Job Posted",
                          message: notificationMessage,
                          job_id: jobId,
                          is_read: false,
                          created_at: new Date(),
                        },
                      }
                    );
                  }
                );
              }
            );
          }

          res.json({
            success: true,
            message:
              "Job Added Successfully",
            job: {
              id: jobId,
              job_id: jobId,
              title,
              work_type: assignedWorkType || null,
              description: finalDescription,
              wage,
              location,
              latitude: finalLatitude,
              longitude: finalLongitude,
              employer_id,
            },
          });
        }
      );
    }
  );
});

/* =====================================================
   GET JOBS (ONLY UNCLAIMED / UNAPPLIED JOBS)
===================================================== */

app.get("/jobs", optionalAuthenticateToken, (req, res) => {
  const currentWorkerId = req.user?.id ? String(req.user.id) : null;

  let sql = `
    SELECT 
      jobs.*,
      COALESCE(users.name, 'Employer') AS employer_name
    FROM jobs
    LEFT JOIN users ON CAST(jobs.employer_id AS CHAR) = CAST(users.id AS CHAR)
    WHERE (jobs.status IS NULL OR jobs.status = 'OPEN')
      AND NOT EXISTS (
        SELECT 1 FROM applications
        WHERE applications.job_id = jobs.id
          AND applications.status IN ('Pending', 'Hired')
      )
  `;

  const params = [];

  if (currentWorkerId) {
    sql += `
      AND NOT EXISTS (
        SELECT 1 FROM applications
        WHERE applications.job_id = jobs.id
          AND applications.worker_id = ?
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users
        WHERE (blocker_id = ? AND CAST(blocked_user_id AS CHAR) = CAST(jobs.employer_id AS CHAR))
           OR (CAST(blocker_id AS CHAR) = CAST(jobs.employer_id AS CHAR) AND blocked_user_id = ?)
      )
    `;
    params.push(currentWorkerId, currentWorkerId, currentWorkerId);
  }

  sql += ` ORDER BY jobs.id DESC`;

  db.query(sql, params, (err, result) => {

      if (err) {
        console.log(err);

        return res.status(500).send(
          "Database Error"
        );
      }

      const formattedJobs = (result || []).map((job) => {
        const lat =
          job.latitude !== null && job.latitude !== undefined && job.latitude !== ""
            ? Number(job.latitude)
            : null;

        const lng =
          job.longitude !== null && job.longitude !== undefined && job.longitude !== ""
            ? Number(job.longitude)
            : null;

        console.log(
          "LATITUDE RETURNED FROM /jobs:",
          job.id,
          job.location,
          lat
        );
        console.log(
          "LONGITUDE RETURNED FROM /jobs:",
          job.id,
          job.location,
          lng
        );

        let work_type = null;
        if (job.description) {
          const match = String(job.description).match(/Work Type:\s*([^\n\r]+)/i);
          if (match) {
            work_type = match[1].trim();
          }
        }
        if (!work_type && job.title) {
          const lowerTitle = String(job.title).toLowerCase();
          if (lowerTitle.includes('construct')) work_type = 'Construction';
          else if (lowerTitle.includes('plumb')) work_type = 'Plumbing';
          else if (lowerTitle.includes('electr')) work_type = 'Electrical';
          else if (lowerTitle.includes('paint')) work_type = 'Painting';
          else if (lowerTitle.includes('clean')) work_type = 'Cleaning';
          else if (lowerTitle.includes('garden')) work_type = 'Gardening';
          else if (lowerTitle.includes('driver') || lowerTitle.includes('driving')) work_type = 'Driver';
          else if (lowerTitle.includes('carpent')) work_type = 'Carpentry';
          else if (lowerTitle.includes('cook')) work_type = 'Cooking';
          else if (lowerTitle.includes('daily wage') || lowerTitle.includes('wage')) work_type = 'Any Daily Wage Work';
        }

        return {
          ...job,
          work_type: work_type || null,
          latitude: lat,
          longitude: lng,
        };
      });

      res.json(formattedJobs);
    }
  );
});

/* =====================================================
   GET JOBS FOR LOGGED-IN EMPLOYER
===================================================== */

app.get("/my-jobs/:employerId", authenticateToken, requireRole("employer"), (req, res) => {

  const employerId = Number(req.params.employerId);

  if (!employerId || isNaN(employerId) || employerId <= 0) {
    return res.status(400).json({
      message: "Invalid employer ID",
    });
  }

  if (Number(employerId) !== Number(req.user.id)) {
    return res.status(403).json({
      message: "Access denied: you can only view your own jobs",
    });
  }

  const cleanEmployerId = req.user.id;

  const sql = `
    SELECT 
      jobs.*,
      CAST(COALESCE(COUNT(applications.id), 0) AS UNSIGNED) AS total_applications,
      CAST(COALESCE(SUM(CASE WHEN applications.status = 'Pending' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS pending_applications,
      CAST(COALESCE(SUM(CASE WHEN applications.status = 'Hired' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS accepted_applications
    FROM jobs
    LEFT JOIN applications ON applications.job_id = jobs.id
    WHERE jobs.employer_id = ?
    GROUP BY jobs.id
    ORDER BY jobs.id DESC
  `;

  db.query(
    sql,
    [cleanEmployerId],
    (err, result) => {

      if (err) {
        console.error(
          "My Jobs Error:",
          err
        );

        return res.status(500).json({
          message: "Database Error",
        });
      }

      const formatted = (result || []).map((row) => ({
        ...row,
        total_applications: Number(row.total_applications || 0),
        pending_applications: Number(row.pending_applications || 0),
        accepted_applications: Number(row.accepted_applications || 0),
      }));

      res.json(formatted);
    }
  );
});

/* =====================================================
   GET EMPLOYER DASHBOARD OVERALL STATISTICS
===================================================== */

app.get("/employer-stats/:employerId", authenticateToken, requireRole("employer"), (req, res) => {
  const employerId = Number(req.params.employerId);

  if (!employerId || isNaN(employerId) || employerId <= 0) {
    return res.status(400).json({
      message: "Invalid employer ID",
    });
  }

  if (Number(employerId) !== Number(req.user.id)) {
    return res.status(403).json({
      message: "Access denied: you can only view your own stats",
    });
  }

  const cleanEmployerId = req.user.id;

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM jobs WHERE employer_id = ?) AS jobsPosted,
      COUNT(applications.id) AS totalApplications,
      CAST(COALESCE(SUM(CASE WHEN applications.status = 'Pending' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS pendingApplications,
      CAST(COALESCE(SUM(CASE WHEN applications.status = 'Hired' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS acceptedApplications
    FROM applications
    JOIN jobs ON applications.job_id = jobs.id
    WHERE jobs.employer_id = ?
  `;

  db.query(sql, [cleanEmployerId, cleanEmployerId], (err, rows) => {
    if (err) {
      console.error("Employer stats error:", err);
      return res.status(500).json({
        message: "Database Error",
      });
    }

    const row = rows && rows[0] ? rows[0] : {};
    res.json({
      jobsPosted: Number(row.jobsPosted || 0),
      totalApplications: Number(row.totalApplications || 0),
      pendingApplications: Number(row.pendingApplications || 0),
      acceptedApplications: Number(row.acceptedApplications || 0),
    });
  });
});

/* =====================================================
   JOB APPLICATION CONCURRENCY LOCK
   Guarantees strict sequential handling for concurrent apply requests
===================================================== */

const jobApplyLocks = new Map();

function acquireJobLock(jobId) {
  const id = Number(jobId);
  const current = jobApplyLocks.get(id) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  jobApplyLocks.set(
    id,
    current.then(() => next)
  );
  return current.then(() => () => {
    if (jobApplyLocks.get(id) === next) {
      jobApplyLocks.delete(id);
    }
    release();
  });
}

/* =====================================================
   APPLY JOB (SAFE AGAINST RACE CONDITIONS - ONLY 1 WORKER PER JOB)
===================================================== */

app.post("/apply-job", authenticateToken, requireRole("worker"), async (req, res) => {
  const {
    worker_name,
    job_id,
  } = req.body;

  const parsedJobId = Number(job_id);
  const cleanWorkerId = String(req.user.id);
  const cleanWorkerName =
    req.user.name ||
    (worker_name !== undefined && worker_name !== null
      ? String(worker_name).trim()
      : "Worker");

  if (!parsedJobId || isNaN(parsedJobId) || parsedJobId <= 0) {
    return res.status(400).send("Invalid application request: valid job_id is required.");
  }

  const releaseLock = await acquireJobLock(parsedJobId);

  try {
    // 1. Verify job exists and check status
    const jobExists = await new Promise((resolve, reject) => {
      db.query(
        "SELECT id, employer_id, title, status FROM jobs WHERE id = ?",
        [parsedJobId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    if (jobExists.length === 0) {
      return res.status(404).send("Job not found.");
    }

    const jobInfo = jobExists[0];
    const currentJobStatus = String(jobInfo.status || "OPEN").toUpperCase();

    if (currentJobStatus === "COMPLETED") {
      return res.status(400).send("Job has already been marked as completed.");
    }

    if (currentJobStatus === "HIRED") {
      return res.status(400).send("A worker has already been hired for this job.");
    }

    if (currentJobStatus === "RESERVED") {
      return res.status(409).send("Job is no longer available. Another worker has already applied.");
    }

    if (currentJobStatus === "DISABLED") {
      return res.status(400).send("Job has been disabled by an administrator and cannot be applied to.");
    }

    if (Number(jobInfo.employer_id) === Number(req.user.id)) {
      return res.status(400).send("You cannot apply to your own job.");
    }

    // Check if worker blocked employer OR employer blocked worker
    const blockCheck = await new Promise((resolve, reject) => {
      db.query(
        "SELECT id FROM blocked_users WHERE (blocker_id = ? AND CAST(blocked_user_id AS CHAR) = CAST(? AS CHAR)) OR (CAST(blocker_id AS CHAR) = CAST(? AS CHAR) AND blocked_user_id = ?) LIMIT 1",
        [cleanWorkerId, jobInfo.employer_id, jobInfo.employer_id, cleanWorkerId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    if (blockCheck.length > 0) {
      return res.status(403).send("Cannot apply: Interaction is blocked between you and this employer.");
    }

    // 2. Check if this worker has already applied for this job
    const existingWorkerApps = await new Promise((resolve, reject) => {
      db.query(
        "SELECT id, status FROM applications WHERE job_id = ? AND worker_id = ? LIMIT 1",
        [parsedJobId, cleanWorkerId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    if (existingWorkerApps.length > 0) {
      return res.status(400).send("You have already applied for this job.");
    }

    // 3. Check if any active application (Pending or Hired) already exists for this job
    const activeApps = await new Promise((resolve, reject) => {
      db.query(
        "SELECT id, worker_id, status FROM applications WHERE job_id = ? AND status IN ('Pending', 'Hired') LIMIT 1",
        [parsedJobId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    if (activeApps.length > 0) {
      return res.status(409).send("Job is no longer available. Another worker has already applied.");
    }

    // 4. Atomically reserve the job (status -> RESERVED)
    const reserveResult = await new Promise((resolve, reject) => {
      db.query(
        "UPDATE jobs SET status = 'RESERVED' WHERE id = ? AND (status IS NULL OR status = 'OPEN')",
        [parsedJobId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    if (!reserveResult || reserveResult.affectedRows === 0) {
      return res.status(409).send("Job is no longer available. Another worker has already applied.");
    }

    // 5. Insert application record with status 'Pending'
    // If insertion encounters an error, rollback job status to OPEN
    let insertResult;
    try {
      insertResult = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO applications (worker_id, worker_name, job_id, status)
          VALUES (?, ?, ?, 'Pending')
        `;
        db.query(
          sql,
          [cleanWorkerId, cleanWorkerName, parsedJobId],
          (err, result) => {
            if (err) return reject(err);
            resolve(result);
          }
        );
      });
    } catch (insertError) {
      // Rollback job reservation so the job is not left as RESERVED without an application
      await new Promise((resolve) => {
        db.query(
          "UPDATE jobs SET status = 'OPEN' WHERE id = ? AND status = 'RESERVED'",
          [parsedJobId],
          () => resolve()
        );
      });
      throw insertError;
    }

    const applicationId = insertResult.insertId;

    // 6. Emit real-time socket events
    io.emit("applicationAdded", {
      application_id: applicationId,
      worker_id: cleanWorkerId,
      worker_name: cleanWorkerName,
      job_id: parsedJobId,
      status: "Pending",
    });

    io.emit("jobClaimed", {
      job_id: parsedJobId,
    });

    io.emit("jobStatusUpdated", {
      job_id: parsedJobId,
      status: "RESERVED",
    });

    // 7. Send notification to employer
    const employerId = jobInfo.employer_id;
    const jobTitle = jobInfo.title;
    const message = `${cleanWorkerName} applied for ${jobTitle}`;

    const notificationSql = `
      INSERT INTO notifications
      (
        user_id,
        type,
        title,
        message,
        job_id,
        application_id,
        is_read
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      notificationSql,
      [
        employerId,
        "application",
        "New Application",
        message,
        parsedJobId,
        applicationId,
        false,
      ],
      (notificationErr, notificationResult) => {
        if (notificationErr) {
          console.log(
            "Application notification error:",
            notificationErr
          );
        }

        const insertedNotificationId =
          notificationResult?.insertId || null;

        io.emit("applicationNotification", {
          user_id: employerId,
          notification: {
            id: insertedNotificationId,
            type: "application",
            title: "New Application",
            message,
            job_id: parsedJobId,
            application_id: applicationId,
            is_read: false,
            created_at: new Date(),
          },
        });
      }
    );

    return res.status(200).send("Application Submitted");

  } catch (error) {
    console.error("Apply job error:", error);
    return res.status(500).send("Database Error");
  } finally {
    releaseLock();
  }
});

/* =====================================================
   GET APPLICATIONS FOR JOB
===================================================== */

app.get(
  "/applications/:jobId",
  authenticateToken,
  requireRole("employer"),
  (req, res) => {
    const jobId = Number(req.params.jobId);

    if (!jobId || isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({ message: "Invalid job ID" });
    }

    db.query("SELECT id, employer_id FROM jobs WHERE id = ?", [jobId], (err, rows) => {
      if (err) {
        console.log("Job check error:", err);
        return res.status(500).send("Database Error");
      }

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Job not found" });
      }

      const job = rows[0];
      if (Number(job.employer_id) !== Number(req.user.id)) {
        return res.status(403).json({ message: "Access denied: you do not own this job" });
      }

      const sql = `
        SELECT
          applications.id,
          applications.worker_id,
          applications.worker_name,
          applications.status,
          applications.job_id,
          jobs.title
        FROM applications
        JOIN jobs
          ON applications.job_id =
             jobs.id
        WHERE applications.job_id = ?
      `;

      db.query(
        sql,
        [jobId],
        (appErr, result) => {
          if (appErr) {
            console.log(appErr);
            return res.status(500).send("Database Error");
          }

          res.json(result);
        }
      );
    });
  }
);

/* =====================================================
   HIRE WORKER
===================================================== */

app.put(
  "/hire-worker/:id",
  authenticateToken,
  requireRole("employer"),
  (req, res) => {

    const id = Number(req.params.id);

    if (!id || isNaN(id) || id <= 0) {
      return res.status(400).send("Invalid application ID");
    }

    const applicationSql = `
      SELECT
        applications.id,
        applications.worker_id,
        applications.worker_name,
        applications.status AS app_status,
        applications.job_id,
        jobs.employer_id,
        jobs.title AS job_title
      FROM applications
      JOIN jobs
        ON applications.job_id =
           jobs.id
      WHERE applications.id = ?
    `;

    db.query(
      applicationSql,
      [id],
      (
        applicationErr,
        applicationResult
      ) => {

        if (applicationErr) {
          console.log(
            applicationErr
          );

          return res.status(500).send(
            "Database Error"
          );
        }

        if (
          !applicationResult ||
          applicationResult.length === 0
        ) {
          return res.status(404).send(
            "Application not found"
          );
        }

        const application =
          applicationResult[0];

        if (Number(application.employer_id) !== Number(req.user.id)) {
          return res.status(403).send(
            "Access denied: you do not own the job for this application"
          );
        }

        if (application.app_status !== "Pending") {
          return res.status(400).send(
            "Only pending applications can be hired"
          );
        }

        const updateSql = `
          UPDATE applications
          SET status='Hired'
          WHERE id=?
        `;

        db.query(
          updateSql,
          [id],
          (err) => {

            if (err) {
              console.log(err);

              return res.status(500).send(
                "Database Error"
              );
            }

            // Synchronize jobs table status to HIRED
            db.query(
              "UPDATE jobs SET status = 'HIRED' WHERE id = ?",
              [application.job_id],
              (jobStatusErr) => {
                if (jobStatusErr) {
                  console.log("Error updating job status to HIRED:", jobStatusErr);
                } else {
                  io.emit("jobStatusUpdated", {
                    job_id: application.job_id,
                    status: "HIRED",
                  });
                }

                const message =
                  `You have been hired for ${application.job_title}`;

                const notificationSql = `
                  INSERT INTO notifications
                  (
                    user_id,
                    type,
                    title,
                    message,
                    job_id,
                    application_id,
                    is_read
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;

                db.query(
                  notificationSql,
                  [
                    application.worker_id,
                    "hired",
                    "You Are Hired!",
                    message,
                    application.job_id,
                    application.id,
                    false,
                  ],
                  (notificationErr, notificationResult) => {

                    if (
                      notificationErr
                    ) {
                      console.log(
                        "Hiring notification error:",
                        notificationErr
                      );
                    }

                    const insertedNotificationId =
                      notificationResult?.insertId || null;

                    io.emit(
                      "hiredNotification",
                      {
                        user_id:
                          application.worker_id,
                        notification: {
                          id: insertedNotificationId,
                          type:
                            "hired",
                          title:
                            "You Are Hired!",
                          message,
                          job_id:
                            application.job_id,
                          application_id:
                            application.id,
                          is_read:
                            false,
                          created_at:
                            new Date(),
                        },
                      }
                    );

                    io.emit(
                      "workerHired",
                      {
                        applicationId:
                          application.id,
                        worker_id:
                          application.worker_id,
                        worker_name:
                          application.worker_name,
                        job_id:
                          application.job_id,
                        job_title:
                          application.job_title,
                        status:
                          "Hired",
                      }
                    );

                    io.emit(
                      "applicationStatusUpdated",
                      {
                        applicationId: application.id,
                        application_id: application.id,
                        worker_id: application.worker_id,
                        job_id: application.job_id,
                        status: "Hired",
                      }
                    );

                    res.send(
                      "Worker Hired Successfully"
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  }
);

/* =====================================================
   REJECT WORKER & REOPEN JOB
===================================================== */

app.put(
  "/reject-worker/:id",
  authenticateToken,
  requireRole("employer"),
  (req, res) => {
    const id = Number(req.params.id);

    if (!id || isNaN(id) || id <= 0) {
      return res.status(400).send("Invalid application ID");
    }

    const applicationSql = `
      SELECT
        applications.id,
        applications.worker_id,
        applications.worker_name,
        applications.status AS app_status,
        applications.job_id,
        jobs.employer_id,
        jobs.title AS job_title
      FROM applications
      JOIN jobs ON applications.job_id = jobs.id
      WHERE applications.id = ?
    `;

    db.query(applicationSql, [id], (applicationErr, applicationResult) => {
      if (applicationErr) {
        console.error("Error finding application for reject:", applicationErr);
        return res.status(500).send("Database Error");
      }

      if (!applicationResult || applicationResult.length === 0) {
        return res.status(404).send("Application not found");
      }

      const application = applicationResult[0];

      if (Number(application.employer_id) !== Number(req.user.id)) {
        return res.status(403).send("Access denied: you do not own the job for this application");
      }

      if (application.app_status !== "Pending") {
        return res.status(400).send("Only pending applications can be rejected");
      }

      // 1. Update application status to 'Rejected'
      db.query("UPDATE applications SET status = 'Rejected' WHERE id = ?", [id], (upAppErr) => {
        if (upAppErr) {
          console.error("Error updating application to Rejected:", upAppErr);
          return res.status(500).send("Database Error");
        }

        // 2. Reopen the job: status -> 'OPEN'
        db.query("UPDATE jobs SET status = 'OPEN' WHERE id = ?", [application.job_id], (upJobErr) => {
          if (upJobErr) {
            console.error("Error reopening job:", upJobErr);
          }

          // 3. Emit real-time events:
          // jobReopened triggers workers' FindJobs & Map refresh
          io.emit("jobReopened", {
            job_id: application.job_id,
          });

          io.emit("jobStatusUpdated", {
            job_id: application.job_id,
            status: "OPEN",
          });

          io.emit("workerRejected", {
            applicationId: application.id,
            worker_id: application.worker_id,
            job_id: application.job_id,
            status: "Rejected",
          });

          io.emit("applicationStatusUpdated", {
            applicationId: application.id,
            application_id: application.id,
            worker_id: application.worker_id,
            job_id: application.job_id,
            status: "Rejected",
          });

          // 4. Send notification to rejected worker
          const notifMessage = `Your application for "${application.job_title}" was not selected. The job has been reopened.`;
          const notifSql = `
            INSERT INTO notifications (user_id, type, title, message, job_id, application_id, is_read)
            VALUES (?, 'rejected', 'Application Update', ?, ?, ?, false)
          `;

          db.query(
            notifSql,
            [application.worker_id, notifMessage, application.job_id, application.id],
            (notifErr, notifResult) => {
              if (notifErr) {
                console.error("Notification error on reject:", notifErr);
              }

              const insertedNotificationId = notifResult?.insertId || null;
              io.emit("applicationNotification", {
                user_id: application.worker_id,
                notification: {
                  id: insertedNotificationId,
                  type: "rejected",
                  title: "Application Update",
                  message: notifMessage,
                  job_id: application.job_id,
                  application_id: application.id,
                  is_read: false,
                  created_at: new Date(),
                },
              });
            }
          );

          return res.status(200).send("Applicant rejected and job reopened successfully");
        });
      });
    });
  }
);

/* =====================================================
   MARK NO SHOW & REOPEN JOB
===================================================== */

app.put(
  "/mark-noshow/:id",
  authenticateToken,
  requireRole("employer"),
  (req, res) => {
    const id = Number(req.params.id);

    if (!id || isNaN(id) || id <= 0) {
      return res.status(400).send("Invalid application ID");
    }

    const applicationSql = `
      SELECT
        applications.id,
        applications.worker_id,
        applications.worker_name,
        applications.status AS app_status,
        applications.job_id,
        jobs.employer_id,
        jobs.title AS job_title
      FROM applications
      JOIN jobs ON applications.job_id = jobs.id
      WHERE applications.id = ?
    `;

    db.query(applicationSql, [id], (applicationErr, applicationResult) => {
      if (applicationErr) {
        console.error("Error finding application for mark-noshow:", applicationErr);
        return res.status(500).send("Database Error");
      }

      if (!applicationResult || applicationResult.length === 0) {
        return res.status(404).send("Application not found");
      }

      const application = applicationResult[0];

      if (Number(application.employer_id) !== Number(req.user.id)) {
        return res.status(403).send("Access denied: you do not own the job for this application");
      }

      if (application.app_status !== "Hired") {
        return res.status(400).send("Only a hired application can be marked as No-Show");
      }

      // 1. Update application status to 'NO_SHOW' atomically ensuring it was Hired
      db.query("UPDATE applications SET status = 'NO_SHOW' WHERE id = ? AND status = 'Hired'", [id], (upAppErr, upAppRes) => {
        if (upAppErr) {
          console.error("Error updating application to NO_SHOW:", upAppErr);
          return res.status(500).send("Database Error");
        }

        if (!upAppRes || upAppRes.affectedRows === 0) {
          return res.status(400).send("Application is not in Hired status or already marked as No-Show");
        }

        // 2. Reopen the job: status -> 'OPEN'
        db.query("UPDATE jobs SET status = 'OPEN' WHERE id = ?", [application.job_id], (upJobErr) => {
          if (upJobErr) {
            console.error("Error reopening job:", upJobErr);
          }

          // 3. Emit real-time events:
          // jobReopened triggers workers' FindJobs & Map refresh
          io.emit("jobReopened", {
            job_id: application.job_id,
          });

          io.emit("jobStatusUpdated", {
            job_id: application.job_id,
            status: "OPEN",
          });

          io.emit("workerNoShow", {
            applicationId: application.id,
            worker_id: application.worker_id,
            job_id: application.job_id,
            status: "NO_SHOW",
          });

          io.emit("applicationStatusUpdated", {
            applicationId: application.id,
            application_id: application.id,
            worker_id: application.worker_id,
            job_id: application.job_id,
            status: "NO_SHOW",
          });

          // 4. Send notification to the worker
          const notifMessage = `Worker marked as No-Show for ${application.job_title}. The job has been reopened.`;
          const notifSql = `
            INSERT INTO notifications (user_id, type, title, message, job_id, application_id, is_read)
            VALUES (?, 'noshow', 'Status Update: No-Show', ?, ?, ?, false)
          `;

          db.query(
            notifSql,
            [application.worker_id, notifMessage, application.job_id, application.id],
            (notifErr, notifResult) => {
              if (notifErr) {
                console.error("Notification error on noshow:", notifErr);
              }

              const insertedNotificationId = notifResult?.insertId || null;
              io.emit("applicationNotification", {
                user_id: application.worker_id,
                notification: {
                  id: insertedNotificationId,
                  type: "noshow",
                  title: "Status Update: No-Show",
                  message: notifMessage,
                  job_id: application.job_id,
                  application_id: application.id,
                  is_read: false,
                  created_at: new Date(),
                },
              });
            }
          );

          return res.status(200).send("Worker marked as No-Show and job reopened successfully");
        });
      });
    });
  }
);

/* =====================================================
   GET ALL APPLICATIONS (OPTIONAL WORKER FILTER)
===================================================== */

app.get(
  "/all-applications",
  authenticateToken,
  (req, res) => {
    let sql = `
      SELECT
        applications.*,
        jobs.title AS job_title,
        jobs.status AS job_status
      FROM applications
      JOIN jobs
        ON applications.job_id =
           jobs.id
    `;

    const params = [];

    if (req.user.role === "employer") {
      sql += " WHERE jobs.employer_id = ?";
      params.push(req.user.id);
    } else if (req.user.role === "worker") {
      sql += " WHERE applications.worker_id = ?";
      params.push(req.user.id);
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    sql += " ORDER BY applications.id DESC";

    db.query(
      sql,
      params,
      (err, result) => {

        if (err) {
          console.log(err);

          return res.status(500).send(
            "Database Error"
          );
        }

        res.json(result);
      }
    );
  }
);

/* =====================================================
   GET APPLIED JOBS FOR LOGGED-IN WORKER
===================================================== */

app.get(
  "/applied-jobs/:workerId",
  authenticateToken,
  requireRole("worker"),
  (req, res) => {
    const workerId = Number(req.params.workerId);

    if (!workerId || isNaN(workerId) || workerId <= 0) {
      return res.status(400).json({
        message: "Invalid worker ID",
      });
    }

    if (Number(workerId) !== Number(req.user.id)) {
      return res.status(403).json({
        message: "Access denied: you can only view your own applications",
      });
    }

    const cleanWorkerId = req.user.id;

    const sql = `
      SELECT
        applications.id,
        applications.worker_id,
        applications.worker_name,
        applications.job_id,
        applications.status,
        applications.created_at,
        jobs.title AS job_title,
        jobs.description,
        jobs.wage,
        jobs.location,
        jobs.employer_id AS employer_id,
        jobs.status AS job_status,
        COALESCE(users.name, 'Employer') AS employer_name
      FROM applications
      JOIN jobs
        ON applications.job_id = jobs.id
      LEFT JOIN users
        ON CAST(jobs.employer_id AS CHAR) = CAST(users.id AS CHAR)
      WHERE applications.worker_id = ?
      ORDER BY applications.id DESC
    `;

    db.query(
      sql,
      [cleanWorkerId],
      (err, result) => {
        if (err) {
          console.error("Applied jobs query error:", err);

          return res.status(500).send(
            "Database Error"
          );
        }

        res.json(result || []);
      }
    );
  }
);

/* =====================================================
   GET USER NOTIFICATIONS
===================================================== */

app.get(
  "/notifications/:userId",
  authenticateToken,
  (req, res) => {
    const userId = Number(req.params.userId);

    if (!userId || isNaN(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (Number(userId) !== Number(req.user.id)) {
      return res.status(403).json({
        message: "Access denied: you can only view your own notifications",
      });
    }

    const sql = `
      SELECT
        id,
        user_id,
        type,
        title,
        message,
        job_id,
        application_id,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;

    db.query(
      sql,
      [userId],
      (err, result) => {

        if (err) {
          console.log(
            "Notification fetch error:",
            err
          );

          return res.status(500).send(
            "Database Error"
          );
        }

        res.json(result);
      }
    );
  }
);

/* =====================================================
   MARK ONE NOTIFICATION READ
===================================================== */

app.put(
  "/notifications/:id/read",
  authenticateToken,
  (req, res) => {
    const id = Number(req.params.id);

    if (!id || isNaN(id) || id <= 0) {
      return res.status(400).send("Invalid notification ID");
    }

    db.query(
      "SELECT id, user_id FROM notifications WHERE id = ?",
      [id],
      (findErr, rows) => {
        if (findErr) {
          console.log(findErr);
          return res.status(500).send("Database Error");
        }

        if (!rows || rows.length === 0) {
          return res.status(404).send("Notification not found");
        }

        if (Number(rows[0].user_id) !== Number(req.user.id)) {
          return res.status(403).send("Access denied: you do not own this notification");
        }

        const sql =
          "UPDATE notifications SET is_read=TRUE WHERE id=?";

        db.query(
          sql,
          [id],
          (err) => {
            if (err) {
              console.log(err);

              return res.status(500).send(
                "Database Error"
              );
            }

            res.send(
              "Notification marked as read"
            );
          }
        );
      }
    );
  }
);

/* =====================================================
   MARK ALL NOTIFICATIONS READ
===================================================== */

app.put(
  "/notifications/user/:userId/read-all",
  authenticateToken,
  (req, res) => {
    const userId = Number(req.params.userId);

    if (!userId || isNaN(userId) || userId <= 0) {
      return res.status(400).send("Invalid user ID");
    }

    if (Number(userId) !== Number(req.user.id)) {
      return res.status(403).send("Access denied: you can only modify your own notifications");
    }

    const sql =
      "UPDATE notifications SET is_read=TRUE WHERE user_id=?";

    db.query(
      sql,
      [userId],
      (err) => {

        if (err) {
          console.log(err);

          return res.status(500).send(
            "Database Error"
          );
        }

        res.send(
          "All notifications marked as read"
        );
      }
    );
  }
);

/* =====================================================
   DELETE NOTIFICATION
===================================================== */

app.delete(
  "/notifications/:id",
  authenticateToken,
  (req, res) => {
    const id = Number(req.params.id);

    if (!id || isNaN(id) || id <= 0) {
      return res.status(400).send("Invalid notification ID");
    }

    db.query(
      "SELECT id, user_id FROM notifications WHERE id = ?",
      [id],
      (findErr, rows) => {
        if (findErr) {
          console.log(findErr);
          return res.status(500).send("Database Error");
        }

        if (!rows || rows.length === 0) {
          return res.status(404).send("Notification not found");
        }

        if (Number(rows[0].user_id) !== Number(req.user.id)) {
          return res.status(403).send("Access denied: you do not own this notification");
        }

        const sql =
          "DELETE FROM notifications WHERE id=?";

        db.query(
          sql,
          [id],
          (err) => {
            if (err) {
              console.log(err);

              return res.status(500).send(
                "Database Error"
              );
            }

            res.send(
              "Notification deleted"
            );
          }
        );
      }
    );
  }
);

/* =====================================================
   DELETE JOB
===================================================== */

app.delete(
  "/jobs/:id",
  authenticateToken,
  requireRole("employer"),
  (req, res) => {
    const jobId = Number(req.params.id);

    if (!jobId || isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({ message: "Invalid job ID" });
    }

    db.query("SELECT id, employer_id FROM jobs WHERE id = ?", [jobId], (err, rows) => {
      if (err) {
        console.log("Error finding job for delete:", err);
        return res.status(500).json({ message: "Database Error" });
      }

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Job not found" });
      }

      const job = rows[0];

      if (Number(job.employer_id) !== Number(req.user.id)) {
        return res.status(403).json({ message: "Access denied: you do not own this job" });
      }

      db.query("DELETE FROM notifications WHERE job_id = ?", [jobId], (notifErr) => {
        if (notifErr) {
          console.log("Error deleting notifications for job:", notifErr);
        }

        db.query("DELETE FROM applications WHERE job_id = ?", [jobId], (appErr) => {
          if (appErr) {
            console.log("Error deleting applications for job:", appErr);
          }

          db.query("DELETE FROM jobs WHERE id = ?", [jobId], (deleteErr) => {
            if (deleteErr) {
              console.log("Error deleting job:", deleteErr);
              return res.status(500).json({ message: "Failed to delete job" });
            }

            io.emit("jobClaimed", { job_id: jobId });
            io.emit("jobDeleted", { job_id: jobId, jobId: jobId });

            return res.json({
              success: true,
              message: "Job deleted successfully",
              job_id: jobId,
            });
          });
        });
      });
    });
  }
);

/* =====================================================
   UPDATE JOB STATUS (EMPLOYER ONLY - e.g. MARK AS COMPLETED)
===================================================== */

app.put(
  "/jobs/:id/status",
  authenticateToken,
  requireRole("employer"),
  (req, res) => {
    const jobId = Number(req.params.id);

    if (!jobId || isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({ message: "Invalid job ID" });
    }

    const { status } = req.body;
    const targetStatus = String(status || "").trim().toUpperCase();

    if (!targetStatus) {
      return res.status(400).json({ message: "Target status is required" });
    }

    // 1. Fetch existing job and check employer ownership
    db.query(
      "SELECT id, title, employer_id, status FROM jobs WHERE id = ?",
      [jobId],
      (findErr, rows) => {
        if (findErr) {
          console.error("Error finding job for status update:", findErr);
          return res.status(500).json({ message: "Database Error" });
        }

        if (!rows || rows.length === 0) {
          return res.status(404).json({ message: "Job not found" });
        }

        const job = rows[0];

        // Security check: Verify the authenticated employer owns the job
        if (Number(job.employer_id) !== Number(req.user.id)) {
          return res.status(403).json({
            message: "Access denied: you can only update the status of your own jobs",
          });
        }

        const currentStatus = String(job.status || "OPEN").toUpperCase();

        // Rule: COMPLETED -> anything else is strictly NOT allowed
        if (currentStatus === "COMPLETED") {
          return res.status(400).json({
            message: "This job is already marked as COMPLETED and cannot be changed",
          });
        }

        // Rule: Only transition to COMPLETED is allowed for manual update
        if (targetStatus === "COMPLETED") {
          // Rule: OPEN -> COMPLETED directly is NOT allowed (must be HIRED first)
          // Also double check applications to see if worker is hired
          const checkHiredSql = `
            SELECT id, worker_id, worker_name
            FROM applications
            WHERE job_id = ? AND status = 'Hired'
            ORDER BY id DESC
            LIMIT 1
          `;

          db.query(checkHiredSql, [jobId], (appCheckErr, appRows) => {
            if (appCheckErr) {
              console.error("Error checking application for status update:", appCheckErr);
              return res.status(500).json({ message: "Database Error" });
            }

            const isWorkerHired = currentStatus === "HIRED" || (appRows && appRows.length > 0);

            if (!isWorkerHired) {
              return res.status(400).json({
                message: "Cannot mark job as COMPLETED before a worker is hired (current status: " + currentStatus + ")",
              });
            }

            // Valid transition: HIRED -> COMPLETED
            db.query(
              "UPDATE jobs SET status = 'COMPLETED' WHERE id = ?",
              [jobId],
              (updateErr) => {
                if (updateErr) {
                  console.error("Error updating job status:", updateErr);
                  return res.status(500).json({ message: "Failed to update job status" });
                }

                // Notify the hired worker
                if (appRows && appRows.length > 0) {
                  const hiredApp = appRows[0];
                  const notifTitle = "Job Completed!";
                  const notifMessage = `The employer has marked the job "${job.title}" as completed. Thank you for your work!`;

                  const notifSql = `
                    INSERT INTO notifications
                    (user_id, type, title, message, job_id, application_id, is_read)
                    VALUES (?, 'completed', ?, ?, ?, ?, false)
                  `;

                  db.query(
                    notifSql,
                    [
                      hiredApp.worker_id,
                      notifTitle,
                      notifMessage,
                      jobId,
                      hiredApp.id,
                    ],
                    (insErr, insRes) => {
                      if (insErr) {
                        console.error("Error inserting completion notification:", insErr);
                      }

                      const newNotifId = insRes?.insertId || null;

                      io.emit("jobCompletedNotification", {
                        user_id: hiredApp.worker_id,
                        notification: {
                          id: newNotifId,
                          type: "completed",
                          title: notifTitle,
                          message: notifMessage,
                          job_id: jobId,
                          application_id: hiredApp.id,
                          is_read: false,
                          created_at: new Date(),
                        },
                      });
                    }
                  );
                }

                io.emit("jobStatusUpdated", {
                  job_id: jobId,
                  status: "COMPLETED",
                });

                return res.json({
                  success: true,
                  message: "Job marked as completed successfully",
                  job_id: jobId,
                  status: "COMPLETED",
                });
              }
            );
          });
        } else {
          return res.status(400).json({
            message: `Invalid status transition to '${targetStatus}'. Only transition to 'COMPLETED' is supported.`,
          });
        }
      }
    );
  }
);

/* =====================================================
   PROFILE APIS (GET & PUT)
===================================================== */

app.get("/profile", authenticateToken, (req, res) => {
  const userId = Number(req.user.id);

  const sql = `
    SELECT id, name, email, phone, role, location, profile_photo, skills, experience, preferred_work_type, company_name
    FROM users
    WHERE id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Fetch profile error:", err);
      return res.status(500).json({ message: "Failed to load profile" });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = results[0];
    // Derive employer_type from company_name (not a DB column)
    const employerType =
      user.role === "employer"
        ? user.company_name
          ? "Company / Organization"
          : "Individual Employer"
        : null;

    res.json({
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      role: user.role || "",
      location: user.location || "",
      profile_photo: user.profile_photo || null,
      skills: user.skills || "",
      experience: user.experience || "",
      preferred_work_type: user.preferred_work_type || "",
      company_name: user.company_name || "",
      employer_type: employerType,
    });
  });
});

app.put("/profile", authenticateToken, (req, res) => {
  const userId = Number(req.user.id);
  const userRole = String(req.user.role || "").toLowerCase();

  const {
    name,
    email,
    location,
    profile_photo,
    skills,
    experience,
    preferred_work_type,
    company_name,
    employer_type,
  } = req.body;

  // Validate Name
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
    return res.status(400).json({ message: "Name is required and must be between 2 and 100 characters" });
  }

  // Validate Email
  let cleanedEmail = null;
  if (email !== undefined && email !== null) {
    const trimmedEmail = String(email).trim().toLowerCase();
    if (trimmedEmail.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 100) {
        return res.status(400).json({ message: "Please provide a valid email address" });
      }
      cleanedEmail = trimmedEmail;
    }
  }

  // Sanitize fields (do not allow modifying phone number or role)
  const cleanedLocation = typeof location === "string" ? location.trim().slice(0, 255) : null;
  const cleanedPhoto = typeof profile_photo === "string" && profile_photo.trim().length > 0 ? profile_photo.trim() : null;
  if (cleanedPhoto) {
    if (cleanedPhoto.length > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "Profile photo exceeds 2MB limit" });
    }
    const isAllowedScheme =
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(cleanedPhoto) ||
      /^https?:\/\//i.test(cleanedPhoto);
    if (!isAllowedScheme) {
      return res.status(400).json({
        message: "Invalid profile photo format. Must be an image URL or image data URI.",
      });
    }
  }
  const cleanedSkills = userRole === "worker" && typeof skills === "string" ? skills.trim().slice(0, 1000) : null;
  const cleanedExperience = userRole === "worker" && typeof experience === "string" ? experience.trim().slice(0, 100) : null;
  const cleanedPrefWork = userRole === "worker" && typeof preferred_work_type === "string" ? preferred_work_type.trim().slice(0, 100) : null;

  // Handle employer type transitions
  let cleanedCompany = null;
  if (userRole === "employer") {
    const resolvedType = typeof employer_type === "string" ? employer_type.trim() : "";
    if (resolvedType === "Individual Employer") {
      // Switching to Individual: clear company_name
      cleanedCompany = null;
    } else if (resolvedType === "Company / Organization") {
      // Switching to Company: company_name is required
      const trimmedCompany = typeof company_name === "string" ? company_name.trim().slice(0, 255) : "";
      if (!trimmedCompany) {
        return res.status(400).json({ message: "Company name is required for Company / Organization employer type." });
      }
      cleanedCompany = trimmedCompany;
    } else {
      // employer_type not provided — keep existing company_name behaviour
      cleanedCompany = typeof company_name === "string" ? company_name.trim().slice(0, 255) || null : null;
    }
  }

  const sql = `
    UPDATE users
    SET name = ?,
        email = ?,
        location = ?,
        profile_photo = ?,
        skills = ?,
        experience = ?,
        preferred_work_type = ?,
        company_name = ?
    WHERE id = ?
  `;

  const values = [
    trimmedName,
    cleanedEmail,
    cleanedLocation,
    cleanedPhoto,
    cleanedSkills,
    cleanedExperience,
    cleanedPrefWork,
    cleanedCompany,
    userId,
  ];

  db.query(sql, values, (err) => {
    if (err) {
      console.error("Update profile error:", err);
      return res.status(500).json({ message: "Failed to update profile" });
    }

    db.query(
      `SELECT id, name, email, phone, role, location, profile_photo, skills, experience, preferred_work_type, company_name FROM users WHERE id = ?`,
      [userId],
      (fetchErr, rows) => {
        if (fetchErr || !rows || rows.length === 0) {
          return res.json({
            message: "Profile updated successfully",
            user: {
              id: userId,
              name: trimmedName,
              email: cleanedEmail || "",
              location: cleanedLocation || "",
              profile_photo: cleanedPhoto,
              skills: cleanedSkills || "",
              experience: cleanedExperience || "",
              preferred_work_type: cleanedPrefWork || "",
              company_name: cleanedCompany || "",
              employer_type: userRole === "employer" ? (cleanedCompany ? "Company / Organization" : "Individual Employer") : null,
            },
          });
        }

        const updated = rows[0];
        const updatedEmployerType =
          updated.role === "employer"
            ? updated.company_name
              ? "Company / Organization"
              : "Individual Employer"
            : null;
        res.json({
          message: "Profile updated successfully",
          user: {
            id: updated.id,
            name: updated.name || "",
            email: updated.email || "",
            phone: updated.phone || "",
            role: updated.role || "",
            location: updated.location || "",
            profile_photo: updated.profile_photo || null,
            skills: updated.skills || "",
            experience: updated.experience || "",
            preferred_work_type: updated.preferred_work_type || "",
            company_name: updated.company_name || "",
            employer_type: updatedEmployerType,
          },
        });
      }
    );
  });
});

/* =====================================================
   REPORT SYSTEM
===================================================== */

app.post("/reports", authenticateToken, async (req, res) => {
  try {
    const reporterId = Number(req.user.id);
    const reportedUserId = Number(req.body.reported_user_id);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : null;

    if (!reportedUserId || isNaN(reportedUserId) || reportedUserId <= 0) {
      return res.status(400).json({ message: "Invalid reported user ID." });
    }

    if (reporterId === reportedUserId) {
      return res.status(400).json({ message: "You cannot report yourself." });
    }

    if (!reason || !ALLOWED_REPORT_REASONS.includes(reason)) {
      return res.status(400).json({
        message: "Please select a valid report reason.",
        allowedReasons: ALLOWED_REPORT_REASONS,
      });
    }

    // Check if reported user exists in users table
    const userCheck = await new Promise((resolve, reject) => {
      db.query("SELECT id, name FROM users WHERE id = ?", [reportedUserId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    if (userCheck.length === 0) {
      return res.status(404).json({ message: "Reported user not found." });
    }

    // Prevent duplicate pending report from the same reporter for the same user and reason
    const duplicateCheck = await new Promise((resolve, reject) => {
      db.query(
        "SELECT id FROM reports WHERE reporter_id = ? AND reported_user_id = ? AND reason = ? AND status = 'PENDING' LIMIT 1",
        [reporterId, reportedUserId, reason],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    if (duplicateCheck.length > 0) {
      return res.status(400).json({
        message: "You have already submitted a pending report for this user regarding this issue.",
      });
    }

    // Insert new report with status PENDING
    const insertResult = await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO reports (reporter_id, reported_user_id, reason, description, status) VALUES (?, ?, ?, ?, 'PENDING')",
        [reporterId, reportedUserId, reason, description || null],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    // Notify Admins of new report
    db.query("SELECT id FROM users WHERE role = 'admin'", (adminErr, adminRows) => {
      if (!adminErr && Array.isArray(adminRows)) {
        adminRows.forEach((admin) => {
          const notifMsg = `New user report received: ${reason}.`;
          db.query(
            "INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, 'report', 'New Report Submitted', ?, false)",
            [admin.id, notifMsg],
            (notifErr, notifResult) => {
              if (!notifErr) {
                io.emit("adminNotification", {
                  user_id: admin.id,
                  notification: {
                    id: notifResult?.insertId || null,
                    type: "report",
                    title: "New Report Submitted",
                    message: notifMsg,
                    is_read: false,
                    created_at: new Date(),
                  },
                });
              }
            }
          );
        });
      }
    });

    return res.status(201).json({
      message: "Report submitted successfully.",
      reportId: insertResult.insertId,
    });
  } catch (err) {
    console.error("Error submitting report:", err);
    return res.status(500).json({ message: "Failed to submit report due to a server error." });
  }
});

/* =====================================================
   ADMIN: STATS, USERS, JOBS, APPLICATIONS & REPORTS
===================================================== */

app.get("/admin/stats", authenticateToken, requireRole("admin"), (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'worker') AS totalWorkers,
      (SELECT COUNT(*) FROM users WHERE role = 'employer') AS totalEmployers,
      (SELECT COUNT(*) FROM jobs) AS totalJobs,
      (SELECT COUNT(*) FROM jobs WHERE status = 'OPEN' OR status IS NULL) AS openJobs,
      (SELECT COUNT(*) FROM jobs WHERE status = 'HIRED') AS hiredJobs,
      (SELECT COUNT(*) FROM jobs WHERE status = 'COMPLETED') AS completedJobs,
      (SELECT COUNT(*) FROM applications) AS totalApplications,
      (SELECT COUNT(*) FROM reports WHERE status = 'PENDING') AS pendingReports
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Error fetching admin stats:", err);
      return res.status(500).json({ message: "Database Error" });
    }

    const data = rows[0] || {};
    res.json({
      totalWorkers: Number(data.totalWorkers || 0),
      totalEmployers: Number(data.totalEmployers || 0),
      totalJobs: Number(data.totalJobs || 0),
      openJobs: Number(data.openJobs || 0),
      hiredJobs: Number(data.hiredJobs || 0),
      completedJobs: Number(data.completedJobs || 0),
      totalApplications: Number(data.totalApplications || 0),
      pendingReports: Number(data.pendingReports || 0),
    });
  });
});

app.get("/admin/users", authenticateToken, requireRole("admin"), (req, res) => {
  const sql = `
    SELECT id, name, email, phone, role, location, status, created_at
    FROM users
    ORDER BY id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Error fetching admin users:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    res.json(rows || []);
  });
});

app.get("/admin/jobs", authenticateToken, requireRole("admin"), (req, res) => {
  const sql = `
    SELECT 
      j.id,
      j.title,
      j.description,
      j.wage,
      j.location,
      j.status,
      j.created_at,
      j.employer_id,
      COALESCE(u.name, 'Employer') AS employer_name,
      u.email AS employer_email,
      u.phone AS employer_phone
    FROM jobs j
    LEFT JOIN users u ON CAST(j.employer_id AS CHAR) = CAST(u.id AS CHAR)
    ORDER BY j.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Error fetching admin jobs:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    res.json(rows || []);
  });
});

app.get("/admin/applications", authenticateToken, requireRole("admin"), (req, res) => {
  const sql = `
    SELECT 
      a.id,
      a.job_id,
      j.title AS job_title,
      j.wage,
      j.location AS job_location,
      a.worker_id,
      a.worker_name,
      j.employer_id,
      COALESCE(u.name, 'Employer') AS employer_name,
      a.status,
      a.created_at
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    LEFT JOIN users u ON CAST(j.employer_id AS CHAR) = CAST(u.id AS CHAR)
    ORDER BY a.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Error fetching admin applications:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    res.json(rows || []);
  });
});

app.put("/admin/reports/:id/status", authenticateToken, requireRole("admin"), (req, res) => {
  const reportId = Number(req.params.id);
  const status = typeof req.body.status === "string" ? req.body.status.trim().toUpperCase() : "";

  if (!["RESOLVED", "DISMISSED", "PENDING"].includes(status)) {
    return res.status(400).json({ message: "Invalid report status. Allowed: RESOLVED, DISMISSED, PENDING" });
  }

  db.query("UPDATE reports SET status = ? WHERE id = ?", [status, reportId], (err, result) => {
    if (err) {
      console.error("Error updating report status:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Report not found" });
    }
    res.json({ message: `Report marked as ${status} successfully.`, report: { id: reportId, status } });
  });
});

app.put("/admin/users/:id/status", authenticateToken, requireRole("admin"), (req, res) => {
  const targetUserId = Number(req.params.id);
  const status = typeof req.body.status === "string" ? req.body.status.trim().toUpperCase() : "";

  if (!["ACTIVE", "SUSPENDED"].includes(status)) {
    return res.status(400).json({ message: "Invalid user status. Allowed: ACTIVE, SUSPENDED" });
  }

  if (Number(req.user.id) === targetUserId && status === "SUSPENDED") {
    return res.status(400).json({ message: "You cannot suspend your own admin account." });
  }

  db.query("UPDATE users SET status = ? WHERE id = ?", [status, targetUserId], (err, result) => {
    if (err) {
      console.error("Error updating user status:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: `User status updated to ${status} successfully.`, user: { id: targetUserId, status } });
  });
});

app.put("/admin/jobs/:id/status", authenticateToken, requireRole("admin"), (req, res) => {
  const jobId = Number(req.params.id);
  const status = typeof req.body.status === "string" ? req.body.status.trim().toUpperCase() : "";

  if (!["DISABLED", "OPEN"].includes(status)) {
    return res.status(400).json({ message: "Invalid job status. Allowed: DISABLED, OPEN" });
  }

  db.query("UPDATE jobs SET status = ? WHERE id = ?", [status, jobId], (err, result) => {
    if (err) {
      console.error("Error updating admin job status:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.json({ message: `Job marked as ${status} successfully.`, job: { id: jobId, status } });
  });
});

app.get("/admin/reports", authenticateToken, requireRole("admin"), (req, res) => {
  const sql = `
    SELECT 
      r.id,
      r.reporter_id,
      u1.name AS reporter_name,
      u1.role AS reporter_role,
      u1.email AS reporter_email,
      r.reported_user_id,
      u2.name AS reported_user_name,
      u2.role AS reported_user_role,
      u2.email AS reported_user_email,
      r.reason,
      r.description,
      r.status,
      r.created_at
    FROM reports r
    LEFT JOIN users u1 ON r.reporter_id = u1.id
    LEFT JOIN users u2 ON r.reported_user_id = u2.id
    ORDER BY r.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Error fetching admin reports:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    res.json(rows || []);
  });
});

/* =====================================================
   BLOCK SYSTEM
===================================================== */

app.post("/blocks", authenticateToken, async (req, res) => {
  try {
    const blockerId = Number(req.user.id);
    const blockedUserId = Number(req.body.blocked_user_id);

    if (!blockedUserId || isNaN(blockedUserId) || blockedUserId <= 0) {
      return res.status(400).json({ message: "Invalid user ID to block." });
    }

    if (blockerId === blockedUserId) {
      return res.status(400).json({ message: "You cannot block yourself." });
    }

    // Check if user to block exists
    const userCheck = await new Promise((resolve, reject) => {
      db.query("SELECT id FROM users WHERE id = ?", [blockedUserId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    if (userCheck.length === 0) {
      return res.status(404).json({ message: "User to block not found." });
    }

    // Insert block record (ignore if already blocked)
    await new Promise((resolve, reject) => {
      db.query(
        "INSERT IGNORE INTO blocked_users (blocker_id, blocked_user_id) VALUES (?, ?)",
        [blockerId, blockedUserId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    return res.status(200).json({ message: "User blocked successfully." });
  } catch (err) {
    console.error("Error blocking user:", err);
    return res.status(500).json({ message: "Failed to block user due to a server error." });
  }
});

app.delete("/blocks/:blockedUserId", authenticateToken, async (req, res) => {
  try {
    const blockerId = Number(req.user.id);
    const blockedUserId = Number(req.params.blockedUserId);

    if (!blockedUserId || isNaN(blockedUserId) || blockedUserId <= 0) {
      return res.status(400).json({ message: "Invalid user ID to unblock." });
    }

    await new Promise((resolve, reject) => {
      db.query(
        "DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_user_id = ?",
        [blockerId, blockedUserId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    return res.status(200).json({ message: "User unblocked successfully." });
  } catch (err) {
    console.error("Error unblocking user:", err);
    return res.status(500).json({ message: "Failed to unblock user due to a server error." });
  }
});

app.get("/blocked-users", authenticateToken, (req, res) => {
  const blockerId = Number(req.user.id);
  const sql = `
    SELECT 
      bu.id,
      bu.blocked_user_id,
      bu.created_at,
      u.name AS blocked_user_name,
      u.role AS blocked_user_role,
      u.email AS blocked_user_email
    FROM blocked_users bu
    JOIN users u ON bu.blocked_user_id = u.id
    WHERE bu.blocker_id = ?
    ORDER BY bu.id DESC
  `;

  db.query(sql, [blockerId], (err, rows) => {
    if (err) {
      console.error("Error fetching blocked users:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    res.json(rows || []);
  });
});

app.get("/blocked-user-ids", authenticateToken, (req, res) => {
  const userId = Number(req.user.id);
  const sql = `SELECT blocked_user_id FROM blocked_users WHERE blocker_id = ?`;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("Error fetching blocked user IDs:", err);
      return res.status(500).json({ message: "Database Error" });
    }
    const ids = (rows || []).map((r) => Number(r.blocked_user_id));
    res.json(ids);
  });
});

/* =====================================================
   GLOBAL ERROR & EXCEPTION HANDLING
===================================================== */

app.use((err, req, res, next) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({ message: "Payload too large. Request entity exceeds limit." });
  }
  console.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ message: "Internal Server Error" });
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

/* =====================================================
   START SERVER
===================================================== */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );

  console.log(
    "Socket.IO real-time server ready"
  );
});
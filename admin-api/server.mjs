/**
 * SHUBE Admin API — Node.js/Express proxy server
 * Mirrors the Flask app.py exactly, same endpoints.
 * Uses service_role key to call Supabase Auth Admin API.
 */
import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load .env manually (avoid top-level await issues with dotenv ESM)
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valParts] = trimmed.split("=");
    if (key && !process.env[key]) {
      process.env[key] = valParts.join("=").trim();
    }
  }
} catch {}

const SUPABASE_URL      = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PORT              = parseInt(process.env.PORT || "5050", 10);
const CORS_ORIGINS      = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:4173").split(",");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || SERVICE_ROLE_KEY === "YOUR_SERVICE_ROLE_KEY_HERE") {
  console.error("\n[SHUBE] ERROR: SUPABASE_SERVICE_ROLE_KEY not set in admin-api/.env");
  console.error("  Get it from: https://supabase.com/dashboard/project/eabwhgujwywwiormujrr/settings/api\n");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Permissive CORS for local development (supports localhost, 127.0.0.1 on any port)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "apikey", "X-Client-Info"]
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const adminHeaders = () => ({
  apikey:        SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer:        "return=representation",
});

async function sbFetch(url, options = {}) {
  return fetch(url, { ...options, headers: { ...adminHeaders(), ...(options.headers || {}) } });
}

function callerJwt(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "shube-admin-api" }));

// ── Create Operator ───────────────────────────────────────────────────────────
app.post("/api/operators", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized — missing bearer token" });

  const { email, password, full_name, username, phone_number, notes, actor_id } = req.body || {};

  if (!email || !password || !full_name || !username)
    return res.status(400).json({ error: "email, password, full_name, and username are required" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });

  try {
    // Step 1: Create auth user
    const authResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "operator", full_name },
      }),
    });
    const authData = await authResp.json();
    if (!authResp.ok) return res.status(authResp.status).json({ error: authData.message || authData.msg || "Auth user creation failed" });

    const userId = authData.id;

    // Step 2: Upsert profile (ensure profile exists before operator reference)
    await sbFetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: userId,
        role: "operator",
        full_name,
        phone_number: phone_number || null,
        force_password_change: true,
      }),
    });

    // Step 3: Insert operator record
    const opResp = await sbFetch(`${SUPABASE_URL}/rest/v1/operators`, {
      method: "POST",
      body: JSON.stringify({
        profile_id: userId,
        username,
        notes: notes || null,
        created_by: actor_id || null,
      }),
    });
    const opData = await opResp.json();
    if (!opResp.ok) return res.status(opResp.status).json({ error: opData.message || opData.msg || "Operator insert failed" });

    // Step 4: Audit log (non-fatal)
    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({ actor_id, actor_role: "admin", action: "operator_created", resource_type: "operator", resource_id: userId, description: `Created operator ${username}` }),
    }).catch(() => {});

    return res.status(201).json({ user_id: userId, operator: Array.isArray(opData) ? opData[0] : opData });
  } catch (err) {
    console.error("[create-operator]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Reset Password ────────────────────────────────────────────────────────────
app.post("/api/operators/reset-password", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized — missing bearer token" });

  const { profile_id, password, username, operator_id, actor_id } = req.body || {};

  if (!profile_id || !password) return res.status(400).json({ error: "profile_id and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  try {
    // Step 1: Update auth password
    const pwResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    });
    const pwData = await pwResp.json();
    if (!pwResp.ok) return res.status(pwResp.status).json({ error: pwData.message || pwData.msg || "Password update failed" });

    // Step 2: Mark force_password_change
    await sbFetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile_id}`, {
      method: "PATCH",
      body: JSON.stringify({ force_password_change: true }),
    });

    // Step 3: Audit log
    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({ actor_id, actor_role: "admin", action: "operator_password_reset", resource_type: "operator", resource_id: operator_id, description: `Password reset for ${username}` }),
    }).catch(() => {});

    return res.json({ success: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Delete Operator ───────────────────────────────────────────────────────────
app.delete("/api/operators/:profile_id", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized — missing bearer token" });

  const { profile_id } = req.params;
  const { actor_id, username } = req.body || {};

  try {
    // Delete from auth.users (cascades to profiles and operators tables)
    const delResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
      method: "DELETE",
    });
    
    // Auth admin API returns 200 with empty JSON or user obj. If not ok, it's an error.
    if (!delResp.ok) {
      const delData = await delResp.json().catch(() => ({}));
      return res.status(delResp.status).json({ error: delData.message || delData.msg || "Failed to delete user" });
    }

    // Audit log
    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({ actor_id, actor_role: "admin", action: "operator_deleted", resource_type: "operator", resource_id: profile_id, description: `Deleted operator ${username || profile_id}` }),
    }).catch(() => {});

    return res.json({ success: true });
  } catch (err) {
    console.error("[delete-operator]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Devices (Worker App API) ──────────────────────────────────────────────────

// 1. Generate/Get Pairing Code (For Operator Dashboard)
app.post("/api/devices/generate-pairing", async (req, res) => {
  const jwt = callerJwt(req);
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const { device_name, operator_id } = req.body || {};
  if (!device_name || !operator_id) return res.status(400).json({ error: "device_name and operator_id required" });

  try {
    const pairing_code = Math.floor(100000 + Math.random() * 900000).toString();
    const resp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices`, {
      method: "POST",
      body: JSON.stringify({ device_name, operator_id, pairing_code, is_online: false }),
    });
    if (!resp.ok) return res.status(resp.status).json({ error: "Failed to generate pairing code" });
    return res.json({ pairing_code });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Pair Device (Called by Android App)
app.post("/api/devices/pair", async (req, res) => {
  const { pairing_code } = req.body || {};
  if (!pairing_code) return res.status(400).json({ error: "pairing_code required" });

  try {
    // Find device by code
    const getResp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?pairing_code=eq.${pairing_code}&select=*`);
    const devices = await getResp.json();
    if (!devices || devices.length === 0) return res.status(404).json({ error: "Invalid pairing code" });

    const device = devices[0];
    
    // Clear pairing code after successful pair (one-time use)
    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device.id}`, {
      method: "PATCH",
      body: JSON.stringify({ pairing_code: null, is_online: true, last_ping_at: new Date().toISOString() }),
    });

    return res.json({ success: true, device_id: device.id, operator_id: device.operator_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Heartbeat (Called by Android App)
app.post("/api/devices/heartbeat", async (req, res) => {
  const { device_id, battery_level, network_type } = req.body || {};
  if (!device_id) return res.status(400).json({ error: "device_id required" });

  try {
    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        battery_level: battery_level || 0,
        network_type: network_type || 'UNKNOWN',
        is_online: true,
        last_ping_at: new Date().toISOString(),
      }),
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Get Status (For Operator Dashboard)
app.get("/api/devices/status", async (req, res) => {
  const jwt = callerJwt(req);
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const operator_id = req.query.operator_id;
  if (!operator_id) return res.status(400).json({ error: "operator_id required" });

  try {
    const resp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?operator_id=eq.${operator_id}&select=*`);
    const devices = await resp.json();
    return res.json(devices);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ SHUBE Admin API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});

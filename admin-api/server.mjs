/**
 * SHUBE Admin API — Node.js/Express proxy server
 * Uses service_role key to call Supabase Auth Admin API.
 *
 * Features:
 *   - Operator management (create, delete, freeze/unfreeze)
 *   - Device management (pair, heartbeat, freeze/delete, 1-per-operator limit)
 *   - Transaction result reporting (USSD success detection + balance deduction)
 *   - Balance top-up for SIM card
 *   - Live monitoring: pending transactions + busy devices
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

// ── Static Downloads (APK files) ──────────────────────────────────────────────
import { createReadStream, statSync, existsSync } from "fs";
const DASHBOARD_DIST = join(__dirname, "../admin-dashboard/dist");
const DASHBOARD_PUBLIC = join(__dirname, "../admin-dashboard/public");

app.get("/downloads/:filename", (req, res) => {
  const filename = req.params.filename;
  // Sanitize: only allow alphanumeric, dash, underscore, dot
  if (!/^[\w\-\.]+$/.test(filename)) return res.status(400).send("Invalid filename");

  // Try dist first, then public folder
  let filePath = join(DASHBOARD_DIST, "downloads", filename);
  if (!existsSync(filePath)) {
    filePath = join(DASHBOARD_PUBLIC, "downloads", filename);
  }
  if (!existsSync(filePath)) return res.status(404).send("File not found");

  const stat = statSync(filePath);
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", stat.size);
  createReadStream(filePath).pipe(res);
});

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

// ── USSD Success Keywords ─────────────────────────────────────────────────────
// Erayo fure ee muujinaya guul (case-insensitive)
const SUCCESS_KEYWORDS = [
  "waad ku guulaysatay",
  "si guul leh",
  "waxaad ugu shubtay",
  "successfully",
  "success",
  "guul",
];

/**
 * Hubinta in fariinta USSD-ga ay muujinayso guul.
 * Waxay eegaysaa erayo fure ku dhex jira qoraalka.
 */
function isUssdSuccess(resultText) {
  if (!resultText) return false;
  const lower = resultText.toLowerCase();
  return SUCCESS_KEYWORDS.some(keyword => lower.includes(keyword));
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
// Rule: Operator kasta hal device kaliya ayuu yeelan karaa (1-to-1 limit)
app.post("/api/devices/generate-pairing", async (req, res) => {
  const jwt = callerJwt(req);
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const { device_name, operator_id } = req.body || {};
  if (!device_name || !operator_id) return res.status(400).json({ error: "device_name and operator_id required" });

  try {
    // ── 1-Device-Per-Operator: Hubi hore in operator-ku device lahayn ──
    const existCheck = await sbFetch(
      `${SUPABASE_URL}/rest/v1/devices?operator_id=eq.${operator_id}&status=neq.deleted&select=id,device_name,status`
    );
    const existing = await existCheck.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        error: `Operator-kan horay ayuu u lahaa device ("${existing[0].device_name}"). Operator kasta hal device kaliya ayuu yeelan karaa. Tirtir kii hore ama la xiriir super admin.`,
        existing_device: existing[0],
      });
    }

    const pairing_code = Math.floor(100000 + Math.random() * 900000).toString();
    const temp_identifier = `PAIR-${pairing_code}`;

    const resp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices`, {
      method: "POST",
      body: JSON.stringify({ device_name, operator_id, device_identifier: temp_identifier, status: 'offline' }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return res.status(resp.status).json({ error: errData.message || "Failed to generate pairing code" });
    }
    return res.json({ pairing_code });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Pair Device (Called by Android App)
// Shardiga isku xirka: Username/Email + Password + 6-digit Pairing Code generated from website
app.post("/api/devices/pair", async (req, res) => {
  const { username, email: reqEmail, password, pairing_code, device_identifier } = req.body || {};
  if (!pairing_code) return res.status(400).json({ error: "Fadlan gali 6-da lambar ee Pairing Code-ka (Pairing code required)" });

  const userIdentifier = username || reqEmail;
  if (!userIdentifier || !password) {
    return res.status(400).json({ error: "Fadlan gali Username/Email iyo Password-ka Website-ka (Username/Email and Password required)" });
  }

  try {
    // 1. Resolve email if username was provided
    let loginEmail = userIdentifier.trim();
    if (!loginEmail.includes("@")) {
      const opResp = await sbFetch(`${SUPABASE_URL}/rest/v1/operators?username=eq.${encodeURIComponent(loginEmail)}&select=profile_id,id`);
      const opData = await opResp.json().catch(() => []);
      if (Array.isArray(opData) && opData.length > 0 && opData[0].profile_id) {
        const userResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${opData[0].profile_id}`);
        const userData = await userResp.json().catch(() => null);
        if (userData && userData.email) {
          loginEmail = userData.email;
        }
      }
    }

    // 2. Authenticate credentials with Supabase Auth
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_ROLE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: loginEmail,
        password: password
      })
    });
    const authData = await authResp.json().catch(() => ({}));
    if (!authResp.ok || !authData.user) {
      return res.status(401).json({ 
        error: "Username/Email ama Password-ka aad galisay waa khalad (Invalid website credentials)" 
      });
    }

    const authUserId = authData.user.id;

    // 3. Find device by temp pairing identifier
    const temp_identifier = `PAIR-${pairing_code.trim()}`;
    const getResp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?device_identifier=eq.${temp_identifier}&select=*`);
    const devices = await getResp.json().catch(() => []);
    if (!devices || devices.length === 0) {
      return res.status(404).json({ 
        error: "Pairing code-ku ma jiro ama wuu dhacay. Ka soo saar website-ka 'Generate Code' (Invalid or expired pairing code)" 
      });
    }

    const device = devices[0];

    // 4. Check operator ownership
    const opCheck = await sbFetch(`${SUPABASE_URL}/rest/v1/operators?profile_id=eq.${authUserId}&select=id`);
    const opCheckData = await opCheck.json().catch(() => []);
    const isOwnerOperator = Array.isArray(opCheckData) && opCheckData.length > 0 && opCheckData[0].id === device.operator_id;

    const profCheck = await sbFetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUserId}&select=role`);
    const profData = await profCheck.json().catch(() => []);
    const isAdmin = Array.isArray(profData) && profData[0]?.role === 'admin';

    if (!isOwnerOperator && !isAdmin) {
      return res.status(403).json({
        error: "Pairing code-kan uma diiwaangashana koontadaada (Pairing code belongs to another operator)"
      });
    }

    // 5. Update device_identifier to the real one, and set online
    const real_identifier = device_identifier || `DEV-${device.id}`;
    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device.id}`, {
      method: "PATCH",
      body: JSON.stringify({ 
        device_identifier: real_identifier, 
        status: 'online', 
        last_seen: new Date().toISOString(),
        last_ping_at: new Date().toISOString()
      }),
    });

    return res.json({ 
      success: true, 
      device_id: device.id, 
      operator_id: device.operator_id,
      supabase_url: SUPABASE_URL,
      supabase_anon_key: process.env.SUPABASE_ANON_KEY || '',
      supabase_service_key: SERVICE_ROLE_KEY
    });
  } catch (err) {
    console.error("[pair-device]", err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Heartbeat (Called by Android App)
app.post("/api/devices/heartbeat", async (req, res) => {
  const { device_id, battery_level, is_charging, network_type } = req.body || {};
  if (!device_id) return res.status(400).json({ error: "device_id required" });

  try {
    // Only include battery_level in the update if it's a valid reading (> 0)
    const patch = {
      is_charging: is_charging || false,
      network_type: network_type || 'UNKNOWN',
      is_online: true,
      status: 'online',
      last_ping_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    };
    if (typeof battery_level === 'number' && battery_level >= 0) {
      patch.battery_level = Math.round(battery_level);
    }

    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
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

// ══════════════════════════════════════════════════════════════════════════════
// ── TRANSACTION RESULT (USSD Success/Failure Reporting) ───────────────────────
// ══════════════════════════════════════════════════════════════════════════════
/**
 * POST /api/transactions/:transaction_id/result
 * Android App-ku wuxuu ku soo diri doonaa:
 *   - result_text: Fariinta USSD-ga ee shaashada ka muuqday
 *   - device_id:   ID-ga telefoonka
 * Server-ku wuxuu:
 *   1. Hubiyaa erayo fure si uu uga garanayo in shaqadu guul ahayd
 *   2. Wuxuu cusboonaysiiyaa status-ka transaction-ka (SUCCESS/FAILED)
 *   3. Haddii SUCCESS: wuxuu ka jaraa cost_price-ka current_balance-ka device-ka
 *   4. Wuxuu tirtiraa BUSY-ga device-ka (free-garayaa si uu u qaato shaqo cusub)
 */
app.post("/api/transactions/:transaction_id/result", async (req, res) => {
  const { transaction_id } = req.params;
  const { result_text, device_id } = req.body || {};

  if (!result_text || !device_id) {
    return res.status(400).json({ error: "result_text and device_id are required" });
  }

  const succeeded = isUssdSuccess(result_text);
  const newStatus = succeeded ? "completed" : "failed";
  const now = new Date().toISOString();

  try {
    // ── Step 1: Hel bundle_rule cost_price-keeda ──────────────────────────────
    const txResp = await sbFetch(
      `${SUPABASE_URL}/rest/v1/transactions?id=eq.${transaction_id}&select=bundle_rule_id,status`
    );
    const txRows = await txResp.json();
    if (!txRows || txRows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    const tx = txRows[0];

    // Haddii horay la dhammeeyay, ha dib-u-shaqayn
    if (tx.status !== "pending" && tx.status !== "processing") {
      return res.status(409).json({ error: `Transaction already in final state: ${tx.status}` });
    }

    // ── Step 2: Cusboonaysii transaction-ka ──────────────────────────────────
    const txPatch = {
      status: newStatus,
      result_text,
      completed_at: now,
      completed_by_device: device_id,
      updated_at: now,
    };
    if (!succeeded) txPatch.failure_reason = result_text;

    await sbFetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${transaction_id}`, {
      method: "PATCH",
      body: JSON.stringify(txPatch),
    });

    // ── Step 3: Haddii SUCCESS, jar cost_price-ka balance-ka ─────────────────
    if (succeeded && tx.bundle_rule_id) {
      const ruleResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/bundle_rules?id=eq.${tx.bundle_rule_id}&select=cost_price`
      );
      const rules = await ruleResp.json();
      const costPrice = (rules && rules[0] && rules[0].cost_price) ? parseFloat(rules[0].cost_price) : 0;

      if (costPrice > 0) {
        // Jarista balance-ka: Xal ammaan ah — PostgreSQL RPC waa fiican laakiin PostgREST PATCH ku filan
        const devResp = await sbFetch(
          `${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}&select=current_balance`
        );
        const devRows = await devResp.json();
        const currentBalance = (devRows && devRows[0]) ? parseFloat(devRows[0].current_balance || 0) : 0;
        const newBalance = Math.max(0, currentBalance - costPrice); // Ha tago negative

        await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
          method: "PATCH",
          body: JSON.stringify({ current_balance: newBalance.toFixed(4), updated_at: now }),
        });
      }
    }

    // ── Step 4: Free-gare device-ka (ka saar BUSY, dib u soo celi ONLINE) ────
    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "online", updated_at: now }),
    });

    return res.json({
      success: true,
      transaction_status: newStatus,
      ussd_success_detected: succeeded,
      message: succeeded
        ? "✅ Lacag-dirku wuu guulaysatay, balance-kii waa la gooyay."
        : "❌ Lacag-dirku wuu fashilmay, balance-ka kama jarid.",
    });
  } catch (err) {
    console.error("[transaction-result]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Balance Top-Up (Recharge SIM Card) ────────────────────────────────────────
/**
 * POST /api/devices/:device_id/topup
 * Super Admin ama Operator wuxuu ku shubaa lacagta card-ka.
 *   Body: { amount: 10.00, actor_id: "..." }
 */
app.post("/api/devices/:device_id/topup", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized" });

  const { device_id } = req.params;
  const { amount, actor_id } = req.body || {};

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: "amount is required and must be a positive number" });
  }

  const topupAmount = parseFloat(amount);
  const now = new Date().toISOString();

  try {
    // Hel balance-ka hadda jira
    const devResp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}&select=id,device_name,current_balance,operator_id`);
    const devRows = await devResp.json();
    if (!devRows || devRows.length === 0) return res.status(404).json({ error: "Device not found" });

    const device = devRows[0];
    const oldBalance = parseFloat(device.current_balance || 0);
    const newBalance = oldBalance + topupAmount;

    // Cusboonaysii balance-ka
    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
      method: "PATCH",
      body: JSON.stringify({ current_balance: newBalance.toFixed(4), updated_at: now }),
    });

    // Audit log
    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({
        actor_id: actor_id || null,
        actor_role: "admin",
        action: "device_topup",
        resource_type: "device",
        resource_id: device_id,
        description: `Balance top-up: $${oldBalance.toFixed(4)} → $${newBalance.toFixed(4)} (+$${topupAmount.toFixed(4)}) on device "${device.device_name}"`,
      }),
    }).catch(() => {});

    return res.json({
      success: true,
      device_id,
      device_name: device.device_name,
      old_balance: oldBalance.toFixed(4),
      new_balance: newBalance.toFixed(4),
      topup_amount: topupAmount.toFixed(4),
    });
  } catch (err) {
    console.error("[device-topup]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Freeze / Unfreeze Operator (Super Admin) ───────────────────────────────────
/**
 * PUT /api/operators/:profile_id/status
 * Body: { status: "frozen" | "active", actor_id: "..." }
 * Marka la freeze gareeyo: User-ku ma awoodaan in uu soo galo website-ka.
 */
app.put("/api/operators/:profile_id/status", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized" });

  const { profile_id } = req.params;
  const { status, actor_id } = req.body || {};

  if (!status || !["active", "frozen"].includes(status)) {
    return res.status(400).json({ error: 'status must be either "active" or "frozen"' });
  }

  const now = new Date().toISOString();
  try {
    // Cusboonaysii profile status-ka
    const patchResp = await sbFetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile_id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, updated_at: now }),
    });
    if (!patchResp.ok) {
      const errData = await patchResp.json().catch(() => ({}));
      return res.status(patchResp.status).json({ error: errData.message || "Failed to update status" });
    }

    // Haddii la freeze gareeyo: Sign out auth sessions-keedii
    if (status === "frozen") {
      await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
        method: "PUT",
        body: JSON.stringify({ ban_duration: "876000h" }), // ~100 sano = permanent freeze
      }).catch(() => {});
    } else {
      // Unfreeze: Saar ban-ka
      await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
        method: "PUT",
        body: JSON.stringify({ ban_duration: "none" }),
      }).catch(() => {});
    }

    // Audit log
    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({
        actor_id: actor_id || null,
        actor_role: "admin",
        action: status === "frozen" ? "operator_frozen" : "operator_unfrozen",
        resource_type: "operator",
        resource_id: profile_id,
        description: `Operator ${status === "frozen" ? "frozen (hakiyay)" : "unfrozen (furtay)"}`,
      }),
    }).catch(() => {});

    return res.json({ success: true, profile_id, new_status: status });
  } catch (err) {
    console.error("[operator-status]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Freeze / Unfreeze Device (Super Admin) ────────────────────────────────────
/**
 * PUT /api/devices/:device_id/status
 * Body: { status: "frozen" | "active" | "online", actor_id: "..." }
 * Marka device la freeze gareeyo, system-ku ma siin shaqo cusub.
 */
app.put("/api/devices/:device_id/status", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized" });

  const { device_id } = req.params;
  const { status, actor_id } = req.body || {};

  if (!status || !["active", "online", "frozen", "offline"].includes(status)) {
    return res.status(400).json({ error: 'status must be one of: active, online, frozen, offline' });
  }

  const now = new Date().toISOString();
  const patch = { status, updated_at: now };
  if (status === "frozen") {
    patch.frozen_at = now;
    patch.frozen_by = actor_id || null;
    patch.gateway_enabled = false;
  } else if (status === "active" || status === "online") {
    patch.frozen_at = null;
    patch.frozen_by = null;
    patch.gateway_enabled = true;
  }

  try {
    const patchResp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!patchResp.ok) {
      const errData = await patchResp.json().catch(() => ({}));
      return res.status(patchResp.status).json({ error: errData.message || "Failed to update device status" });
    }

    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({
        actor_id: actor_id || null,
        actor_role: "admin",
        action: `device_${status}`,
        resource_type: "device",
        resource_id: device_id,
        description: `Device status changed to "${status}"`,
      }),
    }).catch(() => {});

    return res.json({ success: true, device_id, new_status: status });
  } catch (err) {
    console.error("[device-status]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Delete Device (Super Admin) ───────────────────────────────────────────────
/**
 * DELETE /api/devices/:device_id
 * Device-ka waa la tirtirayaa/soft-delete. Transactions-kiisii waxay sii jiri doonaan (history).
 */
app.delete("/api/devices/:device_id", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized" });

  const { device_id } = req.params;
  const { actor_id } = req.body || {};
  const now = new Date().toISOString();

  try {
    // Soft delete: status = 'deleted' (xogtii transactions history waa sii jiri doontaa)
    const delResp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "deleted",
        gateway_enabled: false,
        is_online: false,
        updated_at: now,
      }),
    });
    if (!delResp.ok) {
      const errData = await delResp.json().catch(() => ({}));
      return res.status(delResp.status).json({ error: errData.message || "Failed to delete device" });
    }

    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({
        actor_id: actor_id || null,
        actor_role: "admin",
        action: "device_deleted",
        resource_type: "device",
        resource_id: device_id,
        description: "Device deleted (soft delete) by super admin",
      }),
    }).catch(() => {});

    return res.json({ success: true, device_id, status: "deleted" });
  } catch (err) {
    console.error("[delete-device]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Live Monitoring: Pending Transactions + Busy Devices ─────────────────────
/**
 * GET /api/monitoring/live
 * Website-ku wuxuu codsi u dirayaa daqiiqad kasta.
 * Wuxuu soo celiyaa:
 *   - pending_transactions: Xaaladaha hadda PENDING/PROCESSING ah
 *   - busy_devices: Qalabka hadda BUSY ah
 */
app.get("/api/monitoring/live", async (req, res) => {
  if (!callerJwt(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const [pendingResp, busyResp] = await Promise.all([
      // Transactions-ka hadda la wadaa (PENDING ama PROCESSING)
      sbFetch(
        `${SUPABASE_URL}/rest/v1/transactions` +
        `?status=in.("pending","processing")` +
        `&select=id,status,somtel_number,amount_sls,bundle_rule_id,device_id,operator_id,created_at,processing_started_at` +
        `&order=created_at.asc`
      ),
      // Devices-ka hadda shaqada ku jira (BUSY)
      sbFetch(
        `${SUPABASE_URL}/rest/v1/devices` +
        `?status=in.("busy","online")` +
        `&select=id,device_name,status,current_balance,battery_level,is_charging,network_type,last_ping_at,operator_id` +
        `&order=last_ping_at.desc`
      ),
    ]);

    const pending = await pendingResp.json();
    const busy = await busyResp.json();

    return res.json({
      timestamp: new Date().toISOString(),
      pending_transactions: Array.isArray(pending) ? pending : [],
      busy_devices: Array.isArray(busy) ? busy : [],
      counts: {
        pending: Array.isArray(pending) ? pending.length : 0,
        busy: Array.isArray(busy) ? busy.length : 0,
      },
    });
  } catch (err) {
    console.error("[live-monitoring]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ SHUBE Admin API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  console.log(`   New Endpoints:`);
  console.log(`   POST /api/transactions/:id/result    — USSD result + balance deduction`);
  console.log(`   POST /api/devices/:id/topup          — Balance top-up`);
  console.log(`   PUT  /api/operators/:id/status       — Freeze/Unfreeze operator`);
  console.log(`   PUT  /api/devices/:id/status         — Freeze/Unfreeze device`);
  console.log(`   DELETE /api/devices/:id              — Delete device (soft)`);
  console.log(`   GET  /api/monitoring/live            — Live pending transactions\n`);
});

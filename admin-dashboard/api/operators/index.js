import { SUPABASE_URL, sbFetch, verifyAdmin, callerJwt, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  // CORS setup if accessed from different origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const jwt = callerJwt(req);
  const adminUser = await verifyAdmin(jwt);
  if (!adminUser) return jsonResponse(res, 403, { error: "Admin access required" });

  // ── GET /api/operators — list all operators with profiles ─────────────────
  if (req.method === 'GET') {
    try {
      const resp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/operators?select=*,profile:profiles!operators_profile_id_fkey(*)&order=created_at.desc`
      );
      const data = await resp.json();
      if (!resp.ok) return jsonResponse(res, resp.status, { error: data.message || "Failed to fetch operators" });
      return jsonResponse(res, 200, data);
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  // ── POST /api/operators — create a new operator ───────────────────────────
  if (req.method === 'POST') {
    let { email, password, full_name, username, phone_number, notes, actor_id, app_type, ussd_template, ussd_reply_template, subscription_days, subscription_hours, subscription_minutes } = req.body || {};
    
    if (app_type === 'shube' || app_type === 'mumin') {
      if (email && !username) {
        username = email.split('@')[0];
      }
      if (email && !full_name) {
        full_name = username;
      }
      if (!email && username) {
        email = `${username}@shube.app`;
      }
    } else {
      if (!email && username) {
        email = `${username}@geesh.app`;
      }
    }

    let subscription_expires_at = null;
    let activation_code = null;
    let activation_code_duration_minutes = null;

    if (app_type === 'geesh') {
      const totalMinutes = (parseInt(subscription_days) || 0) * 1440 + (parseInt(subscription_hours) || 0) * 60 + (parseInt(subscription_minutes) || 0);
      if (totalMinutes > 0) {
        activation_code_duration_minutes = totalMinutes;
        subscription_expires_at = new Date(Date.now() + totalMinutes * 60 * 1000).toISOString();
        activation_code = Math.floor(10000000 + Math.random() * 90000000).toString();
      }
    }

    if (!email || !password || !full_name || !username) {
      return jsonResponse(res, 400, { error: "password, full_name, and username are required" });
    }
    if (password.length < 8) {
      return jsonResponse(res, 400, { error: "Password must be at least 8 characters" });
    }

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
      if (!authResp.ok) return jsonResponse(res, authResp.status, { error: authData.message || authData.msg || "Auth user creation failed" });

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
      const referralCode = username.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const opResp = await sbFetch(`${SUPABASE_URL}/rest/v1/operators`, {
        method: "POST",
        body: JSON.stringify({
          profile_id: userId,
          username,
          referral_code: referralCode,
          plain_password: password,
          notes: notes || null,
          created_by: actor_id || adminUser.id,
          app_type: app_type || 'shube',
          ussd_template: ussd_template || undefined,
          ussd_reply_template: ussd_reply_template || undefined,
          subscription_expires_at: subscription_expires_at || undefined,
          activation_code: activation_code || undefined,
          activation_code_duration_minutes: activation_code_duration_minutes || undefined,
        }),
      });
      const opData = await opResp.json();
      if (!opResp.ok) return jsonResponse(res, opResp.status, { error: opData.message || opData.msg || "Operator insert failed" });

      // Step 4: Audit log (non-fatal)
      await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
        method: "POST",
        body: JSON.stringify({
          actor_id: actor_id || adminUser.id,
          actor_role: "admin",
          action: "operator_created",
          resource_type: "operator",
          resource_id: userId,
          description: `Created operator ${username}`
        }),
      }).catch(() => {});

      return jsonResponse(res, 201, {
        user_id: userId,
        operator: Array.isArray(opData) ? opData[0] : opData,
        subscription_expires_at,
        activation_code,
        duration_minutes: activation_code_duration_minutes
      });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message || "Internal server error" });
    }
  }

  // ── DELETE /api/operators?profile_id=... — delete operator ────────────────
  if (req.method === 'DELETE') {
    const profile_id = req.query.profile_id;
    if (!profile_id) return jsonResponse(res, 400, { error: "profile_id query param required" });

    try {
      // 1. Try atomic database RPC (deletes devices, operators, bundle_rules, profiles, auth.users)
      const rpcResp = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/admin_delete_operator`, {
        method: "POST",
        body: JSON.stringify({ target_profile_id: profile_id }),
      });
      const rpcData = await rpcResp.json().catch(() => ({}));

      if (!rpcResp.ok || rpcData?.success === false) {
        const delResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, { method: "DELETE" });
        if (!delResp.ok && delResp.status !== 404) {
          const delData = await delResp.json().catch(() => ({}));
          return jsonResponse(res, delResp.status, { error: delData.message || delData.msg || rpcData?.error || "Failed to delete user" });
        }
      }

      await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
        method: "POST",
        body: JSON.stringify({
          actor_id: adminUser.id,
          actor_role: "admin",
          action: "operator_deleted",
          resource_type: "operator",
          resource_id: profile_id,
          description: `Deleted operator ${profile_id}`
        }),
      }).catch(() => {});

      return jsonResponse(res, 200, { success: true });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  return jsonResponse(res, 405, { error: "Method not allowed" });
}

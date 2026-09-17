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
    let { email, password, full_name, username, phone_number, notes, actor_id, app_type, ussd_template, ussd_reply_template } = req.body || {};
    
    if (!email && username) {
      if (app_type === 'shube') {
        email = `${username}@shube.app`;
      } else {
        email = `${username}@geesh.app`;
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
      const opResp = await sbFetch(`${SUPABASE_URL}/rest/v1/operators`, {
        method: "POST",
        body: JSON.stringify({
          profile_id: userId,
          username,
          notes: notes || null,
          created_by: actor_id || adminUser.id,
          app_type: app_type || 'shube',
          ussd_template: ussd_template || undefined,
          ussd_reply_template: ussd_reply_template || undefined,
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

      return jsonResponse(res, 201, { user_id: userId, operator: Array.isArray(opData) ? opData[0] : opData });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message || "Internal server error" });
    }
  }

  // ── DELETE /api/operators?profile_id=... — delete operator ────────────────
  if (req.method === 'DELETE') {
    const profile_id = req.query.profile_id;
    if (!profile_id) return jsonResponse(res, 400, { error: "profile_id query param required" });

    try {
      const delResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, { method: "DELETE" });
      if (!delResp.ok) {
        const delData = await delResp.json().catch(() => ({}));
        return jsonResponse(res, delResp.status, { error: delData.message || delData.msg || "Failed to delete user" });
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

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

  if (req.method === 'POST') {
    const { email, password, username, role, phone_number, max_daily_limit } = req.body || {};
    if (!email || !password || !username) {
      return jsonResponse(res, 400, { error: "Missing required fields" });
    }

    try {
      const createResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: role || 'operator', username, phone_number, max_daily_limit }
        })
      });

      const data = await createResp.json();
      if (!createResp.ok) return jsonResponse(res, createResp.status, { error: data.message || "Failed to create user" });

      await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
        method: "POST",
        body: JSON.stringify({
          actor_id: adminUser.id,
          actor_role: "admin",
          action: "operator_created",
          resource_type: "operator",
          resource_id: data.id,
          description: `Created operator ${username}`
        }),
      }).catch(() => {});

      return jsonResponse(res, 201, { success: true, user: data });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

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

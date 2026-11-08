import { SUPABASE_URL, sbFetch, verifyAdmin, callerJwt, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: "Method not allowed" });

  const jwt = callerJwt(req);
  const adminUser = await verifyAdmin(jwt);
  if (!adminUser) return jsonResponse(res, 403, { error: "Admin access required" });

  const { profile_id, new_password, username } = req.body || {};
  if (!profile_id || !new_password) return jsonResponse(res, 400, { error: "profile_id and new_password required" });

  try {
    const updateResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
      method: "PUT",
      body: JSON.stringify({ password: new_password })
    });
    
    if (!updateResp.ok) {
      const data = await updateResp.json().catch(() => ({}));
      return jsonResponse(res, updateResp.status, { error: data.message || "Failed to reset password" });
    }

    await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      body: JSON.stringify({
        actor_id: adminUser.id,
        actor_role: "admin",
        action: "password_reset",
        resource_type: "operator",
        resource_id: profile_id,
        description: `Reset password for operator ${username || profile_id}`
      }),
    }).catch(() => {});

    return jsonResponse(res, 200, { success: true });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
}

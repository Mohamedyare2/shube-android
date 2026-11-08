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

  const { profile_id, username } = req.body || {};
  const targetPassword = req.body?.new_password || req.body?.password;
  if (!profile_id || !targetPassword) return jsonResponse(res, 400, { error: "profile_id and password required" });

  try {
    const updateResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
      method: "PUT",
      body: JSON.stringify({ password: targetPassword })
    });
    
    if (!updateResp.ok) {
      const data = await updateResp.json().catch(() => ({}));
      return jsonResponse(res, updateResp.status, { error: data.message || "Failed to reset password" });
    }

    // Update plain_password in operators table so admin can view it
    await sbFetch(
      `${SUPABASE_URL}/rest/v1/operators?profile_id=eq.${profile_id}`,
      {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({ plain_password: targetPassword }),
      }
    ).catch(err => console.error("Failed to update plain_password in operators:", err));

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

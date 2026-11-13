import { SUPABASE_URL, sbFetch, verifyAdmin, callerJwt, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const jwt = callerJwt(req);
  const adminUser = await verifyAdmin(jwt);
  if (!adminUser) return jsonResponse(res, 403, { error: "Admin access required" });

  const profile_id = req.query.profile_id;
  if (!profile_id) return jsonResponse(res, 400, { error: "profile_id required" });

  // ── DELETE /api/operators/:profile_id ──────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const { actor_id, username } = req.body || {};

      // 1. Try atomic database RPC (deletes devices, operators, bundle_rules, profiles, auth.users)
      const rpcResp = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/admin_delete_operator`, {
        method: "POST",
        body: JSON.stringify({ target_profile_id: profile_id }),
      });
      const rpcData = await rpcResp.json().catch(() => ({}));

      if (!rpcResp.ok || rpcData?.success === false) {
        // Fallback: Delete from auth.users directly
        const delResp = await sbFetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
          method: "DELETE",
        });

        if (!delResp.ok && delResp.status !== 404) {
          const delData = await delResp.json().catch(() => ({}));
          return jsonResponse(res, delResp.status, {
            error: delData.message || delData.msg || rpcData?.error || "Failed to delete user"
          });
        }
      }

      // Audit log (non-fatal)
      await sbFetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
        method: "POST",
        body: JSON.stringify({
          actor_id: actor_id || adminUser.id,
          actor_role: "admin",
          action: "operator_deleted",
          resource_type: "operator",
          resource_id: profile_id,
          description: `Deleted operator ${username || profile_id}`
        }),
      }).catch(() => {});

      return jsonResponse(res, 200, { success: true });
    } catch (err) {
      console.error("[delete-operator]", err);
      return jsonResponse(res, 500, { error: err.message || "Internal server error" });
    }
  }

  // ── PUT /api/operators/:profile_id/status (Freeze / Unfreeze / Status) ──────
  if (req.method === 'PUT') {
    const { status, actor_id } = req.body || {};
    try {
      if (status && ["active", "frozen", "disabled"].includes(status)) {
        await sbFetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile_id}`, {
          method: "PATCH",
          body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
        });

        // Also update devices
        if (status === 'disabled' || status === 'frozen') {
          // get operator id
          const opRes = await sbFetch(`${SUPABASE_URL}/rest/v1/operators?profile_id=eq.${profile_id}&select=id`);
          const opData = await opRes.json();
          if (opData && opData.length > 0) {
            await sbFetch(`${SUPABASE_URL}/rest/v1/devices?operator_id=eq.${opData[0].id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: 'disabled', revoked: true, revoked_at: new Date().toISOString() }),
            });
          }
        }
      }
      return jsonResponse(res, 200, { success: true });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  return jsonResponse(res, 405, { error: "Method not allowed" });
}

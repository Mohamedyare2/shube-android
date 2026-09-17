import { SUPABASE_URL, sbFetch, callerJwt, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: "Method not allowed" });

  const jwt = callerJwt(req);
  if (!jwt) return jsonResponse(res, 401, { error: "Unauthorized" });

  const { device_name, operator_id } = req.body || {};
  if (!device_name || !operator_id) return jsonResponse(res, 400, { error: "device_name and operator_id required" });

  try {
    // ── 1-Device-Per-Operator: Hubi hore in operator-ku device lahayn ──
    const existCheck = await sbFetch(
      `${SUPABASE_URL}/rest/v1/devices?operator_id=eq.${operator_id}&status=neq.deleted&select=id,device_name,status`
    );
    const existing = await existCheck.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return jsonResponse(res, 409, {
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
      const errData = await resp.json().catch(()=>({}));
      return jsonResponse(res, resp.status, { error: errData.message || "Failed to generate pairing code" });
    }
    return jsonResponse(res, 200, { pairing_code });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
}

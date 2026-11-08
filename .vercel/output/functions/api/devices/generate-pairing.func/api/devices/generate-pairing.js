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

import { SUPABASE_URL, sbFetch, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: "Method not allowed" });

  const { pairing_code, device_identifier } = req.body || {};
  if (!pairing_code) return jsonResponse(res, 400, { error: "pairing_code required" });

  try {
    const temp_identifier = `PAIR-${pairing_code}`;
    const getResp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?device_identifier=eq.${temp_identifier}&select=*`);
    const devices = await getResp.json();
    
    if (!devices || devices.length === 0) {
      return jsonResponse(res, 404, { error: "Invalid pairing code" });
    }

    const device = devices[0];
    const real_identifier = device_identifier || `DEV-${device.id}`;
    
    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device.id}`, {
      method: "PATCH",
      body: JSON.stringify({ device_identifier: real_identifier, status: 'online', last_seen: new Date().toISOString() }),
    });

    return jsonResponse(res, 200, { success: true, device_id: device.id, operator_id: device.operator_id });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
}

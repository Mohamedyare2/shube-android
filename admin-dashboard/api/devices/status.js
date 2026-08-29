import { SUPABASE_URL, sbFetch, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: "Method not allowed" });

  const device_id = req.query.device_id;
  if (!device_id) return jsonResponse(res, 400, { error: "device_id query param required" });

  try {
    const getResp = await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}&select=revoked`);
    const devices = await getResp.json();
    
    if (!devices || devices.length === 0) {
      return jsonResponse(res, 404, { error: "Device not found" });
    }

    return jsonResponse(res, 200, { revoked: devices[0].revoked === true });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
}

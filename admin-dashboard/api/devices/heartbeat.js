import { SUPABASE_URL, sbFetch, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: "Method not allowed" });

  const { device_id, app_version, android_version, gateway_enabled, battery_level, is_charging, network_type } = req.body || {};
  if (!device_id) return jsonResponse(res, 400, { error: "device_id required" });

  try {
    const now = new Date().toISOString();
    const updateBody = { last_seen: now, last_ping_at: now, status: 'online' };
    if (app_version) updateBody.app_version = app_version;
    if (android_version) updateBody.android_version = android_version;
    if (gateway_enabled !== undefined) updateBody.gateway_enabled = gateway_enabled;
    if (battery_level !== undefined) updateBody.battery_level = battery_level;
    if (is_charging !== undefined) updateBody.is_charging = is_charging;
    if (network_type !== undefined) updateBody.network_type = network_type;

    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
      method: "PATCH",
      body: JSON.stringify(updateBody),
    });

    return jsonResponse(res, 200, { success: true });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
}

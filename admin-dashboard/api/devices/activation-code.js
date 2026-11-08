// Vercel Serverless Function — POST /api/devices/activation-code
// Admin generates an 8-digit activation code for a device or operator.

import { SUPABASE_URL, sbFetch, verifyAdmin, callerJwt, jsonResponse } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const jwt = callerJwt(req);
  const adminUser = await verifyAdmin(jwt);
  if (!adminUser) return jsonResponse(res, 403, { error: 'Admin access required' });

  const { device_id, operator_id, days = 0, hours = 0, minutes = 0 } = req.body || {};

  const totalMinutes = (parseInt(days) || 0) * 1440 + (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
  if (totalMinutes <= 0) {
    return jsonResponse(res, 400, { error: 'Fadlan geli ugu yaraan 1 daqiiqo ama maalin (Duration required)' });
  }

  const activation_code = Math.floor(10000000 + Math.random() * 90000000).toString();

  try {
    if (device_id) {
      await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          activation_code,
          activation_code_duration_minutes: totalMinutes,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    if (operator_id) {
      await sbFetch(`${SUPABASE_URL}/rest/v1/operators?id=eq.${operator_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          activation_code,
          activation_code_duration_minutes: totalMinutes,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    return jsonResponse(res, 200, {
      success: true,
      activation_code,
      duration_minutes: totalMinutes,
      days: parseInt(days) || 0,
      hours: parseInt(hours) || 0,
      minutes: parseInt(minutes) || 0,
    });
  } catch (err) {
    console.error('[generate-activation-code]', err);
    return jsonResponse(res, 500, { error: err.message || 'Internal server error' });
  }
}

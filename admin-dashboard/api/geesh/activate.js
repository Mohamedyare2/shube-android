// Vercel Serverless Function — POST /api/geesh/activate
// Called by Geesh Android App to activate/renew subscription using 8-digit code.

import { SUPABASE_URL, sbFetch } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { device_identifier, activation_code } = req.body || {};
  if (!device_identifier || !activation_code) {
    return res.status(400).json({ error: 'device_identifier and activation_code required' });
  }

  try {
    const devResp = await sbFetch(
      `${SUPABASE_URL}/rest/v1/devices?device_identifier=eq.${device_identifier}&select=*`
    );
    const devices = await devResp.json();
    if (!devResp.ok || !devices || devices.length === 0) {
      return res.status(404).json({
        error: 'Device-kan lama helin ama waa la tirtiray. La xiriir Admin-ka.',
        is_deleted: true,
      });
    }

    const device = devices[0];

    // Check if revoked
    if (device.revoked || device.status === 'disabled') {
      return res.status(403).json({
        error: 'Device-kan waa la joojiyay (Revoked). Lama furi karo ilaa Admin-ku dib u soo celiyo.',
        is_revoked: true,
      });
    }

    // Also check operator-level activation_code if device-level is not set
    let activeCode = device.activation_code;
    let durationMinutes = Number(device.activation_code_duration_minutes) || 43200;

    if (!activeCode && device.operator_id) {
      const opResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/operators?id=eq.${device.operator_id}&select=activation_code,activation_code_duration_minutes`
      );
      const ops = await opResp.json();
      if (ops && ops.length > 0 && ops[0].activation_code) {
        activeCode = ops[0].activation_code;
        durationMinutes = Number(ops[0].activation_code_duration_minutes) || durationMinutes;
      }
    }

    if (!activeCode || activeCode.trim() !== activation_code.trim()) {
      return res.status(400).json({
        error: '8-da lambar ma saxna ama hore ayaa loo isticmaalay. Fadlan hubi lambarka ama la xiriir Admin-ka.',
      });
    }

    // Calculate expiration date with rollover
    const now = new Date();
    let baseTime = now.getTime();
    if (device.subscription_expires_at) {
      const existingExp = new Date(device.subscription_expires_at).getTime();
      if (existingExp > baseTime) {
        baseTime = existingExp;
      }
    }

    const newExpiresAt = new Date(baseTime + durationMinutes * 60 * 1000);

    // Update device
    await sbFetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${device.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        subscription_expires_at: newExpiresAt.toISOString(),
        activation_code: null, // burn code
        activated_at: now.toISOString(),
        status: 'online',
        last_seen: now.toISOString(),
        revoked: false,
      }),
    });

    // Also update operator if matched
    if (device.operator_id) {
      await sbFetch(`${SUPABASE_URL}/rest/v1/operators?id=eq.${device.operator_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          subscription_expires_at: newExpiresAt.toISOString(),
          activation_code: null,
        }),
      });
    }

    return res.status(200).json({
      success: true,
      subscription_expires_at: newExpiresAt.toISOString(),
      expires_timestamp: newExpiresAt.getTime(),
      server_time: now.toISOString(),
      duration_minutes: durationMinutes,
    });
  } catch (err) {
    console.error('[geesh-activate]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

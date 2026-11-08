// Vercel Serverless Function — POST /api/geesh/check-license
// Checks device license status / revocation.

import { SUPABASE_URL, sbFetch } from '../_utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { device_identifier } = req.body || {};
  if (!device_identifier) {
    return res.status(400).json({ error: 'device_identifier required' });
  }

  try {
    const devResp = await sbFetch(
      `${SUPABASE_URL}/rest/v1/devices?device_identifier=eq.${device_identifier}&select=id,status,revoked,subscription_expires_at,operator_id`
    );
    const devices = await devResp.json();
    if (!devResp.ok || !devices || devices.length === 0) {
      return res.status(404).json({ error: 'Device-ka waa la tirtiray.', is_deleted: true });
    }

    const device = devices[0];
    if (device.revoked || device.status === 'disabled') {
      return res.status(403).json({
        error: 'Device-kan waa la joojiyay (Revoked).',
        is_revoked: true,
        subscription_expires_at: device.subscription_expires_at,
      });
    }

    return res.status(200).json({
      success: true,
      subscription_expires_at: device.subscription_expires_at,
      expires_timestamp: device.subscription_expires_at ? new Date(device.subscription_expires_at).getTime() : null,
      is_revoked: false,
      server_time: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[geesh-check-license]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

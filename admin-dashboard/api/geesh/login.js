// Vercel Serverless Function — POST /api/geesh/login
// Mirrors the logic from admin-api/server.mjs for the Geesh Android App.
// Called when user logs into the Geesh App with username + password + device_identifier.

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbFetch } from '../_utils.js';

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password, device_identifier, device_name } = req.body || {};

  if (!username || !password || !device_identifier) {
    return res.status(400).json({ error: 'username, password, and device_identifier are required' });
  }

  // Geesh accounts use the pattern username@geesh.app unless a full email is given
  const email = username.includes('@') ? username : `${username}@geesh.app`;

  try {
    // ── Step 1: Authenticate with Supabase Auth ────────────────────────────
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const authData = await authResp.json();
    if (!authResp.ok) {
      return res.status(401).json({ error: authData.error_description || authData.msg || 'Invalid credentials' });
    }

    const userId = authData.user.id;

    // ── Step 2: Find Operator record + USSD templates ──────────────────────
    const opResp = await sbFetch(
      `${SUPABASE_URL}/rest/v1/operators?profile_id=eq.${userId}&select=id,username,ussd_template,ussd_reply_template`
    );
    const opData = await opResp.json();

    if (!opResp.ok || opData.length === 0) {
      return res.status(403).json({ error: 'Operator not found' });
    }

    const operatorId = opData[0].id;

    // ── Step 3: Check Device Binding (1 account = 1 active device) ─────────
    const devResp = await sbFetch(
      `${SUPABASE_URL}/rest/v1/devices?operator_id=eq.${operatorId}&revoked=eq.false`
    );
    const devices = await devResp.json();

    if (Array.isArray(devices) && devices.length > 0) {
      const existingDevice = devices[0];
      if (existingDevice.device_identifier !== device_identifier) {
        return res.status(403).json({
          error: 'Account is already logged in on another device. Admin must delete the old device first.',
        });
      }
    }

    // ── Step 4: Upsert Device (update if exists, insert if new) ───────────
    const allDevResp = await sbFetch(
      `${SUPABASE_URL}/rest/v1/devices?device_identifier=eq.${device_identifier}`
    );
    const allDevices = await allDevResp.json();

    if (Array.isArray(allDevices) && allDevices.length > 0) {
      await sbFetch(`${SUPABASE_URL}/rest/v1/devices?device_identifier=eq.${device_identifier}`, {
        method: 'PATCH',
        body: JSON.stringify({
          operator_id: operatorId,
          device_name: device_name || 'Geesh Device',
          status: 'online',
          last_seen: new Date().toISOString(),
          revoked: false,
        }),
      });
    } else {
      await sbFetch(`${SUPABASE_URL}/rest/v1/devices`, {
        method: 'POST',
        body: JSON.stringify({
          operator_id: operatorId,
          device_identifier,
          device_name: device_name || 'Geesh Device',
          status: 'online',
          last_seen: new Date().toISOString(),
        }),
      });
    }

    // ── Step 5: Return success ─────────────────────────────────────────────
    return res.status(200).json({
      access_token: authData.access_token,
      refresh_token: authData.refresh_token,
      user: authData.user,
      operator: opData[0],
    });

  } catch (err) {
    console.error('[geesh-login]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

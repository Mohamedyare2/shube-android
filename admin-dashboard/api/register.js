import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbFetch, jsonResponse } from './_utils.js';

const PHONE_RE = /^[0-9]{9}$/;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Checks whether an operator has an active 'registration_via_link' entitlement.
 * Returns { allowed: boolean, reason?: string, status?: string }
 */
async function checkOperatorFeatureAccess(operatorId) {
  try {
    const resp = await sbFetch(
      `${SUPABASE_URL}/rest/v1/operator_feature_access?operator_id=eq.${operatorId}&feature_key=eq.registration_via_link&select=status,expires_at&limit=1`
    );
    if (!resp.ok) {
      // If table doesn't exist yet, we do not lock the user out permanently until migration is run,
      // but if the table exists, we strictly enforce it.
      const text = await resp.text();
      console.warn('operator_feature_access query status:', resp.status, text);
      return { allowed: true, status: 'unconfigured' };
    }
    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { allowed: false, reason: 'FEATURE_NOT_GRANTED', status: 'inactive' };
    }
    const access = rows[0];
    if (access.status === 'suspended') {
      return { allowed: false, reason: 'FEATURE_SUSPENDED', status: 'suspended' };
    }
    if (access.status === 'expired') {
      return { allowed: false, reason: 'FEATURE_EXPIRED', status: 'expired' };
    }
    if (access.status !== 'active') {
      return { allowed: false, reason: 'FEATURE_INACTIVE', status: access.status || 'inactive' };
    }
    if (access.expires_at) {
      const exp = new Date(access.expires_at);
      if (exp.getTime() < Date.now()) {
        return { allowed: false, reason: 'FEATURE_EXPIRED', status: 'expired' };
      }
    }
    return { allowed: true, status: 'active' };
  } catch (err) {
    console.error('checkOperatorFeatureAccess error:', err);
    return { allowed: true, status: 'error_fallback' };
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract referral code from query params or route
  const rawCode = (req.query.code || req.query.slug || '').toString().trim();
  if (!rawCode) {
    return jsonResponse(res, 400, { error: 'MISSING_CODE', message: 'Referral code is required' });
  }

  // Normalize code: decode URI and lowercase
  let cleanCode = '';
  try {
    cleanCode = decodeURIComponent(rawCode).trim().toLowerCase();
  } catch (_) {
    cleanCode = rawCode.trim().toLowerCase();
  }

  // ── GET: fetch operator public details for landing page ──────
  if (req.method === 'GET') {
    try {
      const opResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/operators?referral_code=eq.${encodeURIComponent(cleanCode)}&select=id,username,referral_welcome_message,referral_active&limit=1`
      );
      if (!opResp.ok) {
        return jsonResponse(res, 500, { error: 'DB_ERROR', message: 'Database query failed' });
      }
      const ops = await opResp.json();
      if (!Array.isArray(ops) || ops.length === 0) {
        return jsonResponse(res, 404, {
          error: 'LINK_NOT_FOUND',
          message: 'Tixraacaan lama helin. Fadlan hubi in link-gu sax yahay.',
        });
      }

      const op = ops[0];
      if (op.referral_active === false) {
        return jsonResponse(res, 403, {
          error: 'LINK_DISABLED',
          message: 'Link-gan diiwaangelinta hadda wuu dansan yahay. Fadlan la xiriir maamulaha.',
        });
      }

      // Check premium feature access entitlement
      const accessCheck = await checkOperatorFeatureAccess(op.id);
      if (!accessCheck.allowed) {
        let msg = 'Adeegga link-ga diiwaangelinta uma furna operator-kan.';
        if (accessCheck.reason === 'FEATURE_SUSPENDED') {
          msg = 'Adeeggan diiwaangelinta si ku-meel-gaar ah ayaa loo hakiyay.';
        } else if (accessCheck.reason === 'FEATURE_EXPIRED') {
          msg = 'Waqtigii adeegga diiwaangelinta ee operator-kani wuu dhacay.';
        }
        return jsonResponse(res, 403, {
          error: accessCheck.reason || 'FEATURE_NOT_AUTHORIZED',
          message: `${msg} Fadlan la xiriir maamulaha si aad u furato.`,
        });
      }

      return jsonResponse(res, 200, {
        success: true,
        operator_id: op.id,
        username: op.username,
        welcome_message: op.referral_welcome_message || null,
      });
    } catch (err) {
      console.error('GET /api/register error:', err);
      return jsonResponse(res, 500, { error: 'SERVER_ERROR', message: err.message });
    }
  }

  // ── POST: register a new customer via referral ────────────────
  if (req.method === 'POST') {
    try {
      const { telesom_number, somtel_number } = req.body || {};

      const cleanTelesom = (telesom_number || '').toString().replace(/\D/g, '');
      const cleanSomtel = (somtel_number || '').toString().replace(/\D/g, '');

      if (!cleanTelesom || !cleanSomtel) {
        return jsonResponse(res, 400, { error: 'INVALID_INPUT', message: 'Labadaba number waa loo baahan yahay' });
      }
      if (!PHONE_RE.test(cleanTelesom)) {
        return jsonResponse(res, 400, { error: 'INVALID_TELESOM', message: 'Numberka lacagta (Telesom) waa inuu ahaadaa 9 nambar' });
      }
      if (!PHONE_RE.test(cleanSomtel)) {
        return jsonResponse(res, 400, { error: 'INVALID_SOMTEL', message: 'Numberka data-da (Somtel) waa inuu ahaadaa 9 nambar' });
      }

      // Resolve operator securely from server-side database lookup
      const opResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/operators?referral_code=eq.${encodeURIComponent(cleanCode)}&select=id,profile_id,username,referral_active&limit=1`
      );
      if (!opResp.ok) {
        return jsonResponse(res, 500, { error: 'DB_ERROR', message: 'Database query failed' });
      }
      const ops = await opResp.json();
      if (!Array.isArray(ops) || ops.length === 0) {
        return jsonResponse(res, 404, { error: 'LINK_NOT_FOUND', message: 'Referral link not found' });
      }
      const op = ops[0];

      if (op.referral_active === false) {
        return jsonResponse(res, 403, { error: 'LINK_DISABLED', message: 'Link-gan diiwaangelinta hadda wuu dansan yahay.' });
      }

      // Check premium feature entitlement before allowing submission
      const accessCheck = await checkOperatorFeatureAccess(op.id);
      if (!accessCheck.allowed) {
        return jsonResponse(res, 403, {
          error: accessCheck.reason || 'FEATURE_NOT_AUTHORIZED',
          message: 'Adeegga diiwaangelinta ee operator-kani ma shaqaynayo hadda.',
        });
      }

      // Check if customer already exists for this operator
      const existResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/customers?created_by=eq.${op.profile_id}&telesom_number=eq.${cleanTelesom}&select=id&limit=1`
      );
      const existing = await existResp.json();

      let customerId;
      if (Array.isArray(existing) && existing.length > 0) {
        // Update existing record: update somtel_number and ensure active
        customerId = existing[0].id;
        await sbFetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${customerId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            somtel_number: cleanSomtel,
            active: true,
            updated_at: new Date().toISOString(),
          }),
        });
      } else {
        // Insert new customer record with proper attribution
        const insertResp = await sbFetch(`${SUPABASE_URL}/rest/v1/customers`, {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            telesom_number: cleanTelesom,
            somtel_number: cleanSomtel,
            customer_name: cleanTelesom,
            active: true,
            registration_source: 'referral_link',
            referred_by_operator_id: op.id,
            created_by: op.profile_id,
          }),
        });
        if (!insertResp.ok) {
          const errBody = await insertResp.json();
          throw new Error(errBody?.message || 'Failed to save customer');
        }
        const inserted = await insertResp.json();
        customerId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
      }

      // Record referral visit conversion
      sbFetch(`${SUPABASE_URL}/rest/v1/referral_visits`, {
        method: 'POST',
        body: JSON.stringify({
          operator_id: op.id,
          converted: true,
          user_agent: req.headers['user-agent'] || null,
        }),
      }).catch(() => {});

      return jsonResponse(res, 200, {
        success: true,
        customer_id: customerId,
        message: 'Diiwaan gelinta waa lagu guuleystay! Macluumaadkaaga si nabadgelyo leh ayaa loo helay.',
      });
    } catch (err) {
      console.error('POST /api/register error:', err);
      return jsonResponse(res, 500, { error: 'SERVER_ERROR', message: err.message || 'Server error' });
    }
  }

  return jsonResponse(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
}

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbFetch, jsonResponse } from '../../_utils.js';

const PHONE_RE = /^[0-9]{9}$/;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code } = req.query;
  if (!code) return jsonResponse(res, 400, { error: 'Missing referral code' });

  // ── GET: fetch operator info for landing page ──────────────
  if (req.method === 'GET') {
    try {
      const opResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/operators?referral_code=eq.${encodeURIComponent(code)}&referral_active=eq.true&select=id,username,referral_welcome_message,referral_active&limit=1`
      );
      const ops = await opResp.json();
      if (!Array.isArray(ops) || ops.length === 0) {
        return jsonResponse(res, 404, { error: 'Referral link not found or inactive' });
      }
      const op = ops[0];
      return jsonResponse(res, 200, {
        operator_id: op.id,
        username: op.username,
        welcome_message: op.referral_welcome_message || null,
      });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  // ── POST: register a customer ───────────────────────────────
  if (req.method === 'POST') {
    try {
      const { telesom_number, somtel_number } = req.body || {};

      if (!telesom_number || !somtel_number) {
        return jsonResponse(res, 400, { error: 'Both phone numbers are required' });
      }
      if (!PHONE_RE.test(telesom_number)) {
        return jsonResponse(res, 400, { error: 'Numberka lacagta (Telesom) waa inuu ahaadaa 9 nambar' });
      }
      if (!PHONE_RE.test(somtel_number)) {
        return jsonResponse(res, 400, { error: 'Numberka data-da (Somtel) waa inuu ahaadaa 9 nambar' });
      }

      // Resolve operator from referral_code (server-side, not from client)
      const opResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/operators?referral_code=eq.${encodeURIComponent(code)}&referral_active=eq.true&select=id,profile_id&limit=1`
      );
      const ops = await opResp.json();
      if (!Array.isArray(ops) || ops.length === 0) {
        return jsonResponse(res, 404, { error: 'Referral link not found or inactive' });
      }
      const operator = ops[0];

      // Check if customer already exists for this operator
      const existResp = await sbFetch(
        `${SUPABASE_URL}/rest/v1/customers?created_by=eq.${operator.profile_id}&telesom_number=eq.${telesom_number}&select=id&limit=1`
      );
      const existing = await existResp.json();

      let customerId;
      if (Array.isArray(existing) && existing.length > 0) {
        // Update existing record with the new somtel_number
        customerId = existing[0].id;
        await sbFetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${customerId}`, {
          method: 'PATCH',
          body: JSON.stringify({ somtel_number, active: true }),
        });
      } else {
        // Insert new customer record
        const insertResp = await sbFetch(`${SUPABASE_URL}/rest/v1/customers`, {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            telesom_number,
            somtel_number,
            active: true,
            registration_source: 'referral_link',
            referred_by_operator_id: operator.id,
            created_by: operator.profile_id,
          }),
        });
        if (!insertResp.ok) {
          const errBody = await insertResp.json();
          throw new Error(errBody?.message || 'Failed to register customer');
        }
        const inserted = await insertResp.json();
        customerId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
      }

      // Mark the referral visit as converted (best-effort)
      sbFetch(`${SUPABASE_URL}/rest/v1/referral_visits?operator_id=eq.${operator.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ converted: true }),
      }).catch(() => {});

      return jsonResponse(res, 200, {
        success: true,
        customer_id: customerId,
        message: 'Diiwaan gelinta waa lagu guuleystay!',
      });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message || 'Server error' });
    }
  }

  return jsonResponse(res, 405, { error: 'Method not allowed' });
}

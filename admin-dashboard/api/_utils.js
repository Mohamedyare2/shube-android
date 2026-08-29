// Utility functions for Vercel Serverless API

export const SUPABASE_URL = process.env.SUPABASE_URL || "https://eabwhgujwywwiormujrr.supabase.co";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function sbFetch(url, options = {}) {
  const headers = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}

export function callerJwt(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1];
}

export async function verifyAdmin(jwt) {
  if (!jwt) return null;
  const url = `${SUPABASE_URL}/auth/v1/user`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    }
  });
  if (!res.ok) return null;
  const user = await res.json();
  // Supabase stores role in app_metadata
  const role = user?.app_metadata?.role || user?.user_metadata?.role;
  if (role !== "admin") return null;
  return user;
}

export function jsonResponse(res, status, data) {
  return res.status(status).json(data);
}

"""
SHUBE Admin API — Flask Backend
================================
Proxies privileged Supabase Auth Admin operations that require
the service_role key. NEVER expose this server publicly without
authentication middleware.

Routes
------
POST /api/operators          — create a new auth user + operator record
POST /api/operators/reset-password — reset an operator password
GET  /api/health             — liveness check
"""

import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# ─── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL          = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY      = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PORT                  = int(os.environ.get("PORT", 5050))
CORS_ORIGINS          = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:4173"
).split(",")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. "
        "Copy admin-api/.env.example → admin-api/.env and fill in your values."
    )

# ─── App setup ───────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": CORS_ORIGINS}})


def supabase_admin_headers() -> dict:
    """Headers required for Supabase Auth Admin API calls."""
    return {
        "apikey":        SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type":  "application/json",
    }


def supabase_anon_headers(jwt: str) -> dict:
    """
    Headers for normal Supabase REST calls.
    We forward the caller's JWT so RLS still applies for non-admin operations.
    """
    return {
        "apikey":        SERVICE_ROLE_KEY,   # service key to bypass RLS where needed
        "Authorization": f"Bearer {jwt}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }


def caller_jwt() -> str | None:
    """Extract JWT from the incoming Authorization header."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


# ─── Health ──────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "shube-admin-api"})


# ─── Create Operator ─────────────────────────────────────────────────────────
@app.post("/api/operators")
def create_operator():
    """
    Body (JSON):
        email           str  required
        password        str  required
        full_name       str  required
        username        str  required
        phone_number    str  optional
        notes           str  optional
        actor_id        str  UUID of the admin performing the action
    """
    jwt = caller_jwt()
    if not jwt:
        return jsonify({"error": "Unauthorized — missing bearer token"}), 401

    body = request.get_json(silent=True) or {}
    email       = (body.get("email") or "").strip()
    password    = (body.get("password") or "").strip()
    full_name   = (body.get("full_name") or "").strip()
    username    = (body.get("username") or "").strip()
    phone       = (body.get("phone_number") or "").strip() or None
    notes       = (body.get("notes") or "").strip() or None
    actor_id    = body.get("actor_id")

    # ── Validate ──────────────────────────────────────────────────────────────
    if not email or not password or not full_name or not username:
        return jsonify({"error": "email, password, full_name, and username are required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    # ── Step 1: Create auth user via Supabase Auth Admin API ─────────────────
    auth_resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=supabase_admin_headers(),
        json={
            "email":          email,
            "password":       password,
            "email_confirm":  True,
            "user_metadata":  {"role": "operator", "full_name": full_name},
        },
        timeout=15,
    )

    if not auth_resp.ok:
        err = auth_resp.json()
        msg = err.get("message") or err.get("msg") or auth_resp.text
        return jsonify({"error": msg}), auth_resp.status_code

    new_user = auth_resp.json()
    user_id  = new_user["id"]

    # ── Step 2: Update the auto-created profile ────────────────────────────────
    prof_resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}",
        headers={**supabase_admin_headers(), "Prefer": "return=representation"},
        json={
            "role":                  "operator",
            "full_name":             full_name,
            "phone_number":          phone,
            "force_password_change": True,
        },
        timeout=10,
    )
    if not prof_resp.ok:
        # Non-fatal — profile trigger may need a moment; log and continue
        app.logger.warning("Profile update failed: %s", prof_resp.text)

    # ── Step 3: Insert operator record ────────────────────────────────────────
    op_resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/operators",
        headers={**supabase_admin_headers(), "Prefer": "return=representation"},
        json={
            "profile_id":  user_id,
            "username":    username,
            "notes":       notes,
            "created_by":  actor_id,
        },
        timeout=10,
    )
    if not op_resp.ok:
        err = op_resp.json()
        msg = err.get("message") or err.get("msg") or op_resp.text
        return jsonify({"error": f"Operator record failed: {msg}"}), op_resp.status_code

    operator = op_resp.json()[0] if op_resp.json() else {}

    # ── Step 4: Audit log ─────────────────────────────────────────────────────
    requests.post(
        f"{SUPABASE_URL}/rest/v1/audit_logs",
        headers=supabase_admin_headers(),
        json={
            "actor_id":      actor_id,
            "actor_role":    "admin",
            "action":        "operator_created",
            "resource_type": "operator",
            "resource_id":   user_id,
            "description":   f"Created operator {username}",
        },
        timeout=10,
    )

    return jsonify({"user_id": user_id, "operator": operator}), 201


# ─── Reset Operator Password ──────────────────────────────────────────────────
@app.post("/api/operators/reset-password")
def reset_password():
    """
    Body (JSON):
        profile_id   str  UUID of the operator profile (auth user id)
        password     str  new temporary password
        username     str  operator username (for audit log)
        operator_id  str  UUID of the operators table row
        actor_id     str  UUID of the admin performing the action
    """
    jwt = caller_jwt()
    if not jwt:
        return jsonify({"error": "Unauthorized — missing bearer token"}), 401

    body        = request.get_json(silent=True) or {}
    profile_id  = body.get("profile_id")
    password    = (body.get("password") or "").strip()
    username    = body.get("username", "")
    operator_id = body.get("operator_id")
    actor_id    = body.get("actor_id")

    if not profile_id or not password:
        return jsonify({"error": "profile_id and password are required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    # ── Step 1: Update auth password via Admin API ────────────────────────────
    pw_resp = requests.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{profile_id}",
        headers=supabase_admin_headers(),
        json={"password": password},
        timeout=15,
    )
    if not pw_resp.ok:
        err = pw_resp.json()
        msg = err.get("message") or err.get("msg") or pw_resp.text
        return jsonify({"error": msg}), pw_resp.status_code

    # ── Step 2: Mark force_password_change ────────────────────────────────────
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{profile_id}",
        headers=supabase_admin_headers(),
        json={"force_password_change": True},
        timeout=10,
    )

    # ── Step 3: Audit log ─────────────────────────────────────────────────────
    requests.post(
        f"{SUPABASE_URL}/rest/v1/audit_logs",
        headers=supabase_admin_headers(),
        json={
            "actor_id":      actor_id,
            "actor_role":    "admin",
            "action":        "operator_password_reset",
            "resource_type": "operator",
            "resource_id":   operator_id,
            "description":   f"Password reset for {username}",
        },
        timeout=10,
    )

    return jsonify({"success": True}), 200


# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)

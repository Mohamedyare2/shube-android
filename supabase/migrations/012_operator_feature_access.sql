-- ============================================================
-- SHUBE – Migration 012: Operator Feature Access (Paid/Premium)
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Table for operator feature access entitlements
CREATE TABLE IF NOT EXISTS public.operator_feature_access (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_id         UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    feature_key         TEXT NOT NULL DEFAULT 'registration_via_link',
    status              TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'suspended', 'expired')),
    payment_reference   TEXT,
    notes               TEXT,
    granted_by          UUID REFERENCES public.profiles(id),
    granted_at          TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoked_by          UUID REFERENCES public.profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(operator_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_feature_access_op_key ON public.operator_feature_access(operator_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_access_status ON public.operator_feature_access(status);

-- 2. Table for feature access change history / audit
CREATE TABLE IF NOT EXISTS public.operator_feature_history (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_id         UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    feature_key         TEXT NOT NULL DEFAULT 'registration_via_link',
    action              TEXT NOT NULL, -- 'granted', 'revoked', 'suspended', 'expired', 'updated'
    previous_status     TEXT,
    new_status          TEXT NOT NULL,
    payment_reference   TEXT,
    reason              TEXT,
    performed_by        UUID REFERENCES public.profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_history_op ON public.operator_feature_history(operator_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.operator_feature_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_feature_history ENABLE ROW LEVEL SECURITY;

-- Admin policies: Super Admin has full CRUD
DROP POLICY IF EXISTS "feature_access_admin_all" ON public.operator_feature_access;
CREATE POLICY "feature_access_admin_all"
    ON public.operator_feature_access FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- Operator policies: Operators can ONLY READ their own entitlement row
DROP POLICY IF EXISTS "feature_access_operator_read" ON public.operator_feature_access;
CREATE POLICY "feature_access_operator_read"
    ON public.operator_feature_access FOR SELECT
    TO authenticated
    USING (
        operator_id IN (
            SELECT id FROM public.operators WHERE profile_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "feature_history_admin_all" ON public.operator_feature_history;
CREATE POLICY "feature_history_admin_all"
    ON public.operator_feature_history FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- 4. Initial populate: create default 'inactive' rows for existing operators if they don't have one
INSERT INTO public.operator_feature_access (operator_id, feature_key, status)
SELECT id, 'registration_via_link', 'inactive'
FROM public.operators
ON CONFLICT (operator_id, feature_key) DO NOTHING;

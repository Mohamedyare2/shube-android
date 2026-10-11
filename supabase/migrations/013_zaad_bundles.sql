-- ============================================================
-- SHUBE – Migration 013: ZAAD Payment Info + Operator Bundles
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add ZAAD payment fields to operator_feature_access
ALTER TABLE public.operator_feature_access
    ADD COLUMN IF NOT EXISTS zaad_number     TEXT,
    ADD COLUMN IF NOT EXISTS zaad_account_name TEXT;

-- 2. Create operator_bundles table (5 configurable bundles per operator)
CREATE TABLE IF NOT EXISTS public.operator_bundles (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_id     UUID        NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    slot            INTEGER     NOT NULL CHECK (slot BETWEEN 1 AND 5),
    bundle_name     TEXT,
    bundle_price    NUMERIC(10, 2) CHECK (bundle_price IS NULL OR bundle_price >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(operator_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_operator_bundles_op ON public.operator_bundles(operator_id);

-- 3. RLS for operator_bundles
ALTER TABLE public.operator_bundles ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
DROP POLICY IF EXISTS "bundles_admin_all" ON public.operator_bundles;
CREATE POLICY "bundles_admin_all"
    ON public.operator_bundles FOR ALL TO authenticated
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- Operators can read and write only their own bundles
DROP POLICY IF EXISTS "bundles_operator_own" ON public.operator_bundles;
CREATE POLICY "bundles_operator_own"
    ON public.operator_bundles FOR ALL TO authenticated
    USING (
        operator_id IN (SELECT id FROM public.operators WHERE profile_id = auth.uid())
    )
    WITH CHECK (
        operator_id IN (SELECT id FROM public.operators WHERE profile_id = auth.uid())
    );

-- Public can SELECT bundles for active operators (needed for referral page)
DROP POLICY IF EXISTS "bundles_public_read" ON public.operator_bundles;
CREATE POLICY "bundles_public_read"
    ON public.operator_bundles FOR SELECT TO anon
    USING (true);

-- 4. Grant privileges to authenticated + anon roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_bundles TO authenticated;
GRANT SELECT ON public.operator_bundles TO anon;

-- 5. Also fix existing operator_feature_access grants (in case migration 012 missed this)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_feature_access TO authenticated;
GRANT SELECT ON public.operator_feature_access TO anon;
GRANT SELECT, INSERT ON public.operator_feature_history TO authenticated;

-- 6. Initialize 5 blank bundle slots for all existing operators
INSERT INTO public.operator_bundles (operator_id, slot)
SELECT o.id, s.slot
FROM public.operators o
CROSS JOIN (SELECT generate_series(1,5) AS slot) s
ON CONFLICT (operator_id, slot) DO NOTHING;

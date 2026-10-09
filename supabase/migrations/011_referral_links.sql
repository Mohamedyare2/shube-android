-- ============================================================
-- SHUBE – Migration 011: Operator Referral Links
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add referral_code (slug) to operators table
ALTER TABLE public.operators
    ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS referral_welcome_message TEXT,
    ADD COLUMN IF NOT EXISTS referral_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Generate a unique referral_code for each existing operator (use their username if available)
UPDATE public.operators
SET referral_code = LOWER(REGEXP_REPLACE(username, '[^a-zA-Z0-9]', '-', 'g'))
WHERE referral_code IS NULL;

-- Create index for fast lookups by referral_code
CREATE INDEX IF NOT EXISTS idx_operators_referral_code ON public.operators(referral_code);

-- 2. Add registration_source and referred_by_operator_id to customers
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS registration_source TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS referred_by_operator_id UUID REFERENCES public.operators(id);

CREATE INDEX IF NOT EXISTS idx_customers_referred_by ON public.customers(referred_by_operator_id);
CREATE INDEX IF NOT EXISTS idx_customers_source ON public.customers(registration_source);

-- 3. Track link visits (optional stats)
CREATE TABLE IF NOT EXISTS public.referral_visits (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_id     UUID        NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    visited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent      TEXT,
    converted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_referral_visits_operator ON public.referral_visits(operator_id);

-- 4. RLS for referral_visits: operators see only their own, admin sees all
ALTER TABLE public.referral_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_visits_own" ON public.referral_visits;
CREATE POLICY "referral_visits_own" ON public.referral_visits
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() = 'admin'
        OR operator_id IN (
            SELECT id FROM public.operators WHERE profile_id = auth.uid()
        )
    );

-- Allow service role to insert visits (public endpoint calls server API)
CREATE POLICY "referral_visits_insert" ON public.referral_visits
    FOR INSERT WITH CHECK (true);

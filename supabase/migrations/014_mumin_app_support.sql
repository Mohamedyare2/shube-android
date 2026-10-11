-- ============================================================
-- SHUBE – Migration 014: Mu'min App Support & Operator Entitlements
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Update app_type check constraint to include 'mumin'
ALTER TABLE public.operators 
    DROP CONSTRAINT IF EXISTS operators_app_type_check;

ALTER TABLE public.operators 
    ADD CONSTRAINT operators_app_type_check 
    CHECK (app_type IN ('shube', 'geesh', 'mumin'));

-- 2. Add mumin_enabled boolean to operators for granular access control
ALTER TABLE public.operators
    ADD COLUMN IF NOT EXISTS mumin_enabled BOOLEAN DEFAULT FALSE;

-- 3. Pre-authorize existing operators who need Mu'min access
-- By default, all admins and active operators can be toggled via dashboard
UPDATE public.operators
SET mumin_enabled = TRUE
WHERE username IN ('farxaan', 'mohamedzayid52') OR app_type = 'mumin';

-- 4. Enable RLS and grants
GRANT SELECT, INSERT, UPDATE ON public.operators TO authenticated;

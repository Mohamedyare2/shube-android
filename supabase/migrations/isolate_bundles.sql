-- ============================================================
-- SHUBE — Isolate Bundle Rules per Operator
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add created_by column to track which operator created the bundle
ALTER TABLE public.bundle_rules 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

-- 2. Drop the global UNIQUE constraint on amount_sls 
-- so multiple operators can have a bundle with the same amount
ALTER TABLE public.bundle_rules 
DROP CONSTRAINT IF EXISTS bundle_rules_amount_sls_key;

-- 3. Add a composite UNIQUE constraint so an operator can't duplicate their own amounts,
-- but different operators can have the same amount
ALTER TABLE public.bundle_rules 
ADD CONSTRAINT bundle_rules_amount_sls_created_by_key UNIQUE (amount_sls, created_by);

-- 4. Update Row Level Security (RLS) to restrict operators to only their own bundles
DROP POLICY IF EXISTS "bundle_rules_operator_all" ON public.bundle_rules;
DROP POLICY IF EXISTS "bundle_rules_operator_read" ON public.bundle_rules;

-- Admin sees all, Operator sees and modifies only their own
CREATE POLICY "bundle_rules_operator_all" 
ON public.bundle_rules 
FOR ALL 
TO authenticated 
USING (
  public.current_user_role() = 'admin' 
  OR 
  (public.current_user_role() = 'operator' AND created_by = auth.uid())
)
WITH CHECK (
  public.current_user_role() = 'admin' 
  OR 
  (public.current_user_role() = 'operator' AND created_by = auth.uid())
);

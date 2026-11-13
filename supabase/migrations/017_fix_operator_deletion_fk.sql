-- Migration 017: Comprehensive Foreign Key & Cascade fixes for Operator Deletion
-- Ensures admins can delete operators cleanly even if they have transactions, bundle rules, customers, or devices.

-- 1. Fix transactions.bundle_rule_id to ON DELETE SET NULL
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_bundle_rule_id_fkey;

ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_bundle_rule_id_fkey 
FOREIGN KEY (bundle_rule_id) REFERENCES public.bundle_rules(id) ON DELETE SET NULL;

-- 2. Fix bundle_rules.created_by to ON DELETE SET NULL
ALTER TABLE public.bundle_rules 
DROP CONSTRAINT IF EXISTS bundle_rules_created_by_fkey;

ALTER TABLE public.bundle_rules 
ADD CONSTRAINT bundle_rules_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Fix transactions.operator_id to ON DELETE SET NULL
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_operator_id_fkey;

ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_operator_id_fkey 
FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE SET NULL;

-- 4. Fix audit_logs.actor_id to ON DELETE SET NULL
ALTER TABLE public.audit_logs 
DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;

ALTER TABLE public.audit_logs 
ADD CONSTRAINT audit_logs_actor_id_fkey 
FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. Fix customers.created_by & referred_by_operator_id
ALTER TABLE public.customers 
DROP CONSTRAINT IF EXISTS customers_created_by_fkey;
ALTER TABLE public.customers 
ADD CONSTRAINT customers_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.customers 
DROP CONSTRAINT IF EXISTS customers_referred_by_operator_id_fkey;
ALTER TABLE public.customers 
ADD CONSTRAINT customers_referred_by_operator_id_fkey 
FOREIGN KEY (referred_by_operator_id) REFERENCES public.operators(id) ON DELETE SET NULL;

-- 6. RPC Function for atomic operator deletion
CREATE OR REPLACE FUNCTION public.admin_delete_operator(target_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- Check caller role
  v_caller_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
    ''
  );

  -- Allowed if called via service_role OR by an authenticated admin
  IF v_caller_role = 'service_role' THEN
    v_is_admin := TRUE;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins can delete operators');
  END IF;

  -- 1. Delete devices
  DELETE FROM public.devices 
  WHERE operator_id IN (
    SELECT id FROM public.operators WHERE profile_id = target_profile_id
  );

  -- 2. Delete operator
  DELETE FROM public.operators WHERE profile_id = target_profile_id;

  -- 3. Delete operator bundle rules (if any remain)
  DELETE FROM public.bundle_rules WHERE created_by = target_profile_id;

  -- 4. Delete profile
  DELETE FROM public.profiles WHERE id = target_profile_id;

  -- 5. Delete auth.users entry (if exists)
  DELETE FROM auth.users WHERE id = target_profile_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_operator(UUID) TO authenticated, service_role, anon;

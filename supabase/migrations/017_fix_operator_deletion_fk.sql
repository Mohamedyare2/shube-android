-- Migration 017: Fix Foreign Key Constraints for Operator and Profile Deletion
-- Allows clean deletion of operators and profiles without breaking historical transactions, customers, or audit logs.

-- 1. transactions.operator_id
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_operator_id_fkey;
ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_operator_id_fkey 
  FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE SET NULL;

-- 2. audit_logs.actor_id
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_actor_id_fkey 
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. bundle_rules.created_by
ALTER TABLE public.bundle_rules DROP CONSTRAINT IF EXISTS bundle_rules_created_by_fkey;
ALTER TABLE public.bundle_rules 
  ADD CONSTRAINT bundle_rules_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. customers.created_by
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_created_by_fkey;
ALTER TABLE public.customers 
  ADD CONSTRAINT customers_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. customers.referred_by_operator_id
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_referred_by_operator_id_fkey;
ALTER TABLE public.customers 
  ADD CONSTRAINT customers_referred_by_operator_id_fkey 
  FOREIGN KEY (referred_by_operator_id) REFERENCES public.operators(id) ON DELETE SET NULL;

-- 6. devices.revoked_by
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_revoked_by_fkey;
ALTER TABLE public.devices 
  ADD CONSTRAINT devices_revoked_by_fkey 
  FOREIGN KEY (revoked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 7. operator_feature_access.granted_by
ALTER TABLE public.operator_feature_access DROP CONSTRAINT IF EXISTS operator_feature_access_granted_by_fkey;
ALTER TABLE public.operator_feature_access 
  ADD CONSTRAINT operator_feature_access_granted_by_fkey 
  FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 8. operator_feature_access.revoked_by
ALTER TABLE public.operator_feature_access DROP CONSTRAINT IF EXISTS operator_feature_access_revoked_by_fkey;
ALTER TABLE public.operator_feature_access 
  ADD CONSTRAINT operator_feature_access_revoked_by_fkey 
  FOREIGN KEY (revoked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 9. operator_feature_history.operator_id
ALTER TABLE public.operator_feature_history DROP CONSTRAINT IF EXISTS operator_feature_history_operator_id_fkey;
ALTER TABLE public.operator_feature_history 
  ADD CONSTRAINT operator_feature_history_operator_id_fkey 
  FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE CASCADE;

-- 10. operators.created_by
ALTER TABLE public.operators DROP CONSTRAINT IF EXISTS operators_created_by_fkey;
ALTER TABLE public.operators 
  ADD CONSTRAINT operators_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

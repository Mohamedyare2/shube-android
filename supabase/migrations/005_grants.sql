-- ============================================================
-- SHUBE — Migration 005: Grant permissions to PostgREST roles
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant full table access to service_role (used by admin API)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Grant authenticated role access to their tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operators         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_rules      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_config       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_parser_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs        TO authenticated;

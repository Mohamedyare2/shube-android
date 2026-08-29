-- ============================================================
-- SHUBE — Migration 002: Row Level Security Policies
-- ============================================================

-- Enable RLS on all public tables
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operators            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ussd_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_parser_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: get current user's role
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- HELPER: get current user's operator id
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_operator_id()
RETURNS UUID AS $$
    SELECT id FROM public.operators WHERE profile_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE POLICY "profiles_admin_all"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "profiles_operator_self"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "profiles_operator_update_self"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid() AND public.current_user_role() = 'operator')
    WITH CHECK (id = auth.uid());

-- ============================================================
-- OPERATORS
-- ============================================================
CREATE POLICY "operators_admin_all"
    ON public.operators FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "operators_operator_self"
    ON public.operators FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid());

-- ============================================================
-- CUSTOMERS (admin full, operators read-only for lookup)
-- ============================================================
CREATE POLICY "customers_admin_all"
    ON public.customers FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "customers_operator_read"
    ON public.customers FOR SELECT
    TO authenticated
    USING (public.current_user_role() = 'operator' AND active = TRUE);

-- ============================================================
-- BUNDLE RULES (admin full, operators read active only)
-- ============================================================
CREATE POLICY "bundle_rules_admin_all"
    ON public.bundle_rules FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "bundle_rules_operator_all"
    ON public.bundle_rules FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'operator');

-- ============================================================
-- USSD CONFIG (admin full, operators read active only)
-- ============================================================
CREATE POLICY "ussd_config_admin_all"
    ON public.ussd_config FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "ussd_config_operator_all"
    ON public.ussd_config FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'operator');

-- ============================================================
-- SMS PARSER CONFIG (admin full, operators read active only)
-- ============================================================
CREATE POLICY "sms_parser_admin_all"
    ON public.sms_parser_config FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "sms_parser_operator_all"
    ON public.sms_parser_config FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'operator');

-- ============================================================
-- DEVICES (admin full, operators their own device only)
-- ============================================================
CREATE POLICY "devices_admin_all"
    ON public.devices FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "devices_operator_own"
    ON public.devices FOR ALL
    TO authenticated
    USING (
        public.current_user_role() = 'operator'
        AND operator_id = public.current_operator_id()
    );

-- ============================================================
-- TRANSACTIONS (admin full, operators their own only)
-- ============================================================
CREATE POLICY "transactions_admin_all"
    ON public.transactions FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "transactions_operator_own"
    ON public.transactions FOR ALL
    TO authenticated
    USING (
        public.current_user_role() = 'operator'
        AND operator_id = public.current_operator_id()
    );

-- ============================================================
-- TRANSACTION EVENTS (follows parent transaction access)
-- ============================================================
CREATE POLICY "tx_events_admin_all"
    ON public.transaction_events FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

CREATE POLICY "tx_events_operator_own"
    ON public.transaction_events FOR ALL
    TO authenticated
    USING (
        public.current_user_role() = 'operator'
        AND transaction_id IN (
            SELECT id FROM public.transactions
            WHERE operator_id = public.current_operator_id()
        )
    );

-- ============================================================
-- AUDIT LOGS (admin full read, operators cannot read)
-- ============================================================
CREATE POLICY "audit_logs_admin_all"
    ON public.audit_logs FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- Operators can INSERT audit entries (e.g., gateway on/off)
-- but cannot SELECT them
CREATE POLICY "audit_logs_operator_insert"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_role() = 'operator');

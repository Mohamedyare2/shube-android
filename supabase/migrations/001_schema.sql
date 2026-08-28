-- ============================================================
-- SHUBE — Migration 001: Schema
-- Telesom → Somtel Auto-Recharge System
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT        NOT NULL CHECK (role IN ('admin', 'operator')),
    full_name     TEXT        NOT NULL,
    phone_number  TEXT,
    status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role   ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- ============================================================
-- OPERATORS (operator-specific config, one per profile)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.operators (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id      UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    username        TEXT        NOT NULL UNIQUE,
    notes           TEXT,
    created_by      UUID        REFERENCES public.profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operators_profile_id  ON public.operators(profile_id);
CREATE INDEX IF NOT EXISTS idx_operators_username    ON public.operators(username);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name   TEXT        NOT NULL,
    telesom_number  TEXT        NOT NULL UNIQUE,
    somtel_number   TEXT        NOT NULL,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_by      UUID        REFERENCES public.profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_telesom_number ON public.customers(telesom_number);
CREATE INDEX IF NOT EXISTS idx_customers_somtel_number  ON public.customers(somtel_number);
CREATE INDEX IF NOT EXISTS idx_customers_active         ON public.customers(active);

-- ============================================================
-- BUNDLE RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bundle_rules (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    amount_sls      NUMERIC     NOT NULL UNIQUE,
    bundle_name     TEXT        NOT NULL,
    data_amount     NUMERIC     NOT NULL,
    data_unit       TEXT        NOT NULL DEFAULT 'GB' CHECK (data_unit IN ('MB', 'GB')),
    ussd_option     TEXT        NOT NULL,
    ussd_code       TEXT        NOT NULL,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bundle_rules_amount_sls ON public.bundle_rules(amount_sls);
CREATE INDEX IF NOT EXISTS idx_bundle_rules_active     ON public.bundle_rules(active);

-- ============================================================
-- USSD CONFIG (configurable workflow steps, stored as JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ussd_config (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL UNIQUE,
    description     TEXT,
    steps           JSONB       NOT NULL DEFAULT '[]',
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SMS PARSER CONFIG (configurable regex patterns)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sms_parser_config (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL UNIQUE,
    description     TEXT,
    sender_pattern  TEXT,
    amount_pattern  TEXT        NOT NULL,
    currency_pattern TEXT       NOT NULL,
    txn_id_pattern  TEXT,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    priority        INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devices (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_id         UUID        NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    device_name         TEXT        NOT NULL,
    device_identifier   TEXT        NOT NULL UNIQUE,
    android_version     TEXT,
    app_version         TEXT,
    gateway_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
    status              TEXT        NOT NULL DEFAULT 'offline'
                            CHECK (status IN ('online', 'offline', 'processing', 'disabled')),
    last_seen           TIMESTAMPTZ,
    revoked             BOOLEAN     NOT NULL DEFAULT FALSE,
    revoked_at          TIMESTAMPTZ,
    revoked_by          UUID        REFERENCES public.profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_operator_id       ON public.devices(operator_id);
CREATE INDEX IF NOT EXISTS idx_devices_status            ON public.devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_device_identifier ON public.devices(device_identifier);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen         ON public.devices(last_seen);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sms_hash                TEXT        NOT NULL UNIQUE,
    telesom_number          TEXT        NOT NULL,
    amount_sls              NUMERIC     NOT NULL,
    currency                TEXT        NOT NULL DEFAULT 'SLS',
    telesom_transaction_id  TEXT,
    somtel_number           TEXT,
    bundle_rule_id          UUID        REFERENCES public.bundle_rules(id),
    operator_id             UUID        REFERENCES public.operators(id),
    device_id               UUID        REFERENCES public.devices(id),
    status                  TEXT        NOT NULL DEFAULT 'received'
                                CHECK (status IN (
                                    'received',
                                    'matched',
                                    'bundle_found',
                                    'pending',
                                    'processing',
                                    'ussd_started',
                                    'authenticating',
                                    'confirming',
                                    'success',
                                    'failed',
                                    'customer_not_found',
                                    'invalid_amount',
                                    'duplicate',
                                    'unknown_result',
                                    'ussd_interaction_required',
                                    'queued'
                                )),
    ussd_reference          TEXT,
    failure_reason          TEXT,
    sms_body                TEXT,
    sms_timestamp           TIMESTAMPTZ,
    test_mode               BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_started_at   TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_sms_hash              ON public.transactions(sms_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_telesom_number        ON public.transactions(telesom_number);
CREATE INDEX IF NOT EXISTS idx_transactions_status                ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_operator_id           ON public.transactions(operator_id);
CREATE INDEX IF NOT EXISTS idx_transactions_device_id             ON public.transactions(device_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at            ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_telesom_transaction_id ON public.transactions(telesom_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_bundle_rule_id        ON public.transactions(bundle_rule_id);

-- ============================================================
-- TRANSACTION EVENTS (timeline per transaction)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transaction_events (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID        NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    event_type      TEXT        NOT NULL,
    description     TEXT,
    metadata        JSONB       DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_events_transaction_id ON public.transaction_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_events_created_at     ON public.transaction_events(created_at);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id        UUID        REFERENCES public.profiles(id),
    actor_role      TEXT,
    action          TEXT        NOT NULL,
    resource_type   TEXT,
    resource_id     TEXT,
    description     TEXT,
    ip_address      TEXT,
    metadata        JSONB       DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource    ON public.audit_logs(resource_type, resource_id);

-- ============================================================
-- UPDATED_AT auto-update trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_operators_updated_at
    BEFORE UPDATE ON public.operators
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_bundle_rules_updated_at
    BEFORE UPDATE ON public.bundle_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_ussd_config_updated_at
    BEFORE UPDATE ON public.ussd_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_devices_updated_at
    BEFORE UPDATE ON public.devices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE on new auth.user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role, full_name, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'role', 'operator'),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'active'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

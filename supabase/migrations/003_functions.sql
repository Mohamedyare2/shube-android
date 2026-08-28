-- ============================================================
-- SHUBE — Migration 003: Functions, Triggers & Stored Procedures
-- ============================================================

-- ============================================================
-- DUPLICATE TRANSACTION CHECK
-- Returns TRUE if duplicate exists (already processed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_duplicate_transaction(
    p_sms_hash TEXT,
    p_telesom_txn_id TEXT DEFAULT NULL
)
RETURNS TABLE(is_duplicate BOOLEAN, existing_id UUID, existing_status TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        TRUE,
        t.id,
        t.status
    FROM public.transactions t
    WHERE
        t.sms_hash = p_sms_hash
        OR (
            p_telesom_txn_id IS NOT NULL
            AND p_telesom_txn_id != ''
            AND t.telesom_transaction_id = p_telesom_txn_id
            AND t.status IN ('success', 'processing', 'ussd_started', 'authenticating', 'confirming')
        )
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRANSACTION STATE MACHINE TRANSITION
-- Validates and applies state transitions atomically
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_transaction_state(
    p_transaction_id UUID,
    p_new_status TEXT,
    p_failure_reason TEXT DEFAULT NULL,
    p_ussd_reference TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS public.transactions AS $$
DECLARE
    v_transaction public.transactions;
    v_allowed_transitions TEXT[][] := ARRAY[
        ['received',     'matched'],
        ['received',     'customer_not_found'],
        ['received',     'duplicate'],
        ['received',     'queued'],
        ['matched',      'bundle_found'],
        ['matched',      'invalid_amount'],
        ['bundle_found', 'pending'],
        ['bundle_found', 'invalid_amount'],
        ['pending',      'processing'],
        ['pending',      'failed'],
        ['processing',   'ussd_started'],
        ['processing',   'failed'],
        ['processing',   'ussd_interaction_required'],
        ['ussd_started', 'authenticating'],
        ['ussd_started', 'failed'],
        ['ussd_started', 'unknown_result'],
        ['ussd_started', 'ussd_interaction_required'],
        ['authenticating','confirming'],
        ['authenticating','failed'],
        ['authenticating','unknown_result'],
        ['confirming',   'success'],
        ['confirming',   'failed'],
        ['confirming',   'unknown_result'],
        ['queued',       'processing'],
        ['queued',       'received'],
        ['ussd_interaction_required', 'processing'],
        ['ussd_interaction_required', 'failed'],
        ['unknown_result','failed']
    ];
    v_pair TEXT[];
    v_transition_allowed BOOLEAN := FALSE;
BEGIN
    -- Lock and fetch the transaction
    SELECT * INTO v_transaction
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction % not found', p_transaction_id;
    END IF;

    -- Terminal states cannot transition
    IF v_transaction.status IN ('success', 'failed', 'duplicate') THEN
        RAISE EXCEPTION 'Transaction % is in terminal state % and cannot transition',
            p_transaction_id, v_transaction.status;
    END IF;

    -- Check allowed transitions
    FOREACH v_pair SLICE 1 IN ARRAY v_allowed_transitions LOOP
        IF v_pair[1] = v_transaction.status AND v_pair[2] = p_new_status THEN
            v_transition_allowed := TRUE;
            EXIT;
        END IF;
    END LOOP;

    IF NOT v_transition_allowed THEN
        RAISE EXCEPTION 'Invalid state transition: % -> % for transaction %',
            v_transaction.status, p_new_status, p_transaction_id;
    END IF;

    -- Apply the transition
    UPDATE public.transactions SET
        status                  = p_new_status,
        failure_reason          = COALESCE(p_failure_reason, failure_reason),
        ussd_reference          = COALESCE(p_ussd_reference, ussd_reference),
        processing_started_at   = CASE WHEN p_new_status = 'processing' THEN NOW() ELSE processing_started_at END,
        completed_at            = CASE WHEN p_new_status IN ('success','failed','unknown_result','duplicate') THEN NOW() ELSE completed_at END
    WHERE id = p_transaction_id
    RETURNING * INTO v_transaction;

    -- Record timeline event
    INSERT INTO public.transaction_events (transaction_id, event_type, description, metadata)
    VALUES (
        p_transaction_id,
        p_new_status,
        CASE p_new_status
            WHEN 'received'                  THEN 'SMS received and parsed'
            WHEN 'matched'                   THEN 'Customer matched in database'
            WHEN 'bundle_found'              THEN 'Bundle rule matched for amount'
            WHEN 'pending'                   THEN 'Transaction queued for processing'
            WHEN 'processing'                THEN 'Processing started'
            WHEN 'ussd_started'              THEN 'USSD session initiated'
            WHEN 'authenticating'            THEN 'USSD authentication step'
            WHEN 'confirming'                THEN 'USSD confirmation step'
            WHEN 'success'                   THEN 'Transaction completed successfully'
            WHEN 'failed'                    THEN COALESCE('Failed: ' || p_failure_reason, 'Transaction failed')
            WHEN 'customer_not_found'        THEN 'No customer record found for sender'
            WHEN 'invalid_amount'            THEN 'No bundle rule matches the payment amount'
            WHEN 'duplicate'                 THEN 'Duplicate payment detected — not processed again'
            WHEN 'unknown_result'            THEN 'USSD result could not be determined'
            WHEN 'ussd_interaction_required' THEN 'Manual USSD interaction required from operator'
            WHEN 'queued'                    THEN 'Queued offline — will sync when connected'
            ELSE p_new_status
        END,
        p_metadata
    );

    RETURN v_transaction;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ADMIN DASHBOARD STATS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
    p_from_date TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_to_date   TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total',              COUNT(*),
        'success',            COUNT(*) FILTER (WHERE status = 'success'),
        'failed',             COUNT(*) FILTER (WHERE status = 'failed'),
        'pending',            COUNT(*) FILTER (WHERE status IN ('pending','processing','ussd_started','authenticating','confirming','queued')),
        'unknown',            COUNT(*) FILTER (WHERE status = 'unknown_result'),
        'customer_not_found', COUNT(*) FILTER (WHERE status = 'customer_not_found'),
        'invalid_amount',     COUNT(*) FILTER (WHERE status = 'invalid_amount'),
        'duplicates',         COUNT(*) FILTER (WHERE status = 'duplicate'),
        'total_sls_processed', COALESCE(SUM(amount_sls) FILTER (WHERE status = 'success'), 0),
        'total_sls_attempted', COALESCE(SUM(amount_sls), 0)
    )
    INTO v_result
    FROM public.transactions
    WHERE created_at BETWEEN p_from_date AND p_to_date
      AND test_mode = FALSE;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- OPERATOR STATS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_operator_stats(
    p_operator_id UUID,
    p_from_date TIMESTAMPTZ DEFAULT CURRENT_DATE::TIMESTAMPTZ,
    p_to_date   TIMESTAMPTZ DEFAULT (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total',        COUNT(*),
        'success',      COUNT(*) FILTER (WHERE status = 'success'),
        'failed',       COUNT(*) FILTER (WHERE status = 'failed'),
        'pending',      COUNT(*) FILTER (WHERE status IN ('pending','processing','ussd_started','queued')),
        'total_sls',    COALESCE(SUM(amount_sls) FILTER (WHERE status = 'success'), 0)
    )
    INTO v_result
    FROM public.transactions
    WHERE operator_id = p_operator_id
      AND created_at BETWEEN p_from_date AND p_to_date
      AND test_mode = FALSE;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DEVICE HEARTBEAT UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_device_heartbeat(
    p_device_id UUID,
    p_status TEXT DEFAULT 'online',
    p_app_version TEXT DEFAULT NULL,
    p_android_version TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.devices SET
        last_seen       = NOW(),
        status          = p_status,
        app_version     = COALESCE(p_app_version, app_version),
        android_version = COALESCE(p_android_version, android_version)
    WHERE id = p_device_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- AUTO-MARK DEVICES OFFLINE (run periodically via cron/edge fn)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_stale_devices_offline(
    p_threshold_minutes INTEGER DEFAULT 5
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.devices SET status = 'offline'
    WHERE status = 'online'
      AND last_seen < NOW() - (p_threshold_minutes || ' minutes')::INTERVAL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- UPSERT TRANSACTION (for offline sync idempotency)
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_transaction(
    p_id UUID,
    p_sms_hash TEXT,
    p_telesom_number TEXT,
    p_amount_sls NUMERIC,
    p_currency TEXT,
    p_telesom_transaction_id TEXT,
    p_somtel_number TEXT,
    p_bundle_rule_id UUID,
    p_operator_id UUID,
    p_device_id UUID,
    p_status TEXT,
    p_sms_body TEXT,
    p_sms_timestamp TIMESTAMPTZ,
    p_failure_reason TEXT DEFAULT NULL,
    p_test_mode BOOLEAN DEFAULT FALSE
)
RETURNS public.transactions AS $$
DECLARE
    v_result public.transactions;
BEGIN
    INSERT INTO public.transactions (
        id, sms_hash, telesom_number, amount_sls, currency,
        telesom_transaction_id, somtel_number, bundle_rule_id,
        operator_id, device_id, status, sms_body, sms_timestamp,
        failure_reason, test_mode
    )
    VALUES (
        p_id, p_sms_hash, p_telesom_number, p_amount_sls, p_currency,
        p_telesom_transaction_id, p_somtel_number, p_bundle_rule_id,
        p_operator_id, p_device_id, p_status, p_sms_body, p_sms_timestamp,
        p_failure_reason, p_test_mode
    )
    ON CONFLICT (sms_hash) DO UPDATE SET
        status          = EXCLUDED.status,
        somtel_number   = COALESCE(EXCLUDED.somtel_number, transactions.somtel_number),
        bundle_rule_id  = COALESCE(EXCLUDED.bundle_rule_id, transactions.bundle_rule_id),
        failure_reason  = COALESCE(EXCLUDED.failure_reason, transactions.failure_reason),
        completed_at    = CASE WHEN EXCLUDED.status IN ('success','failed','unknown_result') THEN NOW() ELSE transactions.completed_at END,
        updated_at      = NOW()
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- AUDIT LOG HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_audit_log(
    p_actor_id UUID,
    p_actor_role TEXT,
    p_action TEXT,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action, resource_type, resource_id, description, metadata
    ) VALUES (
        p_actor_id, p_actor_role, p_action, p_resource_type, p_resource_id, p_description, p_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SHUBE — Migration 008: Card Balance & Auto-Deduction
-- Tracks the SIM card's top-up balance for each operator.
-- Automatically deducts the bundle's cost_price after success.
-- ============================================================

-- Add card_balance to operators (the USSD/SIM card balance in USD)
ALTER TABLE public.operators
    ADD COLUMN IF NOT EXISTS card_balance NUMERIC NOT NULL DEFAULT 0;

-- ============================================================
-- Trigger: Auto-deduct card balance on transaction success
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_card_balance_on_success()
RETURNS TRIGGER AS $$
DECLARE
    v_cost_price NUMERIC;
    v_op_id UUID;
BEGIN
    -- Fire on INSERT if status='success', or UPDATE when transitioning to 'success'
    IF (TG_OP = 'INSERT' AND NEW.status = 'success') OR 
       (TG_OP = 'UPDATE' AND NEW.status = 'success' AND (OLD.status IS DISTINCT FROM 'success')) THEN

        -- 1. Get cost price of matched bundle rule
        IF NEW.bundle_rule_id IS NOT NULL THEN
            SELECT cost_price INTO v_cost_price
            FROM public.bundle_rules
            WHERE id = NEW.bundle_rule_id;
        END IF;

        -- 2. Determine operator_id
        v_op_id := NEW.operator_id;
        IF v_op_id IS NULL AND NEW.device_id IS NOT NULL THEN
            SELECT operator_id INTO v_op_id FROM public.devices WHERE id = NEW.device_id;
        END IF;
        IF v_op_id IS NULL AND NEW.bundle_rule_id IS NOT NULL THEN
            SELECT o.id INTO v_op_id 
            FROM public.operators o
            JOIN public.bundle_rules br ON br.created_by = o.profile_id
            WHERE br.id = NEW.bundle_rule_id
            LIMIT 1;
        END IF;

        -- 3. Deduct from operator's card balance
        IF v_op_id IS NOT NULL AND v_cost_price IS NOT NULL AND v_cost_price > 0 THEN
            UPDATE public.operators
            SET card_balance = ROUND(COALESCE(card_balance, 0) - v_cost_price, 4),
                updated_at   = NOW()
            WHERE id = v_op_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_deduct_card_balance ON public.transactions;
CREATE TRIGGER trg_deduct_card_balance
    AFTER INSERT OR UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.deduct_card_balance_on_success();

-- ============================================================
-- RLS: Allow operators to read and update their OWN card_balance
-- ============================================================
-- (No new policy needed; operators already have UPDATE access
--  to their own operators row via existing RLS in 002_rls.sql)

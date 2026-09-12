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
BEGIN
    -- Only fire when status transitions TO 'success'
    IF NEW.status = 'success' AND (OLD.status IS DISTINCT FROM 'success') THEN
        -- Get the cost price of the matched bundle rule
        SELECT cost_price INTO v_cost_price
        FROM public.bundle_rules
        WHERE id = NEW.bundle_rule_id;

        -- Deduct from operator's card balance (only if bundle has a cost price)
        IF NEW.operator_id IS NOT NULL AND v_cost_price IS NOT NULL AND v_cost_price > 0 THEN
            UPDATE public.operators
            SET card_balance = card_balance - v_cost_price,
                updated_at   = NOW()
            WHERE id = NEW.operator_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_deduct_card_balance ON public.transactions;
CREATE TRIGGER trg_deduct_card_balance
    AFTER UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.deduct_card_balance_on_success();

-- ============================================================
-- RLS: Allow operators to read and update their OWN card_balance
-- ============================================================
-- (No new policy needed; operators already have UPDATE access
--  to their own operators row via existing RLS in 002_rls.sql)

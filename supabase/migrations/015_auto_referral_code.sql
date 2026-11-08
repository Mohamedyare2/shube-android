-- ============================================================
-- SHUBE – Migration 015: Auto-assign Operator Referral Codes
-- Ensures all operators have a unique referral_code for their registration link
-- ============================================================

-- 1. Backfill all existing operators with missing referral codes
UPDATE public.operators
SET referral_code = LOWER(REGEXP_REPLACE(username, '[^a-zA-Z0-9]', '-', 'g'))
WHERE referral_code IS NULL OR TRIM(referral_code) = '';

-- 2. Trigger function to automatically assign referral_code on INSERT or UPDATE if not provided
CREATE OR REPLACE FUNCTION public.set_default_operator_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL OR TRIM(NEW.referral_code) = '' THEN
    IF NEW.username IS NOT NULL AND TRIM(NEW.username) <> '' THEN
      NEW.referral_code := LOWER(REGEXP_REPLACE(NEW.username, '[^a-zA-Z0-9]', '-', 'g'));
    ELSE
      NEW.referral_code := 'op-' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 8);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_operator_referral_code ON public.operators;
CREATE TRIGGER trg_set_operator_referral_code
  BEFORE INSERT OR UPDATE ON public.operators
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_operator_referral_code();

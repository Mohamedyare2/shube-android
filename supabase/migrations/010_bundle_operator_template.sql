-- ============================================================
-- SHUBE – Migration 010: Bundle Rules Operator Template
-- Run in Supabase SQL Editor
-- ============================================================
-- Goal:
--   1. Farxaan's bundle rules become the permanent default template
--   2. When a new operator is created, they automatically get a
--      personal COPY of Farxaan's rules (independent records)
--   3. getBundleByAmount on Android filters by created_by (profile UUID)
--      so operators never share each other's rules
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- Step 1: Make sure bundle_rules has the created_by column
-- (was added in isolate_bundles.sql; safe to repeat)
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.bundle_rules
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

-- ──────────────────────────────────────────────────────────
-- Step 2: Find Farxaan's profile_id and mark his rules as
-- the default template (template_source = true).
-- We do NOT change his row data — we just mark them.
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.bundle_rules
    ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark Farxaan's rules as the master template
-- Replace 'farxaan' with his actual username if different
UPDATE public.bundle_rules br
SET    is_template = TRUE
FROM   public.operators op
JOIN   public.profiles   pr ON pr.id = op.profile_id
WHERE  br.created_by = pr.id
  AND  LOWER(op.username) = 'farxaan';

-- ──────────────────────────────────────────────────────────
-- Step 3: Helper function – copy template rules for a new
-- operator profile.  Called by the trigger below.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.copy_template_bundle_rules_for_operator()
RETURNS TRIGGER AS $$
DECLARE
    v_template_profile_id UUID;
BEGIN
    -- Find Farxaan's profile_id as the template source
    SELECT pr.id INTO v_template_profile_id
    FROM   public.operators op
    JOIN   public.profiles   pr ON pr.id = op.profile_id
    WHERE  LOWER(op.username) = 'farxaan'
    LIMIT  1;

    IF v_template_profile_id IS NULL THEN
        -- Template operator not found – skip silently
        RETURN NEW;
    END IF;

    -- Do not copy to Farxaan himself
    IF NEW.profile_id = v_template_profile_id THEN
        RETURN NEW;
    END IF;

    -- Insert fresh copies of every template rule for the new operator
    INSERT INTO public.bundle_rules (
        amount_sls, bundle_name, data_amount, data_unit,
        ussd_option, ussd_code, ussd_replies,
        active, sort_order, cost_price,
        created_by, is_template
    )
    SELECT
        amount_sls, bundle_name, data_amount, data_unit,
        ussd_option, ussd_code, ussd_replies,
        active, sort_order, cost_price,
        NEW.profile_id,   -- assign to the new operator
        FALSE             -- not a template
    FROM   public.bundle_rules
    WHERE  created_by  = v_template_profile_id
      AND  is_template = TRUE
    ON CONFLICT DO NOTHING;  -- skip if somehow already exists

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- Step 4: Trigger – fires when a new operators row is inserted
-- ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_copy_bundle_rules_for_new_operator ON public.operators;
CREATE TRIGGER trg_copy_bundle_rules_for_new_operator
    AFTER INSERT ON public.operators
    FOR EACH ROW
    EXECUTE FUNCTION public.copy_template_bundle_rules_for_operator();

-- ──────────────────────────────────────────────────────────
-- Step 5: Add a performance index on created_by so lookups
-- by operator are fast (used in every transaction)
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bundle_rules_created_by ON public.bundle_rules(created_by);

-- ──────────────────────────────────────────────────────────
-- Step 6: Ensure UNIQUE per operator (same amount once per op)
-- Drop global unique if still present, add composite one
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.bundle_rules DROP CONSTRAINT IF EXISTS bundle_rules_amount_sls_key;
ALTER TABLE public.bundle_rules DROP CONSTRAINT IF EXISTS bundle_rules_amount_sls_created_by_key;
ALTER TABLE public.bundle_rules
    ADD CONSTRAINT bundle_rules_amount_sls_created_by_key UNIQUE (amount_sls, created_by);

-- ──────────────────────────────────────────────────────────
-- Step 7: Backfill existing operators who have no rules yet
-- (copy template rules to them now)
-- ──────────────────────────────────────────────────────────
DO $$
DECLARE
    v_template_profile_id UUID;
    r RECORD;
BEGIN
    SELECT pr.id INTO v_template_profile_id
    FROM   public.operators op
    JOIN   public.profiles   pr ON pr.id = op.profile_id
    WHERE  LOWER(op.username) = 'farxaan'
    LIMIT  1;

    IF v_template_profile_id IS NULL THEN
        RAISE NOTICE 'Template operator (farxaan) not found. Skipping backfill.';
        RETURN;
    END IF;

    FOR r IN
        SELECT op.profile_id
        FROM   public.operators op
        WHERE  op.profile_id <> v_template_profile_id
          AND  NOT EXISTS (
              SELECT 1 FROM public.bundle_rules br
              WHERE  br.created_by = op.profile_id
          )
    LOOP
        INSERT INTO public.bundle_rules (
            amount_sls, bundle_name, data_amount, data_unit,
            ussd_option, ussd_code, ussd_replies,
            active, sort_order, cost_price,
            created_by, is_template
        )
        SELECT
            amount_sls, bundle_name, data_amount, data_unit,
            ussd_option, ussd_code, ussd_replies,
            active, sort_order, cost_price,
            r.profile_id,
            FALSE
        FROM   public.bundle_rules
        WHERE  created_by  = v_template_profile_id
          AND  is_template = TRUE
        ON CONFLICT DO NOTHING;

        RAISE NOTICE 'Copied template rules to operator profile %', r.profile_id;
    END LOOP;
END;
$$;

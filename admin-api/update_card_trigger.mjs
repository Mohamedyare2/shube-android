import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Upgrading deduct_card_balance_on_success trigger function...');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.deduct_card_balance_on_success()
      RETURNS TRIGGER AS $$
      DECLARE
          v_cost_price NUMERIC;
          v_op_id UUID;
      BEGIN
          -- Fire on INSERT if status='success', or UPDATE when transitioning to 'success'
          IF (TG_OP = 'INSERT' AND NEW.status = 'success') OR 
             (TG_OP = 'UPDATE' AND NEW.status = 'success' AND (OLD.status IS DISTINCT FROM 'success')) THEN

              -- 1. Find cost price from matched bundle_rule
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

              -- 3. Deduct if cost_price > 0 and operator found
              IF v_op_id IS NOT NULL AND v_cost_price IS NOT NULL AND v_cost_price > 0 THEN
                  UPDATE public.operators
                  SET card_balance = ROUND(COALESCE(card_balance, 0) - v_cost_price, 4),
                      updated_at   = NOW()
                  WHERE id = v_op_id;
                  
                  RAISE NOTICE 'Deducted % from operator % (new card balance)', v_cost_price, v_op_id;
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
    `);

    console.log('SUCCESS: Trigger upgraded to handle both INSERT and UPDATE with safe operator resolution!');

    // Also update 008_card_balance.sql migration file to match
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

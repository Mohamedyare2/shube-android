import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' });

async function run() {
  try {
    await pool.query(`
      DROP POLICY IF EXISTS "bundle_rules_operator_read" ON public.bundle_rules;
      CREATE POLICY "bundle_rules_operator_all" ON public.bundle_rules FOR ALL TO authenticated USING (public.current_user_role() = 'operator');

      DROP POLICY IF EXISTS "ussd_config_operator_read" ON public.ussd_config;
      CREATE POLICY "ussd_config_operator_all" ON public.ussd_config FOR ALL TO authenticated USING (public.current_user_role() = 'operator');

      DROP POLICY IF EXISTS "sms_parser_operator_read" ON public.sms_parser_config;
      CREATE POLICY "sms_parser_operator_all" ON public.sms_parser_config FOR ALL TO authenticated USING (public.current_user_role() = 'operator');
    `);
    console.log("Successfully updated RLS policies for operators!");
  } catch (err) {
    console.error("Error updating RLS:", err);
  } finally {
    await pool.end();
  }
}

run();

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    // Allow operators to update their own card_balance
    await client.query(`
      DROP POLICY IF EXISTS "operators_operator_update_self" ON public.operators;
      CREATE POLICY "operators_operator_update_self"
          ON public.operators FOR UPDATE
          TO authenticated
          USING (profile_id = auth.uid() AND public.current_user_role() = 'operator')
          WITH CHECK (profile_id = auth.uid());
    `);
    console.log('✅ RLS policy added: operators can update their own card_balance');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}
run();

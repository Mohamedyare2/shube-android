import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("Updating customers_operator_all RLS policy...");
    await client.query(`
      DROP POLICY IF EXISTS "customers_operator_all" ON public.customers;
      DROP POLICY IF EXISTS "customers_operator_read" ON public.customers;
      
      CREATE POLICY "customers_operator_all"
          ON public.customers FOR ALL
          TO authenticated
          USING (public.current_user_role() = 'operator' AND created_by = auth.uid())
          WITH CHECK (public.current_user_role() = 'operator' AND created_by = auth.uid());
    `);
    
    console.log("Migration executed successfully!");
  } catch (error) {
    console.error("Error executing migration:", error);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();

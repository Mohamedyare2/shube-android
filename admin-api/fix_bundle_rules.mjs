import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting Bundle Rules migration...');
    
    // 1. Add created_by column
    await client.query(`
      ALTER TABLE public.bundle_rules 
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
    `);
    console.log('✅ Added created_by column to bundle_rules');

    // 2. Drop unique constraint on amount_sls
    await client.query(`
      ALTER TABLE public.bundle_rules 
      DROP CONSTRAINT IF EXISTS bundle_rules_amount_sls_key;
    `);
    console.log('✅ Dropped global UNIQUE constraint on amount_sls');

    // 3. Add composite unique constraint
    await client.query(`
      ALTER TABLE public.bundle_rules 
      ADD CONSTRAINT bundle_rules_amount_sls_created_by_key UNIQUE (amount_sls, created_by);
    `);
    console.log('✅ Added UNIQUE(amount_sls, created_by) constraint');

    // 4. Update RLS Policies
    await client.query(`
      DROP POLICY IF EXISTS "bundle_rules_operator_all" ON public.bundle_rules;
      DROP POLICY IF EXISTS "bundle_rules_operator_read" ON public.bundle_rules;
      
      CREATE POLICY "bundle_rules_operator_all" 
      ON public.bundle_rules 
      FOR ALL 
      TO authenticated 
      USING (
        public.current_user_role() = 'admin' 
        OR 
        (public.current_user_role() = 'operator' AND created_by = auth.uid())
      )
      WITH CHECK (
        public.current_user_role() = 'admin' 
        OR 
        (public.current_user_role() = 'operator' AND created_by = auth.uid())
      );
    `);
    console.log('✅ Updated RLS policy for bundle_rules to isolate by operator');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('❌ Error during migration:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();

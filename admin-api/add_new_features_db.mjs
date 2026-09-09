/**
 * SHUBE — New Features Database Migration
 * Ku dara columns-ka cusub ee loo baahan yahay:
 *   1. devices.current_balance   - Hadhaaga SIM Card-ka ($)
 *   2. devices.frozen_at         - Goorta la hakiyay (Freeze log)
 *   3. bundle_rules.cost_price   - Qiimaha bundle-ka kaga fadhiyo operator-ka ($)
 *   4. transactions.result_text  - Fariinta USSD-ga ee App-ka akhriday
 *   5. Hubin 1-Device-per-Operator constraint
 */
import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

const steps = [
  {
    name: 'devices: Add current_balance column (Hadhaaga SIM Card-ka $)',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS current_balance NUMERIC(10,4) DEFAULT 0.0000;`
  },
  {
    name: 'devices: Add frozen_at column (Goorta la hakiyay)',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP WITH TIME ZONE;`
  },
  {
    name: 'devices: Add frozen_by column (Cidda hakisay)',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS frozen_by UUID;`
  },
  {
    name: 'bundle_rules: Add cost_price column (Qiimaha Bundle-ka $)',
    sql: `ALTER TABLE public.bundle_rules ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,4) DEFAULT 0.0000;`
  },
  {
    name: 'transactions: Add result_text column (Fariinta USSD shaashada)',
    sql: `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS result_text TEXT;`
  },
  {
    name: 'transactions: Add completed_by_device column',
    sql: `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS completed_by_device UUID;`
  },
  {
    name: 'devices: Create unique index (1 device per operator)',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = 'devices' 
          AND indexname = 'idx_devices_one_per_operator'
        ) THEN
          CREATE UNIQUE INDEX idx_devices_one_per_operator 
          ON public.devices(operator_id) 
          WHERE status != 'deleted';
        END IF;
      END $$;
    `
  }
];

async function run() {
  console.log('\n🚀 SHUBE New Features Migration — Starting...\n');
  const client = await pool.connect();
  try {
    for (const step of steps) {
      try {
        await client.query(step.sql);
        console.log(`  ✅ ${step.name}`);
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`  ⏭️  ${step.name} — already exists, skipping`);
        } else {
          console.error(`  ❌ ${step.name}: ${err.message}`);
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
  console.log('\n🎉 Migration complete!\n');
}

run();

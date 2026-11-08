import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  console.log('Running subscription and activation code migration on devices table...');
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS activation_code TEXT;
      ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS activation_code_duration_minutes BIGINT DEFAULT 43200;
      ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;
      CREATE INDEX IF NOT EXISTS idx_devices_activation_code ON public.devices(activation_code);

      ALTER TABLE public.operators ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE public.operators ADD COLUMN IF NOT EXISTS activation_code TEXT;
      ALTER TABLE public.operators ADD COLUMN IF NOT EXISTS activation_code_duration_minutes BIGINT DEFAULT 43200;
    `);
    console.log('✅ Migration applied successfully.');
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'devices' 
        AND (column_name LIKE '%activa%' OR column_name LIKE '%subscript%');
    `);
    console.log('Verified columns in devices table:', res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

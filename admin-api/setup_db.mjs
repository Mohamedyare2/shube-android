import pg from 'pg';
const pool = new pg.Pool({ 
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' 
});

const steps = [
  {
    name: 'Add battery_level column',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS battery_level INT DEFAULT 0;`
  },
  {
    name: 'Add network_type column',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS network_type TEXT DEFAULT 'UNKNOWN';`
  },
  {
    name: 'Add is_online column',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;`
  },
  {
    name: 'Add pairing_code column',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS pairing_code TEXT UNIQUE;`
  },
  {
    name: 'Add last_ping_at column',
    sql: `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMP WITH TIME ZONE;`
  },
  {
    name: 'Create index on pairing_code',
    sql: `CREATE INDEX IF NOT EXISTS idx_devices_pairing_code ON public.devices(pairing_code);`
  },
  {
    name: 'Add device_id to transactions',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'device_id') THEN
          ALTER TABLE public.transactions ADD COLUMN device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `
  },
  {
    name: 'Add operator_id to transactions',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'operator_id') THEN
          ALTER TABLE public.transactions ADD COLUMN operator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `
  }
];

async function run() {
  console.log('\n🚀 Starting SHUBE Devices migration...\n');
  for (const step of steps) {
    try {
      await pool.query(step.sql);
      console.log(`✅ ${step.name}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`⏭️  ${step.name} — already exists, skipping`);
      } else {
        console.error(`❌ ${step.name}: ${err.message}`);
      }
    }
  }
  console.log('\n🎉 Migration complete!\n');
  await pool.end();
}

run();

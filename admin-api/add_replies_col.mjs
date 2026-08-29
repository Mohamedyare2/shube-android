import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' });

async function run() {
  try {
    await pool.query(`ALTER TABLE public.bundle_rules ADD COLUMN IF NOT EXISTS ussd_replies JSONB DEFAULT '[]'::jsonb;`);
    console.log("Successfully added ussd_replies to bundle_rules!");
  } catch (err) {
    console.error("Error updating schema:", err);
  } finally {
    await pool.end();
  }
}

run();

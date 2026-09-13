import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE public.operators 
      ADD COLUMN IF NOT EXISTS ussd_template TEXT DEFAULT '*806*0633920307*{lacag}*2050#',
      ADD COLUMN IF NOT EXISTS ussd_reply_template TEXT DEFAULT 'Waxaad u xawishay {lacag}';
    `);
    console.log('✅ Added ussd_template and ussd_reply_template to operators table');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}
run();

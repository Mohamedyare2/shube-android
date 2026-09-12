import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function check() {
  const client = await pool.connect();
  try {
    const r1 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='operators' AND table_schema='public'");
    console.log('operators:', r1.rows.map(x => x.column_name));
    const r2 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='bundle_rules' AND table_schema='public'");
    console.log('bundle_rules:', r2.rows.map(x => x.column_name));
  } finally {
    client.release();
    pool.end();
  }
}
check();

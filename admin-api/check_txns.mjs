import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function checkData() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT status, test_mode, created_at, operator_id FROM public.transactions ORDER BY created_at DESC LIMIT 10;');
    console.log("Recent transactions:", res.rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    pool.end();
  }
}

checkData();

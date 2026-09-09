import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function checkTable() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM public.app_releases');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    pool.end();
  }
}

checkTable();

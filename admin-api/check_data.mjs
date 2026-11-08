import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function checkCols() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT bundle_name, amount_sls, cost_price
      FROM bundle_rules;
    `);
    console.log("Bundle Rules:", res.rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    pool.end();
  }
}

checkCols();

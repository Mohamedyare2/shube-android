import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function checkTrigger() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT tgname, tgenabled 
      FROM pg_trigger 
      WHERE tgname = 'trg_deduct_card_balance';
    `);
    console.log("Trigger:", res.rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    pool.end();
  }
}

checkTrigger();

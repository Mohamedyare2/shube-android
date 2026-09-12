import 'dotenv/config';
import pkg from 'pg';
import fs from 'fs';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Reading migration 008...');
    const sql = fs.readFileSync('../supabase/migrations/008_card_balance.sql', 'utf8');
    console.log('Executing...');
    await client.query(sql);
    console.log('✅ Migration 008 executed successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}
run();

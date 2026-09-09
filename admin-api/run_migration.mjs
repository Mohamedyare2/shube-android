import 'dotenv/config';
import pkg from 'pg';
import fs from 'fs';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("Reading migration file 007...");
    const sql = fs.readFileSync('../supabase/migrations/007_app_releases.sql', 'utf8');
    
    console.log("Executing migration...");
    await client.query(sql);
    
    console.log("Migration executed successfully!");
  } catch (error) {
    console.error("Error executing migration:", error);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();

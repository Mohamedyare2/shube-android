import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function runGrants() {
  const client = await pool.connect();
  try {
    console.log("Applying grants to app_releases table...");
    await client.query(`
      GRANT ALL ON public.app_releases TO service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;
      GRANT SELECT ON public.app_releases TO anon;
    `);
    console.log("Grants applied successfully!");
  } catch (error) {
    console.error("Error executing grants:", error);
  } finally {
    client.release();
    pool.end();
  }
}

runGrants();

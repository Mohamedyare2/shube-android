import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Running migration...');
    await client.query(`
      ALTER TABLE public.operators 
      ADD COLUMN IF NOT EXISTS app_type TEXT DEFAULT 'shube' CHECK (app_type IN ('shube', 'geesh'));
    `);
    console.log('Success! Added app_type column to operators table.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();

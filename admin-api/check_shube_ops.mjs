import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  // Check Supabase auth.users to get emails/passwords - we'll query auth schema
  // First let's just see which shube operators have null plain_password
  const { rows } = await pool.query(`
    SELECT o.id, o.username, o.app_type, o.profile_id
    FROM public.operators o
    WHERE o.app_type = 'shube'
    ORDER BY o.created_at DESC;
  `);
  console.log('Shube operators:', JSON.stringify(rows, null, 2));
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });

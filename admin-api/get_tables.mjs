import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' });

async function check() {
  const tables = ['devices', 'bundle_rules', 'transactions', 'profiles', 'operators'];
  for (const table of tables) {
    const r = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`, [table]);
    console.log(`\n=== ${table} ===`);
    r.rows.forEach(row => console.log(` - ${row.column_name} (${row.data_type})`));
  }
  await pool.end();
}
check();

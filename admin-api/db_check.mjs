import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' });
async function check() {
  const customers = await pool.query('SELECT * FROM customers');
  console.log('Customers:', customers.rows);
  const tx = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5');
  console.log('Recent Tx:', tx.rows);
  pool.end();
}
check();

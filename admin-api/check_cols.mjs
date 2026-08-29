import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' });

const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'devices' AND table_schema = 'public' ORDER BY ordinal_position`);
console.log('Columns in devices table:');
r.rows.forEach(row => console.log(' -', row.column_name));
await pool.end();

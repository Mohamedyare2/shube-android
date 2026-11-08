import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function checkRpc() {
  const client = await pool.connect();
  try {
    // Run the RPC logic directly
    const res = await client.query(`
      SELECT jsonb_build_object(
        'total',        COUNT(*),
        'success',      COUNT(*) FILTER (WHERE status = 'success'),
        'failed',       COUNT(*) FILTER (WHERE status = 'failed'),
        'pending',      COUNT(*) FILTER (WHERE status IN ('pending','processing','ussd_started','queued')),
        'total_sls',    COALESCE(SUM(amount_sls) FILTER (WHERE status = 'success'), 0)
      ) as stats
      FROM public.transactions
      WHERE created_at >= (NOW() - INTERVAL '30 days')
        AND test_mode = FALSE;
    `);
    console.log("Stats (30 days):", res.rows[0].stats);

    const res2 = await client.query(`
      SELECT jsonb_build_object(
        'total',        COUNT(*),
        'success',      COUNT(*) FILTER (WHERE status = 'success'),
        'failed',       COUNT(*) FILTER (WHERE status = 'failed')
      ) as stats
      FROM public.transactions
      WHERE created_at >= CURRENT_DATE::TIMESTAMPTZ
        AND test_mode = FALSE;
    `);
    console.log("Stats (Today):", res2.rows[0].stats);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    pool.end();
  }
}

checkRpc();

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    const sql = `
    CREATE OR REPLACE FUNCTION public.get_operator_stats(
        p_operator_id UUID,
        p_from_date TIMESTAMPTZ DEFAULT CURRENT_DATE::TIMESTAMPTZ,
        p_to_date   TIMESTAMPTZ DEFAULT (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
    )
    RETURNS JSONB AS $$
    DECLARE
        v_result JSONB;
    BEGIN
        SELECT jsonb_build_object(
            'total',              COUNT(*),
            'success',            COUNT(*) FILTER (WHERE status = 'success'),
            'failed',             COUNT(*) FILTER (WHERE status = 'failed'),
            'pending',            COUNT(*) FILTER (WHERE status IN ('pending','processing','ussd_started','authenticating','confirming','queued', 'ussd_interaction_required')),
            'unknown',            COUNT(*) FILTER (WHERE status = 'unknown_result'),
            'customer_not_found', COUNT(*) FILTER (WHERE status = 'customer_not_found'),
            'invalid_amount',     COUNT(*) FILTER (WHERE status = 'invalid_amount'),
            'duplicates',         COUNT(*) FILTER (WHERE status = 'duplicate'),
            'total_sls_processed', COALESCE(SUM(amount_sls) FILTER (WHERE status = 'success'), 0),
            'total_sls_attempted', COALESCE(SUM(amount_sls), 0)
        )
        INTO v_result
        FROM public.transactions
        WHERE operator_id = p_operator_id
          AND created_at >= p_from_date
          AND created_at < p_to_date
          AND test_mode = FALSE;

        RETURN v_result;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
        p_from_date TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
        p_to_date   TIMESTAMPTZ DEFAULT NOW()
    )
    RETURNS JSONB AS $$
    DECLARE
        v_result JSONB;
    BEGIN
        SELECT jsonb_build_object(
            'total',              COUNT(*),
            'success',            COUNT(*) FILTER (WHERE status = 'success'),
            'failed',             COUNT(*) FILTER (WHERE status = 'failed'),
            'pending',            COUNT(*) FILTER (WHERE status IN ('pending','processing','ussd_started','authenticating','confirming','queued', 'ussd_interaction_required')),
            'unknown',            COUNT(*) FILTER (WHERE status = 'unknown_result'),
            'customer_not_found', COUNT(*) FILTER (WHERE status = 'customer_not_found'),
            'invalid_amount',     COUNT(*) FILTER (WHERE status = 'invalid_amount'),
            'duplicates',         COUNT(*) FILTER (WHERE status = 'duplicate'),
            'total_sls_processed', COALESCE(SUM(amount_sls) FILTER (WHERE status = 'success'), 0),
            'total_sls_attempted', COALESCE(SUM(amount_sls), 0)
        )
        INTO v_result
        FROM public.transactions
        WHERE created_at >= p_from_date
          AND created_at < p_to_date
          AND test_mode = FALSE;

        RETURN v_result;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    await client.query(sql);
    console.log('RPC functions updated successfully!');

    const test = await client.query("SELECT public.get_dashboard_stats(NOW() - INTERVAL '1 day', NOW()) as stats;");
    console.log('Result from get_dashboard_stats:', test.rows[0].stats);
  } catch (err) {
    console.error('Error running SQL:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();

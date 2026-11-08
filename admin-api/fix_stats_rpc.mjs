import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function fixRpc() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.get_operator_stats(
          p_operator_id UUID,
          p_from_date TIMESTAMPTZ DEFAULT CURRENT_DATE::TIMESTAMPTZ,
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
          WHERE operator_id = p_operator_id
            AND created_at BETWEEN p_from_date AND p_to_date
            AND test_mode = FALSE;

          RETURN v_result;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
      
      -- Also update get_dashboard_stats to include ussd_interaction_required in pending, and change p_to_date default to NOW()
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
          WHERE created_at BETWEEN p_from_date AND p_to_date
            AND test_mode = FALSE;

          RETURN v_result;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    console.log("Successfully updated RPC functions!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    pool.end();
  }
}

fixRpc();

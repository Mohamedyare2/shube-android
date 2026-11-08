import pg from 'pg';
const { Pool } = pg;

function getTodayBounds(timeZone = 'Africa/Mogadishu') {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const findPart = (t) => parts.find(p => p.type === t)?.value || '';

  const year = parseInt(findPart('year'), 10);
  const month = parseInt(findPart('month'), 10) - 1;
  const day = parseInt(findPart('day'), 10);
  const hour = parseInt(findPart('hour'), 10);
  const minute = parseInt(findPart('minute'), 10);
  const second = parseInt(findPart('second'), 10);

  const localNowAsUtc = Date.UTC(year, month, day, hour, minute, second);
  const offsetMs = localNowAsUtc - now.getTime();

  const midnightUtcTimestamp = Date.UTC(year, month, day, 0, 0, 0) - offsetMs;
  const endOfDayUtcTimestamp = midnightUtcTimestamp + 86400000;

  const fromDate = new Date(midnightUtcTimestamp).toISOString();
  const toDate = new Date(endOfDayUtcTimestamp).toISOString();

  const pad = (n) => String(n).padStart(2, '0');
  const todayDateStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  return { fromDate, toDate, todayDateStr };
}

async function run() {
  console.log("=== TESTING TODAY BOUNDS COMPUTATION ===");
  const bounds = getTodayBounds('Africa/Mogadishu');
  console.log("Mogadishu Today Bounds:", bounds);

  // Validate bounds
  const fromD = new Date(bounds.fromDate);
  const toD = new Date(bounds.toDate);
  const diffHours = (toD.getTime() - fromD.getTime()) / (1000 * 60 * 60);
  console.log(`Difference in hours: ${diffHours} (should be exactly 24)`);
  if (diffHours !== 24) {
    throw new Error("Date difference is not exactly 24 hours!");
  }

  console.log("\n=== TESTING LIVE SUPABASE RPC FUNCTIONS ===");
  const pool = new Pool({ 
    connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' 
  });
  const client = await pool.connect();

  try {
    // 1. Test get_dashboard_stats
    const dashRes = await client.query(
      'SELECT public.get_dashboard_stats($1::TIMESTAMPTZ, $2::TIMESTAMPTZ) AS stats;',
      [bounds.fromDate, bounds.toDate]
    );
    console.log("Dashboard Stats for Today:", dashRes.rows[0].stats);

    // 2. Test get_operator_stats
    const opQuery = await client.query('SELECT id, username FROM public.operators LIMIT 1;');
    if (opQuery.rows.length > 0) {
      const op = opQuery.rows[0];
      const opRes = await client.query(
        'SELECT public.get_operator_stats($1::UUID, $2::TIMESTAMPTZ, $3::TIMESTAMPTZ) AS stats;',
        [op.id, bounds.fromDate, bounds.toDate]
      );
      console.log(`Operator Stats for '${op.username}' (${op.id}):`, opRes.rows[0].stats);
    }

    // 3. Verify 'unknown' key exists in the JSON response
    const statsObj = dashRes.rows[0].stats;
    if (statsObj.unknown === undefined) {
      throw new Error("'unknown' field is missing from get_dashboard_stats response!");
    }
    console.log("Verified: 'unknown' field is properly present in stats object.");

    console.log("\nALL DATABASE TESTS PASSED SUCCESSFULLY!");
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

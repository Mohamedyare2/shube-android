import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    // 1. Mark existing releases as not latest
    await client.query('UPDATE public.app_releases SET is_latest = false;');

    // 2. Insert new release v1.4.0
    const res = await client.query(`
      INSERT INTO public.app_releases (
        version,
        version_code,
        release_notes,
        apk_url,
        file_size_bytes,
        is_latest,
        force_update
      ) VALUES (
        '1.4.0',
        4,
        'Update Weyn: Aqoonsiga Fariimaha USSD-ga ee Af-Soomaaliga (Success & Failed Detection), Xallinta fariimihii hore ee is-dhex-geli jiray, iyo Jarista tooska ah ee Hadhaaga Card-ka marka xidhmadani guulaysato.',
        '/downloads/shube-latest.apk',
        25961298,
        true,
        false
      ) RETURNING *;
    `);

    console.log('Successfully inserted latest release record:');
    console.log(res.rows[0]);
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(err => {
  console.error('Failed to insert release:', err);
  process.exit(1);
});

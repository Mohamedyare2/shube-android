import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function update() {
  await pool.query('UPDATE public.app_releases SET is_latest = false;');
  const res = await pool.query(`
    INSERT INTO public.app_releases (
      version,
      version_code,
      release_notes,
      apk_url,
      file_size_bytes,
      is_latest,
      force_update,
      created_at
    ) VALUES (
      '1.5.0',
      5,
      '[03:17AM 01/11/2026] Cilladaha la xaliyay: Telephony Isolation (xallinta TikTok/app-switching) iyo in reply-ga USSD si toos ah u galo marka mobilku lock yahay.',
      '/downloads/shube-latest.apk',
      25987613,
      true,
      false,
      '2026-11-01T00:17:00.000Z'
    ) RETURNING *;
  `);
  console.log('Successfully inserted release record:');
  console.log(res.rows[0]);
  await pool.end();
}

update().catch(err => {
  console.error(err);
  process.exit(1);
});

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function insertUpdate() {
  const client = await pool.connect();
  try {
    // Reset all others to false
    await client.query(`UPDATE public.app_releases SET is_latest = FALSE;`);

    // Insert 1.0.1
    await client.query(`
        INSERT INTO public.app_releases (
            version,
            version_code,
            release_notes,
            apk_url,
            file_size_bytes,
            is_latest,
            force_update
        ) VALUES (
            '1.0.1',
            2,
            'Bugfix: Wuxuu xalinayaa cilladii ahayd in SMS-ka lacag dirista loo fahmo lacag soo dhacday.',
            '/downloads/shube-latest.apk',
            25961298,
            TRUE,
            FALSE
        )
        ON CONFLICT (version_code) DO UPDATE SET is_latest = TRUE;
    `);
    
    console.log("Inserted version 1.0.1 successfully!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    pool.end();
  }
}

insertUpdate();

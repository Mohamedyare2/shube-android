/**
 * Setup: Create app_releases table + app-releases storage bucket
 * Run: node setup_app_releases.mjs
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envFile = readFileSync(join(__dirname, '.env'), 'utf8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...valParts] = trimmed.split('=')
    if (key && !process.env[key]) process.env[key] = valParts.join('=').trim()
  }
} catch {}

const SUPABASE_URL     = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { ok: res.ok, status: res.status, data: json }
}

async function run() {
  console.log('🚀 Setting up app_releases table and storage bucket...\n')

  // 1. Check if table already exists
  const check = await sbFetch('/rest/v1/app_releases?select=id&limit=1')
  if (check.ok) {
    console.log('✅ app_releases table already exists!')
  } else {
    console.log('📝 Creating app_releases table...')
    console.log('\n─────────────────────────────────────────────────────────────')
    console.log('Please run this SQL in your Supabase SQL Editor:')
    console.log('https://supabase.com/dashboard/project/_/sql\n')
    console.log(`
CREATE TABLE IF NOT EXISTS public.app_releases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version         TEXT NOT NULL,
  version_code    INT NOT NULL,
  release_notes   TEXT,
  apk_url         TEXT NOT NULL,
  file_size_bytes BIGINT,
  is_latest       BOOLEAN NOT NULL DEFAULT false,
  force_update    BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Admins can do everything, operators can only read
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read releases"
  ON public.app_releases FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Only admins can insert releases"
  ON public.app_releases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Only admins can update releases"
  ON public.app_releases FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Only admins can delete releases"
  ON public.app_releases FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
`)
    console.log('─────────────────────────────────────────────────────────────')
  }

  // 2. Create storage bucket
  console.log('\n📦 Creating storage bucket "app-releases"...')
  const bucketRes = await sbFetch('/storage/v1/bucket', {
    method: 'POST',
    body: JSON.stringify({
      id: 'app-releases',
      name: 'app-releases',
      public: true,
      file_size_limit: 104857600, // 100MB
      allowed_mime_types: ['application/vnd.android.package-archive', 'application/octet-stream'],
    }),
  })

  if (bucketRes.ok) {
    console.log('✅ Storage bucket "app-releases" created!')
  } else if (bucketRes.status === 409 || (typeof bucketRes.data === 'object' && bucketRes.data?.error?.includes('already exists'))) {
    console.log('✅ Storage bucket "app-releases" already exists!')
  } else {
    console.log('⚠️  Bucket creation result:', bucketRes.data)
    console.log('\nIf bucket creation failed, please create it manually:')
    console.log('  Supabase Dashboard → Storage → New bucket')
    console.log('  Name: app-releases')
    console.log('  Public: YES (so operators can download APKs)')
    console.log('  Max file size: 100MB')
  }

  console.log('\n✅ Setup complete! You can now upload APKs from the Download App page.')
}

run().catch(console.error)

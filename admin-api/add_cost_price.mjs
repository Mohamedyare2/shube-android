/**
 * Migration: Add cost_price column to bundle_rules table
 * Run once: node add_cost_price.mjs
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
}

async function run() {
  // Use Supabase SQL endpoint to add column if not exists
  const sql = `
    ALTER TABLE bundle_rules 
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,4) DEFAULT NULL;
    
    COMMENT ON COLUMN bundle_rules.cost_price IS 
      'Qiimaha asalka ah oo dollar ($) - shirkadda waxay ku gataa bundle-ka (cost price). Profit = amount_sls / exchange_rate - cost_price';
  `

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql }),
  })

  if (!res.ok) {
    // Try via pg REST if exec_sql not available
    console.log('exec_sql RPC not available, trying direct approach...')
    
    // Test by just querying the column
    const testRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bundle_rules?select=cost_price&limit=1`,
      { headers }
    )
    
    if (testRes.ok) {
      console.log('✅ cost_price column already exists!')
    } else {
      console.log('❌ Column does not exist. Please run this SQL in Supabase SQL Editor:')
      console.log('─'.repeat(60))
      console.log(sql)
      console.log('─'.repeat(60))
    }
  } else {
    console.log('✅ Migration successful! cost_price column added to bundle_rules.')
  }

  // Also verify by reading current bundles
  const bRes = await fetch(`${SUPABASE_URL}/rest/v1/bundle_rules?select=id,bundle_name,amount_sls,cost_price&limit=5`, { headers })
  if (bRes.ok) {
    const bundles = await bRes.json()
    console.log('\nCurrent bundles:')
    bundles.forEach(b => {
      console.log(`  ${b.bundle_name}: amount=${b.amount_sls} SLS, cost_price=${b.cost_price ?? 'NOT SET'}$`)
    })
  }
}

run().catch(console.error)

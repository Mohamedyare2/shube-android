const URL = 'https://eabwhgujwywwiormujrr.supabase.co';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk3MTg5MCwiZXhwIjoyMTAyNTQ3ODkwfQ.K96uB97UeRImTRQtoaNTPTN3pdgUkMqeAjwlzhnbEIM';

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

async function q(path) {
  const r = await fetch(URL + path, { headers: h });
  return r.json();
}

// 1. All operators with referral codes
const ops = await q('/rest/v1/operators?select=id,username,referral_code,referral_active');
console.log('\n=== OPERATORS ===');
console.log(JSON.stringify(ops, null, 2));

// 2. All feature access rows
const fa = await q('/rest/v1/operator_feature_access?select=*');
console.log('\n=== FEATURE ACCESS ROWS ===');
console.log(JSON.stringify(fa, null, 2));

// 3. Columns in operator_feature_access via pg introspection
const cols = await q("/rest/v1/rpc/get_table_columns");
console.log('\n=== COLS (via rpc) ===', JSON.stringify(cols));

// 4. Test live API for a known referral code
if (Array.isArray(ops) && ops.length > 0) {
  const code = ops[0].referral_code;
  if (code) {
    const r = await fetch(`https://shube.vercel.app/api/register?code=${code}`);
    const d = await r.json();
    console.log(`\n=== LIVE API /api/register?code=${code} ===`);
    console.log(JSON.stringify(d, null, 2));
  }
}

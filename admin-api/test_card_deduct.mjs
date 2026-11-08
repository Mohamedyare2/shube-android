import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Testing card balance auto-deduction trigger...');

    // 1. Pick an operator and bundle
    const opRes = await client.query('SELECT id, username, card_balance FROM public.operators WHERE card_balance > 0 LIMIT 1;');
    if (opRes.rows.length === 0) {
      console.log('No operator with card_balance > 0 found, picking first operator');
    }
    const op = (opRes.rows[0]) || (await client.query('SELECT id, username, card_balance FROM public.operators LIMIT 1;')).rows[0];
    const initialBal = parseFloat(op.card_balance || 0);

    const brRes = await client.query('SELECT id, bundle_name, cost_price FROM public.bundle_rules WHERE cost_price > 0 LIMIT 1;');
    const bundle = brRes.rows[0];
    const costPrice = parseFloat(bundle.cost_price);

    console.log(`Operator: ${op.username} (${op.id}), Initial Balance: $${initialBal}`);
    console.log(`Bundle: ${bundle.bundle_name} (${bundle.id}), Card Deduction Cost: $${costPrice}`);

    // 2. Insert a transaction with status 'processing'
    const testHash = 'test_hash_' + Date.now();
    const insertRes = await client.query(`
      INSERT INTO public.transactions (
        sms_hash, telesom_number, somtel_number, amount_sls, currency,
        bundle_rule_id, operator_id, status, test_mode
      ) VALUES (
        $1, '634284015', '657575175', 1500, 'SLS',
        $2, $3, 'processing', true
      ) RETURNING id;
    `, [testHash, bundle.id, op.id]);

    const txId = insertRes.rows[0].id;
    console.log(`Created test transaction: ${txId}`);

    // 3. Balance before update should still be initial
    const balBefore = parseFloat((await client.query('SELECT card_balance FROM public.operators WHERE id = $1;', [op.id])).rows[0].card_balance);
    console.log(`Balance while processing: $${balBefore} (matches initial: ${balBefore === initialBal})`);

    // 4. Update transaction to 'success'
    await client.query(`UPDATE public.transactions SET status = 'success', completed_at = NOW() WHERE id = $1;`, [txId]);

    // 5. Check new balance
    const balAfter = parseFloat((await client.query('SELECT card_balance FROM public.operators WHERE id = $1;', [op.id])).rows[0].card_balance);
    const expectedBal = parseFloat((initialBal - costPrice).toFixed(4));
    console.log(`Balance after success: $${balAfter} (Expected: $${expectedBal})`);

    if (Math.abs(balAfter - expectedBal) < 0.0001) {
      console.log(`SUCCESS! Exactly $${costPrice} was deducted from card balance!`);
    } else {
      throw new Error(`Balance deduction mismatch! Got ${balAfter}, expected ${expectedBal}`);
    }

    // 6. Clean up test transaction and restore operator balance
    await client.query('DELETE FROM public.transactions WHERE id = $1;', [txId]);
    await client.query('UPDATE public.operators SET card_balance = $1 WHERE id = $2;', [initialBal, op.id]);
    console.log(`Cleaned up test transaction and restored operator balance to $${initialBal}.`);
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

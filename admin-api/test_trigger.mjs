import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function testTrigger() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get operator and bundle
    const bundleRes = await client.query(`SELECT id, cost_price FROM bundle_rules WHERE cost_price > 0 LIMIT 1;`);
    const bundle = bundleRes.rows[0];
    
    const opRes = await client.query(`SELECT id, card_balance FROM operators LIMIT 1;`);
    const operator = opRes.rows[0];
    
    console.log(`Initial Balance: ${operator.card_balance}, Bundle Cost: ${bundle.cost_price}`);
    
    // Insert pending transaction
    const txRes = await client.query(`
      INSERT INTO transactions (sms_hash, telesom_number, amount_sls, currency, bundle_rule_id, operator_id, status)
      VALUES ($1, '0631234567', 5500, 'SLS', $2, $3, 'pending')
      RETURNING id;
    `, [Date.now().toString(), bundle.id, operator.id]);
    
    const txId = txRes.rows[0].id;
    
    // Transition to success
    await client.query(`
      SELECT public.update_transaction_state($1, 'processing');
      SELECT public.update_transaction_state($1, 'ussd_started');
      SELECT public.update_transaction_state($1, 'authenticating');
      SELECT public.update_transaction_state($1, 'confirming');
      SELECT public.update_transaction_state($1, 'success');
    `, [txId]);
    
    // Check new balance
    const newOpRes = await client.query(`SELECT card_balance FROM operators WHERE id = $1;`, [operator.id]);
    console.log(`New Balance: ${newOpRes.rows[0].card_balance}`);
    
    await client.query('ROLLBACK');
    console.log('Rolled back test successfully.');
  } catch (error) {
    console.error("Error:", error);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    pool.end();
  }
}

testTrigger();

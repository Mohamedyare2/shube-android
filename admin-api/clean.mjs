const SUPABASE_URL = 'https://eabwhgujwywwiormujrr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk3MTg5MCwiZXhwIjoyMTAyNTQ3ODkwfQ.K96uB97UeRImTRQtoaNTPTN3pdgUkMqeAjwlzhnbEIM';

async function run() {
  const headers = { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  
  const idToDelete = 'ec01f35b-6aec-40e0-832b-a491e108be0b';
  const newOwner = '7ac39f63-c18a-4f43-960b-871a4b695d36'; // Super Admin

  // Reassign customers
  await fetch(`${SUPABASE_URL}/rest/v1/customers?created_by=eq.${idToDelete}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ created_by: newOwner })
  });
  
  // Reassign transactions
  await fetch(`${SUPABASE_URL}/rest/v1/transactions?actor_id=eq.${idToDelete}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ actor_id: newOwner })
  });

  // Reassign audit logs
  await fetch(`${SUPABASE_URL}/rest/v1/audit_logs?actor_id=eq.${idToDelete}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ actor_id: newOwner })
  });

  // Now delete the user
  const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${idToDelete}`, { method: 'DELETE', headers });
  if (delRes.ok) {
    console.log(`Successfully deleted abdirahmanhassan4868@gmail.com`);
  } else {
    console.error(`Failed to delete abdirahmanhassan4868@gmail.com:`, await delRes.text());
  }
}
run();

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eabwhgujwywwiormujrr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk3MTg5MCwiZXhwIjoyMTAyNTQ3ODkwfQ.K96uB97UeRImTRQtoaNTPTN3pdgUkMqeAjwlzhnbEIM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const fromDate = startOfToday.toISOString()

  const res = await supabase.rpc('get_dashboard_stats', { p_from_date: fromDate })
  console.log("res.data:", res.data);
  console.log("Type of res.data:", typeof res.data);
  console.log("Is array?", Array.isArray(res.data));
}

testRpc();

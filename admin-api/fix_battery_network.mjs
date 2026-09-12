// Script to check current device data and patch battery/network in DB
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// 1. List all devices
const res = await fetch(`${SUPABASE_URL}/rest/v1/devices?select=id,phone_number,battery_level,network_type,status,last_ping_at&order=last_ping_at.desc`, { headers });
const devices = await res.json();

console.log('\n=== CURRENT DEVICES ===');
devices.forEach(d => {
  console.log(`ID: ${d.id}`);
  console.log(`  Phone:   ${d.phone_number}`);
  console.log(`  Battery: ${d.battery_level}`);
  console.log(`  Network: ${d.network_type}`);
  console.log(`  Status:  ${d.status}`);
  console.log(`  Last:    ${d.last_ping_at}`);
  console.log('');
});

// 2. Clear invalid UNKNOWN/0 values so UI shows — instead
if (devices.length > 0) {
  for (const d of devices) {
    const patch = {};
    if (d.battery_level === 0 || d.battery_level === null) {
      patch.battery_level = null;
    }
    if (!d.network_type || ['UNKNOWN', 'Unknown', 'Offline', 'OFFLINE', 'unknown'].includes(d.network_type)) {
      patch.network_type = null;
    }

    if (Object.keys(patch).length > 0) {
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${d.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(patch),
      });
      const result = await patchRes.json();
      console.log(`✅ Cleared invalid values for device ${d.id}:`, patch);
      console.log('   Result:', JSON.stringify(result[0]?.battery_level), JSON.stringify(result[0]?.network_type));
    } else {
      console.log(`✔  Device ${d.id} already has valid values — no change needed`);
    }
  }
}

console.log('\nDone. Refresh the website now!');

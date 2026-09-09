import 'dotenv/config';
import fetch from 'node-fetch';

const url = `${process.env.SUPABASE_URL}/rest/v1/app_releases?select=*`;

async function testQuery() {
  console.log("Fetching...", url);
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text);
}

testQuery();

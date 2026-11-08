import fs from 'fs';

const SUPABASE_URL = 'https://eabwhgujwywwiormujrr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk3MTg5MCwiZXhwIjoyMTAyNTQ3ODkwfQ.K96uB97UeRImTRQtoaNTPTN3pdgUkMqeAjwlzhnbEIM';

async function uploadRelease() {
  const filePath = '../android/app/build/outputs/apk/debug/app-debug.apk';
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fs.statSync(filePath).size;
  const fileName = `shube-v1.3.0-${Date.now()}.apk`;

  console.log(`Uploading ${fileName}...`);

  // 1. Upload to Storage
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/app-releases/${fileName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/vnd.android.package-archive',
      'x-upsert': 'false'
    },
    body: fileBuffer
  });

  if (!uploadRes.ok) {
    console.error('Upload Error:', await uploadRes.text());
    return;
  }
  
  const apkUrl = `${SUPABASE_URL}/storage/v1/object/public/app-releases/${fileName}`;
  console.log(`Uploaded to ${apkUrl}`);

  // 2. Mark others as not latest
  await fetch(`${SUPABASE_URL}/rest/v1/app_releases?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ is_latest: false })
  });

  // 3. Insert new release
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/app_releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      version: '1.3.0',
      version_code: 3,
      release_notes: 'Fix: Wake up screen for USSD processing during Doze mode.',
      apk_url: apkUrl,
      file_size_bytes: fileSize,
      is_latest: true,
      force_update: true
    })
  });

  if (!insertRes.ok) {
    console.error('DB Error:', await insertRes.text());
  } else {
    console.log('Successfully inserted into app_releases table!');
  }
}

uploadRelease();

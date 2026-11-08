import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadRelease() {
  const filePath = '../android/app/build/outputs/apk/debug/app-debug.apk';
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fs.statSync(filePath).size;
  const fileName = `shube-v1.3.0-${Date.now()}.apk`;

  console.log(`Uploading ${fileName}...`);

  const { error: uploadError } = await supabase.storage
    .from('app-releases')
    .upload(fileName, fileBuffer, {
      contentType: 'application/vnd.android.package-archive',
      upsert: false
    });

  if (uploadError) {
    console.error('Upload Error:', uploadError);
    return;
  }

  const { data: urlData } = supabase.storage.from('app-releases').getPublicUrl(fileName);
  const apkUrl = urlData.publicUrl;

  console.log(`Uploaded to ${apkUrl}`);

  // Mark others as not latest
  await supabase.from('app_releases').update({ is_latest: false }).neq('id', '00000000-0000-0000-0000-000000000000');

  // Insert new
  const { error: dbError } = await supabase.from('app_releases').insert({
    version: '1.3.0',
    version_code: 3,
    release_notes: 'Fix: Wake up screen for USSD processing during Doze mode.',
    apk_url: apkUrl,
    file_size_bytes: fileSize,
    is_latest: true,
    force_update: true
  });

  if (dbError) {
    console.error('DB Error:', dbError);
  } else {
    console.log('Successfully inserted into app_releases table!');
  }
}

uploadRelease();

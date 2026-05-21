import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { join } from 'path';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SECRET_KEYS_SUPABASE);

async function check() {
  const { data, error } = await supabase.from('videos').select('*').limit(1);
  console.log('Videos columns:', Object.keys(data?.[0] || {}));
  
  // Check if session table exists
  const { error: sessionError } = await supabase.from('video_edits').select('*').limit(1);
  if (sessionError) {
    console.log('video_edits table MISSING');
  } else {
    console.log('video_edits table EXISTS');
  }
}
check();

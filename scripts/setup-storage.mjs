import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envPath = join(__dirname, '../.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envConfig.SECRET_KEYS_SUPABASE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Service Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupBuckets() {
  const buckets = ['overlay-images', 'overlay-audio'];
  
  for (const bucketName of buckets) {
    console.log(`Setting up bucket: ${bucketName}`);
    
    // Check if bucket exists
    const { data: bucket, error: checkError } = await supabase.storage.getBucket(bucketName);
    
    if (checkError) {
      console.log(`Bucket ${bucketName} doesn't exist, creating...`);
      const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });
      
      if (createError) {
        console.error(`Error creating bucket ${bucketName}:`, createError.message);
      } else {
        console.log(`Bucket ${bucketName} created successfully.`);
      }
    } else {
      console.log(`Bucket ${bucketName} already exists.`);
    }
  }
}

setupBuckets().catch(console.error);

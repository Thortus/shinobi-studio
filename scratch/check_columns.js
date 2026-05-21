
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('video_edits')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error fetching video_edits:', error);
  } else {
    console.log('Columns in video_edits:', Object.keys(data[0] || {}));
  }
}

checkSchema();

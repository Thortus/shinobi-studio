import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SECRET_KEYS_SUPABASE!
);

export async function POST(req: NextRequest) {
  const { fileName } = await req.json();
  if (!fileName) return NextResponse.json({ error: 'fileName required' }, { status: 400 });

  const { data, error } = await admin.storage.from('videos').createSignedUploadUrl(fileName);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from('videos').getPublicUrl(fileName);

  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, publicUrl });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SECRET_KEYS_SUPABASE!
  );

  const { title, fileName, duration } = await req.json();
  if (!title || !fileName) return NextResponse.json({ error: 'title and fileName required' }, { status: 400 });

  const { data: { publicUrl } } = admin.storage.from('videos').getPublicUrl(fileName);

  const { data, error } = await admin
    .from('videos')
    .insert({ title, video_url: publicUrl, duration: duration || 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

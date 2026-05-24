import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { fileName } = await req.json();
  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'fileName required' }, { status: 400 });
  }

  const { error } = await admin.storage.from('videos').remove([fileName]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

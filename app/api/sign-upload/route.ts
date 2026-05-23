import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const ALLOWED_EXTS = new Set(['webm', 'mp4', 'mov', 'mkv', 'vtt']);

function safeSlug(title: string): string {
  return title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';
}

export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SECRET_KEYS_SUPABASE!
  );

  const { title, ext } = await req.json();
  if (!ext || !ALLOWED_EXTS.has(ext.toLowerCase())) {
    return NextResponse.json({ error: `ext must be one of: ${[...ALLOWED_EXTS].join(', ')}` }, { status: 400 });
  }

  const slug = safeSlug(title || 'video');
  const fileName = `${slug}-${Date.now()}-${randomUUID()}.${ext.toLowerCase()}`;

  const { data, error } = await admin.storage.from('videos').createSignedUploadUrl(fileName);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from('videos').getPublicUrl(fileName);

  return NextResponse.json({ signedUrl: data.signedUrl, fileName, publicUrl });
}

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { videoId, videoTitle } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Double check the video to make sure a notification hasn't already been sent
    const { data: video, error: dbError } = await supabase
      .from('videos')
      .select('notification_sent')
      .eq('id', videoId)
      .single();

    if (dbError || !video) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    if (video.notification_sent) {
      return NextResponse.json({ message: 'Notification already sent previously' }, { status: 200 });
    }

    // Dispatch the email via Resend native fetch API
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'ShinobiRise Alerts <onboarding@resend.dev>', // Default resend testing domain
        to: 'drcabrerap@gmail.com',
        subject: `🎥 Someone watched your video: ${videoTitle || videoId}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #732C3F;">Good news!</h2>
            <p>A prospect has just opened the tracking link for your video audit: <strong>${videoTitle || videoId}</strong>.</p>
            <p>They are viewing it right now.</p>
            <br/>
            <p style="color: #888; font-size: 12px;">This is an automated dispatch from your Shinobi Video Tracker.</p>
          </div>
        `
      })
    });

    if (!resendRes.ok) {
        const err = await resendRes.json();
        console.error("Resend Error:", err);
        return NextResponse.json({ error: 'Failed to dispatch email' }, { status: 500 });
    }

    // Mark as sent in DB
    await supabase.from('videos').update({ notification_sent: true }).eq('id', videoId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Notify Route Error:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

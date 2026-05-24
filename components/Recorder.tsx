'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function createVTT(text: string): Blob {
  const words = text.split(' ').filter(Boolean);
  let vtt = 'WEBVTT\n\n';
  let t = 0;
  for (let i = 0; i < words.length; i += 5) {
    const chunk = words.slice(i, i + 5).join(' ');
    const start = new Date(t * 1000).toISOString().substring(11, 23);
    t += 3;
    const end = new Date(t * 1000).toISOString().substring(11, 23);
    vtt += `${start} --> ${end}\n${chunk}\n\n`;
  }
  return new Blob([vtt], { type: 'text/vtt' });
}

export default function Recorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | 'GO!' | null>(null);
  const [mode, setMode] = useState<'screen' | 'camera' | 'combo'>('combo');
  const [camPosition, setCamPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>('bottom-right');
  const [camShape, setCamShape] = useState<'circle' | 'rect'>('circle');
  const [logoPosition, setLogoPosition] = useState<'none' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');
  const [logoSrc, setLogoSrc] = useState<string>('/Shinobiriselogo_black_nobg.png');
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  
  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');
  const [generateSrt, setGenerateSrt] = useState(true);
  const [enhanceMic, setEnhanceMic] = useState(true);
  const [integratePrompter, setIntegratePrompter] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentVideoFilename, setCurrentVideoFilename] = useState<string | null>(null);
  const [camExpanded, setCamExpanded] = useState(false);
  const camExpandedRef = useRef(false);
  const [camFullscreen, setCamFullscreen] = useState(false);
  const camFullscreenRef = useRef(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);

  const toggleCamExpanded = () => {
    camExpandedRef.current = !camExpandedRef.current;
    setCamExpanded(camExpandedRef.current);
  };

  const toggleCamFullscreen = () => {
    camFullscreenRef.current = !camFullscreenRef.current;
    setCamFullscreen(camFullscreenRef.current);
  };

  // Native Teleprompter State
  const [showPrompter, setShowPrompter] = useState(false);
  const [prompterVisible, setPrompterVisible] = useState(true);
  const [prompterSpeed, setPrompterSpeed] = useState(0.8);
  const [prompterPaused, setPrompterPaused] = useState(false);
  const prompterRef = useRef<HTMLDivElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Teleprompter Auto-Scroll Loop
  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();
    
    const scroll = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      
      if (isRecording && showPrompter && !prompterPaused && prompterRef.current && prompterVisible) {
        prompterRef.current.scrollTop += (prompterSpeed * delta * 0.03);
      }
      animationId = requestAnimationFrame(scroll);
    };
    
    animationId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationId);
  }, [isRecording, showPrompter, prompterPaused, prompterSpeed]);

  // Keyboard shortcuts during recording
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isRecording) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'c' || e.key === 'C') toggleCamFullscreen();
      if (e.key === 'e' || e.key === 'E') toggleCamExpanded();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRecording]);

  useEffect(() => {
    const img = new Image();
    img.src = logoSrc;
    img.onload = () => setLogoImg(img);
  }, [logoSrc]);

  useEffect(() => {
    return () => {
      stopStreams();
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl); // M6
    };
  }, [localBlobUrl]);

  const uploadThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentVideoId || !currentVideoFilename) return;
    
    setThumbnailUploading(true);
    const thumbFilename = currentVideoFilename.replace('.webm', `-thumb-${Date.now()}.jpg`);
    
    try {
      const { error } = await supabase.storage.from('videos').upload(thumbFilename, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      
      const { data: pData } = supabase.storage.from('videos').getPublicUrl(thumbFilename);
      const { error: dbError } = await supabase.from('videos').update({ thumbnail_url: pData.publicUrl }).eq('id', currentVideoId);
      
      if (dbError) throw dbError;
      alert('Custom thumbnail successfully applied!');
    } catch (err: any) {
      console.error('Thumbnail upload error detail:', err);
      const msg = err?.message || err?.error_description || (typeof err === 'string' ? err : 'Unknown storage error');
      alert(`Failed to upload custom thumbnail: ${msg}`);
    } finally {
      setThumbnailUploading(false);
    }
  };

  const deleteCurrentVideo = async () => {
    if (!currentVideoId || !currentVideoFilename) return;
    if (!confirm('Are you sure you want to delete this recorded video?')) return;
    
    setUploading(true);
    // Delete from storage
    const vttFilename = currentVideoFilename.replace('.webm', '.vtt');
    await supabase.storage.from('videos').remove([currentVideoFilename, vttFilename]);
    // Delete from DB
    await supabase.from('videos').delete().eq('id', currentVideoId);
    
    setShareLink('');
    setCurrentVideoId(null);
    setCurrentVideoFilename(null);
    setTitle('');
    setUploading(false);
    alert('Video successfully deleted! Free storage restored.');
  };

  const stopStreams = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (screenVideoRef.current?.srcObject) (screenVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    if (cameraVideoRef.current?.srcObject) (cameraVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
    }
  };

  const startCountdown = async () => {
    if (!title.trim()) return alert('Please add a title for the video first.');
    setShareLink('');

    let camStream: MediaStream | null = null;
    let screenStream: MediaStream | null = null;

    try {
      const audioConstraints = enhanceMic 
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        : true;

      // 1. Get Camera/Mic first
      try {
        if (mode === 'camera' || mode === 'combo') {
          camStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user', 
              width: { ideal: 1280 }, 
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 60 } 
            }, 
            audio: audioConstraints 
          });
        } else {
          // Screen-only: mic is optional — don't abort if denied/not found
          try {
            camStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          } catch {
            camStream = new MediaStream();
          }
        }
      } catch (camErr: any) {
        console.error("Camera/Mic Error:", camErr);
        if (camErr.name === 'NotAllowedError') return alert('Camera/Microphone access was denied. Please enable permissions in your browser settings.');
        if (camErr.name === 'NotFoundError') return alert('No camera or microphone found on this device.');
        throw camErr;
      }

      // 2. Get Screen Stream if needed
      if (mode === 'screen' || mode === 'combo') {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: {
              frameRate: { ideal: 30 }
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        } catch (screenErr: any) {
          console.error("Screen Share Error:", screenErr);
          // If user cancels screen share, stop the camera we just opened
          if (camStream) camStream.getTracks().forEach(t => t.stop());
          if (screenErr.name === 'NotAllowedError') return; // User just clicked cancel, no need for scary alert
          throw screenErr;
        }
      }
    } catch (err: any) {
      console.error("General Media Error:", err);
      const isTimeout = err.message?.toLowerCase().includes('timeout') || err.name === 'AbortError';
      return alert(isTimeout 
        ? 'Media capture timed out. This often happens if the hardware is busy or the request was interrupted. Please refresh and try again.' 
        : `Failed to start: ${err.message || 'Unknown error'}`);
    }

    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else if (count === 0) {
        setCountdown('GO!');
      } else {
        clearInterval(interval);
        setCountdown(null);
        if (script.trim()) {
          if (integratePrompter) {
            setShowPrompter(true);
          } else {
            localStorage.setItem('prompterScript', script);
            window.open('/teleprompter.html', 'Prompter', 'width=800,height=600,menubar=no,toolbar=no,location=no,status=no,alwaysRaised=yes');
          }
        }
        beginRecording(camStream!, screenStream);
      }
    }, 1000);
  };

  const recordingStartTimeRef = useRef<number>(0);

  const beginRecording = (camStream: MediaStream, screenStream: MediaStream | null) => {
    recordingStartTimeRef.current = Date.now();
    
    // 1. Create Canvas for dynamic composition
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Source elements for drawing
    const camVid = document.createElement('video');
    camVid.srcObject = camStream;
    camVid.muted = true;
    camVid.play().catch(e => console.error("Cam play fail", e));

    let screenVid: HTMLVideoElement | null = null;
    if (screenStream) {
      screenVid = document.createElement('video');
      screenVid.srcObject = screenStream;
      screenVid.muted = true;
      screenVid.play().catch(e => console.error("Screen play fail", e));
    }

    const drawFrame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // A. Draw background layer
      const showCamFullscreen = camFullscreenRef.current || mode === 'camera';
      if (showCamFullscreen && camVid.readyState >= 2 && camVid.videoWidth > 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const aspect = camVid.videoWidth / camVid.videoHeight;
        const targetW = canvas.width;
        const targetH = canvas.width / aspect;
        ctx.drawImage(camVid, 0, (canvas.height - targetH) / 2, targetW, targetH);
      } else if (screenVid && screenVid.readyState >= 2) {
        ctx.drawImage(screenVid, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#16161A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // B. Draw Camera PIP (only when not fullscreen and not camera-only mode)
      if (!showCamFullscreen && camVid.readyState >= 2 && camVid.videoWidth > 0) {
        let camW = 320;
        let camH = 180;
        if (camExpandedRef.current) { camW = 640; camH = 360; }

        let x = canvas.width - camW - 40;
        let y = canvas.height - camH - 40;
        if (camPosition === 'bottom-left') { x = 40; y = canvas.height - camH - 40; }
        else if (camPosition === 'top-right') { x = canvas.width - camW - 40; y = 40; }
        else if (camPosition === 'top-left') { x = 40; y = 40; }

        ctx.save();
        if (camShape === 'circle') {
          ctx.beginPath();
          ctx.arc(x + camW / 2, y + camH / 2, camH / 2, 0, Math.PI * 2);
          ctx.clip();
          // Draw centered
          const aspect = camVid.videoWidth / camVid.videoHeight;
          const dw = camH * aspect;
          ctx.drawImage(camVid, x + (camW - dw)/2, y, dw, camH);
        } else {
          // Rounded Rect
          const r = 24;
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + camW - r, y);
          ctx.quadraticCurveTo(x + camW, y, x + camW, y + r);
          ctx.lineTo(x + camW, y + camH - r);
          ctx.quadraticCurveTo(x + camW, y + camH, x + camW - r, y + camH);
          ctx.lineTo(x + r, y + camH);
          ctx.quadraticCurveTo(x, y + camH, x, y + camH - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(camVid, x, y, camW, camH);
        }
        ctx.restore();
      }

      // C. Draw Logo
      if (logoImg && logoPosition !== 'none') {
        const lScale = 120 / logoImg.width;
        const lw = 120;
        const lh = logoImg.height * lScale;
        let lx = 40, ly = 40;
        if (logoPosition === 'top-right') lx = canvas.width - lw - 40;
        else if (logoPosition === 'bottom-left') ly = canvas.height - lh - 40;
        else if (logoPosition === 'bottom-right') { lx = canvas.width - lw - 40; ly = canvas.height - lh - 40; }
        ctx.drawImage(logoImg, lx, ly, lw, lh);
      }

      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    // 2. Audio Merging
    const canvasStream = canvas.captureStream(30);
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();

    if (camStream.getAudioTracks().length > 0) {
      audioCtx.createMediaStreamSource(new MediaStream([camStream.getAudioTracks()[0]])).connect(dest);
    }
    if (screenStream && screenStream.getAudioTracks().length > 0) {
      audioCtx.createMediaStreamSource(new MediaStream([screenStream.getAudioTracks()[0]])).connect(dest);
    }

    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const mediaRecorder = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp8,opus' });
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      setUploading(true);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      
      const measuredDurationRaw = (Date.now() - recordingStartTimeRef.current) / 1000;
      const measuredDuration = (isFinite(measuredDurationRaw) && measuredDurationRaw > 0) ? measuredDurationRaw : 0;
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });

      if (blob.size === 0) {
        setUploading(false);
        stopStreams();
        return alert('Recording produced no data — try again.');
      }

      const localUrl = URL.createObjectURL(blob);
      setLocalBlobUrl(localUrl);

      // Get signed upload URL — server generates the filename (C3/M5)
      const signRes = await fetch('/api/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, ext: 'webm' }),
      });
      if (!signRes.ok) {
        const e = await signRes.json().catch(() => ({}));
        setUploading(false);
        stopStreams(); // M4
        return alert('Upload failed: ' + (e.error || signRes.statusText));
      }
      const { token, fileName, publicUrl } = await signRes.json();

      // Upload via SDK (handles multipart + auth headers correctly)
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .uploadToSignedUrl(fileName, token, blob, { contentType: 'video/webm', upsert: false });
      if (uploadError) {
        setUploading(false);
        stopStreams(); // M4
        return alert('Upload failed: ' + uploadError.message);
      }

      if (generateSrt && script.trim()) {
        const vttSignRes = await fetch('/api/sign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, ext: 'vtt' }),
        });
        if (vttSignRes.ok) {
          const { token: vttToken, fileName: vttFileName } = await vttSignRes.json();
          const vttBlob = new Blob([createVTT(script)], { type: 'text/vtt' });
          const { error: vttErr } = await supabase.storage
            .from('videos')
            .uploadToSignedUrl(vttFileName, vttToken, vttBlob, { contentType: 'text/vtt', upsert: false });
          if (vttErr) console.warn('VTT upload failed:', vttErr.message); // H2
        } else {
          console.warn('VTT sign failed:', await vttSignRes.text()); // H2
        }
      }

      try {
        const saveRes = await fetch('/api/save-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, fileName, duration: measuredDuration || 0 }),
        });
        if (!saveRes.ok) {
          // H3: DB failed — delete orphaned storage object
          fetch('/api/delete-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName }) }).catch(console.error);
          throw new Error(await saveRes.text());
        }
        const dbData = await saveRes.json();
        setShareLink(`${window.location.origin}/v/${dbData.id}`);
        setCurrentVideoId(dbData.id);
        setCurrentVideoFilename(fileName);
      } catch (dbErr: any) {
        console.error("DB Insert Error:", dbErr);
        alert('Video uploaded but could not be saved. Check console for details.');
      }

      setUploading(false);
      stopStreams();
    };

    mediaRecorder.start(100); 
    setIsRecording(true);
    
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = combined;
      videoPreviewRef.current.play().catch(console.error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.requestData(); // flush final chunk before stop
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setShowPrompter(false);
  };

  return (
    <div className="min-h-screen bg-[#F3F1FD] text-slate-800 font-sans selection:bg-indigo-100 flex py-10 px-4">
      
      {/* 🔴 RECORDING BANNER */}
      {isRecording && (
        <div className="fixed top-0 left-0 w-full bg-rose-500 text-white text-center py-2 font-semibold z-50 animate-pulse flex items-center justify-center gap-2 text-sm tracking-wide shadow-md">
          <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping"></div>
          Recording in Progress
        </div>
      )}

      {/* ⏱ COUNTDOWN OVERLAY */}
      {countdown !== null && (
        <div className="fixed inset-0 bg-white/95 flex flex-col items-center justify-center z-[60] backdrop-blur-xl transition-all">
          <div className="text-10xl md:text-[200px] font-black text-[#732C3F] animate-bounce tracking-tighter">{countdown}</div>
        </div>
      )}

      {/* 📝 SLEEK NATIVE FLOATING TELEPROMPTER */}
      {showPrompter && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 w-full max-w-4xl flex flex-col items-center gap-4 z-40">
          
          {/* Controls Pill (Always visible, small, sleek) */}
          <div className="bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-full px-6 py-4 flex items-center justify-between gap-8 text-white w-[350px]">
            <div className="flex items-center gap-4">
              <button onClick={() => setPrompterVisible(!prompterVisible)} className="bg-white/10 hover:bg-white/20 p-2.5 rounded-full transition" title="Toggle Visibility">
                {prompterVisible ? (
                  <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
              
              <button onClick={() => setPrompterPaused(!prompterPaused)} className={`${prompterPaused ? 'bg-[#732C3F] hover:bg-[#1A0B12]' : 'bg-rose-500 hover:bg-rose-400'} p-2.5 rounded-full transition shadow-lg`}>
                {prompterPaused ? (
                  <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3">
               <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Speed</span>
               <input type="range" min="0.1" max="2" step="0.1" value={prompterSpeed} onChange={e => setPrompterSpeed(parseFloat(e.target.value))} className="w-24 accent-[#732C3F] h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>

          {/* Scrolling Text Window */}
          {prompterVisible && (
            <div className="w-full h-[35vh] bg-black/80 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl overflow-hidden flex transition-all">
              <div ref={prompterRef} className="flex-1 overflow-y-auto w-full p-8 md:p-12 pb-[35vh] scrollbar-hide text-center font-medium leading-relaxed" style={{ fontSize: '44px', lineHeight: '1.4', color: '#f8fafc' }}>
                {script.split('\n').map((line, i) => (
                  <p key={i} className="mb-10">{line || '\u00A0'}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="max-w-4xl w-full mx-auto bg-white rounded-[40px] shadow-2xl shadow-indigo-900/5 p-8 md:p-12 relative overflow-hidden">
        
        <a href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-[#732C3F] transition-colors mb-6 font-medium text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Dashboard
        </a>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Record New Audit</h1>

        <input type="text" value={title} onChange={e => setTitle(e.target.value)} disabled={isRecording} placeholder="Audit Title (e.g. Acme Corp Redesign)" className="w-full p-5 text-xl font-medium border border-slate-200 rounded-2xl mb-8 bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all" />

        {/* RECORDING SETTINGS */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold mb-3 text-slate-400 uppercase tracking-wider">Recording Mode</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <button onClick={() => setMode('screen')} disabled={isRecording} className={`p-4 rounded-2xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${mode === 'screen' ? 'border-[#732C3F] bg-[#732C3F]/5 text-[#732C3F] shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Screen
            </button>
            <button onClick={() => setMode('camera')} disabled={isRecording} className={`p-4 rounded-2xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${mode === 'camera' ? 'border-[#732C3F] bg-[#732C3F]/5 text-[#732C3F] shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Camera
            </button>
            <button onClick={() => setMode('combo')} disabled={isRecording} className={`p-4 rounded-2xl border-2 font-semibold transition-all flex items-center justify-center gap-2 ${mode === 'combo' ? 'border-[#732C3F] bg-[#732C3F]/5 text-[#732C3F] shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Screen + Cam
            </button>
          </div>

          {mode === 'combo' && (
            <>
              <div className="animate-in fade-in slide-in-from-top-2 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <h3 className="text-xs font-semibold mb-3 text-slate-500 uppercase tracking-wider">Camera Placement</h3>
                    <div className="flex flex-wrap gap-2">
                       {['bottom-left', 'bottom-right', 'top-left', 'top-right'].map(pos => (
                         <button key={pos} onClick={() => setCamPosition(pos as any)} disabled={isRecording} className={`px-4 py-2 rounded-full font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#732C3F]/20 ${camPosition === pos ? 'bg-[#732C3F] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                           {pos.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                         </button>
                       ))}
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-xs font-semibold mb-3 text-slate-500 uppercase tracking-wider">Camera Shape</h3>
                    <div className="flex gap-2">
                       <button onClick={() => setCamShape('circle')} disabled={isRecording} className={`px-5 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${camShape === 'circle' ? 'bg-[#732C3F] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                         <div className="w-3 h-3 rounded-full bg-current" /> Circle
                       </button>
                       <button onClick={() => setCamShape('rect')} disabled={isRecording} className={`px-5 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${camShape === 'rect' ? 'bg-[#732C3F] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                         <div className="w-3 h-3 rounded-sm bg-current" /> Rectangle
                       </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="animate-in fade-in slide-in-from-top-2 p-5 bg-slate-50 rounded-2xl border border-slate-100 mt-4">
                <h3 className="text-xs font-semibold mb-3 text-slate-500 uppercase tracking-wider">Watermark Logo Image</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                   {[
                     { label: 'Full Logo (Black)', value: '/Shinobiriselogo_black_nobg.png' },
                     { label: 'Cropped Logo', value: '/cropped-logo.png' },
                     { label: 'Favicon PNG', value: '/faviconpage.png' },
                   ].map(logo => (
                     <button key={logo.value} onClick={() => setLogoSrc(logo.value)} disabled={isRecording} className={`px-4 py-2 rounded-full font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#732C3F]/20 ${logoSrc === logo.value ? 'bg-[#732C3F] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                       {logo.label}
                     </button>
                   ))}
                </div>
                
                <h3 className="text-xs font-semibold mb-3 text-slate-500 uppercase tracking-wider">Watermark Placement</h3>
                <div className="flex flex-wrap gap-2">
                   {['none', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
                     <button key={`logo-${pos}`} onClick={() => setLogoPosition(pos as any)} disabled={isRecording} className={`px-4 py-2 rounded-full font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#732C3F]/20 ${logoPosition === pos ? 'bg-[#732C3F] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                       {pos === 'none' ? 'None' : pos.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                     </button>
                   ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-end mb-3">
             <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider">Audit Script (Prompter)</label>
             <div className="flex items-center gap-3">
               {script.trim() && (
                 <div className="flex items-center gap-2 bg-[#732C3F]/10 px-3 py-1.5 rounded-full">
                   <input type="checkbox" id="generateSrt" checked={generateSrt} onChange={e => setGenerateSrt(e.target.checked)} disabled={isRecording} className="w-4 h-4 accent-[#732C3F] cursor-pointer rounded border-[#732C3F]/20" />
                   <label htmlFor="generateSrt" className="text-xs font-bold text-[#732C3F] cursor-pointer">Generate Subtitles (SRT)</label>
                 </div>
               )}
               {script.trim() && (
                 <div className="flex items-center gap-2 bg-[#732C3F]/10 px-3 py-1.5 rounded-full">
                   <input type="checkbox" id="integratePrompter" checked={integratePrompter} onChange={e => setIntegratePrompter(e.target.checked)} disabled={isRecording} className="w-4 h-4 accent-[#732C3F] cursor-pointer rounded border-[#732C3F]/20" title="If checked, prompter is visible in video. If unchecked, opens in separate private window." />
                   <label htmlFor="integratePrompter" className="text-xs font-bold text-[#732C3F] cursor-pointer" title="If checked, prompter is visible in video. If unchecked, opens in separate private window.">Record Prompter On-Screen</label>
                 </div>
               )}
             </div>
          </div>
          <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="Write your notes or paste your audit script here. It will automatically float on screen while you record." className="w-full h-32 p-5 text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all resize-none" />
        </div>

        <div className="relative mb-8 group">
          <div className="absolute -inset-1 bg-[#732C3F] rounded-3xl blur opacity-0 transition duration-500 group-hover:opacity-10"></div>
          <video ref={videoPreviewRef} autoPlay muted playsInline className={`relative w-full aspect-video bg-slate-900 rounded-2xl border border-slate-200 object-contain shadow-sm ${isRecording ? 'ring-4 ring-rose-500/30' : ''} transition-all`} />
          {isRecording && <div className="absolute top-4 left-4 bg-rose-500/90 backdrop-blur px-3 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-widest text-white animate-pulse flex items-center gap-2"><div className="w-2 h-2 bg-white rounded-full"></div> LIVE</div>}
          
          {isRecording && mode !== 'camera' && (
            <div className="absolute bottom-4 right-4 flex items-center gap-2 z-50">
              {/* Toggle: pip cam ↔ full-screen cam — keyboard C */}
              <button
                onClick={toggleCamFullscreen}
                title="Toggle fullscreen camera (C)"
                className={`px-4 py-2.5 rounded-xl backdrop-blur font-semibold shadow-lg transition-all flex items-center gap-2 border border-white/10 text-white ${camFullscreen ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900/80 hover:bg-black'}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {camFullscreen ? 'PIP' : 'Full Cam'}
              </button>

              {/* Toggle: pip size — keyboard E */}
              {!camFullscreen && (
                <button
                  onClick={toggleCamExpanded}
                  title="Toggle camera size (E)"
                  className="bg-slate-900/80 hover:bg-black text-white px-4 py-2.5 rounded-xl backdrop-blur font-semibold shadow-lg transition-all flex items-center gap-2 border border-white/10"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  {camExpanded ? 'Shrink' : 'Enlarge'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-10 bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <input type="checkbox" checked={enhanceMic} onChange={e => setEnhanceMic(e.target.checked)} disabled={isRecording} className="w-5 h-5 accent-indigo-600 cursor-pointer rounded" />
          <div>
            <label className="text-sm font-semibold text-slate-800 cursor-pointer" onClick={() => !isRecording && setEnhanceMic(!enhanceMic)}>Studio Audio Quality</label>
            <p className="text-xs text-slate-500 mt-0.5">Applies live noise cancellation and compressor filters.</p>
          </div>
        </div>

        {!isRecording ? (
          <div className="space-y-4 w-full">
            <button onClick={startCountdown} className="w-full bg-[#732C3F] hover:bg-[#1A0B12] transition-all text-white text-xl py-6 rounded-3xl font-bold shadow-xl shadow-[#732C3F]/20 hover:shadow-[#732C3F]/30 hover:-translate-y-0.5 flex items-center justify-center gap-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Start Recording
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center text-xs uppercase font-black text-slate-400 bg-white px-4 tracking-widest">Or</div>
            </div>

            <label className="w-full flex items-center justify-center gap-3 py-4 border-2 border-dashed border-slate-200 hover:border-[#732C3F] hover:bg-rose-50/30 rounded-3xl transition-all cursor-pointer group">
              <input 
                type="file" 
                accept="video/*" 
                className="hidden" 
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  setUploading(true);
                  try {
                    // Validate extension (M2)
                    const rawExt = file.name.split('.').pop()?.toLowerCase() ?? '';
                    const allowedExts = ['mp4', 'mov', 'webm', 'mkv'];
                    const ext = allowedExts.includes(rawExt) ? rawExt : 'mp4';
                    const fileTitle = file.name.replace(/\.[^/.]+$/, '');

                    // Server generates filename (C3/M5)
                    const signRes = await fetch('/api/sign-upload', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: fileTitle, ext }),
                    });
                    if (!signRes.ok) throw new Error((await signRes.json()).error);
                    const { token, fileName } = await signRes.json();

                    const { error: uploadError } = await supabase.storage
                      .from('videos')
                      .uploadToSignedUrl(fileName, token, file, { contentType: file.type || 'video/webm', upsert: false });
                    if (uploadError) throw new Error('Storage upload: ' + uploadError.message);

                    // Probe duration
                    const videoTag = document.createElement('video');
                    videoTag.src = URL.createObjectURL(file);
                    videoTag.muted = true;
                    videoTag.preload = 'metadata';
                    
                    const uploadedDuration = await new Promise<number>((resolve) => {
                      const timeout = setTimeout(() => {
                        const d = videoTag.duration;
                        resolve((d && isFinite(d) && d > 0) ? d : 0);
                      }, 8000);

                      videoTag.onloadedmetadata = () => {
                        if (videoTag.duration === Infinity) {
                          videoTag.currentTime = 1e9;
                          videoTag.onseeked = () => {
                            clearTimeout(timeout);
                            resolve(videoTag.currentTime);
                          };
                        } else if (isFinite(videoTag.duration)) {
                          clearTimeout(timeout);
                          resolve(videoTag.duration);
                        }
                      };
                      
                      videoTag.onerror = () => {
                        clearTimeout(timeout);
                        resolve(0);
                      };

                      videoTag.load();
                    });

                    const saveRes = await fetch('/api/save-video', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: fileTitle,
                        fileName,
                        duration: uploadedDuration || 0,
                      }),
                    });
                    if (!saveRes.ok) {
                      // H3: orphan cleanup
                      fetch('/api/delete-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName }) }).catch(console.error);
                      throw new Error(await saveRes.text());
                    }
                    const videoData = await saveRes.json();

                    setCurrentVideoId(videoData.id);
                    setShareLink(`${window.location.origin}/v/${videoData.id}`);
                  } catch (err: any) {
                    console.error(err);
                    alert('Upload failed: ' + err.message);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <svg className="w-6 h-6 text-slate-400 group-hover:text-[#732C3F] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-sm font-bold text-slate-500 group-hover:text-[#732C3F] transition-colors">Upload Pre-recorded Video</span>
            </label>
          </div>
        ) : (
          <button onClick={stopRecording} className="w-full bg-rose-500 hover:bg-rose-600 transition-all text-white text-xl py-6 rounded-3xl font-bold shadow-xl shadow-rose-500/20 flex items-center justify-center gap-3">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
            Stop & Upload
          </button>
        )}

        {uploading && (
          <div className="mt-8 p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center">
             <div className="w-8 h-8 border-4 border-[#732C3F]/30 border-t-[#732C3F] rounded-full animate-spin mx-auto mb-3"></div>
             <p className="text-[#732C3F] font-bold tracking-wide text-sm mb-4">Uploading secure link...</p>
             
             {localBlobUrl && (
               <a 
                 href={localBlobUrl} 
                 download={`${title.replace(/\s+/g, '-')}.webm`}
                 className="inline-flex items-center gap-2 px-4 py-2 bg-[#732C3F] text-white rounded-lg text-sm font-bold hover:bg-[#1A0B12] transition-all"
               >
                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                 Download Local Backup (Safe)
               </a>
             )}
          </div>
        )}

        {shareLink && (
          <div className="mt-10 p-8 bg-green-50 border border-green-100 rounded-3xl text-center">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-slate-800 mb-2 font-bold text-lg">Your video is ready!</p>
            <a href={shareLink} target="_blank" className="text-[#732C3F] hover:text-[#1A0B12] transition-colors underline font-medium block mb-6">{shareLink}</a>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              <button onClick={() => navigator.clipboard.writeText(shareLink)} className="bg-[#732C3F] hover:bg-[#1A0B12] border border-[#732C3F] text-white transition-colors px-8 py-3 rounded-full font-semibold shadow-xl text-sm">Copy Link</button>
              <Link href={`/edit/${currentVideoId}`} className="bg-indigo-600 hover:bg-indigo-700 border border-indigo-600 text-white transition-colors px-8 py-3 rounded-full font-semibold shadow-xl text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Enter Studio
              </Link>
              <a 
                href={shareLink.replace('/v/', '/api/download?url=')} 
                download={`shinobi_video_${currentVideoId}.webm`} 
                className="bg-indigo-600 hover:bg-indigo-700 border border-indigo-600 text-white transition-colors px-6 py-3 rounded-full font-semibold shadow-xl text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> 
                Download
              </a>
              
              {localBlobUrl && (
                <a 
                  href={localBlobUrl} 
                  download={`${title.replace(/\s+/g, '-')}-backup.webm`}
                  className="bg-slate-800 hover:bg-black text-white transition-colors px-6 py-3 rounded-full font-semibold shadow-xl text-sm flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  Local Backup
                </a>
              )}

              <button onClick={deleteCurrentVideo} className="bg-white border hover:bg-rose-50 text-rose-600 border-rose-200 transition-colors px-6 py-3 rounded-full font-semibold shadow-sm text-sm">Delete Video</button>
              <a href="/dashboard" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors px-6 py-3 rounded-full font-semibold shadow-sm text-sm">Dashboard</a>
            </div>

            <div className="border-t border-green-200 pt-6 mt-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Make it yours</h3>
              <div className="flex items-center justify-center gap-4">
                 <label className={`cursor-pointer ${thumbnailUploading ? 'bg-slate-100 text-slate-400' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'} border transition-colors px-6 py-2.5 rounded-xl font-semibold shadow-sm text-sm flex items-center gap-2`}>
                   {thumbnailUploading ? (
                     <><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div> Uploading...</>
                   ) : (
                     <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Set Custom Thumbnail</>
                   )}
                   <input type="file" accept="image/*" onChange={uploadThumbnail} disabled={thumbnailUploading} className="hidden" />
                 </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, use, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Player } from '@remotion/player';
import { MainComposition } from '@/remotion/MainComposition';
import { EditProps } from '@/lib/types/edit';
import { Settings, Zap, Play, Pause, RotateCcw, Volume2, VolumeX, Maximize, Scissors, Layers } from 'lucide-react';

const CALENDLY_URL = 'https://calendly.com/drcabrerap/30min';

const ReactionButton = ({ emoji, onReact }: { emoji: string, onReact: (emoji:string, scale: number) => void}) => {
   const startTimeRef = useRef<number | null>(null);
   const [isPressed, setIsPressed] = useState(false);
   const [currentScale, setCurrentScale] = useState(1);

   useEffect(() => {
      let interval: NodeJS.Timeout;
      if (isPressed) {
         interval = setInterval(() => {
            if (startTimeRef.current) {
               const duration = Date.now() - startTimeRef.current;
               const newScale = Math.min(1 + (duration / 600) * 1.5, 2.5); // Max 2.5x
               setCurrentScale(newScale);
            }
         }, 50);
      } else {
         setCurrentScale(1);
      }
      return () => clearInterval(interval);
   }, [isPressed]);

   const handleStart = (e: React.SyntheticEvent) => {
      e.preventDefault();
      setIsPressed(true);
      startTimeRef.current = Date.now();
   };

   const handleEnd = (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (startTimeRef.current) {
         const duration = Date.now() - startTimeRef.current;
         // Minimum duration to trigger a "held" reaction vs a click
         const finalScale = Math.min(1 + (duration / 600) * 1.5, 2.5);
         onReact(emoji, finalScale);
         startTimeRef.current = null;
      }
      setIsPressed(false);
   };

   return (
      <button 
         onMouseDown={handleStart} 
         onMouseUp={handleEnd} 
         onMouseLeave={() => { if(isPressed) handleEnd(new MouseEvent('mouseleave') as any); }}
         onTouchStart={handleStart}
         onTouchEnd={handleEnd}
         className={`text-2xl transition-all origin-bottom pb-1 select-none ${isPressed ? 'scale-75' : 'hover:-translate-y-1 hover:scale-110'}`}
         style={isPressed ? { transform: `scale(${currentScale})`, filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' } : {}}
      >
         {emoji}
      </button>
   );
};

const formatTime = (timeInSeconds: number) => {
  if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return "00:00";
  const m = Math.floor(Math.max(0, timeInSeconds) / 60);
  const s = Math.floor(Math.max(0, timeInSeconds) % 60);
  return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
};

const timeAgo = (dateStr: string) => {
  if (!dateStr) return 'Recently';
  const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return "just now";
};

export default function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [video, setVideo] = useState<any>(null);
  const [edits, setEdits] = useState<EditProps | null>(null);
  
  // Custom Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [showCC, setShowCC] = useState(false);
  const [ccLang, setCcLang] = useState('English');
  const [translatedVttUrl, setTranslatedVttUrl] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [quality, setQuality] = useState('Auto HD');
  const [isTheatre, setIsTheatre] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{id: number, emoji: string, size: 'normal'|'big'}[]>([]);
  const [submittedComments, setSubmittedComments] = useState<{ id: number, text: string, time: number }[]>([]);
  const [placedReactions, setPlacedReactions] = useState<{ id: number, emoji: string, size: 'normal'|'big', scale: number }[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Data Fetching
  useEffect(() => {
    const track = async () => {
      const { data } = await supabase.from('videos').select('*').eq('id', id).single();
      if (data) {
        setVideo(data);
        await supabase.from('videos').update({ views: data.views + 1 }).eq('id', id);
        
        // Fetch Latest Edit Version
        const { data: editVersions } = await supabase
          .from('video_edits')
          .select('*')
          .eq('video_id', id)
          .order('updated_at', { ascending: false })
          .limit(1);
          
        if (editVersions && editVersions.length > 0) {
          const editData = editVersions[0];
          setEdits({
            videoUrl: data.video_url,
            overlays: editData.overlays,
            audioUrl: (editData as any).audio_url,
            audioStartFrame: (editData as any).audio_start_frame || 0,
            clips: (editData as any).clips || [],
            videoDurationInFrames: (editData as any).clips?.reduce((acc: number, c: any) => acc + c.durationInFrames, 0) || Math.round(data.duration * 30)
          });
        }

        if (!data.notification_sent) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: id, videoTitle: data.title })
          }).catch(e => console.error("Notification issue:", e));
        }
      }
    };
    track();
  }, [id]);

  // Handle Playback Rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Audio Enhancement DSP
  useEffect(() => {
    if (video && video.is_enhanced && videoRef.current && !audioCtxRef.current) {
      try {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        
        const source = ctx.createMediaElementSource(videoRef.current);
        sourceNodeRef.current = source;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24; 
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.1;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 120;

        const lowMidScoop = ctx.createBiquadFilter();
        lowMidScoop.type = 'peaking';
        lowMidScoop.frequency.value = 500;
        lowMidScoop.Q.value = 1.5;
        lowMidScoop.gain.value = -4;

        const makeUpGain = ctx.createGain();
        makeUpGain.gain.value = 2.5;

        source.connect(highpass);
        highpass.connect(lowMidScoop);
        lowMidScoop.connect(compressor);
        compressor.connect(makeUpGain);
        makeUpGain.connect(ctx.destination);
      } catch (e) {
        console.error("Failed to initialize enhanced audio context:", e);
      }
    }
  }, [video]);

  // Manage CC Track Visibility
  useEffect(() => {
    if (videoRef.current && videoRef.current.textTracks) {
        const tracks = videoRef.current.textTracks;
        for (let i = 0; i < tracks.length; i++) {
            tracks[i].mode = showCC ? 'showing' : 'hidden';
        }
    }
  }, [showCC, translatedVttUrl, video]);

  // Client-Side VTT Translator (Free Option B Engine)
  useEffect(() => {
     if (!video || !video.video_url || ccLang === 'English') {
         setTranslatedVttUrl(null);
         return;
     }

     const translateTrack = async () => {
         setIsTranslating(true);
         try {
             // 1. Fetch original English VTT
             const vttRes = await fetch(video.video_url.replace('.webm', '.vtt'));
             if (!vttRes.ok) throw new Error("No VTT.");
             const text = await vttRes.text();

             // 2. Parse language code
             const langMap:any = { 'French': 'fr', 'Spanish': 'es', 'Mandarin': 'zh-CN', 'Arabic': 'ar', 'Portuguese': 'pt' };
             const targetLang = langMap[ccLang] || 'es';

             // 3. Break VTT into cues to translate only text, retaining timestamp markers
             const lines = text.split('\n');
             let translatedVtt = "WEBVTT\n\n";

             for (let i = 0; i < lines.length; i++) {
                 const line = lines[i].trim();
                 if (!line || line === 'WEBVTT' || line.includes('-->')) {
                     translatedVtt += line + '\n';
                 } else if (line.match(/^\d+$/)) { 
                     translatedVtt += line + '\n'; // Block number
                 } else {
                     // Translate the actual caption sentence via Google's free extension API
                     const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(line)}`;
                     const tRes = await fetch(url);
                     const tData = await tRes.json();
                     const translatedLine = tData[0][0][0];
                     translatedVtt += translatedLine + '\n';
                 }
             }

             // 4. Mount as a browser blob
             const blob = new Blob([translatedVtt], { type: 'text/vtt' });
             const url = URL.createObjectURL(blob);
             setTranslatedVttUrl(url);

         } catch (e) {
             console.error("Option B Translation Failed:", e);
         } finally {
             setIsTranslating(false);
         }
     };

     translateTrack();
  }, [ccLang, video]);

  const sendReaction = async (emoji: string, scale: number) => {
      const randId = Date.now() + Math.random();
      setFloatingEmojis(prev => [...prev, { id: randId, emoji, size: scale > 1.5 ? 'big' : 'normal' }]);
      setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== randId)), 1500);
      
      setPlacedReactions(prev => {
          const fresh = [...prev, { id: randId, emoji, scale, size: scale > 1.5 ? 'big' as const : 'normal' as const }];
          return fresh.slice(-12); // Keep a few more in the stack
      });

      // Persist to Supabase silently
      try {
          await supabase.from('video_reactions').insert({ video_id: id, emoji });
      } catch (e) {
          console.error("Failed to commit reaction", e);
      }
  };

  const togglePlay = async () => {
    if (videoRef.current) {
      if (isPlaying) {
          videoRef.current.pause();
      } else {
          if (isEnded) {
              videoRef.current.currentTime = 0;
              setIsEnded(false);
          }
          try {
            await videoRef.current.play();
          } catch (e) {
            console.error("Play interrupted:", e);
          }
      }
      setIsPlaying(!isPlaying);
    }
  };

  const skipTime = (seconds: number) => {
      if (videoRef.current) {
          videoRef.current.currentTime += seconds;
      }
  };

  const toggleFullscreen = () => {
      if (document.fullscreenElement) {
          document.exitFullscreen();
      } else if (containerRef.current) {
          containerRef.current.requestFullscreen();
      }
  };

  if (!video) return (
    <div className="min-h-screen bg-[#F3F1FD] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#732C3F]/30 border-t-[#732C3F] rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-[#F3F1FD] text-slate-800 font-sans selection:bg-[#732C3F]/20 flex flex-col pt-12 pb-24 items-center transition-all duration-500 relative overflow-hidden ${isTheatre ? 'px-0' : 'px-4'}`}>
      
      {/* Animated Aesthetic Backgrounds */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#732C3F]/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>

      {/* Keyframe injection for animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes flyUpRight {
           0% { opacity: 0; transform: translateY(0) scale(0.5); }
           20% { opacity: 1; transform: translateY(-20px) scale(1.1); }
           80% { opacity: 0.8; transform: translateY(-100px) scale(1); }
           100% { opacity: 0; transform: translateY(-130px) scale(0.8); }
        }
        @keyframes shine {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        .shine-effect {
          position: relative;
          overflow: hidden;
        }
        .shine-effect::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 50%;
          height: 100%;
          background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4), transparent);
          animation: shine 3s infinite;
        }
      `}} />
 
      <header className={`max-w-[70rem] w-full flex flex-col items-center gap-8 mb-12 relative z-10 ${isTheatre ? 'px-4' : ''}`}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-[#732C3F] rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <img src="/Shinobiriselogo_black_nobg.png" alt="ShinobiRise Logo" className="relative h-20 md:h-28 w-auto object-contain shrink-0" />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight tracking-tight mt-2">
            Audit for <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-[#732C3F]">{video.title}</span>
          </h2>
          <p className="text-slate-500 font-medium text-lg max-w-2xl px-4 italic">"Strategic precision in every frame."</p>
        </div>

        <a href={CALENDLY_URL} target="_blank" className="relative group w-full md:w-auto shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-1000">
           <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-[#732C3F] rounded-full blur opacity-40 group-hover:opacity-75 transition duration-500 animate-pulse"></div>
           <button className="relative w-full md:w-auto bg-[#732C3F] hover:bg-[#1A0B12] text-white text-xl font-black py-4 px-12 rounded-full shadow-2xl transition-all hover:scale-[1.03] active:scale-95 flex items-center justify-center gap-3 shine-effect">
             <div className="relative w-8 h-8 bg-white rounded-md border border-slate-300 flex flex-col overflow-hidden shrink-0 shadow-sm">
               <div className="h-3 bg-rose-500 w-full flex items-center justify-center">
                 <span className="text-[8px] text-white font-black uppercase tracking-tighter">
                   {new Date().toLocaleString('default', { month: 'short' })}
                 </span>
               </div>
               <div className="flex-1 flex items-center justify-center text-[12px] font-black text-slate-800 pt-0.5">
                 {new Date().getDate()}
               </div>
             </div>
             Book Your Discovery Call
           </button>
        </a>
      </header>

      <div className={`transition-all duration-500 ${isTheatre ? 'w-full max-w-none' : 'w-full max-w-[70rem]'}`}>
        
        {/* VIDEO WRAPPER */}
        <div 
          ref={containerRef}
          className={`group relative w-full mx-auto bg-black shadow-2xl transition-all duration-300 overflow-hidden ${
             isTheatre ? 'max-w-none rounded-none w-full border-none' : `max-w-4xl rounded-xl border border-white/5`
          }`}
        >
          {edits ? (
            <Player
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore — Remotion's LooseComponentType doesn't accept typed props; runtime is correct
              component={MainComposition}
              inputProps={edits}
              durationInFrames={edits.videoDurationInFrames > 0 ? edits.videoDurationInFrames : 1800}
              fps={30}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: '100%', height: 'auto', aspectRatio: '16/9' }}
              controls
              autoPlay
              loop={false}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsEnded(true)}
            />
          ) : (
            <video
              ref={videoRef}
              className="w-full aspect-video object-contain"
              src={video.video_url}
              onClick={togglePlay}
              onTimeUpdate={(e) => {
                  setCurrentTime(e.currentTarget.currentTime);
                  const target = e.currentTarget;
                  if (!isFinite(target.duration) || target.duration === 0) {
                      if (target.seekable && target.seekable.length > 0) {
                          const end = target.seekable.end(target.seekable.length - 1);
                          if (end > duration) setDuration(end);
                      }
                  } else if (target.duration > duration) {
                      setDuration(target.duration);
                  }
              }}
              onLoadedMetadata={(e) => {
                  const target = e.currentTarget;
                  if (target.duration === Infinity) {
                      target.currentTime = 1e99;
                      target.ontimeupdate = () => {
                          target.ontimeupdate = null;
                          target.currentTime = 0;
                          setDuration(target.duration);
                      };
                  } else if (isFinite(target.duration)) {
                      setDuration(target.duration);
                  }
              }}
              onDurationChange={(e) => {
                  if (isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
              }}
              onPlay={() => { setIsPlaying(true); setIsEnded(false); }}
              onPause={() => setIsPlaying(false)}
              onVolumeChange={(e) => {
                  setVolume(e.currentTarget.volume);
                  setIsMuted(e.currentTarget.muted || e.currentTarget.volume === 0);
              }}
              onEnded={() => { setIsPlaying(false); setIsEnded(true); }}
            >
              {(translatedVttUrl || video.video_url.endsWith('.webm')) && (
                <track
                  kind="subtitles"
                  src={translatedVttUrl || video.video_url.replace('.webm', '.vtt')}
                  srcLang={ccLang === 'English' ? 'en' : 'es'}
                />
              )}
            </video>
          )}

          {/* WATCH AGAIN OVERLAY */}
          {isEnded && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-300">
                  <button 
                    onClick={togglePlay} 
                    className="flex items-center gap-4 text-white/90 hover:text-white transition-all focus:outline-none hover:scale-105 group bg-white/5 hover:bg-white/10 px-8 py-4 rounded-2xl shadow-2xl border border-white/10"
                  >
                      <svg className="w-10 h-10 group-hover:-rotate-180 transition-transform duration-700 ease-in-out" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="text-2xl font-light tracking-wide">Watch again</span>
                  </button>
              </div>
          )}

          {/* FLOATING EMOJI CANVAS */}
          <div className="absolute right-6 bottom-[4.5rem] w-16 h-48 pointer-events-none z-20 flex flex-col items-center justify-end">
               {floatingEmojis.map(e => (
                   <div 
                      key={e.id} 
                      className="absolute drop-shadow-lg"
                      style={{
                          animation: 'flyUpRight 1.5s cubic-bezier(0.25, 1, 0.5, 1) forwards',
                          fontSize: e.size === 'big' ? '3.5rem' : '1.8rem',
                          left: `${Math.random() * 20 - 10}px` 
                      }}
                   >
                       {e.emoji}
                   </div>
               ))}
          </div>

          {/* CUSTOM PLAYER CONTROLS (Fades on hover) */}
          {!edits && (
            <div className={`absolute bottom-0 left-0 right-0 pt-16 pb-2 px-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-300 z-10 ${showCommentBox ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}>
               
               {/* Progress Bar Scrub */}
             <div className="group/scrub relative w-full h-1.5 cursor-pointer mb-3 flex items-center">
                 <input 
                    type="range" min="0" max={duration || 100} value={currentTime}
                    onChange={(e) => {
                        if(videoRef.current) {
                            videoRef.current.currentTime = Number(e.target.value);
                            setCurrentTime(Number(e.target.value));
                        }
                    }}
                    className="absolute z-10 w-full h-full opacity-0 cursor-pointer"
                 />
                 <div className="w-full bg-white/30 h-1 rounded-full overflow-hidden">
                    <div className="bg-[#732C3F] h-full" style={{ width: `${(currentTime/(duration||1))*100}%` }}></div>
                 </div>
                 {/* Thumb indicator that appears on scrub area hover */}
                 <div className="absolute w-3 h-3 bg-[#732C3F] rounded-full point-events-none opacity-0 group-hover/scrub:opacity-100 transition-opacity" style={{ left: `calc(${(currentTime/(duration||1))*100}% - 6px)` }}></div>
             </div>

             {/* Bottom Controls Row */}
             <div className="flex items-center justify-between text-white pb-1">
                 
                 {/* LEFT CONTROLS */}
                 <div className="flex items-center gap-5 w-1/3">
                    {/* Play/Pause */}
                    <button onClick={togglePlay} className="hover:text-[#732C3F] transition-colors focus:outline-none">
                       {isPlaying ? (
                          <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                       ) : (
                          <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                       )}
                    </button>

                    {/* -5 Sec */}
                    <button onClick={() => skipTime(-5)} className="relative hover:text-white/70 transition-colors focus:outline-none flex items-center justify-center" title="-5 Seconds">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                        <span className="absolute text-[9px] font-bold mt-1">5</span>
                    </button>

                    {/* +5 Sec */}
                    <button onClick={() => skipTime(5)} className="relative hover:text-white/70 transition-colors focus:outline-none flex items-center justify-center transform scale-x-[-1]" title="+5 Seconds">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                        <span className="absolute text-[9px] font-bold mt-1 transform scale-x-[-1]">5</span>
                    </button>

                    {/* Volume */}
                    <div className="flex items-center gap-2 group/vol relative">
                        <button onClick={() => { if(videoRef.current) videoRef.current.muted = !isMuted; }} className="hover:text-white/70 focus:outline-none">
                            {isMuted || volume === 0 ? (
                               <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                            ) : volume < 0.5 ? (
                               <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                            ) : (
                               <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                            )}
                        </button>
                        <input 
                           type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                           onChange={(e) => {
                               if(videoRef.current) {
                                  videoRef.current.muted = false;
                                  videoRef.current.volume = Number(e.target.value);
                               }
                           }}
                           className="w-0 opacity-0 group-hover/vol:w-16 group-hover/vol:opacity-100 transition-all duration-300 h-1 bg-white/30 rounded-full appearance-none cursor-pointer accent-white"
                        />
                    </div>
                 </div>

                 {/* CENTER TIMESTAMP */}
                 <div className="w-1/3 flex justify-center items-center">
                    <span className="text-sm font-mono tracking-wider text-white bg-black/40 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md">
                        {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : (video?.duration ? formatTime(video.duration) : '--:--')}
                    </span>
                 </div>

                 {/* RIGHT CONTROLS */}
                 <div className="flex items-center justify-end gap-4 relative w-1/3">
                    
                    {/* Settings Modal Popout */}
                    {showSettings && (
                        <div className="absolute right-0 bottom-full mb-4 w-56 bg-black/90 backdrop-blur-md rounded-xl p-3 shadow-2xl border border-white/10 text-sm transform transition-all origin-bottom-right">
                           {/* Speed Settings */}
                           <div className="border-b border-white/10 pb-2 mb-2">
                               <div className="text-white/60 text-xs px-2 mb-1.5 flex justify-between">Playback Speed</div>
                               <div className="flex flex-wrap gap-1">
                                   {['0.8', 'Normal', '1.5', '1.7', '2.0', '2.5'].map(spd => {
                                       const numVal = spd === 'Normal' ? 1 : Number(spd);
                                       return (
                                        <button 
                                          key={spd}
                                          onClick={() => setPlaybackRate(numVal)}
                                          className={`px-2 py-1 rounded md text-xs transition-colors ${playbackRate === numVal ? 'bg-[#732C3F] text-white' : 'text-white hover:bg-white/10'}`}
                                        >
                                           {spd === 'Normal' ? spd : spd + 'x'}
                                        </button>
                                       )
                                   })}
                               </div>
                           </div>

                           {/* Fake Quality Profile */}
                           <div className="border-b border-white/10 pb-2 mb-2">
                               <div className="text-white/60 text-xs px-2 mb-1.5 flex justify-between">Quality</div>
                               <div className="flex flex-col gap-1">
                                   <button 
                                      onClick={() => setQuality('Auto HD')}
                                      className="flex items-center px-2 py-1.5 rounded hover:bg-white/10 text-white justify-between"
                                   >
                                      <span>Auto HD</span>
                                      {quality === 'Auto HD' && <span className="text-[#732C3F]">✓</span>}
                                   </button>
                                   <button 
                                      onClick={() => setQuality('720p')}
                                      className="flex items-center px-2 py-1.5 rounded hover:bg-white/10 text-white justify-between"
                                   >
                                      <span>720p</span>
                                      {quality === '720p' && <span className="text-[#732C3F]">✓</span>}
                                   </button>
                               </div>
                           </div>

                           {/* CC Language Menu */}
                           <div>
                               <div className="text-white/60 text-xs px-2 mb-1.5 flex justify-between">
                                  <span>Captions</span>
                                  {isTranslating && <span className="text-[#732C3F] animate-pulse">Translating...</span>}
                               </div>
                               <div className="grid grid-cols-2 gap-1">
                                   {['English', 'French', 'Spanish', 'Mandarin', 'Arabic', 'Portuguese'].map(lang => (
                                     <button 
                                        key={lang}
                                        onClick={() => {
                                            setCcLang(lang);
                                            setShowCC(true);
                                        }}
                                        className={`px-2 py-1 text-xs rounded transition-colors text-left ${ccLang === lang && showCC ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'}`}
                                     >
                                        {lang}
                                     </button>
                                   ))}
                               </div>
                               <button 
                                  onClick={() => setShowCC(false)}
                                  className={`w-full mt-1 px-2 py-1.5 text-xs rounded transition-colors text-left ${!showCC ? 'bg-[#732C3F] text-white' : 'text-white/80 hover:bg-white/10'}`}
                               >
                                  Off
                               </button>
                           </div>
                        </div>
                    )}

                    {/* CC Icon */}
                    <button onClick={() => setShowCC(!showCC)} title="Subtitles/CC" className={`focus:outline-none transition-colors border-b-2 pb-0.5 ${showCC ? 'text-white border-[#732C3F]' : 'text-white/70 border-transparent hover:text-white'}`}>
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>
                    </button>
                    
                    {/* Settings Gear */}
                    <button onClick={() => setShowSettings(!showSettings)} title="Settings" className={`focus:outline-none transition-transform hover:rotate-90 duration-300 ${showSettings ? 'text-[#732C3F]' : 'text-white/70 hover:text-white'}`}>
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22l-1.92 3.32c-.12.21-.07.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                    </button>

                    {/* PIP Screen */}
                    <button onClick={() => { if(videoRef.current) videoRef.current.requestPictureInPicture() }} title="Miniplayer (i)" className="text-white/70 hover:text-white transition-colors focus:outline-none">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7h7v5h-7v-5z"/></svg>
                    </button>

                    {/* Theatre Mode */}
                    <button onClick={() => setIsTheatre(!isTheatre)} title="Cinema mode (t)" className="text-white/70 hover:text-white transition-colors focus:outline-none">
                       {!isTheatre ? (
                           <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z"/></svg>
                       ) : (
                           <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M5 18h14v-4H5v4zM5 6v4h14V6H5z"/></svg>
                       )}
                    </button>

                    {/* Full Screen */}
                    <button onClick={toggleFullscreen} title="Full screen (f)" className="text-white/70 justify-self-end hover:text-white transition-colors focus:outline-none">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                    </button>

                    {/* Download */}
                    <a href={video.video_url} download={`shinobi_video_${video.id}.webm`} title="Download Video" target="_blank" className="text-white/70 hover:text-white transition-colors focus:outline-none ml-1">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </a>
                    
                 </div>
             </div>
          </div>
          )}

           {/* PLACED PERMANENT REACTIONS */}
           <div className="absolute bottom-16 md:bottom-20 right-4 w-12 h-20 z-20 pointer-events-none">
              {placedReactions.map((r, i) => (
                 <div 
                    key={r.id} 
                    style={{ 
                      zIndex: i,
                      fontSize: `${Math.max(14, 16 * (r.scale || 1))}px`,
                      bottom: `${i * 4}px`, 
                      right: 0
                    }}
                    className="absolute drop-shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300 transform transition-all"
                 >
                    {r.emoji}
                 </div>
              ))}
           </div>

          {/* IN-VIDEO COMMENT BOX OVERLAY */}
          {showCommentBox && !isTheatre && (
              <div className="absolute bottom-0 left-0 right-0 w-full bg-[#1c1c1e] border-t border-[#3a3a3a] p-4 flex flex-col gap-2 z-30 animate-in slide-in-from-bottom-2 duration-200">
                 <div className="text-[11px] text-slate-400 font-medium mb-1 tracking-wider uppercase">Comment at {formatTime(currentTime)}</div>
                  <textarea 
                     className="w-full bg-transparent text-white outline-none resize-none font-normal placeholder-slate-500 text-[14px] py-1" 
                     placeholder="Add your thoughts or hit @ to mention..."
                     autoFocus
                     rows={3}
                     value={commentText}
                     onChange={(e) => setCommentText(e.target.value)}
                  />
                 <div className="flex justify-between items-center mt-2">
                    <div className="flex gap-5 text-slate-400 ml-1">
                       <button onClick={() => {setCommentText(prev => prev + '@');}} className="hover:text-white transition-colors" title="Mention (@)">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
                       </button>
                       <div className="relative">
                           <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="hover:text-white transition-colors" title="Emoji">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                           </button>
                           {showEmojiPicker && (
                               <div className="absolute bottom-8 -left-2 w-[320px] bg-[#1e1e1e] shadow-2xl border border-[#3a3a3a] rounded-xl p-3 z-[100] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200">
                                   {/* Fake Search Bar */}
                                   <div className="relative">
                                       <svg className="w-4 h-4 absolute left-3 top-[10px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                       <input type="text" placeholder="Search" className="w-full bg-[#2a2a2a]/80 text-white text-[13px] rounded-lg pl-9 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-slate-500 border border-white/5" />
                                       <div className="absolute right-2 top-1.5 text-lg">✋</div>
                                   </div>
                                   <div className="overflow-y-auto max-h-[180px] flex flex-col gap-3 scrollbar-hide">
                                       <div>
                                           <h3 className="text-[10px] uppercase text-slate-400 font-semibold mb-2 px-1 tracking-wider">Frequently Used</h3>
                                           <div className="grid grid-cols-7 gap-1">
                                               {['💯','🎉','✅','❌','👀','✨','🚀','🔥','🙏','👏','❤️','😮','😁','🥹'].map(e => (
                                                    <button key={e} onClick={() => { setCommentText(prev => prev + e); setShowEmojiPicker(false); }} className="text-xl hover:scale-125 transition-transform hover:bg-white/10 rounded pt-1 pb-0.5">{e}</button>
                                               ))}
                                           </div>
                                       </div>
                                       <div>
                                           <h3 className="text-[10px] uppercase text-slate-400 font-semibold mb-2 px-1 tracking-wider">Smileys & Emotion</h3>
                                           <div className="grid grid-cols-7 gap-1">
                                               {['😀','😂','😅','😇','😉','😍','😘','😛','😜','🤪','😎','🤓','🧐','🥳','🥺','😭','😤'].map(e => (
                                                    <button key={e} onClick={() => { setCommentText(prev => prev + e); setShowEmojiPicker(false); }} className="text-xl hover:scale-125 transition-transform hover:bg-white/10 rounded pt-1 pb-0.5">{e}</button>
                                               ))}
                                           </div>
                                       </div>
                                   </div>
                               </div>
                           )}
                       </div>
                    </div>
                    <div className="flex gap-3 items-center">
                       <button onClick={() => {
                           setShowCommentBox(false); 
                           setShowEmojiPicker(false);
                           videoRef.current?.play();
                           setIsPlaying(true);
                       }} className="text-sm font-semibold text-slate-400 hover:text-white transition-colors px-2">Cancel</button>
                       <button 
                         className="bg-[#2a2a2c] hover:bg-[#3a3a3c] text-white text-[13px] font-semibold py-1.5 px-4 rounded-lg transition-colors border border-white/10 shadow-sm"
                         onClick={() => {
                             if (commentText.trim().length > 0) {
                                 setSubmittedComments(prev => [...prev, { id: Date.now(), text: commentText.trim(), time: currentTime }]);
                             }
                             setShowCommentBox(false); 
                             setCommentText(''); 
                             setShowEmojiPicker(false);
                             videoRef.current?.play();
                             setIsPlaying(true);
                         }}
                       >
                         Comment at {formatTime(currentTime)}
                       </button>
                    </div>
                 </div>
              </div>
          )}
        </div>

        {/* REACTION ROW & METADATA (LOOM STYLE) */}
        {!isTheatre && (
            <div className={`w-full ${showCommentBox ? 'mt-4' : 'mt-6'} flex flex-col md:flex-row items-center md:items-start justify-between gap-6 max-w-4xl mx-auto`}>
               
               <div className="flex flex-col items-center gap-1.5">
                   <div className="flex flex-wrap justify-center items-center gap-3 md:gap-5 bg-white px-5 py-2 rounded-full shadow-sm border border-slate-200">
                      {['🥷', '⚔️', '🐉', '🔥', '⛩️', '💨'].map((emoji, idx) => (
                          <div key={idx} className="text-3xl leading-none pt-1">
                              <ReactionButton emoji={emoji} onReact={sendReaction} />
                          </div>
                      ))}
                      <div className="w-px h-6 bg-slate-300 mx-2 hidden md:block"></div>
                      <button onClick={() => {
                          const willShow = !showCommentBox;
                          setShowCommentBox(willShow);
                          if (willShow && isPlaying) {
                              videoRef.current?.pause();
                              setIsPlaying(false);
                          } else if (!willShow) {
                              videoRef.current?.play();
                              setIsPlaying(true);
                          }
                      }} className="flex items-center gap-2 text-slate-700 font-semibold hover:text-[#732C3F] transition-colors pl-1 pr-2">
                         <svg className="w-5 h-5 border-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                         </svg>
                         Comment
                      </button>
                   </div>
                   {/* HOLD FOR BIGGER REACTION HELPER TEXT */}
                   <span className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">Hold emoji for bigger reaction</span>
               </div>
               
               {/* Metadata */}
               <div className="flex flex-col items-center md:items-end text-center md:text-right px-2 md:px-0 mt-2 md:mt-0">
                  <h1 className="text-xl md:text-2xl font-bold text-slate-900">
                     Audit for {video.title}
                  </h1>
                  <span className="text-sm text-slate-500 mt-1">David Cabrera • {timeAgo(video.created_at)}</span>
               </div>
            </div>
         )}
        
        {/* SUBMITTED COMMENTS RENDERING */}
        {submittedComments.length > 0 && (
           <div className="w-full max-w-4xl mx-auto mt-10 md:mt-12 flex flex-col gap-4 px-2 md:px-0 animate-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Activity Log</h3>
              {submittedComments.map(comment => (
                 <div key={comment.id} className="flex gap-4 p-5 rounded-2xl border border-slate-200/60 bg-white shadow-sm hover:shadow-md transition-shadow items-start relative group">
                    <button 
                       onClick={() => { if(videoRef.current) { videoRef.current.currentTime = comment.time; videoRef.current.play(); setIsPlaying(true); } }}
                       className="flex-shrink-0 mt-0.5 cursor-pointer hover:bg-[#732C3F] hover:text-white hover:border-[#732C3F] transition-all bg-slate-50 px-3 py-1.5 flex justify-center items-center rounded border border-slate-200 font-mono text-xs text-[#732C3F] font-bold shadow-sm"
                       title="Jump to time"
                    >
                       {formatTime(comment.time)}
                    </button>
                    <div className="text-[15px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed mt-1">
                       {comment.text}
                    </div>
                 </div>
              ))}
           </div>
        )}

      </div>
    </div>
  );
}

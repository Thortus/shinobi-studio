'use client';

import { useState, useEffect, use, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { RemotionPlayer } from '@/components/remotion/RemotionPlayer';
import { PlayerRef } from '@remotion/player';
import { ManualTimeline } from '@/components/studio/ManualTimeline';
import { Overlay, EditProps } from '@/lib/types/edit';
import Link from 'next/link';
import { 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  Type, 
  Settings, 
  Save, 
  ArrowLeft,
  Move,
  Maximize,
  Clock,
  Layers,
  ChevronRight,
  ChevronDown,
  Scissors,
  Mic,
  Music,
  Zap,
  Volume2
} from 'lucide-react';
import { detectSoundSegments, getFillerWordCuts } from '@/lib/audio-analysis';
import { ClipSegment } from '@/lib/types/edit';

export default function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(60); // seconds
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'assets' | 'settings' | 'audio' | 'history'>('assets');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioStartFrame, setAudioStartFrame] = useState<number>(0);
  const [clips, setClips] = useState<ClipSegment[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playerRef = useRef<PlayerRef>(null);

  const totalDurationInFrames = useMemo(() => {
    if (clips && clips.length > 0) {
      return clips.reduce((acc, c) => acc + c.durationInFrames, 0);
    }
    return Math.round(videoDuration * 30);
  }, [clips, videoDuration]);

  // Duration Recovery Helper
  useEffect(() => {
    if (!video?.video_url || videoDuration > 5) return; // Only auto-probe if duration looks suspiciously short

    const probe = async () => {
      console.log("Probing video duration for:", video.video_url);
      const videoElement = document.createElement('video');
      videoElement.src = video.video_url;
      videoElement.crossOrigin = 'anonymous'; 
      videoElement.preload = 'auto';
      videoElement.muted = true;
      
      try {
        const realDuration = await new Promise<number>((resolve) => {
          const timeout = setTimeout(() => {
            const d = videoElement.duration;
            console.log("Probe timeout reached. Current duration:", d);
            resolve((d && isFinite(d) && d > 0.1) ? d : 1);
          }, 20000); // 20s for slow loads

          videoElement.onloadedmetadata = () => {
            console.log("Probe metadata event. Duration:", videoElement.duration);
            if (videoElement.duration === Infinity) {
              videoElement.currentTime = 1e99; 
            } else if (isFinite(videoElement.duration)) {
              clearTimeout(timeout);
              resolve(videoElement.duration);
            }
          };

          videoElement.onseeked = () => {
            console.log("Probe seeked event. CurrentTime is:", videoElement.currentTime);
            // After seeking to 1e99, currentTime reflects the actual end of stream
            const discovered = videoElement.duration === Infinity ? videoElement.currentTime : videoElement.duration;
            if (discovered && isFinite(discovered) && discovered > 0.1) {
              clearTimeout(timeout);
              resolve(discovered);
            }
          };
          
          videoElement.onerror = (e) => {
            console.error("Video element error during probe", e);
            clearTimeout(timeout);
            resolve(1);
          };

          // Aggressive interaction
          videoElement.load();
          videoElement.currentTime = 1e99;
          videoElement.play().catch(() => {});
        });

        if (realDuration && isFinite(realDuration) && (realDuration > 1.1 || videoDuration === 1)) {
          console.log("Final probe result:", realDuration);
          setVideoDuration(realDuration);
          
          // PERSIST: Correct the record in Supabase
          supabase.from('videos').update({ duration: realDuration }).eq('id', id).then(({error}) => {
            if (error) console.error("Persistence fail:", error);
            else console.log("DB Updated with true duration.");
          });
          
          // FORCE SYNC: If the video was stuck at 1s in clips, expand it
          setClips(prev => {
            const currentTotal = prev.reduce((acc, c) => acc + c.durationInFrames, 0);
            if (prev.length <= 1 && currentTotal <= 35) { // If roughly 1s or less
              console.log("Force expanding 1s clip to Discovery duration.");
              return [{
                startFrame: 0,
                endFrame: Math.round(realDuration * 30),
                durationInFrames: Math.round(realDuration * 30)
              }];
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Duration probe failed", err);
      }
    };
    
    probe();
  }, [video?.video_url, videoDuration, id]);

  useEffect(() => {
    const track = async () => {
      const { data } = await supabase.from('videos').select('*').eq('id', id).single();
      if (data) {
        setVideo(data);
        const duration = Math.max(data.duration || 1, 1);
        setVideoDuration(duration);
        
        // Fetch Versions (Edits)
        const { data: editVersions } = await supabase
          .from('video_edits')
          .select('*')
          .eq('video_id', id)
          .order('updated_at', { ascending: false });
          
        if (editVersions && editVersions.length > 0) {
          setVersions(editVersions);
          const latest = editVersions[0];
          setOverlays(latest.overlays || []);
          setAudioUrl(latest.audio_url);
          setAudioStartFrame(latest.audio_start_frame || 0);
          setClips(latest.clips || []);
          setSelectedVersionId(latest.id);
        } else {
          // Initialize with one full clip if no versions exist
          setClips([{
            startFrame: 0,
            endFrame: Math.round(duration * 30),
            durationInFrames: Math.round(duration * 30)
          }]);
        }
      }
      setLoading(false);
    };
    track();
  }, [id]);

  const addOverlay = (type: 'image' | 'text') => {
    const newOverlay: Overlay = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      src: type === 'text' ? 'New Text' : '/placeholder.png',
      startFrame: 30, // Start at 1 second
      duration: 150, // 5 seconds
      x: 50,
      y: 50,
      scale: 1,
      animation: 'pop-in',
      opacity: 1
    };
    setOverlays([...overlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  const updateOverlay = (id: string, updates: Partial<Overlay>) => {
    setOverlays(overlays.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const removeOverlay = (id: string) => {
    setOverlays(overlays.filter(o => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, overlayId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${id}/${overlayId}-${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage.from('overlay-images').upload(fileName, file);
    if (error) {
      alert('Upload failed');
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('overlay-images').getPublicUrl(fileName);
    updateOverlay(overlayId, { src: publicUrl });
  };

  const saveEdits = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('video_edits')
        .insert({ 
          video_id: id, 
          overlays,
          audio_url: audioUrl,
          audio_start_frame: audioStartFrame,
          clips,
          updated_at: new Date().toISOString() 
        })
        .select()
        .single();

      if (error) throw error;
      
      setVersions([data, ...versions]);
      setSelectedVersionId(data.id);
      alert('Studio version saved successfully!');
    } catch (err: any) {
      console.error(err);
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const loadVersion = (version: any) => {
    setOverlays(version.overlays || []);
    setAudioUrl(version.audio_url);
    setAudioStartFrame(version.audio_start_frame || 0);
    setClips(version.clips || []);
    setSelectedVersionId(version.id);
  };

  const deleteVersion = async (e: React.MouseEvent, versionId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this version?')) return;
    
    try {
      const { error } = await supabase.from('video_edits').delete().eq('id', versionId);
      if (error) throw error;
      
      const newVersions = versions.filter(v => v.id !== versionId);
      setVersions(newVersions);
      if (selectedVersionId === versionId) {
        if (newVersions.length > 0) loadVersion(newVersions[0]);
        else {
          setOverlays([]);
          setAudioUrl(null);
          setClips([]);
          setSelectedVersionId(null);
        }
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleSeek = (frame: number) => {
    setCurrentFrame(frame);
    playerRef.current?.seekTo(frame);
  };

  const splitClipAtFrame = (frame: number) => {
    const newClips = [...clips];
    let cumulative = 0;
    let targetIndex = -1;
    let offsetInClip = 0;

    for (let i = 0; i < newClips.length; i++) {
      const clip = newClips[i];
      if (frame >= cumulative && frame < cumulative + clip.durationInFrames) {
        targetIndex = i;
        offsetInClip = frame - cumulative;
        break;
      }
      cumulative += clip.durationInFrames;
    }

    if (targetIndex !== -1 && offsetInClip > 5 && offsetInClip < newClips[targetIndex].durationInFrames - 5) {
      const parent = newClips[targetIndex];
      const splitPoint = parent.startFrame + offsetInClip;
      
      const clipA = {
        ...parent,
        endFrame: splitPoint,
        durationInFrames: offsetInClip
      };
      
      const clipB = {
        ...parent,
        startFrame: splitPoint,
        durationInFrames: parent.durationInFrames - offsetInClip
      };

      newClips.splice(targetIndex, 1, clipA, clipB);
      setClips(newClips);
    }
  };

  const removeClip = (index: number) => {
    const newClips = clips.filter((_, i) => i !== index);
    setClips(newClips);
  };

  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId);

  if (loading) return (
    <div className="min-h-screen bg-[#0F0F12] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
    </div>
  );

  const editProps: EditProps = {
    videoUrl: video?.video_url || '',
    overlays,
    audioUrl,
    audioStartFrame,
    clips,
    videoDurationInFrames: totalDurationInFrames,
  };

  if (isLocked) return (
    <div className="min-h-screen bg-[#0F0F12] flex items-center justify-center p-6 text-white font-sans relative overflow-hidden">
      {/* Animated Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#732C3F]/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      
      <div className="w-full max-w-md p-10 bg-[#16161A] rounded-[40px] border border-white/5 shadow-2xl text-center space-y-8 animate-in zoom-in-95 duration-500 relative z-10 backdrop-blur-xl">
        <div className="relative w-24 h-24 mx-auto mb-6 group">
          <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 via-[#732C3F] to-indigo-500 rounded-3xl blur-xl opacity-30 group-hover:opacity-60 animate-gradient-x transition-opacity duration-1000"></div>
          <div className="relative w-full h-full bg-[#16161A] rounded-3xl flex items-center justify-center border border-white/10 shadow-inner">
            <img src="/Shinobiriselogo_black_nobg.png" alt="Shinobi Favicon" className="w-16 h-16 object-contain drop-shadow-2xl brightness-110" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">Studio Access</h2>
          <p className="text-slate-500 text-sm px-4">Secure deployment environment. Enter your administrator PIN to modify this video.</p>
        </div>
        
        <div className="space-y-6 flex flex-col items-center">
          <div className="w-full relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-[#732C3F]/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
            <input 
              type="password" 
              placeholder="••••" 
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (pin === 'shinobi2025') setIsLocked(false);
                  else alert('Invalid PIN');
                }
              }}
              className="relative w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-center text-3xl font-mono focus:outline-none focus:border-indigo-500/50 transition-all tracking-[0.5em] placeholder:tracking-normal placeholder:text-slate-700"
            />
          </div>
          
          <div className="flex flex-col w-full gap-3">
             <button 
               onClick={() => {
                 if (pin === 'shinobi2025') setIsLocked(false);
                 else alert('Invalid PIN');
               }}
               className="w-full bg-indigo-600 hover:bg-indigo-700 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all hover:scale-[1.01] active:scale-95"
             >
               Unlock Studio
             </button>

             <a href="https://calendly.com/drcabrerap/30min" target="_blank" className="w-full">
               <button className="w-full bg-[#16161A] hover:bg-[#1c1c22] text-white/70 hover:text-white text-sm font-bold py-4 px-8 rounded-2xl border border-white/5 transition-all flex items-center justify-center gap-3">
                 <div className="relative w-6 h-6 bg-white/10 rounded-md border border-white/10 flex flex-col overflow-hidden shrink-0">
                   <div className="h-2 bg-indigo-500/50 w-full" />
                   <div className="flex-1 flex items-center justify-center text-[10px] font-black">
                     {new Date().getDate()}
                   </div>
                 </div>
                 Support & Feedback
               </button>
             </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 3s linear infinite;
        }
      `}</style>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0F0F12] text-white font-sans overflow-hidden flex flex-col">
      
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#16161A]">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div className="h-4 w-px bg-white/10 mx-2" />
          <h1 className="font-bold text-lg truncate max-w-[200px] md:max-w-md">
            Editing: <span className="text-indigo-400">{video?.title}</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={saveEdits}
            disabled={isSaving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-full font-bold text-sm transition-all disabled:opacity-50"
          >
            {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save Project
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: Assets & Layers */}
        <div className="w-80 border-r border-white/5 flex flex-col bg-[#16161A] overflow-y-auto custom-scrollbar">
          <div className="flex border-b border-white/5 shrink-0 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('assets')}
              className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'assets' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Assets
            </button>
            <button 
              onClick={() => setActiveTab('audio')}
              className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'audio' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Audio
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}
            >
              History
            </button>
            {selectedOverlayId && (
              <button 
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'settings' ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Settings
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'history' ? (
              <div className="p-6 space-y-4">
                 <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-4">Version History</h3>
                 {versions.length === 0 && <p className="text-slate-600 text-xs italic">No versions saved yet.</p>}
                 <div className="space-y-2">
                   {versions.map((v, i) => (
                     <div key={v.id} className="relative group/vitem">
                       <button 
                        onClick={() => loadVersion(v)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${selectedVersionId === v.id ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-white/5 border-white/5 text-slate-400 hover:border-white/10'}`}
                       >
                         <div className="flex justify-between items-center">
                           <span className="text-xs font-bold">Version {versions.length - i}</span>
                           <span className="text-[10px] opacity-60">{new Date(v.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                         </div>
                         <p className="text-[10px] mt-1 opacity-50">{v.clips?.length || 0} clips • {v.overlays?.length || 0} layers</p>
                       </button>
                       <button 
                         onClick={(e) => deleteVersion(e, v.id)}
                         className="absolute top-2 right-2 p-1.5 bg-rose-500/10 text-rose-400 opacity-0 group-hover/vitem:opacity-100 rounded-lg hover:bg-rose-500 transition-all hover:text-white"
                       >
                         <Trash2 className="w-3 h-3" />
                       </button>
                     </div>
                   ))}
                 </div>
              </div>
            ) : (
              <div className="p-6 space-y-8">
                {activeTab === 'assets' ? (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Layers</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => addOverlay('image')} className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all text-xs font-bold">
                        <ImageIcon className="w-5 h-5 text-indigo-400" />
                        Add Image
                      </button>
                      <button onClick={() => addOverlay('text')} className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all text-xs font-bold">
                        <Type className="w-5 h-5 text-indigo-400" />
                        Add Text
                      </button>
                    </div>

                    <div className="pt-4">
                      <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-4">Timeline Layers</h3>
                      <div className="space-y-2">
                        {overlays.map((o, idx) => (
                          <div 
                            key={o.id}
                            onClick={() => {
                              setSelectedOverlayId(o.id);
                              setActiveTab('settings');
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${selectedOverlayId === o.id ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-white/2 hover:bg-white/5 border-transparent'}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono text-slate-600">#{idx + 1}</span>
                              <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center">
                                {o.type === 'image' ? <ImageIcon className="w-4 h-4 opacity-50" /> : <Type className="w-4 h-4 opacity-50" />}
                              </div>
                              <span className="text-sm font-medium truncate max-w-[100px]">{o.type === 'image' ? 'Image Overlay' : o.src}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); removeOverlay(o.id); }} className="p-1.5 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded-lg transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {overlays.length === 0 && (
                          <div className="text-center py-10 opacity-20 italic text-sm">No overlays added</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'settings' ? (
                  <div className="space-y-6">
                    {!selectedOverlay ? (
                      <div className="text-center py-20 text-slate-600 text-sm italic">Select a layer to edit its properties</div>
                    ) : (
                      <>
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-3">Content</label>
                          {selectedOverlay.type === 'image' ? (
                            <div className="space-y-3">
                              <div className="aspect-video bg-black/40 rounded-xl overflow-hidden border border-white/5 flex items-center justify-center p-2">
                                <img src={selectedOverlay.src.startsWith('http') ? selectedOverlay.src : '/placeholder.png'} className="max-w-full max-h-full object-contain" />
                              </div>
                              <label className="block w-full bg-indigo-600 hover:bg-indigo-700 text-center py-2.5 rounded-xl font-bold text-xs cursor-pointer transition-all">
                                Replace Image
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, selectedOverlay.id)} />
                              </label>
                            </div>
                          ) : (
                            <input 
                              type="text" 
                              value={selectedOverlay.src} 
                              onChange={(e) => updateOverlay(selectedOverlay.id, { src: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-all"
                            />
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-3 flex items-center gap-1.5">
                              <Move className="w-3 h-3" /> X
                            </label>
                            <input type="number" value={selectedOverlay.x} onChange={(e) => updateOverlay(selectedOverlay.id, { x: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 p-2.5 rounded-xl text-sm" />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-3 flex items-center gap-1.5">
                              <Move className="w-3 h-3" /> Y
                            </label>
                            <input type="number" value={selectedOverlay.y} onChange={(e) => updateOverlay(selectedOverlay.id, { y: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 p-2.5 rounded-xl text-sm" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-3 flex items-center gap-1.5">
                              <Maximize className="w-3 h-3" /> Scale
                            </label>
                            <input type="number" step="0.1" value={selectedOverlay.scale} onChange={(e) => updateOverlay(selectedOverlay.id, { scale: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 p-2.5 rounded-xl text-sm" />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-3 flex items-center gap-1.5">
                              <Settings className="w-3 h-3" /> Anim
                            </label>
                            <select value={selectedOverlay.animation} onChange={(e) => updateOverlay(selectedOverlay.id, { animation: e.target.value as any })} className="w-full bg-white/5 border border-white/10 p-2.5 rounded-xl text-sm appearance-none outline-none focus:border-indigo-500">
                              <option value="pop-in">Pop In</option>
                              <option value="fade-in">Fade In</option>
                              <option value="slide-in">Slide In</option>
                              <option value="none">None</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* Audio & Cuts Tab */
                  <div className="space-y-8 animate-in fade-in duration-300">
                    {/* Smart Trimming */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Smart Trimming</h3>
                      </div>
                      
                      <div className="space-y-3">
                        <button 
                          disabled={isAnalyzing}
                          onClick={async () => {
                            setIsAnalyzing(true);
                            setAnalysisProgress(0);
                            try {
                              const targetUrl = audioUrl || video.video_url;
                              const segments = await detectSoundSegments(targetUrl, (p) => setAnalysisProgress(p));
                              const newClips = segments.map(s => ({
                                startFrame: Math.floor(s.start * 30),
                                endFrame: Math.ceil(s.end * 30),
                                durationInFrames: Math.ceil(s.end * 30) - Math.floor(s.start * 30)
                              }));
                              setClips(newClips);
                            } catch (e) { console.error(e); }
                            setIsAnalyzing(false);
                          }}
                          className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <Scissors className="w-4 h-4 text-indigo-400" />
                            <div className="text-left">
                              <p className="text-xs font-bold">Auto-Cut Silence</p>
                              <p className="text-[10px] text-slate-500">Fast-paced, zero dead air</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-indigo-400 transition-colors" />
                        </button>

                        <button 
                          disabled={isAnalyzing}
                          onClick={async () => {
                            setIsAnalyzing(true);
                            const vttUrl = video.video_url.replace('.webm', '.vtt');
                            const fillerCuts = await getFillerWordCuts(vttUrl, (p) => setAnalysisProgress(p));
                            if (fillerCuts.length === 0) {
                              alert("No filler words found.");
                            } else {
                              alert(`Found ${fillerCuts.length} fillers.`);
                            }
                            setIsAnalyzing(false);
                          }}
                          className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <div className="text-left">
                              <p className="text-xs font-bold">Remove Fillers</p>
                              <p className="text-[10px] text-slate-500">Kill the "ums" and "ahs"</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-amber-400 transition-colors" />
                        </button>
                        
                        {clips.length > 0 && (
                          <div className="mt-4 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
                             <div className="flex justify-between items-center mb-3">
                               <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Manual Timeline</p>
                               <button onClick={() => setClips([])} className="text-[10px] text-slate-500 hover:text-white underline">Reset All</button>
                             </div>
                             <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                               {clips.map((clip, i) => (
                                 <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5 group/clip">
                                   <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">#{i+1}</span>
                                      <span className="text-[10px] font-bold">{Math.round(clip.startFrame / 30)}s - {Math.round(clip.endFrame / 30)}s</span>
                                   </div>
                                   <button 
                                     onClick={() => setClips(clips.filter((_, idx) => idx !== i))}
                                     className="opacity-0 group-hover/clip:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 rounded-md"
                                   >
                                      <Trash2 className="w-3 h-3 text-rose-400" />
                                   </button>
                                 </div>
                               ))}
                             </div>
                          </div>
                        )}

                        {/* Fix Duration / Sync Utility */}
                        <div className="mt-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest">Clip Bounds</p>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">{Math.round(videoDuration)}s</span>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <p className="text-slate-400 text-[9px] mb-2 leading-relaxed opacity-70 italic">Manual override if metadata fails:</p>
                              <div className="flex gap-2">
                                <input 
                                  type="number" 
                                  value={Math.round(videoDuration)}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (val > 0) {
                                      setVideoDuration(val);
                                      // Auto-expand clip if it's the only one
                                      if (clips.length <= 1) {
                                        setClips([{
                                          startFrame: 0,
                                          endFrame: val * 30,
                                          durationInFrames: val * 30
                                        }]);
                                      }
                                    }
                                  }}
                                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-indigo-400 outline-none focus:border-indigo-500/50"
                                />
                                <span className="text-[10px] text-slate-500 self-center">seconds</span>
                              </div>
                            </div>

                            {videoDuration <= 5 && (
                              <button 
                                onClick={() => {
                                  // Force a reset and re-probe
                                  const confirmed = confirm("Attempt to re-detect video length? This will reset your current clips.");
                                  if (confirmed) {
                                    setVideoDuration(0.1); 
                                    setClips([]);
                                  }
                                }} 
                                className="w-full py-2.5 bg-indigo-500 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-600 transition-all shadow-lg flex items-center justify-center gap-2"
                              >
                                <Zap className="w-3 h-3" />
                                Repair Video Duration
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl shadow-2xl">
               <RemotionPlayer 
                playerRef={playerRef}
                props={editProps} 
                onFrameUpdate={setCurrentFrame}
               />
            </div>
          </div>

          {/* Manual Timeline Area */}
          <div className="p-6 bg-[#16161A]/50 border-t border-white/5">
            <ManualTimeline 
               durationInFrames={totalDurationInFrames}
               clips={clips.length > 0 ? clips : [{ startFrame: 0, endFrame: Math.round(videoDuration * 30), durationInFrames: Math.round(videoDuration * 30) }]}
               currentFrame={currentFrame}
               onSeek={handleSeek}
               onSplit={splitClipAtFrame}
               onRemove={removeClip}
               onUpdateClip={(idx, updates) => {
                  const newClips = [...clips];
                  newClips[idx] = { ...newClips[idx], ...updates };
                  setClips(newClips);
               }}
            />
          </div>
        </div>

      </main>

      {/* Basic Footer / Timeline Indicator (Simplified for v1) */}
      <footer className="h-10 border-t border-white/5 bg-[#16161A] flex items-center px-6 justify-center gap-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Client Edition Active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Remotion Player Sync</span>
        </div>
      </footer>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>

      {/* ANALYSIS PROGRESS OVERLAY */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#16161A] border border-white/10 rounded-3xl p-10 max-w-md w-full mx-4 shadow-2xl text-center">
            <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold mb-2">Analyzing Video</h2>
            <p className="text-slate-500 text-sm mb-8 px-4">Detecting silence and filler words for a perfect flow...</p>
            
            <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-2">
              <div 
                className="bg-indigo-500 h-full transition-all duration-300 ease-out" 
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <span>{Math.round(analysisProgress)}% Processed</span>
              <span>Hardware Accelerated</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

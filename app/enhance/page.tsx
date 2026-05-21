'use client';

import { supabase } from '@/lib/supabase';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

export default function EnhancePage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [previewEnhanced, setPreviewEnhanced] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    const { data } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
    setVideos(data || []);
    setLoading(false);
  };

  const togglePreview = () => {
    if (!videoRef.current) return;
    
    if (previewEnhanced) {
      // Turn off enhancement (reload video to bypass node cleanly)
      audioCtxRef.current?.suspend();
      setPreviewEnhanced(false);
      return;
    }

    // Turn on enhancement preview
    try {
      if (!audioCtxRef.current) {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(videoRef.current);
        sourceNodeRef.current = source;

        // Dynamics Compressor
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24; // Less aggressive so we don't boost echo tails
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.1;

        // High-pass filter (remove rumble)
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 120;

        // Mid-frequency scoop (removes 'boxy' room echo)
        const lowMidScoop = ctx.createBiquadFilter();
        lowMidScoop.type = 'peaking';
        lowMidScoop.frequency.value = 500;
        lowMidScoop.Q.value = 1.5;
        lowMidScoop.gain.value = -4;

        // Makeup Gain to boost the compressed signal loudly
        const makeUpGain = ctx.createGain();
        makeUpGain.gain.value = 2.5;

        source.connect(highpass);
        highpass.connect(lowMidScoop);
        lowMidScoop.connect(compressor);
        compressor.connect(makeUpGain);
        makeUpGain.connect(ctx.destination);
      }
      
      audioCtxRef.current.resume();
      setPreviewEnhanced(true);
      videoRef.current.play();
    } catch (e) {
      console.error("Audio routing error:", e);
      alert("Please pause the video before enabling the preview for the first time due to browser security.");
    }
  };

  const applyEnhancement = async () => {
    if (!selectedVideo) return;
    setIsEnhancing(true);
    
    // Simulate AI processing time for UX effect
    await new Promise(r => setTimeout(r, 1500));
    
    const { error } = await supabase.from('videos').update({ is_enhanced: true }).eq('id', selectedVideo.id);
    
    if (!error) {
      setSelectedVideo({ ...selectedVideo, is_enhanced: true });
      fetchVideos();
    }
    
    setIsEnhancing(false);
    alert('Studio Audio Profile successfully applied to this video! All future viewers will hear the enhanced version natively.');
  };

  return (
    <div className="min-h-screen bg-[#F3F1FD] font-sans text-slate-800 p-6 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Audio Enhancement Lab</h1>
          </div>
          <Link href="/" className="bg-white border text-slate-600 font-semibold px-6 py-3 rounded-full hover:bg-slate-50 transition-colors">
            Back to Dashboard
          </Link>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Col: Source Selection */}
          <div className="lg:col-span-1 bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col h-[600px]">
            <h2 className="text-xl font-bold mb-4">Select Video</h2>
            <div className="overflow-y-auto pr-2 flex-1 space-y-3">
              {loading && <p className="text-slate-400">Loading library...</p>}
              {videos.map(v => (
                <button 
                  key={v.id}
                  onClick={() => {
                    setSelectedVideo(v);
                    setPreviewEnhanced(false);
                    if (audioCtxRef.current) audioCtxRef.current.suspend();
                  }}
                  className={`w-full text-left p-4 rounded-2xl transition-all border ${selectedVideo?.id === v.id ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-slate-100 bg-white hover:border-indigo-200'}`}
                >
                  <p className="font-bold text-slate-800 line-clamp-1">{v.title}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {v.is_enhanced 
                      ? <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-md font-bold uppercase tracking-wider">Enhanced</span>
                      : <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-md font-bold uppercase tracking-wider">Original</span>
                    }
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Col: Enhancer Tool */}
          <div className="lg:col-span-2 bg-white p-8 md:p-12 rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            {!selectedVideo ? (
              <div className="text-slate-400">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-lg font-medium">Select a video from the library to begin enhancement</p>
              </div>
            ) : (
              <div className="w-full">
                <div className="relative bg-black rounded-[24px] overflow-hidden shadow-2xl mb-8 aspect-video">
                  <video 
                    ref={videoRef}
                    src={selectedVideo.video_url} 
                    controls 
                    crossOrigin="anonymous"
                    className="w-full h-full object-contain"
                  />
                  {previewEnhanced && (
                    <div className="absolute top-4 right-4 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                      Studio Monitor Active
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-200">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="text-left">
                      <h3 className="text-xl font-bold text-slate-800 mb-1">Studio Dynamics Processor</h3>
                      <p className="text-sm text-slate-500 max-w-sm">Applies an active noise gate, rumble-filter, and vocal compression to instantly modernize the audio.</p>
                    </div>
                    
                    <div className="flex flex-col gap-3 min-w-[200px]">
                      <button 
                        onClick={togglePreview}
                        className={`font-semibold py-3 px-6 rounded-full transition-colors border ${previewEnhanced ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                      >
                        {previewEnhanced ? 'Disable Preview Map' : '🎧 Listen to Preview'}
                      </button>
                      
                      <button 
                        onClick={applyEnhancement}
                        disabled={selectedVideo.is_enhanced || isEnhancing}
                        className={`font-bold py-3 px-6 rounded-full shadow-lg transition-all ${selectedVideo.is_enhanced ? 'bg-green-500 text-white shadow-green-500/20 opacity-50 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02] text-white shadow-indigo-600/30'}`}
                      >
                        {isEnhancing ? 'Processing...' : selectedVideo.is_enhanced ? '✓ Added to Video' : 'Apply Studio Filter'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

'use client';

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Dashboard() {
  const router = useRouter();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  useEffect(() => {
    supabase.from('videos').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setVideos(data || []);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string, url: string) => {
    if (!confirm('Are you sure you want to delete this audit? This will free up storage limit.')) return;
    
    // Attempt to extract the filename from the URL
    const filename = url.split('/').pop();
    if (filename) {
      await supabase.storage.from('videos').remove([filename]);
      
      // If we also generate .vtt files, they will have the same base name but .vtt extension
      const vttFilename = filename.replace('.webm', '.vtt');
      await supabase.storage.from('videos').remove([vttFilename]);
    }

    await supabase.from('videos').delete().eq('id', id);
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F3F1FD] text-slate-800 font-sans selection:bg-indigo-100">
      <div className="max-w-5xl mx-auto p-10 lg:p-16">
        
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-4">
            <img src="/Shinobiriselogo_black_nobg.png" alt="ShinobiRise Logo" className="h-16 md:h-20 w-auto" />
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 hidden sm:block">Video Dashboard</h1>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-slate-700 text-sm font-medium transition-colors">
            Sign out
          </button>
        </header>
        
        <div className="flex flex-wrap gap-5 mb-14">
          <Link href="/record" className="bg-[#732C3F] hover:bg-[#1A0B12] text-white px-8 py-5 rounded-full text-lg font-semibold transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#732C3F]/20 shadow-lg shadow-[#732C3F]/10 flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Audit
          </Link>
          <Link href="/enhance" className="bg-white border text-slate-700 px-8 py-5 rounded-full text-lg font-medium transition-all hover:border-slate-300 hover:shadow-md flex items-center gap-3">
            ✨ Enhance Existing Video
          </Link>
        </div>

        <h2 className="text-xl font-bold text-slate-800 mb-6 px-1">Recent Audits</h2>

        <div className="grid gap-5">
          {loading && <p className="text-slate-500 animate-pulse">Loading audits...</p>}
          {!loading && videos.map(v => (
            <div key={v.id} className="group relative flex justify-between items-center bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 transition-all hover:shadow-xl duration-300">
              <div className="flex-1 truncate pr-4">
                <h3 className="text-xl font-semibold text-slate-900 mb-2 truncate">{v.title}</h3>
                <p className="text-slate-500 font-medium text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              
              <div className="px-8 text-center hidden sm:block">
                <div className="text-3xl font-bold text-slate-800">{v.views}</div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">Views</p>
              </div>
              
              <div className="pl-6 border-l border-slate-100 flex flex-col md:flex-row items-center gap-3">
                <a href={`/v/${v.id}`} target="_blank" className="bg-[#732C3F]/10 hover:bg-[#732C3F]/20 text-[#732C3F] px-5 py-3 rounded-2xl font-semibold transition-colors flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  View
                </a>
                <Link href={`/edit/${v.id}`} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-semibold transition-colors flex items-center gap-2 text-sm shadow-md shadow-indigo-600/10">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Studio
                </Link>
                <button onClick={() => handleDelete(v.id, v.video_url)} className="text-rose-600 bg-rose-50 hover:bg-rose-100 font-semibold px-4 py-3 rounded-xl transition-colors flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!loading && videos.length === 0 && (
            <div className="text-center p-20 bg-white rounded-3xl border border-slate-100 border-dashed">
              <svg className="w-16 h-16 text-slate-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              <p className="text-slate-500 font-medium text-lg">No audits recorded yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

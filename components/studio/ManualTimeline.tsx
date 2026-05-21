'use client';

import React, { useRef, useEffect, useState } from 'react';
import { ClipSegment } from '@/lib/types/edit';
import { Scissors, Trash2 } from 'lucide-react';

interface ManualTimelineProps {
  durationInFrames: number;
  clips: ClipSegment[];
  currentFrame: number;
  onSeek: (frame: number) => void;
  onSplit: (frame: number) => void;
  onRemove: (index: number) => void;
  onUpdateClip: (index: number, updates: Partial<ClipSegment>) => void;
}

export function ManualTimeline({
  durationInFrames,
  clips,
  currentFrame,
  onSeek,
  onSplit,
  onRemove,
  onUpdateClip,
}: ManualTimelineProps) {
  const [dragInfo, setDragInfo] = useState<{ 
    idx: number; 
    type: 'left' | 'right' | 'move'; 
    initialX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent, index: number, type: 'left' | 'right' | 'move') => {
    e.stopPropagation();
    setDragInfo({
      idx: index,
      type,
      initialX: e.clientX,
      initialStart: clips[index].startFrame,
      initialEnd: clips[index].endFrame,
    });
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragInfo || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragInfo.initialX;
    const deltaFrames = Math.round((deltaX / rect.width) * durationInFrames);

    const clip = clips[dragInfo.idx];
    if (!clip) return;

    if (dragInfo.type === 'left') {
      const newStart = Math.max(0, Math.min(dragInfo.initialStart + deltaFrames, clip.endFrame - 10));
      onUpdateClip(dragInfo.idx, { startFrame: newStart, durationInFrames: clip.endFrame - newStart });
    } else if (dragInfo.type === 'right') {
      const newEnd = Math.max(clip.startFrame + 10, Math.min(dragInfo.initialEnd + deltaFrames, durationInFrames));
      onUpdateClip(dragInfo.idx, { endFrame: newEnd, durationInFrames: newEnd - clip.startFrame });
    } else if (dragInfo.type === 'move') {
      const duration = dragInfo.initialEnd - dragInfo.initialStart;
      let newStart = dragInfo.initialStart + deltaFrames;
      let newEnd = newStart + duration;

      if (newStart < 0) {
        newStart = 0;
        newEnd = duration;
      }
      if (newEnd > durationInFrames) {
        newEnd = durationInFrames;
        newStart = newEnd - duration;
      }
      
      onUpdateClip(dragInfo.idx, { startFrame: newStart, endFrame: newEnd });
    }
  };

  const handleMouseUp = () => {
    setDragInfo(null);
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragInfo]);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDragging || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.round((x / rect.width) * durationInFrames);
    onSeek(Math.max(0, Math.min(frame, durationInFrames)));
  };

  return (
    <div className="w-full bg-[#1A1A1F] border border-white/5 rounded-3xl p-6 select-none shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl">
             <Scissors className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm tracking-tight">Manual Timeline</h3>
            <p className="text-slate-500 text-[10px] leading-none">Drag edges to trim • Center to move • Split at playhead</p>
          </div>
        </div>
        
        <button 
          onClick={() => onSplit(currentFrame)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/10 active:scale-95"
        >
          <Scissors className="w-3.5 h-3.5" />
          Split at Playhead
        </button>
      </div>

      <div 
        ref={timelineRef}
        className="relative h-24 bg-[#111114] rounded-2xl border border-white/5 overflow-hidden cursor-crosshair group active:cursor-grabbing"
        onMouseDown={handleTimelineClick}
      >
        {/* Grid Background */}
        <div className="absolute inset-0 flex justify-between px-2 opacity-5 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="w-px h-full bg-white" />
          ))}
        </div>

        {/* Clips Area */}
        <div className="absolute inset-0 flex items-center">
          {clips.map((clip, idx) => (
            <div
              key={`${idx}-${clip.startFrame}-${clip.endFrame}`}
              className="absolute h-16 bg-indigo-500/20 border border-indigo-500/40 group/clip transition-colors hover:bg-indigo-500/30 overflow-hidden cursor-move"
              style={{
                left: `${(clip.startFrame / durationInFrames) * 100}%`,
                width: `${((clip.endFrame - clip.startFrame) / durationInFrames) * 100}%`,
              }}
              onMouseDown={(e) => handleMouseDown(e, idx, 'move')}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest truncate px-2">SEGMENT {idx + 1}</span>
              </div>

              {/* Trim Handles */}
              <div 
                className="absolute left-0 top-0 bottom-0 w-2.5 bg-indigo-500 cursor-ew-resize hover:w-3.5 transition-all z-10 flex items-center justify-center"
                onMouseDown={(e) => handleMouseDown(e, idx, 'left')}
              >
                 <div className="w-0.5 h-4 bg-white/40 rounded-full" />
              </div>
              <div 
                className="absolute right-0 top-0 bottom-0 w-2.5 bg-indigo-500 cursor-ew-resize hover:w-3.5 transition-all z-10 flex items-center justify-center"
                onMouseDown={(e) => handleMouseDown(e, idx, 'right')}
              >
                 <div className="w-0.5 h-4 bg-white/40 rounded-full" />
              </div>

              {/* Delete Button */}
              {clips.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                  className="absolute top-1 right-2 hidden group-hover/clip:flex w-5 h-5 bg-rose-500 text-white rounded-md items-center justify-center shadow-lg hover:bg-rose-600 transition-colors z-20"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)] z-40 pointer-events-none"
          style={{ left: `${(currentFrame / durationInFrames) * 100}%` }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-rose-500 rounded-b-lg border-x border-b border-rose-400 shadow-xl flex items-center justify-center font-black text-[8px] text-white">
            ▼
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] font-medium text-slate-500 uppercase tracking-widest px-1">
        <span>00:00</span>
        <div className="px-3 py-1 bg-rose-500/10 rounded-lg border border-rose-500/20">
          <span className="text-rose-400 font-bold">
              {Math.floor(currentFrame / 30)}s / {Math.floor(durationInFrames / 30)}s
          </span>
        </div>
        <span>{Math.floor(durationInFrames / 30)}s</span>
      </div>
    </div>
  );
}

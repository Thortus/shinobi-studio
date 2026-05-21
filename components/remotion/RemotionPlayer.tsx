'use client';

import { Player, PlayerRef } from '@remotion/player';
import { MainComposition } from '../../remotion/MainComposition';
import { EditProps } from '../../lib/types/edit';

export const RemotionPlayer: React.FC<{
  props: EditProps,
  playerRef?: React.RefObject<PlayerRef | null>,
  onFrameUpdate?: (frame: number) => void
}> = ({ props, playerRef, onFrameUpdate }) => {
  const durationInFrames = props.videoDurationInFrames && props.videoDurationInFrames > 0
    ? props.videoDurationInFrames
    : null;
  // Key by video URL + duration-in-seconds so Player only remounts on real source/length changes,
  // not on 1-frame rounding jitter between renders.
  const playerKey = durationInFrames
    ? `${props.videoUrl}-${Math.round(durationInFrames / 30)}`
    : null;

  if (!durationInFrames || !props.videoUrl) {
    return (
      <div className="w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">Detecting video duration…</p>
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10">
      <Player
        key={playerKey}
        ref={playerRef}
        // @ts-ignore — Remotion's LooseComponentType doesn't accept typed props; runtime is correct
        component={MainComposition}
        inputProps={props}
        durationInFrames={durationInFrames}
        fps={30}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{
          width: '100%',
          height: '100%',
        }}
        controls
        loop
        onFrameUpdate={(e: { frame: number }) => onFrameUpdate?.(e.frame)}
      />
    </div>
  );
};

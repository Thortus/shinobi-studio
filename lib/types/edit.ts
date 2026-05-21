export type OverlayType = 'image' | 'text';

export interface Overlay {
  id: string;
  type: OverlayType;
  src: string; // URL for image or text content
  startFrame: number;
  duration: number;
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  opacity?: number;
  animation?: 'slide-in' | 'fade-in' | 'pop-in' | 'none';
}

export interface ClipSegment {
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
}

export interface EditProps {
  videoUrl: string;
  overlays: Overlay[];
  audioUrl?: string | null;
  audioStartFrame?: number; // Frame offset for sync (e.g. from a clap)
  videoDurationInFrames: number;
  clips?: ClipSegment[];
}

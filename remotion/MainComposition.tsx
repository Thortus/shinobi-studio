import { 
  AbsoluteFill, 
  Video, 
  Sequence, 
  useVideoConfig, 
  spring, 
  interpolate, 
  useCurrentFrame,
  Img,
  Audio,
  Series
} from 'remotion';
import { EditProps, Overlay } from '../lib/types/edit';

const AnimatedOverlay: React.FC<{ overlay: Overlay }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation logic
  const entrance = spring({
    frame: frame - overlay.startFrame,
    fps,
    config: {
      damping: 12,
    },
  });

  const fade = interpolate(
    frame - overlay.startFrame,
    [0, 10],
    [0, overlay.opacity ?? 1],
    { extrapolateRight: 'clamp' }
  );

  let style: React.CSSProperties = {
    position: 'absolute',
    left: `${overlay.x}%`,
    top: `${overlay.y}%`,
    transform: `translate(-50%, -50%) scale(${overlay.scale}) rotate(${overlay.rotation ?? 0}deg)`,
    opacity: overlay.opacity ?? 1,
    zIndex: 10,
  };

  if (overlay.animation === 'pop-in') {
    style.transform = `${style.transform} scale(${entrance})`;
  } else if (overlay.animation === 'fade-in') {
    style.opacity = fade;
  } else if (overlay.animation === 'slide-in') {
    const translateY = interpolate(entrance, [0, 1], [50, 0]);
    style.transform = `${style.transform} translateY(${translateY}px)`;
    style.opacity = entrance;
  }

  return (
    <div style={style}>
      {overlay.type === 'image' && (
        <Img 
          src={overlay.src} 
          style={{ 
            maxWidth: '400px', 
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
          }} 
        />
      )}
      {overlay.type === 'text' && (
        <div style={{ 
          color: 'white', 
          fontSize: '48px', 
          fontWeight: 'bold',
          textShadow: '0 4px 6px rgba(0,0,0,0.3)',
          background: 'rgba(0,0,0,0.5)',
          padding: '10px 20px',
          borderRadius: '12px',
          whiteSpace: 'nowrap'
        }}>
          {overlay.src}
        </div>
      )}
    </div>
  );
};

export const MainComposition: React.FC<EditProps> = ({ 
  videoUrl, 
  overlays, 
  audioUrl, 
  audioStartFrame, 
  clips 
}) => {
  const { durationInFrames } = useVideoConfig();
  const validClips = clips ? clips.filter(c => (c.durationInFrames || 0) > 0.1) : [];

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {validClips.length > 0 ? (
        <Series>
          {validClips.map((clip, index) => (
            <Series.Sequence
              key={`clip-${index}`}
              durationInFrames={Math.max(1, Math.round(clip.durationInFrames))}
            >
                <Video
                  src={videoUrl}
                  startFrom={Math.max(0, Math.round(clip.startFrame))}
                  muted={!!audioUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
            </Series.Sequence>
          ))}
        </Series>
      ) : (
        <Video
          src={videoUrl}
          muted={!!audioUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
      
      {/* Overlays Layer */}
      {overlays.map((overlay) => (
        <Sequence
          key={overlay.id}
          from={Math.round(overlay.startFrame)}
          durationInFrames={Math.max(1, Math.round(overlay.duration))}
        >
          <AnimatedOverlay overlay={overlay} />
        </Sequence>
      ))}

      {/* Replacement Audio (Layered or Replaced) */}
      {audioUrl && (
        <Sequence from={Math.max(0, audioStartFrame ?? 0)}>
          <Audio 
            src={audioUrl} 
            startFrom={Math.abs(Math.min(0, audioStartFrame ?? 0))}
            volume={1}
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

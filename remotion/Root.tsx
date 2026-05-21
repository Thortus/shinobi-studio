import { Composition } from 'remotion';
import { MainComposition } from './MainComposition';
import { EditProps } from '../lib/types/edit';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        // @ts-ignore — Remotion's LooseComponentType doesn't accept typed props; runtime is correct
        component={MainComposition}
        durationInFrames={1800} // Default 1 minute at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          videoUrl: '',
          overlays: [],
          videoDurationInFrames: 1800,
        } as EditProps}
      />
    </>
  );
};

import {Composition} from 'remotion';
import {Video} from './Video';
import timeline from './timeline.json';

export const Root: React.FC = () => (
  <Composition
    id="Main"
    component={Video}
    durationInFrames={Math.ceil(timeline.total * timeline.fps)}
    fps={timeline.fps}
    width={1080}
    height={1920}
  />
);

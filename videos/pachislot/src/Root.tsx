import {Composition} from 'remotion';
import {FPS} from './lib';
import {Check00, timelineCheck00} from './episodes/check00';

// 回ごとに1つ。id は episodes/<id> と同じ（node scripts/render.mjs <id>）
export const Root: React.FC = () => (
  <>
    <Composition id="check00" component={Check00} durationInFrames={Math.ceil(timelineCheck00.total * FPS)} fps={FPS} width={1080} height={1920} />
  </>
);

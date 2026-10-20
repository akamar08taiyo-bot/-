import {Composition} from 'remotion';
import {FPS} from './lib';
import {Honne01, timelineHonne01} from './episodes/honne01';
import {Honne02, timelineHonne02} from './episodes/honne02';
import {Honne03, durationHonne03} from './episodes/honne03';
import {Spy01, timelineSpy01} from './episodes/spy01';
import {Bekkan01, durationBekkan01} from './episodes/bekkan01';
import {Bekkan02, durationBekkan02} from './episodes/bekkan02';
import {Bekkan03, durationBekkan03} from './episodes/bekkan03';
import {Bekkan04, durationBekkan04} from './episodes/bekkan04';
import {Bekkan05, durationBekkan05} from './episodes/bekkan05';

// 回ごとに1つ。id は episodes/<id> と同じ（node scripts/render.mjs <id>）
export const Root: React.FC = () => (
  <>
    <Composition id="honne01" component={Honne01} durationInFrames={Math.ceil(timelineHonne01.total * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="honne02" component={Honne02} durationInFrames={Math.ceil(timelineHonne02.total * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="honne03" component={Honne03} durationInFrames={durationHonne03} fps={FPS} width={1080} height={1920} />
    <Composition id="spy01" component={Spy01} durationInFrames={Math.ceil(timelineSpy01.total * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="bekkan01" component={Bekkan01} durationInFrames={durationBekkan01} fps={FPS} width={1080} height={1920} />
    <Composition id="bekkan02" component={Bekkan02} durationInFrames={durationBekkan02} fps={FPS} width={1080} height={1920} />
    <Composition id="bekkan03" component={Bekkan03} durationInFrames={durationBekkan03} fps={FPS} width={1080} height={1920} />
    <Composition id="bekkan04" component={Bekkan04} durationInFrames={durationBekkan04} fps={FPS} width={1080} height={1920} />
    <Composition id="bekkan05" component={Bekkan05} durationInFrames={durationBekkan05} fps={FPS} width={1080} height={1920} />
  </>
);

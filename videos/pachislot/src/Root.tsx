import {Composition} from 'remotion';
import {FPS} from './lib';
import {Check00, timelineCheck00} from './episodes/check00';

// webpack（Remotion の bundler）の require.context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Require {
      context(dir: string, sub: boolean, re: RegExp): {keys(): string[]; (id: string): unknown};
    }
  }
}

type Episode = {component: React.FC; timeline: {fps: number; total: number}; width: number; height: number};
// 横長の回（src/episodes/epNN.tsx が export する episode）は、手元にファイルがある回だけ登録する。
// 回の中身（台本・絵・声）はユーザーの作品なので、公開リポジトリには入れないことがあるため。
const ctx = require.context('./episodes', false, /^\.\/ep\d+\.tsx$/);
const EPISODES = [...new Set(ctx.keys())].map((k) => ({id: k.replace(/^\.\/|\.tsx$/g, ''), ...(ctx(k) as {episode: Episode}).episode}));

// 回ごとに1つ。id は episodes/<id> と同じ（node scripts/render.mjs <id>）
export const Root: React.FC = () => (
  <>
    <Composition id="check00" component={Check00} durationInFrames={Math.ceil(timelineCheck00.total * FPS)} fps={FPS} width={1080} height={1920} />
    {EPISODES.map((e) => (
      <Composition key={e.id} id={e.id} component={e.component} durationInFrames={Math.ceil(e.timeline.total * e.timeline.fps)} fps={e.timeline.fps} width={e.width} height={e.height} />
    ))}
  </>
);

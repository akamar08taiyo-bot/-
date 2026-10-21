import {Composition} from 'remotion';
import {FPS} from './lib';
import {Check00, timelineCheck00} from './episodes/check00';
import {SH, SW, Short, ShortData} from './short';

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

// 縦型のショート（episodes/shNN/ の script・timeline・shots の JSON だけで組む。TSX は要らない）
const sctx = require.context('../episodes', true, /^\.\/sh\d+\/(script|timeline|shots)\.json$/);
const SHORTS: ShortData[] = [...new Set(sctx.keys().map((k) => k.split('/')[1]))]
  .filter((id) => ['script', 'timeline', 'shots'].every((n) => sctx.keys().includes(`./${id}/${n}.json`)))
  .map((id) => ({
    id,
    script: sctx(`./${id}/script.json`) as ShortData['script'],
    timeline: sctx(`./${id}/timeline.json`) as ShortData['timeline'],
    shots: sctx(`./${id}/shots.json`) as ShortData['shots'],
  }));

// 回ごとに1つ。id は episodes/<id> と同じ（node scripts/render.mjs <id>）
export const Root: React.FC = () => (
  <>
    <Composition id="check00" component={Check00} durationInFrames={Math.ceil(timelineCheck00.total * FPS)} fps={FPS} width={1080} height={1920} />
    {EPISODES.map((e) => (
      <Composition key={e.id} id={e.id} component={e.component} durationInFrames={Math.ceil(e.timeline.total * e.timeline.fps)} fps={e.timeline.fps} width={e.width} height={e.height} />
    ))}
    {SHORTS.map((d) => (
      <Composition key={d.id} id={d.id} component={Short} defaultProps={{data: d}} durationInFrames={Math.ceil(d.timeline.total * d.timeline.fps)} fps={d.timeline.fps} width={SW} height={SH} />
    ))}
  </>
);

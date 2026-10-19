// 本編。場面・カメラ・テロップの時刻はすべて台本の行（T.s / T.e）から決める。
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import './fonts';
import script from '../script.json';
import faces from './faces.json';
import {Boso, C, Frost, Header, HookTitle, Meter, Note, Poll, Subtitle, Telop} from './parts';
import {Cam, CamKey, T, camAt, placeCam, ramp, wobble} from './lib';

type Box = [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0〜1000
const center = (b: Box) => ({x: (b[1] + b[3]) / 2000, y: (b[0] + b[2]) / 2000});
const face = (scene: string, who: string) => {
  const f = (faces as Record<string, {who: string; box: Box}[]>)[scene].find((v) => v.who === who);
  if (!f) throw new Error(`no face ${who} in ${scene}`);
  return center(f.box);
};
const cam = (fx: number, fy: number, z: number, tx = 540, ty = 820): Cam => ({fx, fy, z, tx, ty});

type Overlay = (p: {frame: number; at: (nx: number, ny: number) => {x: number; y: number}; s: number}) => React.ReactNode;
type Scene = {img: string; from: number; to: number; keys: CamKey[]; drift?: number; punch?: boolean; overlay?: Overlay};

const LEAD = -0.15; // 絵は声より少し先に出す
const S1 = face('S1', 'WIFE');
const S3w = face('S3', 'WIFE');
const S4w = face('S4', 'WIFE');
const S6w = face('S6', 'WIFE');
const S6h = face('S6', 'HUSBAND');
const S7lf = center((faces as any).S7_extra.leaflet as Box);

const SCENES: Scene[] = [
  {img: 'S1', from: 0, to: T.s('promise', LEAD), keys: [{at: 0, cam: cam(S1.x, S1.y, 1.3, 540, 560)}], drift: 0.04},
  {img: 'S2', from: T.s('promise', LEAD), to: T.s('a1', LEAD), keys: [{at: 0, cam: cam(0.502, 0.435, 1.0, 540, 830)}], drift: 0.07},
  {
    img: 'S3',
    from: T.s('a1', LEAD),
    to: T.s('a2', LEAD),
    keys: [
      {at: 0, cam: cam(0.52, 0.37, 1.12, 540, 800)},
      {at: T.s('a1t', -0.12), cam: cam(S3w.x, S3w.y, 1.75, 600, 800), dur: 9},
    ],
    overlay: ({at}) => {
      const p = at(0.84, 0.29);
      return <Boso x={p.x} y={p.y} from={T.s('a1t', -0.02)} to={T.s('a2', LEAD)} />;
    },
  },
  {
    img: 'S4',
    from: T.s('a2', LEAD),
    to: T.s('a3', LEAD),
    keys: [
      {at: 0, cam: cam(0.5, 0.43, 1.08, 540, 830)},
      {at: T.s('a2t', -0.12), cam: cam(S4w.x, S4w.y, 1.65, 560, 860), dur: 9},
    ],
    overlay: ({at}) => {
      const p = at(0.8, 0.44);
      return <Boso x={p.x} y={p.y} from={T.s('a2t', -0.02)} to={T.s('a3', LEAD)} />;
    },
  },
  {img: 'S5', from: T.s('a3', LEAD), to: T.s('a4', LEAD), keys: [{at: 0, cam: cam(0.6, 0.36, 1.12, 560, 760)}], drift: 0.06},
  {
    img: 'S6',
    from: T.s('a4', LEAD),
    to: T.s('a5a', LEAD),
    keys: [
      {at: 0, cam: cam(0.52, 0.45, 1.02, 540, 840)},
      {at: T.s('a4t', -0.12), cam: cam(S6w.x, S6w.y, 1.55, 420, 840), dur: 10},
    ],
    overlay: ({frame, at, s}) => {
      const k = s / 0.72;
      const wife = at(S6w.x, 0.3);
      const hus = at(0.79, 0.415);
      const start = T.s('a4', LEAD);
      const claim = T.s('a4', 1.35); // 「俺の方が疲れてる」
      const wl = 0.15 + 0.8 * ramp(frame, start + 2, start + 14);
      const hl = 0.3 + 0.95 * ramp(frame, claim, claim + 8);
      const push = T.s('a4t', -0.12);
      const fadeOut = 1 - ramp(frame, push, push + 6); // ボソッで妻に寄るときはメーターを消す
      const b = at(0.34, 0.37);
      return (
        <>
          <Meter x={wife.x} y={wife.y} scale={k} label="妻の疲れ" level={wl} opacity={fadeOut} />
          <Meter x={hus.x} y={hus.y} scale={k} label="夫の疲れ" level={hl} shake={frame > claim ? 3 * k : 0} opacity={fadeOut} />
          <Boso x={b.x} y={b.y} from={T.s('a4t', -0.02)} to={T.s('a5a', LEAD)} />
        </>
      );
    },
  },
  {
    img: 'S7',
    from: T.s('a5a', LEAD),
    to: T.s('a5t', -0.25),
    keys: [
      {at: 0, cam: cam(0.53, 0.5, 1.08, 540, 860)},
      {at: T.s('a5b', -0.1), cam: cam(0.4, 0.54, 1.38, 520, 860), dur: 12},
    ],
    overlay: ({at}) => {
      const lf = at(S7lf.x, S7lf.y);
      return <Note x={lf.x + 220} y={lf.y - 250} ax={lf.x + 30} ay={lf.y - 110} text="種類まで指定" from={T.s('a5b', 0.35)} to={T.s('a5t', -0.25)} />;
    },
  },
  {
    img: 'S8',
    from: T.s('a5t', -0.25),
    to: T.s('twist', LEAD),
    keys: [
      {at: 0, cam: cam(0.5, 0.44, 1.24, 540, 720)},
      {at: T.s('a5t', -0.25), cam: cam(0.5, 0.44, 1.1, 540, 745), dur: 7},
    ],
    drift: 0.05,
    overlay: () => <Frost from={T.s('a5t', -0.25)} to={T.s('twist', LEAD)} />,
  },
  {img: 'S9', from: T.s('twist', LEAD), to: T.s('ask', LEAD), keys: [{at: 0, cam: cam(0.5965, 0.368, 1.18, 560, 790)}], drift: 0.07},
  {img: 'S10', from: T.s('ask', LEAD), to: T.total, keys: [{at: 0, cam: cam(0.5, 0.45, 1.0, 540, 840)}], drift: 0.05},
];

const SceneView: React.FC<{sc: Scene}> = ({sc}) => {
  const frame = useCurrentFrame();
  if (frame < sc.from || frame >= sc.to) return null;
  const c = camAt(frame, sc.keys, sc.from, sc.to, sc.drift ?? 0.04);
  const pl = placeCam(c);
  // 切り替わりの瞬間に少しだけ寄って戻る（テンポ感）
  const punch = sc.punch === false ? 1 : 1 + 0.035 * (1 - ramp(frame, sc.from, sc.from + 6));
  // 「冷めるでしょ」の入りは小さく揺らす
  const shake = sc.img === 'S8' ? (1 - ramp(frame, sc.from, sc.from + 8)) * 10 : 0;
  const s = pl.w / 1536;
  const at = (nx: number, ny: number) => ({x: pl.left + nx * pl.w, y: pl.top + ny * pl.h});
  return (
    <AbsoluteFill style={{transform: `scale(${punch}) translate(${wobble(frame, 1, shake)}px, ${wobble(frame, 2, shake)}px)`}}>
      <Img src={staticFile(`img/${sc.img}.jpg`)} style={{position: 'absolute', left: pl.left, top: pl.top, width: pl.w, height: pl.h}} />
      {sc.overlay?.({frame, at, s})}
    </AbsoluteFill>
  );
};

type Line = {id: string; text: string; sub?: string; aside?: boolean; item?: number; telop?: string};
const LINES = script.lines as Line[];
const TELOPS = (script as unknown as {telops: Record<string, string>}).telops;

export const Video: React.FC = () => {
  const frame = useCurrentFrame();
  // いま何番目のあるあるか（ヘッダーの①〜⑤）
  const itemStarts = LINES.filter((l) => l.item).map((l) => ({n: l.item as number, at: T.s(l.id, LEAD)}));
  const afterAll = T.s('twist', LEAD);
  let item = 0;
  let since = 0;
  for (const it of itemStarts) {
    if (frame >= it.at) {
      item = it.n;
      since = it.at;
    }
  }
  if (frame >= afterAll) {
    item = 6;
    since = afterAll;
  }
  // 字幕：行の話し始めから次の行の直前まで（最初の行は題字が兼ねる、最後の行は話し終わりまで）。
  // 場面が切り替わるときは、前の字幕が次の絵に残らないよう切り替わりで消す
  const cuts = SCENES.map((sc) => sc.from).filter((f) => f > 0);
  const subs = LINES.map((l, i) => {
    const next = LINES[i + 1];
    const from = T.s(l.id, -0.04);
    const cut = Math.min(...cuts.filter((f) => f > from), T.total);
    const to = Math.min(cut, next ? Math.min(T.s(next.id, -0.04), T.e(l.id, 0.6)) : T.e(l.id, 0.15));
    return {l, from, to};
  });
  // 番号テロップ：その番号の最初の行から、次の番号（またはオチ）の直前まで
  const items = LINES.filter((l) => l.item);
  return (
    <AbsoluteFill style={{backgroundColor: C.cream}}>
      {SCENES.map((sc) => (
        <SceneView key={sc.img} sc={sc} />
      ))}
      {/* 上下を少し暗くして文字を読みやすく */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(40,25,20,0.28) 0%, rgba(40,25,20,0) 26%, rgba(40,25,20,0) 70%, rgba(40,25,20,0.22) 100%)'}} />
      <Header item={item} since={since} />
      <HookTitle from={0} to={T.s('promise', LEAD)} sub={T.s('hook', 0.95)} />
      <Telop text={TELOPS.promise} from={T.s('promise', LEAD)} to={T.s('a1', LEAD)} />
      {items.map((l, i) => {
        const next = items[i + 1];
        const to = next ? T.s(next.id, LEAD) : T.s('a5t', -0.25);
        return <Telop key={l.id} num={l.item} text={l.telop as string} from={T.s(l.id, LEAD)} to={to} />;
      })}
      <Telop text={TELOPS.twist} from={T.s('twist', LEAD)} to={T.s('ask', LEAD)} />
      {subs
        .filter(({l}) => l.id !== 'hook')
        .map(({l, from, to}) => (
          <Subtitle key={l.id} text={l.sub ?? l.text} aside={l.aside} from={from} to={to} cy={l.id === 'ask' ? 1330 : 1262} />
        ))}
      <Poll a={T.s('ask', 0.62)} b={T.s('ask', 1.18)} hint={T.e('ask', 0.15)} to={T.total} top={292} cy={1330} />
    </AbsoluteFill>
  );
};

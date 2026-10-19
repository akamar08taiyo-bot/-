// 本編。場面・カメラ・テロップの時刻はすべて台本の行（T.s / T.e）から決める。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import '../fonts';
import script from '../../episodes/honne01/script.json';
import faces from '../../episodes/honne01/faces.json';
import timeline from '../../episodes/honne01/timeline.json';
import {Boso, C, Frost, Header, HookTitle, Meter, Note, Poll, Subtitle, Telop} from '../parts';
import {makeT, ramp} from '../lib';
import {Line, Scene, SceneView, cam, center, currentItem, faceOf, subtitleSpans, Box} from '../scene';

export const timelineHonne01 = timeline;
const T = makeT(timeline);

const face = (scene: string, who: string) => faceOf(faces, scene, who);

const LEAD = -0.15; // 絵は声より少し先に出す
const S1 = face('S1', 'WIFE');
const S3w = face('S3', 'WIFE');
const S4w = face('S4', 'WIFE');
const S6w = face('S6', 'WIFE');
const S7lf = center((faces as unknown as {S7_extra: {leaflet: Box}}).S7_extra.leaflet);

const SCENES: Scene[] = [
  {img: 'honne01/img/S1.jpg', from: 0, to: T.s('promise', LEAD), keys: [{at: 0, cam: cam(S1.x, S1.y, 1.3, 540, 560)}], drift: 0.04},
  {img: 'honne01/img/S2.jpg', from: T.s('promise', LEAD), to: T.s('a1', LEAD), keys: [{at: 0, cam: cam(0.502, 0.435, 1.0, 540, 830)}], drift: 0.07},
  {
    img: 'honne01/img/S3.jpg',
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
    img: 'honne01/img/S4.jpg',
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
  {img: 'honne01/img/S5.jpg', from: T.s('a3', LEAD), to: T.s('a4', LEAD), keys: [{at: 0, cam: cam(0.6, 0.36, 1.12, 560, 760)}], drift: 0.06},
  {
    img: 'honne01/img/S6.jpg',
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
    img: 'honne01/img/S7.jpg',
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
    img: 'honne01/img/S8.jpg',
    from: T.s('a5t', -0.25),
    to: T.s('twist', LEAD),
    keys: [
      {at: 0, cam: cam(0.5, 0.44, 1.24, 540, 720)},
      {at: T.s('a5t', -0.25), cam: cam(0.5, 0.44, 1.1, 540, 745), dur: 7},
    ],
    drift: 0.05,
    shake: 10,
    overlay: () => <Frost from={T.s('a5t', -0.25)} to={T.s('twist', LEAD)} />,
  },
  {img: 'honne01/img/S9.jpg', from: T.s('twist', LEAD), to: T.s('ask', LEAD), keys: [{at: 0, cam: cam(0.5965, 0.368, 1.18, 560, 790)}], drift: 0.07},
  {img: 'honne01/img/S10.jpg', from: T.s('ask', LEAD), to: T.total, keys: [{at: 0, cam: cam(0.5, 0.45, 1.0, 540, 840)}], drift: 0.05},
];

const LINES = script.lines as Line[];
const TELOPS = (script as unknown as {telops: Record<string, string>}).telops;

export const Honne01: React.FC = () => {
  const frame = useCurrentFrame();
  const {item, since} = currentItem(frame, LINES, T, LEAD, T.s('twist', LEAD));
  const subs = subtitleSpans(LINES, SCENES, T);
  // 番号テロップ：その番号の最初の行から、次の番号（またはオチ）の直前まで
  const items = LINES.filter((l) => l.item);
  return (
    <AbsoluteFill style={{backgroundColor: C.cream}}>
      {SCENES.map((sc) => (
        <SceneView key={sc.img} sc={sc} />
      ))}
      {/* 上下を少し暗くして文字を読みやすく */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(40,25,20,0.28) 0%, rgba(40,25,20,0) 26%, rgba(40,25,20,0) 70%, rgba(40,25,20,0.22) 100%)'}} />
      <Header episode="夫に冷めた瞬間" item={item} since={since} />
      <HookTitle
        from={0}
        to={T.s('promise', LEAD)}
        sub={T.s('hook', 0.95)}
        pill="覚えてますか？"
        lines={[
          {text: '夫に', size: 104, color: C.ink, stroke: 20},
          {text: '冷めた瞬間', size: 168, color: C.ice, stroke: 24, shadow: 'drop-shadow(0 10px 0 rgba(30,50,90,0.35))'},
        ]}
      />
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
      <Poll labels={['買う', '買わない']} a={T.s('ask', 0.62)} b={T.s('ask', 1.18)} hint={T.e('ask', 0.15)} to={T.total} top={292} cy={1330} />
    </AbsoluteFill>
  );
};

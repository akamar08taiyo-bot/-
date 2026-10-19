// 本音あるある #2「本気で離婚を考えた瞬間」（#1 の過激版）。場面・カメラ・テロップの時刻はすべて台本の行から決める。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import '../fonts';
import script from '../../episodes/honne02/script.json';
import faces from '../../episodes/honne02/faces.json';
import timeline from '../../episodes/honne02/timeline.json';
import {Boso, C, Header, HookTitle, Poll, Subtitle, Telop} from '../parts';
import {DivorceForm, GoalMeter, Menace, NameTag, NoteStamp, PriceTag} from '../props';
import {makeT, ramp} from '../lib';
import {Box, Line, Scene, SceneView, cam, center, currentItem, faceOf, subtitleSpans} from '../scene';

export const timelineHonne02 = timeline;
const T = makeT(timeline);
const LEAD = -0.15; // 絵は声より少し先に出す
// 行の中の語の頭など（script.json の marks。効果音も同じ時刻を使う）
const MARKS = (script as unknown as {marks: Record<string, [string, 's' | 'e', number]>}).marks;
const M = (k: string, off = 0) => {
  const [id, w, o] = MARKS[k];
  return w === 's' ? T.s(id, o + off) : T.e(id, o + off);
};
const F = faces as unknown as Record<string, unknown>;
const face = (scene: string, who: string) => faceOf(F, scene, who);
const box = (scene: string, who: string) => {
  const f = (F[scene] as {who: string; box: Box}[]).find((v) => v.who === who);
  if (!f) throw new Error(`faces.json に ${scene} の ${who} がありません`);
  return {top: f.box[0] / 1000, left: f.box[1] / 1000, bottom: f.box[2] / 1000, right: f.box[3] / 1000};
};
const TAG = {WIFE: '#E8A33A', HUSBAND: '#2E4A86', 'MOTHER-IN-LAW': '#9B7BC4'} as const;
type At = (nx: number, ny: number) => {x: number; y: number};
/** 名札を置く場所：頭の上がテロップにかかるときは、顔の横（収まるほう）に。名札の幅は文字数から見込む */
const tagPlace = (at: At, scene: string, who: string, text: string): {x: number; y: number; side: 'top' | 'left' | 'right'} => {
  const b = box(scene, who);
  const top = at((b.left + b.right) / 2, b.top - 0.01);
  const w = 40 * [...text].length + 70;
  const l = at(b.left, (b.top + b.bottom) / 2);
  const r = at(b.right, (b.top + b.bottom) / 2);
  if (top.y > 560 && top.x - w / 2 > 16 && top.x + w / 2 < 1064) return {...top, side: 'top'};
  if (l.x - 6 - w > 16) return {x: l.x - 6, y: l.y, side: 'left'};
  if (r.x + 6 + w < 1064) return {x: r.x + 6, y: r.y, side: 'right'};
  return {x: Math.min(1064 - w / 2, Math.max(16 + w / 2, top.x)), y: Math.max(top.y, 560), side: 'top'};
};
// ボソッのあと、失言ノートに「記録」（次の場面に変わるまで）
const recorded = (aside: string, next: string) => (
  <NoteStamp x={820} y={1060} scale={0.72} rot={8} from={T.e(aside, -0.15)} to={T.s(next, LEAD)} />
);
const bag = center((F.X5_extra as {bag: Box}).bag);

const X1 = face('X1', 'WIFE');
const X3w = face('X3', 'WIFE');
const X4w = face('X4', 'WIFE');
const X5w = face('X5', 'WIFE');
const X6w = face('X6', 'WIFE');
const X7h = face('X7', 'HUSBAND');
const X9w = face('X9', 'WIFE');
const X10w = face('X10', 'WIFE');
// 最後の問いかけの絵：新しく作れたらそれ、なければ #1 の絵を顔に寄せて使う
const X10img = (F.X10_new ? 'honne02/img/X10.jpg' : 'honne01/img/S10.jpg') as string;

const SCENES: Scene[] = [
  // 夜の食卓で離婚届に向かう妻（題字）
  {
    img: 'honne02/img/X1.jpg',
    from: 0,
    to: T.s('promise', LEAD),
    keys: [{at: 0, cam: cam(X1.x, X1.y, 1.2, 540, 500)}],
    drift: 0.04,
  },
  // 目が笑っていない笑顔（#1 の絵）
  {img: 'honne01/img/S2.jpg', from: T.s('promise', LEAD), to: T.s('a1', LEAD), keys: [{at: 0, cam: cam(0.502, 0.435, 1.0, 540, 830)}], drift: 0.07},
  {
    img: 'honne02/img/X3.jpg',
    from: T.s('a1', LEAD),
    to: T.s('a2', LEAD),
    keys: [
      {at: 0, cam: cam(0.5, 0.42, 1.1, 540, 820)},
      {at: T.s('a1t', -0.12), cam: cam(X3w.x, X3w.y, 1.7, 560, 820), dur: 9},
    ],
    overlay: ({at}) => {
      const p = at(X3w.x + 0.13, X3w.y - 0.07);
      const t = tagPlace(at, 'X3', 'HUSBAND', '夫・まもる（46）');
      const w = tagPlace(at, 'X3', 'WIFE', '妻・しのぶ（44）');
      return (
        <>
          <NameTag {...t} text="夫・まもる（46）" color={TAG.HUSBAND} from={T.s('a1', 0.1)} to={T.s('a1t', -0.12)} />
          <NameTag {...w} text="妻・しのぶ（44）" color={TAG.WIFE} from={T.s('a1', 0.35)} to={T.s('a1t', -0.12)} />
          <Boso x={p.x} y={p.y} from={T.s('a1t', -0.02)} to={T.s('a2', LEAD)} />
          {recorded('a1t', 'a2')}
        </>
      );
    },
  },
  // 熱で寝込む妻とドアの夫（#1 の絵）
  {
    img: 'honne01/img/S4.jpg',
    from: T.s('a2', LEAD),
    to: T.s('a3', LEAD),
    keys: [
      {at: 0, cam: cam(0.5, 0.43, 1.08, 540, 830)},
      {at: T.s('a2t', -0.12), cam: cam(X4w.x, X4w.y, 1.65, 560, 860), dur: 9},
    ],
    overlay: ({at}) => {
      const p = at(0.8, 0.44);
      return (
        <>
          <Boso x={p.x} y={p.y} from={T.s('a2t', -0.02)} to={T.s('a3', LEAD)} />
          {recorded('a2t', 'a3')}
        </>
      );
    },
  },
  {
    img: 'honne02/img/X5.jpg',
    from: T.s('a3', LEAD),
    to: T.s('a4', LEAD),
    keys: [
      {at: 0, cam: cam(0.5, 0.45, 1.08, 540, 830)},
      {at: T.s('a3t', -0.12), cam: cam(X5w.x, X5w.y, 1.6, 560, 820), dur: 9},
    ],
    overlay: ({at, s}) => {
      const tag = at(bag.x, bag.y - 0.08);
      const p = at(X5w.x + 0.13, X5w.y - 0.06);
      return (
        <>
          <PriceTag x={tag.x} y={tag.y} text="10万円" from={M('price')} to={T.s('a3t', -0.12)} scale={Math.min(1.2, s / 0.75)} />
          <Boso x={p.x} y={p.y} from={T.s('a3t', -0.02)} to={T.s('a4', LEAD)} />
          {recorded('a3t', 'a4')}
        </>
      );
    },
  },
  {
    img: 'honne02/img/X6.jpg',
    from: T.s('a4', LEAD),
    to: T.s('a5a', LEAD),
    keys: [
      {at: 0, cam: cam(0.5, 0.44, 1.05, 540, 820)},
      {at: T.s('a4t', -0.12), cam: cam(X6w.x, X6w.y, 1.7, 560, 820), dur: 9},
    ],
    overlay: ({at}) => {
      const p = at(X6w.x + 0.12, X6w.y - 0.07);
      const t = tagPlace(at, 'X6', 'MOTHER-IN-LAW', '義母・よしえ（72）');
      return (
        <>
          <NameTag {...t} text="義母・よしえ（72）" color={TAG['MOTHER-IN-LAW']} from={T.s('a4', 0.1)} to={T.s('a4t', -0.12)} />
          <Boso x={p.x} y={p.y} from={T.s('a4t', -0.02)} to={T.s('a5a', LEAD)} />
          {recorded('a4t', 'a5a')}
        </>
      );
    },
  },
  // 「誰のおかげで」：言い出したら夫の顔に寄って、ゴゴゴ…
  {
    img: 'honne02/img/X7.jpg',
    from: T.s('a5a', LEAD),
    to: T.s('a5t', -0.25),
    keys: [
      {at: 0, cam: cam(0.5, 0.45, 1.05, 540, 840)},
      {at: T.s('a5b', -0.1), cam: cam(X7h.x, X7h.y, 1.6, 540, 760), dur: 8},
    ],
    overlay: () => (
      <Menace
        from={T.s('a5b', -0.1)}
        to={T.s('a5t', -0.25)}
        spots={[
          {x: 150, y: 560, size: 120, rot: -12},
          {x: 935, y: 640, size: 140, rot: 10},
          {x: 120, y: 1010, size: 105, rot: -6},
          {x: 960, y: 1080, size: 125, rot: 14},
        ]}
      />
    ),
  },
  // 山場1：「……はい。」凍った真顔（#1 の絵）
  {
    img: 'honne01/img/S8.jpg',
    from: T.s('a5t', -0.25),
    to: M('form', -0.05),
    keys: [
      {at: 0, cam: cam(0.5, 0.44, 1.24, 540, 760)},
      {at: T.s('a5t', -0.25), cam: cam(0.5, 0.44, 1.1, 540, 800), dur: 7},
    ],
    drift: 0.04,
    shake: 10,
    overlay: ({frame}) => {
      const from = T.s('a5t', -0.25);
      const dark = ramp(frame, from, from + 10);
      return (
        <>
          <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(10,20,40,0) 45%, rgba(10,20,45,${0.55 * dark}) 100%)`}} />
          <NoteStamp x={800} y={470} scale={1.1} rot={10} from={M('record')} to={M('form', -0.05)} />
        </>
      );
    },
  },
  // 山場2：「離婚届、もう書いてあります」夜の食卓（冒頭の絵をぼかす）に記入済みの用紙
  {
    img: 'honne02/img/X1.jpg',
    from: M('form', -0.05),
    to: T.s('twist', LEAD),
    keys: [{at: 0, cam: cam(0.5, 0.6, 1.25, 540, 960)}],
    drift: 0.03,
    filter: 'blur(14px) brightness(0.55) saturate(0.8)',
    overlay: () => <DivorceForm x={540} y={800} scale={1.42} from={M('form', -0.05)} to={T.s('twist', LEAD)} stampAt={M('stamp')} />,
  },
  {
    img: 'honne02/img/X9.jpg',
    from: T.s('twist', LEAD),
    to: T.s('ask', LEAD),
    keys: [{at: 0, cam: cam(X9w.x, X9w.y, 1.15, 540, 900)}],
    drift: 0.07,
    overlay: () => (
      <GoalMeter x={540} y={540} from={T.s('twist', LEAD)} to={T.s('ask', LEAD)} level={2 / 3} ticks={['100万', '200万', '目標300万']} note="あと100万" label="へそくり" />
    ),
  },
  // こちらを見て問いかける妻
  {img: X10img, from: T.s('ask', LEAD), to: T.total, keys: [{at: 0, cam: cam(X10w.x, X10w.y, F.X10_new ? 1.1 : 1.8, 540, 800)}], drift: 0.05},
];

const LINES = script.lines as Line[];
const TELOPS = (script as unknown as {telops: Record<string, string>}).telops;

export const Honne02: React.FC = () => {
  const frame = useCurrentFrame();
  const {item, since} = currentItem(frame, LINES, T, LEAD, T.s('twist', LEAD));
  const subs = subtitleSpans(LINES, SCENES, T);
  const items = LINES.filter((l) => l.item);
  return (
    <AbsoluteFill style={{backgroundColor: C.cream}}>
      {SCENES.map((sc) => (
        <SceneView key={sc.img + sc.from} sc={sc} />
      ))}
      {/* 上下を少し暗くして文字を読みやすく */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(40,25,20,0.3) 0%, rgba(40,25,20,0) 26%, rgba(40,25,20,0) 70%, rgba(40,25,20,0.22) 100%)'}} />
      <Header series="しのぶの失言ノート" episode="#2 離婚を考えた瞬間" item={item} since={since} />
      <HookTitle
        from={0}
        to={T.s('promise', LEAD)}
        sub={T.s('hook', 1.1)}
        pill="ありますか？"
        top={690}
        lines={[
          {text: '本気で', size: 92, color: C.ink, stroke: 18},
          {text: '離婚', size: 236, color: C.red, stroke: 32, shadow: 'drop-shadow(0 12px 0 rgba(90,20,30,0.35))', mb: -28},
          {text: 'を考えた瞬間', size: 104, color: C.ink, stroke: 20},
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
      <Poll labels={['すぐ出す', '貯まるまで待つ']} size={58} a={M('pollA')} b={M('pollB')} hint={T.e('ask', 0.15)} to={T.total} top={292} cy={1330} />
    </AbsoluteFill>
  );
};

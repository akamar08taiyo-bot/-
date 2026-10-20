// わが家の情報戦 #1「夫婦の心理戦」：夫婦の日常の駆け引きを、スパイドラマのように大まじめに撮る。
// 登場人物はオリジナル（実在の俳優やドラマの登場人物には似せない）。場面・カメラ・字幕の時刻は台本の行から決める。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {F} from '../fonts';
import script from '../../episodes/spy01/script.json';
import faces from '../../episodes/spy01/faces.json';
import timeline from '../../episodes/spy01/timeline.json';
import {Header, Outlined} from '../parts';
import {NameTag} from '../props';
import {AlarmTint, BigWords, CineSub, Countdown, MissionBar, Receipt, SPY, Stamp} from '../spy';
import {clamp01, makeT, pop, ramp} from '../lib';
import {Box, Line, Scene, SceneView, cam, center, currentItem, faceOf, subtitleSpans} from '../scene';

export const timelineSpy01 = timeline;
const S = script as unknown as {header: {series: string; episode: string}};
const T = makeT(timeline);
const LEAD = -0.12; // 絵は声より少し先に切り替える
const MARKS = (script as unknown as {marks: Record<string, [string, 's' | 'e', number]>}).marks;
const M = (k: string, off = 0) => {
  const [id, w, o] = MARKS[k];
  return w === 's' ? T.s(id, o + off) : T.e(id, o + off);
};
const FC = faces as unknown as Record<string, unknown>;
const face = (scene: string, who: string) => faceOf(FC, scene, who);
const box = (scene: string, who: string) => {
  const f = (FC[scene] as {who: string; box: Box}[]).find((v) => v.who === who);
  if (!f) throw new Error(`faces.json に ${scene} の ${who} がありません`);
  return {top: f.box[0] / 1000, left: f.box[1] / 1000, bottom: f.box[2] / 1000, right: f.box[3] / 1000};
};
type At = (nx: number, ny: number) => {x: number; y: number};
/** 名札：頭の上が上の帯にかかるときは顔の横に（#2 と同じ置き方） */
const tagPlace = (at: At, scene: string, who: string, text: string): {x: number; y: number; side: 'top' | 'left' | 'right'} => {
  const b = box(scene, who);
  const top = at((b.left + b.right) / 2, b.top - 0.01);
  const w = 40 * [...text].length + 70;
  const l = at(b.left, (b.top + b.bottom) / 2);
  const r = at(b.right, (b.top + b.bottom) / 2);
  if (top.y > 500 && top.x - w / 2 > 16 && top.x + w / 2 < 1064) return {...top, side: 'top'};
  if (l.x - 6 - w > 16) return {x: l.x - 6, y: l.y, side: 'left'};
  if (r.x + 6 + w < 1064) return {x: r.x + 6, y: r.y, side: 'right'};
  return {x: Math.min(1064 - w / 2, Math.max(16 + w / 2, top.x)), y: Math.max(top.y, 500), side: 'top'};
};
const WHO: Record<string, {label?: string; color?: string; inner?: boolean}> = {
  narr: {},
  wife: {label: '妻・玲子', color: SPY.red},
  husband: {label: '夫・誠', color: SPY.steel},
  inner: {label: '夫の中の「もう一人の自分」', color: SPY.teal, inner: true},
  mil: {label: '義母・千鶴', color: '#B8860B'},
};
const TAG = {wife: '#B5402F', husband: '#5C6B7A', mil: '#B8860B'};

const P1w = face('P1', 'WIFE');
const P2w = face('P2', 'WIFE');
const P3w = face('P3', 'WIFE');
const P4h = face('P4', 'HUSBAND');
const P4w = face('P4', 'WIFE');
const P5h = face('P5', 'HUSBAND');
const P5g = face('P5', 'HUSBAND_GHOST');
const P6w = face('P6', 'WIFE');
const P7w = face('P7', 'WIFE');
const dict = center((FC.P7_extra as {dictionary: Box}).dictionary);
const P8m = face('P8', 'MOTHER-IN-LAW');
const P9w = face('P9', 'WIFE');
const P10w = face('P10', 'WIFE');
// 発見までのカウントダウン：「3秒」の言い終わりから 0.3 秒ごとに1つ減って、0 で「発見」
const TICKS = [0, 0.3, 0.6].map((o) => M('count', o));
const FOUND = M('count', 0.9);

const SCENES: Scene[] = [
  // 夜のリビングで、夫の写真とレシートを赤い糸でつないだ捜査ボードの前に立つ妻（題字。1コマ目がサムネ）
  {img: 'spy01/img/P1.jpg', from: 0, to: T.s('m1', LEAD), keys: [{at: 0, cam: cam(P1w.x, P1w.y, 1.3, 560, 520)}], drift: 0.05, punch: false},
  // 任務１：レシートを虫めがねで調べる妻と、ドアの陰の夫。名札を出してから妻に寄る
  {
    img: 'spy01/img/P3.jpg',
    from: T.s('m1', LEAD),
    to: T.s('m2h', LEAD),
    keys: [
      {at: 0, cam: cam(0.52, 0.42, 1.1, 540, 760)},
      {at: T.s('m1w', -0.1), cam: cam(P3w.x, P3w.y, 1.2, 700, 560), dur: 8},
    ],
    overlay: ({at}) => {
      const w = tagPlace(at, 'P3', 'WIFE', '捜査官｜妻・玲子（43）');
      const h = tagPlace(at, 'P3', 'HUSBAND', '対象｜夫・誠（45）');
      return (
        <>
          <NameTag {...h} text="対象｜夫・誠（45）" color={TAG.husband} from={T.s('m1', 0.1)} to={T.s('m1w', -0.1)} />
          <NameTag {...w} text="捜査官｜妻・玲子（43）" color={TAG.wife} from={T.s('m1', 0.35)} to={T.s('m1w', -0.1)} />
        </>
      );
    },
  },
  // 任務２：取り調べ。夫 → 妻 → 引きの絵で「自白」
  {
    img: 'spy01/img/P4.jpg',
    from: T.s('m2h', LEAD),
    to: T.s('m3w', LEAD),
    keys: [
      {at: 0, cam: cam(P4h.x, P4h.y, 1.4, 520, 680)},
      {at: T.s('m2w', -0.1), cam: cam(P4w.x, P4w.y, 1.45, 600, 620), dur: 6},
      {at: T.s('m2n', -0.1), cam: cam(0.5, 0.42, 1.08, 540, 760), dur: 6},
    ],
    shake: 6,
  },
  // 任務３：「ねえ、ちょっといい？」食卓の妻
  {img: 'spy01/img/P2.jpg', from: T.s('m3w', LEAD), to: T.s('m3i', LEAD), keys: [{at: 0, cam: cam(P2w.x, P2w.y, 1.5, 600, 660)}], drift: 0.08},
  // 夫の頭の中：もう一人の自分が囁く（警報）
  {
    img: 'spy01/img/P5.jpg',
    from: T.s('m3i', LEAD),
    to: T.s('m3w2', LEAD),
    keys: [{at: 0, cam: cam((P5h.x + P5g.x) / 2, (P5h.y + P5g.y) / 2, 1.35, 540, 680)}],
    drift: 0.09,
    shake: 8,
  },
  // 拍子抜け：燃えないゴミの袋を持った妻（普通の明るさ）
  {img: 'spy01/img/P6.jpg', from: T.s('m3w2', LEAD), to: T.s('m4', LEAD), keys: [{at: 0, cam: cam(P6w.x, P6w.y, 1.35, 540, 640)}], drift: 0.04, filter: 'brightness(1.18) saturate(1.05)'},
  // 任務４：辞書からへそくり。発見まで 3 秒
  {
    img: 'spy01/img/P7.jpg',
    from: T.s('m4', LEAD),
    to: T.s('t1', LEAD),
    keys: [
      {at: 0, cam: cam(dict.x, dict.y, 1.3, 520, 1060)},
      {at: T.s('m4w', -0.1), cam: cam(P7w.x, P7w.y, 1.45, 620, 620), dur: 8},
    ],
  },
  // 最終任務：口の軽い義母（名札は「情報屋」）
  {
    img: 'spy01/img/P8.jpg',
    from: T.s('t1', LEAD),
    to: T.s('t2', LEAD),
    keys: [{at: 0, cam: cam(P8m.x, P8m.y, 1.35, 520, 660)}],
    drift: 0.07,
    shake: 6,
    overlay: ({at}) => {
      const m = tagPlace(at, 'P8', 'MOTHER-IN-LAW', '情報屋｜義母・千鶴（70）');
      return <NameTag {...m} text="情報屋｜義母・千鶴（70）" color={TAG.mil} from={T.s('t1', 0.5)} to={T.s('t1m', -0.1)} />;
    },
  },
  // 「敵か。味方か。」暗くした絵に大きな文字
  {img: 'spy01/img/P9.jpg', from: T.s('t2', LEAD), to: T.s('t2w', LEAD), keys: [{at: 0, cam: cam(P9w.x, P9w.y, 1.2, 540, 760)}], drift: 0.05, filter: 'blur(10px) brightness(0.35) saturate(0.7)'},
  // そっとへそくりを戻す妻（少し照れている）
  {img: 'spy01/img/P9.jpg', from: T.s('t2w', LEAD), to: T.s('ask', LEAD), keys: [{at: 0, cam: cam(P9w.x, P9w.y, 1.25, 600, 640)}], drift: 0.06},
  // 問いかけ：辞書を抱えて、こちらを見る妻
  {img: 'spy01/img/P10.jpg', from: T.s('ask', LEAD), to: T.total, keys: [{at: 0, cam: cam(P10w.x, P10w.y, 1.15, 540, 620)}], drift: 0.05},
];

// ───────── 冒頭の題字（最初から見えている） ─────────
const HookSpy: React.FC<{to: number}> = ({to}) => {
  const frame = useCurrentFrame();
  if (frame >= to) return null;
  const sp = pop(frame, 0, 13, 260);
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 900, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
        <Outlined size={84} color="#fff" stroke={16} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 6px 14px rgba(0,0,0,0.6))">
          夫婦の心理戦を
        </Outlined>
        <Outlined size={128} color="#fff" stroke={22} strokeColor={SPY.red} font={F.dela} weight={400} shadow="drop-shadow(0 10px 16px rgba(0,0,0,0.55))">
          スパイドラマ風に
        </Outlined>
        <Outlined size={84} color="#fff" stroke={16} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 6px 14px rgba(0,0,0,0.6))">
          してみたら…
        </Outlined>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 860,
          top: 860,
          transform: `translate(-50%, -50%) rotate(14deg) scale(${frame === 0 ? 1 : 2 - sp})`,
          border: `8px solid ${SPY.red}`,
          borderRadius: 14,
          color: SPY.red,
          background: 'rgba(255,255,255,0.9)',
          fontFamily: F.dela,
          fontSize: 64,
          padding: '0 18px 6px',
          boxShadow: '0 8px 18px rgba(0,0,0,0.4)',
        }}
      >
        極秘
      </div>
    </>
  );
};

// 問いかけ（あなたの家の情報屋は？）とコメントへの誘い
const Ask: React.FC<{from: number; to: number}> = ({from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 12, 220);
  const cta = pop(frame, from + 18, 11, 210);
  return (
    <div style={{position: 'absolute', left: 0, top: 1060, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
      <div style={{transform: `scale(${1.5 - 0.5 * p})`, opacity: clamp01(p * 3)}}>
        <Outlined size={80} color="#fff" stroke={16} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 6px 14px rgba(0,0,0,0.6))">
          あなたの家の「情報屋」は？
        </Outlined>
      </div>
      {frame >= from + 18 && (
        <div style={{transform: `scale(${0.6 + 0.4 * cta})`, background: SPY.red, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 46, padding: '10px 36px 14px', borderRadius: 999, boxShadow: '0 6px 0 rgba(0,0,0,0.25)'}}>
          コメントで教えて ↓
        </div>
      )}
    </div>
  );
};

const LINES = (script as unknown as {lines: (Line & {who: string})[]}).lines;
const TELOPS = (script as unknown as {telops: Record<string, string>}).telops;

export const Spy01: React.FC = () => {
  const frame = useCurrentFrame();
  const {item, since} = currentItem(frame, LINES, T, LEAD, T.s('t2', LEAD));
  const subs = subtitleSpans(LINES, SCENES, T);
  const items = LINES.filter((l) => l.item);
  return (
    <AbsoluteFill style={{backgroundColor: SPY.ink}}>
      {SCENES.map((sc) => (
        <SceneView key={sc.img + sc.from} sc={sc} />
      ))}
      {/* 上下を暗くして文字を読みやすく（映画のような締まり） */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(8,10,16,0.55) 0%, rgba(8,10,16,0) 24%, rgba(8,10,16,0) 58%, rgba(8,10,16,0.55) 100%)'}} />
      <AlarmTint from={T.s('m3i', LEAD)} to={T.s('m3w2', LEAD)} />
      <Stamp text="自白" x={790} y={700} at={T.s('m2n', 0.9)} to={T.s('m3w', LEAD)} size={110} />
      <Stamp text="会議、解散" x={540} y={760} at={T.e('m3w2', -0.35)} to={T.s('m4', LEAD)} size={80} rot={-8} />
      <Receipt x={265} y={1000} from={T.s('m1w', -0.05)} to={T.s('m2h', LEAD)} time="12:04" item="からあげ棒" price="¥216" markAt={T.s('m1w', 0.6)} />
      <Countdown x={540} y={740} from={T.e('m4', -0.35)} to={FOUND + 6} ticks={TICKS} label="発見まで" />
      <Stamp text="発見" x={560} y={780} at={FOUND} to={T.s('m4w', 0.9)} size={130} rot={-10} />
      <BigWords
        words={[
          {text: '敵か。', at: M('teki')},
          {text: '味方か。', at: M('mikata'), color: '#FFE3A3'},
        ]}
        to={T.s('t2w', LEAD)}
        cy={900}
      />
      <HookSpy to={T.s('m1', LEAD)} />
      {items.map((l, i) => {
        const next = items[i + 1];
        const to = next ? T.s(next.id, LEAD) : T.s('t2', LEAD);
        return <MissionBar key={l.id} num={l.item as number} final={l.item === 5} title={TELOPS[String(l.item)]} from={T.s(l.id, LEAD)} to={to} />;
      })}
      {subs
        .filter(({l}) => l.id !== 't2')
        .map(({l, from, to}) => {
          const w = WHO[(l as Line & {who: string}).who] ?? {};
          return <CineSub key={l.id} text={l.sub ?? l.text} label={w.label} color={w.color} inner={w.inner} from={from} to={to} cy={l.id === 'hook' ? 1440 : 1310} />;
        })}
      <Ask from={T.e('ask', 0.05)} to={T.total} />
      <Header series={S.header.series} episode={S.header.episode} item={item} since={since} accent={SPY.red} soft="#9b5560" />
    </AbsoluteFill>
  );
};

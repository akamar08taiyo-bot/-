// しのぶの失言ノート #3「夫の失言ランキングTOP10」。声も音もなし（音楽は投稿のときに YouTube で足す）。
// 区切りも演出も BPM の拍で決める：1つの順位は8拍（BPM120 で4秒）、3位と2位は10拍、1位は溜めを入れて14拍。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {F} from '../fonts';
import script from '../../episodes/honne03/script.json';
import faces from '../../episodes/honne03/faces.json';
import {C, Header, Outlined} from '../parts';
import {DivorceForm, Menace} from '../props';
import {ChatScreen, CountStamp, NotePage, QuoteCard, RankBadge, RankStrip, Tsukkomi} from '../ranking';
import {FPS, W, clamp01, life, pop, ramp} from '../lib';
import {Box, Scene, SceneView, cam, center, faceOf} from '../scene';

type Rank = {rank: number; beats: number; build?: number; quote: string; note?: string; chat?: string; count: number; tsukkomi: string; img: string; face: string};
type Part = {beats: number; img: string; face: string};
const S = script as unknown as {
  bpm: number;
  header: {series: string; episode: string};
  hook: Part & {chip: string};
  ranks: Rank[];
  hof: Part & {label: string; quote: string; note: string};
  end: Part & {q: string; cta: string};
};
const BEAT = (FPS * 60) / S.bpm; // 1拍のフレーム数（BPM120 で 15）

// 区切り：拍の数から始まりと終わりのフレーム。b(n) はその区切りの n 拍目
type Seg = {id: string; from: number; to: number; b: (n: number) => number};
const SEGS: Seg[] = [];
let cursor = 0;
const addSeg = (id: string, beats: number) => {
  const from = cursor;
  cursor += Math.round(beats * BEAT);
  SEGS.push({id, from, to: cursor, b: (n) => from + Math.round(n * BEAT)});
};
addSeg('hook', S.hook.beats);
S.ranks.forEach((r) => addSeg(`r${r.rank}`, r.beats));
addSeg('hof', S.hof.beats);
addSeg('end', S.end.beats);
export const durationHonne03 = cursor;
const seg = (id: string) => SEGS.find((s) => s.id === id) as Seg;

const FC = faces as unknown as Record<string, unknown>;
const face = (scene: string, who: string) => faceOf(FC, scene, who);
const socks = center((FC.R1_extra as {socks: Box}).socks);

// 拍の割り振り：失言カード → ツッコミ（妻の顔に寄る）→ 記録回数のはんこ
const plan = (r: Rank) => {
  const s = seg(`r${r.rank}`);
  if (r.build) {
    const R = r.build; // 溜めのあと、この拍で発表
    return {s, reveal: s.b(R), quote: s.b(R + 1), roll: s.b(R + 1.5), stamp: s.b(R + 4), tsukkomi: s.b(R + 5)};
  }
  const long = r.beats >= 10;
  return {s, reveal: s.from, quote: s.b(1), roll: undefined, stamp: s.b(long ? 7 : 6), tsukkomi: s.b(long ? 5 : 4)};
};

// 絵ごとのカメラ：はじめは夫（言った人）、ツッコミで妻に寄る
const ZOOM: Record<string, {h: number; w: number; start?: {x: number; y: number}}> = {
  X6: {h: 1.35, w: 1.6},
  R8: {h: 1.3, w: 1.55},
  S1: {h: 1.2, w: 1.55, start: {x: 0.66, y: 0.47}},
  R6: {h: 1.25, w: 1.55},
  R5: {h: 1.12, w: 1.6, start: {x: 0.42, y: 0.42}},
  R4: {h: 1.3, w: 1.55},
  R3: {h: 1.3, w: 1.55},
  S6: {h: 1.3, w: 1.6},
  R1: {h: 1.25, w: 1.5},
};

const rankScene = (r: Rank): Scene => {
  const {s, reveal, tsukkomi} = plan(r);
  if (r.chat) {
    // 9位：夜の食卓の絵をぼかして、チャット画面
    const w = face(r.face, 'WIFE');
    return {img: r.img, from: s.from, to: s.to, keys: [{at: s.from, cam: cam(w.x, w.y, 1.3, 540, 760)}], drift: 0.05, filter: 'blur(12px) brightness(0.6) saturate(0.85)'};
  }
  const z = ZOOM[r.face];
  const h = z.start ?? face(r.face, 'HUSBAND');
  const w = face(r.face, 'WIFE');
  const keys = [
    {at: reveal, cam: cam(h.x, h.y, z.h, 540, 720)},
    {at: tsukkomi - 2, cam: cam(w.x, w.y, z.w, 560, 720), dur: 6},
  ];
  // 1位：ツッコミでは肩の靴下に寄る
  if (r.rank === 1) keys[1] = {at: tsukkomi - 2, cam: cam(socks.x, socks.y, 1.55, 560, 760), dur: 6};
  return {img: r.img, from: reveal, to: s.to, keys, drift: 0.05, punch: true};
};

const X1 = face('X1', 'WIFE');
const X7h = face('X7', 'HUSBAND');
const X10w = face('X10', 'WIFE');
const SCENES: Scene[] = [
  {img: S.hook.img, from: 0, to: seg('hook').to, keys: [{at: 0, cam: cam(X1.x, X1.y, 1.3, 560, 560)}], drift: 0.04, punch: false},
  ...S.ranks.map(rankScene),
  {img: S.hof.img, from: seg('hof').from, to: seg('hof').to, keys: [{at: seg('hof').from, cam: cam(X7h.x, X7h.y, 1.35, 400, 700)}], drift: 0.05},
  {img: S.end.img, from: seg('end').from, to: seg('end').to, keys: [{at: seg('end').from, cam: cam(X10w.x, X10w.y, 1.1, 540, 800)}], drift: 0.04, filter: 'blur(7px) brightness(0.72)'},
];

// 切り替わりの白いフラッシュ（拍の頭を目で感じさせる）
const Flash: React.FC<{at: number; strength?: number}> = ({at, strength = 0.55}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= at + 5) return null;
  return <AbsoluteFill style={{background: '#fff', opacity: strength * (1 - ramp(frame, at, at + 5))}} />;
};

// ───────── 冒頭（1コマ目がそのままサムネになる。最初から全部見えている） ─────────
const HookTitle3: React.FC<{to: number; chip: string}> = ({to, chip}) => {
  const frame = useCurrentFrame();
  if (frame >= to) return null;
  const h = seg('hook');
  const bump = [h.b(2), h.b(4)].reduce((v, at) => v + 0.05 * (frame >= at ? 1 - ramp(frame, at, at + 6) : 0), 1);
  const tp = 1 + 0.12 * (frame >= h.b(2) ? 1 - ramp(frame, h.b(2), h.b(2) + 8) : 0);
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 760, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${bump})`}}>
        <Outlined size={112} color={C.ink} stroke={20} font={F.dela} weight={400}>
          夫の
        </Outlined>
        <div style={{marginTop: -30}}>
          <Outlined size={262} color={C.red} stroke={34} font={F.dela} weight={400} shadow="drop-shadow(0 12px 0 rgba(90,20,30,0.35))">
            失言
          </Outlined>
        </div>
        <div style={{marginTop: -34}}>
          <Outlined size={128} color={C.ink} stroke={22} font={F.dela} weight={400}>
            ランキング
          </Outlined>
        </div>
      </div>
      {/* TOP10 のシール */}
      <div
        style={{
          position: 'absolute',
          left: 905,
          top: 860,
          width: 230,
          height: 230,
          marginLeft: -115,
          marginTop: -115,
          borderRadius: 115,
          background: '#F0A91B',
          border: '10px solid #fff',
          boxShadow: '0 10px 0 rgba(120,70,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: F.dela,
          lineHeight: 1,
          transform: `rotate(12deg) scale(${tp})`,
          boxSizing: 'border-box',
        }}
      >
        <span style={{fontSize: 50}}>TOP</span>
        <span style={{fontSize: 112}}>10</span>
      </div>
      <div style={{position: 'absolute', left: 0, top: 1372, width: W, display: 'flex', justifyContent: 'center'}}>
        <div style={{background: '#22201f', color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 44, padding: '12px 34px 16px', borderRadius: 999, boxShadow: '0 6px 0 rgba(0,0,0,0.2)'}}>
          {chip}
        </div>
      </div>
    </>
  );
};

// ───────── 1位の前の溜め：「第1位は…」と「記録 1,000回超え」 ─────────
const Build: React.FC<{from: number; to: number; b: (n: number) => number}> = ({from, to, b}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const beatsIn = [0, 1, 2, 3].map((n) => b(n));
  const pulse = beatsIn.reduce((v, at) => v + 0.06 * (frame >= at ? 1 - ramp(frame, at, at + 7) : 0), 1);
  const cp = pop(frame, b(2), 12, 230);
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 48%, #3a2a44 0%, #17111c 70%)', alignItems: 'center', justifyContent: 'center'}}>
      {beatsIn.map((at, i) =>
        frame >= at ? (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: W / 2 - 300,
              top: 860 - 300,
              width: 600,
              height: 600,
              borderRadius: 300,
              border: '6px solid rgba(240,169,27,0.8)',
              opacity: 0.8 * (1 - ramp(frame, at, at + 14)),
              transform: `scale(${0.5 + 0.9 * ramp(frame, at, at + 14)})`,
            }}
          />
        ) : null,
      )}
      <div style={{position: 'absolute', top: 860, left: 0, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${pulse})`}}>
        <Outlined size={150} color="#F0A91B" stroke={24} strokeColor="#2a1c08" font={F.dela} weight={400} shadow="drop-shadow(0 0 30px rgba(240,169,27,0.55))">
          第1位は…
        </Outlined>
      </div>
      {frame >= b(2) && (
        <div style={{position: 'absolute', top: 1080, left: 0, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(cp * 2), transform: `scale(${1.6 - 0.6 * cp})`}}>
          <div style={{border: `7px solid ${C.red}`, borderRadius: 16, color: C.red, background: 'rgba(255,255,255,0.94)', fontFamily: F.dela, fontSize: 58, padding: '4px 26px 10px', transform: 'rotate(-6deg)'}}>
            記録 1,000回超え
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// 1位：肩の靴下を赤い丸で囲む
const SockCircle: React.FC<{at: number; to: number}> = ({at, to}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= to) return null;
  // ツッコミのカメラ（靴下を 1.55 倍で画面の真ん中あたりに置く）で、靴下が見える位置
  const p = ramp(frame, at, at + 8);
  const r = 135;
  const len = 2 * Math.PI * r;
  const [cx, cy] = [552, 722];
  return (
    <svg style={{position: 'absolute', left: cx - r - 20, top: cy - r - 20, opacity: life(frame, at, to, 1, 3)}} width={2 * r + 40} height={2 * r + 40}>
      <ellipse cx={r + 20} cy={r + 20} rx={r} ry={r * 0.82} fill="none" stroke={C.red} strokeWidth={12} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} transform={`rotate(-14 ${r + 20} ${r + 20})`} />
    </svg>
  );
};

const QUOTE_Y = 1120;
const TSUK_Y = 1352;
const BADGE = {x: 420, y: 345};
const STAMP = {x: 840, y: 352};

export const Honne03: React.FC = () => {
  const frame = useCurrentFrame();
  const cur = SEGS.find((s) => frame >= s.from && frame < s.to) ?? SEGS[SEGS.length - 1];
  const rankNow = cur.id.startsWith('r') ? Number(cur.id.slice(1)) : cur.id === 'hook' ? 11 : 0;
  const r1 = S.ranks.find((r) => r.rank === 1) as Rank;
  const stripSince = rankNow === 1 ? plan(r1).reveal : cur.from;
  const hof = seg('hof');
  const end = seg('end');
  return (
    <AbsoluteFill style={{backgroundColor: C.cream}}>
      {SCENES.map((sc) => (
        <SceneView key={sc.img + sc.from} sc={sc} />
      ))}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(40,25,20,0.32) 0%, rgba(40,25,20,0) 26%, rgba(40,25,20,0) 62%, rgba(40,25,20,0.3) 100%)'}} />
      <Build from={seg('r1').from} to={plan(r1).reveal} b={seg('r1').b} />
      {S.ranks.map((r) => {
        const p = plan(r);
        return (
          <React.Fragment key={r.rank}>
            <RankBadge rank={r.rank} x={BADGE.x} y={BADGE.y} from={p.reveal} to={p.s.to} />
            {r.chat ? (
              <ChatScreen name="まもる" mine={r.chat} reply={r.quote} cx={540} cy={800} from={p.s.from} to={p.s.to} replyAt={p.quote} />
            ) : (
              <QuoteCard text={r.quote} note={r.note} cy={QUOTE_Y} from={p.quote} to={p.s.to} />
            )}
            <Tsukkomi text={r.tsukkomi} cy={TSUK_Y} from={p.tsukkomi} to={p.s.to} />
            <CountStamp x={STAMP.x} y={STAMP.y} count={r.count} from={p.roll ?? p.stamp} to={p.s.to} rollTo={p.roll === undefined ? undefined : p.stamp} />
            {r.rank === 1 && <SockCircle at={p.tsukkomi + 4} to={p.s.to} />}
          </React.Fragment>
        );
      })}
      {/* 殿堂入り：回数ではなく、重さで別格 */}
      <Menace
        from={hof.b(1)}
        to={hof.to}
        spots={[
          {x: 120, y: 560, size: 110, rot: -12},
          {x: 960, y: 470, size: 110, rot: 10},
          {x: 100, y: 900, size: 100, rot: -6},
        ]}
      />
      {frame >= hof.from && frame < hof.to && (
        <div style={{position: 'absolute', left: 0, top: 345, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${1.7 - 0.7 * pop(frame, hof.from, 12, 230)})`}}>
          <Outlined size={132} color="#F0A91B" stroke={24} font={F.dela} weight={400} shadow="drop-shadow(0 8px 0 rgba(120,70,0,0.45))">
            {S.hof.label}
          </Outlined>
        </div>
      )}
      <DivorceForm x={800} y={700} scale={0.6} from={hof.b(5)} to={hof.to} stampAt={hof.b(6)} />
      <QuoteCard text={S.hof.quote} cy={1060} from={hof.b(1)} to={hof.to} max={76} />
      <Tsukkomi text={S.hof.note} cy={TSUK_Y} from={hof.b(4)} to={hof.to} />
      {/* 締め：TOP10 を失言ノートに書き出して、問いかけ */}
      <NotePage
        x={520}
        top={300}
        w={860}
        title="夫の失言 TOP10"
        rows={[...S.ranks].sort((a, b) => a.rank - b.rank).map((r) => ({rank: r.rank, quote: r.quote, count: r.count}))}
        rowAt={(rank) => end.b((10 - rank) * 0.45)}
        from={end.from}
        to={end.to}
      />
      {frame >= end.b(5) && (
        <div style={{position: 'absolute', left: 0, top: 1300, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${1.5 - 0.5 * pop(frame, end.b(5), 12, 230)})`}}>
          <Outlined size={78} color={C.navy} stroke={18} font={F.dela} weight={400}>
            {S.end.q}
          </Outlined>
        </div>
      )}
      {frame >= end.b(6) && (
        <div style={{position: 'absolute', left: 0, top: 1420, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${0.6 + 0.4 * pop(frame, end.b(6), 11, 210)})`}}>
          <div style={{background: C.coral, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 46, padding: '10px 36px 14px', borderRadius: 999, boxShadow: '0 6px 0 rgba(60,40,30,0.2)'}}>
            {S.end.cta} ↓
          </div>
        </div>
      )}
      <HookTitle3 to={seg('hook').to} chip={S.hook.chip} />
      {SEGS.filter((s) => s.id !== 'hook').map((s) => (
        <Flash key={s.id} at={s.from} />
      ))}
      <Flash at={plan(r1).reveal} strength={0.85} />
      <Header series={S.header.series} episode={S.header.episode} item={0} since={0} dots={false} />
      <RankStrip cur={rankNow} since={stripSince} />
    </AbsoluteFill>
  );
};

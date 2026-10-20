// しのぶの失言ノートのランキング回（#4 から）の共通の作り。episodes/<回>/script.json の順位を10位から並べるだけで作れる。
// 声も音もなし（音楽は投稿のときに YouTube で足す）。区切りも演出も BPM の拍で決める：1つの順位は8拍（BPM120 で4秒）、
// 3位と2位は10拍、1位は溜め（build 拍）を入れて14拍。絵は public からの場所、カメラは faces.json の顔か物に寄る。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {C, Header, Outlined} from './parts';
import {DivorceForm, Menace} from './props';
import {ChatScreen, CountStamp, NotePage, QuoteCard, RankBadge, RankStrip, Tsukkomi} from './ranking';
import {FPS, W, clamp01, life, placeCam, pop, ramp} from './lib';
import {Box, Scene, SceneView, cam, center, faceOf} from './scene';

// カメラ：on = [場面, 人]（faces.json の顔）、obj = [場面, 物]（faces.json の <場面>_extra）、どちらも無ければ x, y（0〜1）。
// z は寄り、tx, ty はそこを画面のどこに置くか
export type RCam = {on?: [string, string]; obj?: [string, string]; x?: number; y?: number; z?: number; tx?: number; ty?: number};
type Part = {beats: number; img: string; cam: RCam};
type Chat = {mine: string; name?: string; times?: [string, string]};
export type RRank = {
  rank: number;
  beats: number;
  build?: number; // 1位の前の溜め（拍）
  quote: string; // 失言（チャットの順位は返信）。| で改行
  short?: string; // まとめのノートに書く短い形（無ければ quote）
  note?: string;
  chat?: Chat; // あれば失言カードの代わりにチャット画面（背景の絵はぼかす）
  count: number;
  tsukkomi: string;
  img: string;
  cam: RCam; // はじめ（言った人に寄る）
  cam2?: RCam; // ツッコミで寄る先（無ければ同じ絵の妻）
  quoteY?: number;
  circle?: [string, string]; // ツッコミのあと赤い丸で囲む物 [場面, 物]（cam2 がその物に寄っていること）
};
export type RScript = {
  id: string;
  bpm: number;
  who?: string; // 失言カードの札（既定は「夫・まもる」）
  header: {series: string; episode: string};
  hook: Part & {title: [string, string, string]; chip: string};
  ranks: RRank[];
  build: {stamp: string}; // 1位の溜めに押すはんこ（例「記録 1,000回超え」）
  hof?: Part & {label: string; quote: string; chat?: Chat; note: string; form?: boolean};
  end: Part & {title: string; unit?: string; q: string; cta: string};
};

const QUOTE_Y = 1120;
const TSUK_Y = 1352;
const BADGE = {x: 420, y: 345};
const STAMP = {x: 840, y: 352};
const CHAT_BLUR = 'blur(12px) brightness(0.6) saturate(0.85)';

// 切り替わりの白いフラッシュ（拍の頭を目で感じさせる）
const Flash: React.FC<{at: number; strength?: number}> = ({at, strength = 0.55}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= at + 5) return null;
  return <AbsoluteFill style={{background: '#fff', opacity: strength * (1 - ramp(frame, at, at + 5))}} />;
};

// ───────── 冒頭の題字（1コマ目がそのままサムネになる。最初から全部見えている） ─────────
const HookTitle: React.FC<{title: [string, string, string]; chip: string; to: number; b: (n: number) => number}> = ({title, chip, to, b}) => {
  const frame = useCurrentFrame();
  if (frame >= to) return null;
  const bump = [b(2), b(4)].reduce((v, at) => v + 0.05 * (frame >= at ? 1 - ramp(frame, at, at + 6) : 0), 1);
  const tp = 1 + 0.12 * (frame >= b(2) ? 1 - ramp(frame, b(2), b(2) + 8) : 0);
  const bigSize = Math.min(262, Math.floor(900 / [...title[1]].length));
  const lowSize = Math.min(128, Math.floor(940 / [...title[2]].length));
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 760, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${bump})`}}>
        <Outlined size={112} color={C.ink} stroke={20} font={F.dela} weight={400}>
          {title[0]}
        </Outlined>
        <div style={{marginTop: -30 * (bigSize / 262)}}>
          <Outlined size={bigSize} color={C.red} stroke={Math.round(bigSize * 0.13)} font={F.dela} weight={400} shadow="drop-shadow(0 12px 0 rgba(90,20,30,0.35))">
            {title[1]}
          </Outlined>
        </div>
        <div style={{marginTop: -34 * (bigSize / 262)}}>
          <Outlined size={lowSize} color={C.ink} stroke={Math.round(lowSize * 0.17)} font={F.dela} weight={400}>
            {title[2]}
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

// ───────── 1位の前の溜め：「第1位は…」とはんこ ─────────
const Build: React.FC<{from: number; to: number; b: (n: number) => number; stamp: string}> = ({from, to, b, stamp}) => {
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
          <div style={{border: `7px solid ${C.red}`, borderRadius: 16, color: C.red, background: 'rgba(255,255,255,0.94)', fontFamily: F.dela, fontSize: 58, padding: '4px 26px 10px', transform: 'rotate(-6deg)', whiteSpace: 'nowrap'}}>
            {stamp}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ツッコミのあと、物を赤い丸で囲む（cx, cy, r は画面の上の位置と大きさ）
const Circle: React.FC<{at: number; to: number; cx: number; cy: number; r: number}> = ({at, to, cx, cy, r}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= to) return null;
  const p = ramp(frame, at, at + 8);
  const len = 2 * Math.PI * r;
  return (
    <svg style={{position: 'absolute', left: cx - r - 20, top: cy - r - 20, opacity: life(frame, at, to, 1, 3)}} width={2 * r + 40} height={2 * r + 40}>
      <ellipse cx={r + 20} cy={r + 20} rx={r} ry={r * 0.82} fill="none" stroke={C.red} strokeWidth={12} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} transform={`rotate(-14 ${r + 20} ${r + 20})`} />
    </svg>
  );
};

export const makeRanking = (S: RScript, FC: Record<string, unknown>) => {
  const BEAT = (FPS * 60) / S.bpm; // 1拍のフレーム数（BPM120 で 15）
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
  if (S.hof) addSeg('hof', S.hof.beats);
  addSeg('end', S.end.beats);
  const seg = (id: string) => SEGS.find((s) => s.id === id) as Seg;

  const extra = (scene: string, obj: string) => (FC[`${scene}_extra`] as Record<string, Box>)[obj];
  const point = (c: RCam) => (c.on ? faceOf(FC, c.on[0], c.on[1]) : c.obj ? center(extra(c.obj[0], c.obj[1])) : {x: c.x ?? 0.5, y: c.y ?? 0.45});
  const camOf = (c: RCam, z = 1.3, tx = 540, ty = 720) => {
    const p = point(c);
    return cam(p.x, p.y, c.z ?? z, c.tx ?? tx, c.ty ?? ty);
  };
  const tsukCam = (r: RRank): RCam => r.cam2 ?? {on: [r.cam.on?.[0] ?? r.cam.obj?.[0] ?? '', 'WIFE']};

  // 拍の割り振り：失言カード → ツッコミ（妻の顔に寄る）→ 記録回数のはんこ
  const plan = (r: RRank) => {
    const s = seg(`r${r.rank}`);
    if (r.build) {
      const R = r.build; // 溜めのあと、この拍で発表
      return {s, reveal: s.b(R), quote: s.b(R + 1), roll: s.b(R + 1.5) as number | undefined, stamp: s.b(R + 4), tsukkomi: s.b(R + 5)};
    }
    const long = r.beats >= 10;
    return {s, reveal: s.from, quote: s.b(1), roll: undefined as number | undefined, stamp: s.b(long ? 7 : 6), tsukkomi: s.b(long ? 5 : 4)};
  };

  const rankScene = (r: RRank): Scene => {
    const {s, reveal, tsukkomi} = plan(r);
    if (r.chat) return {img: r.img, from: reveal, to: s.to, keys: [{at: reveal, cam: camOf(r.cam, 1.3, 540, 760)}], drift: 0.05, filter: CHAT_BLUR};
    const keys = [
      {at: reveal, cam: camOf(r.cam)},
      {at: tsukkomi - 2, cam: camOf(tsukCam(r), 1.55, 560, 720), dur: 6},
    ];
    return {img: r.img, from: reveal, to: s.to, keys, drift: 0.05, punch: true};
  };
  // 赤い丸：ツッコミのカメラで、物が画面のどこに来るか
  const circleAt = (r: RRank) => {
    if (!r.circle) return null;
    const box = extra(r.circle[0], r.circle[1]);
    const pl = placeCam(camOf(tsukCam(r), 1.55, 560, 720));
    const c = center(box);
    const size = Math.max(box[2] - box[0], box[3] - box[1]) / 1000;
    return {cx: pl.left + c.x * pl.w, cy: pl.top + c.y * pl.h, r: Math.max(90, Math.min(220, (size * pl.w) / 2 + 30))};
  };

  const hof = S.hof ? seg('hof') : undefined;
  const end = seg('end');
  const SCENES: Scene[] = [
    {img: S.hook.img, from: 0, to: seg('hook').to, keys: [{at: 0, cam: camOf(S.hook.cam, 1.3, 560, 560)}], drift: 0.04, punch: false},
    ...S.ranks.map(rankScene),
    ...(S.hof && hof
      ? [{img: S.hof.img, from: hof.from, to: hof.to, keys: [{at: hof.from, cam: camOf(S.hof.cam, 1.35, 400, 700)}], drift: 0.05, filter: S.hof.chat ? CHAT_BLUR : undefined}]
      : []),
    {img: S.end.img, from: end.from, to: end.to, keys: [{at: end.from, cam: camOf(S.end.cam, 1.1, 540, 800)}], drift: 0.04, filter: 'blur(7px) brightness(0.72)'},
  ];
  const r1 = S.ranks.find((r) => r.rank === 1) as RRank;

  const Comp: React.FC = () => {
    const frame = useCurrentFrame();
    const cur = SEGS.find((s) => frame >= s.from && frame < s.to) ?? SEGS[SEGS.length - 1];
    const rankNow = cur.id.startsWith('r') ? Number(cur.id.slice(1)) : cur.id === 'hook' ? 11 : 0;
    const stripSince = rankNow === 1 ? plan(r1).reveal : cur.from;
    return (
      <AbsoluteFill style={{backgroundColor: C.cream}}>
        {SCENES.map((sc) => (
          <SceneView key={sc.img + sc.from} sc={sc} />
        ))}
        <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(40,25,20,0.32) 0%, rgba(40,25,20,0) 26%, rgba(40,25,20,0) 62%, rgba(40,25,20,0.3) 100%)'}} />
        <Build from={seg('r1').from} to={plan(r1).reveal} b={seg('r1').b} stamp={S.build.stamp} />
        {S.ranks.map((r) => {
          const p = plan(r);
          const ci = circleAt(r);
          return (
            <React.Fragment key={r.rank}>
              <RankBadge rank={r.rank} x={BADGE.x} y={BADGE.y} from={p.reveal} to={p.s.to} />
              {r.chat ? (
                <ChatScreen name={r.chat.name ?? 'まもる'} mine={r.chat.mine} reply={r.quote} times={r.chat.times} cx={540} cy={800} from={p.reveal} to={p.s.to} replyAt={p.quote} />
              ) : (
                <QuoteCard text={r.quote} note={r.note} who={S.who} cy={r.quoteY ?? QUOTE_Y} from={p.quote} to={p.s.to} />
              )}
              <Tsukkomi text={r.tsukkomi} cy={TSUK_Y} from={p.tsukkomi} to={p.s.to} />
              <CountStamp x={STAMP.x} y={STAMP.y} count={r.count} from={p.roll ?? p.stamp} to={p.s.to} rollTo={p.roll === undefined ? undefined : p.stamp} />
              {ci && <Circle at={p.tsukkomi + 4} to={p.s.to} cx={ci.cx} cy={ci.cy} r={ci.r} />}
            </React.Fragment>
          );
        })}
        {/* 殿堂入り：回数ではなく、重さで別格 */}
        {S.hof && hof && (
          <>
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
            {S.hof.form && <DivorceForm x={800} y={700} scale={0.6} from={hof.b(5)} to={hof.to} stampAt={hof.b(6)} />}
            {S.hof.chat ? (
              <ChatScreen name={S.hof.chat.name ?? 'まもる'} mine={S.hof.chat.mine} reply={S.hof.quote} times={S.hof.chat.times} cx={540} cy={820} from={hof.b(0.5)} to={hof.to} replyAt={hof.b(2)} />
            ) : (
              <QuoteCard text={S.hof.quote} who={S.who} cy={1060} from={hof.b(1)} to={hof.to} max={76} />
            )}
            <Tsukkomi text={S.hof.note} cy={TSUK_Y} from={hof.b(4)} to={hof.to} />
          </>
        )}
        {/* 締め：TOP10 を失言ノートに書き出して、問いかけ */}
        <NotePage
          x={520}
          top={300}
          w={860}
          title={S.end.title}
          unit={S.end.unit}
          rows={[...S.ranks].sort((a, b) => a.rank - b.rank).map((r) => ({rank: r.rank, quote: r.short ?? r.quote, count: r.count}))}
          rowAt={(rank) => end.b((10 - rank) * 0.45)}
          from={end.from}
          to={end.to}
        />
        {frame >= end.b(5) && (
          <div style={{position: 'absolute', left: 0, top: 1300, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${1.5 - 0.5 * pop(frame, end.b(5), 12, 230)})`}}>
            <Outlined size={Math.min(78, Math.floor(980 / [...S.end.q].length))} color={C.navy} stroke={18} font={F.dela} weight={400}>
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
        <HookTitle title={S.hook.title} chip={S.hook.chip} to={seg('hook').to} b={seg('hook').b} />
        {SEGS.filter((s) => s.id !== 'hook').map((s) => (
          <Flash key={s.id} at={s.from} />
        ))}
        <Flash at={plan(r1).reveal} strength={0.85} />
        <Header series={S.header.series} episode={S.header.episode} item={0} since={0} dots={false} />
        <RankStrip cur={rankNow} since={stripSince} />
      </AbsoluteFill>
    );
  };
  return {Comp, duration: cursor};
};

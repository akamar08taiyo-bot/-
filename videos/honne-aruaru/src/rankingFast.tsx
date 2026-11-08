// 実際の調査をもとにした「高速TOP10」の共通の作り。10位から2位までをサクサク見せ、1位は動画では明かさず固定コメントへ。
// 声も音もなし（音楽は投稿のときに YouTube で足す）。1つの順位は6拍（BPM120 で3秒）、3位と2位は7拍。
// 順位と割合は調査の数字そのまま。出典は最初から最後まで画面の上に出し、イラストとひと言は再現イメージと書く。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {C, Header, Outlined} from './parts';
import {CountStamp, RankBadge, RankStrip, Tsukkomi} from './ranking';
import {FPS, W, clamp01, life, pop, ramp} from './lib';
import {Box, Scene, SceneView, cam, center, faceOf} from './scene';
import type {RCam} from './rankingEp';

export type FRank = {
  rank: number;
  beats: number;
  item: string; // 調査の選択肢の言葉そのまま。| で改行
  value: number; // 調査の数字（割合なら 39.4）
  tsukkomi?: string; // ひと言（再現）。| で改行
  img?: string; // 絵（public からの場所）。無い順位は emoji と bg の色の画面にする
  cam?: RCam;
  emoji?: string; // 絵の代わりの大きな絵文字（しのぶの出ない回）
  bg?: [string, string]; // 絵文字の画面の背景のグラデーション（上, 下）
  todo?: boolean; // 元の調査でまだ確かめていない順位（finish.py はこれが残っていると書き出しを止める）
};
export type FScript = {
  id: string;
  bpm: number;
  header: {series: string; episode: string};
  source: string; // 出典の1行（画面の上にずっと出す）
  note?: string; // 例「※イラスト・ひと言は再現イメージです」
  value: {label: string; unit: string; decimals: number}; // はんこの見出しと単位（例：回答 / % / 1）
  itemLabel?: string; // 項目のカードの札（例「妻が挙げた理由」）
  tsukLabel?: string; // ひと言の吹き出しの札（既定は「しのぶ」）
  hook: {beats: number; img?: string; cam?: RCam; emoji?: string[]; bg?: [string, string]; title: [string, string, string]; chip: string};
  ranks: FRank[]; // 10位〜2位（同率の順位は同じ数字を続けて書く。区切りは並びの順で数える）
  bonus?: FBonus; // 番外編（2位のあと、1位の発表の前）
  top: {beats: number; img?: string; cam?: RCam; cta: string; sub?: string};
};

// 番外編：ランキングのあと、同じ調査のほかの数字から「ここを押さえれば」という、さらに大事なポイントを見せる。
// 数字は調査のまま（どの質問の答えかを札に書く）。まとめの言葉は、調査元のまとめか「編集部のまとめ」と書く。
export type FPoint = {
  beats: number;
  label: string; // 項目のカードの札（どの質問の答えか。例「離婚を考えた1,805人のうち」）
  item: string; // 調査の答えの言葉。| で改行
  value?: number; // 調査の数字（無いカードは、はんこを出さない）
  stamp?: {label: string; unit: string; decimals: number}; // はんこの見出しと単位（既定は S.value）
  sub?: string; // ひと言。| で改行
  subLabel?: string; // ひと言の札（既定「ひとこと」）
  emoji: string;
  bg?: [string, string];
};
export type FBonus = {
  title: {beats: number; title: [string, string, string]; chip: string; emoji?: string[]; bg?: [string, string]};
  points: FPoint[];
  key: {beats: number; head: string; text: string; note?: string; emoji?: string; bg?: [string, string]};
};

const TSUK_Y = 1395;
const BADGE = {x: 420, y: 395};
const STAMP = {x: 840, y: 402};
const ITEM_Y = 1120;

// 切り替わりの白いフラッシュ（拍の頭を目で感じさせる）
const Flash: React.FC<{at: number; strength?: number}> = ({at, strength = 0.5}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= at + 4) return null;
  return <AbsoluteFill style={{background: '#fff', opacity: strength * (1 - ramp(frame, at, at + 4))}} />;
};

const fitSize = (lines: string[], width: number, max: number) => Math.min(max, Math.floor(width / Math.max(...lines.map((l) => [...l].length), 1)));

// 出典：最初から最後まで、順位の帯のすぐ下に小さく
const SourceLine: React.FC<{source: string; note?: string}> = ({source, note}) => (
  <div style={{position: 'absolute', top: 266, left: 0, width: W, display: 'flex', justifyContent: 'center'}}>
    <div
      style={{
        maxWidth: 1000,
        background: 'rgba(34,32,31,0.72)',
        color: '#fff',
        fontFamily: F.maru,
        fontWeight: 700,
        fontSize: 22,
        lineHeight: 1.35,
        padding: '4px 16px 6px',
        borderRadius: 10,
        textAlign: 'center',
      }}
    >
      {source}
      {note && <span style={{opacity: 0.8}}>　{note}</span>}
    </div>
  </div>
);

// 調査の選択肢のカード（言葉は調査のまま。かぎかっこは付けない）
const ItemCard: React.FC<{text: string; label?: string; cy: number; from: number; to: number; todo?: boolean}> = ({text, label, cy, from, to, todo}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const lines = text.split('|');
  const fs = fitSize(lines, 800, 96);
  const p = pop(frame, from, 9, 240);
  return (
    <div style={{position: 'absolute', left: 0, width: W, top: cy, display: 'flex', justifyContent: 'center', opacity: life(frame, from, to, 2, 2)}}>
      <div
        style={{
          position: 'relative',
          transform: `translateY(-50%) scale(${0.55 + 0.45 * p})`,
          background: todo ? '#ffe0e0' : '#fff',
          border: todo ? `6px dashed ${C.red}` : 'none',
          borderRadius: 30,
          padding: '30px 46px 28px',
          maxWidth: 940,
          minWidth: label ? Math.min(940, [...label].length * 32 + 110) : undefined,
          boxShadow: '0 10px 0 rgba(30,40,80,0.22), 0 18px 30px rgba(20,20,40,0.25)',
          textAlign: 'center',
        }}
      >
        {label && (
          <div style={{position: 'absolute', top: -26, left: 30, background: C.coral, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 32, padding: '3px 20px 5px', borderRadius: 999, whiteSpace: 'nowrap'}}>
            {todo ? '未確認（元の調査で確かめる）' : label}
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} style={{fontFamily: F.dela, fontSize: fs, lineHeight: 1.22, color: C.navy, whiteSpace: 'pre'}}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

// 絵の代わりの画面（しのぶの出ない回）：グラデーションの背景に大きな絵文字。拍の頭で弾み、ゆっくり揺れる
// cy は絵文字の中心の高さ。still は最初のコマから全部見せる（冒頭＝サムネ用）
const EmojiStage: React.FC<{emoji: string[]; bg: [string, string]; from: number; to: number; b: (n: number) => number; big?: boolean; cy?: number; still?: boolean}> = ({
  emoji,
  bg,
  from,
  to,
  b,
  big = true,
  cy = 760,
  still = false,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = still ? 1 : pop(frame, from, 12, 220);
  const beatBump = [1, 2, 3, 4, 5].reduce((v, n) => v + 0.05 * (frame >= b(n) ? 1 - ramp(frame, b(n), b(n) + 6) : 0), 1);
  const t = (frame - from) / FPS;
  const main = emoji[0];
  const side = emoji.slice(1);
  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${bg[0]} 0%, ${bg[1]} 100%)`}}>
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 55%)'}} />
      {side.map((e, i) => {
        const ang = (i / Math.max(side.length, 1)) * Math.PI * 2 + 0.5 + t * 0.6;
        const r = 330;
        return (
          <div key={i} style={{position: 'absolute', left: W / 2 + Math.cos(ang) * r - 60, top: cy + Math.sin(ang) * r * 0.42 - 60, fontSize: 120, opacity: 0.85 * clamp01(p * 2), transform: `rotate(${Math.sin(t * 2 + i) * 12}deg)`}}>
            {e}
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, top: cy, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${(0.4 + 0.6 * p) * beatBump}) rotate(${Math.sin(t * 3) * 4}deg)`}}>
        <div style={{fontSize: big ? 330 : 240, lineHeight: 1, filter: 'drop-shadow(0 18px 24px rgba(40,20,30,0.3))'}}>{main}</div>
      </div>
    </AbsoluteFill>
  );
};

// 冒頭の題字（1コマ目がそのままサムネになる。最初から全部見えている）
const FastHook: React.FC<{title: [string, string, string]; chip: string; to: number; b: (n: number) => number; from?: number}> = ({title, chip, to, b, from = 0}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const enter = from > 0 ? 0.6 + 0.4 * pop(frame, from, 12, 220) : 1; // 冒頭は最初のコマから全部見せる（サムネ用）
  const bump = enter * [b(1), b(2), b(3), b(4)].reduce((v, at) => v + 0.04 * (frame >= at ? 1 - ramp(frame, at, at + 5) : 0), 1);
  const bigSize = Math.min(240, Math.floor(900 / [...title[1]].length));
  const topSize = Math.min(112, Math.floor(940 / [...title[0]].length));
  const lowSize = Math.min(150, Math.floor(940 / [...title[2]].length));
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 720, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${bump})`}}>
        <Outlined size={topSize} color={C.ink} stroke={Math.round(topSize * 0.18)} font={F.dela} weight={400}>
          {title[0]}
        </Outlined>
        <div style={{marginTop: -24 * (bigSize / 240)}}>
          <Outlined size={bigSize} color={C.red} stroke={Math.round(bigSize * 0.13)} font={F.dela} weight={400} shadow="drop-shadow(0 12px 0 rgba(90,20,30,0.35))">
            {title[1]}
          </Outlined>
        </div>
        <div style={{marginTop: -30 * (bigSize / 240)}}>
          <Outlined size={lowSize} color="#F0A91B" stroke={Math.round(lowSize * 0.16)} strokeColor="#2a1c08" font={F.dela} weight={400} shadow="drop-shadow(0 8px 0 rgba(120,70,0,0.4))">
            {title[2]}
          </Outlined>
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, top: 1392, width: W, display: 'flex', justifyContent: 'center'}}>
        <div style={{maxWidth: 980, background: '#22201f', color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 40, padding: '12px 32px 16px', borderRadius: 999, boxShadow: '0 6px 0 rgba(0,0,0,0.2)', textAlign: 'center'}}>
          {chip}
        </div>
      </div>
    </>
  );
};

// 番外編の「ポイント1」（順位の「第10位」と同じ場所。色は緑）
const POINT_FILL = '#178F7A';
const PointBadge: React.FC<{n: number; x: number; y: number; from: number; to: number}> = ({n, x, y, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 12, 230);
  const sh = 'drop-shadow(0 8px 0 rgba(10,60,50,0.4))';
  return (
    <div style={{position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'baseline', opacity: clamp01(p * 3), transform: `translate(-50%, -50%) scale(${1.7 - 0.7 * p}) rotate(${(1 - p) * -8}deg)`}}>
      <Outlined size={78} color={POINT_FILL} font={F.dela} weight={400} stroke={17} shadow={sh}>
        ポイント
      </Outlined>
      <Outlined size={184} color={POINT_FILL} font={F.dela} weight={400} stroke={24} shadow={sh}>
        {String(n)}
      </Outlined>
    </div>
  );
};

// 番外編のあいだ、順位の帯の代わりに出す札
const BonusStrip: React.FC<{text: string; since: number; top?: number}> = ({text, since, top = 214}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{position: 'absolute', top, left: 0, width: W, display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          background: POINT_FILL,
          color: '#fff',
          fontFamily: F.maru,
          fontWeight: 900,
          fontSize: 28,
          padding: '0 28px 2px',
          borderRadius: 10,
          border: '3px solid #fff',
          boxShadow: '0 4px 0 rgba(60,40,30,0.15)',
          whiteSpace: 'nowrap',
          transform: `scale(${0.9 + 0.1 * pop(frame, since)})`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

// 番外編のまとめ：「ここを押さえれば」と、大事なポイント
const BonusKey: React.FC<{from: number; to: number; b: (n: number) => number; head: string; text: string; note?: string; emoji?: string; bg?: [string, string]}> = ({
  from,
  to,
  b,
  head,
  text,
  note,
  emoji = '🔑',
  bg = ['#FFE29F', '#FFA99F'],
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const ep = pop(frame, from, 12, 220);
  const hp = pop(frame, b(0.5), 12, 230);
  const cp = pop(frame, b(1.5), 12, 220);
  const lines = text.split('|');
  const fs = fitSize(lines, 820, 108);
  const t = (frame - from) / FPS;
  const CARD_TOP = 850;
  const cardH = lines.length * fs * 1.24 + 70 + 16; // 行の高さ＋上下の余白＋枠
  const noteTop = CARD_TOP + cardH + 46;
  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${bg[0]} 0%, ${bg[1]} 100%)`}}>
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 60%)'}} />
      <div style={{position: 'absolute', left: 0, top: 545, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${0.4 + 0.6 * ep}) rotate(${Math.sin(t * 3) * 6}deg)`}}>
        <div style={{fontSize: 190, lineHeight: 1, filter: 'drop-shadow(0 14px 18px rgba(60,30,10,0.3))'}}>{emoji}</div>
      </div>
      {frame >= b(0.5) && (
        <div style={{position: 'absolute', left: 0, top: 760, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(hp * 2), transform: `translateY(-50%) scale(${1.4 - 0.4 * hp})`}}>
          <Outlined size={Math.min(104, Math.floor(940 / [...head].length))} color="#fff" stroke={20} strokeColor="#3a1d08" font={F.dela} weight={400} shadow="drop-shadow(0 8px 0 rgba(90,40,0,0.35))">
            {head}
          </Outlined>
        </div>
      )}
      {frame >= b(1.5) && (
        <div style={{position: 'absolute', left: 0, top: CARD_TOP, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(cp * 2)}}>
          <div
            style={{
              transform: `scale(${0.6 + 0.4 * cp})`,
              transformOrigin: '50% 0%',
              background: '#fff',
              borderRadius: 34,
              padding: '34px 54px 36px',
              maxWidth: 960,
              border: `8px solid ${POINT_FILL}`,
              boxShadow: '0 12px 0 rgba(10,60,50,0.25), 0 20px 34px rgba(40,20,10,0.25)',
              textAlign: 'center',
            }}
          >
            {lines.map((l, i) => (
              <div key={i} style={{fontFamily: F.dela, fontSize: fs, lineHeight: 1.24, color: C.navy, whiteSpace: 'pre'}}>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
      {note && frame >= b(1.5) && (
        <div style={{position: 'absolute', left: 0, top: noteTop, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(cp * 2)}}>
          <div style={{maxWidth: 940, background: 'rgba(34,32,31,0.78)', color: '#fff', fontFamily: F.maru, fontWeight: 700, fontSize: 32, lineHeight: 1.4, padding: '8px 26px 10px', borderRadius: 14, textAlign: 'center'}}>
            {note}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// 締め：1位は動画では明かさず、固定コメントへ
const TopTeaser: React.FC<{from: number; to: number; b: (n: number) => number; cta: string; sub?: string}> = ({from, to, b, cta, sub}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const beatsIn = [0, 1, 2, 3].map((n) => b(n));
  const pulse = beatsIn.reduce((v, at) => v + 0.06 * (frame >= at ? 1 - ramp(frame, at, at + 7) : 0), 1);
  const lp = pop(frame, b(2), 12, 230);
  const cp = pop(frame, b(4), 11, 210);
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 46%, rgba(58,42,68,0.88) 0%, rgba(23,17,28,0.96) 70%)'}}>
      <div style={{position: 'absolute', top: 600, left: 0, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${pulse})`}}>
        <Outlined size={150} color="#F0A91B" stroke={24} strokeColor="#2a1c08" font={F.dela} weight={400} shadow="drop-shadow(0 0 30px rgba(240,169,27,0.55))">
          第1位は…
        </Outlined>
      </div>
      {frame >= b(2) && (
        <div style={{position: 'absolute', top: 900, left: 0, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(lp * 2), transform: `translateY(-50%) scale(${1.5 - 0.5 * lp})`}}>
          <div style={{background: 'rgba(255,255,255,0.95)', borderRadius: 30, padding: '24px 60px 30px', textAlign: 'center', boxShadow: '0 10px 0 rgba(0,0,0,0.25)'}}>
            <div style={{fontFamily: F.dela, fontSize: 150, color: C.navy, letterSpacing: 14, lineHeight: 1.1, filter: 'blur(1px)'}}>？？？</div>
          </div>
        </div>
      )}
      {frame >= b(2) && (
        <div style={{position: 'absolute', top: 1110, left: 0, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(lp * 2)}}>
          <div style={{border: `7px solid ${C.red}`, borderRadius: 16, color: C.red, background: 'rgba(255,255,255,0.95)', fontFamily: F.dela, fontSize: 62, padding: '4px 26px 10px', transform: `rotate(-5deg) scale(${1.6 - 0.6 * lp})`, whiteSpace: 'nowrap'}}>
            固定コメントで発表中
          </div>
        </div>
      )}
      {frame >= b(4) && (
        <div style={{position: 'absolute', top: 1330, left: 0, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, transform: `scale(${0.6 + 0.4 * cp})`}}>
          <div style={{background: C.coral, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 52, padding: '12px 40px 16px', borderRadius: 999, boxShadow: '0 6px 0 rgba(60,40,30,0.25)', whiteSpace: 'nowrap'}}>{cta} ↓</div>
          {sub && (
            <Outlined size={Math.min(60, Math.floor(960 / [...sub].length))} color="#fff" stroke={14} strokeColor="#17111c" font={F.dela} weight={400}>
              {sub}
            </Outlined>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const makeFastRanking = (S: FScript, FC: Record<string, unknown>) => {
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
  S.ranks.forEach((r, i) => addSeg(`r${i}`, r.beats));
  if (S.bonus) {
    addSeg('bt', S.bonus.title.beats);
    S.bonus.points.forEach((pt, i) => addSeg(`p${i}`, pt.beats));
    addSeg('bk', S.bonus.key.beats);
  }
  addSeg('top', S.top.beats);
  const tie = (rank: number) => S.ranks.filter((r) => r.rank === rank).length > 1; // 元のグラフで同率の順位
  const seg = (id: string) => SEGS.find((s) => s.id === id) as Seg;

  const extra = (scene: string, obj: string) => (FC[`${scene}_extra`] as Record<string, Box>)[obj];
  const point = (c: RCam) => (c.on ? faceOf(FC, c.on[0], c.on[1]) : c.obj ? center(extra(c.obj[0], c.obj[1])) : {x: c.x ?? 0.5, y: c.y ?? 0.45});
  const camOf = (c: RCam, z = 1.3, tx = 540, ty = 700) => {
    const p = point(c);
    return cam(p.x, p.y, c.z ?? z, c.tx ?? tx, c.ty ?? ty);
  };

  // 絵のある区切りだけ絵の場面にする（絵の無い区切りは EmojiStage）
  const SCENES: Scene[] = [
    ...(S.hook.img ? [{img: S.hook.img, from: 0, to: seg('hook').to, keys: [{at: 0, cam: camOf(S.hook.cam ?? {}, 1.3, 560, 540)}], drift: 0.05, punch: false}] : []),
    ...S.ranks.flatMap((r, i): Scene[] => {
      const s = seg(`r${i}`);
      return r.img ? [{img: r.img, from: s.from, to: s.to, keys: [{at: s.from, cam: camOf(r.cam ?? {})}], drift: 0.08, punch: true}] : [];
    }),
    ...(S.top.img ? [{img: S.top.img, from: seg('top').from, to: seg('top').to, keys: [{at: seg('top').from, cam: camOf(S.top.cam ?? {}, 1.1, 540, 800)}], drift: 0.04, filter: 'blur(6px)'}] : []),
  ];
  const PALETTE: [string, string][] = [['#FFB199', '#FF6F91'], ['#FFD86F', '#FC6262'], ['#A1C4FD', '#C2E9FB'], ['#84FAB0', '#8FD3F4'], ['#F6D365', '#FDA085'], ['#FBC2EB', '#A6C1EE'], ['#FDCBF1', '#E6DEE9'], ['#A8EDEA', '#FED6E3'], ['#FFECD2', '#FCB69F'], ['#C1DFC4', '#DEECDD']];

  const Comp: React.FC = () => {
    const frame = useCurrentFrame();
    const cur = SEGS.find((s) => frame >= s.from && frame < s.to) ?? SEGS[SEGS.length - 1];
    const rankNow = cur.id.startsWith('r') ? S.ranks[Number(cur.id.slice(1))].rank : cur.id === 'hook' ? 11 : cur.id === 'top' ? 1 : 1.5; // 帯は表示の順位（同率なら同じ数字）。番外編は 2位まで済み
    const inBonus = cur.id === 'bt' || cur.id === 'bk' || /^p\d+$/.test(cur.id);
    return (
      <AbsoluteFill style={{backgroundColor: C.cream}}>
        {SCENES.map((sc) => (
          <SceneView key={sc.img + sc.from} sc={sc} />
        ))}
        {!S.hook.img && <EmojiStage emoji={S.hook.emoji ?? ['🏠']} bg={S.hook.bg ?? ['#FFE29F', '#FF719A']} from={0} to={seg('hook').to} b={seg('hook').b} big={false} cy={500} still />}
        {S.ranks.map((r, i) =>
          r.img ? null : <EmojiStage key={`e${i}`} emoji={[r.emoji ?? '✨']} bg={r.bg ?? PALETTE[i % PALETTE.length]} from={seg(`r${i}`).from} to={seg(`r${i}`).to} b={seg(`r${i}`).b} />,
        )}
        {S.bonus && (
          <EmojiStage emoji={S.bonus.title.emoji ?? ['🔑', '✨', '💡', '📝']} bg={S.bonus.title.bg ?? ['#FFF1B8', '#F7B267']} from={seg('bt').from} to={seg('bt').to} b={seg('bt').b} big={false} cy={500} />
        )}
        {S.bonus?.points.map((pt, i) => (
          <EmojiStage key={`pe${i}`} emoji={[pt.emoji]} bg={pt.bg ?? PALETTE[(i + 3) % PALETTE.length]} from={seg(`p${i}`).from} to={seg(`p${i}`).to} b={seg(`p${i}`).b} />
        ))}
        <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(40,25,20,0.36) 0%, rgba(40,25,20,0) 28%, rgba(40,25,20,0) 60%, rgba(40,25,20,0.3) 100%)'}} />
        {S.ranks.map((r, i) => {
          const s = seg(`r${i}`);
          return (
            <React.Fragment key={i}>
              <RankBadge rank={r.rank} x={BADGE.x} y={BADGE.y} from={s.from} to={s.to} tie={tie(r.rank)} />
              <ItemCard text={r.item} label={S.itemLabel} cy={ITEM_Y} from={s.b(0.5)} to={s.to} todo={r.todo} />
              <CountStamp x={STAMP.x} y={STAMP.y} count={r.value} from={s.b(1.5)} rollTo={s.b(2.5)} to={s.to} label={S.value.label} unit={S.value.unit} decimals={S.value.decimals} />
              {r.tsukkomi && <Tsukkomi text={r.tsukkomi} cy={TSUK_Y} from={s.b(3)} to={s.to} label={S.tsukLabel} />}
            </React.Fragment>
          );
        })}
        {S.bonus?.points.map((pt, i) => {
          const s = seg(`p${i}`);
          const st = pt.stamp ?? S.value;
          const tall = pt.item.split('|').length >= 3 ? 30 : 0;
          return (
            <React.Fragment key={`p${i}`}>
              <PointBadge n={i + 1} x={pt.value !== undefined ? BADGE.x - 20 : W / 2} y={BADGE.y} from={s.from} to={s.to} />
              <ItemCard text={pt.item} label={pt.label} cy={ITEM_Y - tall} from={s.b(0.5)} to={s.to} />
              {pt.value !== undefined && <CountStamp x={STAMP.x} y={STAMP.y} count={pt.value} from={s.b(1.5)} rollTo={s.b(2.5)} to={s.to} label={st.label} unit={st.unit} decimals={st.decimals} />}
              {pt.sub && <Tsukkomi text={pt.sub} cy={TSUK_Y + tall} from={s.b(3)} to={s.to} label={pt.subLabel ?? 'ひとこと'} />}
            </React.Fragment>
          );
        })}
        {S.bonus && <FastHook title={S.bonus.title.title} chip={S.bonus.title.chip} from={seg('bt').from} to={seg('bt').to} b={seg('bt').b} />}
        {S.bonus && (
          <BonusKey from={seg('bk').from} to={seg('bk').to} b={seg('bk').b} head={S.bonus.key.head} text={S.bonus.key.text} note={S.bonus.key.note} emoji={S.bonus.key.emoji} bg={S.bonus.key.bg} />
        )}
        <TopTeaser from={seg('top').from} to={seg('top').to} b={seg('top').b} cta={S.top.cta} sub={S.top.sub} />
        <FastHook title={S.hook.title} chip={S.hook.chip} to={seg('hook').to} b={seg('hook').b} />
        {SEGS.filter((s) => s.id !== 'hook').map((s) => (
          <Flash key={s.id} at={s.from} />
        ))}
        <Header series={S.header.series} episode={S.header.episode} item={0} since={0} dots={false} />
        {inBonus ? <BonusStrip text="番外編｜ここを押さえれば" since={seg('bt').from} /> : <RankStrip cur={rankNow} since={cur.from} />}
        <SourceLine source={S.source} note={S.note} />
      </AbsoluteFill>
    );
  };
  return {Comp, duration: cursor};
};

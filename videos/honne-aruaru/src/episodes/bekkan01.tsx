// 家庭内別班 #1「赤いプリン」：声も音もなし（曲は投稿のときに足す）。テロップだけで、夫婦の日常をスパイドラマとして見せる。
// 役どころはスパイドラマの定番（謝ってばかりの会社員と頭の中のもう一人の自分、公安のような妻、無口な協力者、組織のボス）に寄せ、
// 顔・名前・劇中のセリフは実在の作品や俳優に似せない。絵は spy01 の10枚を使う。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {F} from '../fonts';
import script from '../../episodes/bekkan01/script.json';
import faces from '../../episodes/bekkan01/faces.json';
import {Header, Outlined} from '../parts';
import {BigWords, CineSub, Dossier, Receipt, RedPudding, SPY, Stamp, VoicePhone} from '../spy';
import {FPS, clamp01, pop, ramp} from '../lib';
import {Box, Scene, SceneView, cam, center, faceOf} from '../scene';

type Seg = {
  id: string;
  beats: number;
  img: string;
  title?: string[];
  chip?: string;
  tab?: string;
  name?: string;
  cap?: string;
  cap2?: string;
  inner?: string;
  phone?: string;
  receipt?: {time: string; item: string; price: string};
  stamp?: string;
  say?: string;
  big?: string[];
  ask?: string;
};
const S = script as unknown as {bpm: number; header: {series: string; episode: string}; segments: Seg[]};
const BEAT = (FPS * 60) / S.bpm; // BPM60 なら 1拍 = 1秒

// 区切り：拍の数から始まりと終わりのフレーム。b(n) はその区切りの n 拍目
type Span = {seg: Seg; from: number; to: number; b: (n: number) => number};
const SPANS: Span[] = [];
let cursor = 0;
for (const seg of S.segments) {
  const from = cursor;
  cursor += Math.round(seg.beats * BEAT);
  SPANS.push({seg, from, to: cursor, b: (n) => from + Math.round(n * BEAT)});
}
export const durationBekkan01 = cursor;
const span = (id: string) => SPANS.find((s) => s.seg.id === id) as Span;

const FC = faces as unknown as Record<string, unknown>;
const face = (scene: string, who: string) => faceOf(FC, scene, who);
const img = (id: string) => `spy01/img/${id}.jpg`;
const P5h = face('P5', 'HUSBAND');
const P5g = face('P5', 'HUSBAND_GHOST');
const dict = center((FC.P7_extra as {dictionary: Box}).dictionary);

// 区切りごとの絵とカメラ
const sceneOf = (sp: Span): Scene => {
  const {seg, from, to, b} = sp;
  const base = {img: img(seg.img), from, to, drift: 0.06};
  switch (seg.id) {
    case 'hook':
      return {...base, keys: [{at: 0, cam: cam((P5h.x + P5g.x) / 2, (P5h.y + P5g.y) / 2, 1.3, 540, 560)}], punch: false};
    case 'omote': {
      const h = face('P4', 'HUSBAND');
      return {...base, keys: [{at: from, cam: cam(h.x, h.y, 1.35, 540, 720)}]};
    }
    case 'ura':
      return {...base, keys: [{at: from, cam: cam(P5g.x, P5g.y, 1.6, 560, 720)}], drift: 0.1};
    case 'pudding':
      return {...base, keys: [{at: from, cam: cam(0.5, 0.45, 1.2, 540, 900)}], filter: 'blur(12px) brightness(0.3) saturate(0.6)'};
    case 'order':
      return {...base, keys: [{at: from, cam: cam((P5h.x + P5g.x) / 2, (P5h.y + P5g.y) / 2, 1.5, 540, 700)}], drift: 0.12, shake: 6};
    case 'son':
      return {...base, keys: [{at: from, cam: cam(0.5, 0.45, 1.2, 540, 900)}], filter: 'blur(12px) brightness(0.4) saturate(0.7)'};
    case 'koan': {
      const w = face('P1', 'WIFE');
      return {...base, keys: [{at: from, cam: cam(w.x, w.y, 1.35, 560, 680)}]};
    }
    case 'receipt': {
      const w = face('P3', 'WIFE');
      return {...base, keys: [{at: from, cam: cam(w.x, w.y, 1.2, 700, 560)}]};
    }
    case 'hesokuri': {
      const w = face('P7', 'WIFE');
      return {
        ...base,
        keys: [
          {at: from, cam: cam(dict.x, dict.y, 1.3, 520, 1060)},
          {at: b(1.8), cam: cam(w.x, w.y, 1.4, 620, 640), dur: 10},
        ],
      };
    }
    case 'boss': {
      const m = face('P8', 'MOTHER-IN-LAW');
      return {...base, keys: [{at: from, cam: cam(m.x, m.y, 1.35, 520, 680)}], shake: 5};
    }
    case 'reveal': {
      const w = face('P9', 'WIFE');
      return {...base, keys: [{at: from, cam: cam(w.x, w.y, 1.25, 600, 640)}]};
    }
    default: {
      const w = face('P10', 'WIFE');
      return {...base, keys: [{at: from, cam: cam(w.x, w.y, 1.15, 540, 620)}], drift: 0.04};
    }
  }
};
const SCENES = SPANS.map(sceneOf);

// 切り替わりで一瞬だけ暗くする（ドラマのカット割りのような締まり）
const Dip: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= at + 6) return null;
  return <AbsoluteFill style={{background: '#000', opacity: 0.8 * (1 - ramp(frame, at, at + 6))}} />;
};

// ───────── 冒頭の題字（最初から見えている。1コマ目がサムネ） ─────────
const HookTitle: React.FC<{sp: Span}> = ({sp}) => {
  const frame = useCurrentFrame();
  if (frame >= sp.to) return null;
  const t = sp.seg.title as string[];
  const sp2 = pop(frame, sp.b(1.2), 12, 220);
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 930, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
        <Outlined size={92} color="#fff" stroke={18} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 6px 14px rgba(0,0,0,0.6))">
          {t[0]}
        </Outlined>
        <Outlined size={136} color="#fff" stroke={24} strokeColor={SPY.red} font={F.dela} weight={400} shadow="drop-shadow(0 10px 16px rgba(0,0,0,0.55))">
          {t[1]}
        </Outlined>
        <div style={{marginTop: 18, background: '#121419', color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 42, padding: '10px 32px 14px', borderRadius: 999, border: `3px solid ${SPY.red}`}}>{sp.seg.chip}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 905,
          top: 800,
          transform: `translate(-50%, -50%) rotate(14deg) scale(${frame < sp.b(1.2) ? 1 : 1 + 0.25 * (1 - sp2)})`,
          border: `8px solid ${SPY.red}`,
          borderRadius: 14,
          color: SPY.red,
          background: 'rgba(255,255,255,0.9)',
          fontFamily: F.dela,
          fontSize: 64,
          padding: '0 18px 6px',
          boxShadow: '0 8px 18px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
        }}
      >
        極秘
      </div>
    </>
  );
};

// 締め：「あなたの家の“別班”は誰？」とコメントへの誘い
const Ask: React.FC<{text: string; from: number; to: number}> = ({text, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 12, 220);
  const cta = pop(frame, from + 15, 11, 210);
  return (
    <div style={{position: 'absolute', left: 0, top: 1190, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20}}>
      <div style={{transform: `scale(${1.4 - 0.4 * p})`, opacity: clamp01(p * 3)}}>
        <Outlined size={76} color="#fff" stroke={16} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 6px 14px rgba(0,0,0,0.6))">
          {text}
        </Outlined>
      </div>
      {frame >= from + 15 && (
        <div style={{transform: `scale(${0.6 + 0.4 * cta})`, background: SPY.red, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 46, padding: '10px 36px 14px', borderRadius: 999, boxShadow: '0 6px 0 rgba(0,0,0,0.25)'}}>
          コメントで教えて ↓
        </div>
      )}
    </div>
  );
};

const CAP_Y = 1300;

export const Bekkan01: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: SPY.ink}}>
      {SCENES.map((sc) => (
        <SceneView key={sc.img + sc.from} sc={sc} />
      ))}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(8,10,16,0.55) 0%, rgba(8,10,16,0) 24%, rgba(8,10,16,0) 56%, rgba(8,10,16,0.6) 100%)'}} />
      {SPANS.map((sp) => {
        const {seg, from, to, b} = sp;
        return (
          <React.Fragment key={seg.id}>
            {seg.id === 'pudding' && <RedPudding from={from} to={to} cy={760} />}
            {seg.phone && <VoicePhone text={seg.phone} from={b(0.6)} to={to} cy={850} />}
            {seg.receipt && <Receipt x={310} y={1000} from={b(0.4)} to={to} time={seg.receipt.time} item={seg.receipt.item} price={seg.receipt.price} markAt={b(1.4)} />}
            {seg.stamp && <Stamp text={seg.stamp} x={560} y={800} at={b(1.2)} to={to} size={120} rot={-10} />}
            {seg.tab && seg.name && <Dossier tab={seg.tab} name={seg.name} from={from + 2} to={to} />}
            {seg.big && (
              <BigWords
                words={[
                  {text: seg.big[0], at: from + 4},
                  {text: seg.big[1], at: b(0.9), color: '#FFE3A3'},
                ]}
                to={b(2.6)}
                cy={760}
                size={150}
              />
            )}
            {/* テロップ：1本目 → 2本目（あれば拍の途中で入れ替え）、心の声、セリフ */}
            {seg.id !== 'hook' && seg.cap && !seg.big && (
              <CineSub text={seg.cap} from={from + 3} to={seg.cap2 ? b(2.3) : seg.say ? b(2.2) : to} cy={CAP_Y} />
            )}
            {seg.cap2 && <CineSub text={seg.cap2} from={b(2.3)} to={to} cy={CAP_Y} />}
            {seg.inner && <CineSub text={`『${seg.inner}』`} label="もう一人の自分" color={SPY.teal} inner from={from + 4} to={to} cy={CAP_Y} />}
            {seg.say && (
              <CineSub
                text={seg.say}
                label={seg.id === 'boss' ? '義母・千鶴' : '妻・玲子'}
                color={seg.id === 'boss' ? '#B8860B' : SPY.red}
                from={seg.cap ? b(2.2) : b(1.0)}
                to={to}
                cy={CAP_Y}
              />
            )}
            {seg.big && seg.cap && <CineSub text={seg.cap} from={b(2.6)} to={to} cy={960} />}
            {seg.ask && <Ask text={seg.ask} from={b(3.2)} to={to} />}
            {seg.id !== 'hook' && <Dip at={from} />}
          </React.Fragment>
        );
      })}
      <HookTitle sp={span('hook')} />
      <Header series={S.header.series} episode={S.header.episode} item={0} since={0} dots={false} accent={SPY.red} />
    </AbsoluteFill>
  );
};

// スパイドラマ風の部品：任務の札、映画風の字幕、はんこ、発見までのカウントダウン、レシート、大きな一言、警報の赤。
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {Outlined} from './parts';
import {W, clamp01, life, pop, ramp, wobble} from './lib';

export const SPY = {red: '#D7263D', ink: '#121419', paper: '#F4EFE6', gold: '#E9B949', teal: '#3FA7A0', steel: '#5C6B7A'};

// ───────── 任務の札（上の帯）：黒い帯に「任務１」と題、右に「極秘」の判。左から滑り込む ─────────
export const MissionBar: React.FC<{num: number; final?: boolean; title: string; from: number; to: number; top?: number}> = ({
  num,
  final,
  title,
  from,
  to,
  top = 292,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 13, 200);
  const sp = pop(frame, from + 6, 13, 260);
  return (
    <div style={{position: 'absolute', left: 40, top, opacity: life(frame, from, to, 2, 4), transform: `translateX(${(1 - p) * -1100}px) skewX(-6deg)`}}>
      <div style={{display: 'flex', alignItems: 'stretch', background: 'rgba(14,16,22,0.9)', boxShadow: '0 10px 24px rgba(0,0,0,0.45)', borderRadius: 6}}>
        <div style={{background: SPY.red, color: '#fff', padding: '8px 22px 10px', display: 'flex', alignItems: 'baseline', gap: 6, borderRadius: '6px 0 0 6px'}}>
          <span style={{fontFamily: F.mincho, fontWeight: 700, fontSize: 40}}>{final ? '最終任務' : '任務'}</span>
          {!final && <span style={{fontFamily: F.dela, fontSize: 66, lineHeight: 1}}>{num}</span>}
        </div>
        <div style={{color: '#fff', fontFamily: F.mincho, fontWeight: 700, fontSize: 62, padding: '10px 36px 12px 26px', whiteSpace: 'nowrap', letterSpacing: 4}}>{title}</div>
      </div>
      {frame >= from + 6 && (
        <div
          style={{
            position: 'absolute',
            right: -36,
            top: -26,
            transform: `rotate(12deg) scale(${2 - sp})`,
            opacity: clamp01(sp * 2),
            border: `5px solid ${SPY.red}`,
            color: SPY.red,
            background: 'rgba(255,255,255,0.9)',
            fontFamily: F.dela,
            fontSize: 34,
            padding: '0 10px 4px',
            borderRadius: 8,
          }}
        >
          極秘
        </div>
      )}
    </div>
  );
};

// ───────── 映画風の字幕（白い文字に黒いふち。話し手の札つき） ─────────
const split = (text: string, max = 14) => {
  if (text.includes('|')) return text.split('|');
  const chars = [...text];
  if (chars.length <= max) return [text];
  // 真ん中に近い区切り（、。…）で2行に
  const mid = chars.length / 2;
  let best = -1;
  chars.forEach((c, i) => {
    if ('、。…？！'.includes(c) && i < chars.length - 1 && (best < 0 || Math.abs(i + 1 - mid) < Math.abs(best - mid))) best = i + 1;
  });
  if (best < 0) best = Math.ceil(mid);
  return [chars.slice(0, best).join(''), chars.slice(best).join('')];
};

export const CineSub: React.FC<{text: string; label?: string; color?: string; inner?: boolean; from: number; to: number; cy?: number}> = ({
  text,
  label,
  color = SPY.steel,
  inner,
  from,
  to,
  cy = 1300,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const lines = split(text);
  const longest = Math.max(...lines.map((l) => [...l].length));
  const fs = Math.min(66, Math.floor(900 / longest));
  const y = (1 - ramp(frame, from, from + 5)) * 16;
  return (
    <div style={{position: 'absolute', left: 0, width: W, top: cy, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: life(frame, from, to, 3, 3), transform: `translateY(calc(-50% + ${y}px))`}}>
      {label && (
        <div style={{background: color, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 32, padding: '3px 18px 5px', borderRadius: 999, marginBottom: 8, boxShadow: '0 4px 10px rgba(0,0,0,0.35)'}}>
          {label}
        </div>
      )}
      {lines.map((l, i) => (
        <Outlined
          key={i}
          size={fs}
          color={inner ? '#BFF3EE' : '#fff'}
          stroke={Math.round(fs * 0.26)}
          strokeColor="#0d0f14"
          font={inner ? F.mincho : F.maru}
          weight={inner ? 700 : 900}
          shadow="drop-shadow(0 6px 10px rgba(0,0,0,0.55))"
        >
          {l}
        </Outlined>
      ))}
    </div>
  );
};

// ───────── はんこ（「自白」「発見」など。ドンと押す） ─────────
export const Stamp: React.FC<{text: string; x: number; y: number; at: number; to: number; size?: number; rot?: number}> = ({text, x, y, at, to, size = 92, rot = -12}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= to) return null;
  const sp = pop(frame, at, 13, 260);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${2.2 - 1.2 * sp})`,
        opacity: clamp01(sp * 2.5) * life(frame, at, to, 1, 4),
        border: `${Math.round(size * 0.1)}px solid ${SPY.red}`,
        borderRadius: 14,
        color: SPY.red,
        background: 'rgba(255,255,255,0.88)',
        fontFamily: F.dela,
        fontSize: size,
        lineHeight: 1.1,
        padding: `0 ${Math.round(size * 0.25)}px ${Math.round(size * 0.08)}px`,
        whiteSpace: 'nowrap',
        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
      }}
    >
      {text}
    </div>
  );
};

// ───────── 発見までのカウントダウン（ticks の時刻ごとに 1 ずつ減る） ─────────
export const Countdown: React.FC<{x: number; y: number; from: number; to: number; ticks: number[]; label: string}> = ({x, y, from, to, ticks, label}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const passed = ticks.filter((t) => frame >= t).length;
  const n = Math.max(0, ticks.length - passed);
  const last = ticks.filter((t) => frame >= t).pop() ?? from;
  const bump = 1 + 0.12 * (1 - ramp(frame, last, last + 5));
  const blink = n === 0 ? (Math.floor((frame - last) / 4) % 2 === 0 ? 1 : 0.35) : 1;
  const p = pop(frame, from, 12, 220);
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${(0.6 + 0.4 * p) * bump})`, opacity: life(frame, from, to, 2, 3)}}>
      <div style={{background: 'rgba(10,10,14,0.92)', border: `4px solid ${SPY.red}`, borderRadius: 18, padding: '10px 34px 14px', textAlign: 'center', boxShadow: `0 0 30px rgba(215,38,61,0.45)`}}>
        <div style={{fontFamily: F.mincho, fontWeight: 700, fontSize: 40, color: '#fff', letterSpacing: 6}}>{label}</div>
        <div style={{fontFamily: F.dela, fontSize: 120, lineHeight: 1.05, color: '#FF3B4E', opacity: blink, textShadow: '0 0 18px rgba(255,59,78,0.8)', fontVariantNumeric: 'tabular-nums'}}>
          00:0{n}
        </div>
      </div>
    </div>
  );
};

// ───────── レシート（白い紙。時刻と品名に赤い線） ─────────
export const Receipt: React.FC<{x: number; y: number; from: number; to: number; time: string; item: string; price: string; markAt: number}> = ({
  x,
  y,
  from,
  to,
  time,
  item,
  price,
  markAt,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 12, 190);
  const m = ramp(frame, markAt, markAt + 8);
  const row: React.CSSProperties = {display: 'flex', justifyContent: 'space-between', gap: 30, fontFamily: F.maru, fontWeight: 700, fontSize: 38, color: '#2a2622', position: 'relative', zIndex: 0};
  // 蛍光ペンで引いたような黄色い帯（文字の後ろ）
  const mark = (w: number) => <div style={{position: 'absolute', left: -10, top: '18%', height: '70%', width: `calc(${w * m}% + 20px)`, background: 'rgba(255,214,0,0.55)', borderRadius: 4, zIndex: 0}} />;
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) rotate(${-4 + (1 - p) * -10}deg) scale(${0.5 + 0.5 * p})`, opacity: life(frame, from, to, 2, 4)}}>
      <div style={{width: 470, background: '#FDFBF6', padding: '26px 34px 34px', boxShadow: '0 16px 30px rgba(0,0,0,0.45)', clipPath: 'polygon(0 0,100% 0,100% 94%,95% 100%,90% 94%,85% 100%,80% 94%,75% 100%,70% 94%,65% 100%,60% 94%,55% 100%,50% 94%,45% 100%,40% 94%,35% 100%,30% 94%,25% 100%,20% 94%,15% 100%,10% 94%,5% 100%,0 94%)'}}>
        <div style={{textAlign: 'center', fontFamily: F.mincho, fontWeight: 700, fontSize: 42, letterSpacing: 10, color: '#2a2622', marginBottom: 12}}>レシート</div>
        <div style={{...row, marginBottom: 6}}>
          {mark(100)}
          <span style={{position: 'relative'}}>時刻</span>
          <span style={{position: 'relative'}}>{time}</span>
        </div>
        <div style={{...row, marginBottom: 6}}>
          {mark(100)}
          <span style={{position: 'relative'}}>{item}</span>
          <span style={{position: 'relative'}}>{price}</span>
        </div>
        <div style={{borderTop: '3px dashed #b9b0a4', margin: '10px 0 8px'}} />
        <div style={row}>
          <span>合計</span>
          <span>{price}</span>
        </div>
      </div>
    </div>
  );
};

// ───────── 大きな一言（「敵か。」「味方か。」が順にドンと出る） ─────────
export const BigWords: React.FC<{words: {text: string; at: number; color?: string}[]; to: number; cy: number; size?: number}> = ({words, to, cy, size = 170}) => {
  const frame = useCurrentFrame();
  if (frame < words[0].at || frame >= to) return null;
  return (
    <div style={{position: 'absolute', left: 0, width: W, top: cy, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: 'translateY(-50%)'}}>
      {words.map((w, i) => {
        if (frame < w.at) return <div key={i} style={{height: size * 1.2}} />;
        const p = pop(frame, w.at, 12, 240);
        return (
          <div key={i} style={{transform: `scale(${1.6 - 0.6 * p})`, opacity: clamp01(p * 3) * life(frame, w.at, to, 1, 4)}}>
            <Outlined size={size} color={w.color ?? '#fff'} stroke={Math.round(size * 0.12)} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 0 26px rgba(0,0,0,0.8))">
              {w.text}
            </Outlined>
          </div>
        );
      })}
    </div>
  );
};

// ───────── 警報の赤（画面のふちが赤く脈打つ） ─────────
export const AlarmTint: React.FC<{from: number; to: number}> = ({from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const pulse = 0.5 + 0.5 * Math.sin(((frame - from) / 30) * Math.PI * 2 * 1.6);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: life(frame, from, to, 3, 6),
        background: `radial-gradient(ellipse at 50% 45%, rgba(215,38,61,0) 50%, rgba(215,38,61,${0.25 + 0.3 * pulse}) 100%)`,
        transform: `translate(${wobble(frame, 9, 1.5)}px, 0)`,
      }}
    />
  );
};

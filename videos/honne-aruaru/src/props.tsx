// コードで描く小道具：離婚届、値札、へそくりメーター、「ゴゴゴ」の圧。絵の生成に頼らず、文字も正しく出せる。
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {C, Outlined} from './parts';
import {clamp01, life, pop, ramp, wobble} from './lib';

const GREEN = '#2F8A5B';

/** 手書きで埋めたように見える波線（決まった形） */
const scribble = (x: number, y: number, w: number, seed: number) => {
  let d = `M${x},${y}`;
  const n = Math.max(4, Math.round(w / 22));
  for (let i = 1; i <= n; i++) {
    const px = x + (w * i) / n;
    const py = y + Math.sin(i * 1.7 + seed) * 5 + Math.sin(i * 0.6 + seed * 2) * 3;
    d += ` Q${px - w / n / 2},${py - 9 + ((i + seed) % 3) * 6} ${px},${py}`;
  }
  return d;
};

// ───────── 離婚届（緑の枠の用紙）と「記入済」のはんこ ─────────
export const DivorceForm: React.FC<{x: number; y: number; scale?: number; from: number; to: number; stampAt: number}> = ({
  x,
  y,
  scale = 1,
  from,
  to,
  stampAt,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 13, 150);
  const W = 620;
  const H = 440;
  const sp = pop(frame, stampAt, 14, 260);
  const fields = [
    {label: '氏名', y: 150},
    {label: '住所', y: 215},
    {label: '本籍', y: 280},
    {label: '届出人', y: 345},
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: x - (W * scale) / 2,
        top: y - (H * scale) / 2,
        width: W * scale,
        height: H * scale,
        opacity: life(frame, from, to, 2, 5),
        transform: `translateY(${(1 - p) * 260}px) rotate(${-6 - (1 - p) * 16}deg) scale(${1 + (1 - p) * 0.25})`,
      }}
    >
      <svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} style={{filter: 'drop-shadow(0 14px 18px rgba(30,20,10,0.35))'}}>
        <rect x={0} y={0} width={W} height={H} rx={6} fill="#FFFDF6" />
        <rect x={14} y={14} width={W - 28} height={H - 28} fill="none" stroke={GREEN} strokeWidth={4} />
        <rect x={22} y={22} width={W - 44} height={H - 44} fill="none" stroke={GREEN} strokeWidth={1.5} />
        <text x={46} y={98} fontFamily={F.mincho} fontWeight={700} fontSize={66} fill={GREEN} letterSpacing={14}>
          離婚届
        </text>
        {/* 右上の受理欄 */}
        <rect x={392} y={44} width={190} height={70} fill="none" stroke={GREEN} strokeWidth={2} />
        <line x1={392} y1={72} x2={582} y2={72} stroke={GREEN} strokeWidth={1.5} />
        <text x={404} y={65} fontFamily={F.mincho} fontWeight={700} fontSize={18} fill={GREEN}>
          受理
        </text>
        {fields.map((f, i) => (
          <g key={f.label}>
            <line x1={46} y1={f.y + 26} x2={W - 46} y2={f.y + 26} stroke={GREEN} strokeWidth={1.5} />
            <line x1={150} y1={f.y - 22} x2={150} y2={f.y + 26} stroke={GREEN} strokeWidth={1.5} />
            <text x={56} y={f.y + 12} fontFamily={F.mincho} fontWeight={700} fontSize={24} fill={GREEN}>
              {f.label}
            </text>
            <path d={scribble(172, f.y + 4, i === 3 ? 170 : 300 - i * 40, i * 1.3 + 0.4)} fill="none" stroke="#3a3330" strokeWidth={3.2} strokeLinecap="round" />
          </g>
        ))}
      </svg>
      {/* 記入済のはんこ */}
      {frame >= stampAt && (
        <div
          style={{
            position: 'absolute',
            right: 36 * scale,
            bottom: 34 * scale,
            transform: `rotate(-14deg) scale(${2.2 - 1.2 * sp})`,
            opacity: clamp01(sp * 2) * 0.92,
            border: `${7 * scale}px solid ${C.red}`,
            borderRadius: 14 * scale,
            padding: `${4 * scale}px ${16 * scale}px ${8 * scale}px`,
            color: C.red,
            fontFamily: F.dela,
            fontSize: 58 * scale,
            letterSpacing: 4 * scale,
            mixBlendMode: 'multiply',
          }}
        >
          記入済
        </div>
      )}
    </div>
  );
};

// ───────── 値札（ひもで下がって揺れる） ─────────
export const PriceTag: React.FC<{x: number; y: number; text: string; from: number; to: number; scale?: number}> = ({x, y, text, from, to, scale = 1}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 9, 170);
  const swing = 9 * Math.sin((frame - from) * 0.22) * Math.exp(-(frame - from) / 40) + 2 * Math.sin(frame * 0.08);
  return (
    <div style={{position: 'absolute', left: x, top: y, opacity: life(frame, from, to, 2, 4), transform: `scale(${(0.4 + 0.6 * p) * scale})`, transformOrigin: '0 0'}}>
      <div style={{transform: `rotate(${swing}deg)`, transformOrigin: '0 0'}}>
        <svg width={40} height={70} style={{position: 'absolute', left: -6, top: -6}}>
          <path d="M6,6 C14,30 22,44 30,64" fill="none" stroke="#6b5a4e" strokeWidth={3} />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 6,
            top: 58,
            background: C.red,
            color: '#fff',
            fontFamily: F.dela,
            fontSize: 58,
            padding: '8px 26px 12px 40px',
            borderRadius: '14px 28px 28px 14px',
            border: '5px solid #fff',
            boxShadow: '0 8px 0 rgba(60,40,30,0.22)',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{position: 'absolute', left: 13, top: '50%', width: 14, height: 14, marginTop: -7, borderRadius: 7, background: '#fff'}} />
          {text}
        </div>
      </div>
    </div>
  );
};

// ───────── へそくりメーター（目標まであと少し） ─────────
export const GoalMeter: React.FC<{x: number; y: number; from: number; to: number; level: number; ticks: string[]; note: string; label: string}> = ({
  x,
  y,
  from,
  to,
  level,
  ticks,
  note,
  label,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const w = 760;
  const h = 64;
  const fill = level * ramp(frame, from + 4, from + 22);
  const pn = pop(frame, from + 22, 11, 180);
  return (
    <div style={{position: 'absolute', left: x - w / 2, top: y, width: w, opacity: life(frame, from, to, 3, 4)}}>
      <div style={{position: 'absolute', left: 0, top: -64}}>
        <Outlined size={44} color={C.ink} stroke={10}>
          {label}
        </Outlined>
      </div>
      <div style={{position: 'relative', height: h, borderRadius: 999, background: 'rgba(255,255,255,0.94)', border: '6px solid #fff', boxShadow: '0 6px 0 rgba(60,40,30,0.2)', overflow: 'hidden'}}>
        <div style={{width: `${fill * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(180deg, #F7CF52, #E2A92B)'}} />
        {ticks.slice(0, -1).map((_, i) => (
          <div key={i} style={{position: 'absolute', top: 0, bottom: 0, left: `${((i + 1) / ticks.length) * 100}%`, width: 3, background: 'rgba(120,90,40,0.35)'}} />
        ))}
      </div>
      <div style={{position: 'relative', height: 50}}>
        {ticks.map((t, i) => (
          <div key={t} style={{position: 'absolute', top: 6, left: `${((i + 1) / ticks.length) * 100}%`, transform: 'translateX(-50%)'}}>
            <Outlined size={34} color={C.ink} stroke={8}>
              {t}
            </Outlined>
          </div>
        ))}
      </div>
      <div style={{position: 'absolute', top: -70, left: `${(level + (1 - level) / 2) * 100}%`, transform: `translateX(-50%) scale(${pn})`}}>
        <Outlined size={44} color={C.red} stroke={10} font={F.hand} weight={400}>
          {note}
        </Outlined>
      </div>
    </div>
  );
};

// ───────── 「ゴゴゴ…」の圧（暗いふち＋震える文字） ─────────
export const Menace: React.FC<{from: number; to: number; spots: {x: number; y: number; size: number; rot: number}[]}> = ({from, to, spots}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = ramp(frame, from, from + 8);
  const o = life(frame, from, to, 6, 5);
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: o}}>
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 46%, rgba(30,10,40,0) 40%, rgba(40,12,55,${0.62 * p}) 100%)`}} />
      {spots.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: s.x + wobble(frame, i * 5 + 1, 3),
            top: s.y + wobble(frame, i * 7 + 2, 3),
            transform: `translate(-50%, -50%) rotate(${s.rot}deg) scale(${0.7 + 0.3 * pop(frame, from + i * 3, 10, 160)})`,
          }}
        >
          <Outlined size={s.size} color="#4B2A63" stroke={Math.round(s.size * 0.14)} font={F.dela} weight={400}>
            ゴ
          </Outlined>
        </div>
      ))}
    </div>
  );
};

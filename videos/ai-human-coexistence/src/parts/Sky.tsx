import React, {useId, useMemo} from 'react';
import {clamp, hash, mix, noise1, rgba, rng} from '../lib/math';

export const useUid = (p = 'u') => p + useId().replace(/[^a-zA-Z0-9]/g, '');

// 空のグラデーション
export const Sky: React.FC<{stops: [number, string][]; w?: number; h?: number; y?: number}> = ({stops, w = 1920, h = 1080, y = 0}) => {
  const id = useUid('sky');
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([o, c], i) => (
            <stop key={i} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect x={-200} y={y} width={w + 400} height={h} fill={`url(#${id})`} />
    </g>
  );
};

// 太陽・月の光のにじみ
export const Glow: React.FC<{x: number; y: number; r: number; color: string; opacity?: number; core?: string; coreR?: number}> = ({
  x,
  y,
  r,
  color,
  opacity = 1,
  core,
  coreR = 0,
}) => {
  const id = useUid('glow');
  return (
    <g opacity={opacity}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={color} stopOpacity={0.9} />
          <stop offset="0.25" stopColor={color} stopOpacity={0.45} />
          <stop offset="0.6" stopColor={color} stopOpacity={0.12} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={x} cy={y} r={r} fill={`url(#${id})`} />
      {core ? <circle cx={x} cy={y} r={coreR} fill={core} /> : null}
    </g>
  );
};

export const Stars: React.FC<{t: number; count?: number; seed?: number; maxY?: number; opacity?: number; w?: number}> = ({
  t,
  count = 160,
  seed = 7,
  maxY = 600,
  opacity = 1,
  w = 1920,
}) => {
  const stars = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: count}, () => ({
      x: r.range(-100, w + 100),
      y: Math.pow(r.next(), 1.6) * maxY,
      s: r.range(0.5, 1.8),
      ph: r.range(0, 100),
      sp: r.range(0.3, 1.2),
    }));
  }, [count, seed, maxY, w]);
  return (
    <g opacity={opacity}>
      {stars.map((s, i) => {
        const tw = 0.55 + 0.45 * noise1(t * s.sp + s.ph, i);
        return <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff6e6" opacity={tw * clamp(1 - s.y / (maxY * 1.05))} />;
      })}
    </g>
  );
};

type Puff = {x: number; y: number; r: number};

const makeCumulus = (seed: number, w: number, h: number): Puff[] => {
  const r = rng(seed);
  const puffs: Puff[] = [];
  const n = Math.max(5, Math.round(w / (h * 0.55)));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = (u - 0.5) * w * 0.86;
    const envelope = Math.sin(Math.PI * (0.08 + u * 0.84));
    const rr = h * (0.32 + 0.38 * envelope) * r.range(0.8, 1.15);
    puffs.push({x, y: -rr * 0.55, r: rr});
  }
  const extra = Math.round(n * 0.8);
  for (let i = 0; i < extra; i++) {
    const u = r.range(0.2, 0.8);
    const envelope = Math.sin(Math.PI * u);
    const rr = h * r.range(0.22, 0.4) * (0.7 + 0.5 * envelope);
    puffs.push({x: (u - 0.5) * w * 0.8, y: -h * (0.45 + 0.4 * envelope) * r.range(0.8, 1.1), r: rr});
  }
  return puffs;
};

// もくもくした積雲（下が平ら）。lit=光の当たる色、shade=影色
export const Cumulus: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  lit: string;
  shade: string;
  rim?: string;
  light?: number; // 光の向き -1(左から)〜1(右から)
  opacity?: number;
}> = ({x, y, w, h, seed, lit, shade, rim, light = -0.6, opacity = 1}) => {
  const id = useUid('cu');
  const puffs = useMemo(() => makeCumulus(seed, w, h), [seed, w, h]);
  const lx = light * 0.18;
  return (
    <g transform={`translate(${x},${y})`} opacity={opacity}>
      <defs>
        <clipPath id={id}>
          <rect x={-w} y={-h * 3} width={w * 2} height={h * 3 + 1} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {puffs.map((p, i) => (
          <circle key={`s${i}`} cx={p.x} cy={p.y} r={p.r} fill={shade} />
        ))}
        {puffs.map((p, i) => (
          <circle key={`l${i}`} cx={p.x + p.r * lx} cy={p.y - p.r * 0.16} r={p.r * 0.86} fill={lit} />
        ))}
        {rim
          ? puffs.map((p, i) => (
              <circle key={`h${i}`} cx={p.x + p.r * lx * 1.8} cy={p.y - p.r * 0.3} r={p.r * 0.55} fill={rim} opacity={0.55} />
            ))
          : null}
        <rect x={-w} y={-h * 0.22} width={w * 2} height={h * 0.22} fill={shade} opacity={0.35} />
      </g>
    </g>
  );
};

// 入道雲：積雲を縦に積み上げ、上にかなとこ
export const Cumulonimbus: React.FC<{
  x: number;
  y: number;
  scale?: number;
  seed?: number;
  lit?: string;
  shade?: string;
  deep?: string;
  light?: number;
}> = ({x, y, scale = 1, seed = 3, lit = '#ffffff', shade = '#c9d6ea', deep = '#a9bad6', light = 0.7}) => {
  const layers = useMemo(() => {
    const r = rng(seed);
    const out: {x: number; y: number; w: number; h: number; s: number}[] = [];
    let yy = 0;
    let ww = 900;
    for (let i = 0; i < 7; i++) {
      out.push({x: r.range(-40, 40) + i * 6, y: yy, w: ww, h: ww * 0.36, s: seed * 10 + i});
      yy -= ww * 0.2;
      ww *= i < 4 ? 0.86 : 0.95;
    }
    return out;
  }, [seed]);
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      {/* 奥の影の塊 */}
      <Cumulus x={-120} y={-260} w={700} h={300} seed={seed + 91} lit={shade} shade={deep} light={light} opacity={0.9} />
      {layers.map((l, i) => (
        <Cumulus key={i} x={l.x} y={l.y} w={l.w} h={l.h} seed={l.s} lit={lit} shade={mix(shade, lit, i * 0.06)} rim={lit} light={light} />
      ))}
      {/* かなとこ */}
      <Cumulus x={40} y={layers[6].y - 40} w={1000} h={170} seed={seed + 7} lit={lit} shade={shade} light={light} opacity={0.96} />
    </g>
  );
};

// 横に長い薄雲（夜明け・夕焼け用）
export const Streak: React.FC<{x: number; y: number; w: number; h: number; color: string; opacity?: number}> = ({x, y, w, h, color, opacity = 0.8}) => {
  const id = useUid('st');
  return (
    <g opacity={opacity}>
      <defs>
        <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={color} stopOpacity={1} />
          <stop offset="0.55" stopColor={color} stopOpacity={0.55} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} fill={`url(#${id})`} />
    </g>
  );
};

// 薄雲の帯（何本かの streak を束ねる）
export const StreakBank: React.FC<{seed: number; y: number; spread: number; count: number; color: string; t: number; drift?: number; opacity?: number; w?: number}> = ({
  seed,
  y,
  spread,
  count,
  color,
  t,
  drift = 4,
  opacity = 0.7,
  w = 1920,
}) => {
  const items = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: count}, () => ({
      x: r.range(-200, w + 200),
      y: y + r.range(-spread, spread),
      w: r.range(300, 900),
      h: r.range(10, 34),
      o: r.range(0.35, 1),
      v: r.range(0.5, 1.5),
    }));
  }, [seed, y, spread, count, w]);
  return (
    <g>
      {items.map((s, i) => (
        <Streak key={i} x={s.x + t * drift * s.v} y={s.y} w={s.w} h={s.h} color={color} opacity={opacity * s.o} />
      ))}
    </g>
  );
};

// 霞（地平線の空気）
export const Haze: React.FC<{y: number; h: number; color: string; opacity?: number; w?: number}> = ({y, h, color, opacity = 0.6, w = 1920}) => {
  const id = useUid('hz');
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0} />
          <stop offset="0.5" stopColor={color} stopOpacity={opacity} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect x={-200} y={y - h / 2} width={w + 400} height={h} fill={`url(#${id})`} />
    </g>
  );
};

export const twinkle = (t: number, seed: number, speed = 1) => 0.5 + 0.5 * Math.sin(t * speed * 6.283 + hash(seed) * 6.283);
export {rgba};

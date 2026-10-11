import React, {useMemo} from 'react';
import {clamp, lerp, mix, rng} from '../lib/math';
import {useUid} from './Sky';

type SeaProps = {
  t: number;
  horizon: number;
  bottom?: number;
  top: string; // 水平線付近の色
  deep: string; // 手前の色
  glint?: string; // きらめきの色
  sunX?: number; // 光の道の中心（なければ光の道なし）
  sunSpread?: number;
  sunPower?: number; // 光の道の強さ 0..1
  count?: number;
  seed?: number;
  w?: number;
  glintOpacity?: number;
  bands?: string; // 波のうねりの色
};

// 海面：グラデーション＋きらめく波の線＋太陽/月の光の道
export const Sea: React.FC<SeaProps & {glints?: boolean}> = (props) => (
  <g>
    <SeaBase {...props} />
    {props.glints === false ? null : <SeaGlints {...props} />}
  </g>
);

const SeaBase: React.FC<SeaProps> = ({t, horizon, bottom = 1080, top, deep, seed = 11, w = 1920, bands}) => {
  const id = useUid('sea');
  const H = bottom - horizon;
  const bandItems = useMemo(() => {
    if (!bands) return [];
    const r = rng(seed + 9);
    return Array.from({length: 26}, () => ({u: Math.pow(r.next(), 1.3), x: r.range(-300, w), len: r.range(200, 700), ph: r.range(0, 6.28)}));
  }, [bands, seed, w]);
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.35" stopColor={mix(top, deep, 0.55)} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
      </defs>
      <rect x={-200} y={horizon} width={w + 400} height={H + 2} fill={`url(#${id})`} />
      {bandItems.map((b, i) => {
        const y = horizon + H * b.u;
        const th = lerp(1.5, 14, b.u);
        const dx = Math.sin(t * 0.35 + b.ph) * 30 * (0.3 + b.u);
        return <rect key={`b${i}`} x={b.x + dx} y={y} width={b.len * (0.4 + b.u)} height={th} rx={th / 2} fill={bands} opacity={0.22} />;
      })}
    </g>
  );
};

// 波のきらめきと光の道（映り込みの上に重ねられるよう分離）
export const SeaGlints: React.FC<SeaProps> = ({
  t,
  horizon,
  bottom = 1080,
  top,
  deep,
  glint = '#ffffff',
  sunX,
  sunSpread = 60,
  sunPower = 0.8,
  count = 420,
  seed = 11,
  w = 1920,
  glintOpacity = 0.5,
  bands,
}) => {
  const H = bottom - horizon;
  const lines = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: count}, () => {
      const u = Math.pow(r.next(), 1.5);
      return {u, x: r.range(-100, w + 100), ph: r.range(0, 6.28), sp: r.range(0.6, 1.8), o: r.range(0.3, 1)};
    });
  }, [count, seed, w]);
  const path = useMemo(() => {
    if (sunX === undefined) return [];
    const r = rng(seed + 5);
    return Array.from({length: 240}, () => {
      const u = Math.pow(r.next(), 1.25);
      const g = (r.next() + r.next() + r.next() - 1.5) / 1.5;
      return {u, g, ph: r.range(0, 6.28), sp: r.range(1, 2.6), o: r.range(0.4, 1)};
    });
  }, [sunX, seed]);
  return (
    <g>
      {lines.map((l, i) => {
        const y = horizon + H * l.u;
        const len = lerp(5, 110, l.u);
        const th = lerp(0.7, 3.2, l.u);
        const fl = 0.5 + 0.5 * Math.sin(t * l.sp * 2.2 + l.ph);
        const dx = Math.sin(t * 0.4 + l.ph) * 12 * (0.2 + l.u);
        return (
          <rect
            key={i}
            x={l.x + dx}
            y={y}
            width={len}
            height={th}
            rx={th / 2}
            fill={glint}
            opacity={glintOpacity * l.o * fl * fl * clamp(0.25 + l.u)}
          />
        );
      })}
      {sunX !== undefined
        ? path.map((p, i) => {
            const y = horizon + H * p.u;
            const spread = sunSpread * (0.25 + p.u * 2.4);
            const x = sunX + p.g * spread;
            const len = lerp(8, 150, p.u) * (1 - Math.abs(p.g) * 0.5);
            const th = lerp(0.8, 4, p.u);
            const fl = 0.5 + 0.5 * Math.sin(t * p.sp * 3 + p.ph);
            return (
              <rect
                key={`p${i}`}
                x={x - len / 2}
                y={y}
                width={len}
                height={th}
                rx={th / 2}
                fill={glint}
                opacity={sunPower * p.o * fl * (1 - Math.abs(p.g) * 0.6)}
              />
            );
          })
        : null}
    </g>
  );
};

// 水面への映り込み（子要素を上下反転して薄く・揺らす）
export const Reflection: React.FC<{horizon: number; t: number; opacity?: number; children: React.ReactNode; squash?: number; blur?: number}> = ({
  horizon,
  t,
  opacity = 0.35,
  children,
  squash = 0.9,
  blur = 0,
}) => {
  const id = useUid('rf');
  const fid = useUid('rfb');
  const wob = Math.sin(t * 1.3) * 1.5;
  return (
    <g opacity={opacity}>
      <defs>
        <clipPath id={id}>
          <rect x={-400} y={horizon} width={2800} height={1200} />
        </clipPath>
        {blur > 0 ? (
          <filter id={fid} x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation={`${blur * 0.4} ${blur}`} />
          </filter>
        ) : null}
      </defs>
      <g clipPath={`url(#${id})`} filter={blur > 0 ? `url(#${fid})` : undefined}>
        <g transform={`translate(${wob},${horizon * (1 + squash)}) scale(1,${-squash})`}>{children}</g>
      </g>
    </g>
  );
};

// 波打ち際の白い泡
export const Foam: React.FC<{t: number; x: number; y: number; w: number; seed?: number; color?: string; amp?: number; opacity?: number}> = ({
  t,
  x,
  y,
  w,
  seed = 1,
  color = '#ffffff',
  amp = 4,
  opacity = 0.8,
}) => {
  const pts = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: 36}, () => ({ph: r.range(0, 6.28), sp: r.range(0.6, 1.4)}));
  }, [seed]);
  const d = pts
    .map((p, i) => {
      const xx = x + (w * i) / (pts.length - 1);
      const yy = y - Math.abs(Math.sin(t * p.sp + p.ph)) * amp;
      return `${i === 0 ? 'M' : 'L'}${xx.toFixed(1)},${yy.toFixed(1)}`;
    })
    .join(' ');
  const swell = 0.5 + 0.5 * Math.sin(t * 0.9 + seed);
  return (
    <g opacity={opacity}>
      <path d={d} stroke={color} strokeWidth={2 + swell * 2} fill="none" strokeLinecap="round" opacity={0.85} />
      <path d={d} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" opacity={0.18 + swell * 0.12} transform={`translate(0,${4 + swell * 3})`} />
    </g>
  );
};

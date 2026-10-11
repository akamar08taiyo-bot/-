import React, {useMemo} from 'react';
import {clamp, hash, lerp, mix, noise1, rng, shade} from '../lib/math';
import {Glow, useUid} from './Sky';

export type CityPalette = {
  walls: string[];
  tint: string;
  tintAmt: number;
  window: string;
  lit: string;
  rim?: string;
  seawall: string;
  rock: string;
  green: string;
  roof?: string;
};

export const PAL_DAY: CityPalette = {
  walls: ['#d9d0bf', '#cbc2b0', '#e3dccb', '#c4baa6', '#d4c7ae', '#bdb5a5'],
  tint: '#a9c3d9',
  tintAmt: 0.12,
  window: '#4a5a6a',
  lit: '#ffd88a',
  seawall: '#b9b1a1',
  rock: '#8b7d6b',
  green: '#7fa36a',
  roof: '#5d6672',
};

const tintC = (c: string, p: CityPalette) => mix(c, p.tint, p.tintAmt);

type Bld = {
  x: number;
  base: number;
  w: number;
  h: number;
  c: string;
  kind: 'danchi' | 'old' | 'tower';
  side: number;
  roof: {type: 'tank' | 'antenna' | 'garden' | 'box'; x: number}[];
  laundry: boolean;
  seed: number;
};

const ridgeAt = (x: number, W: number) =>
  130 * Math.exp(-Math.pow((x - 0.42 * W) / (0.17 * W), 2)) + 46 * Math.exp(-Math.pow((x - 0.7 * W) / (0.09 * W), 2));

const genIsland = (seed: number, W: number) => {
  const r = rng(seed);
  const SW = 28;
  const back: Bld[] = [];
  const front: Bld[] = [];
  let x = 10;
  while (x < W - 30) {
    const w = r.range(40, 86);
    const cx = x + w / 2;
    if (cx > 0.385 * W && cx < 0.465 * W) {
      x += w * 0.7;
      continue;
    }
    const center = Math.exp(-Math.pow((cx - 0.45 * W) / (0.32 * W), 2));
    const h = r.range(70, 150) * (0.75 + 0.7 * center) + (r.chance(0.12) ? 60 : 0);
    back.push({
      x,
      base: -SW - ridgeAt(cx, W) * 0.92,
      w: w * 1.08,
      h,
      c: r.pick(['#d9d0bf', '#cbc2b0', '#e3dccb', '#c4baa6', '#d4c7ae', '#bdb5a5']),
      kind: r.chance(0.6) ? 'danchi' : 'old',
      side: r.range(8, 16),
      roof: genRoof(r, w),
      laundry: r.chance(0.5),
      seed: r.int(0, 99999),
    });
    x += w * r.range(0.82, 1.0);
  }
  x = -6;
  while (x < W - 10) {
    const w = r.range(46, 110);
    const cx = x + w / 2;
    const h = r.range(56, 140) + (r.chance(0.16) ? r.range(50, 100) : 0);
    front.push({
      x,
      base: -SW,
      w,
      h,
      c: r.pick(['#d6ccba', '#c9bfab', '#ded5c4', '#beb4a2', '#cfc3ad']),
      kind: r.chance(0.65) ? 'danchi' : 'old',
      side: r.range(8, 18),
      roof: genRoof(r, w),
      laundry: r.chance(0.55),
      seed: r.int(0, 99999),
    });
    x += w * r.range(0.9, 1.05) + (r.chance(0.18) ? r.range(6, 20) : 0);
    void cx;
  }
  return {back, front, SW};
};

const genRoof = (r: ReturnType<typeof rng>, w: number) => {
  const out: Bld['roof'] = [];
  const n = r.int(0, 3);
  for (let i = 0; i < n; i++) out.push({type: r.pick(['tank', 'antenna', 'garden', 'box', 'antenna'] as const), x: r.range(6, w - 14)});
  return out;
};

const RoofItem: React.FC<{type: Bld['roof'][0]['type']; x: number; y: number; c: string; green: string; dark: string}> = ({type, x, y, c, green, dark}) => {
  if (type === 'tank')
    return (
      <g>
        <rect x={x - 1} y={y - 6} width={2} height={6} fill={dark} />
        <rect x={x + 8} y={y - 6} width={2} height={6} fill={dark} />
        <rect x={x - 2} y={y - 18} width={13} height={12} rx={2} fill={c} />
        <ellipse cx={x + 4.5} cy={y - 18} rx={6.5} ry={2} fill={shade(c, 0.12)} />
      </g>
    );
  if (type === 'antenna')
    return (
      <g stroke={dark} strokeWidth={1.2}>
        <line x1={x} y1={y} x2={x} y2={y - 26} />
        <line x1={x - 9} y1={y - 22} x2={x + 9} y2={y - 22} />
        <line x1={x - 7} y1={y - 17} x2={x + 7} y2={y - 17} />
        <line x1={x - 5} y1={y - 12} x2={x + 5} y2={y - 12} />
      </g>
    );
  if (type === 'garden')
    return (
      <g>
        <ellipse cx={x} cy={y - 3} rx={9} ry={5} fill={green} />
        <ellipse cx={x + 8} cy={y - 2} rx={6} ry={4} fill={shade(green, -0.12)} />
      </g>
    );
  return <rect x={x - 6} y={y - 12} width={14} height={12} fill={c} />;
};

const Building: React.FC<{b: Bld; p: CityPalette; lit: number; t: number; detail: number; rimSide?: number}> = ({b, p, lit, t, detail, rimSide = 0}) => {
  const top = b.base - b.h;
  const wall = tintC(b.c, p);
  const sideC = tintC(shade(b.c, -0.22), p);
  const win = tintC(p.window, p);
  const slab = tintC(shade(b.c, 0.1), p);
  const dark = tintC('#4a4440', p);
  const FH = b.kind === 'danchi' ? 13 : 15;
  const floors = Math.max(1, Math.floor((b.h - 8) / FH));
  const colW = b.kind === 'danchi' ? 9.5 : 12;
  const cols = Math.max(1, Math.floor((b.w - 6) / colW));
  const items: React.ReactNode[] = [];
  if (detail > 0) {
    for (let f = 0; f < floors; f++) {
      const wy = top + 6 + f * FH;
      if (b.kind === 'danchi') items.push(<rect key={`s${f}`} x={b.x} y={wy + FH - 4} width={b.w} height={1.8} fill={slab} />);
      for (let c = 0; c < cols; c++) {
        const hv = hash(b.seed * 0.013 + f * 7.13 + c * 1.71);
        const isLit = hv < lit;
        const wx = b.x + 4 + c * colW;
        const flick = isLit && hash(hv * 99) < 0.05 ? 0.75 + 0.25 * Math.sin(t * 7 + hv * 50) : 1;
        items.push(
          <rect
            key={`w${f}-${c}`}
            x={wx}
            y={wy}
            width={b.kind === 'danchi' ? 5.5 : 6.5}
            height={b.kind === 'danchi' ? 6.5 : 8}
            fill={isLit ? p.lit : win}
            opacity={isLit ? flick : 0.85}
          />,
        );
        if (detail > 1 && b.laundry && !isLit && hash(hv * 13.7) < 0.12) {
          const lc = ['#f3efe6', '#e8a0a0', '#9cc0e0', '#f0d080', '#ffffff'][Math.floor(hash(hv * 7) * 5)];
          items.push(<rect key={`l${f}-${c}`} x={wx - 1} y={wy + FH - 5} width={4 + hash(hv) * 4} height={5 + hash(hv * 3) * 4} fill={tintC(lc, p)} />);
        }
      }
    }
    // 雨だれの筋
    for (let k = 0; k < 3; k++) {
      const hv = hash(b.seed + k * 3.3);
      if (hv < 0.55) items.push(<rect key={`st${k}`} x={b.x + hv * b.w} y={top + 4} width={2 + hv * 3} height={b.h * (0.3 + hv * 0.6)} fill={dark} opacity={0.12} />);
    }
  }
  return (
    <g>
      <polygon
        points={`${b.x + b.w},${b.base} ${b.x + b.w},${top} ${b.x + b.w + b.side},${top + b.side * 0.35} ${b.x + b.w + b.side},${b.base}`}
        fill={sideC}
      />
      <rect x={b.x} y={top} width={b.w} height={b.h} fill={wall} />
      {items}
      {b.roof.map((ri, i) => (
        <RoofItem key={i} type={ri.type} x={b.x + ri.x} y={top} c={tintC('#cfc8bb', p)} green={tintC(p.green, p)} dark={dark} />
      ))}
      <rect x={b.x - 1} y={top - 2} width={b.w + 2} height={3} fill={tintC(shade(b.c, -0.1), p)} />
      {p.rim ? (
        <g>
          <rect x={b.x} y={top - 2} width={b.w + b.side * 0.5} height={2.2} fill={p.rim} opacity={0.9} />
          {rimSide !== 0 ? <rect x={rimSide > 0 ? b.x + b.w - 2 : b.x} y={top} width={2.2} height={b.h} fill={p.rim} opacity={0.55} /> : null}
        </g>
      ) : null}
    </g>
  );
};

export const Lighthouse: React.FC<{x: number; y: number; s?: number; c?: string; cap?: string; beam?: number; t: number; tint?: (c: string) => string}> = ({
  x,
  y,
  s = 1,
  c = '#f4f1ea',
  cap = '#c9483d',
  beam = 0,
  t,
  tint = (v) => v,
}) => {
  const ang = (t * 0.55) % 1;
  const bx = Math.cos(ang * Math.PI * 2);
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      {beam > 0 ? (
        <g opacity={beam * (0.35 + 0.65 * Math.abs(bx))}>
          <polygon points={`0,-78 ${bx * 900},-110 ${bx * 900},-46`} fill="#fff4cf" opacity={0.18} />
          <Glow x={0} y={-78} r={60} color="#fff2c8" opacity={0.9} />
        </g>
      ) : null}
      <polygon points="-10,0 10,0 7,-64 -7,-64" fill={tint(c)} />
      <rect x={-7} y={-40} width={14} height={8} fill={tint(cap)} />
      <rect x={-9} y={-66} width={18} height={4} fill={tint('#333')} />
      <rect x={-6} y={-78} width={12} height={12} fill={tint('#e9e2c8')} />
      <path d="M-8,-78 Q0,-92 8,-78 Z" fill={tint(cap)} />
    </g>
  );
};

export const Headframe: React.FC<{x: number; y: number; s?: number; c: string}> = ({x, y, s = 1, c}) => (
  <g transform={`translate(${x},${y}) scale(${s})`} stroke={c} strokeWidth={2.2} fill="none">
    <line x1={-26} y1={0} x2={-8} y2={-150} />
    <line x1={26} y1={0} x2={8} y2={-150} />
    {[0, 1, 2, 3, 4].map((i) => {
      const y1 = -i * 30;
      const y2 = -(i + 1) * 30;
      const w1 = 26 - (18 * i * 30) / 150;
      const w2 = 26 - (18 * (i + 1) * 30) / 150;
      return (
        <g key={i}>
          <line x1={-w1} y1={y1} x2={w2} y2={y2} />
          <line x1={w1} y1={y1} x2={-w2} y2={y2} />
          <line x1={-w2} y1={y2} x2={w2} y2={y2} />
        </g>
      );
    })}
    <line x1={-34} y1={-60} x2={-8} y2={-150} />
    <circle cx={0} cy={-156} r={12} />
    <circle cx={0} cy={-156} r={2} fill={c} />
  </g>
);

// 空中ビル：capsule=円盤デッキの塔、stack=鉄骨に団地を積んだ塔、pods=カプセル住宅の塔
export const SkyTower: React.FC<{
  x: number;
  y: number;
  h: number;
  kind: 'capsule' | 'stack' | 'pods';
  t: number;
  c?: string;
  accent?: string;
  win?: string;
  lit?: string;
  litRatio?: number;
  tint?: string;
  tintAmt?: number;
  rim?: string;
  seed?: number;
  s?: number;
}> = ({x, y, h, kind, t, c = '#e9e4da', accent = '#d9654f', win = '#3f5266', lit = '#ffd88a', litRatio = 0.2, tint = '#9fb6d0', tintAmt = 0.1, rim, seed = 1, s = 1}) => {
  const T = (v: string) => mix(v, tint, tintAmt);
  const id = useUid('tw');
  const blink = Math.sin(t * 3.2 + seed) > 0.6 ? 1 : 0.25;
  if (kind === 'capsule') {
    const decks = [0.42, 0.66, 0.9];
    return (
      <g transform={`translate(${x},${y}) scale(${s})`}>
        <defs>
          <linearGradient id={id} x1="0" x2="1">
            <stop offset="0" stopColor={T(shade(c, 0.08))} />
            <stop offset="0.55" stopColor={T(c)} />
            <stop offset="1" stopColor={T(shade(c, -0.3))} />
          </linearGradient>
        </defs>
        <rect x={-15} y={-h} width={30} height={h} fill={`url(#${id})`} />
        {Array.from({length: Math.floor(h / 40)}, (_, i) => (
          <rect key={i} x={-15} y={-i * 40 - 22} width={30} height={2} fill={T(shade(c, -0.2))} />
        ))}
        {decks.map((d, i) => {
          const dy = -h * d;
          const rw = i === 2 ? 92 : 70 - i * 6;
          return (
            <g key={i}>
              <ellipse cx={0} cy={dy + 14} rx={rw} ry={10} fill={T(shade(c, -0.35))} />
              <rect x={-rw} y={dy - 6} width={rw * 2} height={20} rx={10} fill={`url(#${id})`} />
              <rect x={-rw + 6} y={dy - 1} width={rw * 2 - 12} height={7} rx={3} fill={T(win)} />
              {Array.from({length: Math.floor((rw * 2 - 16) / 9)}, (_, k) => {
                const on = hash(seed * 3 + i * 17 + k * 1.3) < litRatio;
                return on ? <rect key={k} x={-rw + 8 + k * 9} y={dy} width={6} height={5} fill={lit} /> : null;
              })}
              <rect x={-rw} y={dy - 7} width={rw * 2} height={2.5} rx={1} fill={T(accent)} />
              {rim ? <rect x={-rw + 4} y={dy - 9} width={rw * 2 - 8} height={2} fill={rim} opacity={0.8} /> : null}
            </g>
          );
        })}
        <path d={`M-22,${-h * 0.9 - 8} Q0,${-h * 0.9 - 46} 22,${-h * 0.9 - 8} Z`} fill={T(shade(c, 0.05))} />
        <line x1={0} y1={-h * 0.9 - 40} x2={0} y2={-h * 0.9 - 100} stroke={T('#6b6b6b')} strokeWidth={2} />
        <circle cx={0} cy={-h * 0.9 - 102} r={4} fill="#ff5a4a" opacity={blink} />
        <Glow x={0} y={-h * 0.9 - 102} r={18} color="#ff5a4a" opacity={blink * 0.8} />
      </g>
    );
  }
  if (kind === 'stack') {
    const blocks = [
      {y: 0.38, dx: -26, w: 120, hh: 70},
      {y: 0.62, dx: 30, w: 110, hh: 64},
      {y: 0.86, dx: -8, w: 130, hh: 60},
    ];
    return (
      <g transform={`translate(${x},${y}) scale(${s})`}>
        <g stroke={T('#7a7f86')} strokeWidth={3} fill="none">
          <line x1={-40} y1={0} x2={-30} y2={-h} />
          <line x1={40} y1={0} x2={30} y2={-h} />
          {Array.from({length: Math.floor(h / 60)}, (_, i) => (
            <g key={i}>
              <line x1={-40 + i * 0.6} y1={-i * 60} x2={39 - i * 0.6} y2={-(i + 1) * 60} strokeWidth={1.6} />
              <line x1={40 - i * 0.6} y1={-i * 60} x2={-39 + i * 0.6} y2={-(i + 1) * 60} strokeWidth={1.6} />
            </g>
          ))}
        </g>
        {blocks.map((bk, i) => {
          const by = -h * bk.y;
          return (
            <g key={i}>
              <rect x={bk.dx - bk.w / 2} y={by - bk.hh} width={bk.w} height={bk.hh} fill={T(i % 2 ? '#d8cfbe' : '#e4dccd')} />
              <polygon
                points={`${bk.dx + bk.w / 2},${by} ${bk.dx + bk.w / 2},${by - bk.hh} ${bk.dx + bk.w / 2 + 12},${by - bk.hh + 5} ${bk.dx + bk.w / 2 + 12},${by}`}
                fill={T('#a9a194')}
              />
              {Array.from({length: Math.floor((bk.hh - 8) / 12)}, (_, f) =>
                Array.from({length: Math.floor((bk.w - 8) / 10)}, (_, k) => {
                  const on = hash(seed * 5 + i * 31 + f * 7 + k * 1.9) < litRatio;
                  return <rect key={`${f}-${k}`} x={bk.dx - bk.w / 2 + 5 + k * 10} y={by - bk.hh + 6 + f * 12} width={5} height={6} fill={on ? lit : T(win)} />;
                }),
              )}
              <rect x={bk.dx - bk.w / 2 - 2} y={by - bk.hh - 3} width={bk.w + 4} height={3} fill={T(accent)} />
              <ellipse cx={bk.dx - bk.w / 4} cy={by - bk.hh - 4} rx={12} ry={6} fill={T('#7fa36a')} />
              {rim ? <rect x={bk.dx - bk.w / 2} y={by - bk.hh - 4} width={bk.w + 10} height={2} fill={rim} opacity={0.8} /> : null}
            </g>
          );
        })}
        <circle cx={-30} cy={-h - 4} r={3.5} fill="#ff5a4a" opacity={blink} />
        <circle cx={30} cy={-h - 4} r={3.5} fill="#ff5a4a" opacity={1.25 - blink} />
      </g>
    );
  }
  // pods
  const pods = useMemoPods(seed, h);
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x={-18} y={-h - 30} width={36} height={h + 30} fill={T(shade(c, -0.08))} />
      <rect x={-18} y={-h - 30} width={10} height={h + 30} fill={T(shade(c, 0.1))} />
      {pods.map((p, i) => {
        const on = hash(seed * 7 + i * 3.7) < litRatio;
        return (
          <g key={i}>
            <rect x={p.x - 13} y={p.y - 13} width={26} height={26} rx={6} fill={T(p.c)} />
            <rect x={p.x - 13} y={p.y + 9} width={26} height={4} rx={2} fill={T(shade(p.c, -0.25))} />
            <circle cx={p.x} cy={p.y - 1} r={6.5} fill={on ? lit : T(win)} />
            <circle cx={p.x} cy={p.y - 1} r={6.5} fill="none" stroke={T(shade(p.c, -0.2))} strokeWidth={1.4} />
          </g>
        );
      })}
      {rim ? <rect x={-18} y={-h - 32} width={36} height={2} fill={rim} /> : null}
      <line x1={0} y1={-h - 30} x2={0} y2={-h - 80} stroke={T('#666')} strokeWidth={2} />
      <circle cx={0} cy={-h - 82} r={4} fill="#ff5a4a" opacity={blink} />
    </g>
  );
};

const podCache = new Map<string, {x: number; y: number; c: string}[]>();
const useMemoPods = (seed: number, h: number) => {
  const key = `${seed}-${h}`;
  if (!podCache.has(key)) {
    const r = rng(seed);
    const out: {x: number; y: number; c: string}[] = [];
    for (let yy = -30; yy > -h; yy -= 27) {
      for (const side of [-1, 1]) {
        if (r.chance(0.82)) out.push({x: side * r.range(26, 34) + r.range(-3, 3), y: yy + r.range(-3, 3), c: r.pick(['#ece6da', '#e7ddc9', '#f0ebe0', '#dfe6e8'])});
      }
      if (r.chance(0.3)) out.push({x: r.pick([-1, 1]) * 56, y: yy, c: '#e8e1d2'});
    }
    podCache.set(key, out);
  }
  return podCache.get(key)!;
};

// 渡り廊下（空中ビルどうしをつなぐ）
export const SkyBridge: React.FC<{x1: number; x2: number; y: number; c?: string; win?: string; lit?: string; tint?: string; tintAmt?: number; seed?: number; litRatio?: number}> = ({
  x1,
  x2,
  y,
  c = '#e6e0d4',
  win = '#3f5266',
  lit = '#ffd88a',
  tint = '#9fb6d0',
  tintAmt = 0.1,
  seed = 2,
  litRatio = 0.2,
}) => {
  const T = (v: string) => mix(v, tint, tintAmt);
  const n = Math.floor((x2 - x1 - 10) / 12);
  return (
    <g>
      <rect x={x1} y={y - 9} width={x2 - x1} height={18} rx={9} fill={T(c)} />
      <rect x={x1 + 6} y={y - 4} width={x2 - x1 - 12} height={7} rx={3} fill={T(win)} />
      {Array.from({length: n}, (_, i) => (hash(seed + i * 1.37) < litRatio ? <rect key={i} x={x1 + 8 + i * 12} y={y - 3} width={8} height={5} fill={lit} /> : null))}
      <rect x={x1} y={y + 7} width={x2 - x1} height={3} fill={T(shade(c, -0.3))} />
    </g>
  );
};

// 軍艦島のような団地島
export const IslandCity: React.FC<{
  t: number;
  x: number;
  y: number;
  s?: number;
  W?: number;
  seed?: number;
  p?: CityPalette;
  lit?: number;
  detail?: number;
  beam?: number;
  towers?: boolean;
  rimSide?: number;
}> = ({t, x, y, s = 1, W = 1400, seed = 42, p = PAL_DAY, lit = 0.08, detail = 2, beam = 0, towers = true, rimSide = 0}) => {
  const data = useMemo(() => genIsland(seed, W), [seed, W]);
  const T = (c: string) => tintC(c, p);
  const SW = data.SW;
  const rockPts = useMemo(() => {
    const pts: string[] = [`0,${-SW}`];
    for (let i = 0; i <= 60; i++) {
      const xx = (W * i) / 60;
      pts.push(`${xx.toFixed(1)},${(-SW - ridgeAt(xx, W) - noise1(i * 0.7, seed) * 14).toFixed(1)}`);
    }
    pts.push(`${W},${-SW}`);
    return pts.join(' ');
  }, [W, SW, seed]);
  const lhX = 0.425 * W;
  const lhY = -SW - ridgeAt(lhX, W) - 6;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      {towers ? (
        <g>
          <SkyTower x={0.2 * W} y={-SW - 60} h={560} kind="capsule" t={t} tint={p.tint} tintAmt={p.tintAmt} lit={p.lit} litRatio={lit + 0.1} rim={p.rim} seed={seed + 1} />
          <SkyTower x={0.64 * W} y={-SW - 40} h={470} kind="stack" t={t} tint={p.tint} tintAmt={p.tintAmt} lit={p.lit} litRatio={lit + 0.1} rim={p.rim} seed={seed + 2} />
          <SkyTower x={0.9 * W} y={-SW - 30} h={380} kind="pods" t={t} tint={p.tint} tintAmt={p.tintAmt} lit={p.lit} litRatio={lit + 0.1} rim={p.rim} seed={seed + 3} />
          <SkyBridge x1={0.2 * W + 20} x2={0.64 * W - 30} y={-SW - 60 - 560 * 0.66 + 4} tint={p.tint} tintAmt={p.tintAmt} lit={p.lit} litRatio={lit + 0.15} seed={seed + 4} />
          <SkyBridge x1={0.64 * W + 30} x2={0.9 * W - 20} y={-SW - 40 - 470 * 0.62 + 30} tint={p.tint} tintAmt={p.tintAmt} lit={p.lit} litRatio={lit + 0.15} seed={seed + 5} />
        </g>
      ) : null}
      <polygon points={rockPts} fill={T(p.rock)} />
      <polygon points={rockPts} fill={T(p.green)} opacity={0.35} />
      {data.back.map((b, i) => (
        <Building key={`b${i}`} b={b} p={p} lit={lit} t={t} detail={detail} rimSide={rimSide} />
      ))}
      <Lighthouse x={lhX} y={lhY} t={t} beam={beam} tint={T} />
      <g transform={`translate(${lhX - 40},${lhY + 2})`}>
        <rect x={-8} y={-16} width={2.5} height={16} fill={T('#b8463c')} />
        <rect x={6} y={-16} width={2.5} height={16} fill={T('#b8463c')} />
        <rect x={-11} y={-18} width={22} height={3} fill={T('#b8463c')} />
      </g>
      <Headframe x={0.8 * W} y={-SW - 4} c={T('#6d6660')} s={0.9} />
      {data.front.map((b, i) => (
        <Building key={`f${i}`} b={b} p={p} lit={lit} t={t} detail={detail} rimSide={rimSide} />
      ))}
      <polygon points={`-14,2 ${W + 14},2 ${W + 6},${-SW} -6,${-SW}`} fill={T(p.seawall)} />
      <rect x={-6} y={-SW} width={W + 12} height={3} fill={T(shade(p.seawall, 0.15))} />
      {Array.from({length: Math.floor(W / 46)}, (_, i) => (
        <rect key={i} x={i * 46 + 10} y={-SW + 4} width={1.5} height={SW - 4} fill={T(shade(p.seawall, -0.15))} opacity={0.6} />
      ))}
    </g>
  );
};

// 熱海のような斜面の温泉街
export type HillPalette = {
  far: string;
  mid: string;
  near: string;
  tint: string;
  tintAmt: number;
  walls: string[];
  hotel: string[];
  roof: string;
  window: string;
  lit: string;
  rim?: string;
  tree: string;
};

export const HILL_DAY: HillPalette = {
  far: '#9fb7c4',
  mid: '#6f9478',
  near: '#5e8566',
  tint: '#a9c3d9',
  tintAmt: 0.15,
  walls: ['#efe8da', '#e4d9c3', '#f2ece2', '#d9cdb5', '#e8dccb'],
  hotel: ['#f3efe6', '#e9e4d8', '#f1e3d3', '#e2e7e6'],
  roof: '#4f5866',
  window: '#4c5d6e',
  lit: '#ffd88a',
  tree: '#55805c',
};

type HillB = {x: number; v: number; w: number; h: number; kind: 'hotel' | 'house' | 'tree'; c: string; seed: number; sign?: string};

const SIGNS = ['ホテル汐見', '湯ノ花館', 'かもめ荘', '観光ホテル', '旅館 灯', '湯ノ島荘', 'ホテル青海', '海月館'];

export const hillHeight = (x: number, W: number, H: number, seed: number) => {
  const u = x / W;
  const rise = clamp(u / 0.55);
  const base = H * (0.06 + 0.94 * Math.sin((Math.PI / 2) * rise) ** 1.4) * (1 - 0.25 * clamp((u - 0.7) / 0.3));
  return base * (0.92 + 0.12 * noise1(u * 6, seed));
};

export const HillTown: React.FC<{
  t: number;
  x: number;
  y: number;
  W?: number;
  H?: number;
  s?: number;
  seed?: number;
  p?: HillPalette;
  lit?: number;
  neon?: number; // 0..1 看板のネオン
  steam?: boolean;
  castle?: boolean;
  detail?: number;
}> = ({t, x, y, W = 1200, H = 420, s = 1, seed = 5, p = HILL_DAY, lit = 0.1, neon = 0, steam = true, castle = true, detail = 2}) => {
  const T = (c: string) => mix(c, p.tint, p.tintAmt);
  const items = useMemo(() => {
    const r = rng(seed);
    const out: HillB[] = [];
    let signI = 0;
    for (let i = 0; i < 150; i++) {
      const xx = r.range(0.02, 0.98) * W;
      const v = Math.pow(r.next(), 0.8) * 0.82;
      const kind = r.next() < 0.2 ? 'hotel' : r.next() < 0.55 ? 'house' : 'tree';
      const persp = 1 - v * 0.45;
      if (kind === 'hotel') {
        out.push({x: xx, v, w: r.range(46, 96) * persp, h: r.range(60, 150) * persp, kind, c: r.pick(p.hotel), seed: r.int(0, 9999), sign: r.chance(0.6) ? SIGNS[signI++ % SIGNS.length] : undefined});
      } else if (kind === 'house') {
        out.push({x: xx, v, w: r.range(20, 40) * persp, h: r.range(14, 26) * persp, kind, c: r.pick(p.walls), seed: r.int(0, 9999)});
      } else {
        out.push({x: xx, v, w: r.range(16, 34) * persp, h: r.range(14, 26) * persp, kind, c: p.tree, seed: r.int(0, 9999)});
      }
    }
    return out.sort((a, b) => b.v - a.v);
  }, [seed, W, p]);
  const ridge = useMemo(() => {
    const pts: string[] = [`0,0`];
    for (let i = 0; i <= 80; i++) {
      const xx = (W * i) / 80;
      pts.push(`${xx.toFixed(1)},${(-hillHeight(xx, W, H, seed)).toFixed(1)}`);
    }
    pts.push(`${W},0`);
    return pts.join(' ');
  }, [W, H, seed]);
  const farRidge = useMemo(() => {
    const pts: string[] = [`-200,0`];
    for (let i = 0; i <= 60; i++) {
      const xx = -200 + ((W + 600) * i) / 60;
      const taper = clamp((xx + 60) / (W * 0.5));
      pts.push(`${xx.toFixed(1)},${(-H * (0.95 + 0.35 * noise1(i * 0.25, seed + 3)) * Math.pow(taper, 0.8)).toFixed(1)}`);
    }
    pts.push(`${W + 400},0`);
    return pts.join(' ');
  }, [W, H, seed]);
  const steamPts = useMemo(() => items.filter((b) => b.kind !== 'tree' && hash(b.seed) < 0.12).slice(0, 7), [items]);
  const castleX = W * 0.62;
  const castleY = -hillHeight(castleX, W, H, seed);
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <polygon points={farRidge} fill={T(p.far)} />
      <polygon points={ridge} fill={T(p.mid)} />
      {castle ? (
        <g transform={`translate(${castleX},${castleY + 6})`}>
          <rect x={-22} y={-26} width={44} height={26} fill={T('#efe9dd')} />
          <polygon points="-32,-26 32,-26 22,-38 -22,-38" fill={T('#4b5563')} />
          <rect x={-15} y={-50} width={30} height={12} fill={T('#efe9dd')} />
          <polygon points="-24,-50 24,-50 14,-60 -14,-60" fill={T('#4b5563')} />
          <rect x={-8} y={-68} width={16} height={8} fill={T('#efe9dd')} />
          <polygon points="-15,-68 15,-68 0,-80" fill={T('#4b5563')} />
          {neon > 0 ? <Glow x={0} y={-40} r={60} color="#ffcf8a" opacity={neon * 0.5} /> : null}
        </g>
      ) : null}
      {items.map((b, i) => {
        const hh = hillHeight(b.x, W, H, seed);
        const by = -hh * b.v;
        const haze = b.v * 0.35;
        const wall = mix(T(b.c), T(p.far), haze);
        if (b.kind === 'tree') {
          return (
            <g key={i}>
              <ellipse cx={b.x} cy={by - b.h * 0.5} rx={b.w / 2} ry={b.h / 2} fill={mix(T(p.tree), T(p.far), haze)} />
              <ellipse cx={b.x - b.w * 0.15} cy={by - b.h * 0.62} rx={b.w * 0.3} ry={b.h * 0.3} fill={mix(T(shade(p.tree, 0.12)), T(p.far), haze)} />
            </g>
          );
        }
        if (b.kind === 'house') {
          return (
            <g key={i}>
              <rect x={b.x - b.w / 2} y={by - b.h} width={b.w} height={b.h} fill={wall} />
              <polygon points={`${b.x - b.w / 2 - 3},${by - b.h} ${b.x + b.w / 2 + 3},${by - b.h} ${b.x + b.w / 2 - 4},${by - b.h - b.h * 0.45} ${b.x - b.w / 2 + 4},${by - b.h - b.h * 0.45}`} fill={mix(T(p.roof), T(p.far), haze)} />
              {detail > 0 ? (
                <rect x={b.x - b.w * 0.25} y={by - b.h * 0.7} width={b.w * 0.22} height={b.h * 0.3} fill={hash(b.seed) < lit * 1.5 ? p.lit : mix(T(p.window), T(p.far), haze)} />
              ) : null}
              {p.rim ? <rect x={b.x - b.w / 2} y={by - b.h - b.h * 0.45 - 1} width={b.w} height={1.6} fill={p.rim} opacity={0.6} /> : null}
            </g>
          );
        }
        // hotel
        const floors = Math.floor((b.h - 6) / 10);
        const cols = Math.floor((b.w - 6) / 8);
        const neonOn = b.sign && neon > 0 ? (hash(b.seed * 3) < neon ? 1 : 0) * (0.85 + 0.15 * Math.sin(t * 11 + b.seed)) : 0;
        const neonC = ['#ff6b7a', '#7af0d0', '#ffd36b', '#ff9ad5'][b.seed % 4];
        return (
          <g key={i}>
            <rect x={b.x - b.w / 2} y={by - b.h} width={b.w} height={b.h} fill={wall} />
            <rect x={b.x + b.w / 2} y={by - b.h + 3} width={b.w * 0.12} height={b.h - 3} fill={mix(T(shade(b.c, -0.25)), T(p.far), haze)} />
            {detail > 0
              ? Array.from({length: floors}, (_, f) => (
                  <g key={f}>
                    <rect x={b.x - b.w / 2} y={by - b.h + 8 + f * 10 + 6} width={b.w} height={1.3} fill={mix(T(shade(b.c, -0.12)), T(p.far), haze)} />
                    {Array.from({length: cols}, (_, k) => {
                      const on = hash(b.seed * 0.1 + f * 3.1 + k * 0.77) < lit;
                      return <rect key={k} x={b.x - b.w / 2 + 4 + k * 8} y={by - b.h + 8 + f * 10} width={5} height={5} fill={on ? p.lit : mix(T(p.window), T(p.far), haze)} />;
                    })}
                  </g>
                ))
              : null}
            {b.sign ? (
              <g>
                <rect x={b.x - b.w * 0.42} y={by - b.h - 16} width={b.w * 0.84} height={13} fill={neonOn ? '#1a1420' : mix(T('#f7f2e8'), T(p.far), haze)} stroke={mix(T('#b54a3c'), T(p.far), haze)} strokeWidth={1} />
                <text
                  x={b.x}
                  y={by - b.h - 6}
                  textAnchor="middle"
                  fontFamily="Maru"
                  fontWeight={900}
                  fontSize={Math.min(10, (b.w * 0.8) / Math.max(1, b.sign.length))}
                  fill={neonOn ? neonC : mix(T('#b54a3c'), T(p.far), haze)}
                >
                  {b.sign}
                </text>
                {neonOn ? <Glow x={b.x} y={by - b.h - 10} r={b.w * 0.7} color={neonC} opacity={0.55 * neonOn} /> : null}
              </g>
            ) : null}
            {p.rim ? <rect x={b.x - b.w / 2} y={by - b.h - 1} width={b.w} height={1.8} fill={p.rim} opacity={0.7} /> : null}
          </g>
        );
      })}
      {steam
        ? steamPts.map((b, i) => {
            const hh = hillHeight(b.x, W, H, seed);
            const by = -hh * b.v - b.h;
            return <SteamPlume key={i} x={b.x} y={by} t={t} seed={b.seed} scale={0.6 * (1 - b.v * 0.4)} color={mix('#ffffff', p.tint, 0.2)} />;
          })
        : null}
    </g>
  );
};

// 立ちのぼる湯けむり
export const SteamPlume: React.FC<{x: number; y: number; t: number; seed?: number; scale?: number; color?: string; rate?: number; life?: number; wind?: number; opacity?: number}> = ({
  x,
  y,
  t,
  seed = 1,
  scale = 1,
  color = '#ffffff',
  rate = 0.45,
  life = 6,
  wind = 10,
  opacity = 0.55,
}) => {
  const id = useUid('stm');
  const puffs: React.ReactNode[] = [];
  const n = Math.ceil(life / rate) + 1;
  const k0 = Math.floor(t / rate);
  for (let j = 0; j < n; j++) {
    const k = k0 - j;
    const birth = k * rate;
    const age = t - birth;
    if (age < 0 || age > life) continue;
    const u = age / life;
    const hv = hash(seed * 13.1 + k * 0.731);
    const rise = (60 + 180 * u) * u * 1.6;
    const px = x + (wind * age + Math.sin(age * 0.9 + hv * 6) * 10 * u + (hv - 0.5) * 10) * scale;
    const py = y - rise * scale;
    const rr = (10 + 46 * Math.sqrt(u)) * scale * (0.8 + hv * 0.4);
    const a = opacity * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.4);
    puffs.push(<circle key={k} cx={px} cy={py} r={rr} fill={`url(#${id})`} opacity={a} />);
  }
  return (
    <g>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={color} stopOpacity={0.9} />
          <stop offset="0.6" stopColor={color} stopOpacity={0.35} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      {puffs}
    </g>
  );
};

export const lerpPal = (a: CityPalette, b: CityPalette, k: number): CityPalette => ({
  ...a,
  tint: mix(a.tint, b.tint, k),
  tintAmt: lerp(a.tintAmt, b.tintAmt, k),
});

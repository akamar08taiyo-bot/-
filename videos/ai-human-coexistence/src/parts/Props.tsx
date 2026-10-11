import React from 'react';
import {hash, mix, sagPath, shade} from '../lib/math';
import {Glow, useUid} from './Sky';

// カモメ（羽ばたき）
export const Gull: React.FC<{x: number; y: number; s?: number; t: number; seed?: number; c?: string; tip?: string; dir?: number}> = ({
  x,
  y,
  s = 1,
  t,
  seed = 1,
  c = '#ffffff',
  tip = '#5b6270',
  dir = 1,
}) => {
  const ph = hash(seed) * 6.28;
  const glide = Math.sin(t * 0.7 + ph) > 0.4;
  const flap = glide ? 0.25 : Math.sin(t * 9 + ph);
  const wy = -10 * flap - 2;
  const d = `M-22,${wy + 6} Q-12,${wy - 4} -2,0 Q0,2 2,0 Q12,${wy - 4} 22,${wy + 6}`;
  return (
    <g transform={`translate(${x},${y}) scale(${s * dir},${s})`}>
      <path d={d} stroke={c} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M-22,${wy + 6} Q-19,${wy + 2} -16,${wy + 1}`} stroke={tip} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      <path d={`M22,${wy + 6} Q19,${wy + 2} 16,${wy + 1}`} stroke={tip} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      <ellipse cx={0} cy={1} rx={5} ry={2.2} fill={c} />
    </g>
  );
};

// 群れで横切るカモメ。path: 開始/終了位置と時間
export const GullFlight: React.FC<{t: number; t0: number; t1: number; x0: number; x1: number; y: number; s?: number; seed?: number; n?: number; c?: string; tip?: string}> = ({
  t,
  t0,
  t1,
  x0,
  x1,
  y,
  s = 1,
  seed = 1,
  n = 1,
  c,
  tip,
}) => {
  if (t < t0 - 0.5 || t > t1 + 0.5) return null;
  const u = (t - t0) / (t1 - t0);
  const dir = x1 > x0 ? 1 : -1;
  return (
    <g>
      {Array.from({length: n}, (_, i) => {
        const hv = hash(seed * 7 + i);
        const off = (i - (n - 1) / 2) * 40 * s;
        const xx = x0 + (x1 - x0) * u + off * 1.2 + hv * 20;
        const yy = y + Math.sin(t * 0.9 + hv * 6) * 10 * s + Math.abs(off) * 0.4;
        return <Gull key={i} x={xx} y={yy} s={s * (0.85 + hv * 0.3)} t={t} seed={seed * 10 + i} dir={dir} c={c} tip={tip} />;
      })}
    </g>
  );
};

// 電柱（正面から）。原点は根元
export const Pole: React.FC<{x: number; y: number; h: number; s?: number; c?: string; tr?: boolean}> = ({x, y, h, s = 1, c = '#5e5650', tr = true}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-5} y={-h} width={10} height={h} fill={c} />
    <rect x={-5} y={-h} width={3.5} height={h} fill={shade(c, 0.15)} />
    <rect x={-34} y={-h + 18} width={68} height={5} fill={c} />
    <rect x={-26} y={-h + 44} width={52} height={4} fill={c} />
    {[-30, -12, 12, 30].map((xx) => (
      <rect key={xx} x={xx - 2} y={-h + 11} width={4} height={7} rx={1} fill="#e8e2d6" />
    ))}
    {tr ? (
      <g>
        <rect x={7} y={-h + 60} width={18} height={30} rx={4} fill={shade(c, 0.12)} />
        <rect x={7} y={-h + 60} width={18} height={4} fill={shade(c, -0.2)} />
      </g>
    ) : null}
    {Array.from({length: Math.floor(h / 28)}, (_, i) => (i > 3 ? <rect key={i} x={-9} y={-h + 100 + i * 22} width={4} height={2} fill={shade(c, -0.2)} /> : null))}
  </g>
);

// 電線（たるみ付き）
export const Wires: React.FC<{lines: [number, number, number, number][]; sag?: number; c?: string; w?: number; t?: number}> = ({lines, sag = 26, c = '#2c2a2e', w = 1.6, t = 0}) => (
  <g>
    {lines.map(([x1, y1, x2, y2], i) => (
      <path key={i} d={sagPath(x1, y1, x2, y2, sag + Math.sin(t * 0.8 + i) * 1.2)} stroke={c} strokeWidth={w} fill="none" />
    ))}
  </g>
);

// 縦長の袖看板
export const VSign: React.FC<{x: number; y: number; w: number; h: number; text: string; bg?: string; fg?: string; font?: string; border?: string; glow?: number}> = ({
  x,
  y,
  w,
  h,
  text,
  bg = '#f7f1e3',
  fg = '#b53b2e',
  font = 'Maru',
  border,
  glow = 0,
}) => {
  const chars = Array.from(text);
  const fs = Math.min(w * 0.72, (h * 0.86) / chars.length);
  return (
    <g>
      {glow > 0 ? <Glow x={x + w / 2} y={y + h / 2} r={Math.max(w, h) * 0.9} color={fg} opacity={glow * 0.5} /> : null}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={bg} stroke={border ?? shade(bg, -0.3)} strokeWidth={1.5} />
      {chars.map((ch, i) => (
        <text
          key={i}
          x={x + w / 2}
          y={y + h * 0.07 + fs * (i + 0.86)}
          textAnchor="middle"
          fontFamily={font}
          fontWeight={900}
          fontSize={fs}
          fill={fg}
        >
          {ch}
        </text>
      ))}
    </g>
  );
};

// 横長の看板
export const HSign: React.FC<{x: number; y: number; w: number; h: number; text: string; bg?: string; fg?: string; font?: string; weight?: number; border?: string; glow?: number; ls?: number}> = ({
  x,
  y,
  w,
  h,
  text,
  bg = '#f7f1e3',
  fg = '#b53b2e',
  font = 'Maru',
  weight = 900,
  border,
  glow = 0,
  ls = 0.08,
}) => {
  const fs = Math.min(h * 0.68, (w * 0.86) / (Array.from(text).length * (1 + ls)));
  return (
    <g>
      {glow > 0 ? <Glow x={x + w / 2} y={y + h / 2} r={w * 0.7} color={fg} opacity={glow * 0.55} /> : null}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={bg} stroke={border ?? shade(bg, -0.3)} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 + fs * 0.36} textAnchor="middle" fontFamily={font} fontWeight={weight} fontSize={fs} fill={fg} letterSpacing={`${ls}em`}>
        {text}
      </text>
    </g>
  );
};

// 提灯
export const Lantern: React.FC<{x: number; y: number; s?: number; c?: string; text?: string; t?: number; seed?: number; glow?: number}> = ({
  x,
  y,
  s = 1,
  c = '#e0493a',
  text,
  t = 0,
  seed = 1,
  glow = 1,
}) => {
  const id = useUid('ln');
  const sw = Math.sin(t * 1.5 + seed) * 3;
  const fl = 0.9 + 0.1 * Math.sin(t * 8 + seed * 3);
  return (
    <g transform={`translate(${x},${y}) rotate(${sw}) scale(${s})`}>
      <defs>
        <radialGradient id={id} cx="0.45" cy="0.45" r="0.6">
          <stop offset="0" stopColor={mix(c, '#fff3c0', 0.75)} />
          <stop offset="0.7" stopColor={c} />
          <stop offset="1" stopColor={shade(c, -0.35)} />
        </radialGradient>
      </defs>
      <Glow x={0} y={22} r={58} color="#ffb85a" opacity={0.55 * glow * fl} />
      <line x1={0} y1={-6} x2={0} y2={2} stroke="#2a2420" strokeWidth={1.5} />
      <rect x={-9} y={0} width={18} height={5} rx={1} fill="#2a2420" />
      <ellipse cx={0} cy={22} rx={15} ry={19} fill={`url(#${id})`} opacity={fl} />
      {[8, 14, 20, 26, 32, 37].map((yy) => (
        <path key={yy} d={`M${-Math.sqrt(Math.max(0, 1 - Math.pow((yy - 22) / 19, 2))) * 15},${yy} Q0,${yy + 1.5} ${Math.sqrt(Math.max(0, 1 - Math.pow((yy - 22) / 19, 2))) * 15},${yy}`} stroke={shade(c, -0.3)} strokeWidth={0.7} fill="none" opacity={0.5} />
      ))}
      {text ? (
        <text x={0} y={27} textAnchor="middle" fontFamily="Brush" fontSize={13} fill="#2a1a14" opacity={0.85}>
          {text}
        </text>
      ) : null}
      <rect x={-9} y={39} width={18} height={5} rx={1} fill="#2a2420" />
    </g>
  );
};

// 提灯の列（垂れた紐に沿って）
export const LanternString: React.FC<{x1: number; y1: number; x2: number; y2: number; n: number; sag?: number; s?: number; t: number; colors?: string[]; seed?: number; glow?: number; texts?: string[]}> = ({
  x1,
  y1,
  x2,
  y2,
  n,
  sag = 30,
  s = 1,
  t,
  colors = ['#e0493a', '#f1e9d8'],
  seed = 1,
  glow = 1,
  texts,
}) => (
  <g>
    <path d={sagPath(x1, y1, x2, y2, sag)} stroke="#2a2420" strokeWidth={1.3 * s} fill="none" />
    {Array.from({length: n}, (_, i) => {
      const u = (i + 0.5) / n;
      const xx = x1 + (x2 - x1) * u;
      const yy = y1 + (y2 - y1) * u + sag * 4 * u * (1 - u) * 0.5 * 2 * 0.5;
      return <Lantern key={i} x={xx} y={yy} s={s} c={colors[i % colors.length]} t={t} seed={seed * 13 + i} glow={glow} text={texts ? texts[i % texts.length] : undefined} />;
    })}
  </g>
);

// 洗濯物の列
export const Laundry: React.FC<{x: number; y: number; w: number; t: number; seed?: number; s?: number; tint?: (c: string) => string}> = ({x, y, w, t, seed = 1, s = 1, tint = (c) => c}) => {
  const n = Math.floor(w / (26 * s));
  return (
    <g>
      <path d={sagPath(x, y, x + w, y, 6 * s)} stroke={tint('#6b6b6b')} strokeWidth={1.2} fill="none" />
      {Array.from({length: n}, (_, i) => {
        const hv = hash(seed * 3.3 + i);
        if (hv < 0.25) return null;
        const xx = x + (i + 0.5) * (w / n);
        const sag = 6 * s * 4 * ((xx - x) / w) * (1 - (xx - x) / w);
        const c = ['#f4f1ea', '#e9a3a3', '#a7c7e7', '#f2d27c', '#ffffff', '#b7d7a8'][Math.floor(hv * 6)];
        const sw = Math.sin(t * 2 + i) * 4;
        const isShirt = hv > 0.6;
        return (
          <g key={i} transform={`translate(${xx},${y + sag}) rotate(${sw}) scale(${s})`}>
            {isShirt ? (
              <path d="M-9,0 L-4,0 Q0,3 4,0 L9,0 L12,6 L8,8 L8,20 L-8,20 L-8,8 L-12,6 Z" fill={tint(c)} />
            ) : (
              <rect x={-7} y={0} width={14} height={18 + hv * 8} fill={tint(c)} />
            )}
          </g>
        );
      })}
    </g>
  );
};

// 風鈴
export const Furin: React.FC<{x: number; y: number; s?: number; t: number; gust?: number; seed?: number}> = ({x, y, s = 1, t, gust = 0, seed = 1}) => {
  const sw = Math.sin(t * 2.4 + seed) * (6 + gust * 16) + Math.sin(t * 5.1 + seed) * gust * 6;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <line x1={0} y1={-20} x2={0} y2={0} stroke="#555" strokeWidth={1} />
      <path d="M-11,14 Q-11,0 0,0 Q11,0 11,14 Z" fill="#cfeef5" opacity={0.85} stroke="#9cc9d4" strokeWidth={0.8} />
      <path d="M-6,8 Q-3,4 0,9 Q3,4 6,8" stroke="#e05a4a" strokeWidth={1.4} fill="none" />
      <g transform={`rotate(${sw})`}>
        <line x1={0} y1={6} x2={0} y2={34} stroke="#555" strokeWidth={0.8} />
        <rect x={-5} y={34} width={10} height={22} fill="#f4efe2" stroke="#d9d1bf" strokeWidth={0.6} />
        <text x={0} y={49} textAnchor="middle" fontFamily="Brush" fontSize={7} fill="#3a5a8a">
          涼
        </text>
      </g>
    </g>
  );
};

// 猫（座り・丸まり）
export const Cat: React.FC<{x: number; y: number; s?: number; t: number; c?: string; pose?: 'sit' | 'curl'; dir?: number}> = ({x, y, s = 1, t, c = '#e8b06a', pose = 'sit', dir = 1}) => {
  const tail = Math.sin(t * 1.3) * 10;
  const ear = Math.sin(t * 0.5) > 0.95 ? -6 : 0;
  if (pose === 'curl')
    return (
      <g transform={`translate(${x},${y}) scale(${s * dir},${s})`}>
        <ellipse cx={0} cy={-10} rx={24} ry={11} fill={c} />
        <circle cx={18} cy={-12} r={8.5} fill={c} />
        <polygon points={`13,-18 17,${-27 + ear * 0.3} 20,-18`} fill={c} />
        <polygon points={`20,-18 25,${-26 + ear * 0.3} 26,-15`} fill={c} />
        <path d="M-22,-6 Q-6,4 14,-2" stroke={shade(c, -0.25)} strokeWidth={4} fill="none" strokeLinecap="round" />
        <path d="M16,-12 q2,1.5 4,0" stroke="#3a2a20" strokeWidth={0.8} fill="none" />
        <path d="M-6,-16 q6,-3 10,0 M-14,-13 q5,-3 9,0" stroke={shade(c, -0.18)} strokeWidth={1.6} fill="none" />
      </g>
    );
  return (
    <g transform={`translate(${x},${y}) scale(${s * dir},${s})`}>
      <path d={`M-8,-4 Q-26,-10 ${-22 + tail * 0.3},${-26 - tail * 0.2}`} stroke={c} strokeWidth={5} fill="none" strokeLinecap="round" />
      <ellipse cx={0} cy={-16} rx={12} ry={16} fill={c} />
      <circle cx={2} cy={-36} r={10} fill={c} />
      <polygon points="-6,-42 -4,-54 2,-44" fill={c} />
      <polygon points="4,-44 10,-53 11,-40" fill={c} />
      <path d="M-2,-37 q2,1.5 3,0 M5,-37 q2,1.5 3,0" stroke="#3a2a20" strokeWidth={0.9} fill="none" />
    </g>
  );
};

// 自動販売機
export const Vending: React.FC<{x: number; y: number; s?: number; c?: string; night?: number}> = ({x, y, s = 1, c = '#d8423a', night = 0}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    {night > 0 ? <Glow x={0} y={-50} r={90} color="#e8f6ff" opacity={night * 0.6} /> : null}
    <rect x={-24} y={-100} width={48} height={100} rx={3} fill={c} />
    <rect x={-20} y={-94} width={40} height={42} rx={2} fill={night > 0 ? '#eaf6ff' : '#dfe9ef'} />
    {[0, 1, 2].map((r) =>
      [0, 1, 2, 3].map((k) => <rect key={`${r}-${k}`} x={-17 + k * 9.5} y={-90 + r * 13} width={6} height={10} rx={2} fill={['#4a8fd8', '#f0c040', '#e86a5a', '#6ac080'][(r + k) % 4]} />),
    )}
    <rect x={-20} y={-46} width={40} height={4} fill={shade(c, -0.2)} />
    <rect x={-16} y={-24} width={32} height={10} rx={2} fill="#2a2a2a" />
  </g>
);

// 丸ポスト
export const Post: React.FC<{x: number; y: number; s?: number}> = ({x, y, s = 1}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-12} y={-64} width={24} height={64} rx={4} fill="#d8392e" />
    <rect x={-12} y={-64} width={8} height={64} rx={3} fill="#ea5a4c" />
    <ellipse cx={0} cy={-64} rx={13} ry={5} fill="#c42f25" />
    <rect x={-8} y={-50} width={16} height={3} fill="#3a1a14" />
    <rect x={-6} y={-38} width={12} height={9} fill="#fff4e6" />
  </g>
);

export const Bicycle: React.FC<{x: number; y: number; s?: number; c?: string}> = ({x, y, s = 1, c = '#3d6fa8'}) => (
  <g transform={`translate(${x},${y}) scale(${s})`} fill="none" strokeLinecap="round">
    <circle cx={-22} cy={-14} r={14} stroke="#2a2a2a" strokeWidth={2.4} />
    <circle cx={22} cy={-14} r={14} stroke="#2a2a2a" strokeWidth={2.4} />
    <polyline points="-22,-14 -6,-14 4,-34 -12,-34 -22,-14" stroke={c} strokeWidth={3} />
    <line x1={-6} y1={-14} x2={-12} y2={-38} stroke={c} strokeWidth={3} />
    <line x1={4} y1={-34} x2={22} y2={-14} stroke={c} strokeWidth={3} />
    <line x1={4} y1={-34} x2={8} y2={-44} stroke={c} strokeWidth={3} />
    <line x1={2} y1={-44} x2={14} y2={-46} stroke="#2a2a2a" strokeWidth={3} />
    <rect x={-18} y={-41} width={12} height={4} rx={2} fill="#2a2a2a" stroke="none" />
    <rect x={10} y={-42} width={14} height={9} rx={2} fill="none" stroke="#777" strokeWidth={1.5} />
  </g>
);

// エアカーの遠い灯り（夜明け・夜の遠景用）
export const FarLight: React.FC<{x: number; y: number; t: number; c?: string; r?: number; trail?: number; dir?: number}> = ({x, y, t, c = '#fff1c8', r = 2.4, trail = 26, dir = 1}) => (
  <g>
    <rect x={dir > 0 ? x - trail : x} y={y - r * 0.35} width={trail} height={r * 0.7} rx={r * 0.35} fill={c} opacity={0.25} />
    <Glow x={x} y={y} r={r * 7} color={c} opacity={0.7 + 0.3 * Math.sin(t * 6)} />
    <circle cx={x} cy={y} r={r} fill={c} />
  </g>
);

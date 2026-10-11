import React from 'react';
import {mix, shade} from '../lib/math';
import {Glow, useUid} from './Sky';

type Tint = {tint?: string; tintAmt?: number};
const tf = (tint?: string, amt?: number) => (c: string) => (tint && amt ? mix(c, tint, amt) : c);

// 空飛ぶ車（横から）。dir=1 で右向き
export const AirCar: React.FC<
  {
    x: number;
    y: number;
    s?: number;
    dir?: number;
    t: number;
    body?: string;
    lower?: string;
    night?: number;
    driver?: 'robot' | 'person' | 'none';
    blink?: number; // ウインカー
    seed?: number;
  } & Tint
> = ({x, y, s = 1, dir = 1, t, body = '#f2ead8', lower = '#e0705a', night = 0, driver = 'person', blink = 0, seed = 1, tint, tintAmt}) => {
  const T = tf(tint, tintAmt);
  const id = useUid('car');
  const bob = Math.sin(t * 2.1 + seed) * 2.2;
  const glowA = 0.55 + 0.25 * Math.sin(t * 9 + seed);
  return (
    <g transform={`translate(${x},${y + bob}) scale(${s * dir},${s})`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9f1ff" stopOpacity={0.95} />
          <stop offset="1" stopColor="#7fa7c4" stopOpacity={0.85} />
        </linearGradient>
      </defs>
      {night > 0 ? <polygon points="62,-6 340,-40 340,40" fill="#fff3c4" opacity={0.12 * night} /> : null}
      <ellipse cx={-28} cy={20} rx={20} ry={6} fill="#9ff2ff" opacity={glowA * 0.6} />
      <ellipse cx={30} cy={20} rx={20} ry={6} fill="#9ff2ff" opacity={glowA * 0.6} />
      <Glow x={0} y={24} r={70} color="#9ff2ff" opacity={0.25 + night * 0.35} />
      <path d="M-58,-2 Q-62,-16 -46,-20 L40,-20 Q62,-18 66,-2 Q64,10 46,13 L-46,13 Q-60,11 -58,-2 Z" fill={T(body)} />
      <path d="M-58,-2 L66,-2 Q64,10 46,13 L-46,13 Q-60,11 -58,-2 Z" fill={T(lower)} />
      <rect x={-56} y={-4} width={120} height={2.4} fill={T('#f7f7f7')} opacity={0.9} />
      <path d="M-30,-20 Q-22,-44 6,-44 Q32,-44 40,-20 Z" fill={`url(#${id})`} />
      {driver === 'person' ? (
        <g>
          <circle cx={12} cy={-27} r={6.5} fill={T('#3a2e2a')} />
          <rect x={6} y={-22} width={13} height={4} rx={2} fill={T('#5b6e8c')} />
        </g>
      ) : driver === 'robot' ? (
        <g>
          <rect x={4} y={-36} width={17} height={14} rx={5} fill={T('#e9e3d2')} />
          <rect x={7} y={-33} width={11} height={7} rx={2} fill="#1c2638" />
          <circle cx={10} cy={-29.5} r={1.4} fill="#9ff3ff" />
          <circle cx={15} cy={-29.5} r={1.4} fill="#9ff3ff" />
        </g>
      ) : null}
      <path d="M-24,-22 Q-14,-40 6,-41" stroke="#ffffff" strokeWidth={2.5} fill="none" opacity={0.6} strokeLinecap="round" />
      <polygon points="-50,-20 -40,-20 -48,-34 -56,-34" fill={T(lower)} />
      <ellipse cx={-28} cy={15} rx={14} ry={4.5} fill={T('#7c8592')} />
      <ellipse cx={30} cy={15} rx={14} ry={4.5} fill={T('#7c8592')} />
      <circle cx={63} cy={-6} r={4} fill="#fff6d6" />
      {night > 0 ? <Glow x={63} y={-6} r={26} color="#fff3c4" opacity={night} /> : null}
      <circle cx={-57} cy={-6} r={3.2} fill="#ff4a3a" />
      {night > 0 ? <Glow x={-57} y={-6} r={16} color="#ff4a3a" opacity={night * 0.8} /> : null}
      {blink > 0 ? (
        <g opacity={Math.sin(t * Math.PI * 2.5) > 0 ? 1 : 0}>
          <circle cx={58} cy={8} r={3} fill="#ffb02e" />
          <Glow x={58} y={8} r={18} color="#ffb02e" opacity={0.9} />
        </g>
      ) : null}
    </g>
  );
};

// 路面電車（横から・右向き）。原点はレール中央
export const Tram: React.FC<{x: number; y: number; s?: number; t: number; lower?: string; upper?: string; night?: number; moving?: boolean} & Tint> = ({
  x,
  y,
  s = 1,
  t,
  lower = '#c8503e',
  upper = '#f1e7cf',
  night = 0,
  moving = true,
  tint,
  tintAmt,
}) => {
  const T = tf(tint, tintAmt);
  const jig = moving ? Math.sin(t * 13) * 0.6 : 0;
  const winC = T('#46607a');
  const people = [true, false, true, true, false, true, true, false];
  return (
    <g transform={`translate(${x},${y + jig}) scale(${s})`}>
      {/* パンタグラフ */}
      <g stroke={T('#4b4b4b')} strokeWidth={2} fill="none">
        <polyline points="-30,-96 -12,-124 6,-96" />
        <polyline points="-30,-96 -12,-112 6,-96" />
        <line x1={-26} y1={-126} x2={2} y2={-126} strokeWidth={3} />
      </g>
      <rect x={-60} y={-100} width={46} height={7} rx={2} fill={T('#7d7d7d')} />
      <rect x={30} y={-100} width={36} height={7} rx={2} fill={T('#7d7d7d')} />
      <rect x={-172} y={-96} width={344} height={86} rx={16} fill={T(upper)} />
      <rect x={-172} y={-46} width={344} height={36} rx={4} fill={T(lower)} />
      <rect x={-172} y={-50} width={344} height={4} fill={T(shade(lower, 0.25))} />
      {Array.from({length: 8}, (_, i) => {
        const wx = -150 + i * 38;
        return (
          <g key={i}>
            <rect x={wx} y={-84} width={28} height={28} rx={4} fill={night > 0 ? mix(winC, '#ffe3a0', night * 0.85) : winC} />
            {people[i] ? (
              <g>
                <circle cx={wx + 14} cy={-66} r={5.5} fill={T('#2f2a2a')} opacity={0.85} />
                <rect x={wx + 7} y={-61} width={14} height={6} rx={3} fill={T('#2f2a2a')} opacity={0.85} />
              </g>
            ) : null}
            <rect x={wx + 2} y={-82} width={24} height={4} fill="#ffffff" opacity={0.25} />
          </g>
        );
      })}
      <rect x={146} y={-86} width={20} height={44} rx={5} fill={night > 0 ? mix(winC, '#ffe3a0', night * 0.6) : winC} />
      {/* 車掌ロボット */}
      <rect x={148} y={-76} width={15} height={13} rx={4} fill={T('#efe8d6')} />
      <rect x={150} y={-73} width={11} height={7} rx={2} fill="#1c2638" />
      <circle cx={153} cy={-69.5} r={1.4} fill="#9ff3ff" />
      <circle cx={158} cy={-69.5} r={1.4} fill="#9ff3ff" />
      <rect x={147} y={-80} width={17} height={4} rx={1} fill={T('#2d3a5a')} />
      <rect x={-20} y={-94} width={40} height={10} rx={2} fill={T('#2a2a2a')} />
      <text x={0} y={-86} textAnchor="middle" fontFamily="Maru" fontWeight={900} fontSize={8} fill="#ffe9a8">
        湯ノ島
      </text>
      <circle cx={168} cy={-30} r={6} fill="#fff4d0" />
      <Glow x={168} y={-30} r={30} color="#fff2c0" opacity={0.4 + night * 0.6} />
      <rect x={-130} y={-12} width={60} height={10} rx={3} fill={T('#3a3a3a')} />
      <rect x={70} y={-12} width={60} height={10} rx={3} fill={T('#3a3a3a')} />
      {[-116, -84, 84, 116].map((wx) => (
        <circle key={wx} cx={wx} cy={-2} r={7} fill={T('#2b2b2b')} />
      ))}
    </g>
  );
};

// 漁船（横から・右向き）
export const Boat: React.FC<{x: number; y: number; s?: number; t: number; hull?: string; cabin?: string; light?: number; seed?: number; dir?: number} & Tint> = ({
  x,
  y,
  s = 1,
  t,
  hull = '#f0ece2',
  cabin = '#f6f2ea',
  light = 0,
  seed = 1,
  dir = 1,
  tint,
  tintAmt,
}) => {
  const T = tf(tint, tintAmt);
  const bob = Math.sin(t * 1.6 + seed) * 2.5;
  const pitch = Math.sin(t * 1.3 + seed * 2) * 2;
  return (
    <g transform={`translate(${x},${y + bob}) rotate(${pitch}) scale(${s * dir},${s})`}>
      <path d="M-70,-14 L70,-22 Q66,0 50,8 L-58,8 Q-70,2 -70,-14 Z" fill={T(hull)} />
      <path d="M-66,-4 L68,-8 Q64,0 50,8 L-58,8 Q-68,4 -66,-4 Z" fill={T('#2f4f6f')} />
      <rect x={-30} y={-44} width={36} height={26} rx={3} fill={T(cabin)} />
      <rect x={-24} y={-38} width={10} height={8} fill={light > 0 ? '#ffd88a' : T('#46607a')} />
      <rect x={-10} y={-38} width={10} height={8} fill={T('#46607a')} />
      <line x1={-12} y1={-44} x2={-12} y2={-86} stroke={T('#555')} strokeWidth={2} />
      <line x1={-12} y1={-80} x2={40} y2={-20} stroke={T('#666')} strokeWidth={1} />
      <polygon points="-12,-86 6,-82 -12,-78" fill={T('#d84a3a')} />
      {light > 0 ? <Glow x={-12} y={-88} r={22} color="#ffe7a0" opacity={light} /> : null}
      <circle cx={-12} cy={-88} r={2.5} fill="#ffe7a0" />
    </g>
  );
};

// 航跡（船の後ろの白い筋）
export const Wake: React.FC<{x: number; y: number; len: number; t: number; dir?: number; opacity?: number}> = ({x, y, len, t, dir = 1, opacity = 0.6}) => {
  const n = 8;
  return (
    <g opacity={opacity}>
      {Array.from({length: n}, (_, i) => {
        const u = i / n;
        const xx = x - dir * len * u;
        const spread = 4 + u * 26;
        const a = (1 - u) * (0.6 + 0.4 * Math.sin(t * 4 + i));
        return (
          <g key={i} opacity={a}>
            <rect x={xx - 14} y={y - spread * 0.25} width={28} height={2} rx={1} fill="#ffffff" />
            <rect x={xx - 10} y={y + spread * 0.2} width={20} height={2} rx={1} fill="#ffffff" />
          </g>
        );
      })}
    </g>
  );
};

// ロープウェイのゴンドラ。原点はケーブル上の握索点
export const Gondola: React.FC<{x: number; y: number; s?: number; t: number; c?: string; accent?: string; people?: ('kid' | 'robot' | 'adult')[]; night?: number; angle?: number} & Tint> = ({
  x,
  y,
  s = 1,
  t,
  c = '#f1e7cf',
  accent = '#c8503e',
  people = ['kid', 'robot'],
  night = 0,
  angle = 0,
  tint,
  tintAmt,
}) => {
  const T = tf(tint, tintAmt);
  const sway = Math.sin(t * 1.4) * 2.5 + angle;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x={-10} y={-6} width={20} height={10} rx={3} fill={T('#55585d')} />
      <g transform={`rotate(${sway})`}>
        <line x1={0} y1={0} x2={0} y2={46} stroke={T('#55585d')} strokeWidth={4} />
        <path d="M0,46 L-30,46 L-30,52" stroke={T('#55585d')} strokeWidth={3} fill="none" />
        <rect x={-46} y={50} width={92} height={70} rx={14} fill={T(c)} />
        <rect x={-46} y={100} width={92} height={20} rx={8} fill={T(accent)} />
        <rect x={-38} y={60} width={76} height={34} rx={6} fill={night > 0 ? mix(T('#5d7895'), '#ffe2a0', night * 0.7) : T('#5d7895')} />
        {people.map((p, i) => {
          const px = -20 + i * 30;
          if (p === 'robot')
            return (
              <g key={i}>
                <rect x={px - 9} y={70} width={18} height={15} rx={5} fill={T('#efe8d6')} />
                <rect x={px - 6} y={73} width={12} height={8} rx={2} fill="#1c2638" />
                <circle cx={px - 3} cy={77} r={1.5} fill="#9ff3ff" />
                <circle cx={px + 3} cy={77} r={1.5} fill="#9ff3ff" />
                <line x1={px} y1={70} x2={px} y2={64} stroke={T('#888')} strokeWidth={1.5} />
                <circle cx={px} cy={63} r={2} fill="#ff6b5b" />
              </g>
            );
          return (
            <g key={i}>
              <circle cx={px} cy={p === 'kid' ? 79 : 74} r={p === 'kid' ? 7 : 8} fill={T('#2f2624')} />
              <rect x={px - 9} y={p === 'kid' ? 85 : 81} width={18} height={10} rx={4} fill={T(p === 'kid' ? '#f3f0e6' : '#6a7d9a')} />
              {p === 'kid' ? <ellipse cx={px} cy={74} rx={11} ry={3} fill={T('#e8c76a')} /> : null}
            </g>
          );
        })}
        <rect x={-36} y={62} width={72} height={6} fill="#ffffff" opacity={0.2} />
      </g>
    </g>
  );
};

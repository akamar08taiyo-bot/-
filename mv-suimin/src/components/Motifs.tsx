import React from 'react';
import { C, MotifName } from '../data/meta';
import { F } from '../lib/fonts';
import { clamp01, eback, eio, eo, hash, lerp, prog } from '../lib/anim';

export type MotifProps = { t: number; ps: number[]; d: number; k: number; s: number };
// t: seconds since the line starts, ps: phrase starts relative to the line, d: line length,
// k / s: kick / snare pulse (0..1). Drawing space is 920 x 700.

const mk = (t: number, ps: number[]) => (i: number, d = 0.3, e: (x: number) => number = eo) =>
  prog(t, ps[Math.min(i, ps.length - 1)] ?? 0, d, e);
const back = (s = 1.6) => (x: number) => eback(x, s);

const Stamp: React.FC<{ x: number; y: number; text: string; p: number; color?: string; rot?: number; size?: number; fill?: string }> = ({
  x, y, text, p, color = C.red, rot = -10, size = 56, fill = 'none',
}) => {
  if (p <= 0) return null;
  const sc = lerp(1.9, 1, eo(p));
  const w = size * text.length * 1.05 + size * 0.8;
  const h = size * 1.5;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${sc})`} opacity={clamp01(p * 3)}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={10} fill={fill} stroke={color} strokeWidth={7} />
      <text x={0} y={size * 0.36} textAnchor="middle" fontFamily={F.display} fontSize={size} fill={color}>
        {text}
      </text>
    </g>
  );
};

const Clock: React.FC<{ x: number; y: number; r: number; a1: number; a2: number; color?: string; o?: number }> = ({ x, y, r, a1, a2, color = C.paper, o = 1 }) => (
  <g transform={`translate(${x} ${y})`} opacity={o}>
    <circle r={r} fill="none" stroke={color} strokeWidth={r * 0.07} />
    {Array.from({ length: 12 }).map((_, i) => (
      <line key={i} x1={0} y1={-r * 0.78} x2={0} y2={-r * 0.9} stroke={color} strokeWidth={r * 0.05} transform={`rotate(${i * 30})`} />
    ))}
    <line x1={0} y1={0} x2={0} y2={-r * 0.5} stroke={color} strokeWidth={r * 0.08} strokeLinecap="round" transform={`rotate(${a1})`} />
    <line x1={0} y1={0} x2={0} y2={-r * 0.74} stroke={C.red} strokeWidth={r * 0.05} strokeLinecap="round" transform={`rotate(${a2})`} />
    <circle r={r * 0.07} fill={color} />
  </g>
);

const Silhouette: React.FC<{ x: number; y: number; s?: number; flip?: boolean; fill?: string; o?: number; nose?: boolean }> = ({ x, y, s = 1, flip, fill = C.paper, o = 1, nose = true }) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} opacity={o}>
    <ellipse cx={0} cy={-120} rx={70} ry={84} fill={fill} />
    <path d="M -150 120 C -150 10, -70 -30, 0 -30 C 70 -30, 150 10, 150 120 Z" fill={fill} />
    {nose ? <path d="M 52 -150 L 92 -128 L 70 -112" fill={fill} /> : null}
  </g>
);

const Eye: React.FC<{ x: number; y: number; w: number; h: number; lid: number; iris?: string; stroke?: string }> = ({ x, y, w, h, lid, iris = C.blue, stroke = C.paper }) => {
  // lid: 0 open .. 1 closed
  const top = `M ${-w / 2} 0 Q 0 ${-h} ${w / 2} 0`;
  const bottom = `M ${-w / 2} 0 Q 0 ${h} ${w / 2} 0`;
  const lidY = lerp(-h, 0, lid);
  const id = `eye${Math.round(x)}${Math.round(y)}`;
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <clipPath id={id}>
          <path d={`M ${-w / 2} 0 Q 0 ${lidY} ${w / 2} 0 Q 0 ${h} ${-w / 2} 0 Z`} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x={-w / 2} y={-h} width={w} height={2 * h} fill="#f7f3ea" />
        <circle r={h * 0.42} fill={iris} />
        <circle r={h * 0.2} fill={C.ink} />
        <circle cx={-h * 0.12} cy={-h * 0.14} r={h * 0.07} fill="#fff" />
      </g>
      <path d={bottom} fill="none" stroke={stroke} strokeWidth={8} />
      <path d={`M ${-w / 2} 0 Q 0 ${lidY} ${w / 2} 0`} fill="none" stroke={stroke} strokeWidth={10} strokeLinecap="round" />
      {lid < 0.95 ? <path d={top} fill="none" stroke={stroke} strokeWidth={3} opacity={0.25} /> : null}
    </g>
  );
};

const Toggle: React.FC<{ x: number; y: number; on: number; color: string }> = ({ x, y, on, color }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={0} y={-34} width={150} height={68} rx={34} fill={on > 0.5 ? color : '#2a2d36'} />
    <circle cx={lerp(34, 116, on)} cy={0} r={26} fill={C.paper} />
  </g>
);

// ---------------------------------------------------------------- VERSE 1
const Bars: React.FC<MotifProps> = ({ t, ps, k }) => {
  const P = mk(t, ps);
  const a = P(0, 0.4, back(1.3));
  const b = P(1, 0.55, back(1.1));
  const c = P(2, 0.25);
  const spin = Math.max(0, t - (ps[2] ?? 99));
  return (
    <g>
      <text x={70} y={196} fontFamily={F.sans} fontWeight={900} fontSize={50} fill={C.paper}>睡眠</text>
      <rect x={210} y={146} width={Math.max(0, 150 * a)} height={64} rx={12} fill={C.blue} />
      <text x={210 + 150 * a + 24} y={192} fontFamily={F.dot} fontSize={40} fill={C.blue} opacity={a}>SHORT</text>
      <text x={70} y={336} fontFamily={F.sans} fontWeight={900} fontSize={50} fill={C.paper} opacity={clamp01(b * 4)}>配信</text>
      <rect x={210} y={286} width={Math.max(0, 640 * b)} height={64} rx={12} fill={C.red} />
      <text x={210 + 640 * b - 24} y={332} textAnchor="end" fontFamily={F.dot} fontSize={40} fill={C.ink} opacity={b}>LONG</text>
      <Clock x={460} y={545} r={118 + 6 * k} a1={spin * 900} a2={spin * 2600} o={c} />
    </g>
  );
};

const Ledger: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const drop = prog(t, -0.12, 0.35, back(1.2));
  const rows = [
    { y: 270, label: '時間', p: P(0, 0.3), stamp: '黒字', c: C.ink },
    { y: 400, label: '目元', p: P(1, 0.3), stamp: '黒字', c: C.ink },
  ];
  const r3 = P(2, 0.3);
  const plus = Math.max(0, Math.floor((t - (ps[2] ?? 99)) / 0.14));
  return (
    <g transform={`translate(0 ${(1 - drop) * -500}) rotate(-2 460 350)`}>
      <rect x={90} y={70} width={740} height={570} rx={8} fill={C.paper} />
      <text x={130} y={150} fontFamily={F.sans} fontWeight={900} fontSize={40} fill={C.ink}>勘定</text>
      <text x={540} y={150} fontFamily={F.sans} fontWeight={900} fontSize={40} fill={C.ink}>収支</text>
      <line x1={110} y1={180} x2={810} y2={180} stroke={C.ink} strokeWidth={5} />
      {[310, 440, 570].map((y) => (
        <line key={y} x1={110} y1={y} x2={810} y2={y} stroke={C.ink} strokeOpacity={0.25} strokeWidth={2} />
      ))}
      <line x1={500} y1={100} x2={500} y2={620} stroke={C.red} strokeWidth={3} />
      <line x1={508} y1={100} x2={508} y2={620} stroke={C.red} strokeWidth={3} />
      {rows.map((r) => (
        <g key={r.label} opacity={clamp01(r.p * 3)}>
          <text x={140} y={r.y} fontFamily={F.display} fontSize={64} fill={C.ink}>{r.label}</text>
          <text x={545} y={r.y} fontFamily={F.display} fontSize={64} fill={C.ink}>＋</text>
          <Stamp x={700} y={r.y - 22} text={r.stamp} p={r.p} color={r.c} size={48} />
        </g>
      ))}
      <g opacity={clamp01(r3 * 3)}>
        <rect x={120} y={470} width={680} height={130} rx={8} fill="none" stroke={C.red} strokeWidth={4} strokeDasharray="14 10" />
        <text x={140} y={560} fontFamily={F.display} fontSize={64} fill={C.red}>クマ</text>
        <text x={545} y={560} fontFamily={F.display} fontSize={52} fill={C.red}>{'＋'.repeat(Math.min(5, plus + 1))}</text>
        <text x={790} y={500} textAnchor="end" fontFamily={F.sans} fontWeight={700} fontSize={26} fill={C.red}>帳簿外</text>
      </g>
    </g>
  );
};

const Chart: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = P(0, Math.max(0.6, (ps[1] ?? 1) - 0.1), eio);
  const b = P(1, 0.55, eo);
  const pts: [number, number][] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const x = 80 + (440 * i) / N;
    pts.push([x, 330 - (100 * i) / N - 26 * Math.sin(i * 1.3) * (i % 3 === 0 ? 1 : 0.4)]);
  }
  const rise = pts.slice(0, Math.max(1, Math.round(N * a)) + 1);
  const crash: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    if (f > b) break;
    crash.push([520 + 320 * f, lerp(230, 580, Math.pow(f, 1.6)) + 18 * Math.sin(i * 2.1)]);
  }
  const all = b > 0 ? [...pts, ...crash] : rise;
  const poly = all.map((p) => p.join(',')).join(' ');
  const cross = crash.find((p) => p[1] > 330);
  const under = crash.filter((p) => p[1] > 330);
  return (
    <g>
      <line x1={80} y1={60} x2={80} y2={640} stroke={C.dim} strokeWidth={4} />
      <line x1={80} y1={640} x2={860} y2={640} stroke={C.dim} strokeWidth={4} />
      <line x1={80} y1={330} x2={860} y2={330} stroke={C.paper} strokeWidth={3} strokeDasharray="16 12" />
      <text x={860} y={312} textAnchor="end" fontFamily={F.sans} fontWeight={900} fontSize={38} fill={C.paper}>元本</text>
      {cross && under.length > 1 ? (
        <polygon points={[`${cross[0]},330`, ...under.map((p) => p.join(',')), `${under[under.length - 1][0]},330`].join(' ')} fill={C.red} opacity={0.35} />
      ) : null}
      <polyline points={poly} fill="none" stroke={b > 0.3 ? C.red : C.paper} strokeWidth={10} strokeLinejoin="round" strokeLinecap="round" />
      <text x={330} y={170} textAnchor="middle" fontFamily={F.display} fontSize={56} fill={C.paper} opacity={clamp01(a * 3) * (1 - b)}>資本</text>
      <Stamp x={640} y={500} text="元本割れ" p={P(1, 0.3, (x) => (x > 0.55 ? (x - 0.55) / 0.45 : 0))} size={54} rot={-8} />
    </g>
  );
};

const Face: React.FC<MotifProps> = ({ t, ps, k }) => {
  const P = mk(t, ps);
  const a = P(0, 0.35, back(1.2));
  const b = P(1, 0.6);
  const drain = clamp01((t - (ps[0] ?? 0)) / 1.2);
  return (
    <g>
      <g transform={`translate(${lerp(-300, 0, a)} 0)`} opacity={1 - 0.55 * b}>
        <rect x={60} y={170} width={350} height={330} rx={26} fill="none" stroke={C.paper} strokeWidth={7} />
        <text x={100} y={250} fontFamily={F.sans} fontWeight={900} fontSize={46} fill={C.paper}>口座</text>
        <text x={100} y={330} fontFamily={F.sans} fontWeight={700} fontSize={34} fill={C.dim}>損益</text>
        <text x={370} y={334} textAnchor="end" fontFamily={F.display} fontSize={56} fill={C.red}>▼</text>
        <rect x={100} y={380} width={270} height={30} rx={8} fill="#2a2d36" />
        <rect x={100} y={380} width={270 * (1 - 0.8 * drain)} height={30} rx={8} fill={C.red} />
        <rect x={100} y={430} width={180} height={16} rx={6} fill={C.faint} />
      </g>
      <g transform={`translate(660 340) rotate(${-4 + 4 * k})`} opacity={clamp01(a * 2)}>
        <circle r={180} fill="none" stroke={C.paper} strokeWidth={9} />
        <line x1={-95} y1={-20} x2={-35} y2={-20} stroke={C.paper} strokeWidth={10} strokeLinecap="round" />
        <line x1={35} y1={-20} x2={95} y2={-20} stroke={C.paper} strokeWidth={10} strokeLinecap="round" />
        <path d="M -100 18 Q -65 50 -30 18" fill="none" stroke="#6d5b93" strokeWidth={6 + 16 * b} strokeLinecap="round" opacity={b} />
        <path d="M 30 18 Q 65 50 100 18" fill="none" stroke="#6d5b93" strokeWidth={6 + 16 * b} strokeLinecap="round" opacity={b} />
        <line x1={-36} y1={100} x2={36} y2={100} stroke={C.paper} strokeWidth={9} strokeLinecap="round" />
        <text x={0} y={-215} textAnchor="middle" fontFamily={F.display} fontSize={50} fill={C.red} opacity={b}>顔</text>
      </g>
    </g>
  );
};

const Bench: React.FC<MotifProps> = ({ t, ps, s }) => {
  const P = mk(t, ps);
  const up = P(0, 0.45, back(1.1));
  const lid1 = P(1, 0.5);
  const drop = P(2, 0.28, (x) => x * x);
  const land = prog(t, (ps[2] ?? 99) + 0.28, 0.4, back(2));
  const barY = lerp(400, 190, up) + 120 * drop * 1 - 20 * (land > 0 && land < 1 ? Math.sin(land * Math.PI) : 0);
  const shake = drop >= 1 ? 10 * Math.exp(-(t - (ps[2] ?? 0) - 0.28) * 8) * Math.sin(t * 90) : 0;
  const lid = lerp(0.15, 0.55, lid1) + 0.33 * drop;
  return (
    <g transform={`translate(${shake} 0)`}>
      <line x1={110} y1={barY} x2={810} y2={barY} stroke={C.paper} strokeWidth={14} strokeLinecap="round" />
      {[150, 196, 724, 770].map((x, i) => (
        <rect key={i} x={x - 18} y={barY - (i % 3 === 0 ? 90 : 70)} width={36} height={i % 3 === 0 ? 180 : 140} rx={8} fill={C.paper} />
      ))}
      <text x={840} y={barY + 18} fontFamily={F.display} fontSize={54} fill={C.red} opacity={up * (1 - drop)}>▲</text>
      <g opacity={drop > 0 ? 1 : 0} transform={`translate(460 ${lerp(-150, barY, drop)})`}>
        <circle r={120} fill={C.ink2} stroke={C.red} strokeWidth={10} />
        <circle r={22} fill={C.ink} stroke={C.red} strokeWidth={6} />
        <text x={0} y={-45} textAnchor="middle" fontFamily={F.display} fontSize={50} fill={C.red}>眠気</text>
      </g>
      <g opacity={clamp01(lid1 * 3)}>
        <Eye x={460} y={570} w={380} h={110} lid={Math.min(0.92, lid)} />
        <text x={700} y={600} fontFamily={F.display} fontSize={54} fill={C.blue} opacity={1 - drop}>▼</text>
      </g>
      {s > 0.2 ? <rect x={0} y={0} width={920} height={700} fill={C.red} opacity={0.0} /> : null}
    </g>
  );
};

const PullUp: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = P(0, 0.6, back(1.1));
  const b = P(1, 0.5, back(1.4));
  const hy = lerp(330, 190, a) + 70 * b;
  const sw = Math.sin((t - (ps[1] ?? 0)) * 5) * 7 * b;
  return (
    <g>
      <line x1={140} y1={90} x2={780} y2={90} stroke={C.paper} strokeWidth={14} strokeLinecap="round" />
      <line x1={160} y1={90} x2={160} y2={660} stroke={C.dim} strokeWidth={8} />
      <line x1={760} y1={90} x2={760} y2={660} stroke={C.dim} strokeWidth={8} />
      <g stroke={C.paper} strokeWidth={14} strokeLinecap="round" fill="none">
        <polyline points={`380,90 ${lerp(400, 420, a)},${hy + 50} 460,${hy + 60}`} />
        <polyline points={`540,90 ${lerp(520, 500, a)},${hy + 50} 460,${hy + 60}`} />
        <line x1={460} y1={hy + 60} x2={460} y2={hy + 200} />
        <polyline points={`420,${hy + 300} 445,${hy + 250} 460,${hy + 200} 475,${hy + 250} 500,${hy + 300}`} />
      </g>
      <circle cx={460} cy={hy} r={40} fill={C.paper} />
      <text x={600} y={hy + 40} fontFamily={F.display} fontSize={60} fill={C.red} opacity={a * (1 - b)}>▲</text>
      <g opacity={clamp01(b * 3)} transform={`rotate(${sw} 460 ${hy + 300})`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <ellipse key={i} cx={460} cy={hy + 320 + i * 26} rx={9} ry={14} fill="none" stroke={C.gray} strokeWidth={6} />
        ))}
        <path d={`M 380 ${hy + 450} L 540 ${hy + 450} L 570 ${hy + 560} L 350 ${hy + 560} Z`} fill={C.ink2} stroke={C.red} strokeWidth={8} />
        <text x={460} y={hy + 525} textAnchor="middle" fontFamily={F.display} fontSize={52} fill={C.red}>眠気</text>
      </g>
    </g>
  );
};

const Shades: React.FC<MotifProps> = ({ t, ps, k }) => {
  const P = mk(t, ps);
  const a = P(0, 0.4, back(1.3));
  const b = P(1, 0.5);
  const glint = clamp01((t - (ps[0] ?? 0) - 0.2) / 0.6);
  const lens = (x: number) => `M ${x} 250 Q ${x} 220 ${x + 30} 220 L ${x + 280} 220 Q ${x + 310} 220 ${x + 305} 260 L ${x + 280} 400 Q ${x + 270} 450 ${x + 220} 450 L ${x + 80} 450 Q ${x + 30} 450 ${x + 15} 400 Z`;
  return (
    <g transform={`translate(0 ${(1 - a) * -360}) scale(${1 + 0.02 * k})`} style={{ transformOrigin: '460px 340px' }}>
      <defs>
        <clipPath id="lenses">
          <path d={lens(120)} />
          <path d={lens(495)} />
        </clipPath>
        <linearGradient id="lensg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2230" />
          <stop offset="1" stopColor="#030305" />
        </linearGradient>
      </defs>
      <line x1={60} y1={250} x2={120} y2={240} stroke={C.paper} strokeWidth={12} strokeLinecap="round" />
      <line x1={800} y1={240} x2={860} y2={250} stroke={C.paper} strokeWidth={12} strokeLinecap="round" />
      <path d="M 425 250 Q 460 225 495 250" fill="none" stroke={C.paper} strokeWidth={12} />
      <g clipPath="url(#lenses)">
        <rect x={0} y={200} width={920} height={280} fill="url(#lensg)" />
        <g opacity={b}>
          {Array.from({ length: 34 }).map((_, i) => (
            <circle key={i} cx={130 + hash(i) * 670} cy={225 + hash(i + 50) * 220} r={1.5 + hash(i + 9) * 3.5}
              fill="#fff" opacity={0.35 + 0.65 * Math.abs(Math.sin(t * 3 + i))} />
          ))}
          <circle cx={640} cy={320} r={52} fill={C.moon} />
          <circle cx={664} cy={304} r={46} fill="#07080d" />
        </g>
        <rect x={lerp(-200, 980, glint)} y={150} width={70} height={400} fill="#fff" opacity={0.18} transform={`rotate(20 460 340)`} />
      </g>
      <path d={lens(120)} fill="none" stroke={C.paper} strokeWidth={10} />
      <path d={lens(495)} fill="none" stroke={C.paper} strokeWidth={10} />
      {[0, 1, 2].map((i) => {
        const z = clamp01((t - (ps[1] ?? 99) - i * 0.25) / 1.2);
        return z > 0 && z < 1 ? (
          <text key={i} x={760 + i * 34} y={190 - z * 160} fontFamily={F.dot} fontSize={44 + i * 10} fill={C.blue} opacity={1 - z}>Z</text>
        ) : null;
      })}
    </g>
  );
};

const Toggles: React.FC<MotifProps> = ({ t, ps, s }) => {
  const P = mk(t, ps);
  const rows = [0, 1, 2, 3].map((i) => P(i, 0.28, back(1.3)));
  const y0 = 80;
  const H = 140;
  return (
    <g>
      {rows.map((p, i) => (
        <g key={i} transform={`translate(${(1 - p) * 700} ${y0 + i * H})`} opacity={clamp01(p * 3)}>
          <rect x={60} y={0} width={800} height={112} rx={22} fill={C.ink2} stroke={i === 3 ? C.gray : C.faint} strokeWidth={3} />
          <text x={110} y={74} fontFamily={F.sans} fontWeight={900} fontSize={50} fill={C.paper}>{['遮光', '実況', '配信', '意識'][i]}</text>
          {i === 0 ? (
            <g>
              {Array.from({ length: 5 }).map((_, j) => (
                <rect key={j} x={330 + j * 96} y={34} width={80} height={44} rx={6} fill={C.paper} opacity={0.15 + 0.85 * clamp01(p * 5 - j * 0.6)} />
              ))}
            </g>
          ) : null}
          {i === 1 ? (
            <g>
              {Array.from({ length: 16 }).map((_, j) => {
                const h = 8 + 26 * Math.abs(Math.sin(t * 2.2 + j * 0.7)) * 0.4;
                return <rect key={j} x={330 + j * 22} y={56 - h} width={12} height={2 * h} rx={5} fill={C.blue} />;
              })}
              <text x={720} y={74} fontFamily={F.dot} fontSize={44} fill={C.blue}>zzz</text>
            </g>
          ) : null}
          {i === 2 ? (
            <g>
              <Toggle x={560} y={56} on={clamp01(p * 2)} color={C.red} />
              <text x={760} y={72} fontFamily={F.dot} fontSize={46} fill={C.red} opacity={0.6 + 0.4 * s}>ON</text>
            </g>
          ) : null}
          {i === 3 ? (
            <g>
              <Toggle x={560} y={56} on={1 - clamp01(p * 2)} color={C.blue} />
              <text x={750} y={72} fontFamily={F.dot} fontSize={46} fill={C.gray}>OFF</text>
            </g>
          ) : null}
        </g>
      ))}
    </g>
  );
};

// ---------------------------------------------------------------- HOOK
const Crescent: React.FC<{ x: number; y: number; r: number; o?: number; id: string; glow?: number }> = ({ x, y, r, o = 1, id, glow = 0 }) => (
  <g opacity={o}>
    <defs>
      <mask id={id}>
        <circle cx={x} cy={y} r={r} fill="#fff" />
        <circle cx={x + r * 0.42} cy={y - r * 0.3} r={r * 0.86} fill="#000" />
      </mask>
      <radialGradient id={`${id}g`}>
        <stop offset="0" stopColor={C.moon} stopOpacity={0.35} />
        <stop offset="1" stopColor={C.moon} stopOpacity={0} />
      </radialGradient>
    </defs>
    {glow > 0 ? <circle cx={x} cy={y} r={r * 2.4} fill={`url(#${id}g)`} opacity={glow} /> : null}
    <circle cx={x} cy={y} r={r} fill={C.moon} mask={`url(#${id})`} />
  </g>
);

const Moon: React.FC<MotifProps> = ({ t, ps, k }) => {
  const P = mk(t, ps);
  const rise = P(0, 0.9, eo);
  const fillT = ps[1] ?? 99;
  const span = Math.max(0.6, (ps.length > 1 ? 1.1 : 1));
  return (
    <g>
      <g transform={`translate(460 ${lerp(560, 300, rise)})`}>
        <g transform={`rotate(${-t * 140})`} opacity={rise * 0.8}>
          {Array.from({ length: 24 }).map((_, i) => (
            <line key={i} x1={0} y1={-232} x2={0} y2={i % 2 ? -250 : -270} stroke={C.moon} strokeWidth={i % 6 === 0 ? 7 : 3} transform={`rotate(${i * 15})`} opacity={0.7} />
          ))}
          <path d="M 0 -300 L -18 -272 L 18 -272 Z" fill={C.moon} transform="rotate(-90)" />
        </g>
      </g>
      <Crescent x={460} y={lerp(560, 300, rise)} r={150 + 6 * k} id="hookmoon" glow={rise} />
      {Array.from({ length: 7 }).map((_, i) => {
        const f = clamp01((t - fillT - (i * span) / 7) / 0.15);
        return <Crescent key={i} x={160 + i * 100} y={620} r={30} id={`night${i}`} o={0.2 + 0.8 * f} />;
      })}
    </g>
  );
};

const EyeMotif: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const open = P(0, 0.4, back(1.2));
  const close = P(1, 0.9, eio);
  return (
    <g>
      {Array.from({ length: 26 }).map((_, i) => {
        const tw = Math.abs(Math.sin(t * 2.5 + i * 1.7));
        return (
          <path key={i} d="M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z" fill={C.moon}
            transform={`translate(${60 + hash(i) * 800} ${40 + hash(i + 3) * 620}) scale(${0.5 + tw * 0.9})`}
            opacity={clamp01(open * 1.5) * (0.25 + 0.75 * tw) * (i % 2 === 0 ? 1 : close)} />
        );
      })}
      <g transform={`translate(0 ${(1 - open) * 40})`} opacity={clamp01(open * 2)}>
        <Eye x={460} y={360} w={640} h={230} lid={close} />
      </g>
      {close > 0.98 ? (
        <path d="M 160 360 Q 460 500 760 360" fill="none" stroke={C.moon} strokeWidth={12} strokeLinecap="round" opacity={0.9} />
      ) : null}
    </g>
  );
};

const Play: React.FC<MotifProps> = ({ t, ps, k }) => {
  const P = mk(t, ps);
  const a = P(0, 0.35, back(1.4));
  const b = P(1, 0.25, eo);
  const count = Math.floor(lerp(0, 1000000, eo(clamp01((t - (ps[0] ?? 0)) / Math.max(0.6, (ps[1] ?? 1.2) - (ps[0] ?? 0))))));
  const press = b > 0 && b < 1 ? 1 - 0.1 * Math.sin(b * Math.PI) : 1;
  const tri = [[-55, -85], [95, 0], [95, 0], [-55, 85]];
  const sq = [[-70, -70], [70, -70], [70, 70], [-70, 70]];
  const pts = tri.map((p, i) => `${lerp(p[0], sq[i][0], b)},${lerp(p[1], sq[i][1], b)}`).join(' ');
  const ripple = clamp01((t - (ps[1] ?? 99)) / 0.6);
  return (
    <g>
      <g transform={`translate(460 290) scale(${a * press * (1 + 0.03 * k)})`}>
        <rect x={-190} y={-190} width={380} height={380} rx={70} fill={b > 0.5 ? '#1a1d27' : 'rgba(255,59,47,0.18)'} stroke={b > 0.5 ? C.paper : C.red} strokeWidth={12} />
        <polygon points={pts} fill={b > 0.5 ? C.paper : C.red} strokeLinejoin="round" />
        {ripple > 0 && ripple < 1 ? <rect x={-190 - 120 * ripple} y={-190 - 120 * ripple} width={380 + 240 * ripple} height={380 + 240 * ripple} rx={80} fill="none" stroke={C.paper} strokeWidth={6} opacity={1 - ripple} /> : null}
      </g>
      <text x={460} y={600} textAnchor="middle" fontFamily={F.dot} fontSize={72} fill={b > 0.5 ? C.gray : C.paper} opacity={a}>
        {'▶ ' + count.toLocaleString('en-US')}
      </text>
      <text x={460} y={660} textAnchor="middle" fontFamily={F.sans} fontWeight={700} fontSize={30} fill={C.dim} opacity={a}>再生数</text>
    </g>
  );
};

const Mirror: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = P(0, 0.45, back(1.2));
  const b = P(1, 0.6);
  const q = Math.abs(Math.sin((t - (ps[1] ?? 0)) * 6));
  return (
    <g>
      <g transform={`translate(${lerp(170, 0, b)} 0)`} opacity={clamp01(a * 2)}>
        <rect x={100} y={60} width={320} height={590} rx={46} fill={C.ink2} stroke={C.paper} strokeWidth={9} />
        <rect x={215} y={84} width={90} height={14} rx={7} fill={C.paper} opacity={0.5} />
        <g clipPath="url(#phone)">
          <defs>
            <clipPath id="phone"><rect x={112} y={110} width={296} height={528} rx={34} /></clipPath>
          </defs>
          <Silhouette x={260} y={500} s={0.95} fill={C.paper} o={0.9} />
          <rect x={60} y={100} width={80} height={600} fill="#fff" opacity={0.08} transform="rotate(18 260 360)" />
        </g>
      </g>
      <g opacity={b}>
        <Silhouette x={690} y={500} s={0.95} flip fill={C.moon} o={0.85} />
        <line x1={420} y1={385} x2={620} y2={385} stroke={C.moon} strokeWidth={6} strokeDasharray="4 16" strokeLinecap="round" />
        <text x={520} y={330} textAnchor="middle" fontFamily={F.display} fontSize={70 + 10 * q} fill={C.moon}>?</text>
      </g>
    </g>
  );
};

// ---------------------------------------------------------------- VERSE 2
const Collab: React.FC<MotifProps> = ({ t, ps, s }) => {
  const P = mk(t, ps);
  const f1 = P(0, 0.3, back(1.5));
  const f2 = prog(t, (ps[0] ?? 0) + 0.35, 0.3, back(1.5));
  const b = P(1, 0.3, back(1.2));
  const frame = (x: number, y: number, p: number, n: string) => (
    <g transform={`translate(${x} ${y}) scale(${p})`} opacity={clamp01(p * 2)}>
      <rect x={-190} y={-107} width={380} height={214} rx={18} fill={C.ink2} stroke={C.paper} strokeWidth={8} />
      <polygon points="-24,-34 38,0 -24,34" fill={C.red} />
      <text x={-170} y={-70} fontFamily={F.dot} fontSize={30} fill={C.paper}>{n}</text>
    </g>
  );
  return (
    <g>
      <g transform={`translate(0 ${-150 * b})`}>
        {frame(300, 230, f1, 'COLLAB 01')}
        {frame(620, 330, f2, 'COLLAB 02')}
        <text x={790} y={180} textAnchor="middle" fontFamily={F.display} fontSize={130 + 20 * s} fill={C.red} opacity={f2}>×2</text>
      </g>
      <g opacity={clamp01(b * 3)}>
        <path d="M 150 520 q 0 -50 40 -50 l 30 0 l 18 60 l -30 20 q 20 50 70 70 l 20 -30 l 60 18 l 0 30 q 0 40 -50 40 q -158 -10 -158 -158 z"
          fill={C.paper} transform="translate(-40 40) scale(1.0)" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M ${330 + i * 32} ${470 - i * 20} q ${40 + i * 10} ${50 + i * 10} 0 ${110 + i * 40}`} fill="none" stroke={C.red} strokeWidth={8}
            strokeLinecap="round" opacity={0.3 + 0.7 * Math.abs(Math.sin(t * 8 - i))} />
        ))}
        <clipPath id="ticker"><rect x={440} y={500} width={440} height={110} rx={20} /></clipPath>
        <rect x={440} y={500} width={440} height={110} rx={20} fill={C.ink2} stroke={C.faint} strokeWidth={3} />
        <g clipPath="url(#ticker)">
          <text x={880 - ((t - (ps[1] ?? 0)) * 900) % 1400} y={575} fontFamily={F.display} fontSize={54} fill={C.paper}>
            言葉が走る 言葉が走る 言葉が走る
          </text>
        </g>
      </g>
    </g>
  );
};

const Invoice: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = P(0, 0.22, back(2));
  const b = P(1, 0.35, back(1.2));
  const st = prog(t, (ps[1] ?? 99) + 0.45, 0.2);
  return (
    <g>
      <g transform={`translate(${lerp(-400, 0, a)} 0)`}>
        <path d="M 80 70 h 500 a 30 30 0 0 1 30 30 v 110 a 30 30 0 0 1 -30 30 h -440 l -40 40 v -40 h -20 a 30 30 0 0 1 -30 -30 v -110 a 30 30 0 0 1 30 -30 z" fill={C.blue} />
        <text x={110} y={180} fontFamily={F.display} fontSize={66} fill={C.ink}>即レス</text>
        <text x={560} y={180} textAnchor="end" fontFamily={F.dot} fontSize={44} fill={C.ink}>✓✓ 0.1秒</text>
      </g>
      <g transform={`translate(0 ${(1 - b) * 500}) rotate(3 460 470)`} opacity={clamp01(b * 3)}>
        <rect x={230} y={300} width={500} height={360} rx={6} fill={C.paper} />
        <text x={480} y={375} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={54} fill={C.ink}>請求書</text>
        <line x1={270} y1={400} x2={690} y2={400} stroke={C.ink} strokeWidth={4} />
        <text x={280} y={470} fontFamily={F.sans} fontWeight={900} fontSize={42} fill={C.ink}>睡眠</text>
        <text x={680} y={470} textAnchor="end" fontFamily={F.sans} fontWeight={700} fontSize={42} fill={C.ink}>返済</text>
        <line x1={270} y1={500} x2={690} y2={500} stroke={C.ink} strokeOpacity={0.3} strokeWidth={2} />
        <rect x={280} y={530} width={260} height={18} rx={6} fill={C.ink} opacity={0.15} />
        <rect x={280} y={570} width={180} height={18} rx={6} fill={C.ink} opacity={0.15} />
        <Stamp x={560} y={560} text="未払い" p={st} size={62} rot={-14} />
      </g>
    </g>
  );
};

const Thirteen: React.FC<MotifProps> = ({ t, ps, s }) => {
  const P = mk(t, ps);
  const a = P(0, 0.25, back(2.2));
  const b = P(1, 0.25, back(1.8));
  const c = P(2, 0.5, eo);
  const chars = [...'仏教最高位'];
  return (
    <g>
      <g transform={`translate(330 400) scale(${lerp(1.8, 1, a) + 0.03 * s})`} opacity={clamp01(a * 3)}>
        <text x={0} y={0} textAnchor="middle" fontFamily={F.display} fontSize={380} fill={C.paper} stroke={C.red} strokeWidth={b > 0 ? 6 : 0} paintOrder="stroke">13</text>
        <text x={225} y={-10} fontFamily={F.display} fontSize={150} fill={C.red} opacity={clamp01(b * 3)} transform={`scale(${lerp(1.6, 1, b)})`}>年</text>
      </g>
      <g transform={`translate(${lerp(-700, 0, b)} 0)`}>
        <rect x={60} y={500} width={560} height={86} fill={C.red} />
        <rect x={60} y={586} width={420} height={56} fill={C.paper} />
        <text x={90} y={560} fontFamily={F.sans} fontWeight={900} fontSize={44} fill={C.paper}>紹介</text>
        <rect x={210} y={530} width={360} height={26} rx={6} fill={C.paper} opacity={0.5} />
        <rect x={90} y={604} width={300} height={20} rx={6} fill={C.ink} opacity={0.35} />
      </g>
      <g transform={`translate(0 ${(1 - c) * -560})`}>
        <rect x={720} y={40} width={130} height={600} fill={C.paper} />
        <rect x={720} y={40} width={130} height={600} fill="none" stroke={C.red} strokeWidth={6} />
        {chars.map((ch, i) => (
          <text key={i} x={785} y={150 + i * 108} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={92} fill={C.ink}>{ch}</text>
        ))}
      </g>
    </g>
  );
};

const Muga: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = P(0, 0.35, eo);
  const sw = (ps[0] ?? 0) + Math.max(0.5, ((ps[1] ?? 1.5) - (ps[0] ?? 0)) * 0.55);
  const m = clamp01((t - sw) / 0.12);
  const glitch = t > sw - 0.05 && t < sw + 0.2;
  const b = P(1, 0.4, back(1.2));
  const scan = (t - (ps[1] ?? 0)) * 1.4;
  const gx = 120 + (Math.sin(scan * 2.2) * 0.5 + 0.5) * 680;
  return (
    <g>
      <g opacity={a} transform={`translate(0 ${-120 * b})`}>
        <text x={330} y={400} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={280} fill={C.paper}>無</text>
        {glitch ? (
          <>
            <text x={610 - 14} y={400} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={280} fill={C.blue} opacity={0.7}>理</text>
            <text x={610 + 14} y={400} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={280} fill={C.red} opacity={0.7}>我</text>
          </>
        ) : null}
        <text x={610} y={400} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={280} fill={C.paper} opacity={1 - m}>我</text>
        <text x={610} y={400} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={280} fill={C.red} opacity={m}>理</text>
        <text x={470} y={490} textAnchor="middle" fontFamily={F.sans} fontWeight={700} fontSize={40} fill={C.dim}>{m > 0.5 ? '境目' : '境地'}</text>
      </g>
      <g opacity={clamp01(b * 3)}>
        <text x={100} y={515} fontFamily={F.dot} fontSize={30} fill={C.dim}>0:00</text>
        <text x={820} y={515} textAnchor="end" fontFamily={F.dot} fontSize={30} fill={C.dim}>24:00</text>
        {Array.from({ length: 24 }).map((_, i) => (
          <rect key={i} x={100 + i * 30} y={540} width={24} height={70} rx={4} fill={C.red} opacity={0.35 + 0.5 * hash(i + 4)} />
        ))}
        <g transform={`translate(${gx} 575)`}>
          <circle r={70} fill="rgba(255,255,255,0.08)" stroke={C.paper} strokeWidth={10} />
          <line x1={50} y1={50} x2={110} y2={110} stroke={C.paper} strokeWidth={18} strokeLinecap="round" />
          <text x={0} y={22} textAnchor="middle" fontFamily={F.display} fontSize={64} fill={C.paper}>?</text>
        </g>
      </g>
    </g>
  );
};

const Camera: React.FC<MotifProps> = ({ t, ps, s }) => {
  const P = mk(t, ps);
  const a = P(0, 0.3, back(1.2));
  const rec = t >= (ps[1] ?? 99);
  const c = P(2, 0.45, back(1.2));
  const tc = Math.max(0, t - (ps[1] ?? t));
  const sec = Math.floor(tc);
  const fr = Math.floor((tc % 1) * 30);
  const corner = (x: number, y: number, sx: number, sy: number) => (
    <path d={`M ${x} ${y + sy * 70} L ${x} ${y} L ${x + sx * 70} ${y}`} fill="none" stroke={C.paper} strokeWidth={10} strokeLinecap="round" />
  );
  return (
    <g>
      <g opacity={clamp01(a * 2)} transform={`scale(${lerp(1.15, 1, a)})`} style={{ transformOrigin: '460px 300px' }}>
        <rect x={90} y={70} width={740} height={440} fill={rec ? 'rgba(255,59,47,0.06)' : 'transparent'} />
        {corner(90, 70, 1, 1)}{corner(830, 70, -1, 1)}{corner(90, 510, 1, -1)}{corner(830, 510, -1, -1)}
        <circle cx={150} cy={130} r={16} fill={C.red} opacity={rec ? 0.5 + 0.5 * Math.round(Math.sin(t * 6) * 0.5 + 0.5) : 0.25} />
        <text x={178} y={144} fontFamily={F.dot} fontSize={40} fill={rec ? C.red : C.dim}>REC</text>
        <text x={790} y={144} textAnchor="end" fontFamily={F.dot} fontSize={36} fill={C.paper}>
          {`00:00:${String(sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}`}
        </text>
        <g transform={`translate(460 300) scale(${1 + 0.05 * s})`}>
          <rect x={-120} y={-75} width={200} height={150} rx={20} fill="none" stroke={C.paper} strokeWidth={10} />
          <path d="M 80 -40 L 150 -75 L 150 75 L 80 40" fill="none" stroke={C.paper} strokeWidth={10} strokeLinejoin="round" />
          <circle cx={-20} cy={0} r={38} fill="none" stroke={C.paper} strokeWidth={8} />
          <g transform={`rotate(${rec ? tc * 360 : 0} -20 0)`}>
            <path d="M -20 -38 A 38 38 0 0 1 18 0" fill="none" stroke={C.red} strokeWidth={8} />
          </g>
        </g>
      </g>
      <g opacity={clamp01(c * 3)} transform={`translate(0 ${(1 - c) * 160})`}>
        <line x1={60} y1={540} x2={860} y2={540} stroke={C.red} strokeWidth={4} strokeDasharray="18 12" />
        <text x={860} y={530} textAnchor="end" fontFamily={F.sans} fontWeight={700} fontSize={26} fill={C.red}>画面外</text>
        {[300, 620].map((x, i) => (
          <g key={i} transform={`translate(${x} 640) ${i ? 'scale(-1 1)' : ''}`} opacity={0.75}>
            <rect x={-70} y={-40} width={140} height={110} rx={40} fill={C.gray} />
            {[0, 1, 2, 3].map((j) => (
              <rect key={j} x={-64 + j * 34} y={-92} width={26} height={70} rx={13} fill={C.gray} />
            ))}
            <rect x={60} y={-30} width={26} height={60} rx={13} fill={C.gray} transform="rotate(30 60 0)" />
          </g>
        ))}
      </g>
    </g>
  );
};

const Tilt: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = P(0, 0.35, back(1.2));
  const bow = P(0, 0.6, eio);
  const b = P(1, 0.6, eio);
  return (
    <g>
      <clipPath id="tiltclip"><rect x={0} y={0} width={920} height={700} /></clipPath>
      <g clipPath="url(#tiltclip)">
        <g transform={`translate(0 ${-640 * b})`}>
          <g opacity={clamp01(a * 2)}>
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${520 + i * 26} ${90 + i * 26}) rotate(${-6 + i * 4})`} opacity={1 - i * 0.3}>
                <rect x={0} y={0} width={320} height={140} rx={16} fill={i === 0 ? C.paper : 'none'} stroke={C.paper} strokeWidth={5} />
                <circle cx={36} cy={70} r={14} fill={i === 0 ? C.ink : 'none'} stroke={C.paper} strokeWidth={4} />
                {i === 0 ? <text x={180} y={92} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={58} fill={C.ink}>肩書き</text> : null}
              </g>
            ))}
            <g transform={`translate(260 520) rotate(${30 * bow})`}>
              <circle cx={0} cy={-260} r={58} fill={C.paper} />
              <path d="M -110 0 C -110 -120, -60 -185, 0 -185 C 60 -185, 110 -120, 110 0 Z" fill={C.paper} />
            </g>
          </g>
          <g transform="translate(0 640)">
            <line x1={60} y1={560} x2={860} y2={560} stroke={C.dim} strokeWidth={6} />
            {[330, 590].map((x, i) => (
              <path key={i} d={`M ${x - 90} 556 L ${x - 90} 500 Q ${x - 90} 470 ${x - 50} 470 L ${x + 10} 470 Q ${x + 30} 510 ${x + 80} 520 Q ${x + 110} 530 ${x + 110} 556 Z`}
                fill="none" stroke={C.red} strokeWidth={10} strokeLinejoin="round" />
            ))}
            <text x={460} y={420} textAnchor="middle" fontFamily={F.display} fontSize={90} fill={C.red} opacity={b}>足元</text>
          </g>
        </g>
      </g>
    </g>
  );
};

const Reply: React.FC<MotifProps> = ({ t, ps, k }) => {
  const P = mk(t, ps);
  const cards = [0, 1, 2, 3].map((i) => P(i, 0.25, back(1.6)));
  const pos = [[60, 40], [480, 40], [60, 370], [480, 370]];
  const labels = ['レイナ', '返済', '今から', '今夜'];
  const icon = (i: number) => {
    if (i === 0) return <path d="M -60 -40 h 120 a 18 18 0 0 1 18 18 v 60 a 18 18 0 0 1 -18 18 h -70 l -30 24 v -24 h -20 a 18 18 0 0 1 -18 -18 v -60 a 18 18 0 0 1 18 -18 z" fill={C.blue} />;
    if (i === 1) return <g><rect x={-55} y={-50} width={110} height={120} rx={8} fill={C.paper} /><line x1={-35} y1={-15} x2={35} y2={-15} stroke={C.ink} strokeWidth={6} /><line x1={-35} y1={15} x2={20} y2={15} stroke={C.ink} strokeWidth={6} /></g>;
    if (i === 2) return <g><path d="M -70 40 A 70 70 0 0 1 70 40 Z" fill={C.moon} />{[0, 1, 2, 3, 4].map((j) => <line key={j} x1={0} y1={-80} x2={0} y2={-100} stroke={C.moon} strokeWidth={6} transform={`rotate(${-60 + j * 30} 0 40)`} />)}<line x1={-90} y1={40} x2={90} y2={40} stroke={C.moon} strokeWidth={6} /></g>;
    return <Crescent x={0} y={0} r={60} id="replymoon" />;
  };
  return (
    <g>
      {cards.map((p, i) => {
        const done = clamp01((t - (ps[i] ?? 99) - 0.25) / 0.25);
        return (
          <g key={i} transform={`translate(${pos[i][0] + 190} ${pos[i][1] + 145}) scale(${p * (1 + (i === cards.length - 1 ? 0 : 0) + 0.02 * k)})`} opacity={clamp01(p * 3)}>
            <rect x={-190} y={-145} width={380} height={290} rx={30} fill={C.ink2} stroke={i < 2 ? C.red : C.moon} strokeWidth={5} />
            <g transform="translate(-80 -10)">{icon(i)}</g>
            <text x={20} y={-30} fontFamily={F.display} fontSize={i === 0 ? 48 : 56} fill={C.paper}>{labels[i]}</text>
            {i < 2 ? (
              <path d="M 40 30 l 30 30 l 60 -70" fill="none" stroke={C.red} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={160} strokeDashoffset={160 * (1 - done)} />
            ) : (
              <text x={20} y={60} fontFamily={F.dot} fontSize={44} fill={C.moon}>{i === 2 ? 'NOW' : 'TONIGHT'}</text>
            )}
          </g>
        );
      })}
    </g>
  );
};

const Curtain: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = prog(t, -0.1, 0.3);
  const fall = P(0, 0.9, back(1.05));
  return (
    <g opacity={a}>
      <defs>
        <linearGradient id="fold" x1="0" x2="1" y1="0" y2="0" spreadMethod="repeat">
          <stop offset="0" stopColor="#3d0a0d" />
          <stop offset="0.5" stopColor="#8a1c20" />
          <stop offset="1" stopColor="#3d0a0d" />
        </linearGradient>
        <pattern id="folds" width={70} height={10} patternUnits="userSpaceOnUse">
          <rect width={70} height={10} fill="url(#fold)" />
        </pattern>
        <clipPath id="stage"><rect x={70} y={60} width={780} height={560} rx={12} /></clipPath>
      </defs>
      <rect x={70} y={60} width={780} height={560} rx={12} fill={C.ink2} stroke={C.faint} strokeWidth={4} />
      <g clipPath="url(#stage)">
        <ellipse cx={460} cy={560} rx={260} ry={50} fill={C.moon} opacity={0.18 * (1 - fall)} />
        <polygon points="460,60 300,560 620,560" fill={C.moon} opacity={0.06 * (1 - fall)} />
        <rect x={400} y={430} width={120} height={130} fill={C.gray} opacity={0.6} />
        <rect x={70} y={lerp(-520, 60, fall)} width={780} height={560} fill="url(#folds)" />
        <path d={`M 70 ${lerp(-520, 60, fall) + 560} q 39 18 78 0 t 78 0 t 78 0 t 78 0 t 78 0 t 78 0 t 78 0 t 78 0 t 78 0 t 78 0`} fill="#8a1c20" />
      </g>
      <rect x={50} y={30} width={820} height={60} rx={10} fill="#5a0f12" />
      <line x1={40} y1={640} x2={880} y2={640} stroke={C.dim} strokeWidth={6} />
    </g>
  );
};

// ---------------------------------------------------------------- FINAL
const Invest: React.FC<MotifProps> = ({ t, ps }) => {
  const P = mk(t, ps);
  const a = prog(t, -0.1, 0.5, eo);
  const circ = P(0, 0.8, eio);
  const b = P(1, 0.4, back(1.2));
  const x1 = prog(t, (ps[1] ?? 99) + 0.5, 0.18);
  const x2 = prog(t, (ps[1] ?? 99) + 0.68, 0.18);
  return (
    <g>
      <g opacity={a} transform={`translate(0 ${(1 - a) * 30})`}>
        <rect x={110} y={50} width={700} height={330} rx={8} fill={C.paper} />
        <text x={150} y={130} fontFamily={F.sans} fontWeight={900} fontSize={40} fill={C.ink}>投資先</text>
        <line x1={130} y1={160} x2={790} y2={160} stroke={C.ink} strokeWidth={4} />
        <text x={460} y={310} textAnchor="middle" fontFamily={F.mincho} fontWeight={900} fontSize={120} fill={C.ink}>自分</text>
        <ellipse cx={460} cy={270} rx={190} ry={85} fill="none" stroke={C.red} strokeWidth={9}
          strokeDasharray={900} strokeDashoffset={900 * (1 - circ)} transform="rotate(-4 460 270)" />
      </g>
      <g opacity={clamp01(b * 3)} transform={`translate(0 ${(1 - b) * 200})`}>
        <rect x={110} y={440} width={240} height={150} rx={10} fill="none" stroke={C.paper} strokeWidth={6} />
        <text x={230} y={540} textAnchor="middle" fontFamily={F.display} fontSize={70} fill={C.paper}>ツケ</text>
        <line x1={380} y1={515} x2={540} y2={515} stroke={C.paper} strokeWidth={8} />
        <path d="M 540 490 L 580 515 L 540 540 Z" fill={C.paper} />
        <text x={600} y={535} fontFamily={F.sans} fontWeight={900} fontSize={50} fill={C.paper}>明日の俺</text>
        <line x1={110} y1={440} x2={110 + 760 * x1} y2={440 + 160 * x1} stroke={C.red} strokeWidth={12} strokeLinecap="round" />
        <line x1={870} y1={440} x2={870 - 760 * x2} y2={440 + 160 * x2} stroke={C.red} strokeWidth={12} strokeLinecap="round" />
      </g>
    </g>
  );
};

const Live: React.FC<MotifProps> = ({ t, ps, k }) => {
  const P = mk(t, ps);
  const a = P(0, 0.45, back(1.2));
  const n = Math.floor(clamp01((t - (ps[0] ?? 0)) / 0.9) * 28);
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const ang = hash(i + 2) * Math.PI * 2;
        const r = 330 + hash(i + 7) * 60;
        return <circle key={i} cx={460 + Math.cos(ang) * r} cy={360 + Math.sin(ang) * r * 0.75} r={10 + hash(i) * 10} fill={C.paper} opacity={0.25 + 0.4 * hash(i + 1)} />;
      })}
      <g transform={`translate(460 360) scale(${a * (1 + 0.02 * k)})`} opacity={clamp01(a * 2)}>
        <rect x={-340} y={-200} width={680} height={400} rx={24} fill={C.ink2} stroke={C.paper} strokeWidth={9} />
        <clipPath id="liveclip"><rect x={-330} y={-190} width={660} height={380} rx={18} /></clipPath>
        <g clipPath="url(#liveclip)">
          <Silhouette x={0} y={165} s={1.1} fill={C.paper} o={0.92} nose={false} />
        </g>
        <rect x={-310} y={-176} width={130} height={52} rx={10} fill={C.red} />
        <text x={-245} y={-136} textAnchor="middle" fontFamily={F.dot} fontSize={34} fill="#fff">LIVE</text>
      </g>
    </g>
  );
};

export const MOTIFS: Record<MotifName, React.FC<MotifProps> | null> = {
  bars: Bars, ledger: Ledger, chart: Chart, face: Face, bench: Bench, pullup: PullUp, shades: Shades, toggles: Toggles,
  moon: Moon, eye: EyeMotif, play: Play, mirror: Mirror,
  collab: Collab, invoice: Invoice, thirteen: Thirteen, muga: Muga, camera: Camera, tilt: Tilt, reply: Reply, curtain: Curtain,
  invest: Invest, live: Live, none: null,
};

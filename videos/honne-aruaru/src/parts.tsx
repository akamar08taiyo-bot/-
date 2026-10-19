// 画面の部品：シリーズ名、番号テロップ、字幕、ボソッ、題字、疲れメーター、凍る演出、投票ボタン。
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {W, clamp01, life, pop, ramp, wobble} from './lib';

export const C = {
  coral: '#E8677F',
  ink: '#3B2B25',
  navy: '#2E4A86',
  ice: '#3D78C4',
  cream: '#FFF8EE',
  red: '#E5484D',
};

/** 白いフチ取り文字（フチの層と塗りの層を重ねる） */
export const Outlined: React.FC<{
  children: React.ReactNode;
  size: number;
  color: string;
  stroke?: number;
  strokeColor?: string;
  font?: string;
  weight?: number;
  shadow?: string;
  style?: React.CSSProperties;
}> = ({children, size, color, stroke = 14, strokeColor = '#fff', font = F.maru, weight = 900, shadow, style}) => {
  const base: React.CSSProperties = {fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.18, whiteSpace: 'pre'};
  return (
    <span style={{position: 'relative', display: 'inline-block', ...style}}>
      <span
        aria-hidden
        style={{
          ...base,
          position: 'absolute',
          inset: 0,
          color: strokeColor,
          WebkitTextStroke: `${stroke}px ${strokeColor}`,
          filter: shadow ?? 'drop-shadow(0 6px 0 rgba(60,40,30,0.18))',
        }}
      >
        {children}
      </span>
      <span style={{...base, position: 'relative', color}}>{children}</span>
    </span>
  );
};

// ───────── シリーズ名と進み具合（①〜⑤） ─────────
export const Header: React.FC<{series?: string; episode: string; item: number; since: number}> = ({series = '本音あるある', episode, item, since}) => {
  const frame = useCurrentFrame();
  const pill = (bg: string, fg: string, size: number): React.CSSProperties => ({
    background: bg,
    color: fg,
    fontFamily: F.maru,
    fontWeight: 900,
    fontSize: size,
    padding: '6px 26px 8px',
    borderRadius: 999,
    boxShadow: '0 5px 0 rgba(60,40,30,0.16)',
  });
  return (
    <div style={{position: 'absolute', top: 126, left: 0, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16}}>
      <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
        <div style={pill(C.coral, '#fff', [...series].length > 7 ? 40 : 44)}>{series}</div>
        <div style={pill('#fff', C.ink, [...episode].length > 8 ? 36 : 40)}>{episode}</div>
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 0}}>
        {[1, 2, 3, 4, 5].map((n) => {
          const done = n < item;
          const cur = n === item;
          const s = cur ? 0.85 + 0.25 * pop(frame, since) : 1;
          return (
            <React.Fragment key={n}>
              {n > 1 && <div style={{width: 26, height: 5, borderRadius: 3, background: n <= item ? C.coral : 'rgba(255,255,255,0.85)'}} />}
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: F.dela,
                  fontSize: 26,
                  color: done || cur ? '#fff' : n === 5 ? C.red : '#9a8f88',
                  background: cur ? C.coral : done ? '#d99aa6' : '#fff',
                  border: n === 5 && !done && !cur ? `4px solid ${C.red}` : '4px solid #fff',
                  boxShadow: cur ? `0 0 0 5px rgba(232,103,127,0.35), 0 4px 0 rgba(60,40,30,0.15)` : '0 4px 0 rgba(60,40,30,0.12)',
                  transform: `scale(${s})`,
                }}
              >
                {n}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ───────── 番号つきテロップ（キーワード） ─────────
const Badge: React.FC<{num: number}> = ({num}) => (
  <div style={{position: 'relative', width: 108, height: 108, flex: 'none'}}>
    <div
      style={{
        width: 108,
        height: 108,
        borderRadius: 54,
        background: num === 5 ? C.red : C.coral,
        border: '7px solid #fff',
        boxShadow: '0 6px 0 rgba(60,40,30,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: F.dela,
        fontSize: 60,
        boxSizing: 'border-box',
      }}
    >
      {num}
    </div>
    {num === 5 && (
      <div
        style={{
          position: 'absolute',
          top: -26,
          right: -40,
          background: '#fff',
          color: C.red,
          fontFamily: F.maru,
          fontWeight: 900,
          fontSize: 30,
          padding: '2px 14px 4px',
          borderRadius: 999,
          transform: 'rotate(12deg)',
          boxShadow: '0 3px 0 rgba(60,40,30,0.15)',
        }}
      >
        最後
      </div>
    )}
  </div>
);

export const Telop: React.FC<{text: string; num?: number; from: number; to: number; top?: number}> = ({text, num, from, to, top = 292}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from);
  const len = [...text].length;
  const size = Math.round(Math.max(56, Math.min(94, (num ? 820 : 900) / len)));
  return (
    <div style={{position: 'absolute', top, left: 0, width: W, display: 'flex', justifyContent: 'center', opacity: life(frame, from, to, 2, 4)}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, transform: `scale(${0.55 + 0.45 * p})`}}>
        {num ? <Badge num={num} /> : null}
        <Outlined size={size} color={C.ink} stroke={16}>
          {text}
        </Outlined>
      </div>
    </div>
  );
};

// ───────── 字幕（{夫のセリフ} は紺、**強調** はコーラル） ─────────
type Seg = {t: string; k: 'n' | 'q' | 'e'};
const parse = (s: string): Seg[] => {
  const out: Seg[] = [];
  const re = /\{([^}]*)\}|\*\*([^*]*)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({t: s.slice(last, m.index), k: 'n'});
    out.push(m[1] !== undefined ? {t: m[1], k: 'q'} : {t: m[2], k: 'e'});
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({t: s.slice(last), k: 'n'});
  return out;
};

/** 句読点・閉じかっこの後で、なるべく真ん中で2行に分ける（'|' があればそこで分ける） */
const split2 = (segs: Seg[], max: number): Seg[][] => {
  const all = segs.flatMap((sg) => [...sg.t].map((ch) => ({ch, k: sg.k})));
  const forced = all.findIndex((c) => c.ch === '|');
  const chars = all.filter((c) => c.ch !== '|');
  const toSegsAt = (cs: typeof chars) =>
    cs.reduce<Seg[]>((acc, c) => {
      const lastSeg = acc[acc.length - 1];
      if (lastSeg && lastSeg.k === c.k) lastSeg.t += c.ch;
      else acc.push({t: c.ch, k: c.k});
      return acc;
    }, []);
  if (forced >= 0) return [toSegsAt(chars.slice(0, forced)), toSegsAt(chars.slice(forced))];
  if (chars.length <= max) return [toSegsAt(chars)];
  const mid = chars.length / 2;
  let best = -1;
  let bestD = 1e9;
  // 区切ってよい位置 k（chars[k] から2行目）：句読点・閉じかっこの後、または開きかっこ「の前
  const ok = (k: number) =>
    k > 0 &&
    k < chars.length &&
    !'」』。、？！…'.includes(chars[k].ch) &&
    chars[k - 1].ch !== '「' &&
    ('、。？！」'.includes(chars[k - 1].ch) || chars[k].ch === '「');
  for (let k = 1; k < chars.length; k++) {
    const d = Math.abs(k - mid);
    if (ok(k) && d < bestD && k <= max + 1 && chars.length - k <= max + 1) {
      bestD = d;
      best = k;
    }
  }
  if (best < 0) {
    // よい区切りがなければ真ん中付近で、かっこ・句読点の禁則だけ守る
    best = Math.ceil(mid);
    while (best < chars.length - 1 && ('」』。、？！…'.includes(chars[best].ch) || chars[best - 1].ch === '「')) best++;
  }
  return [toSegsAt(chars.slice(0, best)), toSegsAt(chars.slice(best))];
};

export const Subtitle: React.FC<{text: string; from: number; to: number; aside?: boolean; cy?: number}> = ({text, from, to, aside, cy = 1262}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const lines = split2(parse(text), 15);
  // 1行が長いときは文字を小さくして箱に収める（15文字までは元の大きさ）
  const longest = Math.max(...lines.map((ln) => ln.reduce((n, sg) => n + [...sg.t].length, 0)));
  const fs = Math.min(aside ? 58 : 56, Math.floor(880 / Math.max(longest, 1)));
  const o = life(frame, from, to, 3, 3);
  const y = (1 - ramp(frame, from, from + 5)) * 18;
  const color = (k: Seg['k']) => (aside ? '#fff' : k === 'q' ? C.navy : k === 'e' ? C.coral : C.ink);
  return (
    <div style={{position: 'absolute', left: 0, width: W, top: cy, display: 'flex', justifyContent: 'center', opacity: o}}>
      <div
        style={{
          transform: `translateY(calc(-50% + ${y}px))`,
          background: aside ? 'rgba(40,38,52,0.86)' : 'rgba(255,255,255,0.96)',
          borderRadius: 30,
          padding: aside ? '18px 36px 22px' : '16px 36px 20px',
          maxWidth: 960,
          boxShadow: '0 8px 24px rgba(40,25,20,0.22)',
          border: aside ? '3px dashed rgba(255,255,255,0.35)' : 'none',
          textAlign: 'center',
        }}
      >
        {lines.map((ln, i) => (
          <div key={i} style={{fontFamily: aside ? F.hand : F.maru, fontWeight: aside ? 400 : 900, fontSize: fs, lineHeight: 1.36, whiteSpace: 'pre'}}>
            {ln.map((sg, j) => (
              <span key={j} style={{color: color(sg.k)}}>
                {sg.t}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────── ボソッ（顔の横に手書きで） ─────────
export const Boso: React.FC<{x: number; y: number; from: number; to: number}> = ({x, y, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 10, 160);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity: life(frame, from, to, 3, 5),
        transform: `translate(-50%, -50%) rotate(${-10 + wobble(frame, 3, 1.5)}deg) scale(${0.5 + 0.5 * p})`,
      }}
    >
      <Outlined size={64} color="#5b5866" stroke={12} font={F.hand} weight={400}>
        ボソッ…
      </Outlined>
    </div>
  );
};

// ───────── 冒頭の題字 ─────────
export type TitleLine = {text: string; size: number; color: string; stroke?: number; shadow?: string; mb?: number};

export const HookTitle: React.FC<{from: number; to: number; sub: number; lines: TitleLine[]; pill: string; top?: number}> = ({
  from,
  to,
  sub,
  lines,
  pill,
  top = 790,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  // 1コマ目からはっきり読めるように、大きめから少し縮んで止まる
  const punch = 1 + 0.12 * (1 - ramp(frame, from, from + 7));
  const ps = pop(frame, sub, 12, 200);
  return (
    <div style={{position: 'absolute', left: 0, width: W, top, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: life(frame, from, to, 0, 4)}}>
      <div style={{transform: `scale(${punch}) rotate(-3deg)`, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        {lines.map((l, i) => (
          <Outlined
            key={i}
            size={l.size}
            color={l.color}
            stroke={l.stroke ?? Math.round(l.size * 0.16)}
            font={F.dela}
            weight={400}
            shadow={l.shadow}
            style={{marginBottom: l.mb ?? -10}}
          >
            {l.text}
          </Outlined>
        ))}
      </div>
      <div
        style={{
          marginTop: 26,
          opacity: clamp01(ps * 1.5),
          transform: `scale(${0.6 + 0.4 * ps})`,
          background: '#fff',
          color: C.ink,
          fontFamily: F.maru,
          fontWeight: 900,
          fontSize: 62,
          padding: '10px 40px 14px',
          borderRadius: 999,
          boxShadow: '0 8px 24px rgba(40,25,20,0.25)',
        }}
      >
        {pill}
      </div>
    </div>
  );
};

// ───────── 疲れメーター（画面座標で置く。画面の端からはみ出さない） ─────────
export const Meter: React.FC<{x: number; y: number; scale: number; label: string; level: number; shake?: number; opacity?: number}> = ({
  x,
  y,
  scale,
  label,
  level,
  shake = 0,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  const over = level > 1;
  const fill = Math.min(level, 1.0);
  const col = level > 0.8 ? C.red : level > 0.5 ? '#F2A33A' : '#F4D35E';
  const w = 340 * scale;
  const h = 52 * scale;
  const cx = Math.min(W - w / 2 - 24, Math.max(w / 2 + 24, x));
  return (
    <div style={{position: 'absolute', left: cx - w / 2 + wobble(frame, 7, shake), top: y - h / 2 + wobble(frame, 11, shake * 0.6), width: w, height: h, opacity}}>
      <div style={{position: 'absolute', left: 0, bottom: h + 6 * scale, width: w, textAlign: 'center'}}>
        <Outlined size={36 * scale} color={C.ink} stroke={9 * scale}>
          {label}
        </Outlined>
      </div>
      <div style={{position: 'absolute', inset: 0, borderRadius: 999, background: 'rgba(255,255,255,0.92)', border: `${5 * scale}px solid #fff`, boxShadow: '0 5px 0 rgba(60,40,30,0.18)', overflow: 'hidden'}}>
        <div style={{width: `${fill * 100}%`, height: '100%', background: col, borderRadius: 999}} />
      </div>
      {over && (
        <div style={{position: 'absolute', right: -6 * scale, top: h + 2 * scale, transform: `rotate(-6deg) scale(${1 + 0.06 * Math.sin(frame * 0.9)})`}}>
          <Outlined size={46 * scale} color={C.red} stroke={10 * scale} font={F.dela} weight={400}>
            MAX!?
          </Outlined>
        </div>
      )}
    </div>
  );
};

// ───────── 凍る演出（青み・霜・ひび・きらめき） ─────────
export const Frost: React.FC<{from: number; to: number}> = ({from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = ramp(frame, from, from + 8);
  const crack = ramp(frame, from + 1, from + 10);
  const sparks = Array.from({length: 16}, (_, i) => {
    const x = (i * 197 + 83) % 1000 / 1000;
    const y = ((i * 331 + 151) % 1000) / 1000;
    const tw = 0.5 + 0.5 * Math.sin(frame * 0.35 + i * 1.9);
    return {x, y, tw, s: 10 + (i % 4) * 6};
  });
  const cracks = [
    'M0,250 L120,300 L170,260 L260,330 L300,300 L380,390',
    'M1080,180 L960,260 L1000,300 L900,380 L930,430',
    'M0,1600 L110,1540 L150,1590 L240,1500',
    'M1080,1500 L980,1560 L1010,1620 L900,1700',
  ];
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', inset: 0, background: `rgba(150,200,255,${0.16 * p})`, mixBlendMode: 'multiply'}} />
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0) 52%, rgba(225,242,255,${0.9 * p}) 100%)`}} />
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        {cracks.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={600} strokeDashoffset={600 * (1 - crack)} />
        ))}
        {sparks.map((s, i) => (
          <g key={i} transform={`translate(${s.x * 1080},${s.y * 1920}) scale(${s.s / 10})`} opacity={s.tw * p}>
            <path d="M0,-10 L2,-2 L10,0 L2,2 L0,10 L-2,2 L-10,0 L-2,-2 Z" fill="#fff" />
          </g>
        ))}
      </svg>
    </div>
  );
};

// ───────── 手書きのメモ（矢印つき） ─────────
export const Note: React.FC<{x: number; y: number; text: string; from: number; to: number; ax: number; ay: number}> = ({x, y, text, from, to, ax, ay}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 11, 170);
  const draw = ramp(frame, from + 2, from + 10);
  const len = Math.hypot(ax - x, ay - y);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: life(frame, from, to, 3, 4)}}>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <path d={`M${x},${y + 40} Q${(x + ax) / 2 + 60},${(y + ay) / 2} ${ax},${ay}`} fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" strokeDasharray={len * 1.3} strokeDashoffset={len * 1.3 * (1 - draw)} />
        <path d={`M${x},${y + 40} Q${(x + ax) / 2 + 60},${(y + ay) / 2} ${ax},${ay}`} fill="none" stroke={C.red} strokeWidth={6} strokeLinecap="round" strokeDasharray={len * 1.3} strokeDashoffset={len * 1.3 * (1 - draw)} />
      </svg>
      <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) rotate(-6deg) scale(${0.5 + 0.5 * p})`}}>
        <Outlined size={58} color={C.red} stroke={12} font={F.hand} weight={400}>
          {text}
        </Outlined>
      </div>
    </div>
  );
};

// ───────── 最後の投票ボタン ─────────
export const Poll: React.FC<{labels: [string, string]; a: number; b: number; hint: number; to: number; top?: number; cy?: number; size?: number}> = ({
  labels,
  a,
  b,
  hint,
  to,
  top = 292,
  cy = 1262,
  size = 66,
}) => {
  const frame = useCurrentFrame();
  if (frame < a || frame >= to) return null;
  const btn = (label: string, at: number, bg: string): React.ReactNode => {
    const p = pop(frame, at, 10, 200);
    return (
      <div
        style={{
          opacity: clamp01(p * 2),
          transform: `scale(${0.4 + 0.6 * p})`,
          background: bg,
          color: '#fff',
          fontFamily: F.maru,
          fontWeight: 900,
          fontSize: size,
          padding: `${Math.round(size * 0.21)}px ${Math.round(size * 0.727)}px ${Math.round(size * 0.27)}px`,
          borderRadius: 999,
          border: '7px solid #fff',
          boxShadow: '0 8px 0 rgba(60,40,30,0.2)',
        }}
      >
        {label}
      </div>
    );
  };
  const ph = pop(frame, hint, 12, 160);
  return (
    <>
      <div style={{position: 'absolute', top, left: 0, width: W, display: 'flex', justifyContent: 'center', gap: 36}}>
        {btn(labels[0], a, C.coral)}
        {btn(labels[1], b, C.navy)}
      </div>
      {frame >= hint && (
        <div style={{position: 'absolute', top: cy, left: 0, width: W, display: 'flex', justifyContent: 'center'}}>
          <div
            style={{
              transform: `translateY(-50%) scale(${0.6 + 0.4 * ph})`,
              opacity: clamp01(ph * 2),
              background: 'rgba(255,255,255,0.96)',
              borderRadius: 30,
              padding: '14px 40px 18px',
              fontFamily: F.maru,
              fontWeight: 900,
              fontSize: 54,
              color: C.ink,
              boxShadow: '0 8px 24px rgba(40,25,20,0.22)',
            }}
          >
            コメントで教えてね <span style={{color: C.coral, display: 'inline-block', transform: `translateX(${8 * Math.sin(frame * 0.4)}px)`}}>→</span>
          </div>
        </div>
      )}
    </>
  );
};

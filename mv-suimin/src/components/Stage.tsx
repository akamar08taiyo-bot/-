import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import timing from '../data/timing.json';
import { C, LINE_META } from '../data/meta';
import { F } from '../lib/fonts';
import { clamp01, eio, eo, hash, kickPulse, lerp, prog, snarePulse } from '../lib/anim';
import { MOTIFS } from './Motifs';

type Line = (typeof timing.lines)[number];
const SECTIONS = timing.sections;
const sec = (id: string) => SECTIONS.find((s) => s.id === id)!;
export const sectionAt = (t: number) => SECTIONS.find((s) => t >= s.start && t < s.end) ?? SECTIONS[SECTIONS.length - 1];

// how much each section's look applies at time t (crossfade 0.3 s around boundaries)
const weight = (id: string, t: number, fade = 0.3) => {
  const s = sec(id);
  if (!s) return 0;
  return clamp01((t - s.start + fade / 2) / fade) * clamp01((s.end - t + fade / 2) / fade);
};

// ------------------------------------------------------------------ background
export const Background: React.FC<{ t: number; frame: number }> = ({ t, frame }) => {
  const k = kickPulse(t);
  const wHook = weight('hook', t);
  const wV2 = weight('v2', t);
  const wFinal = weight('final', t);
  const ledger = 1 - wHook;
  const scroll = (t * 26) % 80;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <AbsoluteFill style={{ background: 'radial-gradient(120% 70% at 50% 18%, #1a1d2b 0%, #08090d 70%)' }} />
      <AbsoluteFill style={{ opacity: wHook, background: 'radial-gradient(110% 70% at 50% 22%, #1b2d63 0%, #0a1230 45%, #04060f 100%)' }} />
      <AbsoluteFill style={{ opacity: wV2, background: 'radial-gradient(120% 70% at 50% 15%, #2a1214 0%, #0b0708 65%)' }} />
      <AbsoluteFill style={{ opacity: wFinal, background: 'radial-gradient(120% 70% at 50% 25%, #231c14 0%, #090806 70%)' }} />
      {/* ledger paper rules */}
      <svg width={1080} height={1920} style={{ position: 'absolute', opacity: ledger }}>
        {Array.from({ length: 26 }).map((_, i) => (
          <line key={i} x1={0} x2={1080} y1={i * 80 - scroll} y2={i * 80 - scroll} stroke={C.paper} strokeOpacity={0.045 + 0.04 * k} strokeWidth={2} />
        ))}
        <line x1={58} x2={58} y1={0} y2={1920} stroke={C.red} strokeOpacity={0.28} strokeWidth={3} />
        <line x1={68} x2={68} y1={0} y2={1920} stroke={C.red} strokeOpacity={0.28} strokeWidth={3} />
      </svg>
      {/* night stars for the hook */}
      <svg width={1080} height={1920} style={{ position: 'absolute', opacity: wHook }}>
        {Array.from({ length: 90 }).map((_, i) => (
          <circle key={i} cx={hash(i * 3.1) * 1080} cy={hash(i * 7.7) * 1920} r={1 + hash(i) * 2.6} fill="#fff"
            opacity={0.15 + 0.6 * Math.abs(Math.sin(t * (0.8 + hash(i + 1) * 2) + i))} />
        ))}
      </svg>
      <AbsoluteFill style={{ backgroundColor: '#fff', opacity: 0.035 * k }} />
      <Img
        src={staticFile('noise.png')}
        style={{ position: 'absolute', left: -200 + (hash(frame) * 200) | 0, top: -200 + (hash(frame + 99) * 200) | 0, width: 1480, height: 2320, opacity: 0.07, mixBlendMode: 'screen' }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(90% 60% at 50% 45%, transparent 55%, rgba(0,0,0,0.65) 100%)' }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ motif layer
export const MotifLayer: React.FC<{ t: number }> = ({ t }) => {
  if (t >= timing.cut) return null;
  const lines = timing.lines.filter((l) => t >= l.start - 0.1 && t <= l.end + 0.12);
  const k = kickPulse(t);
  const s = snarePulse(t);
  return (
    <>
      {lines.map((l: Line) => {
        const M = MOTIFS[LINE_META[l.id]?.motif ?? 'none'];
        if (!M) return null;
        const inn = prog(t, l.start - 0.1, 0.14);
        const out = prog(t, l.end - 0.04, 0.14, (x) => x * x);
        const v2 = l.section === 'v2';
        const shake = v2 ? s * 8 : 0;
        return (
          <div key={l.id} style={{ position: 'absolute', left: 80, top: 205, width: 920, height: 700, opacity: inn * (1 - out), translate: `${shake * (hash(Math.floor(t * 30)) - 0.5)}px ${(1 - inn) * 30 - out * 50}px` }}>
            <svg width={920} height={700} viewBox="0 0 920 700" style={{ overflow: 'visible' }}>
              <M t={t - l.start} ps={l.phrases.map((p) => p.start - l.start - 0.06)} d={l.end - l.start} k={k} s={s} />
            </svg>
          </div>
        );
      })}
    </>
  );
};

// ------------------------------------------------------------------ HUD (stream overlay + sleep balance)
const gaugeAt = (t: number) => {
  const pts: [number, number][] = [
    [0, 0.62], [sec('v1').end, 0.1], [sec('hook').end, 0.72], [sec('v2').end, 0.05], [sec('final').end, 1.0],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, va] = pts[i];
    const [b, vb] = pts[i + 1];
    if (t <= b) return lerp(va, vb, i === 3 ? eio((t - a) / (b - a)) : clamp01((t - a) / (b - a)));
  }
  return 1;
};

export const HUD: React.FC<{ t: number }> = ({ t }) => {
  if (t >= timing.cut) return null;
  const s = snarePulse(t);
  const k = kickPulse(t);
  const cur = sectionAt(t);
  const lines = timing.lines.filter((l) => l.section === cur.id);
  const li = Math.max(0, lines.findIndex((l) => t >= l.start && t < l.end));
  const mm = Math.floor(t / 60);
  const ss = Math.floor(t % 60);
  const g = gaugeAt(t);
  const low = g < 0.18;
  const blocks = 20;
  const enter = prog(t, 0, 0.25);
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <div style={{ position: 'absolute', top: 92, left: 80, right: 80, display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.red, borderRadius: 10, padding: '6px 18px 8px', boxShadow: `0 0 ${10 + 30 * s}px rgba(255,59,47,${0.25 + 0.5 * s})` }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', opacity: 0.55 + 0.45 * s }} />
          <span style={{ fontFamily: F.dot, fontSize: 36, color: '#fff', letterSpacing: '0.08em' }}>LIVE</span>
        </div>
        <span style={{ fontFamily: F.dot, fontSize: 38, color: C.paper }}>{`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F.dot, fontSize: 32, color: cur.id === 'hook' ? C.moon : C.dim, letterSpacing: '0.18em' }}>{cur.label}</span>
        <span style={{ fontFamily: F.dot, fontSize: 32, color: C.paper }}>{`${String(li + 1).padStart(2, '0')}/${String(lines.length).padStart(2, '0')}`}</span>
      </div>
      <div style={{ position: 'absolute', top: 1612, left: 80, right: 80 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: F.sans, fontWeight: 900, fontSize: 34, color: C.paper, letterSpacing: '0.12em' }}>睡眠残高</span>
          <span style={{ fontFamily: F.dot, fontSize: 34, color: low ? C.red : g > 0.95 ? C.moon : C.blue, opacity: low ? 0.4 + 0.6 * Math.round(0.5 + 0.5 * Math.sin(t * 12)) : 1 }}>
            {low ? 'LOW' : g > 0.95 ? 'FULL' : `${Math.round(g * 100)}%`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: blocks }).map((_, i) => {
            const on = clamp01(g * blocks - i);
            return (
              <div key={i} style={{ flex: 1, height: 30, borderRadius: 4, background: '#1e212b' }}>
                <div style={{ width: `${on * 100}%`, height: '100%', borderRadius: 4, background: low ? C.red : g > 0.95 ? C.moon : C.blue, opacity: 0.85 + 0.15 * k }} />
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ transitions & cut
export const Overlays: React.FC<{ t: number }> = ({ t }) => {
  const hook = sec('hook').start;
  const v2 = sec('v2').start;
  const fin = sec('final').start;
  const v28 = timing.lines.find((l) => l.id === 'v2-8')!;
  // blink into the hook
  const blinkClose = prog(t, hook - 0.14, 0.12, (x) => x * x);
  const blinkOpen = prog(t, hook + 0.02, 0.28);
  let lid = t < hook + 0.02 ? blinkClose : 1 - blinkOpen;
  // long close at the end of verse 2 ("まぶたの幕まで下ろして終わる"), open into the final hook
  const p2 = v28.phrases[1].start;
  const longClose = prog(t, p2 + 0.5, fin - p2 - 0.55, eio);
  const finOpen = prog(t, fin + 0.05, 0.7, eo);
  if (t >= p2 && t < fin + 0.05) lid = Math.max(lid, longClose);
  if (t >= fin + 0.05 && t < fin + 0.8) lid = Math.max(lid, 1 - finOpen);
  const flash = t >= v2 ? Math.exp(-(t - v2) / 0.12) * 0.75 : 0;
  const h = 960 * lid;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {lid > 0.001 ? (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h, background: '#000', borderBottomLeftRadius: '50% 30px', borderBottomRightRadius: '50% 30px' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#000', borderTopLeftRadius: '50% 30px', borderTopRightRadius: '50% 30px' }} />
        </>
      ) : null}
      {flash > 0.01 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flash }} /> : null}
      {t >= timing.cut ? <AbsoluteFill style={{ backgroundColor: '#000' }} /> : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ punchline (after the hard cut)
export const Punch: React.FC<{ t: number }> = ({ t }) => {
  const line = timing.lines.find((l) => l.id === 'punch-1')!;
  if (t < line.start - 0.1 || t >= line.end) return null;
  const text = line.text;
  const a = prog(t, line.start - 0.05, 0.45, eo);
  const zoom = 1 + 0.015 * clamp01((t - line.start) / 2);
  const style: React.CSSProperties = {
    fontFamily: F.mincho,
    fontWeight: 500,
    fontSize: 70,
    letterSpacing: '0.14em',
    color: C.paper,
    whiteSpace: 'nowrap',
  };
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', scale: String(zoom) }}>
      <div style={{ position: 'absolute', top: 820, ...style, opacity: a }}>{text}</div>
      <div
        style={{
          position: 'absolute',
          top: 916,
          ...style,
          opacity: a * 0.22,
          scale: '1 -1',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)',
        }}
      >
        {text}
      </div>
      <div style={{ position: 'absolute', top: 905, width: 640 * a, height: 2, background: C.dim }} />
    </AbsoluteFill>
  );
};

import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import timing from '../data/timing.json';
import { C, LINE_META } from '../data/meta';
import { F } from '../lib/fonts';
import { clamp01, eback, eio, eo, hash, kickPulse, lerp, prog, snarePulse } from '../lib/anim';
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
    [0, 0.62], [sec('v1').end, 0.1], [sec('hook').end, 0.72], [sec('v2').end, 0.05], [sec('final').end, 0.85], [timing.cut, 1.0],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, va] = pts[i];
    const [b, vb] = pts[i + 1];
    if (t <= b) return lerp(va, vb, i >= 3 ? eio((t - a) / (b - a)) : clamp01((t - a) / (b - a)));
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

// ------------------------------------------------------------------ intro (before the first line)
export const Intro: React.FC<{ t: number }> = ({ t }) => {
  const first = timing.lines[0].start;
  if (t >= first + 0.1) return null;
  const a = prog(t, 0.15, 0.3, (x) => eback(x, 2));
  const out = prog(t, first - 0.35, 0.3, eo);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, background: C.red, borderRadius: 26, padding: '22px 52px 26px', scale: String(a * (1 - 0.6 * out)), opacity: 1 - out, translate: `0px ${-180 * out}px` }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: '#fff', opacity: 0.5 + 0.5 * Math.round(0.5 + 0.5 * Math.sin(t * 9)) }} />
        <span style={{ fontFamily: F.dot, fontSize: 120, color: '#fff', letterSpacing: '0.08em' }}>LIVE</span>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ punchline (sung, then the build until the hard cut)
const units = (s: string) => [...s].reduce((a, ch) => a + (/[\x20-\x7e]/.test(ch) ? 0.62 : 1), 0);

export const Punch: React.FC<{ t: number }> = ({ t }) => {
  const line = timing.lines.find((l) => l.id === 'punch-1')!;
  if (t < line.start - 0.3 || t >= timing.cut) return null;
  const t0 = line.start - 0.07;
  const sung = Math.max(1.5, (timing.cut - line.start) * 0.6);
  const text = line.text;
  const tail = text.endsWith('いつだ') ? 'いつだ' : text.slice(-3);
  const head = text.slice(0, text.length - tail.length);
  const fillHead = clamp01((t - line.start) / (sung * 0.72));
  const fillTail = clamp01((t - line.start - sung * 0.72) / (sung * 0.28));
  const k = kickPulse(t);
  const build = clamp01((t - line.start - sung) / Math.max(0.5, timing.cut - line.start - sung));
  const dark = prog(t, line.start - 0.3, 0.5);
  const fig = prog(t, t0, 0.6, eo);
  const push = 1 + 0.07 * eio(build) + 0.012 * k;
  const headSize = Math.min(104, 880 / (units(head) * 1.1));
  const row = (str: string, fill: number, size: number, color: string, weight: number) => (
    <div style={{ position: 'relative', fontFamily: F.mincho, fontWeight: weight, fontSize: size, letterSpacing: '0.1em', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
      <div style={{ color, opacity: 0.22 }}>{str}</div>
      <div style={{ position: 'absolute', inset: 0, color, clipPath: `inset(-20% ${(1 - fill) * 100}% -20% -5%)`, textShadow: `0 0 ${20 + 40 * build}px rgba(244,226,161,${0.25 + 0.35 * build})` }}>{str}</div>
    </div>
  );
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: 0.55 * dark + 0.3 * build }} />
      <AbsoluteFill style={{ scale: String(push) }}>
        <svg width={1080} height={1920} style={{ position: 'absolute', opacity: fig }}>
          <line x1={540} y1={290} x2={540} y2={900} stroke={C.paper} strokeOpacity={0.45} strokeWidth={3} />
          <g transform={`translate(${lerp(300, 345, fig)} 0)`}>
            <g transform="translate(0 760) scale(1.05)">
              <ellipse cx={0} cy={-120} rx={70} ry={84} fill={C.paper} />
              <path d="M -150 120 C -150 10, -70 -30, 0 -30 C 70 -30, 150 10, 150 120 Z" fill={C.paper} />
              <path d="M 52 -150 L 92 -128 L 70 -112" fill={C.paper} />
            </g>
          </g>
          <g transform={`translate(${lerp(780, 735, fig)} 0)`} opacity={0.55 + 0.35 * build}>
            <g transform="translate(0 760) scale(-1.05 1.05)">
              <ellipse cx={0} cy={-120} rx={70} ry={84} fill={C.moon} />
              <path d="M -150 120 C -150 10, -70 -30, 0 -30 C 70 -30, 150 10, 150 120 Z" fill={C.moon} />
              <path d="M 52 -150 L 92 -128 L 70 -112" fill={C.moon} />
            </g>
          </g>
          <line x1={445} y1={613} x2={635} y2={613} stroke={C.moon} strokeWidth={5} strokeDasharray="3 14" strokeLinecap="round" opacity={fig} />
        </svg>
        <div style={{ position: 'absolute', top: 1010, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: prog(t, t0, 0.4) }}>
          {row(head, fillHead, headSize, '#F3EEDF', 900)}
          {row(tail, fillTail, 220, C.moon, 900)}
          <div style={{ marginTop: -26, scale: '1 -1', opacity: 0.18 + 0.2 * build, WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%)', maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%)' }}>
            {row(tail, fillTail, 220, C.moon, 900)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ outro (piano after the cut): the stream ends, eyes close
export const Outro: React.FC<{ t: number }> = ({ t }) => {
  const o0 = timing.outroStart;
  if (t < o0) return null;
  const end = timing.musicEnd;
  const fadeOut = prog(t, end - 1.8, 1.7, eio);
  const stars = prog(t, o0, 2.5);
  const eye = prog(t, o0 + 0.4, 1.6, eio);
  const moon = prog(t, o0 + 1.2, 1.5, eo);
  const ui = prog(t, o0 + 0.2, 0.8);
  const arc = 'M 300 900 Q 540 1010 780 900';
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ opacity: 1 - fadeOut }}>
        <AbsoluteFill style={{ opacity: stars, background: 'radial-gradient(90% 60% at 50% 35%, #0e1836 0%, #03050b 75%)' }} />
        <svg width={1080} height={1920} style={{ position: 'absolute' }}>
          {Array.from({ length: 70 }).map((_, i) => (
            <circle key={i} cx={hash(i * 5.3) * 1080} cy={hash(i * 2.9) * 1500} r={1 + hash(i + 4) * 2.4} fill="#fff"
              opacity={stars * (0.15 + 0.55 * Math.abs(Math.sin(t * (0.5 + hash(i) * 1.5) + i)))} />
          ))}
          <defs>
            <mask id="outromoon">
              <circle cx={540} cy={600} r={110} fill="#fff" />
              <circle cx={586} cy={567} r={95} fill="#000" />
            </mask>
            <radialGradient id="outroglow">
              <stop offset="0" stopColor={C.moon} stopOpacity={0.3} />
              <stop offset="1" stopColor={C.moon} stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={540} cy={600} r={280} fill="url(#outroglow)" opacity={moon} />
          <circle cx={540} cy={600} r={110} fill={C.moon} mask="url(#outromoon)" opacity={moon} transform={`translate(0 ${(1 - moon) * 40})`} />
          <path d={arc} fill="none" stroke={C.paper} strokeWidth={10} strokeLinecap="round" strokeDasharray={560} strokeDashoffset={560 * (1 - eye)} />
          {[0, 1, 2, 3, 4].map((i) => {
            const x = 360 + i * 90;
            const y = 900 + 110 * (1 - Math.pow((x - 540) / 240, 2)) * 0.5;
            return <line key={i} x1={x} y1={y + 6} x2={x + (i - 2) * 9} y2={y + 44} stroke={C.paper} strokeWidth={7} strokeLinecap="round" opacity={clamp01(eye * 5 - 4)} />;
          })}
        </svg>
        <div style={{ position: 'absolute', top: 92, left: 80, right: 80, display: 'flex', alignItems: 'center', gap: 22, opacity: ui }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#2a2d36', borderRadius: 10, padding: '6px 18px 8px' }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: C.gray }} />
            <span style={{ fontFamily: F.dot, fontSize: 36, color: C.gray, letterSpacing: '0.08em' }}>OFFLINE</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: F.dot, fontSize: 32, color: C.dim, letterSpacing: '0.18em' }}>配信終了</span>
        </div>
        <div style={{ position: 'absolute', top: 1612, left: 80, right: 80, opacity: ui }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontFamily: F.sans, fontWeight: 900, fontSize: 34, color: C.paper, letterSpacing: '0.12em' }}>睡眠残高</span>
            <span style={{ fontFamily: F.dot, fontSize: 34, color: C.moon }}>FULL</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 30, borderRadius: 4, background: C.moon, opacity: 0.35 + 0.65 * clamp01((t - o0 - 0.3) * 6 - i * 0.25) }} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

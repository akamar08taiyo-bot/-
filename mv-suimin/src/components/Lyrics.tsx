import React from 'react';
import timing from '../data/timing.json';
import { C, LINE_META } from '../data/meta';
import { F } from '../lib/fonts';
import { clamp01, eback, eo, hash, kickPulse, prog, snarePulse } from '../lib/anim';

type Phrase = { text: string; start: number; end: number };
type Line = { id: string; section: string; text: string; start: number; end: number; phrases: Phrase[] };

const LEAD = 0.07; // show text slightly before the voice
const AREA = { top: 1000, height: 560, width: 900 };

const units = (s: string) => [...s].reduce((a, ch) => a + (/[\x20-\x7e]/.test(ch) ? 0.62 : 1), 0);

type Seg = { s: string; hl: boolean };
function segments(text: string, hl: string[]): Seg[] {
  const words = [...hl].sort((a, b) => b.length - a.length);
  const out: Seg[] = [];
  let i = 0;
  let buf = '';
  while (i < text.length) {
    const w = words.find((x) => x && text.startsWith(x, i));
    if (w) {
      if (buf) out.push({ s: buf, hl: false });
      out.push({ s: w, hl: true });
      buf = '';
      i += w.length;
    } else {
      buf += text[i];
      i++;
    }
  }
  if (buf) out.push({ s: buf, hl: false });
  return out;
}

const STYLE: Record<string, { font: string; max: number; color: string; accent: string; weight: number; track: number }> = {
  v1: { font: F.display, max: 132, color: C.paper, accent: C.red, weight: 400, track: 0.01 },
  hook: { font: F.mincho, max: 112, color: '#F3EEDF', accent: C.moon, weight: 900, track: 0.06 },
  v2: { font: F.display, max: 132, color: C.paper, accent: C.red, weight: 400, track: 0.0 },
  final: { font: F.mincho, max: 104, color: '#F3EEDF', accent: C.red, weight: 900, track: 0.05 },
};

const PhraseView: React.FC<{ p: Phrase; size: number; t: number; line: Line; idx: number }> = ({ p, size, t, line, idx }) => {
  const st = STYLE[line.section] ?? STYLE.v1;
  const meta = LINE_META[line.id];
  const segs = segments(p.text, meta?.hl ?? []);
  const t0 = p.start - LEAD;
  const sung = Math.max(0.25, (p.end - p.start) * 0.88);
  const fill = clamp01((t - p.start) / sung);
  const active = t >= t0 && t < p.end;
  const isHook = line.section === 'hook' || line.section === 'final';
  const v2 = line.section === 'v2';

  let ci = 0;
  const renderChars = (layer: 'base' | 'top') =>
    segs.map((seg, si) => (
      <span key={si} style={{ color: layer === 'base' ? (seg.hl ? st.accent : st.color) : seg.hl ? st.accent : st.color }}>
        {[...seg.s].map((ch) => {
          const i = ci++;
          const a = t0 + i * (isHook ? 0.03 : 0.016);
          const x = prog(t, a, isHook ? 0.32 : 0.15, isHook ? eo : (v) => eback(v, 2.2));
          const sc = isHook ? 1 : 1.55 - 0.55 * x;
          const dy = isHook ? (1 - x) * 34 : (1 - x) * -18;
          const jitter = v2 && x < 1 ? (hash(i + idx * 31) - 0.5) * 24 * (1 - x) : 0;
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: clamp01(x * 1.4),
                translate: `${jitter}px ${dy}px`,
                scale: String(sc),
                whiteSpace: 'pre',
              }}
            >
              {ch}
            </span>
          );
        })}
      </span>
    ));

  const kick = active ? kickPulse(t) : 0;
  const sn = v2 && active ? snarePulse(t) : 0;
  const common: React.CSSProperties = {
    fontFamily: st.font,
    fontWeight: st.weight,
    fontSize: size,
    lineHeight: 1.12,
    letterSpacing: `${st.track}em`,
    whiteSpace: 'nowrap',
  };
  ci = 0;
  const base = renderChars('base');
  ci = 0;
  const top = renderChars('top');
  return (
    <div
      style={{
        position: 'relative',
        scale: String(1 + 0.04 * kick),
        translate: `${sn * 10}px 0px`,
      }}
    >
      <div style={{ ...common, opacity: 0.3 }}>{base}</div>
      <div
        style={{
          ...common,
          position: 'absolute',
          left: 0,
          top: 0,
          clipPath: `inset(-20% ${(1 - fill) * 100}% -20% -5%)`,
          textShadow: isHook ? `0 0 ${18 + 30 * kick}px rgba(244,226,161,0.35)` : `0 6px 0 rgba(0,0,0,0.45)`,
        }}
      >
        {top}
      </div>
    </div>
  );
};

const LineView: React.FC<{ line: Line; t: number }> = ({ line, t }) => {
  const st = STYLE[line.section] ?? STYLE.v1;
  let sizes = line.phrases.map((p) => Math.min(st.max, AREA.width / (units(p.text) * (1 + st.track))));
  const gap = (s: number) => s * 0.2;
  const total = sizes.reduce((a, s) => a + s * 1.12 + gap(s), 0);
  if (total > AREA.height) sizes = sizes.map((s) => (s * AREA.height) / total);

  const exitStart = line.end - 0.06;
  const ex = prog(t, exitStart, 0.16, (v) => v * v);
  const enter = prog(t, line.start - LEAD - 0.04, 0.12);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: AREA.top,
        height: AREA.height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        opacity: (1 - ex) * enter,
        translate: `0px ${-70 * ex}px`,
      }}
    >
      {line.phrases.map((p, i) => (
        <div key={i} style={{ marginBottom: gap(sizes[i]), visibility: t >= p.start - LEAD - 0.02 ? 'visible' : 'hidden' }}>
          <PhraseView p={p} size={sizes[i]} t={t} line={line} idx={i} />
        </div>
      ))}
    </div>
  );
};

export const Lyrics: React.FC<{ t: number }> = ({ t }) => {
  const lines = (timing.lines as Line[]).filter((l) => l.section !== 'punch' && t >= l.start - 0.25 && t <= l.end + 0.25);
  if (t >= timing.cut) return null;
  return (
    <>
      {lines.map((l) => (
        <LineView key={l.id} line={l} t={t} />
      ))}
    </>
  );
};

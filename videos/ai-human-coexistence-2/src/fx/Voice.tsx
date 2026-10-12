import React from 'react';
import {clamp, easeOut, noise1} from '../lib/math';

// 話すだけで書ける空中のタブレット：声の波形が揺れているあいだ、手順（プログラム）が一文字ずつ刻まれていく
// 行頭の全角スペースは字下げ（「もし〜なら」の中身）。行番号つき
export type VoiceDef = {
  x: number; // 中心（割合）
  y: number;
  w: number; // 幅（割合）
  lines: string[];
  t0: number;
  t1?: number;
  tilt?: number; // 奥行きの傾き（度）。話す人の方へ向ける
  rate?: number; // 一文字の速さ（秒）
  pause?: number; // 行のあいだの間（秒）
  title?: string; // 上の帯の小さな題
};

export const voiceTimes = (d: VoiceDef) => {
  const rate = d.rate ?? 0.12;
  const pause = d.pause ?? 0.7;
  const starts: number[] = [];
  let s = d.t0 + 1.3;
  for (const ln of d.lines) {
    starts.push(s);
    s += [...ln.trimStart()].length * rate + pause;
  }
  return {starts, done: s - pause, rate};
};

export const VoiceTablet: React.FC<{d: VoiceDef; t: number; t1: number; W?: number; H?: number}> = ({d, t, t1, W = 1920, H = 1080}) => {
  if (t < d.t0) return null;
  const u = t - d.t0;
  const {starts, done, rate} = voiceTimes(d);
  const pw = d.w * W;
  const longest = Math.max(...d.lines.map((ln) => [...ln].length));
  const fs = Math.min(pw / 13.5, pw / (longest + 3.8));
  const ph = fs * 2.2 + d.lines.length * fs * 1.75 + fs * 0.9;
  const line = easeOut(clamp(u / 0.45));
  const open = easeOut(clamp((u - 0.35) / 0.55));
  const out = clamp((t1 - t) / 0.8);
  const speaking = t >= starts[0] - 0.3 && t < done + 0.15;
  const saved = clamp((t - done - 0.3) / 0.25) * clamp((done + 1.6 - t) / 0.8);
  const bars = 16;
  return (
    <div
      style={{
        position: 'absolute',
        left: d.x * W - pw / 2,
        top: d.y * H - ph / 2 + Math.sin(t * 1.1 + d.x * 9) * 2.5,
        width: pw,
        height: ph,
        transform: `perspective(900px) rotateY(${d.tilt ?? 0}deg)`,
        opacity: out,
        pointerEvents: 'none',
      }}
    >
      {/* 暗いガラス＋光の板 */}
      <div style={{position: 'absolute', inset: 0, transform: `scaleY(${open})`, borderRadius: 12, background: 'linear-gradient(180deg, rgba(14,22,38,0.5), rgba(18,28,46,0.36))'}} />
      <div
        style={{
          position: 'absolute',
          left: pw * (0.5 - 0.5 * line),
          width: pw * line,
          top: ph / 2 - 1,
          height: 2,
          background: 'rgba(255,236,200,0.95)',
          boxShadow: '0 0 14px 3px rgba(255,190,110,0.9)',
          opacity: 1 - open * 0.85,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'screen',
          transform: `scaleY(${open})`,
          borderRadius: 12,
          border: `1.5px solid rgba(255,232,196,${0.7 + saved * 0.3})`,
          background: 'linear-gradient(180deg, rgba(255,210,150,0.2), rgba(140,200,255,0.08)), repeating-linear-gradient(180deg, rgba(255,255,255,0) 0 3px, rgba(255,240,220,0.08) 3px 4px)',
          boxShadow: `0 0 ${22 + saved * 18}px 2px rgba(255,190,120,${0.42 + saved * 0.4}), inset 0 0 18px rgba(255,214,160,0.32)`,
        }}
      />
      {open > 0.6 ? (
        <div style={{position: 'absolute', inset: 0, opacity: clamp((open - 0.6) / 0.4), padding: `${fs * 0.55}px ${fs * 0.75}px`}}>
          {/* 上の帯：マイクの印と声の波形 */}
          <div style={{display: 'flex', alignItems: 'center', gap: fs * 0.45, height: fs * 1.2, borderBottom: '1px solid rgba(255,232,196,0.35)', marginBottom: fs * 0.45}}>
            <div
              style={{
                width: fs * 0.5,
                height: fs * 0.5,
                borderRadius: '50%',
                background: speaking ? 'rgba(255,214,150,0.95)' : 'rgba(255,214,150,0.45)',
                boxShadow: speaking ? `0 0 ${8 + 6 * Math.sin(t * 6)}px rgba(255,190,110,0.95)` : 'none',
              }}
            />
            <div style={{display: 'flex', alignItems: 'center', gap: fs * 0.14, height: fs}}>
              {Array.from({length: bars}).map((_, k) => {
                const env = speaking ? 0.2 + 0.8 * noise1(t * 7.5 + k * 0.9, k) * (0.6 + 0.4 * noise1(t * 2.1, 9)) : 0.08;
                return <div key={k} style={{width: fs * 0.12, height: fs * env, borderRadius: fs, background: 'rgba(255,232,200,0.85)', boxShadow: '0 0 6px rgba(255,190,110,0.8)'}} />;
              })}
            </div>
            {d.title ? (
              <div style={{marginLeft: 'auto', fontFamily: "'Zen Maru Gothic', sans-serif", fontWeight: 700, fontSize: fs * 0.62, letterSpacing: '0.08em', color: 'rgba(255,236,210,0.8)', textShadow: '0 0 6px rgba(255,170,90,0.8)'}}>{d.title}</div>
            ) : null}
          </div>
          {/* 手順：行番号＋一文字ずつ */}
          {d.lines.map((ln, i) => {
            const body = ln.trimStart();
            const indent = [...ln].length - [...body].length;
            const n = Math.max(0, Math.min([...body].length, Math.floor((t - starts[i]) / rate) + 1));
            const typing = t >= starts[i] && n < [...body].length;
            const caret = (typing || (i === d.lines.length - 1 && t >= starts[i] && t < done + 1.2) || (t >= starts[i] && i < d.lines.length - 1 && t < starts[i + 1])) && Math.floor(t * 2.4) % 2 === 0;
            return (
              <div key={i} style={{display: 'flex', alignItems: 'baseline', height: fs * 1.75, fontFamily: "'Zen Maru Gothic', sans-serif", fontWeight: 700}}>
                <div style={{width: fs * 1.1, fontSize: fs * 0.6, color: 'rgba(255,220,180,0.55)', textAlign: 'right', marginRight: fs * 0.55}}>{t >= starts[i] - 0.2 ? i + 1 : ''}</div>
                <div style={{paddingLeft: indent * fs * 1.0, fontSize: fs, letterSpacing: '0.06em', color: '#fff8ec', textShadow: '0 0 4px rgba(255,190,110,1), 0 0 12px rgba(255,170,90,0.75), 0 1px 2px rgba(0,0,0,0.6)', whiteSpace: 'nowrap'}}>
                  {[...body].slice(0, t >= starts[i] ? n : 0).join('')}
                  <span style={{display: 'inline-block', width: fs * 0.08, height: fs * 1.05, marginLeft: fs * 0.06, verticalAlign: '-0.15em', background: caret ? 'rgba(255,240,220,0.95)' : 'transparent', boxShadow: caret ? '0 0 6px rgba(255,190,110,0.9)' : 'none'}} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

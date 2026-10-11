import React from 'react';
import {clamp, easeOut, hash} from '../lib/math';
import {FloatText} from './FloatText';

// 空中電子版：空中に浮かぶ半透明の掲示板。線→面→文字の順に現れる
export const HoloBoard: React.FC<{
  t: number;
  t0: number;
  t1?: number;
  x: number; // 中心（0..1、画面基準）
  y: number;
  w: number; // 幅（0..1）
  lines: string[];
  tilt?: number;
  small?: boolean;
  W?: number;
  H?: number;
}> = ({t, t0, t1 = 999, x, y, w, lines, tilt = 0, small = false, W = 1920, H = 1080}) => {
  if (t < t0) return null;
  const u = t - t0;
  const line = easeOut(clamp(u / 0.45));
  const open = easeOut(clamp((u - 0.35) / 0.55));
  const out = clamp((t1 - t) / 0.8);
  const fl = 0.9 + 0.1 * hash(Math.floor(t * 24) * 1.37) * (u < 1.4 ? 2.5 : 0.5);
  const pw = w * W;
  // 文字数に合わせて大きさを決める（全角1.08em、半角0.6em、2行目以降は0.82倍）。枠の86%に収める
  const em = (s: string) => [...s].reduce((a, c) => a + (/[\x20-\x7e]/.test(c) ? 0.6 : 1.08), 0);
  const widest = Math.max(...lines.map((ln, i) => em(ln) * (i === 0 ? 1 : 0.82)));
  const fs = Math.round(Math.min(small ? pw / 8.2 : pw / 7.4, (pw * 0.86) / widest));
  const ph = (fs * 1.55) * lines.length + fs * 0.9;
  const bob = Math.sin(t * 1.3 + x * 10) * 3;
  return (
    <div
      style={{
        position: 'absolute',
        left: x * W - pw / 2,
        top: y * H - ph / 2 + bob,
        width: pw,
        height: ph,
        transform: `perspective(900px) rotateY(${tilt}deg)`,
        opacity: out * fl,
        pointerEvents: 'none',
      }}
    >
      {/* 暗いガラス（明るい背景でも文字が読めるように） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scaleY(${open})`,
          borderRadius: 10,
          background: 'linear-gradient(180deg, rgba(16,24,40,0.46), rgba(20,30,48,0.34))',
        }}
      />
      {/* 出現の光の線 */}
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
      {/* パネル */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'screen',
          transform: `scaleY(${open})`,
          borderRadius: 10,
          border: '1.5px solid rgba(255,232,196,0.75)',
          background:
            'linear-gradient(180deg, rgba(255,210,150,0.22), rgba(140,200,255,0.10)), repeating-linear-gradient(180deg, rgba(255,255,255,0) 0 3px, rgba(255,240,220,0.09) 3px 4px)',
          boxShadow: '0 0 22px 2px rgba(255,190,120,0.45), inset 0 0 18px rgba(255,214,160,0.35)',
        }}
      />
      {/* 角の飾り */}
      {open > 0.9
        ? [0, 1, 2, 3].map((k) => (
            <div
              key={k}
              style={{
                position: 'absolute',
                width: 14,
                height: 14,
                left: k % 2 ? pw - 16 : 2,
                top: k < 2 ? 2 : ph - 16,
                borderLeft: k % 2 ? 'none' : '2px solid rgba(255,240,210,0.9)',
                borderRight: k % 2 ? '2px solid rgba(255,240,210,0.9)' : 'none',
                borderTop: k < 2 ? '2px solid rgba(255,240,210,0.9)' : 'none',
                borderBottom: k < 2 ? 'none' : '2px solid rgba(255,240,210,0.9)',
              }}
            />
          ))
        : null}
      {/* 文字 */}
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: fs * 0.32}}>
        {lines.map((ln, i) => (
          <FloatText
            key={i}
            text={ln}
            t={t}
            t0={t0 + 0.9 + i * 0.5}
            t1={t1}
            stagger={0.06}
            rise={8}
            glow="rgba(255,190,110,0.95)"
            style={{
              fontFamily: 'Maru',
              fontWeight: i === 0 ? 900 : 700,
              fontSize: i === 0 ? fs : fs * 0.82,
              letterSpacing: '0.08em',
              color: i === 0 ? '#fffaf0' : '#ffeed6',
              textShadow: '0 0 4px rgba(255,190,110,1), 0 0 12px rgba(255,170,90,0.8), 0 1px 2px rgba(0,0,0,0.6)',
            }}
          />
        ))}
      </div>
    </div>
  );
};

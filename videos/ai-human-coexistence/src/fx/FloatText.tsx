import React from 'react';
import {clamp, easeOut, hash} from '../lib/math';

// 文字が一文字ずつ光りながら浮かび上がる
export const FloatText: React.FC<{
  text: string;
  t: number;
  t0: number;
  t1: number;
  stagger?: number;
  rise?: number;
  glow?: string;
  style?: React.CSSProperties;
  vertical?: boolean;
  fadeOut?: number;
}> = ({text, t, t0, t1, stagger = 0.055, rise = 14, glow = 'rgba(255,196,120,0.95)', style, vertical = false, fadeOut = 0.9}) => {
  const chars = Array.from(text);
  const out = clamp((t1 - t) / fadeOut);
  if (t < t0 - 0.01 || out <= 0) return null;
  return (
    <span style={{...style, display: 'inline-block', whiteSpace: 'nowrap', writingMode: vertical ? 'vertical-rl' : undefined}}>
      {chars.map((ch, i) => {
        const local = (t - t0 - i * stagger) / 0.85;
        const k = easeOut(clamp(local));
        const flash = clamp(local * 2.2) * clamp((1.6 - local) / 1.2);
        const wob = (hash(i * 3.7 + Math.floor(t * 10)) - 0.5) * 0.06 * (1 - k);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: (k + wob) * out,
              transform: vertical ? `translateX(${(1 - k) * -rise * 0.6}px)` : `translateY(${(1 - k) * rise}px)`,
              // ぼかしは浮かび上がる途中だけ（止まった文字にフィルターをかけると書き出しが重くなる）
              filter: k < 0.995 ? `blur(${(1 - k) * 7}px)` : undefined,
              textShadow: `${style?.textShadow ?? ''}${style?.textShadow ? ',' : ''} 0 0 ${8 + flash * 22}px ${glow.replace(/[\d.]+\)$/, `${(0.25 + flash * 0.75).toFixed(2)})`)}`,
            }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        );
      })}
    </span>
  );
};

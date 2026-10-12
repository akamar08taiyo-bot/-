import React from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, easeOut, fadeWindow} from '../lib/math';
import {FloatText} from './FloatText';

const shadow = '0 0 18px rgba(8,6,16,0.6), 0 2px 5px rgba(8,6,16,0.65)';

// 下部のテロップ（明朝・文字が浮かび上がる）
export const Caption: React.FC<{t: number; t0: number; t1: number; text: string; color?: string}> = ({t, t0, t1, text, color = '#fffaf0'}) => {
  if (t < t0 - 0.05 || t > t1 + 0.05) return null;
  const bg = fadeWindow(t, t0, t1, 0.8, 0.9);
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 104}}>
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          width: 1500,
          height: 150,
          left: 210,
          background: 'radial-gradient(ellipse 50% 50% at 50% 55%, rgba(10,8,20,0.42), rgba(10,8,20,0) 72%)',
          opacity: bg,
        }}
      />
      <FloatText
        text={text}
        t={t}
        t0={t0}
        t1={t1}
        style={{fontFamily: "'Zen Old Mincho', serif", fontWeight: 400, fontSize: 46, letterSpacing: '0.16em', color, textShadow: shadow}}
      />
    </AbsoluteFill>
  );
};

// 章題（縦書き・右上・浮かび上がる）
export const ChapterCard: React.FC<{t: number; t0: number; t1: number; num: string; title: string; time: string; right?: number}> = ({t, t0, t1, num, title, time, right = 150}) => {
  const a = fadeWindow(t, t0, t1, 1.0, 1.2);
  if (a <= 0) return null;
  const lineH = 260 * easeOut(clamp((t - t0 - 0.4) / 1.6));
  const style: React.CSSProperties = {fontFamily: "'Zen Old Mincho', serif", color: '#fffaf0', textShadow: shadow};
  return (
    <AbsoluteFill>
      {/* 文字の後ろの薄い影（看板や明るい背景の上でも読めるように） */}
      <div style={{position: 'absolute', right: right - 90, top: 40, width: 330, height: 680, opacity: a, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(8,8,18,0.5), rgba(8,8,18,0.28) 45%, rgba(8,8,18,0) 72%)'}} />
      <div style={{position: 'absolute', right, top: 120, display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 26}}>
        <FloatText text={title ? `${num}　${title}` : num} t={t} t0={t0} t1={t1} vertical stagger={0.12} style={{...style, fontWeight: 700, fontSize: 76, letterSpacing: '0.22em'}} />
        <div style={{width: 1.5, height: lineH, background: 'rgba(255,250,240,0.8)', marginTop: 12, opacity: a, boxShadow: '0 0 10px rgba(255,200,130,0.8)'}} />
        <FloatText text={time} t={t} t0={t0 + 0.6} t1={t1} vertical stagger={0.08} style={{...style, fontWeight: 400, fontSize: 30, letterSpacing: '0.3em', marginTop: 8}} />
      </div>
    </AbsoluteFill>
  );
};

// タイトル・エンドカード
// top：文字の塊の縦の中心（0..1、省略時は画面中央）、size：題の文字の大きさ（px）、subFirst：小見出しを題の上に置く
export const TitleCard: React.FC<{t: number; t0: number; t1: number; text: string; sub: string; small?: string; top?: number; size?: number; subFirst?: boolean}> = ({
  t, t0, t1, text, sub, small, top, size = 124, subFirst = false,
}) => {
  const a = fadeWindow(t, t0, t1, 1.4, 1.4);
  if (a <= 0) return null;
  const k = easeOut(clamp((t - t0) / 3));
  const style: React.CSSProperties = {fontFamily: "'Zen Old Mincho', serif", color: '#fffaf0', textShadow: shadow};
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse 45% 35% at 50% ${(top ?? 0.5) * 100}%, rgba(8,6,18,0.45), rgba(8,6,18,0) 75%)`, opacity: a}} />
      <div style={{display: 'flex', flexDirection: subFirst ? 'column-reverse' : 'column', alignItems: 'center', transform: `translateY(${(top === undefined ? 0 : (top - 0.5) * 1080) - 24 + (1 - k) * 10}px)`}}>
        <FloatText text={text} t={t} t0={t0} t1={t1} stagger={0.13} rise={22} style={{...style, fontWeight: 700, fontSize: size, letterSpacing: '0.16em', paddingLeft: '0.16em'}} />
        <div style={{display: 'flex', alignItems: 'center', gap: 26, marginTop: subFirst ? 0 : 34, marginBottom: subFirst ? 26 : 0}}>
          <div style={{width: 90 * k, height: 1.5, background: 'rgba(255,250,240,0.85)', opacity: a}} />
          <FloatText text={sub} t={t} t0={subFirst ? t0 - 0.6 : t0 + 1.1} t1={t1} stagger={0.035} style={{...style, fontWeight: 400, fontSize: 34, letterSpacing: '0.18em'}} />
          <div style={{width: 90 * k, height: 1.5, background: 'rgba(255,250,240,0.85)', opacity: a}} />
        </div>
        {small ? (
          <div style={{marginTop: 40}}>
            <FloatText text={small} t={t} t0={t0 + 2.0} t1={t1} stagger={0.03} style={{...style, fontSize: 24, letterSpacing: '0.22em', opacity: 0.85}} />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

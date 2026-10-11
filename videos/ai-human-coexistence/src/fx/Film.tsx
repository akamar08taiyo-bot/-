import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {hash} from '../lib/math';

// フィルムの質感：粒子・周辺減光・黒の持ち上げ
export const FilmLook: React.FC<{grain?: number; vignette?: number; lift?: number}> = ({
  grain = 0.17,
  vignette = 0.42,
  lift = 0.1,
}) => {
  const f = useCurrentFrame();
  const k = Math.floor(f / 2); // 15fps 相当で粒子が変わる
  const idx = k % 8;
  const ox = Math.floor(hash(k * 3.1) * 512);
  const oy = Math.floor(hash(k * 7.7 + 1) * 512);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile(`tex/grain${idx}.png`)})`,
          backgroundPosition: `${ox}px ${oy}px`,
          mixBlendMode: 'overlay',
          opacity: grain,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(12,6,24,${vignette}) 100%)`,
        }}
      />
      <AbsoluteFill style={{background: '#2a2140', mixBlendMode: 'screen', opacity: lift}} />
    </AbsoluteFill>
  );
};

// 紙の斑（ごく薄く、絵に手触りを足す）
export const Paper: React.FC<{opacity?: number}> = ({opacity = 0.08}) => (
  <AbsoluteFill style={{mixBlendMode: 'soft-light', opacity, pointerEvents: 'none'}}>
    <Img src={staticFile('tex/paper.png')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
  </AbsoluteFill>
);

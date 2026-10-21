// 制作ラインの動作確認（本編ではない）。声・効果音・BGM・字幕・フォントが通るかだけを見る。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import '../fonts';
import {F} from '../fonts';
import script from '../../episodes/check00/script.json';
import timeline from '../../episodes/check00/timeline.json';
import {H, W, life, makeT, pop} from '../lib';

export const timelineCheck00 = timeline;
const T = makeT(timeline);

export const Check00: React.FC = () => {
  const frame = useCurrentFrame();
  const title = pop(frame, T.s('intro', -0.15));
  const current = script.lines.find((l, i) => {
    const next = script.lines[i + 1];
    return frame >= T.s(l.id, -0.04) && (!next || frame < T.s(next.id, -0.04));
  });
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg, #14122b 0%, #2a1850 55%, #12101f 100%)'}}>
      <div
        style={{
          position: 'absolute',
          top: H * 0.3,
          width: W,
          textAlign: 'center',
          fontFamily: F.dela,
          fontSize: 120,
          color: '#ffd84a',
          transform: `scale(${title})`,
          textShadow: '0 0 30px rgba(255,200,60,0.6)',
        }}
      >
        動作確認
      </div>
      {current && (
        <div
          style={{
            position: 'absolute',
            top: H * 0.62,
            left: 60,
            width: W - 120,
            textAlign: 'center',
            fontFamily: F.maru,
            fontWeight: 900,
            fontSize: 58,
            lineHeight: 1.35,
            color: '#fff',
            opacity: life(frame, T.s(current.id, -0.04), T.total, 3, 3),
          }}
        >
          {current.text}
        </div>
      )}
    </AbsoluteFill>
  );
};

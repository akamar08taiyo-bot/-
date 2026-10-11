import React from 'react';
import {AbsoluteFill, Composition, Sequence, useCurrentFrame} from 'remotion';
import {ensureFonts} from './fx/Fonts';
import {FilmLook} from './fx/Film';
import {VShot} from './VShot';
import {FPS, H, SHOTS, TOTAL_FRAMES, W, XFADE} from './timeline';
import {clamp} from './lib/math';

ensureFonts();

const XF = Math.round(XFADE * FPS);

const Fade: React.FC<{children: React.ReactNode; first: boolean; last: boolean; durFrames: number}> = ({children, first, last, durFrames}) => {
  const f = useCurrentFrame();
  const a = first ? clamp(f / (FPS * 2.5)) : clamp(f / XF);
  const out = last ? clamp((durFrames - f) / (FPS * 2.5)) : 1;
  return <AbsoluteFill style={{opacity: a * out}}>{children}</AbsoluteFill>;
};

// 本番の書き出しでは filmLook=false にして、粒子・周辺減光は ffmpeg でかける（scripts/finish.sh）。
// ブラウザで全画面の合成をすると、ソフトウェア描画では書き出しが数倍遅くなるため
export const Main: React.FC<{filmLook?: boolean}> = ({filmLook = true}) => (
  <AbsoluteFill style={{background: '#000'}}>
    {SHOTS.map((s, i) => (
      <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durFrames} name={s.id}>
        <Fade first={i === 0} last={i === SHOTS.length - 1} durFrames={s.durFrames}>
          <VShot id={s.id} />
        </Fade>
      </Sequence>
    ))}
    {filmLook ? <FilmLook grain={0.1} vignette={0.32} lift={0.04} /> : null}
  </AbsoluteFill>
);

const Single: React.FC<{id: string}> = ({id}) => (
  <AbsoluteFill style={{background: '#000'}}>
    <VShot id={id} />
    <FilmLook grain={0.1} vignette={0.32} lift={0.04} />
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Main" component={Main} defaultProps={{filmLook: true}} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
    {SHOTS.map((s) => (
      <Composition key={s.id} id={s.id} component={Single} defaultProps={{id: s.id}} durationInFrames={s.durFrames} fps={FPS} width={W} height={H} />
    ))}
  </>
);

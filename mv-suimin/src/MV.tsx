import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import './lib/fonts';
import timing from './data/timing.json';
import { Lyrics } from './components/Lyrics';
import { Background, HUD, Intro, MotifLayer, Outro, Overlays, Punch } from './components/Stage';

export type MVProps = { withAudio: boolean };

export const MV: React.FC<MVProps> = ({ withAudio }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {withAudio ? <Audio src={staticFile(timing.audio)} /> : null}
      <Background t={t} frame={frame} />
      <MotifLayer t={t} />
      <Lyrics t={t} />
      <Intro t={t} />
      <Punch t={t} />
      <HUD t={t} />
      <Overlays t={t} />
      <Outro t={t} />
    </AbsoluteFill>
  );
};

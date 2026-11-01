import React from 'react';
import { Composition } from 'remotion';
import timing from './data/timing.json';
import { MV } from './MV';

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MV"
      component={MV}
      durationInFrames={Math.ceil(timing.duration * FPS)}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ withAudio: true }}
    />
  );
};

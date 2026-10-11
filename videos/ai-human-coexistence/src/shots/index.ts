import React from 'react';
import {ShotProps} from '../Stage';
import {P0} from './P0';
import {S01} from './S01';

export const SHOT_COMPONENTS: Record<string, React.FC<ShotProps>> = {
  P0,
  S01,
};

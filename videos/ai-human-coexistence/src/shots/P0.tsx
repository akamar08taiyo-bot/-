import React from 'react';
import {Camera, ShotProps} from '../Stage';
import {clamp, easeInOut} from '../lib/math';
import {Haze, Sky, Stars, StreakBank} from '../parts/Sky';
import {Reflection, Sea, SeaGlints} from '../parts/Sea';
import {CityPalette, HillTown, HILL_DAY, IslandCity} from '../parts/City';
import {FarLight} from '../parts/Props';

const HZ = 690;
const PAL: CityPalette = {
  walls: [],
  tint: '#161b38',
  tintAmt: 0.9,
  window: '#1b2140',
  lit: '#ffc978',
  seawall: '#2a2c48',
  rock: '#2a2a44',
  green: '#22304a',
};
const HILL = {...HILL_DAY, tint: '#141832', tintAmt: 0.9, lit: '#ffc978'};

// 序：夜明け前の海と島影
export const P0: React.FC<ShotProps> = ({t, dur}) => {
  const k = easeInOut(t / dur);
  const fadeIn = clamp(t / 2.5);
  const city = (detail: number) => (
    <g>
      <HillTown t={t} x={1240} y={HZ} W={1000} H={250} s={0.75} seed={8} p={HILL} lit={detail ? 0.05 : 0} steam={false} detail={detail} />
      <IslandCity t={t} x={170} y={HZ + 2} s={0.6} seed={42} p={PAL} lit={detail ? 0.1 : 0} detail={detail} beam={detail ? 1 : 0} />
    </g>
  );
  const carU = clamp((t - 8.5) / 7);
  const seaProps = {t, horizon: HZ, top: '#4a3d66', deep: '#0a0d22', glint: '#c99fb6', glintOpacity: 0.3, count: 380};
  return (
    <g opacity={fadeIn}>
      <Camera zoom={1 + 0.07 * k} cy={620}>
        <Sky stops={[[0, '#070b1f'], [0.4, '#141a3c'], [0.68, '#2c2c58'], [0.85, '#5a466e'], [0.96, '#8a5f78'], [1, '#a2717c']]} h={HZ + 2} />
        <Stars t={t} count={220} maxY={560} opacity={1 - 0.6 * k} />
        <StreakBank seed={3} y={560} spread={70} count={10} color="#6b4c6e" t={t} opacity={0.5} />
        <StreakBank seed={4} y={640} spread={30} count={8} color="#a0697a" t={t} opacity={0.45} />
        <Haze y={HZ - 10} h={90} color="#8a5f78" opacity={0.45} />
        {carU > 0 && carU < 1 ? <FarLight x={1650 - 1300 * carU} y={430 + Math.sin(carU * 3) * 8} t={t} dir={-1} /> : null}
        {carU > 0.2 && carU < 1 ? <FarLight x={1750 - (1300 * (carU - 0.2)) / 0.8} y={470} t={t} dir={-1} c="#ffd7a8" r={1.8} /> : null}
        {city(1)}
        <Sea {...seaProps} glints={false} />
        <Reflection horizon={HZ} t={t} opacity={0.32} blur={4}>
          {city(0)}
        </Reflection>
        <SeaGlints {...seaProps} />
      </Camera>
    </g>
  );
};

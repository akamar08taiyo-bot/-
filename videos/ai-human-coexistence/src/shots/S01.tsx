import React from 'react';
import {Camera, ShotProps} from '../Stage';
import {clamp, easeInOut, lerp} from '../lib/math';
import {Glow, Haze, Sky, StreakBank} from '../parts/Sky';
import {Foam, Reflection, Sea, SeaGlints} from '../parts/Sea';
import {CityPalette, HillTown, HILL_DAY, IslandCity} from '../parts/City';
import {AirCar, Boat, Wake} from '../parts/Vehicles';
import {GullFlight} from '../parts/Props';

const HZ = 700;
const PAL: CityPalette = {
  walls: [],
  tint: '#33284a',
  tintAmt: 0.84,
  window: '#2a2440',
  lit: '#ffcf7a',
  rim: '#ffd9a6',
  seawall: '#4a3c58',
  rock: '#3e3250',
  green: '#34405a',
};
const HILL = {...HILL_DAY, tint: '#8d6c8a', tintAmt: 0.8, lit: '#ffcf7a', rim: '#ffd6a0'};

// 一 夜明け：朝日を背にした海上都市
export const S01: React.FC<ShotProps> = ({t, dur}) => {
  const k = easeInOut(t / dur);
  const sunY = lerp(676, 610, k);
  const sunX = 1330;
  const city = (detail: number) => (
    <g>
      <HillTown t={t} x={1560} y={HZ} W={900} H={210} s={0.8} seed={9} p={HILL} lit={detail ? 0.04 : 0} steam={false} detail={detail} />
      <IslandCity t={t} x={40} y={HZ + 16} s={0.86} seed={42} p={PAL} lit={detail ? 0.06 : 0} detail={detail ? 2 : 0} beam={detail ? 0.35 * (1 - k) : 0} rimSide={1} />
    </g>
  );
  const boatU = clamp((t - 1.5) / 17);
  const boatX = lerp(-140, 2050, boatU);
  const carU = clamp((t - 6) / 8);
  const seaProps = {t, horizon: HZ, top: '#f2b494', deep: '#2f3360', glint: '#ffe6c0', sunX, sunSpread: 46, sunPower: 0.95, glintOpacity: 0.4, count: 420, bands: '#ffd4b0'};
  return (
    <Camera x={-70 * k} zoom={1.04 + 0.03 * k}>
      <Sky stops={[[0, '#2c3a68'], [0.32, '#6a5f88'], [0.58, '#c38494'], [0.78, '#f0ac8a'], [0.92, '#ffd59c'], [1, '#ffe6bd']]} h={HZ + 2} />
      <Glow x={sunX} y={sunY} r={680} color="#ffc98f" opacity={0.9} />
      <Glow x={sunX} y={sunY} r={190} color="#fff0c8" opacity={0.95} core="#fff6e2" coreR={34} />
      <StreakBank seed={21} y={300} spread={90} count={12} color="#f7b7a6" t={t} opacity={0.55} drift={6} />
      <StreakBank seed={22} y={520} spread={60} count={12} color="#ffd0a8" t={t} opacity={0.6} drift={5} />
      <Haze y={HZ - 20} h={140} color="#ffcfa0" opacity={0.5} />
      <GullFlight t={t} t0={1} t1={14} x0={1500} x1={300} y={280} s={0.9} seed={3} n={3} c="#3a2f48" tip="#3a2f48" />
      {carU > 0 && carU < 1 ? <AirCar x={lerp(2000, -150, carU)} y={410} s={0.35} dir={-1} t={t} body="#5a4a6a" lower="#7a4a5a" tint="#5a4568" tintAmt={0.6} night={0.6} /> : null}
      {city(1)}
      <Sea {...seaProps} glints={false} />
      <Reflection horizon={HZ} t={t} opacity={0.42} blur={5}>
        {city(0)}
      </Reflection>
      <SeaGlints {...seaProps} />
      <Foam t={t} x={40} y={HZ + 18} w={1205} seed={4} color="#ffe2c4" amp={3} opacity={0.55} />
      <Haze y={HZ + 6} h={30} color="#ffcfa8" opacity={0.3} />
      <Wake x={boatX - 60} y={892} len={260} t={t} />
      <Boat x={boatX} y={880} s={1.15} t={t} hull="#3b3048" cabin="#4a3d56" light={0.9} tint="#3a2f48" tintAmt={0.35} />
      <GullFlight t={t} t0={8} t1={19} x0={-100} x1={1400} y={180} s={1.4} seed={9} n={2} c="#2f2840" tip="#2f2840" />
    </Camera>
  );
};

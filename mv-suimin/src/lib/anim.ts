// Pure, frame-driven animation helpers (no CSS transitions, no randomness).
import timing from '../data/timing.json';

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
export const eo = (x: number) => 1 - Math.pow(1 - clamp01(x), 3); // ease-out cubic
export const eio = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
export const eback = (x: number, s = 1.70158) => {
  const v = clamp01(x) - 1;
  return v * v * ((s + 1) * v + s) + 1;
};
export const eexpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(x)));

/** progress 0..1 of an animation that starts at `a` and lasts `d` seconds */
export const prog = (t: number, a: number, d: number, e: (x: number) => number = eo) => e(clamp01((t - a) / d));

/** deterministic pseudo-random in [0,1) */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

type Hit = [number, number];
const strong = (hits: Hit[], min: number) => hits.filter((h) => h[1] >= min);
const KICKS = strong(timing.kicks as Hit[], 0.55);
const SNARES = strong(timing.snares as Hit[], 0.6);

function lastIndex(hits: Hit[], t: number) {
  let lo = 0;
  let hi = hits.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (hits[m][0] <= t) {
      ans = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return ans;
}

function pulseOf(hits: Hit[], t: number, decay: number) {
  const i = lastIndex(hits, t);
  let v = 0;
  for (let k = i; k >= 0 && k > i - 3; k--) {
    const dt = t - hits[k][0];
    v = Math.max(v, hits[k][1] * Math.exp(-dt / decay));
  }
  return v;
}

export const kickPulse = (t: number, decay = 0.11) => (t > timing.cut ? 0 : pulseOf(KICKS, t, decay));
export const snarePulse = (t: number, decay = 0.09) => (t > timing.cut ? 0 : pulseOf(SNARES, t, decay));

/** beat phase: 0 at each beat, rising to 1 just before the next */
export const beatPhase = (t: number) => {
  const x = (t - timing.beat0) / timing.beatT;
  return x - Math.floor(x);
};
export const beatIndex = (t: number) => Math.floor((t - timing.beat0) / timing.beatT);

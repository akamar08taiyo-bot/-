// 決定的な乱数・補間・色の小道具（Math.random は使わない）

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t: number) => Math.pow(clamp(t), 3);

// t0〜t1 の窓で 0→1→0（フェードイン/アウト付き）
export const fadeWindow = (t: number, t0: number, t1: number, fin = 0.8, fout = 0.8) =>
  clamp((t - t0) / fin) * clamp((t1 - t) / fout);

export const mulberry32 = (seed: number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type Rng = {
  next: () => number;
  range: (a: number, b: number) => number;
  int: (a: number, b: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
};

export const rng = (seed: number): Rng => {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
  };
};

export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

// なめらかな 1 次元ノイズ（0..1）
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.31), hash(i + 1 + seed * 57.31), u);
};

// -1..1 のゆらぎ
export const wobble = (t: number, speed = 1, seed = 0) => noise1(t * speed, seed) * 2 - 1;

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const toHex = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

export const mix = (c1: string, c2: string, t: number) => {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const k = clamp(t);
  return `#${toHex(lerp(a[0], b[0], k))}${toHex(lerp(a[1], b[1], k))}${toHex(lerp(a[2], b[2], k))}`;
};

export const shade = (c: string, amt: number) => (amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt));

export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(a)})`;
};

// 複数の色停止点から t の色
export const ramp = (stops: [number, string][], t: number) => {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return stops[stops.length - 1][1];
};

// 2点間の垂れ下がる電線（カテナリー近似）
export const sagPath = (x1: number, y1: number, x2: number, y2: number, sag: number) => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + sag;
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
};

// 周期 period のなかでの位相 0..1
export const phase = (t: number, period: number, offset = 0) => {
  const p = (t + offset) / period;
  return p - Math.floor(p);
};

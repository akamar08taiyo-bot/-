/**
 * 架空のデモデータ生成器（動作確認・検証用）。実在店舗の実データではない。
 *
 * 分析が「仕込んだ傾向」を正しく見つけられるかを確かめるため、次の癖をわざと入れてある。
 * - 日付末尾6の日は末尾6の台に高設定が入りやすい
 * - 機種「デモ機A」は普段から設定が甘い
 * - 前日に大きく凹んだ台は翌日少しだけ上がりやすい
 * 乱数は固定シードなので、何度作っても同じデータになる。
 */
import type {SlotRow} from './types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// 設定1〜6の機械割（おおよその一般的な値）
const PAYOUT_BY_SETTING = [0, 0.97, 0.985, 1.0, 1.04, 1.08, 1.12];

const LINEUP: {machine: string; count: number; bias: number}[] = [
  {machine: 'デモ機A', count: 8, bias: 0.25},
  {machine: 'デモ機B', count: 10, bias: 0},
  {machine: 'デモ機C', count: 6, bias: -0.1},
  {machine: 'デモ機D', count: 12, bias: 0.05},
  {machine: 'デモ機E', count: 4, bias: 0},
];

export const DEMO_STORE = 'デモ店舗（架空）';

export function generateDemo(year = 2026, month = 9, days = 30, seed = 666): SlotRow[] {
  const r = rng(seed);
  const units: {unit: number; machine: string; bias: number}[] = [];
  let no = 1;
  for (const l of LINEUP) for (let i = 0; i < l.count; i++) units.push({unit: no++, machine: l.machine, bias: l.bias});

  const rows: SlotRow[] = [];
  const prevDiff = new Map<number, number>();
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isEvent = d % 10 === 6;
    for (const u of units) {
      let hiProb = 0.12 + u.bias;
      if (isEvent && u.unit % 10 === 6) hiProb += 0.55;
      if ((prevDiff.get(u.unit) ?? 0) <= -2000) hiProb += 0.08;
      const setting = r() < Math.max(0, Math.min(0.95, hiProb)) ? 4 + Math.floor(r() * 3) : 1 + Math.floor(r() * 3);
      const games = Math.round(Math.max(300, Math.min(9000, 3500 + (setting - 3) * 500 + gaussian(r) * 1800)));
      const inMedals = games * 3;
      // 機械割に試行回数相応のブレを乗せる
      const noise = gaussian(r) * 1.6 * Math.sqrt(inMedals) * 3;
      const diff = Math.round(inMedals * (PAYOUT_BY_SETTING[setting] - 1) + noise);
      const bb = Math.max(0, Math.round((games / (setting >= 4 ? 260 : 300)) * (1 + gaussian(r) * 0.2)));
      const rb = Math.max(0, Math.round((games / (setting >= 4 ? 300 : 420)) * (1 + gaussian(r) * 0.25)));
      rows.push({date, store: DEMO_STORE, machine: u.machine, unit: u.unit, games, diff, bb, rb});
      prevDiff.set(u.unit, diff);
    }
  }
  return rows;
}

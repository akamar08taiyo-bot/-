import type {BodyLog} from '../types';

export interface WeightTrend {
  avg: number | null;
  diff: number | null; // 断定表現を使わず数値のみ返す（前週比）
}

// Ports the 10-4 pseudocode. bodyLogs must be sorted ascending by date.
// Compares the trailing 7-day average against the 7 days before that,
// rather than single-day deltas, so day-to-day noise doesn't drive the message (section 6-1).
export function weeklyWeightTrend(bodyLogs: BodyLog[]): WeightTrend {
  const withWeight = bodyLogs.filter(
    (d): d is BodyLog & {weight: number} => d.weight != null,
  );
  const last7 = withWeight.slice(-7);
  const prev7 = withWeight.slice(-14, -7);

  if (last7.length === 0) return {avg: null, diff: null};

  const avg = last7.reduce((sum, d) => sum + d.weight, 0) / last7.length;
  if (prev7.length === 0) return {avg, diff: null};

  const prevAvg = prev7.reduce((sum, d) => sum + d.weight, 0) / prev7.length;
  return {avg, diff: avg - prevAvg};
}

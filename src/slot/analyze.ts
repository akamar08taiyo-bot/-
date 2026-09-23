/**
 * 差枚データの分析ロジック。UI から独立しているので Node からも検証できる。
 *
 * 用語
 * - 差枚: その台の1日の収支（枚）。プラスは客の勝ち、店トータルのプラスは店の出玉放出
 * - 勝率: 差枚 > 0 の台の割合
 * - 出率(機械割): (IN + 差枚) / IN。IN は 総ゲーム数 × 3枚 で近似する
 */
import {correlation, mean, median, shrink, sum, wilsonLower} from './stats';
import type {SlotRow} from './types';

/** 1ゲームあたりの投入枚数（ほぼ全機種3枚掛け） */
export const MEDALS_PER_GAME = 3;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ---------------------------------------------------------------- 日付の属性

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayLabel(date: string): string {
  return WEEKDAYS[weekdayOf(date)];
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/** 11日・22日、または月と日が同じ（9/9など）日 */
export function isZorome(date: string): boolean {
  const m = Number(date.slice(5, 7));
  const d = dayOfMonth(date);
  return d === 11 || d === 22 || m === d;
}

export function tailOf(unit: number): number {
  return unit % 10;
}

// ---------------------------------------------------------------- 基本集計

export interface Summary {
  count: number;
  totalDiff: number;
  avgDiff: number;
  medianDiff: number;
  wins: number;
  winRate: number;
  /** 勝率の95%下限（少数サンプルの過大評価を防ぐ） */
  winRateLower: number;
  totalGames: number;
  avgGames: number | null;
  /** 出率。ゲーム数がない場合は null */
  payout: number | null;
  best: SlotRow | null;
  worst: SlotRow | null;
}

export function summarize(rows: SlotRow[]): Summary {
  const diffs = rows.map((r) => r.diff);
  const wins = rows.filter((r) => r.diff > 0).length;
  const withGames = rows.filter((r) => r.games != null && r.games > 0);
  const totalGames = sum(withGames.map((r) => r.games!));
  const inMedals = totalGames * MEDALS_PER_GAME;
  const diffWithGames = sum(withGames.map((r) => r.diff));
  let best: SlotRow | null = null;
  let worst: SlotRow | null = null;
  for (const r of rows) {
    if (!best || r.diff > best.diff) best = r;
    if (!worst || r.diff < worst.diff) worst = r;
  }
  return {
    count: rows.length,
    totalDiff: sum(diffs),
    avgDiff: mean(diffs),
    medianDiff: median(diffs),
    wins,
    winRate: rows.length ? wins / rows.length : 0,
    winRateLower: wilsonLower(wins, rows.length),
    totalGames,
    avgGames: withGames.length ? totalGames / withGames.length : null,
    payout: inMedals > 0 ? (inMedals + diffWithGames) / inMedals : null,
    best,
    worst,
  };
}

/** 1台の出率（ゲーム数がなければ null） */
export function unitPayout(r: SlotRow): number | null {
  if (r.games == null || r.games <= 0) return null;
  const inMedals = r.games * MEDALS_PER_GAME;
  return (inMedals + r.diff) / inMedals;
}

export interface GroupSummary extends Summary {
  key: string;
  /** 経験ベイズで店平均へ寄せた平均差枚（少数サンプルのブレを抑えた「実力値」） */
  adjAvgDiff: number;
  /** 同じく店の勝率へ寄せた勝率 */
  adjWinRate: number;
  /** 高設定推測台の数 */
  hotCount: number;
  /** 何日分のデータを含むか */
  days: number;
}

export interface HotRule {
  /** 高設定とみなす最低ゲーム数 */
  minGames: number;
  /** 高設定とみなす出率（1.05 = 105%） */
  minPayout: number;
}

export const DEFAULT_HOT_RULE: HotRule = {minGames: 3000, minPayout: 1.05};

/**
 * 「高設定だった可能性が高い台」の簡易判定。
 * 機種ごとの設定差を見ない粗い目安なので、台数の比較（どの日・どの機種に多いか）に使う。
 */
export function isHot(r: SlotRow, rule: HotRule = DEFAULT_HOT_RULE): boolean {
  const p = unitPayout(r);
  return p != null && r.games! >= rule.minGames && p >= rule.minPayout;
}

/** 縮小推定の強さ（店平均を何台日分のデータとみなすか） */
export const SHRINK_K = 8;

export function groupBy(
  rows: SlotRow[],
  keyOf: (r: SlotRow) => string,
  opts: {hotRule?: HotRule; k?: number} = {},
): GroupSummary[] {
  const k = opts.k ?? SHRINK_K;
  const all = summarize(rows);
  const groups = new Map<string, SlotRow[]>();
  for (const r of rows) {
    const key = keyOf(r);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()].map(([key, g]) => {
    const s = summarize(g);
    return {
      ...s,
      key,
      adjAvgDiff: shrink(s.totalDiff, s.count, all.avgDiff, k),
      adjWinRate: shrink(s.wins, s.count, all.winRate, k),
      hotCount: g.filter((r) => isHot(r, opts.hotRule)).length,
      days: new Set(g.map((r) => r.date)).size,
    };
  });
}

export const keys = {
  machine: (r: SlotRow) => r.machine,
  tail: (r: SlotRow) => `末尾${tailOf(r.unit)}`,
  unit: (r: SlotRow) => `${r.unit}`,
  date: (r: SlotRow) => r.date,
  month: (r: SlotRow) => r.date.slice(0, 7),
  weekday: (r: SlotRow) => `${weekdayOf(r.date)}${weekdayLabel(r.date)}曜`,
  dateTail: (r: SlotRow) => `日付末尾${dayOfMonth(r.date) % 10}`,
  zorome: (r: SlotRow) => (isZorome(r.date) ? 'ゾロ目の日' : '通常日'),
  /** 設置台数の規模（1〜2台 / 3〜5台 / 6台以上）。同じ日の同機種台数で分類 */
  machineSize: (rows: SlotRow[]) => {
    const size = new Map<string, number>();
    for (const r of rows) size.set(`${r.date}|${r.machine}`, (size.get(`${r.date}|${r.machine}`) ?? 0) + 1);
    return (r: SlotRow) => {
      const n = size.get(`${r.date}|${r.machine}`) ?? 0;
      return n <= 2 ? 'A: 1〜2台' : n <= 5 ? 'B: 3〜5台' : 'C: 6台以上';
    };
  },
};

// ---------------------------------------------------------------- 日の条件（特定日の絞り込み）

export type DayFilter =
  | {kind: 'all'}
  | {kind: 'weekday'; value: number}
  | {kind: 'dateTail'; value: number}
  | {kind: 'zorome'};

export function matchDay(date: string, f: DayFilter): boolean {
  switch (f.kind) {
    case 'all':
      return true;
    case 'weekday':
      return weekdayOf(date) === f.value;
    case 'dateTail':
      return dayOfMonth(date) % 10 === f.value;
    case 'zorome':
      return isZorome(date);
  }
}

export function describeFilter(f: DayFilter): string {
  switch (f.kind) {
    case 'all':
      return '全日';
    case 'weekday':
      return `${WEEKDAYS[f.value]}曜日`;
    case 'dateTail':
      return `日付末尾${f.value}の日`;
    case 'zorome':
      return 'ゾロ目の日';
  }
}

// ---------------------------------------------------------------- 日別レポート

export interface DayReport {
  date: string;
  summary: Summary;
  machines: GroupSummary[];
  tails: GroupSummary[];
  hotUnits: SlotRow[];
  top: SlotRow[];
  bottom: SlotRow[];
  /** 同一機種の全台が勝った機種（3台以上）＝全台系の疑い */
  allWinMachines: GroupSummary[];
  /** 連続した台番で3台以上プラスが続いた区間（並び・島系の疑い） */
  streaks: {from: number; to: number; units: SlotRow[]; total: number}[];
}

export function dayReport(rows: SlotRow[], date: string, hotRule?: HotRule): DayReport {
  const day = rows.filter((r) => r.date === date);
  const sorted = [...day].sort((a, b) => b.diff - a.diff);
  const machines = groupBy(day, keys.machine, {hotRule}).sort((a, b) => b.totalDiff - a.totalDiff);
  return {
    date,
    summary: summarize(day),
    machines,
    tails: groupBy(day, keys.tail, {hotRule}).sort((a, b) => a.key.localeCompare(b.key)),
    hotUnits: day.filter((r) => isHot(r, hotRule)).sort((a, b) => b.diff - a.diff),
    top: sorted.slice(0, 10),
    bottom: sorted.slice(-10).reverse(),
    allWinMachines: machines.filter((m) => m.count >= 3 && m.wins === m.count),
    streaks: findStreaks(day, 3),
  };
}

/** 台番が連続（差1）かつ全てプラスの区間を探す */
export function findStreaks(day: SlotRow[], minLen: number): DayReport['streaks'] {
  const sorted = [...day].sort((a, b) => a.unit - b.unit);
  const out: DayReport['streaks'] = [];
  let run: SlotRow[] = [];
  const flush = () => {
    if (run.length >= minLen) {
      out.push({from: run[0].unit, to: run[run.length - 1].unit, units: run, total: sum(run.map((r) => r.diff))});
    }
    run = [];
  };
  for (const r of sorted) {
    const prev = run[run.length - 1];
    if (r.diff > 0 && (!prev || r.unit === prev.unit + 1)) run.push(r);
    else {
      flush();
      if (r.diff > 0) run.push(r);
    }
  }
  flush();
  return out.sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------- 期間の傾向

export interface PeriodReport {
  dates: string[];
  summary: Summary;
  byDate: GroupSummary[];
  machines: GroupSummary[];
  tails: GroupSummary[];
  weekdays: GroupSummary[];
  dateTails: GroupSummary[];
  zorome: GroupSummary[];
  machineSize: GroupSummary[];
  units: (GroupSummary & {machine: string})[];
}

export function periodReport(rows: SlotRow[], hotRule?: HotRule): PeriodReport {
  const opts = {hotRule};
  const lastMachine = new Map<string, string>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) lastMachine.set(`${r.unit}`, r.machine);
  return {
    dates: [...new Set(rows.map((r) => r.date))].sort(),
    summary: summarize(rows),
    byDate: groupBy(rows, keys.date, opts).sort((a, b) => a.key.localeCompare(b.key)),
    machines: groupBy(rows, keys.machine, opts).sort((a, b) => b.adjWinRate - a.adjWinRate),
    tails: groupBy(rows, keys.tail, opts).sort((a, b) => a.key.localeCompare(b.key)),
    weekdays: groupBy(rows, keys.weekday, opts).sort((a, b) => a.key.localeCompare(b.key)),
    dateTails: groupBy(rows, keys.dateTail, opts).sort((a, b) => a.key.localeCompare(b.key)),
    zorome: groupBy(rows, keys.zorome, opts),
    machineSize: groupBy(rows, keys.machineSize(rows), opts).sort((a, b) => a.key.localeCompare(b.key)),
    units: groupBy(rows, keys.unit, opts)
      .map((g) => ({...g, machine: lastMachine.get(g.key) ?? ''}))
      .sort((a, b) => b.adjAvgDiff - a.adjAvgDiff),
  };
}

// ---------------------------------------------------------------- 前日との関係（据え置き・上げ狙いの検証）

export interface PrevDayBucket {
  label: string;
  count: number;
  nextAvgDiff: number;
  nextWinRate: number;
}

const PREV_BUCKETS: {label: string; test: (d: number) => boolean}[] = [
  {label: '前日 −3000枚以下（大凹み）', test: (d) => d <= -3000},
  {label: '前日 −3000〜−1000枚', test: (d) => d > -3000 && d <= -1000},
  {label: '前日 ±1000枚以内', test: (d) => d > -1000 && d < 1000},
  {label: '前日 +1000〜+3000枚', test: (d) => d >= 1000 && d < 3000},
  {label: '前日 +3000枚以上（大勝ち）', test: (d) => d >= 3000},
];

/** データ上で連続する2日間に、同じ台番・同じ機種で存在した台のペア */
export function prevDayPairs(rows: SlotRow[]): {prev: SlotRow; next: SlotRow}[] {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const byDate = new Map<string, Map<number, SlotRow>>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    byDate.get(r.date)!.set(r.unit, r);
  }
  const pairs: {prev: SlotRow; next: SlotRow}[] = [];
  for (let i = 1; i < dates.length; i++) {
    if (!isNextDay(dates[i - 1], dates[i])) continue;
    const prevDay = byDate.get(dates[i - 1])!;
    for (const next of byDate.get(dates[i])!.values()) {
      const prev = prevDay.get(next.unit);
      if (prev && prev.machine === next.machine) pairs.push({prev, next});
    }
  }
  return pairs;
}

function isNextDay(a: string, b: string): boolean {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return t(b) - t(a) === 86400000;
}

export function prevDayAnalysis(rows: SlotRow[]): {buckets: PrevDayBucket[]; correlation: number; pairs: number} {
  const pairs = prevDayPairs(rows);
  return {
    pairs: pairs.length,
    correlation: correlation(
      pairs.map((p) => p.prev.diff),
      pairs.map((p) => p.next.diff),
    ),
    buckets: PREV_BUCKETS.map((b) => {
      const next = pairs.filter((p) => b.test(p.prev.diff)).map((p) => p.next);
      return {
        label: b.label,
        count: next.length,
        nextAvgDiff: mean(next.map((r) => r.diff)),
        nextWinRate: next.length ? next.filter((r) => r.diff > 0).length / next.length : 0,
      };
    }),
  };
}

/** 隣の台が勝っているとき／負けているときの勝率（並びで入る店かの検証） */
export function neighborAnalysis(rows: SlotRow[]): {
  whenNeighborWon: {n: number; winRate: number};
  whenNeighborLost: {n: number; winRate: number};
} {
  const byDate = new Map<string, Map<number, SlotRow>>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    byDate.get(r.date)!.set(r.unit, r);
  }
  let wonN = 0;
  let wonW = 0;
  let lostN = 0;
  let lostW = 0;
  for (const day of byDate.values()) {
    for (const r of day.values()) {
      const right = day.get(r.unit + 1);
      if (!right) continue;
      // 同じ機種の隣同士だけを見る（島の切れ目をまたがない）
      if (right.machine !== r.machine) continue;
      for (const [me, nb] of [
        [r, right],
        [right, r],
      ] as const) {
        if (nb.diff > 0) {
          wonN++;
          if (me.diff > 0) wonW++;
        } else {
          lostN++;
          if (me.diff > 0) lostW++;
        }
      }
    }
  }
  return {
    whenNeighborWon: {n: wonN, winRate: wonN ? wonW / wonN : 0},
    whenNeighborLost: {n: lostN, winRate: lostN ? lostW / lostN : 0},
  };
}

// ---------------------------------------------------------------- 狙い目（何を打てば勝ちやすいか）

export interface Pick {
  unit: number;
  machine: string;
  /** 推定の勝率（0〜1） */
  pWin: number;
  /** 推定の平均差枚 */
  expDiff: number;
  /** 根拠：その台の過去データ件数 */
  unitN: number;
  machineN: number;
  reasons: string[];
}

export interface RecommendOptions {
  filter: DayFilter;
  /** 条件に合う日がこれ未満なら全日のデータで推定する */
  minDays?: number;
  k?: number;
}

/**
 * 階層的な縮小推定で各台の「勝率」「期待差枚」を出す。
 *
 *   期待値 = 条件日の店平均
 *          + 機種の実力（全期間。店平均との差）
 *          + 条件日にその機種が特に強いか（例: 6の日に強い機種）
 *          + 条件日の末尾の強さ（例: 6の日の末尾6）
 *          + 台そのものの実力（全期間。機種平均との差）
 *
 * どの項も「データが少ないほど0へ寄せる」縮小推定なので、たまたま1日出ただけの台や機種を過大評価しない。
 * 機種・台の実力は件数の多い全期間で、日の条件による上乗せだけを条件日で推定する。
 * candidates は明日も設置されている想定の台（通常は最新日の台一覧）。
 */
export function recommend(history: SlotRow[], candidates: {unit: number; machine: string}[], opts: RecommendOptions): {
  picks: Pick[];
  machines: GroupSummary[];
  tails: GroupSummary[];
  basis: string;
  basisDays: number;
} {
  const k = opts.k ?? SHRINK_K;
  const minDays = opts.minDays ?? 2;
  const matched = history.filter((r) => matchDay(r.date, opts.filter));
  const matchedDays = new Set(matched.map((r) => r.date)).size;
  const useFilter = opts.filter.kind !== 'all' && matchedDays >= minDays;
  const cond = useFilter ? matched : history;

  const storeAll = summarize(history);
  const storeCond = summarize(cond);
  const machineAll = new Map(groupBy(history, keys.machine, {k}).map((g) => [g.key, g]));
  const machineCond = new Map(groupBy(cond, keys.machine, {k}).map((g) => [g.key, g]));
  const tailCond = new Map(groupBy(cond, keys.tail, {k}).map((g) => [g.key, g]));
  const unitRows = new Map<number, SlotRow[]>();
  for (const r of history) {
    if (!unitRows.has(r.unit)) unitRows.set(r.unit, []);
    unitRows.get(r.unit)!.push(r);
  }
  const condShiftDiff = storeCond.avgDiff - storeAll.avgDiff;
  const condShiftWin = storeCond.winRate - storeAll.winRate;

  const picks = candidates.map(({unit, machine}) => {
    const reasons: string[] = [];
    // 機種の実力（全期間）
    const ma = machineAll.get(machine);
    const mDiff = ma ? ma.adjAvgDiff - storeAll.avgDiff : 0;
    const mWin = ma ? ma.adjWinRate - storeAll.winRate : 0;
    const machineAvg = ma ? ma.avgDiff : storeAll.avgDiff;
    const machineWinRaw = ma ? ma.winRate : storeAll.winRate;
    if (ma && mWin > 0.04) reasons.push(`機種の勝率が高い（${pct(ma.winRate)}／${ma.count}台日）`);

    // 条件日にその機種が普段より強いか
    let mcDiff = 0;
    let mcWin = 0;
    const mc = useFilter ? machineCond.get(machine) : undefined;
    if (mc && ma) {
      const expectDiff = ma.avgDiff + condShiftDiff;
      const expectWin = clamp01(ma.winRate + condShiftWin);
      mcDiff = shrink(mc.totalDiff, mc.count, expectDiff, k) - expectDiff;
      mcWin = shrink(mc.wins, mc.count, expectWin, k) - expectWin;
      if (mcWin > 0.04) reasons.push(`${describeFilter(opts.filter)}にこの機種が強い（${pct(mc.winRate)}）`);
    }

    // 条件日の末尾
    const t = tailCond.get(`末尾${tailOf(unit)}`);
    const tDiff = t ? t.adjAvgDiff - storeCond.avgDiff : 0;
    const tWin = t ? t.adjWinRate - storeCond.winRate : 0;
    if (t && tWin > 0.04) reasons.push(`${useFilter ? describeFilter(opts.filter) + 'の' : ''}${t.key}が強い（${pct(t.winRate)}）`);

    // 台そのもの（同じ機種だった日だけ。入替前のデータは混ぜない）
    const own = (unitRows.get(unit) ?? []).filter((r) => r.machine === machine);
    const ownWins = own.filter((r) => r.diff > 0).length;
    const uDiff = own.length ? shrink(sum(own.map((r) => r.diff)), own.length, machineAvg, k) - machineAvg : 0;
    const uWin = own.length ? shrink(ownWins, own.length, machineWinRaw, k) - machineWinRaw : 0;
    if (uWin > 0.04) reasons.push(`この台自体の成績が良い（${ownWins}/${own.length}勝）`);

    return {
      unit,
      machine,
      pWin: Math.min(0.99, Math.max(0.01, storeCond.winRate + mWin + mcWin + tWin + uWin)),
      expDiff: storeCond.avgDiff + mDiff + mcDiff + tDiff + uDiff,
      unitN: own.length,
      machineN: ma?.count ?? 0,
      reasons,
    };
  });
  picks.sort((a, b) => b.pWin - a.pWin || b.expDiff - a.expDiff);

  return {
    picks,
    machines: [...(useFilter ? machineCond : machineAll).values()].sort((a, b) => b.adjWinRate - a.adjWinRate),
    tails: [...tailCond.values()].sort((a, b) => b.adjWinRate - a.adjWinRate),
    basis: useFilter ? describeFilter(opts.filter) : '全日',
    basisDays: useFilter ? matchedDays : new Set(history.map((r) => r.date)).size,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

// ---------------------------------------------------------------- 検証（バックテスト）

export interface BacktestDay {
  date: string;
  dayAvgDiff: number;
  dayWinRate: number;
  pickAvgDiff: number;
  pickWinRate: number;
  picks: {unit: number; machine: string; diff: number}[];
}

export interface BacktestResult {
  strategy: string;
  days: BacktestDay[];
  /** 狙い台の平均差枚（全日通算） */
  pickAvgDiff: number;
  pickWinRate: number;
  /** 同じ日に全台から無作為に選んだ場合の期待値（＝その日の店平均） */
  baselineAvgDiff: number;
  baselineWinRate: number;
  /** 店平均を上回った日の割合 */
  beatRate: number;
}

export type Strategy = 'model' | 'machine' | 'tail' | 'prevLoser' | 'prevWinner';

export const STRATEGY_LABELS: Record<Strategy, string> = {
  model: '総合モデル（機種×末尾×台）',
  machine: '機種の勝率だけで選ぶ',
  tail: '末尾の勝率だけで選ぶ',
  prevLoser: '前日に大きく凹んだ台',
  prevWinner: '前日に大きく勝った台（据え置き狙い）',
};

/**
 * ウォークフォワード検証：各日について「その日より前のデータだけ」で狙い台を選び、
 * 実際の結果と店平均を比べる。未来のデータを使わないので、実戦で同じことをした場合の成績に近い。
 * filterByDay を true にすると、予測する日と同じ条件（例: 日付末尾が同じ）の過去日で推定する。
 */
export function backtest(
  rows: SlotRow[],
  strategy: Strategy,
  opts: {picks?: number; minTrainDays?: number; filterBy?: 'none' | 'dateTail' | 'weekday'} = {},
): BacktestResult {
  const nPicks = opts.picks ?? 5;
  const minTrain = opts.minTrainDays ?? 3;
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const days: BacktestDay[] = [];
  for (let i = minTrain; i < dates.length; i++) {
    const date = dates[i];
    const train = rows.filter((r) => r.date < date);
    const today = rows.filter((r) => r.date === date);
    const candidates = today.map((r) => ({unit: r.unit, machine: r.machine}));
    const filter: DayFilter =
      opts.filterBy === 'dateTail'
        ? {kind: 'dateTail', value: dayOfMonth(date) % 10}
        : opts.filterBy === 'weekday'
          ? {kind: 'weekday', value: weekdayOf(date)}
          : {kind: 'all'};
    const chosen = choose(train, today, candidates, strategy, filter, nPicks, dates[i - 1]);
    const result = chosen.map((u) => today.find((r) => r.unit === u)!);
    const s = summarize(today);
    days.push({
      date,
      dayAvgDiff: s.avgDiff,
      dayWinRate: s.winRate,
      pickAvgDiff: mean(result.map((r) => r.diff)),
      pickWinRate: result.length ? result.filter((r) => r.diff > 0).length / result.length : 0,
      picks: result.map((r) => ({unit: r.unit, machine: r.machine, diff: r.diff})),
    });
  }
  const allPicks = days.flatMap((d) => d.picks);
  const counted = days.filter((d) => d.picks.length > 0);
  return {
    strategy: STRATEGY_LABELS[strategy],
    days,
    pickAvgDiff: mean(allPicks.map((p) => p.diff)),
    pickWinRate: allPicks.length ? allPicks.filter((p) => p.diff > 0).length / allPicks.length : 0,
    // 選んだ台数で重み付けした店平均（日ごとに選べた台数が違っても公平に比べる）
    baselineAvgDiff: allPicks.length ? sum(counted.map((d) => d.dayAvgDiff * d.picks.length)) / allPicks.length : 0,
    baselineWinRate: allPicks.length ? sum(counted.map((d) => d.dayWinRate * d.picks.length)) / allPicks.length : 0,
    beatRate: counted.length ? counted.filter((d) => d.pickAvgDiff > d.dayAvgDiff).length / counted.length : 0,
  };
}

function choose(
  train: SlotRow[],
  today: SlotRow[],
  candidates: {unit: number; machine: string}[],
  strategy: Strategy,
  filter: DayFilter,
  n: number,
  prevDate: string,
): number[] {
  if (strategy === 'model') {
    return recommend(train, candidates, {filter}).picks.slice(0, n).map((p) => p.unit);
  }
  if (strategy === 'machine' || strategy === 'tail') {
    const base = train.filter((r) => matchDay(r.date, filter));
    const src = new Set(base.map((r) => r.date)).size >= 2 ? base : train;
    const keyOf = strategy === 'machine' ? keys.machine : keys.tail;
    const score = new Map(groupBy(src, keyOf).map((g) => [g.key, g.adjWinRate]));
    return [...today]
      .sort((a, b) => (score.get(keyOf(b)) ?? 0) - (score.get(keyOf(a)) ?? 0) || a.unit - b.unit)
      .slice(0, n)
      .map((r) => r.unit);
  }
  // 前日データを使う戦略：前日の同じ台番・同じ機種の差枚で並べる
  if (!isNextDay(prevDate, today[0]?.date ?? '')) return [];
  const prev = new Map(train.filter((r) => r.date === prevDate).map((r) => [r.unit, r]));
  const withPrev = today.filter((r) => prev.get(r.unit)?.machine === r.machine);
  const sign = strategy === 'prevLoser' ? 1 : -1;
  return withPrev
    .sort((a, b) => sign * (prev.get(a.unit)!.diff - prev.get(b.unit)!.diff))
    .slice(0, n)
    .map((r) => r.unit);
}

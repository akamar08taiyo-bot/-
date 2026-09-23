/**
 * 分析結果を「発信・販売できる形」に変換する。
 *
 * - 日別まとめ（X用の短文 / note等の長文）
 * - 狙い台の予想と、その答え合わせ（実績）
 * - 月間レポート記事（無料部分と有料部分に分けたMarkdown）
 *
 * 元データの全台一覧は載せず、集計値と上位数件だけを使う（出典サイトのデータをそのまま転載しないため）。
 * 文末には出典と「結果を保証しない」旨を必ず付ける。
 */
import {backtest, dayReport, periodReport, recommend, summarize, STRATEGY_LABELS} from './analyze';
import type {BacktestResult, DayFilter, Pick, Strategy} from './analyze';
import {pct, shortDate, signed} from './format';
import type {SlotRow} from './types';

export const DISCLAIMER = '※過去データの集計・推定であり、結果を保証するものではありません。遊技は節度を持って。';

export function sourceLine(source: string): string {
  return source ? `データ出典：${source}` : '';
}

// ---------------------------------------------------------------- X の文字数

/** X の文字数（全角=2、半角=1、URLは23）。上限は280 */
export function xLength(text: string): number {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, '');
  const urls = (text.match(/https?:\/\/\S+/g) ?? []).length;
  let n = urls * 23;
  for (const ch of withoutUrls) {
    const c = ch.codePointAt(0)!;
    // Latin・記号の一部は1、それ以外（日本語など）は2
    n += c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037) ? 1 : 2;
  }
  return n;
}

export const X_LIMIT = 280;

/** 行を上から足していき、X の上限に収まるところまでで切る（必須行は必ず残す） */
function fitX(head: string[], optional: string[], tail: string[]): string {
  const lines = [...head];
  for (const l of optional) {
    if (xLength([...lines, l, ...tail].join('\n')) > X_LIMIT) break;
    lines.push(l);
  }
  return [...lines, ...tail].join('\n');
}

// ---------------------------------------------------------------- 日別まとめ

export interface PostOptions {
  store: string;
  /** 出典の表記（例: "みんレポ"）。空なら出典行を省く */
  source: string;
  hashtags: string[];
}

export function dayPostX(rows: SlotRow[], date: string, opts: PostOptions): string {
  const rep = dayReport(rows, date);
  const s = rep.summary;
  const head = [
    `【${shortDate(date)} ${opts.store}】`,
    `店トータル ${signed(s.totalDiff)}枚（${s.count}台・平均${signed(s.avgDiff)}）`,
    `勝率 ${pct(s.winRate, 0)}${s.payout != null ? `／出率 ${pct(s.payout)}` : ''}`,
  ];
  const optional: string[] = [];
  const topMachines = rep.machines.filter((m) => m.totalDiff > 0).slice(0, 3);
  if (topMachines.length) {
    optional.push('', '▼強かった機種');
    topMachines.forEach((m) => optional.push(`・${m.key} ${signed(m.avgDiff)}/台（${m.wins}/${m.count}勝）`));
  }
  const tails = [...rep.tails].sort((a, b) => b.avgDiff - a.avgDiff).slice(0, 2);
  if (tails.length) optional.push('', `▼強い末尾 ${tails.map((t) => `${t.key.replace('末尾', '')}(${signed(t.avgDiff)})`).join(' ')}`);
  if (rep.allWinMachines.length) optional.push(`▼全台系？ ${rep.allWinMachines.map((m) => m.key).join('、')}`);
  const tail = opts.hashtags.length ? ['', opts.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')] : [];
  return fitX(head, optional, tail);
}

export function dayPostLong(rows: SlotRow[], date: string, opts: PostOptions): string {
  const rep = dayReport(rows, date);
  const s = rep.summary;
  const lines = [
    `# ${shortDate(date)} ${opts.store} データまとめ`,
    '',
    `- 店トータル：**${signed(s.totalDiff)}枚**（${s.count}台）`,
    `- 1台平均：${signed(s.avgDiff)}枚`,
    `- 勝率：${pct(s.winRate)}（${s.wins}/${s.count}台）`,
  ];
  if (s.payout != null) lines.push(`- 出率（推定）：${pct(s.payout)}／平均${Math.round(s.avgGames ?? 0).toLocaleString('ja-JP')}G`);
  lines.push(`- 高設定推測台：${rep.hotUnits.length}台`, '', '## 機種別（総差枚順）', '', '| 機種 | 台数 | 平均差枚 | 勝率 |', '| --- | ---: | ---: | ---: |');
  for (const m of rep.machines) lines.push(`| ${m.key} | ${m.count} | ${signed(m.avgDiff)} | ${m.wins}/${m.count} |`);
  lines.push('', '## 末尾別', '', '| 末尾 | 平均差枚 | 勝率 |', '| --- | ---: | ---: |');
  for (const t of rep.tails) lines.push(`| ${t.key.replace('末尾', '')} | ${signed(t.avgDiff)} | ${t.wins}/${t.count} |`);
  if (rep.allWinMachines.length || rep.streaks.length) {
    lines.push('', '## 気になるポイント', '');
    for (const m of rep.allWinMachines) lines.push(`- ${m.key}：${m.count}台すべてプラス（全台系の可能性）`);
    for (const st of rep.streaks.slice(0, 3)) lines.push(`- ${st.from}〜${st.to}番：${st.units.length}台連続プラス（計${signed(st.total)}枚）`);
  }
  lines.push('', '---', sourceLine(opts.source), DISCLAIMER);
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

// ---------------------------------------------------------------- 予想と答え合わせ

export interface Prediction {
  id: string;
  store: string;
  /** 予想した対象日 */
  targetDate: string;
  /** 予想を作った日時（ISO） */
  createdAt: string;
  /** 参考にした過去日（例: 日付末尾6の日） */
  basis: string;
  picks: {unit: number; machine: string; pWin: number; expDiff: number}[];
}

export function makePrediction(store: string, targetDate: string, basis: string, picks: Pick[], n: number, now = new Date()): Prediction {
  return {
    id: `${store}|${targetDate}`,
    store,
    targetDate,
    createdAt: now.toISOString(),
    basis,
    picks: picks.slice(0, n).map((p) => ({unit: p.unit, machine: p.machine, pWin: p.pWin, expDiff: p.expDiff})),
  };
}

export interface PredictionResult {
  prediction: Prediction;
  /** 対象日のデータがまだない場合は null */
  result: null | {
    /** 予想した台の実際の差枚（台が無くなっていた場合は null） */
    picks: {unit: number; machine: string; diff: number | null}[];
    hits: number;
    evaluated: number;
    pickAvgDiff: number;
    storeAvgDiff: number;
    storeWinRate: number;
  };
}

export function evaluatePrediction(p: Prediction, rows: SlotRow[]): PredictionResult {
  const day = rows.filter((r) => r.store === p.store && r.date === p.targetDate);
  if (!day.length) return {prediction: p, result: null};
  const byUnit = new Map(day.map((r) => [r.unit, r]));
  const picks = p.picks.map((pk) => {
    const r = byUnit.get(pk.unit);
    // 機種が入れ替わっていたら、予想した台とは別物なので評価しない
    return {unit: pk.unit, machine: pk.machine, diff: r && r.machine === pk.machine ? r.diff : null};
  });
  const valid = picks.filter((x) => x.diff != null) as {unit: number; machine: string; diff: number}[];
  const s = summarize(day);
  return {
    prediction: p,
    result: {
      picks,
      hits: valid.filter((x) => x.diff > 0).length,
      evaluated: valid.length,
      pickAvgDiff: valid.length ? valid.reduce((a, x) => a + x.diff, 0) / valid.length : 0,
      storeAvgDiff: s.avgDiff,
      storeWinRate: s.winRate,
    },
  };
}

export interface TrackRecord {
  days: number;
  picks: number;
  hits: number;
  hitRate: number;
  pickAvgDiff: number;
  /** 同じ日の店平均（予想台数で重み付け） */
  storeAvgDiff: number;
  storeWinRate: number;
  /** 予想台の平均が店平均を上回った日数 */
  beatDays: number;
}

export function trackRecord(results: PredictionResult[]): TrackRecord {
  const done = results.filter((r) => r.result && r.result.evaluated > 0);
  let picks = 0;
  let hits = 0;
  let sumDiff = 0;
  let sumStore = 0;
  let sumStoreWin = 0;
  let beat = 0;
  for (const {result} of done) {
    const r = result!;
    picks += r.evaluated;
    hits += r.hits;
    sumDiff += r.pickAvgDiff * r.evaluated;
    sumStore += r.storeAvgDiff * r.evaluated;
    sumStoreWin += r.storeWinRate * r.evaluated;
    if (r.pickAvgDiff > r.storeAvgDiff) beat++;
  }
  return {
    days: done.length,
    picks,
    hits,
    hitRate: picks ? hits / picks : 0,
    pickAvgDiff: picks ? sumDiff / picks : 0,
    storeAvgDiff: picks ? sumStore / picks : 0,
    storeWinRate: picks ? sumStoreWin / picks : 0,
    beatDays: beat,
  };
}

export function predictionPostX(p: Prediction, opts: PostOptions, record?: TrackRecord): string {
  const head = [`【${shortDate(p.targetDate)} ${opts.store} 注目台】`, `参考：過去の${p.basis}`];
  const optional = p.picks.map((pk, i) => `${i + 1}. ${pk.unit}番 ${pk.machine}（推定勝率${pct(pk.pWin, 0)}）`);
  const tail: string[] = [];
  if (record && record.days > 0) tail.push('', `これまでの実績：${record.hits}/${record.picks}台プラス（${pct(record.hitRate, 0)}）`);
  if (opts.hashtags.length) tail.push('', opts.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
  return fitX(head, optional, tail);
}

export function resultPostX(r: PredictionResult, opts: PostOptions, record?: TrackRecord): string | null {
  if (!r.result) return null;
  const res = r.result;
  const head = [
    `【答え合わせ ${shortDate(r.prediction.targetDate)} ${opts.store}】`,
    `注目台 ${res.hits}/${res.evaluated}台プラス・平均${signed(res.pickAvgDiff)}枚`,
    `（店平均 ${signed(res.storeAvgDiff)}枚）`,
  ];
  const optional = res.picks.map((x) => `${x.unit}番 ${x.machine} ${x.diff == null ? '入替/データなし' : signed(x.diff)}`);
  const tail: string[] = [];
  if (record && record.days > 0) tail.push('', `通算 ${record.days}日：${record.hits}/${record.picks}台プラス（${pct(record.hitRate, 0)}）`);
  if (opts.hashtags.length) tail.push('', opts.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
  return fitX(head, optional, tail);
}

// ---------------------------------------------------------------- 月間レポート（有料記事の下書き）

/** 有料部分との区切り（note の有料ライン等、貼り付け先で差し替える目印） */
export const PAYWALL_MARK = '<!-- ここから有料 -->';

export function monthlyArticle(
  rows: SlotRow[],
  month: string,
  opts: PostOptions & {nextFilter?: DayFilter; record?: TrackRecord},
): string {
  const scoped = rows.filter((r) => r.date.startsWith(month));
  const rep = periodReport(scoped);
  const s = rep.summary;
  const [y, m] = month.split('-').map(Number);
  const title = `${y}年${m}月 ${opts.store} 月間データ分析`;
  const best = [...rep.byDate].sort((a, b) => b.totalDiff - a.totalDiff);
  const out: string[] = [
    `# ${title}`,
    '',
    `${rep.dates.length}日分・延べ${s.count.toLocaleString('ja-JP')}台のデータを集計した。`,
    '',
    '## 今月のまとめ（無料）',
    '',
    `- 月間の店トータル：**${signed(s.totalDiff)}枚**（1日平均 ${signed(s.totalDiff / Math.max(1, rep.dates.length))}枚）`,
    `- 月間の勝率：${pct(s.winRate)}`,
  ];
  if (s.payout != null) out.push(`- 月間の出率（推定）：${pct(s.payout)}`);
  if (best.length) {
    out.push(`- 一番出した日：${shortDate(best[0].key)}（${signed(best[0].totalDiff)}枚）`);
    out.push(`- 一番回収した日：${shortDate(best[best.length - 1].key)}（${signed(best[best.length - 1].totalDiff)}枚）`);
  }
  const topMachine = rep.machines[0];
  if (topMachine) out.push(`- 今月一番勝ちやすかった機種：**${topMachine.key}**（勝率${pct(topMachine.winRate, 0)}）`);
  out.push('', '日付の末尾・曜日ごとの傾向、機種ランキングの全体、来月の狙い目は以下で。', '', PAYWALL_MARK, '');

  out.push('## 機種ランキング（補正勝率順）', '', '台数が少ない機種は店平均に寄せて補正している（1〜2台の偶然の大勝ちで上位にならないように）。', '');
  out.push('| # | 機種 | 補正勝率 | 勝率 | 平均差枚 | 台日 |', '| ---: | --- | ---: | ---: | ---: | ---: |');
  rep.machines.slice(0, 15).forEach((g, i) => out.push(`| ${i + 1} | ${g.key} | ${pct(g.adjWinRate, 0)} | ${pct(g.winRate, 0)} | ${signed(g.avgDiff)} | ${g.count} |`));

  const strongest = <T extends {adjWinRate: number; key: string; avgDiff: number; winRate: number}>(xs: T[], n: number) =>
    [...xs].sort((a, b) => b.adjWinRate - a.adjWinRate).slice(0, n);
  out.push('', '## 日付末尾・曜日の傾向', '');
  out.push(`- 強い日付末尾：${strongest(rep.dateTails, 3).map((g) => `${g.key.replace('日付末尾', '')}の日（${pct(g.winRate, 0)}・${signed(g.avgDiff)}）`).join('、')}`);
  out.push(`- 強い曜日：${strongest(rep.weekdays, 2).map((g) => `${g.key.slice(1)}（${pct(g.winRate, 0)}・${signed(g.avgDiff)}）`).join('、')}`);
  out.push(`- 強い台番末尾：${strongest(rep.tails, 3).map((g) => `${g.key.replace('末尾', '')}（${pct(g.winRate, 0)}）`).join('、')}`);

  // 来月の狙い目：直近日の台一覧を候補に、全期間データで推定する
  const lastDate = rep.dates[rep.dates.length - 1];
  if (lastDate) {
    const candidates = rows.filter((r) => r.date === lastDate);
    const rec = recommend(rows.filter((r) => r.date <= lastDate), candidates, {filter: opts.nextFilter ?? {kind: 'all'}});
    out.push('', `## 狙い目の台（参考：${rec.basis}の過去データ）`, '', '| # | 台番 | 機種 | 推定勝率 | 根拠 |', '| ---: | ---: | --- | ---: | --- |');
    rec.picks.slice(0, 10).forEach((p, i) => out.push(`| ${i + 1} | ${p.unit} | ${p.machine} | ${pct(p.pWin, 0)} | ${p.reasons.join(' / ') || '−'} |`));
  }

  // 選び方の検証（この月までのデータで）
  const upto = rows.filter((r) => r.date <= (lastDate ?? ''));
  const strategies: Strategy[] = ['model', 'machine', 'tail', 'prevWinner', 'prevLoser'];
  const results = strategies.map((st) => backtest(upto, st, {picks: 5, filterBy: st === 'model' || st === 'tail' ? 'dateTail' : 'none'}));
  if (results[0].days.length) {
    out.push('', '## 選び方の検証', '', 'その日より前のデータだけで台を選び、実際の結果と店平均を比べた（毎日5台）。', '');
    out.push('| 選び方 | 狙い台の平均 | 勝率 | 店平均 | 店平均を上回った日 |', '| --- | ---: | ---: | ---: | ---: |');
    results.forEach((r: BacktestResult, i) =>
      out.push(`| ${STRATEGY_LABELS[strategies[i]]} | ${signed(r.pickAvgDiff)} | ${pct(r.pickWinRate, 0)} | ${signed(r.baselineAvgDiff)} | ${pct(r.beatRate, 0)} |`),
    );
  }
  if (opts.record && opts.record.days > 0) {
    const t = opts.record;
    out.push('', '## 公開予想の実績', '', `${t.days}日・${t.picks}台：プラス${t.hits}台（${pct(t.hitRate, 0)}）、平均${signed(t.pickAvgDiff)}枚（同日の店平均 ${signed(t.storeAvgDiff)}枚）`);
  }
  out.push('', '---', sourceLine(opts.source), DISCLAIMER);
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

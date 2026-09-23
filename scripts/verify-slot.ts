/**
 * スロット分析ロジックの検証スクリプト。
 *   npx tsx scripts/verify-slot.ts
 * 取り込み（HTML / コピーしたテキスト / CSV）と、各分析が正しい値を返すかを確かめる。
 */
import assert from 'node:assert/strict';
import {
  backtest,
  dayReport,
  findStreaks,
  neighborAnalysis,
  periodReport,
  prevDayAnalysis,
  recommend,
  summarize,
  type Strategy,
} from '../src/slot/analyze';
import {generateDemo} from '../src/slot/demo';
import {detectMeta, parseInput, parseNumber, toCsv} from '../src/slot/parse';
import {
  dayPostLong,
  dayPostX,
  DISCLAIMER,
  evaluatePrediction,
  makePrediction,
  monthlyArticle,
  PAYWALL_MARK,
  predictionPostX,
  resultPostX,
  trackRecord,
  X_LIMIT,
  xLength,
} from '../src/slot/publish';
import {wilsonLower} from '../src/slot/stats';
import type {SlotRow} from '../src/slot/types';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log('■ 取り込み');

check('数値の表記ゆれ', () => {
  assert.equal(parseNumber('+1,234枚'), 1234);
  assert.equal(parseNumber('−2,500'), -2500);
  assert.equal(parseNumber('ー300'), -300);
  assert.equal(parseNumber('5,120G'), 5120);
  assert.equal(parseNumber('１２３'), 123);
  assert.equal(parseNumber('1/245.3'), null);
  assert.equal(parseNumber('-'), null);
});

check('タイトルから日付と店名', () => {
  assert.deepEqual(detectMeta('<title>2025/9/22(月) スペース666 | スロット差枚データ詳細 – みんレポ</title>', 2026), {
    date: '2025-09-22',
    store: 'スペース666',
  });
  assert.deepEqual(detectMeta('<title>9/6(土) スペース666 | スロット差枚データ詳細</title>', 2026), {
    date: '2026-09-06',
    store: 'スペース666',
  });
});

check('HTML: 機種列のある表 + 集計表は無視', () => {
  const html = `<html><head><title>2026/9/22(火) スペース666 | スロット差枚データ詳細</title></head><body>
    <h2>機種別</h2><table><tr><th>機種</th><th>平均差枚</th><th>勝率</th></tr><tr><td>A</td><td>+500</td><td>2/3</td></tr></table>
    <h2>全台</h2>
    <table>
      <tr><th>台番</th><th>機種</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>
      <tr><td>101</td><td>スマスロ北斗の拳</td><td>6,210</td><td>+2,345</td><td>20</td><td>12</td></tr>
      <tr><td>102</td><td>スマスロ北斗の拳</td><td>3,100</td><td>−1,020</td><td>8</td><td>5</td></tr>
      <tr><td>平均</td><td></td><td>4,655</td><td>+662</td><td></td><td></td></tr>
    </table></body></html>`;
  const res = parseInput(html);
  assert.equal(res.date, '2026-09-22');
  assert.equal(res.store, 'スペース666');
  assert.equal(res.rows.length, 2);
  assert.deepEqual(res.rows[0], {
    date: '2026-09-22',
    store: 'スペース666',
    machine: 'スマスロ北斗の拳',
    unit: 101,
    games: 6210,
    diff: 2345,
    bb: 20,
    rb: 12,
  });
  assert.equal(res.rows[1].diff, -1020);
});

check('タイトルの日付が入力欄の日付より優先される（取り違え防止）', () => {
  const html = '<title>2026/9/23(水) スペース666 | x</title><table><tr><th>台番</th><th>差枚</th></tr><tr><td>1</td><td>5</td></tr></table>';
  const res = parseInput(html, {date: '2026-09-22', store: '別の店'});
  assert.equal(res.rows[0].date, '2026-09-23');
  assert.equal(res.rows[0].store, 'スペース666');
});

check('HTML: 機種ごとに表が分かれ、見出しが機種名', () => {
  const html = `<h3>マイジャグラーV (2台)</h3>
    <table><tr><th>台番</th><th>差枚</th><th>G数</th></tr><tr><td>1</td><td>500</td><td>7000</td></tr><tr><td>2</td><td>-800</td><td>4000</td></tr></table>
    <h3>ゴーゴージャグラー3</h3>
    <table><tr><th>台番</th><th>差枚</th><th>G数</th></tr><tr><td>3</td><td>1,200</td><td>8000</td></tr></table>`;
  const res = parseInput(html, {date: '2026-09-22', store: 'テスト'});
  assert.deepEqual(
    res.rows.map((r) => [r.unit, r.machine, r.diff]),
    [
      [1, 'マイジャグラーV', 500],
      [2, 'マイジャグラーV', -800],
      [3, 'ゴーゴージャグラー3', 1200],
    ],
  );
});

check('コピーしたテキスト（タブ区切り、機種名が行として挟まる）', () => {
  const text = [
    '2026/9/22(火) スペース666 | スロット差枚データ詳細',
    '台番\tG数\t差枚\tBB\tRB',
    'スマスロ ゴブリンスレイヤーII',
    '10\t5,000\t+1,500\t10\t5',
    '11\t2,000\t-700\t3\t2',
    'L 主役は銭形5',
    '12\t8,000\t+3,210\t30\t15',
  ].join('\n');
  const res = parseInput(text);
  assert.equal(res.date, '2026-09-22');
  assert.deepEqual(
    res.rows.map((r) => [r.unit, r.machine, r.diff, r.games]),
    [
      [10, 'スマスロ ゴブリンスレイヤーII', 1500, 5000],
      [11, 'スマスロ ゴブリンスレイヤーII', -700, 2000],
      [12, 'L 主役は銭形5', 3210, 8000],
    ],
  );
});

check('CSVの書き出し→読み込みで元に戻る', () => {
  const rows = generateDemo(2026, 9, 3);
  const back = parseInput(toCsv(rows)).rows;
  assert.equal(back.length, rows.length);
  assert.deepEqual(back, [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.unit - b.unit));
});

check('機種名にカンマを含むCSV', () => {
  const rows: SlotRow[] = [
    {date: '2026-09-22', store: 'S', machine: 'A,B "X"', unit: 1, games: null, diff: -5, bb: null, rb: null},
  ];
  assert.deepEqual(parseInput(toCsv(rows)).rows, rows);
});

console.log('■ 集計');

const R = (unit: number, diff: number, games: number | null = 3000, machine = 'M', date = '2026-09-22'): SlotRow => ({
  date,
  store: 'S',
  machine,
  unit,
  games,
  diff,
  bb: null,
  rb: null,
});

check('店トータル・勝率・出率', () => {
  const s = summarize([R(1, 1000), R(2, -500), R(3, 0, null)]);
  assert.equal(s.totalDiff, 500);
  assert.equal(s.wins, 1); // 差枚0は勝ちに数えない
  assert.equal(s.winRate, 1 / 3);
  // 出率はゲーム数のある台だけ：(18000 + 500) / 18000
  assert.ok(Math.abs(s.payout! - 18500 / 18000) < 1e-12);
  assert.equal(s.best!.unit, 1);
  assert.equal(s.worst!.unit, 2);
});

check('ウィルソン下限：3/3勝より60/80勝の方が信頼できる', () => {
  assert.ok(wilsonLower(3, 3) < wilsonLower(60, 80));
  assert.equal(wilsonLower(0, 0), 0);
});

check('並び（連続プラス）の検出', () => {
  const s = findStreaks([R(1, 10), R(2, 10), R(3, 10), R(4, -1), R(5, 5), R(6, 5), R(8, 5)], 3);
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].from, s[0].to, s[0].total], [1, 3, 30]);
});

check('全台系の検出', () => {
  const day = [R(1, 10, 3000, 'X'), R(2, 20, 3000, 'X'), R(3, 5, 3000, 'X'), R(4, 5, 3000, 'Y'), R(5, -5, 3000, 'Y'), R(6, 5, 3000, 'Y')];
  const rep = dayReport(day, '2026-09-22');
  assert.deepEqual(
    rep.allWinMachines.map((m) => m.key),
    ['X'],
  );
});

check('前日比較は「翌日」かつ同じ機種のペアだけ', () => {
  const rows = [
    R(1, -4000, 3000, 'M', '2026-09-01'),
    R(1, 500, 3000, 'M', '2026-09-02'),
    R(2, 100, 3000, 'M', '2026-09-01'),
    R(2, 100, 3000, 'N', '2026-09-02'), // 機種入替 → 対象外
    R(3, 100, 3000, 'M', '2026-09-04'), // 9/3が無いので9/2→9/4は連続扱いしない
  ];
  const a = prevDayAnalysis(rows);
  assert.equal(a.pairs, 1);
  assert.equal(a.buckets[0].count, 1);
  assert.equal(a.buckets[0].nextAvgDiff, 500);
});

console.log('■ デモデータ（仕込んだ傾向を見つけられるか）');

const demo = generateDemo();
const period = periodReport(demo);

check('日別の店トータルが台ごとの合計と一致', () => {
  for (const d of period.byDate) {
    const manual = demo.filter((r) => r.date === d.key).reduce((s, r) => s + r.diff, 0);
    assert.equal(d.totalDiff, manual);
  }
  assert.equal(period.summary.totalDiff, demo.reduce((s, r) => s + r.diff, 0));
});

check('最も勝ちやすい機種 = 仕込んだ「デモ機A」', () => {
  assert.equal(period.machines[0].key, 'デモ機A');
});

check('日付末尾6の日は、末尾6の台が最も強い', () => {
  const on6 = demo.filter((r) => Number(r.date.slice(8)) % 10 === 6);
  const tails = periodReport(on6).tails.sort((a, b) => b.avgDiff - a.avgDiff);
  assert.equal(tails[0].key, '末尾6');
  const rec = recommend(demo.filter((r) => r.date < '2026-09-26'), demo.filter((r) => r.date === '2026-09-26'), {
    filter: {kind: 'dateTail', value: 6},
  });
  assert.equal(rec.basis, '日付末尾6の日');
  // 過去の6の日は2日分しかないので、末尾6は「上位」に入れば十分（件数が少ないほど控えめに評価する設計）
  assert.ok(rec.tails.slice(0, 2).some((t) => t.key === '末尾6'), '末尾6が上位2つに入る');
  // 強い機種（デモ機A）かつ末尾6の台番6が1位
  assert.equal(rec.picks[0].unit, 6);
});

check('推定勝率は0〜1、期待差枚は有限', () => {
  const rec = recommend(demo, demo.filter((r) => r.date === '2026-09-30'), {filter: {kind: 'all'}});
  for (const p of rec.picks) {
    assert.ok(p.pWin > 0 && p.pWin < 1);
    assert.ok(Number.isFinite(p.expDiff));
  }
});

check('並び分析が数値を返す', () => {
  const n = neighborAnalysis(demo);
  assert.ok(n.whenNeighborWon.n > 0 && n.whenNeighborLost.n > 0);
});

console.log('■ バックテスト（未来データを使わずに選んだ台の成績）');

const strategies: Strategy[] = ['model', 'machine', 'tail', 'prevLoser', 'prevWinner'];
for (const s of strategies) {
  const bt = backtest(demo, s, {picks: 5, filterBy: s === 'model' || s === 'tail' ? 'dateTail' : 'none'});
  console.log(
    `     ${bt.strategy.padEnd(22, '　')} 狙い台 平均${Math.round(bt.pickAvgDiff).toString().padStart(6)}枚 勝率${(bt.pickWinRate * 100).toFixed(0).padStart(3)}%` +
      ` / 店平均 ${Math.round(bt.baselineAvgDiff).toString().padStart(6)}枚 勝率${(bt.baselineWinRate * 100).toFixed(0).padStart(3)}%` +
      ` / 店平均超え ${(bt.beatRate * 100).toFixed(0)}%の日`,
  );
}

check('総合モデルは店平均を上回る（仕込んだ傾向を学習できている）', () => {
  const bt = backtest(demo, 'model', {picks: 5, filterBy: 'dateTail'});
  assert.ok(bt.pickAvgDiff > bt.baselineAvgDiff);
  assert.ok(bt.pickWinRate > bt.baselineWinRate);
});

check('バックテストは未来のデータを使わない', () => {
  // 最終日の結果を改ざんしても、最終日の狙い台の選び方は変わらない
  const tampered = demo.map((r) => (r.date === '2026-09-30' ? {...r, diff: r.unit === 1 ? 99999 : -99999} : r));
  const a = backtest(demo, 'model').days.at(-1)!.picks.map((p) => p.unit);
  const b = backtest(tampered, 'model').days.at(-1)!.picks.map((p) => p.unit);
  assert.deepEqual(a, b);
});

console.log('■ 発信・販売用の出力');

const postOpts = {store: 'デモ店舗（架空）', source: 'みんレポ', hashtags: ['スロット', 'データ']};

check('Xの文字数の数え方（全角2・半角1・URL23）', () => {
  assert.equal(xLength('abc'), 3);
  assert.equal(xLength('あいう'), 6);
  assert.equal(xLength('見て https://example.com/very/long/path'), 4 + 1 + 23);
});

check('X用の日別まとめは全日280以内で、店トータルを必ず含む', () => {
  for (const d of period.dates) {
    const t = dayPostX(demo, d, postOpts);
    assert.ok(xLength(t) <= X_LIMIT, `${d}: ${xLength(t)}`);
    const total = demo.filter((r) => r.date === d).reduce((s, r) => s + r.diff, 0);
    assert.ok(t.includes('店トータル'));
    assert.ok(t.includes(Math.abs(total).toLocaleString('ja-JP')));
    assert.ok(t.includes('#スロット'));
  }
});

check('機種名がとても長くてもXの上限を超えない', () => {
  const long = demo.filter((r) => r.date === '2026-09-22').map((r) => ({...r, machine: `パチスロとても長い機種名シリーズ${r.machine}～超特別仕様バージョン`}));
  assert.ok(xLength(dayPostX(long, '2026-09-22', postOpts)) <= X_LIMIT);
});

check('長文・月間記事には出典と免責が入り、全台一覧は載せない', () => {
  const long = dayPostLong(demo, '2026-09-22', postOpts);
  assert.ok(long.includes('データ出典：みんレポ') && long.includes(DISCLAIMER));
  // 台番ごとの行（全台一覧）は出さない
  assert.ok(!/\| 1 \| デモ機A \| .* \| .* \|\n\| 2 \|/.test(long));
  const art = monthlyArticle(demo, '2026-09', postOpts);
  assert.ok(art.includes(PAYWALL_MARK));
  assert.ok(art.indexOf('今月のまとめ') < art.indexOf(PAYWALL_MARK));
  assert.ok(art.indexOf('## 機種ランキング') > art.indexOf(PAYWALL_MARK), 'ランキングは有料部分');
  assert.ok(art.includes(DISCLAIMER));
  const monthTotal = demo.reduce((s, r) => s + r.diff, 0);
  assert.ok(art.includes(Math.abs(monthTotal).toLocaleString('ja-JP')));
});

check('予想の答え合わせ：結果待ち・的中数・機種入替', () => {
  const train = demo.filter((r) => r.date < '2026-09-26');
  const today = demo.filter((r) => r.date === '2026-09-26');
  const rec = recommend(train, today, {filter: {kind: 'dateTail', value: 6}});
  const p = makePrediction(postOpts.store, '2026-09-26', rec.basis, rec.picks, 5);
  assert.equal(p.picks.length, 5);
  // 対象日のデータがなければ結果待ち
  assert.equal(evaluatePrediction(p, train).result, null);
  const r = evaluatePrediction(p, demo)!.result!;
  const actual = p.picks.map((pk) => today.find((x) => x.unit === pk.unit)!.diff);
  assert.equal(r.hits, actual.filter((x) => x > 0).length);
  assert.equal(r.pickAvgDiff, actual.reduce((a, b) => a + b, 0) / 5);
  // 1台が機種入替になった場合は評価から外す
  const swapped = demo.map((x) => (x.date === '2026-09-26' && x.unit === p.picks[0].unit ? {...x, machine: '新台'} : x));
  const r2 = evaluatePrediction(p, swapped).result!;
  assert.equal(r2.evaluated, 4);
  assert.equal(r2.picks[0].diff, null);
});

check('通算実績は台数で重み付けして集計', () => {
  const mk = (date: string) => makePrediction(postOpts.store, date, '全日', recommend(demo.filter((r) => r.date < date), demo.filter((r) => r.date === date), {filter: {kind: 'all'}}).picks, 3);
  const res = ['2026-09-10', '2026-09-20', '2026-10-01'].map((d) => evaluatePrediction(mk(d), demo));
  const t = trackRecord(res);
  assert.equal(t.days, 2); // 10/1はデータがないので結果待ち
  assert.equal(t.picks, 6);
  const all = res.slice(0, 2).flatMap((x) => x.result!.picks.map((p) => p.diff!));
  assert.equal(t.hits, all.filter((x) => x > 0).length);
  assert.ok(Math.abs(t.pickAvgDiff - all.reduce((a, b) => a + b, 0) / 6) < 1e-9);
  const post = resultPostX(res[0], postOpts, t)!;
  assert.ok(xLength(post) <= X_LIMIT && post.includes('答え合わせ'));
  assert.ok(xLength(predictionPostX(res[2].prediction, postOpts, t)) <= X_LIMIT);
  assert.equal(resultPostX(res[2], postOpts, t), null);
});

console.log(`\n${passed} 件すべて合格`);

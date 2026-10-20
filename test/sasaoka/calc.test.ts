import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cutToLength,
  estimateAmount,
  estimatePlaceLines,
  estimateQty,
  estimateTotals,
  estimateUnitPrice,
  jobName,
  jobTotals,
  monthSummary,
  placeTotals,
  rounddown,
  roundYen,
  rowAmount,
  sortJobs,
  taxAmount,
} from '../../src/sasaoka/calc.ts';
import type {Job, Row, Settings} from '../../src/sasaoka/types.ts';

const S = {
  rate: 0.07,
  taxRate: 0.1,
  taxMode: 'original',
  invoiceTaxMode: 'perJob',
  totalTaxRounding: 'floor',
  estimateRate: 0.8,
  estimateOverheadRate: 0.1,
  estimateHourRate: 2500,
  estimateForm: 'yukuhashi',
} as const satisfies Pick<
  Settings,
  'rate' | 'taxRate' | 'taxMode' | 'invoiceTaxMode' | 'totalTaxRounding' | 'estimateRate' | 'estimateOverheadRate' | 'estimateHourRate' | 'estimateForm'
>;

let seq = 0;
const blank = {code: '', maker: '', unit: '', listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
const mat = (price: number, qty: number, name = '部材', extra: Partial<Row> = {}): Row => ({
  ...blank, id: `r${++seq}`, kind: 'material', refId: null, name, price, qty, ...extra,
});
const lab = (price: number, qty: number, name = '木'): Row => ({
  ...blank, id: `r${++seq}`, kind: 'labor', refId: null, name, price, qty,
});
const job = (rows: Row[][], extra: Partial<Job> = {}): Job => ({
  id: `j${++seq}`, month: '2026-10', customer: '山田', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null, shikiri: true,
  places: rows.map((r, i) => ({id: `p${i}`, name: `箇所${i}`, rows: r, kind: 1, photo: 0})),
  createdAt: seq, updatedAt: seq, ...extra,
});

test('roundYen は浮動小数の誤差を除いて四捨五入する', () => {
  assert.equal(78150 * 0.07, 5470.500000000001); // そのままだと誤差がある
  assert.equal(roundYen(78150 * 0.07), 5471);
  assert.equal(roundYen(2425.15), 2425);
  assert.equal(roundYen(0.5), 1);
  assert.equal(roundYen(-0.5), -1);
  assert.equal(roundYen(1.49999), 1);
  assert.equal(roundYen(1.4999999), 2); // 1e-6 未満の差は誤差とみなす
});

test('taxAmount の各モード', () => {
  // 元の表：⑦×0.1－1（表示は四捨五入）
  assert.equal(taxAmount(37070, 0.1, 'original'), 3706); // 3707.0 - 1
  assert.equal(taxAmount(26693, 0.1, 'original'), 2668); // 2669.3 → 2669 - 1
  assert.equal(taxAmount(83621, 0.1, 'original'), 8361); // 8362.1 → 8362 - 1
  assert.equal(taxAmount(0, 0.1, 'original'), 0); // 空の様邸は −1 にしない
  assert.equal(taxAmount(133212, 0.1, 'floor'), 13321);
  assert.equal(taxAmount(133215, 0.1, 'round'), 13322);
  assert.equal(taxAmount(133211, 0.1, 'ceil'), 13322);
  assert.equal(taxAmount(-1005, 0.1, 'floor'), -100); // マイナス（値引き）は0に向けて切り捨て
});

test('rowAmount と placeTotals（玄関の例：手すり10,000＋ブラケット1,500×2＋木2箇所）', () => {
  const place = {rows: [mat(10000, 1, '木の手すり'), mat(1500, 2, 'ブラケット'), lab(1000, 2, '木')]};
  assert.equal(rowAmount(place.rows[1]), 3000);
  assert.deepEqual(placeTotals(place), {material: 13000, labor: 2000, total: 15000});
});

test('仕切り計算表：切って使う部材は見積書と同じ本数（4m を 60cm 使う → 0.15本）で計算する', () => {
  const rail = mat(10000, 1, '木製手すり 35φ 4m', {listPrice: 20000, lengthCm: 60, pieceLengthM: 4});
  assert.equal(rowAmount(rail), 1500); // 10,000×0.15
  assert.equal(rowAmount({...rail, qty: 2}), 3000); // 60cm を2本 → 0.3本
  assert.equal(rowAmount({...rail, lengthCm: 90, price: 9850}), 2216); // 9,850×0.225＝2,216.25 → 四捨五入
  assert.equal(rowAmount({...rail, price: 9850}), 1478); // 9,850×0.15＝1,477.5 → 四捨五入（見積書は切り捨て）
  assert.equal(rowAmount(mat(9000, 1, '手すり 3m', {lengthCm: 100, pieceLengthM: 3})), 3000); // 1m÷3m は丸める前の数量で計算
  assert.equal(rowAmount({...rail, lengthCm: 0}), 10000); // 規格品そのまま → 1本
  assert.equal(rowAmount({...rail, pieceLengthM: 0}), 10000); // 1本の長さが分からない → 数量のまま
  assert.deepEqual(placeTotals({rows: [rail, lab(1000, 2)]}), {material: 1500, labor: 2000, total: 3500});
});

test('jobTotals は元の仕切り計算表と同じ（Excelの記入例と同じ数字）', () => {
  // 記入例：商品 23,500／施工費 9,500
  const j = job([[mat(3800, 2), mat(4500, 1), mat(7800, 1), mat(600, 6), lab(1000, 3), lab(1500, 1), lab(1500, 1), lab(1500, 1), lab(2000, 1)]]);
  const t = jobTotals(j, S);
  assert.deepEqual(t, {
    material: 23500,
    labor: 9500,
    markup: 1645, // 23,500×0.07
    overhead: 2425, // (23,500＋9,500＋1,645)×0.07＝2,425.15
    subtotal: 37070,
    tax: 3706, // 3,707－1
    total: 40776,
  });
  // ①〜④を足すと⑦、⑦＋⑤＝⑥ になる
  assert.equal(t.material + t.labor + t.markup + t.overhead, t.subtotal);
  assert.equal(t.subtotal + t.tax, t.total);
});

test('jobTotals：Excelのテスト「1件目」（田中様邸）と同じ', () => {
  const j = job([[mat(3800, 2), mat(4500, 1)], [lab(1000, 4), lab(1500, 2), lab(1000, 2), lab(3000, 1)]]);
  const t = jobTotals(j, S);
  assert.deepEqual(t, {material: 12100, labor: 12000, markup: 847, overhead: 1746, subtotal: 26693, tax: 2668, total: 29361});
});

test('空の様邸はすべて0', () => {
  assert.deepEqual(jobTotals(job([[]]), S), {material: 0, labor: 0, markup: 0, overhead: 0, subtotal: 0, tax: 0, total: 0});
});

test('monthSummary：様邸ごとの消費税を足す設定', () => {
  const a = job([[mat(3800, 2), mat(4500, 1)], [lab(1000, 4), lab(1500, 2), lab(1000, 2), lab(3000, 1)]], {date: '2026-10-03'});
  const b = job([[mat(45000, 1)], [lab(8000, 1), lab(2000, 1), lab(12000, 1), lab(5000, 1), lab(3000, 1)]], {date: '2026-10-12'});
  const c = job([[mat(20000, 1)]], {date: '2026-10-25'});
  const m = monthSummary([c, b, a], S);
  assert.deepEqual(m.rows.map((r) => r.job.id), [a.id, b.id, c.id]); // 施工日順
  assert.equal(m.sum.subtotal, 26693 + 83621 + 22898);
  assert.equal(m.invoice.tax, m.sum.tax);
  assert.equal(m.invoice.total, m.sum.total);
  assert.equal(m.invoice.total, m.rows.reduce((s, r) => s + r.totals.total, 0));
});

test('monthSummary：すべての様邸の税抜合計に、最後に消費税率をかける（初期設定）', () => {
  const a = job([[mat(3800, 2), mat(4500, 1)], [lab(1000, 4), lab(1500, 2), lab(1000, 2), lab(3000, 1)]]);
  const c = job([[mat(20000, 1)]]);
  const m = monthSummary([a, c], {...S, invoiceTaxMode: 'monthly'});
  assert.equal(m.invoice.subtotal, 26693 + 22898);
  // 49,591×0.1＝4,959.1 → 切り捨て 4,959（様邸ごとの「⑦×0.1－1」は使わない）
  assert.equal(m.invoice.tax, 4959);
  assert.equal(m.invoice.total, 49591 + 4959);
  assert.equal(monthSummary([a, c], {...S, invoiceTaxMode: 'monthly', totalTaxRounding: 'ceil'}).invoice.tax, 4960);
});

test('見積：単価は定価×0.8、切って使う部材の数量は 使う長さ÷1本の長さ（定価2万円・1本4mを60cm → 0.15本・2,400円）', () => {
  const rail = mat(10000, 1, '木製手すり 35φ 4m', {listPrice: 20000, lengthCm: 60, pieceLengthM: 4});
  assert.equal(estimateUnitPrice(rail, 0.8), 16000); // 20,000×0.8（長さで単価は変えない）
  assert.equal(estimateQty(rail), 0.15); // 0.6m÷4m
  assert.equal(estimateAmount(rail, 0.8), 2400); // 16,000×0.15
  // 規格品をそのまま（長さを入れない）なら1本
  assert.equal(estimateQty({...rail, lengthCm: 0}), 1);
  assert.equal(estimateAmount({...rail, lengthCm: 0}, 0.8), 16000);
  // 同じ長さを2本：0.3本
  assert.equal(estimateAmount({...rail, qty: 2}, 0.8), 4800);
  // 90cm÷4m＝0.225本 → 3,600円。1m÷3m は 0.333…本 → 金額は割り切れない数量のまま計算して 4,000円
  assert.equal(estimateAmount({...rail, lengthCm: 90}, 0.8), 3600);
  assert.equal(estimateAmount(mat(0, 1, '手すり 3m', {listPrice: 15000, lengthCm: 100, pieceLengthM: 3}), 0.8), 4000);
  // 1本の長さが分からないときは長さで数えない（画面で「1本の長さを入れてください」と出す）
  assert.equal(cutToLength({...rail, pieceLengthM: 0}), false);
  assert.equal(estimateQty({...rail, pieceLengthM: 0}), 1);
  assert.equal(estimateUnitPrice(mat(0, 1, 'ブラケット', {listPrice: 333}), 0.8), 266); // 266.4
  assert.equal(estimateUnitPrice(mat(0, 1, 'ブラケット', {listPrice: 1231}), 0.8), 984); // 984.8 → 切り捨て（元の見積書と同じ）
  assert.equal(estimateAmount(mat(0, 3, 'キャップ', {estPrice: 333.5}), 0.8), 1000); // 1,000.5 → 切り捨て
  // 手で入れた見積の単価がそのまま使われる（金額だけの行も）
  assert.equal(estimateUnitPrice({...rail, estPrice: 12000}, 0.8), 12000);
  assert.equal(estimateAmount(mat(0, 3, '', {estPrice: 500}), 0.8), 1500);
  // 定価のない部材は0円（画面で「定価がありません」と出す）
  assert.equal(estimateUnitPrice(mat(3360, 1), 0.8), 0);
  // 手間は取付手間の単価のまま
  assert.equal(estimateUnitPrice(lab(1000, 2), 0.8), 1000);
});

test('見積：部材のすぐ下に続く手間の行を「同上施工費」1行にまとめる（手すり1本・木2箇所＝2,000円）', () => {
  const place = {
    rows: [
      mat(10000, 1, '木製手すり', {listPrice: 20000, lengthCm: 60, pieceLengthM: 4}),
      lab(1000, 2, '木'),
      mat(1500, 2, 'ブラケット', {listPrice: 2100}),
      lab(1500, 1, 'タイル'),
      lab(1500, 1, '補強板'),
    ],
  };
  const lines = estimatePlaceLines(place, 0.8);
  assert.deepEqual(
    lines.map((l) =>
      l.kind === 'material' ? ['部材', l.row.name, l.qty, l.unitPrice, l.amount] : ['施工費', l.rows.length, l.amount, l.afterMaterial],
    ),
    [
      ['部材', '木製手すり', 0.15, 16000, 2400],
      ['施工費', 1, 2000, true],
      ['部材', 'ブラケット', 2, 1680, 3360],
      ['施工費', 2, 3000, true],
    ],
  );
  // 箇所の最初が手間なら「施工費」（同上ではない）
  assert.equal((estimatePlaceLines({rows: [lab(1000, 1)]}, 0.8)[0] as {afterMaterial: boolean}).afterMaterial, false);
});

test('見積の合計：小計＝部材＋施工費、諸経費＝小計×0.1、消費税＝（小計＋諸経費）×0.1（どれも切り捨て）', () => {
  const j = job([
    [mat(10000, 1, '木製手すり', {listPrice: 20000, lengthCm: 60, pieceLengthM: 4}), lab(1000, 2), mat(1500, 2, 'ブラケット', {listPrice: 2100})],
    [mat(7800, 1, 'L型手すり', {listPrice: 11000}), lab(1500, 2, 'タイル'), mat(300, 2, 'エンドキャップ', {listPrice: 450})],
  ]);
  const t = estimateTotals(j, S);
  // 2,400＋3,360＋8,800＋720＝15,280／施工費 2,000＋3,000＝5,000／小計 20,280・諸経費 2,028・消費税 2,230（2,230.8）・合計 24,538
  const sums = {subtotal: 20280, overhead: 2028, tax: 2230, total: 24538};
  assert.deepEqual(t, {material: 15280, work: 5000, all: sums, target: sums, excluded: 0});
  // 仕切り計算表は仕切価格で計算する（見積の定価・掛率は使わない）。切って使う手すりは見積と同じ 0.15本（10,000×0.15＝1,500）
  assert.equal(jobTotals(j, S).material, 1500 + 3000 + 7800 + 600);
  // 元の見積書（苅田町・行橋用）の記入例：小計 27,440 → 諸経費 2,744・消費税 3,018・合計 33,202
  const ex = estimateTotals(job([[mat(0, 1, 'TOTO 32インテリアバー', {listPrice: 24300}), lab(8000, 1, '施工費')]]), S);
  assert.deepEqual(ex.all, {subtotal: 27440, overhead: 2744, tax: 3018, total: 33202});
});

test('介護保険の対象外：全体には入り、対象の小計からは外す。部材のすぐ下の施工費は部材に合わせる', () => {
  const j = job([
    [
      mat(0, 1, '手すり', {listPrice: 10000}),
      lab(1000, 2),
      mat(0, 1, '踏み台（対象外）', {listPrice: 20000, excluded: true}),
      lab(1500, 1), // 対象外の部材の同上施工費 → 対象外
    ],
    [lab(3000, 1, 'コア抜き'), {...lab(2000, 1, '撤去'), excluded: true}], // 箇所の最初の施工費：行がすべて対象外のときだけ対象外
    [{...lab(5000, 1, '処分'), excluded: true}],
  ]);
  const lines = j.places.map((p) => estimatePlaceLines(p, 0.8).map((l) => [l.kind, l.amount, l.excluded]));
  assert.deepEqual(lines, [
    [
      ['material', 8000, false],
      ['work', 2000, false],
      ['material', 16000, true],
      ['work', 1500, true],
    ],
    [['work', 5000, false]],
    [['work', 5000, true]],
  ]);
  const t = estimateTotals(j, S);
  assert.equal(t.all.subtotal, 37500); // 8,000＋2,000＋16,000＋1,500＋5,000＋5,000
  assert.equal(t.excluded, 22500); // 16,000＋1,500＋5,000
  assert.deepEqual(t.target, {subtotal: 15000, overhead: 1500, tax: 1650, total: 18150});
});

test('見積の諸経費は手で直せる（端数の調整）。対象外の行がなければ介護保険の対象も同じ金額', () => {
  const rows = [[mat(0, 1, 'TOTO 32インテリアバー', {listPrice: 24300}), lab(8000, 1, '施工費')]];
  // 小計 27,440 → 諸経費を 2,700 にすると 消費税 3,014（(27,440＋2,700)×0.1）・合計 33,154
  const t = estimateTotals(job(rows, {overhead: 2700}), S);
  assert.deepEqual(t.all, {subtotal: 27440, overhead: 2700, tax: 3014, total: 33154});
  assert.deepEqual(t.target, t.all);
  // 手で入れていなければ 小計×0.1
  assert.equal(estimateTotals(job(rows, {overhead: null}), S).all.overhead, 2744);
  // 対象外の行があるとき、介護保険の対象の諸経費は overheadTarget（なければ 対象の小計×0.1）
  const ex = [[...rows[0], mat(0, 1, '対象外', {listPrice: 10000, excluded: true})]];
  const t2 = estimateTotals(job(ex, {overhead: 3500}), S);
  assert.deepEqual([t2.all.subtotal, t2.all.overhead, t2.target.subtotal, t2.target.overhead], [35440, 3500, 27440, 2744]);
  assert.equal(estimateTotals(job(ex, {overhead: 3500, overheadTarget: 2700}), S).target.total, 33154);
  // 仕切り計算表の④諸経費は一律の式のまま（見積の諸経費を直しても変わらない）
  assert.equal(jobTotals(job(rows, {overhead: 2700}), S).overhead, jobTotals(job(rows), S).overhead);
});

test('見積書で施工費の金額を直す（最初の手間の行の estAmount）：見積の合計に入り、仕切り計算表は変わらない', () => {
  const wood = {...lab(1000, 2), estAmount: 3000};
  const rows = [mat(10000, 1, '手すり', {listPrice: 20000}), wood, lab(500, 1, 'タイル')];
  const [, work] = estimatePlaceLines({rows}, 0.8);
  // 取付手間の合計は 2,000＋500＝2,500。見積書の金額は 3,000
  assert.deepEqual(work.kind === 'work' && [work.sum, work.amount, work.rows.length], [2500, 3000, 2]);
  const t = estimateTotals(job([rows]), S);
  assert.deepEqual([t.material, t.work, t.all.subtotal], [16000, 3000, 19000]);
  // 仕切り計算表の②取付手間合計は 2,500 のまま
  assert.equal(jobTotals(job([rows]), S).labor, 2500);
  // 直していなければ取付手間の合計
  assert.equal(estimateTotals(job([[rows[0], {...wood, estAmount: null}, rows[2]]]), S).work, 2500);
});

test('rounddown は0の方へ切り捨て（浮動小数の誤差は除く）', () => {
  assert.equal(rounddown(2230.8), 2230);
  assert.equal(rounddown(0.29 * 100), 29); // 28.999999999999996 → 29
  assert.equal(rounddown(-2.5), -2);
  assert.equal(rounddown(12000 / 3), 4000);
});

test('sortJobs：施工日なしは後ろ、同じ日は作った順', () => {
  const x = [
    {id: 'a', date: '', createdAt: 1},
    {id: 'b', date: '2026-10-05', createdAt: 3},
    {id: 'c', date: '2026-10-01', createdAt: 4},
    {id: 'd', date: '2026-10-05', createdAt: 2},
  ];
  assert.deepEqual(sortJobs(x).map((j) => j.id), ['c', 'd', 'b', 'a']);
});

test('jobName', () => {
  assert.equal(jobName({customer: '山田', suffix: '様邸'}), '山田様邸');
  assert.equal(jobName({customer: '山田様邸', suffix: '様邸'}), '山田様邸');
  assert.equal(jobName({customer: '山田 花子', suffix: '様'}), '山田 花子様');
  assert.equal(jobName({customer: ' ', suffix: '様邸'}), '（お客様名未入力）');
});

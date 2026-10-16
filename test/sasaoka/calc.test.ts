import assert from 'node:assert/strict';
import test from 'node:test';
import {jobName, jobTotals, monthSummary, placeTotals, roundYen, rowAmount, sortJobs, taxAmount} from '../../src/sasaoka/calc.ts';
import type {Job, Row, Settings} from '../../src/sasaoka/types.ts';

const S = {rate: 0.07, taxRate: 0.1, taxMode: 'original', invoiceTaxMode: 'perJob'} as const satisfies Pick<
  Settings,
  'rate' | 'taxRate' | 'taxMode' | 'invoiceTaxMode'
>;

let seq = 0;
const mat = (price: number, qty: number, name = '部材'): Row => ({
  id: `r${++seq}`, kind: 'material', refId: null, name, code: '', maker: '', price, qty,
});
const lab = (price: number, qty: number, name = '木'): Row => ({
  id: `r${++seq}`, kind: 'labor', refId: null, name, code: '', maker: '', price, qty,
});
const job = (rows: Row[][], extra: Partial<Job> = {}): Job => ({
  id: `j${++seq}`, month: '2026-10', customer: '山田', suffix: '様邸', date: '', address: '', note: '',
  places: rows.map((r, i) => ({id: `p${i}`, name: `箇所${i}`, rows: r})),
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

test('monthSummary：様邸ごとの消費税を足す（初期設定）', () => {
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

test('monthSummary：1か月の税抜合計で1回だけ計算する設定', () => {
  const a = job([[mat(3800, 2), mat(4500, 1)], [lab(1000, 4), lab(1500, 2), lab(1000, 2), lab(3000, 1)]]);
  const c = job([[mat(20000, 1)]]);
  const m = monthSummary([a, c], {...S, taxMode: 'floor', invoiceTaxMode: 'monthly'});
  assert.equal(m.invoice.subtotal, 26693 + 22898);
  assert.equal(m.invoice.tax, Math.floor((26693 + 22898) * 0.1));
  assert.equal(m.invoice.total, m.invoice.subtotal + m.invoice.tax);
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

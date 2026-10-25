// 売上見込み（salesPlan.ts）：住宅改修は見積書の金額、特定福祉用具は特定福祉用具のアプリのまとめ。値はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateTotals} from '../../src/sasaoka/calc.ts';
import {jutakuSalesMonth, monthPlan, planRows, readTokuteiSales, TOKUTEI_SALES_KEY} from '../../src/sasaoka/salesPlan.ts';
import type {Job, Row} from '../../src/sasaoka/types.ts';

const S = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateOverheadRate: 0.1, taxRate: 0.1, tokuteiSalesMonths: {} as Record<string, string>};
const blank = {code: '', maker: '', unit: '', listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
const mat = (listPrice: number): Row => ({...blank, id: `r${listPrice}`, kind: 'material', refId: null, name: '見本の手すり', price: 0, listPrice, qty: 1});
const job = (id: string, rows: Row[], extra: Partial<Job> = {}): Job => ({
  id, month: '2026-10', customer: `見本${id}`, suffix: '様邸', staff: '見本 太郎', date: '', address: '', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null, shikiri: true,
  places: [{id: 'p', name: '玄関', rows, kind: 1, photo: 0}], createdAt: 0, updatedAt: 0, ...extra,
});
const summary = (rows: object[]) => JSON.stringify({v: 1, updatedAt: 5, rows});

test('住宅改修：見積書のある様邸だけ。税抜＝小計＋諸経費、税込＝合計。月は売上見込みの月（なければ請求する月）', () => {
  const a = job('A', [mat(30000)]);
  const b = job('B', [mat(20000)], {salesMonth: '2026-11'});
  const none = job('C', []);
  const rows = planRows([a, b, none], S, []);
  assert.deepEqual(rows.map((r) => [r.kind, r.id, r.month]), [['jutaku', 'A', '2026-10'], ['jutaku', 'B', '2026-11']]);
  const t = estimateTotals(a, S).all;
  assert.deepEqual([rows[0].amount, rows[0].tax, rows[0].total], [t.subtotal + t.overhead, t.tax, t.total]);
  assert.equal(rows[0].name, '見本A様邸');
  assert.equal(jutakuSalesMonth({month: '2026-10', salesMonth: 'あ'}), '2026-10');
});

test('特定福祉用具：まとめを読む（こわれていれば空）。次月に回した月はこのアプリの設定。住宅改修の様邸から作った案件はその様邸を開く', () => {
  assert.equal(TOKUTEI_SALES_KEY, 'taiyo-tokutei-sales-v1');
  assert.deepEqual(readTokuteiSales('{'), {rows: [], updatedAt: 0});
  assert.deepEqual(readTokuteiSales(null).rows, []);
  const t = readTokuteiSales(summary([
    {id: 's1', customer: '見本 花子', jutakuJob: 'A', staff: '', status: '承認', month: '2026-10', amount: 39040, tax: 3904, total: 42944},
    {id: 's2', customer: '', jutakuJob: '', staff: '', status: '見積', month: '2026-10', amount: 1000, tax: 100, total: 1100},
    {id: '', month: '2026-10'},
    {id: 's3', month: 'こわれた'},
  ]));
  assert.deepEqual(t.rows.map((r) => r.id), ['s1', 's2']);
  const rows = planRows([job('A', [mat(30000)])], {...S, tokuteiSalesMonths: {s2: '2026-11'}}, t.rows);
  const toku = rows.filter((r) => r.kind === 'tokutei');
  assert.deepEqual(toku.map((r) => [r.name, r.month, r.jobId, r.status]), [['見本 花子様', '2026-10', 'A', '承認'], ['（お客様名未入力）様', '2026-11', '', '見積']]);
  const oct = monthPlan(rows, '2026-10');
  assert.equal(oct.jutaku.length, 1);
  assert.equal(oct.tokutei.length, 1);
  assert.equal(oct.tokuteiSum.total, 42944);
  assert.equal(oct.all.total, oct.jutakuSum.total + 42944);
  assert.equal(oct.all.amount, oct.jutakuSum.amount + 39040);
  assert.equal(monthPlan(rows, '2026-11').tokuteiSum.total, 1100);
});

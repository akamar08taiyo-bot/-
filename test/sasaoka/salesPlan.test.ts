// 売上見込み（salesPlan.ts）：住宅改修は見積書の金額、特定福祉用具は特定福祉用具のアプリのまとめ。値はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateTotals} from '../../src/sasaoka/calc.ts';
import {JUTAKU_SALES_KEY, jutakuSalesMonth, jutakuSalesSummary, monthPlan, planRows, readTokuteiSales, rowSalesMonth, shiftSalesMonth, TOKUTEI_SALES_KEY, writeJutakuSalesSummary} from '../../src/sasaoka/salesPlan.ts';
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

test('受注残・進捗管理に渡すまとめ（taiyo-jutaku-sales-v1）：見積書のある様邸だけ。金額は売上見込みと同じ、事業所名は理由書の作成者の事業所、営業所は設定', () => {
  const a = job('A', [mat(30000)], {staff: '見本 次郎', salesMonth: '2026-11', shinsei: {reasonOffice: ' 見本地域包括支援センター ', reasonName: '見本 三郎'} as Job['shinsei']});
  const none = job('C', []);
  const sum = jutakuSalesSummary([a, none], {...S, officeName: '行橋営業所'}, 7);
  assert.equal(sum.updatedAt, 7);
  const t = estimateTotals(a, S).all;
  assert.deepEqual(sum.rows, [{id: 'A', customer: '見本A', staff: '見本 次郎', careOffice: '見本地域包括支援センター', careManager: '見本 三郎', month: '2026-11', amount: t.subtotal + t.overhead, tax: t.tax, total: t.total, office: '行橋営業所'}]);
  // 理由書の作成者がなければ事業所名は空
  assert.equal(jutakuSalesSummary([job('B', [mat(10000)])], {...S, officeName: '行橋営業所'}).rows[0].careOffice, '');
  // 書く（仕切・利益は入れない）
  const store = new Map<string, string>();
  writeJutakuSalesSummary([a], {...S, officeName: '行橋営業所'}, {setItem: (k, v) => void store.set(k, v)});
  assert.equal(JUTAKU_SALES_KEY, 'taiyo-jutaku-sales-v1');
  assert.equal(JSON.parse(store.get(JUTAKU_SALES_KEY) ?? '{}').rows.length, 1);
  assert.ok(!/price|cost|profit|shikiri/i.test(store.get(JUTAKU_SALES_KEY) ?? ''));
});

test('一覧の売上月（ユーザーの指示「何月分かっていうのを簡単に切り替えができるように一覧表の中で…受注残に飛ばすときにも、その月の該当の月の受注残に含める」2026-10-26）', () => {
  const toku = (id: string, jutakuJob: string, month: string) => ({id, customer: '見本', jutakuJob, staff: '', status: '見積', month, amount: 1000, tax: 100, total: 1100});
  const tokutei = [toku('s1', 'A', '2026-10'), toku('s2', 'B', '2026-12'), toku('s3', '', '2026-10')];
  const a = job('A', [mat(30000)]); // 住宅改修の見積書と特定福祉用具の案件
  const b = job('B', []); // 特定福祉用具だけ
  const c = job('C', [], {salesMonth: '2026-11'}); // 申請書だけ
  // 住宅改修の見積書があれば様邸の売上見込みの月。特定福祉用具だけの様邸はその案件の月（このアプリで変えた月があればそちら）
  assert.equal(rowSalesMonth(a, tokutei, S), '2026-10');
  assert.equal(rowSalesMonth(b, tokutei, S), '2026-12');
  assert.equal(rowSalesMonth(b, tokutei, {tokuteiSalesMonths: {s2: '2027-01'}}), '2027-01');
  assert.equal(rowSalesMonth(c, tokutei, S), '2026-11');
  // ずらす：様邸の月（一覧・請求する月）と売上見込みの月をそろえ、この様邸の特定福祉用具の案件も同じ月に（ほかの様邸の案件は動かさない）
  const r = shiftSalesMonth(a, tokutei, S, 1, 9);
  assert.deepEqual([r.job.month, r.job.salesMonth, r.job.updatedAt], ['2026-11', '2026-11', 9]);
  assert.deepEqual(r.tokuteiMonths, {s1: '2026-11'});
  assert.deepEqual(shiftSalesMonth(b, tokutei, S, -1).tokuteiMonths, {s2: '2026-11'});
  assert.equal(shiftSalesMonth(b, tokutei, S, -1).job.month, '2026-11');
  assert.equal(shiftSalesMonth(c, tokutei, S, 1).job.month, '2026-12'); // 売上見込みの月から
  assert.equal(shiftSalesMonth(job('D', [], {month: '2026-12'}), [], S, 1).job.month, '2027-01');
  // 受注残に渡すまとめ：住宅改修の月はずらした月、特定福祉用具はこのアプリで変えた月（tokuteiMonths）
  const sum = jutakuSalesSummary([r.job], {...S, officeName: '行橋営業所', tokuteiSalesMonths: {s1: '2026-11', x: 'こわれた'}});
  assert.equal(sum.rows[0].month, '2026-11');
  assert.deepEqual(sum.tokuteiMonths, {s1: '2026-11'});
});

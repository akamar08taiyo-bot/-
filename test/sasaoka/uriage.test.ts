// 売上伝票発行依頼書へ渡す内容（src/sasaoka/uriage.ts）。住宅改修は「住宅改修工事」の1行（見積書の合計と、工務店に払う仕切り）。
// ユーザーと決めたこと（2026-10-27）：置き場所は工事見積書のタブの上の段・明細は1行・生活保護にチェックしたら自己負担は出さない。値・名前はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateTotals, jobTotals} from '../../src/sasaoka/calc.ts';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {cleanJobs} from '../../src/sasaoka/storage.ts';
import type {Job, Row} from '../../src/sasaoka/types.ts';
import {HOUSING_LIMIT, slipCareLevel, uriageAmounts, uriageMissing, uriageRequest} from '../../src/sasaoka/uriage.ts';

const s = {...defaultSettings(), clientName: '見本工務店', staffList: ['見本 太郎']};
const blank = {code: '', maker: '', unit: '', listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
const mat = (listPrice: number, price: number, extra: Partial<Row> = {}): Row => ({...blank, id: `r${listPrice}`, kind: 'material', refId: null, name: '見本の手すり', price, listPrice, qty: 1, ...extra});
const job = (rows: Row[], extra: Partial<Job> = {}): Job => ({
  id: 'j', month: '2026-11', customer: '見本 花子', suffix: '様邸', staff: '見本 太郎', date: '', address: '福岡県行橋市見本1-2-3', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null, shikiri: true,
  places: [{id: 'p', name: '玄関', rows, kind: 1, photo: 0}], createdAt: 0, updatedAt: 0,
  shinsei: {...NO_SHINSEI, care: '要介護1', burden: '1', reasonOffice: '見本居宅介護支援事業所', reasonName: '例題 一郎'},
  ...extra,
});
const choice = {customerType: 'existing' as const, billing: 'receipt' as const, issueDate: '2026-11-05'};

test('介護度は売上伝票の書き方に', () => {
  assert.equal(slipCareLevel('要介護1'), '介護１');
  assert.equal(slipCareLevel('要支援2'), '支援２');
  assert.equal(slipCareLevel(''), '');
});

test('明細は「住宅改修工事」の1行：見積書の合計（税込）と、仕切り計算表の合計（工務店に払う額・税込）', () => {
  const j = job([mat(50000, 30000)]);
  const r = uriageRequest(j, s, choice, 7000);
  assert.equal(r.kind, 'taiyo-uriage-request');
  assert.equal(r.createdAt, 7000);
  const sales = r.sales as Record<string, unknown>;
  assert.deepEqual(sales.items, [{amount: estimateTotals(j, s).all.total, cost: jobTotals(j, s).total, productName: '住宅改修工事', color: ''}]);
  assert.equal(sales.serviceType, 'housing');
  assert.equal(sales.contractor, '見本工務店');
  assert.equal(sales.officeName, '見本居宅介護支援事業所');
  assert.equal(sales.careManager, '例題 一郎');
  assert.equal(sales.careLevel, '介護１');
  assert.equal(sales.userRatio, 0.1);
  assert.equal(sales.customerType, 'existing');
  assert.equal(sales.billingType, 'receipt');
  assert.equal(sales.issueDate, '2026-11-05');
  assert.equal('remaining' in sales, false); // 対象外がなく、20万円以内
  assert.equal(sales.welfare, false);
});

test('介護保険の対象外の工事・20万円を超える分は、売上伝票の残高に対象（20万円まで）を入れて実費にする', () => {
  const part = job([mat(50000, 30000), {...mat(20000, 12000, {excluded: true}), id: 'x'}]);
  const a = uriageAmounts(part, s);
  assert.ok(a.target < a.total);
  assert.equal((uriageRequest(part, s, choice).sales as Record<string, unknown>).remaining, a.target);
  const big = job([mat(300000, 200000)]);
  assert.equal((uriageRequest(big, s, choice).sales as Record<string, unknown>).remaining, HOUSING_LIMIT);
});

test('足りないもの：窓で入れるもの（負担割合・介護度・新規／既存・施工日）と見積書で入れるもの', () => {
  const j = job([], {staff: '', shinsei: {...NO_SHINSEI}});
  const m = uriageMissing(j, s, {customerType: null, billing: 'receipt', issueDate: ''});
  assert.deepEqual(m.fix, ['負担割合', '介護度', '新規・既存', '施工日']);
  assert.deepEqual(m.elsewhere, ['担当', '見積書の金額']);
  assert.deepEqual(uriageMissing(job([mat(50000, 30000)]), s, choice), {fix: [], elsewhere: []});
});

test('生活保護・償還払い・2割を渡す', () => {
  const j = job([mat(50000, 30000)], {shinsei: {...NO_SHINSEI, care: '要支援2', burden: '2', welfare: true}});
  const sales = uriageRequest(j, s, {...choice, billing: 'reimbursement'}).sales as Record<string, unknown>;
  assert.deepEqual([sales.welfare, sales.billingType, sales.userRatio, sales.careLevel], [true, 'reimbursement', 0.2, '支援２']);
});

test('窓で選んだ顧客区分・請求区分は読み込みで残し、知らない値は捨てる', () => {
  const [a, b] = cleanJobs([
    {...job([]), uriage: {customer: 'existing', billing: 'reimbursement'}},
    {...job([]), id: 'k', uriage: {customer: 'x', billing: 1}},
  ]);
  assert.deepEqual(a.uriage, {customer: 'existing', billing: 'reimbursement'});
  assert.deepEqual(b.uriage, {});
});

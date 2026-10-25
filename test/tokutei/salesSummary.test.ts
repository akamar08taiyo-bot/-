// 売上見込みに渡す金額のまとめ（salesSummary.ts）。値はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {saleTotals} from '../../src/tokutei/calc.ts';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {blankItem, newSale} from '../../src/tokutei/sales.ts';
import {SALES_SUMMARY_KEY, salesMonthOf, salesSummary, writeSalesSummary} from '../../src/tokutei/salesSummary.ts';

const S = defaultSettings();

test('売上の月：納品日 → 承認日 → 申請日 → 見積日 の月', () => {
  const base = {deliveryDate: '', approveDate: '', applyDate: '', estimateDate: '', createdAt: new Date(2026, 9, 3).getTime()};
  assert.equal(salesMonthOf(base), '2026-10');
  assert.equal(salesMonthOf({...base, estimateDate: '2026-09-28'}), '2026-09');
  assert.equal(salesMonthOf({...base, estimateDate: '2026-09-28', applyDate: '2026-10-02'}), '2026-10');
  assert.equal(salesMonthOf({...base, estimateDate: '2026-09-28', approveDate: '2026-10-20', deliveryDate: '2026-11-05'}), '2026-11');
});

test('まとめ：商品のある案件だけ。金額は見積書と同じ（税抜・税込・お客様のお支払い）。仕切・利益は入れない', () => {
  const a = {...newSale([], S, 'yukuhashi'), id: 'a', customer: ' 見本 花子 ', estimateDate: '2026-10-25', items: [{...blankItem(S), name: '見本の台', listPrice: 35000, cost: 21000}, {...blankItem(S), name: '見本の杖', listPrice: 13800}]};
  const empty = {...newSale([], S, 'yukuhashi'), id: 'b', customer: '見本 空子'};
  const back = {...a, id: 'c', payMethod: '償還払い' as const};
  const sum = salesSummary([a, empty, back], S, 123);
  assert.equal(sum.updatedAt, 123);
  assert.deepEqual(sum.rows.map((r) => r.id), ['a', 'c']);
  const t = saleTotals(a, S);
  const r = sum.rows[0];
  assert.deepEqual([r.customer, r.month, r.amount, r.tax, r.total, r.userPay], ['見本 花子', '2026-10', t.amount, t.tax, t.total, t.userPay]);
  assert.equal(t.total, 42944);
  assert.equal(sum.rows[1].userPay, t.total); // 償還払いは全額いったんお支払い
  assert.ok(!/cost|profit|21000/.test(JSON.stringify(sum)));
  const store = new Map<string, string>();
  writeSalesSummary([a], S, {setItem: (k, v) => void store.set(k, v)});
  assert.equal(JSON.parse(store.get(SALES_SUMMARY_KEY) ?? '{}').rows.length, 1);
  assert.equal(SALES_SUMMARY_KEY, 'taiyo-tokutei-sales-v1');
});

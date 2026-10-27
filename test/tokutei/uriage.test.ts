// 売上伝票発行依頼書へ渡す内容（src/tokutei/uriage.ts）と、負担割合が未選択のときに割合で決まる金額を出さないこと
// （ユーザーと決めたこと 2026-10-27：「見積書のタブの上の段」「負担割合を選ぶまで自己負担額は出さない」「生活保護にチェックしたら自己負担は出さない」）。
// お客様・担当者は架空の名前。
import assert from 'node:assert/strict';
import test from 'node:test';
import {saleTotals} from '../../src/tokutei/calc.ts';
import {insuranceLines} from '../../src/tokutei/estimateBook.ts';
import {newSale} from '../../src/tokutei/sales.ts';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {shinseiChecks, shinseiValues} from '../../src/tokutei/shinsei.ts';
import {cleanSales} from '../../src/tokutei/storage.ts';
import {slipCareLevel, slipCategories, uriageMissing, uriageRequest} from '../../src/tokutei/uriage.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';

const settings = defaultSettings();

function item(over: Partial<SaleItem>): SaleItem {
  return {id: 'i', productId: null, name: '見本の商品', maker: '', code: '', tais: '', category: '', sub: '', unit: '台', supplier: '', taxType: '10%', listPrice: 0, cost: 0, qty: 1, discountRate: 20, unitPrice: null, reason: '', ...over};
}

function filled(over: Partial<Sale> = {}): Sale {
  return {
    ...newSale([], settings, 'yukuhashi', 1000),
    customer: '見本 花子',
    address: '福岡県行橋市見本1-2-3',
    careOffice: '見本居宅介護支援事業所',
    careManager: '例題 一郎',
    staff: '見本 太郎',
    careLevel: '要介護2',
    burdenRatio: 2,
    deliveryDate: '2026-10-30',
    items: [
      item({id: 'a', name: '見本シャワーチェア 両ひじ掛け', category: '入浴補助用具', sub: '入浴用いす', listPrice: 30000}),
      item({id: 'b', name: '見本浴槽台', category: '入浴補助用具', sub: '浴槽内いす', listPrice: 15091}),
    ],
    ...over,
  };
}

test('新しい案件の負担割合は未選択。前の版のデータ（1〜3）はそのまま、null は未選択のまま読む', () => {
  assert.equal(newSale([], settings, 'yukuhashi').burdenRatio, null);
  const [a, b, c] = cleanSales([{id: 'a', burdenRatio: 2}, {id: 'b', burdenRatio: null}, {id: 'c'}]);
  assert.deepEqual([a.burdenRatio, b.burdenRatio, c.burdenRatio], [2, null, 1]);
});

test('負担割合が未選択なら、見積書・申請書（委任状）に割合で決まる金額を出さない', () => {
  const sale = filled({burdenRatio: null});
  const t = saleTotals(sale, settings);
  assert.equal(t.ratioSet, false);
  const lines = insuranceLines(sale, t);
  assert.ok(lines.some((l) => l.startsWith('介護保険の対象')));
  assert.ok(!lines.some((l) => /利用者負担|保険者負担|介護扶助/.test(l)), lines.join('/'));
  assert.equal(shinseiValues(sale, settings).benefit, 0); // 委任状の保険給付額は空欄
  assert.ok(shinseiChecks(sale, settings).missing.includes('負担割合'));
  // 選んだら出る
  const chosen = filled({burdenRatio: 1});
  assert.ok(insuranceLines(chosen, saleTotals(chosen, settings)).some((l) => l.startsWith('利用者負担（1割）')));
  assert.ok(!shinseiChecks(chosen, settings).missing.includes('負担割合'));
});

test('介護度・種目を売上伝票の書き方に', () => {
  assert.equal(slipCareLevel('要介護2'), '介護２');
  assert.equal(slipCareLevel('要支援1'), '支援１');
  assert.equal(slipCareLevel(''), '');
  const sale = filled();
  sale.items.push(item({id: 'c', name: '見本 多点杖', category: '歩行補助つえ', sub: '多点杖'}), item({id: 'd', name: '見本 浴室内すのこ', category: '入浴補助用具', sub: '浴室内すのこ'}));
  assert.deepEqual(slipCategories(sale), ['シャワーチェア', '浴槽台', '歩行補助杖']);
});

test('足りないもの：窓で入れるもの（負担割合・介護度・新規／既存・納品日）と見積書で入れるもの', () => {
  const sale = filled({burdenRatio: null, careLevel: '', staff: ''});
  const m = uriageMissing(sale, saleTotals(sale, settings), {customerType: null, issueDate: ''});
  assert.deepEqual(m.fix, ['負担割合', '介護度', '新規・既存', '納品日']);
  assert.deepEqual(m.elsewhere, ['担当']);
  const ok = filled();
  assert.deepEqual(uriageMissing(ok, saleTotals(ok, settings), {customerType: 'new', issueDate: '2026-10-30'}), {fix: [], elsewhere: []});
});

test('売上伝票に渡す内容：金額は見積書と同じ（税込・商品ごと）、負担割合は 0.1〜0.3、生活保護も', () => {
  const sale = filled();
  const t = saleTotals(sale, settings);
  const r = uriageRequest(sale, settings, {customerType: 'existing', issueDate: '2026-10-30'}, 5000);
  assert.equal(r.kind, 'taiyo-uriage-request');
  assert.equal(r.createdAt, 5000);
  const s = r.sales as Record<string, unknown> & {items: {amount: number}[]};
  assert.equal(s.serviceType, 'specific');
  assert.equal(s.customerName, '見本 花子');
  assert.equal(s.officeName, '見本居宅介護支援事業所');
  assert.equal(s.careManager, '例題 一郎');
  assert.equal(s.staff, '見本 太郎');
  assert.equal(s.customerType, 'existing');
  assert.equal(s.billingType, 'receipt');
  assert.equal(s.careLevel, '介護２');
  assert.equal(s.userRatio, 0.2);
  assert.deepEqual(s.items.map((i) => i.amount), t.lines.map((l) => l.total));
  assert.equal(s.items.reduce((n, i) => n + i.amount, 0), t.total);
  assert.equal('remaining' in s, false); // 今年度の残りが空欄・限度額を超えない
  assert.deepEqual(s.categories, ['シャワーチェア', '浴槽台']);
  assert.equal(s.welfare, false);
  // 売上伝票の計算（利用者負担＝対象×割合の切り上げ）が見積書と同じになる
  assert.equal(Math.ceil((t.total * 2) / 10), t.userBurden);
  // 償還払い・生活保護・今年度の残り
  const w = uriageRequest(filled({payMethod: '償還払い', welfare: true, remaining: 30000}), settings, {customerType: 'new', issueDate: '2026-10-30'}).sales;
  assert.deepEqual([w.billingType, w.welfare, w.remaining], ['reimbursement', true, 30000]);
});

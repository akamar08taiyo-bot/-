import assert from 'node:assert/strict';
import test from 'node:test';
import {docLabel} from '../../src/tokutei/category.ts';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {pastReasons, reasonExamples} from '../../src/tokutei/reasons.ts';
import {customerKey, customerPatch, frequentValues, newSale, pastCustomers, sameYearSales} from '../../src/tokutei/sales.ts';
import type {Sale} from '../../src/tokutei/types.ts';
import {ageOn, fiscalYearOf, parseDateText, warekiLabel, warekiOf} from '../../src/tokutei/wareki.ts';
import {addressOfZip, zipCandidates, zipLabel} from '../../src/tokutei/zip.ts';

// 入力を1回にするための「連動」の部品（ユーザーの指示「入力できるところ、連動できる部分は徹底的に分析し、無駄を省けるようにする」）

test('生年月日は和暦でも西暦でも、区切りがなくても読める', () => {
  for (const t of ['S31.6.10', 's31/6/10', '昭31.6.10', '昭和31年6月10日', '昭和31年6月10日生', 'Ｓ３１．６．１０', '1956/6/10', '1956-06-10', '1956年6月10日', '19560610', 'S310610']) {
    assert.equal(parseDateText(t), '1956-06-10', t);
  }
  assert.equal(parseDateText('昭和元年12月26日'), '1926-12-26');
  assert.equal(parseDateText('T15.12.24'), '1926-12-24');
  assert.equal(parseDateText('昭和64年1月7日'), '1989-01-07');
  assert.equal(parseDateText('昭和64年1月8日'), null); // その日は平成元年
  assert.equal(parseDateText('S31.2.30'), null); // ない日
  assert.equal(parseDateText('あいう'), null);
});

test('和暦の書き方・年齢・年度', () => {
  assert.deepEqual(warekiOf('1956-06-10'), {era: '昭和', short: '昭', y: 31, m: 6, d: 10});
  assert.equal(warekiLabel('1926-12-25'), '昭和元年12月25日');
  assert.equal(warekiLabel('2026-10-22'), '令和8年10月22日');
  assert.equal(warekiOf('1912-07-29')?.era, '明治');
  assert.equal(ageOn('1956-06-10', '2026-06-09'), 69);
  assert.equal(ageOn('1956-06-10', '2026-06-10'), 70);
  assert.equal(fiscalYearOf('2027-03-31'), 2026);
  assert.equal(fiscalYearOf('2027-04-01'), 2027);
});

test('住所から郵便番号（福岡県）。大字・郡は省いて書いてもよい', () => {
  assert.deepEqual(zipCandidates('行橋市大字流末1327番地'), [{zip: '824-0043', label: '行橋市流末'}]);
  assert.deepEqual(zipCandidates('福岡県行橋市流末1327'), [{zip: '824-0043', label: '行橋市流末'}]);
  assert.equal(zipCandidates('苅田町富久町1丁目')[0]?.zip.slice(0, 3), '800');
  assert.equal(zipCandidates('京都郡みやこ町豊津1000')[0]?.zip, '824-0121');
  assert.equal(zipCandidates('みやこ町犀川上伊良原1234番地5')[0]?.zip, '824-0252');
  // 町域が分からなければ市区町村の番号
  assert.deepEqual(zipCandidates('行橋市どこか1-2'), [{zip: '824-0000', label: '行橋市'}]);
  assert.deepEqual(zipCandidates('東京都千代田区1-1'), []);
  assert.equal(addressOfZip('8240043'), '行橋市流末');
  assert.equal(addressOfZip('824-0043'), '行橋市流末');
  assert.equal(addressOfZip('1000001'), '');
  assert.equal(zipLabel('８２４００４３'), '824-0043');
});

test('書類の種目：腰掛便座の長い細目はふだんの呼び名', () => {
  assert.equal(docLabel('腰掛便座', '移動できる便器（ポータブルトイレ）'), '腰掛便座（ポータブルトイレ）');
  assert.equal(docLabel('腰掛便座', '洋式便器の高さを補うもの'), '腰掛便座（補高便座）');
  assert.equal(docLabel('入浴補助用具', '入浴用いす'), '入浴補助用具（入浴用いす）');
});

const S = defaultSettings();
function sale(over: Partial<Sale>): Sale {
  return {...newSale([], S, 'yukuhashi'), ...over};
}

test('前のお客様から入れる：同じ方は1つ（被保険者番号は0を足してそろえる）・商品と日付は写さない', () => {
  const a1 = sale({id: 'a1', customer: '見本 花子', insuredNo: '1234567', updatedAt: 1, careManager: '見本 太郎'});
  const a2 = sale({id: 'a2', customer: '見本 花子', insuredNo: '0001234567', updatedAt: 3, careManager: '見本 次郎'});
  const b = sale({id: 'b', customer: '見本 一郎', updatedAt: 2, birthDate: '1940-01-01'});
  const cur = sale({id: 'c', updatedAt: 9});
  assert.equal(customerKey(a1), customerKey(a2));
  assert.deepEqual(
    pastCustomers([a1, a2, b, cur], cur).map((x) => x.id),
    ['a2', 'b'],
  );
  const patch = customerPatch(a2);
  assert.equal(patch.careManager, '見本 次郎');
  assert.equal('items' in patch || 'applyDate' in patch || 'quoteNo' in patch, false);
});

test('今年度の残り：同じ方・同じ年度・申請した案件だけ', () => {
  const base = {customer: '見本 花子', insuredNo: '1234567'};
  const done = sale({...base, id: 'd', status: '集金', deliveryDate: '2026-05-01'});
  const quote = sale({...base, id: 'q', status: '見積', estimateDate: '2026-06-01'});
  const lastYear = sale({...base, id: 'l', status: '集金', deliveryDate: '2026-03-31'});
  const other = sale({customer: '見本 一郎', id: 'o', status: '集金', deliveryDate: '2026-05-01'});
  const cur = sale({...base, id: 'c', estimateDate: '2026-10-22'});
  assert.deepEqual(
    sameYearSales([done, quote, lastYear, other, cur], cur).map((x) => x.id),
    ['d'],
  );
});

test('よく使う値・前に書いた理由', () => {
  const list = [
    sale({id: '1', careOffice: 'A居宅', careManager: '甲'}),
    sale({id: '2', careOffice: 'A居宅', careManager: '乙'}),
    sale({id: '3', careOffice: 'B居宅', careManager: '丙'}),
  ];
  assert.deepEqual(frequentValues(list, (x) => x.careOffice), ['A居宅', 'B居宅']);
  assert.deepEqual(frequentValues(list, (x) => x.careManager, (x) => x.careOffice === 'A居宅'), ['甲', '乙']);
  assert.ok(reasonExamples('入浴補助用具', '入浴用いす')[0].includes('入浴用いす'));
  assert.ok(reasonExamples('歩行器', '').length > 0);
  const withReason = sale({id: 'r', updatedAt: 5, items: [{...newItem(), category: '入浴補助用具', sub: '入浴用いす', reason: '自分で書いた理由'}]});
  assert.deepEqual(pastReasons([withReason], '入浴補助用具', '入浴用いす'), ['自分で書いた理由']);
  assert.deepEqual(pastReasons([withReason], '入浴補助用具', '入浴用いす', 'r'), []);
});

function newItem() {
  return {id: 'i', productId: null, name: 'x', maker: '', code: '', tais: '', category: '', sub: '', unit: '台', supplier: '', taxType: '10%' as const, listPrice: 0, cost: 0, qty: 1, discountRate: 20, unitPrice: null, reason: ''};
}

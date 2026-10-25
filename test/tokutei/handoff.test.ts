import assert from 'node:assert/strict';
import test from 'node:test';
import {saleTotals} from '../../src/tokutei/calc.ts';
import {benefitSplit, HACCHU_IMPORT_KEY, HACCHU_PATH, hacchuImport} from '../../src/tokutei/handoff.ts';
import type {Sale, SaleItem, TaxType} from '../../src/tokutei/types.ts';

const S = {markupRate: 25, limit: 100000, minProfitRate: 20};

function item(over: Partial<SaleItem> = {}): SaleItem {
  return {
    id: 'i',
    productId: null,
    name: '商品',
    maker: '',
    code: '',
    tais: '',
    category: '',
    sub: '',
    unit: '台',
    supplier: '',
    taxType: '10%',
    listPrice: 0,
    cost: 0,
    qty: 1,
    discountRate: 20,
    unitPrice: null,
    reason: '',
    ...over,
  };
}

function sale(items: SaleItem[], over: Partial<Sale> = {}): Sale {
  return {
    id: 's',
    customer: '',
    kana: '',
    insuredNo: '',
    birthDate: '',
    gender: '',
    zip: '',
    address: '',
    tel: '',
    careLevel: '',
    insurer: 'yukuhashi',
    insurerName: '',
    burdenRatio: 1,
    payMethod: '受領委任払い',
    remaining: null,
    perItem: false,
    welfare: false,
    staff: '',
    careOffice: '',
    careManager: '',
    carePlan: '',
    quoteNo: '',
    estimateDate: '',
    applyDate: '',
    approveDate: '',
    deliveryDate: '',
    claimDate: '',
    collectDate: '',
    status: '見積',
    note: '',
    items,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

// 定価15,800円（課税）×0.8＝12,640円＋税1,264円＝13,904円 が2つ。1割の利用者負担は 27,808円の1割の切り上げ 2,781円
// （ページごとに切り上げると 1,391＋1,391＝2,782円 になる）
const two = () => [
  item({id: 'a', name: 'シャワーチェア 見本A', maker: '見本メーカー', code: 'A-100', supplier: 'ケアマックス', listPrice: 15800, cost: 9480}),
  item({id: 'b', name: '浴槽台 見本B', maker: '見本メーカー', code: 'B-200', supplier: 'ウェルファン', listPrice: 15800, cost: 9480, unit: ''}),
];

test('販売受注簿へ渡す内容：受注区分「給付」の1点1ページ分（お客様・担当・商品・見積書と同じ金額）', () => {
  assert.equal(HACCHU_IMPORT_KEY, 'taiyo-hacchu-import-v1');
  assert.equal(HACCHU_PATH, '/taiyo-hacchu-scan/');
  const s = sale(two(), {customer: '見本 花子 ', kana: 'ミホン ハナコ', address: '福岡県行橋市中央1-1', tel: '0930-00-0000', staff: '久保 匠史', deliveryDate: '2026-11-05'});
  const h = hacchuImport(s, S, 1792540000000);
  assert.deepEqual(
    {...h, items: undefined},
    {
      kind: 'taiyo-tokutei-order',
      v: 1,
      createdAt: 1792540000000,
      title: '見本 花子様 特定福祉用具',
      customerName: '見本 花子',
      furigana: 'ミホン ハナコ',
      address: '福岡県行橋市中央1-1',
      tel: '0930-00-0000',
      sales: '久保',
      deliveryDate: '2026-11-05',
      burdenRatio: 1,
      welfare: false,
      items: undefined,
    },
  );
  assert.deepEqual(h.items[0], {
    id: 'a', // 見積書の商品の id（販売見積書の中の受注簿のページとつなぐ）
    productName: 'シャワーチェア 見本A',
    maker: '見本メーカー',
    modelNumber: 'A-100',
    supplier: 'ケアマックス',
    quantity: 1,
    unit: '台',
    listPrice: 15800,
    cost: 9480,
    taxType: '10%',
    discountRate: 20,
    saleUnitPrice: 12640,
    totalTaxIn: 13904,
    careInsuranceBalance: 100000,
    benefit: {target: 13904, userBurden: 1391, aid: 0, insurerBurden: 12513},
    note: '',
  });
  assert.deepEqual(
    [h.items[1].unit, h.items[1].supplier, h.items[1].careInsuranceBalance, h.items[1].benefit],
    ['台', 'ウェルファン', 86096, {target: 13904, userBurden: 1390, aid: 0, insurerBurden: 12514}],
  );
  // 合計は見積書と同じ
  const t = saleTotals(s, S);
  assert.deepEqual([t.total, t.userBurden, t.insurerBurden], [27808, 2781, 25027]);
  assert.equal(h.items.reduce((n, i) => n + i.benefit.userBurden, 0), t.userBurden);
  assert.equal(h.items.reduce((n, i) => n + i.benefit.insurerBurden, 0), t.insurerBurden);
  // 名前がなければ「特定福祉用具」だけ。担当がいなければ空（受注簿の初めの値のまま）
  assert.deepEqual([hacchuImport(sale(two()), S).title, hacchuImport(sale(two()), S).sales], ['特定福祉用具', '']);
});

test('今年度の残りを超えるとき：前の商品から順に残りを使い、超えた分は備考に（残りがない商品は全額自己負担）', () => {
  const part = hacchuImport(sale(two(), {remaining: 20000}), S);
  assert.deepEqual(
    part.items.map((i) => [i.careInsuranceBalance, i.benefit.target, i.benefit.userBurden, i.benefit.insurerBurden, i.note]),
    [
      [20000, 13904, 1391, 12513, ''],
      [6096, 6096, 609, 5487, '限度額を超えた分 7,808円は全額自己負担'],
    ],
  );
  const t = saleTotals(sale(two(), {remaining: 20000}), S);
  assert.deepEqual([t.covered, t.userBurden, t.insurerBurden, t.excess], [20000, 2000, 18000, 7808]);
  const none = hacchuImport(sale(two(), {remaining: 10000}), S);
  assert.deepEqual(
    none.items.map((i) => [i.careInsuranceBalance, i.benefit.target, i.benefit.userBurden, i.note]),
    [
      [10000, 10000, 1000, '限度額を超えた分 3,904円は全額自己負担'],
      [0, 0, 0, '限度額を超えるので全額自己負担'],
    ],
  );
});

test('生活保護・個別切り上げ（みやこ町）・3割', () => {
  const welfare = hacchuImport(sale(two(), {welfare: true}), S);
  assert.equal(welfare.welfare, true);
  assert.deepEqual(
    welfare.items.map((i) => [i.benefit.userBurden, i.benefit.aid, i.benefit.insurerBurden, i.note]),
    [
      [0, 1391, 12513, '生活保護（1割の 1,391円は介護扶助）'],
      [0, 1390, 12514, '生活保護（1割の 1,390円は介護扶助）'],
    ],
  );
  // 個別切り上げは商品ごとの切り上げがそのまま見積書の額（1,391＋1,391）
  const per = hacchuImport(sale(two(), {perItem: true}), S);
  assert.equal(saleTotals(sale(two(), {perItem: true}), S).userBurden, 2782);
  assert.deepEqual(per.items.map((i) => i.benefit.userBurden), [1391, 1391]);
  // 3割：90円 → 利用者 27円・保険者 63円（受注簿の小数の計算では 62円になるところ）
  const three = hacchuImport(sale([item({unitPrice: 90, taxType: '非課税'})], {burdenRatio: 3}), S);
  assert.deepEqual([three.burdenRatio, three.items[0].saleUnitPrice, three.items[0].benefit], [3, 90, {target: 90, userBurden: 27, aid: 0, insurerBurden: 63}]);
});

test('どんな見積もりでも、商品ごとの内訳を足すと見積書の金額になる（どの商品も切り捨て〜切り上げのあいだ）', () => {
  let seed = 20261022;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const taxes: TaxType[] = ['10%', '8%', '非課税'];
  for (let k = 0; k < 3000; k++) {
    const items = Array.from({length: 1 + rnd(5)}, (_, i) =>
      item({id: `i${i}`, listPrice: rnd(4) === 0 ? 0 : 1000 + rnd(60000), cost: rnd(30000), qty: 1 + rnd(3), taxType: taxes[rnd(3)], discountRate: rnd(5) === 0 ? 10 : 20}),
    );
    const s = sale(items, {
      burdenRatio: (1 + rnd(3)) as 1 | 2 | 3,
      remaining: rnd(3) === 0 ? rnd(120000) : null,
      perItem: rnd(2) === 0,
      welfare: rnd(6) === 0,
    });
    const t = saleTotals(s, S);
    const split = benefitSplit(t, s.welfare);
    const sum = (f: (b: (typeof split)[number]['benefit']) => number) => split.reduce((n, r) => n + f(r.benefit), 0);
    assert.equal(sum((b) => b.target), t.covered);
    assert.equal(sum((b) => b.userBurden), t.userBurden);
    assert.equal(sum((b) => b.aid), t.aid);
    assert.equal(sum((b) => b.insurerBurden), t.insurerBurden);
    split.forEach((r, i) => {
      const exact = ((t.perItemApplied ? t.lines[i].total : r.benefit.target) * t.ratio) / 10;
      const share = r.benefit.userBurden + r.benefit.aid;
      assert.ok(share >= Math.floor(exact) && share <= Math.ceil(exact), `${k}: ${share} は ${exact} の切り捨て〜切り上げのあいだにない`);
      assert.ok(r.benefit.insurerBurden >= 0 && r.benefit.target <= t.lines[i].total);
    });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {lineOf, priceNote, saleTotals, unitPriceOf} from '../../src/tokutei/calc.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';

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
    quoteNo: '',
    estimateDate: '',
    applyDate: '',
    approveDate: '',
    deliveryDate: '',
    collectDate: '',
    status: '見積',
    note: '',
    items,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

test('販売単価は定価の2割引き（1円未満切り捨て）', () => {
  assert.deepEqual(unitPriceOf(item({listPrice: 32000}), S), {price: 25600, basis: 'list'});
  assert.equal(unitPriceOf(item({listPrice: 13801}), S).price, 11040); // 11040.8 → 11040
  assert.equal(unitPriceOf(item({listPrice: 1234.5}), S).price, 987); // 987.6 → 987
  assert.equal(unitPriceOf(item({listPrice: 10000, discountRate: 15}), S).price, 8500);
});

test('定価がない商品は 仕切×1.25（販売受注簿の利益率25%と同じ）。手で入れた単価はそのまま', () => {
  assert.deepEqual(unitPriceOf(item({cost: 19200}), S), {price: 24000, basis: 'cost'});
  assert.deepEqual(unitPriceOf(item({listPrice: 32000, unitPrice: 25000}), S), {price: 25000, basis: 'manual'});
  assert.deepEqual(unitPriceOf(item(), S), {price: 0, basis: 'none'});
});

test('例1：シャワーチェア 定価32,000円・仕切19,200円・1割', () => {
  const t = saleTotals(sale([item({listPrice: 32000, cost: 19200})]), S);
  assert.equal(t.amount, 25600);
  assert.equal(t.tax, 2560);
  assert.equal(t.total, 28160);
  assert.equal(t.userBurden, 2816);
  assert.equal(t.insurerBurden, 25344);
  assert.equal(t.profit, 6400);
  assert.equal(t.lowProfit, false); // 6,400 ÷ 25,600 ＝ 25%
});

test('例2：浴槽台 13,800円＋浴槽手すり 15,800円・1割。個別切り上げ（みやこ町）は品目ごとに切り上げ', () => {
  const items = [item({id: 'a', listPrice: 13800}), item({id: 'b', listPrice: 15800})];
  const t = saleTotals(sale(items), S);
  assert.deepEqual(
    t.lines.map((l) => l.total),
    [12144, 13904],
  );
  assert.equal(t.total, 26048);
  assert.equal(t.userBurden, 2605);
  assert.equal(t.insurerBurden, 23443);
  const p = saleTotals(sale(items, {perItem: true}), S);
  assert.equal(p.perItemApplied, true);
  assert.equal(p.userBurden, 1215 + 1391);
  assert.equal(p.insurerBurden, 23442);
  assert.equal(p.userBurden + p.insurerBurden, p.total);
});

test('例3：150,000円・1割・残りが空欄 → 10万円として計算（保険者 90,000円・利用者 60,000円）', () => {
  const t = saleTotals(sale([item({unitPrice: 150000, taxType: '非課税'})]), S);
  assert.equal(t.total, 150000);
  assert.equal(t.remainingBlank, true);
  assert.equal(t.covered, 100000);
  assert.equal(t.insurerBurden, 90000);
  assert.equal(t.userBurden, 10000);
  assert.equal(t.excess, 50000);
  assert.equal(t.userPay, 60000);
  // 2割・3割なら保険者負担の上限は 80,000円・70,000円
  assert.equal(saleTotals(sale([item({unitPrice: 150000, taxType: '非課税'})], {burdenRatio: 2}), S).insurerBurden, 80000);
  assert.equal(saleTotals(sale([item({unitPrice: 150000, taxType: '非課税'})], {burdenRatio: 3}), S).insurerBurden, 70000);
});

test('残りが 0 なら全額自己負担。空欄と 0 は別', () => {
  const t = saleTotals(sale([item({listPrice: 32000})], {remaining: 0}), S);
  assert.equal(t.covered, 0);
  assert.equal(t.insurerBurden, 0);
  assert.equal(t.userPay, 28160);
  const r = saleTotals(sale([item({listPrice: 32000})], {remaining: 20000}), S);
  assert.equal(r.covered, 20000);
  assert.equal(r.userPay, 2000 + 8160);
});

test('例4：3割でも1円もずれない（小数をかけると 90円 → 62円になってしまう）', () => {
  for (let c = 1; c <= 30000; c++) {
    const t = saleTotals(sale([item({unitPrice: c, taxType: '非課税'})], {burdenRatio: 3}), S);
    assert.equal(t.userBurden, Math.ceil((c * 3) / 10));
    assert.equal(t.userBurden + t.insurerBurden, c, `対象 ${c}円`);
  }
  assert.equal(saleTotals(sale([item({unitPrice: 90, taxType: '非課税'})], {burdenRatio: 3}), S).insurerBurden, 63);
});

test('消費税は行ごとに切り捨て。8%・非課税の行も', () => {
  const t = saleTotals(sale([item({unitPrice: 1999}), item({unitPrice: 1999, taxType: '8%'}), item({unitPrice: 1999, taxType: '非課税'})]), S);
  assert.deepEqual(
    t.lines.map((l) => l.tax),
    [199, 159, 0],
  );
});

test('生活保護：利用者のお支払いは 0、負担割合の分は介護扶助', () => {
  const t = saleTotals(sale([item({listPrice: 32000})], {welfare: true}), S);
  assert.equal(t.userBurden, 0);
  assert.equal(t.aid, 2816);
  assert.equal(t.insurerBurden, 25344);
  assert.equal(t.userPay, 0);
});

test('利益率が20%より低いと知らせる', () => {
  assert.equal(saleTotals(sale([item({listPrice: 10000, cost: 7000})]), S).lowProfit, true); // 1,000 ÷ 8,000 ＝ 12.5%
  assert.equal(saleTotals(sale([item({listPrice: 10000, cost: 6000})]), S).lowProfit, false); // 2,000 ÷ 8,000 ＝ 25%
});

test('数量をかける・見積書の品目の下の行', () => {
  const l = lineOf(item({listPrice: 2100, qty: 2}), S);
  assert.equal(l.amount, 3360);
  assert.equal(priceNote(l), '定価2,100円（税抜）×0.8');
  assert.equal(priceNote(lineOf(item({listPrice: 2100, unitPrice: 1500}), S)), '定価2,100円（税抜）');
  assert.equal(priceNote(lineOf(item({cost: 1000}), S)), '');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {applyHacchu, itemFromHacchu, itemPatch} from '../../src/tokutei/hacchuLive.ts';
import {copySale} from '../../src/tokutei/sales.ts';
import {cleanSales} from '../../src/tokutei/storage.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';

// 販売見積書のページの中の販売受注簿（ユーザーの指示「販売見積書のページ内にある、販売受注簿に飛べるようにする…カタログから商品を自動認識」2026-10-23）。
// 受注簿から届いたもの（直した商品・足した商品・消した商品・受注簿の中身）を案件に入れる。名前は架空

const S = defaultSettings();

function item(over: Partial<SaleItem> = {}): SaleItem {
  return {id: 'i1', productId: 'p1', name: 'シャワーベンチ 見本A', maker: '見本化成', code: 'SB-01', tais: '', category: '入浴補助用具', sub: '入浴用いす', unit: '台', supplier: '', taxType: '10%', listPrice: 35000, cost: 21000, qty: 1, discountRate: 20, unitPrice: null, reason: '', ...over};
}

function sale(over: Partial<Sale> = {}): Sale {
  return cleanSales([{id: 's1', customer: '見本 花子', items: [item(), item({id: 'i2', name: '浴槽台 見本B', code: 'YD-02', listPrice: 13800, cost: 8280})], ...over}])[0];
}

test('受注簿で直した商品名・型番・数量・定価・仕切り・税区分を、見積書の商品に入れる（ほかの商品はそのまま）', () => {
  const v = sale();
  const next = applyHacchu(v, {type: 'taiyo-hacchu-item', saleId: 's1', id: 'i2', fields: {modelNumber: 'YD-02W', listPrice: '14800', cost: '8880', quantity: '2', taxType: '非課税', unit: '個'}}, S)!;
  assert.deepEqual([next.items[1].code, next.items[1].listPrice, next.items[1].cost, next.items[1].qty, next.items[1].taxType, next.items[1].unit], ['YD-02W', 14800, 8880, 2, '非課税', '個']);
  assert.deepEqual(next.items[0], v.items[0]);
  assert.ok(next.updatedAt >= v.updatedAt);
  // 金額の欄が空・数でなければ 0（価格がまだない）、数量は1以上の整数、知らない税区分は入れない
  const odd = itemPatch(item(), {listPrice: '', cost: 'abc', quantity: '0', taxType: '5%'});
  assert.deepEqual([odd.listPrice, odd.cost, odd.qty, odd.taxType], [0, 0, 1, '10%']);
  // 商品名だけ：種目が空なら商品名から推測する
  const named = itemPatch(item({category: '', sub: ''}), {productName: '  ポータブルトイレ 見本C '});
  assert.deepEqual([named.name, named.category], ['ポータブルトイレ 見本C', '腰掛便座']);
});

test('受注簿でカタログから読み取って足した商品は、見積書の商品にも足す（同じ商品は2つにしない）', () => {
  const v = sale();
  const msg = {type: 'taiyo-hacchu-add', saleId: 's1', item: {id: 'hmk1abc', productName: '入浴台 見本D', maker: '見本工業', modelNumber: 'ND-5', quantity: '1', unit: '台', listPrice: '20000', cost: '12000', taxType: '10%', supplier: '介援隊', catalogNumber: '123'}};
  const next = applyHacchu(v, msg, S)!;
  assert.equal(next.items.length, 3);
  const added = next.items[2];
  assert.deepEqual(
    [added.id, added.productId, added.name, added.maker, added.code, added.listPrice, added.cost, added.supplier, added.category, added.discountRate, added.unitPrice],
    ['hmk1abc', null, '入浴台 見本D', '見本工業', 'ND-5', 20000, 12000, '介援隊', '入浴補助用具', S.discountRate, null],
  );
  assert.equal(applyHacchu(next, msg, S), null);
  // 受注簿が付けた形でない id は入れない
  assert.equal(applyHacchu(v, {...msg, item: {...msg.item, id: 'i1'}}, S), null);
});

test('受注簿で消したページの商品は、見積書からも消す。受注簿の中身はそのまま保存する。ほかの案件・知らない形は無視する', () => {
  const v = sale();
  assert.deepEqual(applyHacchu(v, {type: 'taiyo-hacchu-remove', saleId: 's1', id: 'i1'}, S)!.items.map((i) => i.id), ['i2']);
  assert.equal(applyHacchu(v, {type: 'taiyo-hacchu-remove', saleId: 's1', id: 'nope'}, S), null);
  const state = {v: 1, pages: [{productName: 'シャワーベンチ 見本A', salesOrderNumber: 'J-001'}], pageIndex: 0, sync: {}};
  assert.deepEqual(applyHacchu(v, {type: 'taiyo-hacchu-state', saleId: 's1', state}, S)!.hacchu, state);
  assert.equal(applyHacchu(v, {type: 'taiyo-hacchu-state', saleId: 'other', state}, S), null);
  assert.equal(applyHacchu(v, {type: 'taiyo-hacchu-state', saleId: 's1', state: 'x'}, S), null);
  assert.equal(applyHacchu(v, {type: 'taiyo-hacchu-item', saleId: 's1', id: 'nope', fields: {}}, S), null);
  assert.equal(applyHacchu(v, {type: 'other', saleId: 's1'}, S), null);
  assert.equal(applyHacchu(v, null, S), null);
  assert.equal(itemFromHacchu({id: 'h'}, S), null);
});

test('受注簿の中身は読み込みで残す。複製した案件には写さない（受注番号などは別の受注）', () => {
  const state = {v: 1, pages: [{salesOrderNumber: 'J-001'}]};
  const v = sale({hacchu: state});
  assert.deepEqual(v.hacchu, state);
  assert.equal(sale({hacchu: 'x' as unknown as Record<string, unknown>}).hacchu, undefined);
  const c = copySale(v, [v]);
  assert.equal(c.hacchu, undefined);
  assert.equal('hacchu' in c, false);
});

// 見積もりの入れる所の候補と知らせ（sales.ts）。値はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_MAKERS, defaultSettings} from '../../src/tokutei/defaults.ts';
import {addFavorites, blankItem, makerChoices, makerKey, newSale, saleWarnings, unregisteredItems} from '../../src/tokutei/sales.ts';

const S = defaultSettings();

test('メーカー名の候補：はじめにパナソニックエイジフリー（株）・アロン化成（株）、そのあとに商品マスタ・見積もりで使ったメーカー（多い順・書き方ちがいは1つ）', () => {
  assert.deepEqual(DEFAULT_MAKERS, ['パナソニックエイジフリー（株）', 'アロン化成（株）']);
  assert.deepEqual(makerChoices([], []), DEFAULT_MAKERS); // 何もなくても、はじめの2つは出す
  const products = [{maker: 'アロン化成'}, {maker: 'パナソニック エイジフリー株式会社'}, {maker: '見本工業'}, {maker: '見本工業（株）'}, {maker: '見本精工'}, {maker: ''}];
  const sales = [{items: [{...blankItem(S), maker: '見本精工'}, {...blankItem(S), maker: '見本精工'}]}];
  // 「アロン化成」「パナソニック エイジフリー株式会社」ははじめの2つと同じ。見本精工（3回）→ 見本工業（2回・はじめに出てきた書き方）
  assert.deepEqual(makerChoices(products, sales), [...DEFAULT_MAKERS, '見本精工', '見本工業']);
  assert.equal(makerKey('アロン化成（株）'), makerKey('アロン化成 株式会社'));
  assert.equal(makerKey('㈱見本'), makerKey('(株)見本'));
});

test('知らせ：仕切は任意なので、仕切がない商品は知らせない（ユーザーの指示「仕切りは（任意）」）。価格・種目がない商品は知らせる', () => {
  const sale = {...newSale([], S, 'yukuhashi'), items: [{...blankItem(S), name: '見本の台', listPrice: 30000, category: '入浴補助用具', cost: 0}]};
  assert.deepEqual(saleWarnings(sale), []);
  const none = {...sale, items: [{...blankItem(S), name: '見本の杖', listPrice: 0, cost: 0}]};
  assert.deepEqual(saleWarnings(none), ['種目が決まっていない商品：見本の杖', '価格が入っていない商品：見本の杖']);
});

test('手で入れた商品をお気に入りに：まだ商品マスタにない手入れの商品だけ（ユーザーの指示「商品名や金額を一度入力したら、お気に入り登録として追加できるようにする」）', () => {
  const sale = {
    items: [
      {...blankItem(S), id: 'a', name: '見本の杖', maker: '見本工業（株）', listPrice: 9000, category: '歩行補助つえ'},
      {...blankItem(S), id: 'b', name: '  '}, // 商品名なし
      {...blankItem(S), id: 'c', name: '見本の台', maker: '見本精工'}, // 同じ名前・メーカーが商品マスタにある
      {...blankItem(S), id: 'd', name: 'マスタの商品', productId: 'p1'},
    ],
  };
  const products = [{maker: '見本精工 株式会社', name: '見本の台'}];
  assert.deepEqual(unregisteredItems(sale, products).map((i) => i.id), ['a']);
  const master = products.map((x) => ({...x, id: 'm', code: '', tais: '', jan: '', category: '', sub: '', categoryByHand: false, listPrice: 0, cost: 0, taxType: '10%' as const, unit: '台', supplier: '', favorite: false, useCount: 0, lastUsedAt: 0, source: '', updatedAt: 0}));
  const r = addFavorites(master, sale.items, new Set(['a']), 1000);
  assert.equal(r.products.length, 2);
  const p = r.products[1];
  assert.deepEqual([p.name, p.maker, p.listPrice, p.category, p.favorite, p.categoryByHand, p.source], ['見本の杖', '見本工業（株）', 9000, '歩行補助つえ', true, true, '手入力']);
  assert.equal(r.items[0].productId, p.id); // 明細は登録した商品につなぐ
  assert.deepEqual(r.items.slice(1), sale.items.slice(1));
  assert.deepEqual(unregisteredItems({items: r.items}, r.products), []);
});

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

// 一度入れた商品はお気に入りに（ユーザーの指示「一度入力した商品は、今後お気に入りの中に、項目ごとにいれる（シャワーチェアや浴槽台等）当然削除する事もできる」2026-11-03）
test('一度入れた商品をお気に入りに：明細はつながず・同じ商品名とメーカーは1つ・削除したあとはカタログから選び直したときだけ★に戻す', async () => {
  const {rememberFavorites} = await import('../../src/tokutei/sales.ts');
  const item = (over) => ({...blankItem(S), name: '見本の台 ブルー', maker: '見本工業（株）', category: '入浴補助用具', sub: '浴槽台', listPrice: 20000, ...over});
  const a = item({id: 'a'});
  let products = rememberFavorites([], [a, item({id: 'b', name: ' '}), item({id: 'c', productId: 'p9'})], false, 1000);
  assert.equal(products.length, 1); // 名前のない明細・商品マスタの商品は入れない
  assert.deepEqual([products[0].name, products[0].maker, products[0].sub, products[0].favorite], ['見本の台 ブルー', '見本工業（株）', '浴槽台', true]);
  // 同じ商品名・メーカー（書き方ちがい・空白ちがい）はもう1つ作らない
  products = rememberFavorites(products, [item({id: 'd', name: '見本の台　ブルー', maker: '見本工業 株式会社'})], false, 2000);
  assert.equal(products.length, 1);
  // お気に入りから削除したもの：手で打った明細を覚え直しても★に戻さない、カタログから選び直したら戻す
  products = products.map((p) => ({...p, favorite: false}));
  assert.equal(rememberFavorites(products, [a], false, 3000)[0].favorite, false);
  assert.equal(rememberFavorites(products, [a], true, 3000)[0].favorite, true);
  // 品目のない商品は、入れた明細の品目で埋める
  const bare = products.map((p) => ({...p, category: '', sub: ''}));
  assert.deepEqual(['category', 'sub'].map((k) => rememberFavorites(bare, [a], false, 4000)[0][k]), ['入浴補助用具', '浴槽台']);
});

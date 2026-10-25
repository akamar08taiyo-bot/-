// 見積もりの入れる所の候補と知らせ（sales.ts）。値はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_MAKERS, defaultSettings} from '../../src/tokutei/defaults.ts';
import {blankItem, makerChoices, makerKey, newSale, saleWarnings} from '../../src/tokutei/sales.ts';

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

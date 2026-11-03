// 「🔢 型番から入力」の照らし合わせ（codeLookup.ts）。値はすべて架空
// ユーザーの指示「型番から商品をひっぱってくるのは、絶対に検索をまちがってもらっては困るので、確実に該当商品に当たるかを照らし合わせる」2026-11-03
import assert from 'node:assert/strict';
import test from 'node:test';
import {codeMatchKey, findByCode} from '../../src/tokutei/codeLookup.ts';

const variant = (code, label = '', orderCode = '') => ({code, label, tais: '', listPrice: 10000, orderCode});
const product = (key, name, maker, variants, page = 40) => ({key, page, name, maker, category: '入浴補助用具', sub: '浴槽台', insured: true, note: '', taxFree: false, variants});
const catalog = [
  product('p40-1', '見本の浴槽台', '見本工業（株）', [variant('MH-1234A', 'ブルー', '261-S0001'), variant('MH-1234B', 'ピンク', '261-S0002')]),
  product('p41-1', '見本の浴槽台 ワイド', '見本工業（株）', [variant('MH-12345A', 'ブルー')], 41),
  product('p42-1', '見本の台', '見本精工（株）', [variant('XX-100')], 42),
  product('p43-1', '見本の椅子', '見本化成（株）', [variant('XX-100')], 43),
];
const item = {category: '', sub: '', maker: ''};

test('型番の比べ方：全角・半角、大文字・小文字、空白とハイフンだけ同じとみなす', () => {
  assert.equal(codeMatchKey('ｍｈ－１２３４ａ'), 'MH1234A');
  assert.equal(codeMatchKey(' mh 1234a '), 'MH1234A');
  assert.equal(codeMatchKey('MH‐1234A'), 'MH1234A');
});

test('型番がぴったり同じ商品だけ：前方一致・部分一致はしない／注文番号でも当たる／同じ型番の別の商品は2つとも出す', () => {
  const one = findByCode('mh-1234a', catalog, [], item);
  assert.equal(one.length, 1);
  assert.deepEqual([one[0].patch.name, one[0].patch.code, one[0].patch.maker], ['見本の浴槽台 ブルー', 'MH-1234A', '見本工業（株）']);
  assert.match(one[0].label, /p\.40/); // 照らし合わせられるよう、カタログのページも出す
  assert.deepEqual(findByCode('MH-1234', catalog, [], item), []); // MH-1234A・MH-12345A の頭だけ → 入れない
  assert.deepEqual(findByCode('1234A', catalog, [], item), []);
  assert.deepEqual(findByCode('MH', catalog, [], item), []); // 短すぎる
  assert.deepEqual(findByCode('261-S0002', catalog, [], item).map((h) => h.patch.code), ['MH-1234B']);
  assert.deepEqual(findByCode('XX-100', catalog, [], item).map((h) => h.patch.name).sort(), ['見本の台', '見本の椅子']);
});

test('商品マスタの品番も見る（マスタが先）。同じ商品名・メーカーはカタログと重ねない', () => {
  const master = [{id: 'm1', name: '見本の浴槽台 ブルー', maker: '見本工業（株）', code: 'MH-1234A', tais: '', jan: '', category: '入浴補助用具', sub: '浴槽台', categoryByHand: false, listPrice: 9800, cost: 0, taxType: '10%' as const, unit: '台', supplier: '', favorite: true, useCount: 0, lastUsedAt: 0, source: '', updatedAt: 0}];
  const hits = findByCode('MH-1234A', catalog, master, item);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].key, 'm:m1');
  assert.equal(hits[0].patch.listPrice, 9800);
});

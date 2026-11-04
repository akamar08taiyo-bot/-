// メーカーのカタログ（makerCatalogs.ts。矢崎化工・TOTO）：品番の合わせ方・部材の載っているページ・探す。部材は架空の名前・金額
import assert from 'node:assert/strict';
import test from 'node:test';
import {bookOf, catalogMaterials, catalogPageOf, catalogSearch, codeKey} from '../../src/sasaoka/makerCatalogs.ts';
import type {Material} from '../../src/sasaoka/types.ts';

const mat = (code: string, name = '見本の部材', maker = '矢崎化工'): Material => ({id: code, name, price: 100, listPrice: 200, pieceLengthM: 0, maker, code, unit: '', favorite: false, updatedAt: 1});
const yazaki = bookOf('yazaki');
const toto = bookOf('toto');
const yazakiPages = yazaki.pages;
const yazakiPageOf = (m: Material) => {
  const r = catalogPageOf(m);
  return r && {page: r.page, code: r.code};
};
const yazakiSearch = (q: string, ms: Material[]) => catalogSearch(yazaki, q, ms);

test('品番は空白・ハイフン・全角半角・大文字小文字のちがいを見ない', () => {
  assert.equal(codeKey('ECA-5032 USL'), 'ECA5032USL');
  assert.equal(codeKey('ｅｃａ－５０３２usl'), 'ECA5032USL');
  assert.equal(yazaki.isMaker('矢崎化工（株）'), true);
  assert.equal(yazaki.isMaker('マツ六'), false);
  assert.equal(toto.isMaker('ＴＯＴＯ'), true);
  assert.equal(yazaki.image(13), '../jutaku-mitsumori/catalog/yazaki-p013.jpg');
  assert.equal(toto.image(12), '../jutaku-mitsumori/catalog/toto-p012.jpg');
  assert.equal(codeKey('YHB203 #NW1'), 'YHB203#NW1'); // TOTO の色の「#」は残す
});

test('カタログの品番に合う部材：同じ品番があればそれだけ。色の記号のない品番は、頭が同じ部材（色を選ぶ）', () => {
  const list = [mat('ECA-5032 USL'), mat('ECA-5032USL2'), mat('ECL-5049 USL'), mat('ECL-5049 SGD'), mat('ECL-50490 USL')];
  assert.deepEqual(catalogMaterials(list, 'ECA-5032 USL').map((m) => m.code), ['ECA-5032 USL']);
  // 色の記号のない品番：ECL-5049 の色ちがい（ECL-50490 は別の品番）
  assert.deepEqual(catalogMaterials(list, 'ECL-5049').map((m) => m.code), ['ECL-5049 USL', 'ECL-5049 SGD']);
  assert.deepEqual(catalogMaterials(list, 'HCT-2000 T USL'), []);
});

test('カタログのページ：p.12〜81 の 70 ページ。どのページの品番も位置が 0〜1 の間', () => {
  assert.equal(yazakiPages.length, 70);
  assert.deepEqual([yazakiPages[0].page, yazakiPages.at(-1)!.page], [12, 81]);
  const codes = yazakiPages.flatMap((p) => p.codes);
  assert.ok(codes.length >= 300, String(codes.length));
  for (const c of codes) {
    assert.match(c.code, /^[A-Z]{1,5}\d{0,2}-[0-9A-Z]{1,6}(-[0-9A-Z]{1,3})?( [A-Z0-9]{1,4})*$/, c.code);
    for (const v of [c.x, c.y, c.x + c.w, c.y + c.h]) assert.ok(v >= 0 && v <= 1, `${c.code} ${v}`);
  }
  // 表紙の品番の例（見本で目で見て確かめたもの）
  const on = (page: number) => yazakiPages.find((p) => p.page === page)!.codes.map((c) => c.code);
  assert.ok(on(13).includes('ECA-5029 USL'));
  assert.ok(on(79).includes('CFA-1A W'));
  assert.ok(on(80).includes('CFA-1B W'));
});

test('部材の載っているページ・品番や商品名で探す', () => {
  assert.deepEqual(yazakiPageOf(mat('ECA-5029 USL')), {page: 13, code: 'ECA-5029 USL'});
  assert.equal(yazakiPageOf(mat('XX-0000 W')), null);
  assert.ok(yazakiSearch('cfa-1a', []).includes(79));
  // 部材リストの商品名からも（品番の載っているページ）
  assert.ok(yazakiSearch('はね上げ見本', [mat('CFA-1A W', '可動式手すり はね上げ見本')]).includes(79));
  assert.equal(yazakiSearch('', []).length, 70);
});

test('TOTO：カタログの品番（#のうしろは色）に合う部材は、同じ品番と色ちがい（同じ品番がいちばん前）', () => {
  const t = (code: string) => mat(code, '見本の手すり', 'TOTO');
  const list = [t('YHB203#EL'), t('YHB203#NW1'), t('YHB203#MW'), t('YHB2030#NW1'), t('YHBS203FR#MW'), t('T110D3R')];
  assert.deepEqual(catalogMaterials(list, 'YHB203#NW1', toto).map((m) => m.code), ['YHB203#NW1', 'YHB203#EL', 'YHB203#MW']);
  assert.deepEqual(catalogMaterials(list, 'YHBS203FR#MW', toto).map((m) => m.code), ['YHBS203FR#MW']); // 1つだけならそれを入れる
  assert.deepEqual(catalogMaterials(list, 'T110D3R', toto).map((m) => m.code), ['T110D3R']);
  assert.deepEqual(catalogMaterials(list, 'TS139J', toto), []);
  // 部材の載っているページ（ほかの色の部材でも、# の前が同じ品番のページ）
  assert.deepEqual(catalogPageOf(t('YHB203#EL')), {book: 'toto', page: 12, code: 'YHB203#NW1'});
  assert.equal(catalogPageOf({code: 'YHB203#EL', maker: 'マツ六'}), null); // メーカーがちがえば出さない
  assert.ok(catalogSearch(toto, 'yhb203', []).includes(12));
});

test('TOTO のカタログ：74 ページ。品番の形・位置が 0〜1 の間・金額の字はない', () => {
  assert.equal(toto.pages.length, 74);
  const codes = toto.pages.flatMap((p) => p.codes);
  assert.ok(codes.length >= 1000, String(codes.length));
  for (const c of codes) {
    assert.match(c.code, /^[A-Z]{1,6}\d{1,5}[A-Z0-9]{0,10}(-[A-Z0-9]{1,6})*(#[A-Z0-9]{1,6})?$/, c.code);
    for (const v of [c.x, c.y, c.x + c.w, c.y + c.h]) assert.ok(v >= 0 && v <= 1.001, `${c.code} ${v}`);
  }
  // p.12（ハンドグリップ）の見本（目で見て確かめたもの）
  const on = (page: number) => toto.pages.find((p) => p.page === page)!.codes.map((c) => c.code);
  assert.deepEqual(['YHB203#NW1', 'YHBS203FBR#EL', 'YHBS203FR#MW'].filter((c) => on(12).includes(c)).length, 3);
});

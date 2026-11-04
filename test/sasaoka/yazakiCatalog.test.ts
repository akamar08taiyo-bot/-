// 矢崎化工カタログ（yazakiCatalog.ts）：品番の合わせ方・部材の載っているページ・探す。部材は架空の名前・金額
import assert from 'node:assert/strict';
import test from 'node:test';
import {catalogMaterials, codeKey, isYazaki, yazakiImage, yazakiPageOf, yazakiPages, yazakiSearch} from '../../src/sasaoka/yazakiCatalog.ts';
import type {Material} from '../../src/sasaoka/types.ts';

const mat = (code: string, name = '見本の部材'): Material => ({id: code, name, price: 100, listPrice: 200, pieceLengthM: 0, maker: '矢崎化工', code, unit: '', favorite: false, updatedAt: 1});

test('品番は空白・ハイフン・全角半角・大文字小文字のちがいを見ない', () => {
  assert.equal(codeKey('ECA-5032 USL'), 'ECA5032USL');
  assert.equal(codeKey('ｅｃａ－５０３２usl'), 'ECA5032USL');
  assert.equal(isYazaki({maker: '矢崎化工（株）'}), true);
  assert.equal(isYazaki({maker: 'マツ六'}), false);
  assert.equal(yazakiImage(13), '../jutaku-mitsumori/catalog/yazaki-p013.jpg');
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

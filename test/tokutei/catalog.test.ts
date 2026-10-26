// 介援隊のカタログの印刷（catalog.ts）：初めからチェックするページ（品番・細目・メーカー・商品名）と、カタログの PDF から品番を読めること。
// 商品は架空の見本（品番だけはカタログの PDF にあるもの）
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import test from 'node:test';
import {CATALOG, catalogPicks, catalogTitle, codeKey, pageCodes} from '../../src/tokutei/catalog.ts';

const item = (o: Partial<{name: string; maker: string; code: string; sub: string}>) => ({name: '', maker: '', code: '', sub: '', ...o});
const page = (n: number) => CATALOG.findIndex((p) => p.page === n);
const picks = (...items: ReturnType<typeof item>[]) => [...catalogPicks(items)].map((i) => CATALOG[i].page).sort((a, b) => a - b);

test('細目・メーカー・商品名で選ぶ（品番が見つからないとき）', () => {
  assert.deepEqual(picks(item({name: '見本の浴槽手すり', sub: '浴槽用手すり'})), [45]);
  assert.deepEqual(picks(item({name: '見本のバスボード'})), [45]); // 細目が空なら商品名から（category.ts）
  assert.deepEqual(picks(item({name: '見本のシャワーキャリー', sub: '入浴用いす'})), [50]);
  assert.deepEqual(picks(item({name: '見本のシャワーチェア', sub: '入浴用いす'})), []); // シャワーチェアのページはまだない
  assert.deepEqual(picks(item({name: '見本のすべり止めマット'})), [47]);
  // ポータブルトイレはメーカーで分ける。メーカーが空なら両方、ほかのメーカーならなし
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', maker: 'パナソニック', sub: '移動できる便器（ポータブルトイレ）'})), [177]);
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', maker: 'アロン化成', sub: '移動できる便器（ポータブルトイレ）'})), [173]);
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', sub: '移動できる便器（ポータブルトイレ）'})), [173, 177]);
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', maker: '見本工業', sub: '移動できる便器（ポータブルトイレ）'})), []);
  assert.deepEqual(picks(item({name: '見本の段差スロープ'})), []);
  assert.deepEqual(picks(), []);
});

test('品番がカタログのページにあれば、そのページだけ（全角・ハイフンのちがいは同じ）', () => {
  const codes = CATALOG.map(() => new Set<string>());
  codes[page(177)] = pageCodes('PN-L30205B 35,000 261-T0819');
  assert.equal(codeKey('ＰＮ－Ｌ30205ｂ'), 'PNL30205B');
  const it = item({name: '見本の家具調トイレ', maker: '見本工業', code: 'ＰＮ－Ｌ30205ｂ', sub: '移動できる便器（ポータブルトイレ）'});
  assert.deepEqual([...catalogPicks([it], codes)], [page(177)]);
  // 申込番号でも
  assert.deepEqual([...catalogPicks([item({code: '261-T0819'})], codes)], [page(177)]);
  // 短い品番・金額の数字は見くらべに使わない
  assert.deepEqual([...pageCodes('130 35,000 ¥35,000 各 535-458')], ['535458']);
  assert.deepEqual([...catalogPicks([item({code: '130'})], [new Set(['130'])])], []);
});

test('印刷の画面の題（PDF に保存するときの名前の元）', () => {
  assert.equal(catalogTitle({customer: '見本\u3000花子'}), '見本 花子様 カタログ');
  assert.equal(catalogTitle({customer: ''}), 'カタログ');
});

test('カタログの PDF：ファイルがあり、品番を読める（pdf.js）', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const expect: Record<number, string[]> = {45: ['PN-L12211D', '261-S0840'], 47: ['261-S0145'], 50: ['261-S1119'], 173: ['261-T1287'], 177: ['PN-L30205B', '261-T0819']};
  for (const p of CATALOG) {
    const file = new URL(`../../public-tokutei/catalog/${p.file}`, import.meta.url);
    assert.ok(existsSync(file), p.file);
    const task = pdfjs.getDocument({data: new Uint8Array(readFileSync(file)), verbosity: 0});
    const doc = await task.promise;
    assert.equal(doc.numPages, 1, p.file);
    const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
    const codes = pageCodes(text);
    for (const c of expect[p.page]) assert.ok(codes.has(codeKey(c)), `${p.file} に ${c}`);
    await task.destroy();
  }
});

// カタログの PDF（public-tokutei/catalog/）から商品の一覧を作る（catalogItems.ts）。
// 金額はリポジトリに書かない（ユーザーの指示「リポジトリに仕入れや定価は残さない」）ので、金額は「ある・同じ・ちがう・増える」だけを確かめる
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {CATALOG} from '../../src/tokutei/catalog.ts';
import {appMaker, catalogInCategory, catalogItemPatch, catalogMakers, parseCatalogPage, sameMaker} from '../../src/tokutei/catalogItems.ts';
import type {CatalogProduct, PdfText} from '../../src/tokutei/catalogItems.ts';

const root = new URL('../../node_modules/pdfjs-dist/', import.meta.url).pathname;

async function itemsOf(file: string): Promise<PdfText[]> {
  const pdfjs = await import(`${root}legacy/build/pdf.mjs`);
  const data = new Uint8Array(readFileSync(new URL(`../../public-tokutei/catalog/${file}`, import.meta.url)));
  const task = pdfjs.getDocument({data, cMapUrl: `${root}cmaps/`, cMapPacked: true, verbosity: 0});
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({scale: 1});
  const tc = await page.getTextContent();
  const out = tc.items.flatMap((i: {str?: string; transform: number[]; width: number}) => ('str' in i ? [{s: i.str!, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: Math.abs(i.transform[3])}] : []));
  await task.destroy();
  return out;
}

const pages = new Map<number, CatalogProduct[]>();
async function productsOf(no: number): Promise<CatalogProduct[]> {
  if (!pages.has(no)) {
    const p = CATALOG.find((c) => c.page === no)!;
    pages.set(no, parseCatalogPage(await itemsOf(p.file), p));
  }
  return pages.get(no)!;
}

test('カタログの全部のページから商品が読める：どの品番にも品番・注文番号・定価（税抜）がある', async () => {
  let products = 0;
  let variants = 0;
  for (const c of CATALOG) {
    const list = await productsOf(c.page);
    assert.ok(list.length > 0, `p.${c.page}`);
    products += list.length;
    for (const p of list) {
      assert.ok(p.name, `p.${c.page}`);
      for (const v of p.variants) {
        variants += 1;
        assert.ok(v.code, `p.${c.page} ${p.name}`);
        assert.match(v.orderCode, /^\d{3}-[A-Z]\d{4}$/, `p.${c.page} ${p.name}`);
        assert.ok(v.listPrice > 0, `p.${c.page} ${p.name} ${v.code}`);
      }
    }
  }
  assert.ok(products >= 90, String(products));
  assert.ok(variants >= 500, String(variants));
});

test('パナソニックのシャワーチェア（p.40）：11の商品・色ごとの品番（写真の横の色）・メーカー・細目', async () => {
  const list = await productsOf(40);
  assert.equal(list.length, 11);
  for (const p of list) {
    assert.equal(p.maker, 'パナソニックエイジフリー（株）');
    assert.deepEqual([p.category, p.sub], ['入浴補助用具', '入浴用いす']);
  }
  const first = list[0];
  assert.equal(first.name, 'シャワーチェアAir コンパクトSPワンタッチ');
  assert.deepEqual(
    first.variants.map((v) => [v.code, v.label, v.orderCode]),
    [
      ['PN-L41431D', 'オレンジ', '261-S1063'],
      ['PN-L41431A', 'ブルー', '261-S1063'],
      ['PN-L41431BR', 'モカブラウン', '261-S1063'],
    ],
  );
  assert.equal(new Set(first.variants.map((v) => v.listPrice)).size, 1); // 「各¥」は色ちがいで同じ金額
  // 選ぶと商品の欄に入る値
  const patch = catalogItemPatch(first, first.variants[1], {category: '入浴補助用具', sub: '入浴用いす', maker: ''});
  assert.deepEqual([patch.name, patch.maker, patch.code, patch.unitPrice], ['シャワーチェアAir コンパクトSPワンタッチ ブルー', 'パナソニックエイジフリー（株）', 'PN-L41431A', null]);
  assert.equal(patch.listPrice, first.variants[1].listPrice);
});

test('1つの金額は、たてに並んだ品番のまとまりのまん中（安寿 ステンレス製浴槽台R：10cm の2行とそれより高い8行で金額がちがう）。2行の大きさ「12～15cm」', async () => {
  const p = (await productsOf(44))[0];
  assert.equal(p.name, '安寿 ステンレス製浴槽台R すべり止めシートタイプ');
  assert.equal(p.maker, 'アロン化成（株）');
  assert.deepEqual(
    p.variants.map((v) => [v.code, v.label]).slice(0, 4),
    [
      ['536-440', '10cm レッド'],
      ['536-441', '10cm ブルー'],
      ['536-442', '12～15cm レッド'],
      ['536-443', '12～15cm ブルー'],
    ],
  );
  const prices = p.variants.map((v) => v.listPrice);
  assert.equal(prices[0], prices[1]);
  assert.ok(prices.slice(2).every((x) => x === prices[2]));
  assert.ok(prices[2] > prices[0]);
});

test('1つの囲みに左右2つの表（安寿 軽量浴槽台 すべり止めシート／ソフトクッション）・1行に並べた品番（「、」で区切った色）・2行の型番（UST-／130R）', async () => {
  const list = await productsOf(44);
  const light = list.find((p) => p.variants.some((v) => v.code === '536-588'))!;
  const sheet = light.variants.find((v) => v.code === '536-588')!;
  const soft = light.variants.find((v) => v.code === '536-594')!;
  assert.equal(sheet.label, 'すべり止めシートタイプ ジャスト8-12 レッド');
  assert.equal(sheet.orderCode, '261-S0983');
  assert.equal(soft.orderCode, '261-S0984');
  assert.ok(soft.listPrice > sheet.listPrice);
  const grip = list.find((p) => p.variants.some((v) => v.code === '536-616'))!;
  assert.deepEqual(
    grip.variants.map((v) => v.label),
    ['UST-130R レッド', 'UST-130R ブルー', 'UST-130R グリーン'],
  );
  const mat = (await productsOf(47)).find((p) => p.variants.some((v) => v.code === '535-242'))!;
  assert.deepEqual(
    mat.variants.slice(0, 3).map((v) => v.label),
    ['レッド 小', 'ブルー 小', 'グリーン 小'],
  );
  const bench = (await productsOf(37)).find((p) => p.variants.length === 6)!;
  assert.deepEqual(
    bench.variants.map((v) => [v.orderCode, v.label.split(' ')[0]]),
    [
      ['261-S0793', 'FS'],
      ['261-S0793', 'FS'],
      ['261-S0793', 'FS'],
      ['261-S0797', 'FU'],
      ['261-S0797', 'FU'],
      ['261-S0797', 'FU'],
    ],
  );
});

test('段差解消スロープ（p.214）：品番ごとの TAIS コードと金額（高さが上がるほど高い）。（税抜¥…）が金額の右上にあっても、税込＝税抜×1.1 の組で読む', async () => {
  const slope = (await productsOf(214))[0];
  assert.equal(slope.name, 'ダンスロープミニ');
  assert.equal(slope.maker, '（株）ダンロップホームプロダクツ');
  assert.equal(slope.category, '固定用スロープ');
  assert.equal(slope.variants[0].label, 'R-7610M 奥行4.1×高さ1.0cm');
  assert.ok(slope.variants.every((v) => /^\d{5}-\d{6}$/.test(v.tais)));
  const prices = slope.variants.map((v) => v.listPrice);
  assert.equal(prices[0], prices[1]); // 「各¥」の2行
  for (let i = 2; i < prices.length; i++) assert.ok(prices[i] > prices[i - 1], `${i}`);
});

test('種目・メーカーで絞る：シャワーチェア（入浴用いす）でパナソニックを選ぶと、パナソニックのシャワーチェアだけ', async () => {
  const all: CatalogProduct[] = [];
  for (const c of CATALOG) all.push(...(await productsOf(c.page)));
  const chairs = catalogInCategory(all, '入浴補助用具', '入浴用いす');
  assert.deepEqual(catalogMakers(chairs).slice(0, 2), ['アロン化成（株）', 'パナソニックエイジフリー（株）']);
  const pana = chairs.filter((p) => sameMaker(p.maker, 'パナソニックエイジフリー（株）'));
  assert.equal(pana.length, 11);
  assert.ok(pana.every((p) => p.page === 40));
  assert.ok(sameMaker('パナソニック', 'パナソニックエイジフリー(株)'));
  assert.ok(!sameMaker('アロン化成（株）', 'パナソニックエイジフリー（株）'));
  assert.equal(appMaker('安寿'), 'アロン化成（株）');
  // 腰掛便座のポータブルトイレは、安寿とパナソニックのページから
  const toilets = catalogInCategory(all, '腰掛便座', '移動できる便器（ポータブルトイレ）');
  assert.ok(toilets.some((p) => p.page === 172) && toilets.some((p) => p.page === 177));
  assert.deepEqual(catalogInCategory(all, '', ''), []);
});

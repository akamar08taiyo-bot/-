// カタログの PDF（public-tokutei/catalog/）から商品の一覧を作る（catalogItems.ts）。
// 金額はリポジトリに書かない（ユーザーの指示「リポジトリに仕入れや定価は残さない」）ので、金額は「ある・同じ・ちがう・増える」だけを確かめる
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {CATALOG} from '../../src/tokutei/catalog.ts';
import {appMaker, catalogCandidates, catalogFilter, catalogInCategory, catalogItemPatch, catalogMakers, catalogPagesOf, isKaientaiOrder, looseKey, parseCatalogPage, sameMaker} from '../../src/tokutei/catalogItems.ts';
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
  assert.equal(pana.length, 24); // p.40 の 11 と p.41（おりたたみ）の 13
  assert.deepEqual([...new Set(pana.map((p) => p.page))], [40, 41]);
  assert.ok(sameMaker('パナソニック', 'パナソニックエイジフリー(株)'));
  assert.ok(!sameMaker('アロン化成（株）', 'パナソニックエイジフリー（株）'));
  assert.equal(appMaker('安寿'), 'アロン化成（株）');
  // 腰掛便座のポータブルトイレは、安寿とパナソニックのページから
  const toilets = catalogInCategory(all, '腰掛便座', '移動できる便器（ポータブルトイレ）');
  assert.ok(toilets.some((p) => p.page === 172) && toilets.some((p) => p.page === 177));
  assert.deepEqual(catalogInCategory(all, '', ''), []);
});

test('カタログの「介・購入」の印：p.50 のシャワーキャリーは全部シャワーチェア（入浴用いす）、p.47 のすべり止めマットは対象外で一覧に出ない（2026-11-01）', async () => {
  const carriers = await productsOf(50);
  assert.ok(carriers.length >= 10);
  assert.ok(carriers.every((p) => p.insured === true && p.category === '入浴補助用具' && p.sub === '入浴用いす'), carriers.map((p) => `${p.name}:${p.sub}`).join(','));
  const mats = await productsOf(47);
  assert.ok(mats.every((p) => p.category === '' && p.note !== ''), mats.map((p) => `${p.name}:${p.category}`).join(','));
  // 印のあるページで印のない商品（ポータブルトイレの消耗品）は対象外
  const toilets = await productsOf(172);
  assert.ok(toilets.filter((p) => p.insured).every((p) => p.sub === '移動できる便器（ポータブルトイレ）'));
  assert.ok(toilets.some((p) => p.insured === false && p.category === ''));
  // シャワーチェアを選ぶと、シャワーベンチ・シャワーチェア・シャワーキャリーが出て、マットは出ない
  const all: CatalogProduct[] = [];
  for (const c of CATALOG) all.push(...(await productsOf(c.page)));
  const chairs = catalogInCategory(all, '入浴補助用具', '入浴用いす');
  assert.ok(chairs.some((p) => p.page === 37) && chairs.some((p) => p.page === 40) && chairs.some((p) => p.page === 50));
  assert.ok(chairs.every((p) => p.sub === '入浴用いす'));
  assert.ok(!all.filter((p) => p.page === 47).some((p) => catalogInCategory([p], '入浴補助用具', '').length));
});

test('商品マスタの取り込み（カタログの PDF）：カタログの金額は定価、仕切は空欄、種目の決まったものだけチェック（2026-11-01）', async () => {
  const list = [...(await productsOf(50)), ...(await productsOf(47))];
  const cands = catalogCandidates(list, '');
  assert.ok(cands.length > 0);
  assert.ok(cands.every((c) => c.price === null), '仕切は空欄');
  assert.ok(cands.filter((c) => c.listPrice !== null).length >= cands.length * 0.9, '定価がある');
  const carriers = cands.filter((c) => c.row === 50);
  assert.ok(carriers.every((c) => c.include && c.sub === '入浴用いす'));
  const mats = cands.filter((c) => c.row === 47);
  assert.ok(mats.every((c) => !c.include && c.category === '' && /マット|対象外|印/.test(c.warn)));
  assert.ok(isKaientaiOrder('261-S0100') && !isKaientaiOrder('536-482'));
});

test('歩行器のページ（p.136・137。2026-11-01 ユーザーの指示「固定用歩行器のカタログも追加」）：脚がすべて杖先ゴムの固定式だけが「歩行器」、キャスター・ブレーキのある歩行車とシルバーカーは対象外', async () => {
  const walkers = [...(await productsOf(136)), ...(await productsOf(137))];
  const fixed = walkers.filter((p) => p.category === '歩行器').map((p) => p.name);
  assert.equal(fixed.length, 11, fixed.join(','));
  assert.ok(fixed.includes('スライドフィットEX 固定式'));
  assert.ok(fixed.every((n) => !/前輪|サニー|ショッピング/.test(n)));
  for (const n of ['スライドフィットEX 前輪後輪3インチ', 'セーフティーアーム ウォーカーMタイプ', 'セーフティーアーム Vタイプウォーカー', 'サニーウォーカー SP', '安寿 サンフィール ショッピング']) {
    const p = walkers.find((x) => x.name === n);
    assert.ok(p && p.category === '' && /歩行車|対象外/.test(p.note), n);
  }
  // ページの端の見出し（「歩行器／シルバーカー」）で、固定型の歩行器を歩行車にしない
  assert.equal(walkers.find((p) => p.name === '歩行器')?.category, '歩行器');
  // 種目「歩行器」を選ぶと、固定式だけが出る
  assert.equal(catalogInCategory(walkers, '歩行器', '').length, 11);
});

// メーカーの横の「🔍 商品検索」（ユーザーの指示「メーカー名の横に、商品検索ボタン。メーカー名、項目名を入力すると、フィルターをかけられた商品のみ表示されるようにする。
// カタログも同様です」2026-11-01）：種目・項目名（商品名の欄に打った字）・メーカーで絞る。カタログの窓は、絞った商品の載っているページだけ
test('商品検索：種目・項目名・メーカーで絞る（のばす音・ひらがなのちがいは同じ。品目の名前ならその品目をみな）', async () => {
  const all = (await Promise.all(CATALOG.map((c) => productsOf(c.page)))).flat();
  const item = (category: string, name: string, maker: string) => ({category, sub: '', name, maker});
  // 入浴補助用具・「シャワーチェアー」・パナソニック → p.40 のパナソニックのシャワーチェア 11
  const pana = catalogFilter(all, item('入浴補助用具', 'シャワーチェアー', 'パナソニックエイジフリー（株）'));
  assert.equal(pana.byName, true);
  assert.equal(pana.sub, '入浴用いす');
  assert.equal(pana.items.length, 24);
  assert.ok(pana.items.every((p) => p.sub === '入浴用いす' && sameMaker(p.maker, 'パナソニック')));
  assert.deepEqual(catalogPagesOf(pana.items), [40, 41]);
  // ひらがな・種目が空・メーカーは「パナソニック」だけでも同じ
  assert.deepEqual(catalogFilter(all, item('', 'しゃわーちぇあ', 'パナソニック')).items, pana.items);
  // 品目の名前（シャワーチェア）なら、シャワーキャリー・シャワーベンチもふくむ（シャワーチェアの品目。2026-11-01 の指示）
  const chairs = catalogFilter(all, item('入浴補助用具', 'シャワーチェア', ''));
  assert.deepEqual(catalogPagesOf(chairs.items), [37, 40, 41, 48, 49, 50, 51]);
  // ほかの語は商品名にあるもの（ユクリア）。商品名になければページの題（p.50 シャワーキャリー）
  const yu = catalogFilter(all, item('入浴補助用具', 'ユクリア', ''));
  assert.ok(yu.items.length > 0 && yu.items.every((p) => looseKey(p.name).includes(looseKey('ユクリア'))));
  assert.deepEqual(catalogPagesOf(catalogFilter(all, item('入浴補助用具', 'シャワーキャリー', '')).items), [48, 49, 50, 51]);
  // 四点杖（多点杖）・ラップポン（ポータブルトイレ）
  assert.deepEqual(catalogPagesOf(catalogFilter(all, item('', '多点杖', '')).items), [151, 152, 153, 154]);
  assert.deepEqual(catalogPagesOf(catalogFilter(all, item('', 'ラップポン', '')).items), [174, 175]);
  // 種目が空でも、項目名から種目を推し量る（ポータブルトイレ → 腰掛便座）。介護保険の対象（種目のある商品）だけ
  const toilets = catalogFilter(all, item('', 'ポータブルトイレ', ''));
  assert.equal(toilets.category, '腰掛便座');
  assert.ok(toilets.items.length > 0 && toilets.items.every((p) => p.category === '腰掛便座'));
  assert.ok(catalogFilter(all, item('', '', '')).items.every((p) => p.category));
  // 項目名に合う商品がなければ、項目名を外した種目・メーカーの商品
  const none = catalogFilter(all, item('入浴補助用具', 'みほんのなまえ', 'アロン化成'));
  assert.equal(none.byName, false);
  assert.ok(none.items.length > 0 && none.items.every((p) => p.category === '入浴補助用具' && sameMaker(p.maker, 'アロン化成')));
});

test('カタログの商品の囲みの位置（box）：カタログの窓の押せる枠。p.40 は 11 の商品が重ならずに並び、どの囲みも品番の文字を含む', async () => {
  // ユーザーの指示「カタログと商品をリンクさせて、自動的に商品名や金額などが全てはいるようにする。カタログでは、クリックできるよう認識できるようの工夫する」2026-11-02
  const p40 = CATALOG.find((c) => c.page === 40)!;
  const items = await itemsOf(p40.file);
  const list = parseCatalogPage(items, p40);
  assert.equal(list.length, 11);
  for (const p of list) {
    const b = p.box!;
    assert.ok(b && b.w > 100 && b.h > 150 && b.x >= 0 && b.y >= 0 && b.x + b.w <= 600 && b.y + b.h <= 850, `${p.name} ${JSON.stringify(b)}`);
    // 品番の文字（PN-…）が囲みの中にある
    const code = items.find((t) => t.s.normalize('NFKC').trim() === p.variants[0].code);
    assert.ok(code && code.x >= b.x && code.x <= b.x + b.w && code.y >= b.y && code.y <= b.y + b.h, `${p.name} ${p.variants[0].code}`);
  }
  // 囲み同士は重ならない（押した所の商品が1つに決まる）
  for (const [i, a] of list.entries())
    for (const c of list.slice(i + 1)) {
      const [x, y] = [Math.min(a.box!.x + a.box!.w, c.box!.x + c.box!.w) - Math.max(a.box!.x, c.box!.x), Math.min(a.box!.y + a.box!.h, c.box!.y + c.box!.h) - Math.max(a.box!.y, c.box!.y)];
      assert.ok(x <= 2 || y <= 2, `${a.name} と ${c.name} が重なる`);
    }
});

test('非課税（カタログの金額の横の「非課税」）：歩行器・多点杖は非課税で、選ぶと税区分も非課税になる（ユーザーの指示「歩行器（ピックアップ）や四点杖は非課税。カタログの横にも記載してある。しっかりと全ての商品で認識する」2026-11-03）', async () => {
  for (const no of [136, 137, 151, 152, 153, 154]) {
    for (const p of await productsOf(no)) {
      if (p.category !== '歩行器' && p.category !== '歩行補助つえ') continue;
      assert.equal(p.taxFree, true, `p.${no} ${p.name}`);
      // 選んだときの税区分（前は前の商品の税区分＝初めは 10% のままだった）
      assert.equal(catalogItemPatch(p, p.variants[0], {category: '', sub: '', maker: ''}).taxType, '非課税', `p.${no} ${p.name}`);
    }
  }
  const quad = (await productsOf(152)).find((p) => p.name === 'エルビスクワド')!;
  assert.equal(quad.taxFree, true);
  assert.equal(catalogItemPatch(quad, quad.variants[0], {category: '入浴補助用具', sub: '', maker: ''}).taxType, '非課税');
  // 課税の商品（シャワーチェア）は 10%。前に非課税の商品を選んでいた欄でも 10% に戻る
  const chair = (await productsOf(40))[0];
  assert.equal(catalogItemPatch(chair, chair.variants[0], {category: '歩行器', sub: '', maker: ''}).taxType, '10%');
});

// ---------------- 2026-11-03 のカタログの金額の点検（ユーザーの指示「カタログの金額確認など、全ての項目でデバッグ」）で見つけて直したこと。
// 金額は書かない（同じ・ちがうだけ）
const variantOf = (list: CatalogProduct[], code: string) => {
  for (const p of list) for (const v of p.variants) if (v.code === code) return {p, v};
  throw new Error(`品番がない：${code}`);
};

test('英字だけの品番も読む（歩行器の SAWR・SAWMSSR・SAV、バスボードの VALSBDSOR）。NEW は品番にしない', async () => {
  const p137 = await productsOf(137);
  for (const c of ['SAWR', 'SAWSR', 'SAWHR', 'SAWSSR']) assert.equal(variantOf(p137, c).p.category, '歩行器', c);
  const p136 = await productsOf(136);
  for (const c of ['SAWMR', 'SAWMSR', 'SAWMHR', 'SAWMSSR', 'SAWCR', 'SAV', 'SAVA', 'SAUX']) assert.ok(variantOf(p136, c).v.listPrice > 0, c);
  const p46 = await productsOf(46);
  assert.notEqual(variantOf(p46, 'VALSBDSOR').v.listPrice, variantOf(p46, 'VALSBDLOR').v.listPrice); // S と L で金額がちがう
  for (const no of [40, 41, 48, 49, 51, 137, 151, 152, 153, 173]) assert.ok(!(await productsOf(no)).some((p) => p.variants.some((v) => v.code === 'NEW')), `p.${no}`);
});

test('金額のまとまり：品番の下に続く行（O型シート・TAIS）があるときは、2行のまん中で比べる（SW6083SAL・WB5148・スリムタイプの歩行器）', async () => {
  const p49 = await productsOf(49);
  const price = (list: CatalogProduct[], c: string) => variantOf(list, c).v.listPrice;
  assert.equal(price(p49, 'SW6083SAL'), price(p49, 'SW6084SAL')); // バケツ付の2つは同じ金額
  assert.notEqual(price(p49, 'SW6083SAL'), price(p49, 'SW6081SAL'));
  const p154 = await productsOf(154);
  assert.equal(price(p154, 'WB5148'), price(p154, 'WB5256'));
  assert.notEqual(price(p154, 'WB5148'), price(p154, 'WB5147'));
  const p136 = await productsOf(136);
  assert.equal(price(p136, 'SW5310'), price(p136, 'SW5320'));
  assert.notEqual(price(p136, 'SW5310'), price(p136, 'SAWMSSR'));
  assert.equal(price(p136, 'SW5210'), price(p136, 'SW5220'));
  const p137 = await productsOf(137);
  assert.equal(price(p137, 'SW5110'), price(p137, 'SW5120'));
  assert.notEqual(price(p137, 'SW5110'), price(p137, 'SAWSSR'));
  // 続きの行がない行のある表は今までどおり（p.214 バリアフリーレールの下の「フラットタイプ（長さ200cm）」を続きと見ない）
  const p214 = await productsOf(214);
  assert.equal(price(p214, 'BF120-1000-DO'), price(p214, 'BF120-1000-LO'));
});

test('囲みの中の小さな囲み（p.175 の「5 バケツA型用 袋止めN」）の下の表は、左の「4 ポータブルトイレ きらく ミニでか」のもの', async () => {
  const p175 = await productsOf(175);
  const kiraku = variantOf(p175, '45601').p;
  assert.match(kiraku.name, /きらく ミニでか/);
  assert.equal(kiraku.category, '腰掛便座');
  assert.deepEqual(kiraku.variants.map((v) => v.code), ['45601', '45603', '45611', '45613', '40035', '40036']);
  const bag = p175.find((p) => /袋止めN/.test(p.name))!;
  assert.deepEqual(bag.variants.map((v) => v.code), ['261-T1115']);
  assert.ok(bag.variants[0].listPrice > 0);
});

test('品番のない商品（注文番号だけ）で金額がいくつもあるときは、金額と同じ行の字を色・大きさにする（p.47 オーバルリンク・p.48 乾度良好）', async () => {
  const p47 = await productsOf(47);
  const oval = p47.find((p) => /オーバルリンク/.test(p.name))!;
  assert.deepEqual(
    oval.variants.map((v) => v.label.split(' ')[0]),
    ['マットタイプM', 'マットタイプL', 'ミディアムタイプ', 'ロングタイプL1', 'ロングタイプL2', 'ロングタイプL3'],
  );
  const p48 = await productsOf(48);
  assert.deepEqual(p48.find((p) => /乾度良好/.test(p.name))!.variants.map((v) => v.label), ['50×80cm', '60×90cm', '90×120cm']);
});

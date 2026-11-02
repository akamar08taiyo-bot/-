// 介援隊のカタログの印刷（catalog.ts）：初めからチェックするページ（品番・細目・メーカー・商品名）と、カタログの PDF から品番を読めること。
// 商品は架空の見本（品番だけはカタログの PDF にあるもの）
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import test from 'node:test';
import {CATALOG, catalogMatches, catalogPicks, catalogTitle, codeKey, pageCodes} from '../../src/tokutei/catalog.ts';

const item = (o: Partial<{name: string; maker: string; code: string; sub: string}>) => ({name: '', maker: '', code: '', sub: '', ...o});
const page = (n: number) => CATALOG.findIndex((p) => p.page === n);
const picks = (...items: ReturnType<typeof item>[]) => [...catalogPicks(items)].map((i) => CATALOG[i].page).sort((a, b) => a - b);

test('細目・メーカー・商品名で選ぶ（品番が見つからないとき）', () => {
  assert.deepEqual(picks(item({name: '見本の浴槽手すり', sub: '浴槽用手すり'})), [44, 45]); // 安寿の浴槽手すりは p.44 にも
  assert.deepEqual(picks(item({name: '見本の浴槽手すり', maker: 'パナソニック', sub: '浴槽用手すり'})), [45]);
  assert.deepEqual(picks(item({name: '見本のバスボード'})), [45]); // 細目が空なら商品名から（category.ts）
  // シャワーチェア・浴槽台はメーカーで分ける（安寿 p.37・44、パナソニック p.40・41・43）。メーカーが空なら両方
  assert.deepEqual(picks(item({name: '見本のシャワーチェア', sub: '入浴用いす'})), [37, 40, 41]);
  assert.deepEqual(picks(item({name: '見本のシャワーベンチ', maker: 'アロン化成（株）', sub: '入浴用いす'})), [37]);
  assert.deepEqual(picks(item({name: '見本のシャワーチェア', maker: 'パナソニックエイジフリー（株）'})), [40, 41]);
  assert.deepEqual(picks(item({name: 'ユクリア 見本のシャワーチェア'})), [37, 40, 41]); // メーカーが空なら商品名の言葉で外さない
  assert.deepEqual(picks(item({name: 'ユクリア 見本のスツール', maker: 'パナソニック'})), [41]); // p.41 にしかない言葉
  // 2026-11-01 に足したページ：シャワー用車いす・シャワーラク・多点杖・さわやかチェア・ジャスピタ
  assert.deepEqual(picks(item({name: '見本のシャワー用車いす'})), [49]);
  assert.deepEqual(picks(item({name: 'シャワーラク 見本'})), [51]);
  assert.deepEqual(picks(item({name: '見本の入浴用介助ベルト'})), [51]);
  assert.deepEqual(picks(item({name: '見本の多点杖', sub: '多点杖'})), [151, 152, 153, 154]);
  assert.deepEqual(picks(item({name: 'エルビスクワド 見本'})), [152]);
  assert.deepEqual(picks(item({name: 'さわやかチェア 見本'})), [174]);
  assert.deepEqual(picks(item({name: '安寿 ジャスピタ 見本', maker: 'アロン化成'})), [175]);
  assert.deepEqual(picks(item({name: '見本の浴槽台', maker: 'パナソニック'})), [43]);
  assert.deepEqual(picks(item({name: '見本の浴槽台', maker: '安寿'})), [44]);
  assert.deepEqual(picks(item({name: '見本の浴槽台'})), [43, 44]);
  // 商品名の言葉がそのページにしかない名前なら、そのページだけ（シャワーキャリーはシャワーチェアのページに入れない）
  assert.deepEqual(picks(item({name: '見本のシャワーキャリー', sub: '入浴用いす'})), [50]);
  assert.deepEqual(picks(item({name: '見本のすべり止めマット'})), [47]);
  // ポータブルトイレはメーカーで分ける。メーカーが空なら細目のページを全部、ほかのメーカーならなし
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', maker: 'パナソニック', sub: '移動できる便器（ポータブルトイレ）'})), [177]);
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', maker: 'アロン化成', sub: '移動できる便器（ポータブルトイレ）'})), [172, 173]);
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', sub: '移動できる便器（ポータブルトイレ）'})), [172, 173, 177]);
  assert.deepEqual(picks(item({name: '見本の家具調トイレ', maker: '見本工業', sub: '移動できる便器（ポータブルトイレ）'})), []);
  assert.deepEqual(picks(item({name: '安寿 ポータブルトイレ ＦＸ－３０ 見本', maker: 'アロン化成'})), [178]);
  assert.deepEqual(picks(item({name: 'ポータブルトイレ FX-CP 見本', maker: 'アロン化成'})), [179]);
  assert.deepEqual(picks(item({name: 'ポータブルトイレFX-30 見本', maker: 'パナソニック', sub: '移動できる便器（ポータブルトイレ）'})), [177]); // メーカーがちがえば言葉で選ばない
  // 和式から洋式（据置式便座）は p.179
  assert.deepEqual(picks(item({name: '見本の据置式便座'})), [179]);
  assert.deepEqual(picks(item({name: '見本の便座', sub: '和式便器を腰掛式にするもの'})), [179]);
  assert.deepEqual(picks(item({name: '見本の補高便座', sub: '洋式便器の高さを補うもの'})), []); // 補高便座のページはまだない
  // 固定用スロープは p.214（2026-10-28）
  assert.deepEqual(picks(item({name: '見本の段差スロープ'})), [214]);
  assert.deepEqual(picks(item({name: '見本の段差解消 ゴム', maker: '見本工業', sub: ''})), [214]);
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

test('カタログから検索：ページの名前・ページの文字・品番（全角・ハイフン・空白のちがいは同じ。語はどれも）', () => {
  const at = (page: number) => CATALOG.findIndex((p) => p.page === page);
  const texts = CATALOG.map((p) => (p.page === 40 ? 'シ ャ ワ ー チ ェ ア 品 番 261-S1063' : p.page === 172 ? '家 具 調 ト イ レ 533-685' : ''));
  assert.deepEqual(catalogMatches('', texts), CATALOG.map((_, i) => i)); // 空なら全部
  assert.deepEqual(catalogMatches('２６１Ｓ１０６３', texts), [at(40)]);
  assert.deepEqual(catalogMatches('533 685', texts), [at(172)]); // 語に分けても、どちらもページの文字にある
  assert.deepEqual(catalogMatches('533-685', texts), [at(172)]);
  assert.ok(catalogMatches('浴槽台', texts).includes(at(43)) && catalogMatches('浴槽台', texts).includes(at(44)));
  assert.deepEqual(catalogMatches('浴槽台 安寿', texts), [at(44)]);
  // ページの品目（kind）でも探せる：シャワーベンチ・シャワーキャリーのページも「シャワーチェア」（2026-11-01）
  assert.deepEqual(catalogMatches('シャワーチェア', texts), [37, 40, 41, 48, 49, 50, 51].map(at));
  assert.deepEqual(catalogMatches('多点杖', texts), [151, 152, 153, 154].map(at));
  assert.deepEqual(catalogMatches('ポータブルトイレ 安寿', texts), [at(172), at(173), at(178), at(179)]);
  assert.deepEqual(catalogMatches('見つからない語', texts), []);
});

test('印刷の画面の題（PDF に保存するときの名前の元）', () => {
  assert.equal(catalogTitle({customer: '見本\u3000花子'}), '見本 花子様 カタログ');
  assert.equal(catalogTitle({customer: ''}), 'カタログ');
});

test('カタログの PDF：ファイルがあり、品番を読める（pdf.js）', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const expect: Record<number, string[]> = {
    37: ['536-040', '261-S1162'],
    40: ['PN-L41431D', '261-S1063'],
    43: ['PN-L11120A', '261-S1052'],
    44: ['536-440', '261-S0339'],
    41: ['PN-L41822A', '261-S1205'],
    45: ['PN-L12211D', '261-S0840'],
    46: ['261-S0100'],
    47: ['261-S0145'],
    48: ['261-S0621'],
    49: ['261-S0911'],
    50: ['261-S1119'],
    51: ['SWR142SAL', '261-S1090'],
    136: ['M-0288', '261-W2483'], // 歩行器（スライドフィットEX 固定式）
    137: ['WFS-4968R', '261-W0623'], // 歩行器（固定型）
    151: ['R-101', '261-W2740'], // 多点杖
    152: ['ELB-G4BK', '261-W3003'],
    153: ['605500', '261-W2876'],
    154: ['261-W1257'],
    172: ['533-685', '261-T1072'],
    173: ['261-T1287'],
    174: ['8215', '261-T1155'], // ポータブルトイレ（さわやかあさひ）
    175: ['8090', '261-T1219'],
    177: ['PN-L30205B', '261-T0819'],
    178: ['532-950', '261-T1188'],
    179: ['533-554', '261-T0043'],
    214: ['04740', '261-R1043', 'TM-999-A15', '261-R0102'], // 段差解消スロープ（品番・申込番号）
  };
  assert.deepEqual(CATALOG.map((p) => p.page), Object.keys(expect).map(Number)); // ページの順に並ぶ
  assert.equal(new Set(CATALOG.map((p) => p.file)).size, CATALOG.length);
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

// メーカーのカタログ（makerCatalogs.ts。矢崎化工・TOTO）：品番の合わせ方・部材の載っているページ・探す。部材は架空の名前・金額
import assert from 'node:assert/strict';
import test from 'node:test';
import {BOOKS, bookOf, catalogMaterials, catalogPageOf, catalogSearch, codeKey, sameCatalogCode, tocOf} from '../../src/sasaoka/makerCatalogs.ts';
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

test('色の記号で終わる品番（マツ六「BD-01B」）に、続きの字だけちがう別の色（「BD-01BK」）を入れない（2026-11-09 の点検）', () => {
  const m6 = bookOf('matsu6');
  const list = [mat('BD-01BK', '見本のブラケット', 'マツ六'), mat('BD-08B', '見本のブラケット', 'マツ六'), mat('BD-08G', '見本のブラケット', 'マツ六'), mat('ECL-5006H USL')];
  assert.deepEqual(catalogMaterials(list, 'BD-01B', m6), []);
  assert.deepEqual(catalogMaterials(list, 'BD-01BK', m6).map((m) => m.code), ['BD-01BK']);
  // 色の記号のない品番（数字で終わる）は、今までどおり色を選ぶ
  assert.deepEqual(catalogMaterials(list, 'BD-08', m6).map((m) => m.code), ['BD-08B', 'BD-08G']);
  // すき間のあとの色の記号（矢崎化工）は、文字で終わる品番でも色ちがい
  assert.deepEqual(catalogMaterials(list, 'ECL-5006H').map((m) => m.code), ['ECL-5006H USL']);
});

test('カタログの枠を押してそのまま入れるのは、品番が同じ部材だけ（書き方・入り数の札のちがいは同じ。色ちがい・頭だけ同じは選ぶ画面）', () => {
  assert.ok(sameCatalogCode('ECA-5032 USL', 'eca－5032 usl'));
  assert.ok(sameCatalogCode('CYA-1300 SGD', 'CYA-1300 3ﾎﾞﾝｲﾘ SGD'));
  assert.ok(sameCatalogCode('YHB203#NW1', 'YHB203#NW1'));
  assert.ok(!sameCatalogCode('YHB203#EL', 'YHB203#NW1'));
  assert.ok(!sameCatalogCode('ECL-5049 USL', 'ECL-5049'));
  assert.ok(!sameCatalogCode('BD-01BK', 'BD-01B'));
  assert.ok(!sameCatalogCode('CYA-1300 MGR', 'CYA-1300 3ﾎﾞﾝｲﾘ SGD'));
  assert.ok(!sameCatalogCode('', ''));
});

test('入り数の札（3ﾎﾞﾝｲﾘ・10ｲﾚ）のある品番：札があってもなくても同じ色の部材。札の前で切らない（2026-11-05 の点検）', () => {
  const withTag = [mat('CYA-1300 3ﾎﾞﾝｲﾘ SGD'), mat('CYA-1300 3ﾎﾞﾝｲﾘ MGR')];
  const noTag = [mat('EBT-S5 SL'), mat('EBT-S5 GLD'), mat('EBT-S5 MB')];
  assert.deepEqual(catalogMaterials(withTag, 'CYA-1300 3ﾎﾞﾝｲﾘ SGD').map((m) => m.code), ['CYA-1300 3ﾎﾞﾝｲﾘ SGD']);
  assert.deepEqual(catalogMaterials(withTag, 'CYA-1300 3ボンイリ MGR').map((m) => m.code), ['CYA-1300 3ﾎﾞﾝｲﾘ MGR']); // 全角でも
  assert.deepEqual(catalogMaterials(noTag, 'EBT-S5 10ｲﾚ GLD').map((m) => m.code), ['EBT-S5 GLD']);
  assert.deepEqual(catalogMaterials(withTag, 'CYA-1300').map((m) => m.code), ['CYA-1300 3ﾎﾞﾝｲﾘ SGD', 'CYA-1300 3ﾎﾞﾝｲﾘ MGR']); // 色の記号のない品番
  assert.deepEqual(catalogMaterials(noTag, 'EBT-S5 10ｲﾚ'), catalogMaterials(noTag, 'EBT-S5'));
  // カタログのページ（24ページの表は「CYA-1300 3ﾎﾞﾝｲﾘ SGD」）
  assert.equal(catalogPageOf(mat('CYA-1300 3ﾎﾞﾝｲﾘ SGD'))?.page, 24);
  assert.equal(catalogPageOf(mat('CYA-1300 SGD'))?.page, 24);
  const p24 = yazakiPages.find((p) => p.page === 24)!.codes.map((c) => c.code);
  for (const c of ['CYA-1300 3ﾎﾞﾝｲﾘ SGD', 'CYA-1300 3ﾎﾞﾝｲﾘ MGR', 'CYA-1300 3ﾎﾞﾝｲﾘ MLB']) assert.ok(p24.includes(c), c);
  assert.ok(!p24.includes('CYA-1300'));
});

test('カタログのページ：p.12〜81 の 70 ページ。どのページの品番も位置が 0〜1 の間', () => {
  assert.equal(yazakiPages.length, 70);
  assert.deepEqual([yazakiPages[0].page, yazakiPages.at(-1)!.page], [12, 81]);
  const codes = yazakiPages.flatMap((p) => p.codes);
  assert.ok(codes.length >= 300, String(codes.length));
  for (const c of codes) {
    assert.match(c.code, /^[A-Z]{1,5}\d{0,2}-[0-9A-Z]{1,6}(-[0-9A-Z]{1,3})?( [A-Z0-9]{1,4}| \d{1,2}[\uFF66-\uFF9F]{2,5})*$/, c.code);
    for (const v of [c.x, c.y, c.x + c.w, c.y + c.h]) assert.ok(v >= 0 && v <= 1, `${c.code} ${v}`);
  }
  // 表紙の品番の例（見本で目で見て確かめたもの）
  const on = (page: number) => yazakiPages.find((p) => p.page === page)!.codes.map((c) => c.code);
  assert.ok(on(13).includes('ECA-5029 USL'));
  assert.ok(on(79).includes('CFA-1A W'));
  assert.ok(on(80).includes('CFA-1B W'));
  // 2026-11-05 の全ページの点検で足した・直した品番（読み取りで抜けていた 4000 の行・施工例の図の品番・入り数の札のある品番）
  for (const [page, code] of [[12, 'HCT-4000 T USL'], [12, 'HL7-P16 T USL'], [21, 'ECL-5006A'], [35, 'HD5-4000 T LBR'], [36, 'CZB-NE2 40ｲﾚ LBR'], [36, 'CZD-1-1 BR'], [38, 'EBT-S5 10ｲﾚ GLD'], [49, 'AA-35S-1 GLD'], [58, 'AA-35FWC SET'], [65, 'EBT-S5 10ｲﾚ MB'], [70, 'EBT-S3'], [73, 'SBA6-2000 T TPE W2'], [76, 'SBD-2000 T'], [78, 'EBT-4L'], [78, 'EBT-4R']] as const)
    assert.ok(on(page).includes(code), `p.${page} ${code}`);
  for (const [page, code] of [[24, 'CYA-1300'], [38, 'EBT-55'], [49, 'AA-355-1 GLD'], [58, 'AA-35FWC SED'], [70, 'EBT-55'], [76, 'SBD-2000T'], [78, 'EBT-4D']] as const)
    assert.ok(!on(page).includes(code), `p.${page} ${code}（読み違い）`);
  // 同じ所に二重の枠がない（2つの読み取りを合わせたときの残り）：となりの枠との重なりは小さいほうの枠の半分まで
  const area = (c: {w: number; h: number}) => c.w * c.h;
  for (const p of yazakiPages)
    for (const [i, a] of p.codes.entries())
      for (const b of p.codes.slice(i + 1)) {
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(ox <= 0 || oy <= 0 || ox * oy < 0.5 * Math.min(area(a), area(b)), `p.${p.page} ${a.code} と ${b.code}`);
      }
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

test('TOTO のカタログ：76 ページ。品番の形・位置が 0〜1 の間・金額の字はない', () => {
  assert.equal(toto.pages.length, 76);
  const codes = toto.pages.flatMap((p) => p.codes);
  assert.ok(codes.length >= 1000, String(codes.length));
  for (const c of codes) {
    assert.match(c.code, /^[A-Z]{1,6}\d{1,5}[A-Z0-9]{0,10}(-[A-Z0-9]{1,6})*(#[A-Z0-9]{1,6})?$/, c.code);
    for (const v of [c.x, c.y, c.x + c.w, c.y + c.h]) assert.ok(v >= 0 && v <= 1.001, `${c.code} ${v}`);
  }
  // p.12（ハンドグリップ）の見本（目で見て確かめたもの）
  const on = (page: number) => toto.pages.find((p) => p.page === page)!.codes.map((c) => c.code);
  assert.deepEqual(['YHB203#NW1', 'YHBS203FBR#EL', 'YHBS203FR#MW'].filter((c) => on(12).includes(c)).length, 3);
  // 2026-11-09 の検品部隊で直した所（絵で確かめた）：
  // p.51 1100mm は TS139CEE11（PDF の文字では「1●」が欠けて TS139CEE1 だった）
  assert.ok(on(51).includes('TS139CEE11') && !on(51).includes('TS139CEE1'));
  // p.82〜90「（T114CL9R・CL10R）」の略した CL10R は押す枠にしない（同じ表の CL10・CP22 などほかの略した品番と同じ。前は CL10R の枠だけがあった）。
  // 品名とくっついた「L型手すり (T112CL9」は枠にする（同じ行の T113BL9 と同じ）
  for (const pg of [82, 84, 86, 88, 90]) {
    assert.ok(!on(pg).includes('T114CL10R') && on(pg).includes('T114CL9R') && on(pg).includes('T112CL9') && on(pg).includes('T113BL9'), `p.${pg}`);
  }
  assert.ok(!codes.some((c) => c.code === 'CL10R' || c.code === 'CL10'));
  // 品番索引（p.101・102）：点とページ番号のある行（「T112CD6 ·····」「YH702 ····· 56,57,59」）も枠（前は半分ほどしか押せなかった）
  for (const c of ['T112CD6', 'YH702', 'CES9710C', 'TS139C2', 'UACN41R511W']) assert.ok(on(101).includes(c) || on(102).includes(c), c);
  assert.ok(on(101).length + on(102).length >= 370);
  assert.equal(tocOf(toto, 101)?.title, '品番索引'); // p.101 から索引（前は p.102 からで、p.101 が「イージーオーダー」と出た）
  // 品番の前後に日本語・金額・「（L タイプ）」・表の番号がつながった文字の枠は、書体で字の幅を測って品番の字を全部囲む
  // （前は字の幅を 0.55・1 と決めて見積もり、頭や終わりの1字が枠の外に出ていた。2026-11-09 の再検品3。絵で品番の左右の端を測った値と比べる）
  const edge = (pg: number, code: string) => toto.pages.find((p) => p.page === pg)!.codes.filter((c) => c.code === code).map((c) => [c.x, c.x + c.w]);
  for (const [x0, x1] of edge(43, 'EWT22AF35')) assert.ok(x0 <= 0.577 && x1 >= 0.655, `p.43 EWT22AF35 ${x0} ${x1}`); // 「トタイプ） EWT22AF35」の E
  for (const [x0, x1] of edge(36, 'EWT10BE35LA')) assert.ok(x0 <= 0.541 && x1 >= 0.620, `p.36 EWT10BE35LA ${x0} ${x1}`); // 「EWT10BE35LA（L タイプ）」の A
  for (const [x0] of edge(71, 'EWC730')) assert.ok(x0 <= 0.147, `p.71 EWC730 ${x0}`); // 「19 EWC730」の E
  for (const [x0, x1] of edge(14, 'T110D34')) assert.ok(x1 - x0 >= 0.05, `p.14 T110D34 ${x0} ${x1}`); // 「T110D34 ¥（金額） ハンガーボルト」の 4
  for (const [x0] of edge(82, 'T112CL9')) assert.ok(x0 <= 0.281, `p.82 T112CL9 ${x0}`); // 「L型手すり (T112CL9」の T
  // 注記の文の中の品番（p.84「なお、T110D26（樹脂プラグ20個入り）は…」）は、同じページの別売品の表の枠だけ
  assert.equal(on(84).filter((c) => c === 'T110D26').length, 1);
  // 参照の一覧（p.35「取り付けられる品番」）・図の札（p.38「支柱（EWT12BB35）」）も、同じページの表の行の枠だけ（再検品4）
  assert.equal(on(35).filter((c) => c === 'EWT10BK35R').length, 1);
  assert.equal(on(38).filter((c) => c === 'EWT12BB35').length, 1);
  // p.64「写真は T112HK7R／#NW1です。」の写真の札は、同じページの表の行（T112HK7R）があるので押す枠にしない（表の行の枠だけ）
  assert.ok(on(64).includes('T112HK7R') && !on(64).includes('T112HK7R#NW1') && !on(64).includes('T112HP7#DB9'));
  assert.equal(on(64).filter((c) => c === 'T113HK7R').length, 1);
  // 直した品番・略した品番の枠は、印刷された字の所（前は直したあとの字で探して見つからず、右へずれた。2026-11-09 の再検品）
  const box = (pg: number, code: string) => toto.pages.find((p) => p.page === pg)!.codes.filter((c) => c.code === code);
  assert.equal(box(51, 'TS139CEE11').length, 2);
  for (const c of box(51, 'TS139CEE11')) assert.ok(c.x < 0.47, `TS139CEE11 の枠 ${c.x}`);
  // イージーオーダーの「タイプ番号」（品番ではない）・裏表紙の管理記号は押す枠にしない。ページは見られるように残す
  for (const pg of [93, 95, 96, 97, 98, 99, 104]) assert.deepEqual(on(pg), [], `p.${pg}`);
  // p.36「2m：EWT22AG32」・p.57「◆CES9710C#NW1」など前に字の付いた品番も（品番索引にあるのに枠がなかった）
  assert.ok(on(36).includes('EWT22AG32') && on(57).includes('CES9710C#NW1'));
  // 表の行の品番と金額が1つの文字（p.22「TS134GLMY7 ¥（金額）」）・「φ35：EWT10CS35」も
  assert.ok(on(22).includes('TS134GLMY7') && on(35).includes('EWT10CS35'));
  // PDF の文字で2つに割れた品番（p.52「TS1」「39CE2●」・p.64「T1」「12H6R」）・表の番号の付いた行（p.71「19 EWC730」）・「（L タイプ）」の付いた行
  assert.ok(on(52).includes('TS139CE2') && on(64).includes('T112H6R') && on(71).includes('EWC730') && on(36).includes('EWT10BE35LA'));
  // 便器・洗浄弁・便座の対応一覧の品番（手すりの部材ではない）は押す枠にしない
  assert.ok(!on(73).includes('CS20AB') && !on(79).includes('TEFV70UA') && !on(81).includes('CS310B') && on(68).length === 0);
});

test('マツ六のカタログ（Vol.8）：64 ページ。表の「商品コード｜品番」に枠・部材の載っているページ・初めに開くカタログ', () => {
  const m6 = bookOf('matsu6');
  assert.equal(m6.pages.length, 64);
  assert.equal(m6.image(5), '../jutaku-mitsumori/catalog/matsu6-p005.jpg');
  assert.equal(m6.isMaker('マツ六株式会社'), true);
  const codes = m6.pages.flatMap((p) => p.codes);
  assert.ok(codes.length >= 1000, String(codes.length));
  for (const c of codes) {
    // 表の行の品番は BJ-14WD の形のほかに P34NV-400-00・DX14C・35LB4R・EL5060-1M-NS・MG-8×40P・SD450-90 も（2026-11-09 の検品）
    assert.match(c.code, /^(?=.*[A-Z])(?=.*\d)[A-Z0-9][A-Z0-9×-]{2,24}$/, c.code);
    for (const v of [c.x, c.y, c.x + c.w, c.y + c.h]) assert.ok(v >= 0 && v <= 1.001, `${c.code} ${v}`);
  }
  // p.5（手すり棒）の見本（目で見て確かめたもの）：枠は左の商品コード（040-2714）からかかる
  const on = (page: number) => m6.pages.find((p) => p.page === page)!.codes;
  const bj = on(5).find((c) => c.code === 'BJ-14WD')!;
  assert.ok(bj && bj.x < 0.62 && bj.x + bj.w > 0.7, JSON.stringify(bj));
  // 部材の載っているページ（マツ六の部材だけ）・色の記号のない品番は色ちがいから
  const t = (code: string) => mat(code, '見本の手すり', 'マツ六');
  assert.equal(catalogPageOf(t('BJ-14WD'))?.book, 'matsu6');
  assert.equal(catalogPageOf(t('BD-134'))?.book, 'matsu6');
  assert.deepEqual(catalogMaterials([t('BJ-14WD'), t('BJ-13WD')], 'BJ-14WD', m6).map((m) => m.code), ['BJ-14WD']);
  assert.ok(catalogSearch(m6, 'bd-134', []).length >= 1);
  // 2026-11-09 の検品部隊で直した所（絵で確かめた）：表の行なのに枠がなかった品番
  const codesOn = (page: number) => on(page).map((c) => c.code);
  for (const [pg, code] of [[19, 'AF-1'], [22, 'SAQ-OP8'], [22, 'MG-8×40P'], [23, 'ST-1'], [23, 'BP-1'], [24, 'SAP-I-N400W'], [25, 'SAP-N01W'], [32, 'P34NV-400-00'], [38, '35LB4R'], [53, 'TL-1'], [59, 'DX14C'], [60, 'SD450-90'], [62, 'MBL-WC53-S'], [63, 'EL5060-1M-NS'], [71, 'BZD-F200']] as const)
    assert.ok(codesOn(pg).includes(code), `p.${pg} ${code}`);
  // 品番でない所の枠は外す：取付けの説明のページ（p.21。ページは残す）・説明の見本・文の中・参照の表・写真の札
  assert.deepEqual(codesOn(21), []);
  assert.ok(!codesOn(3).includes('BGP-01MO') && !codesOn(57).includes('BF-27') && !codesOn(71).includes('BZD-01') && codesOn(71).includes('BZD-01WD'));
  // p.67 ベースマットの表の「対応たよレール」の列（押すとマットでなく手すりが入っていた）
  assert.ok(!on(67).some((c) => c.code.startsWith('BZK-0') && c.y > 0.9));
});

test('目次と初めに開くページ：マツ六 p.43・TOTO p.24・矢崎化工 p.12。目次の見出しはページの順で、どれもカタログにあるページ（2026-11-05 の指示）', () => {
  assert.deepEqual(
    BOOKS.map((b) => [b.id, b.startPage]),
    [
      ['matsu6', 43],
      ['toto', 24],
      ['yazaki', 12],
    ],
  );
  for (const b of BOOKS) {
    assert.ok(b.pages.some((p) => p.page === b.startPage), `${b.id} p.${b.startPage}`);
    assert.ok(b.toc.length >= 8, b.id);
    for (const [i, t] of b.toc.entries()) {
      assert.ok(b.pages.some((p) => p.page === t.page), `${b.id} ${t.title} p.${t.page}`);
      if (i) assert.ok(t.page > b.toc[i - 1].page, `${b.id} ${t.title}`);
    }
  }
  // 例に挙がった見出し（ユーザーの「マツ六であれば、ベースプレート、屋内手すり、ブラケット」「矢崎であれば、屋外手すり、屋外支柱」「TOTOであれば、浴室手すり、浴室手すり（ユニットバス用）」）
  const titles = (id: 'matsu6' | 'toto' | 'yazaki') => bookOf(id).toc.map((t) => t.title).join('／');
  for (const w of ['ベースプレート', '屋内手すり', 'ブラケット']) assert.ok(titles('matsu6').includes(w), w);
  for (const w of ['屋外手すり', '屋外支柱']) assert.ok(titles('yazaki').includes(w), w);
  for (const w of ['浴室手すり', '浴室手すり（ユニットバス用）']) assert.ok(titles('toto').includes(w), w);
  // ページの見出し：そのページより前でいちばん近い見出し
  assert.equal(tocOf(bookOf('matsu6'), 43)?.title, 'ブラケット（35）');
  assert.equal(tocOf(bookOf('matsu6'), 3), null);
  assert.equal(tocOf(bookOf('toto'), 24)?.title, '浴室手すり');
  assert.equal(tocOf(bookOf('yazaki'), 16)?.title, '屋外支柱（ネクステール）');
});

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strToU8, zipSync} from 'fflate';
import {
  alignToHeader,
  codeHasSpec,
  codeLengthM,
  decodeText,
  detectListNth,
  detectMapping,
  guessMaker,
  guessPieceLengthM,
  gridCandidates,
  lineCandidates,
  mergeMaterials,
  parseDelimited,
  parseLengthM,
  parsePrice,
  splitLine,
  textToGrid,
  textToLines,
  unitText,
} from '../../src/sasaoka/priceImport.ts';
import type {Material} from '../../src/sasaoka/types.ts';
import {readXlsx} from '../../src/sasaoka/xlsx.ts';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test('parsePrice', () => {
  assert.equal(parsePrice('¥3,800'), 3800);
  assert.equal(parsePrice('３，８００円'), 3800);
  assert.equal(parsePrice('￥12,000'), 12000);
  assert.equal(parsePrice(' 1500 '), 1500);
  assert.equal(parsePrice(3799.9999999), 3800);
  assert.equal(parsePrice('@420'), 420);
  assert.equal(parsePrice('オープン'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('600mm'), null);
});

test('Excel（.xlsx）の仕切り表を読む：見出しを見つけて「仕切価格」の列を選ぶ', () => {
  const sheets = readXlsx(fixture('maker-list.xlsx'));
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, '仕切表');
  const grid = sheets[0].rows;
  assert.deepEqual(grid[1], ['メーカー', '品番', '商品名', '定価', '仕切価格', '単位']);
  const m = detectMapping(grid);
  // 「定価」と「仕切価格」の両方があれば、仕切価格は仕切の列、定価は定価の列
  assert.deepEqual(m, {header: 1, name: 2, price: 4, code: 1, maker: 0, unit: 5, list: 3, spec: -1, len: -1});
  const c = gridCandidates(grid, m, '');
  assert.equal(c.length, 6);
  assert.deepEqual(
    c.slice(0, 3).map((x) => [x.maker, x.code, x.name, x.price, x.listPrice, x.unit, x.include]),
    [
      ['マツ六', 'BP-600', '手すり I型 600mm', 3360, 4800, '本', true],
      ['マツ六', 'BP-800', '手すり I型 800mm', 3920, 5600, '本', true],
      ['マツ六', 'BK-01', 'ブラケット(エンド)', 1500, 2000, '個', true], // 全角かっこはそろえる
    ],
  );
  const last = c[c.length - 1];
  assert.equal(last.name, '(以下余白)');
  assert.equal(last.include, false); // 価格がない行は最初は取り込まない
});

test('xlsx：ふりがな（rPh）・インライン文字・中身のない行・列の飛び', () => {
  const sst =
    '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<si><t>商品名</t></si><si><t>仕切</t></si>' +
    '<si><r><t>手すり</t></r><r><t xml:space="preserve"> 木製</t></r><rPh sb="0" eb="3"><t>テスリ</t></rPh><phoneticPr fontId="1"/></si>' +
    '<si><t>A&amp;B ブラケット</t></si></sst>';
  const sheet =
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    '<row r="1"><c r="B1" t="s"><v>0</v></c><c r="D1" t="s"><v>1</v></c></row>' +
    '<row r="2"/>' +
    '<row r="3"><c r="B3" t="s"><v>2</v></c><c r="C3" s="1"/><c r="D3"><v>3799.9999999999995</v></c></row>' +
    '<row r="4"><c r="B4" t="s"><v>3</v></c><c r="D4" t="inlineStr"><is><t>1,500</t></is></c></row>' +
    '</sheetData></worksheet>';
  const wb =
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="一覧" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>';
  const zip = zipSync({
    'xl/workbook.xml': strToU8(wb),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
    'xl/sharedStrings.xml': strToU8(sst),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
  const [s] = readXlsx(zip);
  assert.equal(s.name, '一覧');
  assert.deepEqual(s.rows, [
    ['', '商品名', '', '仕切'],
    ['', '手すり 木製', '', '3800'],
    ['', 'A&B ブラケット', '', '1,500'],
  ]);
  const m = detectMapping(s.rows);
  assert.equal(m.name, 1);
  assert.equal(m.price, 3);
  assert.deepEqual(
    gridCandidates(s.rows, m, 'テスト').map((x) => [x.name, x.price, x.maker]),
    [
      ['手すり 木製', 3800, 'テスト'],
      ['A&B ブラケット', 1500, 'テスト'],
    ],
  );
});

test('Shift_JIS の CSV（"..." 囲み・カンマ入り）', () => {
  const text = decodeText(fixture('maker-list-sjis.csv'));
  const grid = textToGrid(text, 'csv');
  assert.deepEqual(grid, [
    ['品番', '品名', '仕切単価'],
    ['NK-100', 'ナカ 手すり "ルーバー" 1000', '4,500'],
    ['NK-200', 'ナカ, 屋外手すり', '12800'],
  ]);
  const m = detectMapping(grid);
  assert.deepEqual([m.header, m.code, m.name, m.price, m.list], [0, 0, 1, 2, -1]);
});

test('定価の列しかない表：仕切価格は空欄で取り込む（あとで仕切価格の入った表を取り込むと入る）', () => {
  const grid = textToGrid('商品名\t定価\n手すり 600\t4,800\n');
  const m = detectMapping(grid);
  assert.deepEqual([m.name, m.price, m.list], [0, -1, 1]);
  assert.deepEqual(gridCandidates(grid, m, '').map((x) => [x.price, x.listPrice, x.include]), [[null, 4800, true]]);
});

test('TOTOの価格表の形：改定前・改定後の「定価」「売価」が並ぶ → 右の（新しい）方。新しい売価が空欄なら仕切価格は空欄', () => {
  const grid: string[][] = [
    ['太陽シルバーサービス株式会社御中'],
    ['', '', '', '', '2025年9月までの価格', '', '', '2025年10月からの新値'],
    ['品番', '品名', '色', '色', '定価', '売価', '', '定価', '売価', ''],
    ['TS136GU8#NW1', 'インテリア・バーＦ　ＵＢ後付Ｉ型', '#NW1', 'ﾎﾜｲﾄ', '14500', '6380', '0.44', '15200', '', '0'],
    ['EWCS450S51', 'ウォシュレット付補高便座', ' ', ' ', '175700', '101105', '0.57', '183000', '', '0'],
  ];
  const m = detectMapping(grid);
  assert.deepEqual([m.header, m.code, m.name, m.spec, m.list, m.price], [2, 0, 1, 3, 7, 8]);
  assert.deepEqual(
    gridCandidates(grid, m, 'TOTO').map((c) => [c.code, c.name, c.listPrice, c.price, c.include]),
    [
      ['TS136GU8#NW1', 'インテリア・バーF UB後付I型 ホワイト', 15200, null, true], // 色の名前を商品名のうしろに
      ['EWCS450S51', 'ウォシュレット付補高便座', 183000, null, true],
    ],
  );
  assert.equal(guessMaker(grid.slice(0, 5).map((r) => r.join(' ')).concat('TOTO九州販売株式会社')), 'TOTO');
});

test('マツ六の価格表の形：「品番等」の品番と寸法・色を分ける。「掛率」は価格にしない。同じ商品が何度も載っていても1件', () => {
  const head = ['ページ', 'メーカー', '商品コード', 'JANコード', '商品名', '品番等', '単位', '定価', '掛率', '', '備考'];
  const row = (page: string, code: string, name: string, spec: string, unit: string, list: string) => [page, 'マツ六', code, '4976415954244', name, spec, unit, list, '0.32', '', '価格変更'];
  const grid = [
    head,
    row('71', '040-0950', 'BAUHAUS 35アッシュ丸棒 ディンプル付', 'BD-134 φ35×4000mm Mオーク', '本', '18600'),
    row('73', '040-0950', 'BAUHAUS 35アッシュ丸棒 ディンプル付', 'BD-134 φ35×4000mm Mオーク', '本', '18600'),
    row('96', '040-1046', 'BAUHAUS セレクト 35エンドブラケットカバー付', 'BD-08G ゴールド', '個', '2350'),
    row('97', '040-0000', 'BAUHAUS フリーRレール 錆び止めローバル', 'BJ-33', '個', '2350'),
  ];
  const m = detectMapping(grid);
  assert.deepEqual([m.code, m.name, m.maker, m.unit, m.list, m.price], [5, 4, 1, 6, 7, -1]);
  assert.equal(codeHasSpec(grid, m), true);
  const c = gridCandidates(grid, m, '');
  assert.deepEqual(c[0], {
    key: 'g1',
    row: 2,
    name: 'BAUHAUS 35アッシュ丸棒 ディンプル付 φ35×4000mm Mオーク',
    price: null,
    listPrice: 18600,
    code: 'BD-134',
    maker: 'マツ六',
    unit: '本',
    pieceLengthM: 0, // 長さの列はない（部材リストに入れるときに商品名の「4000mm」から読む）
    include: true,
    favorite: false,
  });
  assert.deepEqual(c.slice(2).map((x) => [x.code, x.name]), [
    ['BD-08G', 'BAUHAUS セレクト 35エンドブラケットカバー付 ゴールド'],
    ['BJ-33', 'BAUHAUS フリーRレール 錆び止めローバル'],
  ]);
  const r = mergeMaterials([], c, 5);
  assert.deepEqual([r.added, r.unchanged, r.list.length], [3, 1, 3]); // 2回載っている BD-134 は1件
  assert.deepEqual(r.list.map((x) => [x.code, x.price, x.listPrice, x.pieceLengthM]), [
    ['BD-134', 0, 18600, 4], // 仕切価格は空欄 → 0円（あとで入れる）
    ['BD-08G', 0, 2350, 0],
    ['BJ-33', 0, 2350, 0],
  ]);
});

test('仕切価格はあとで取り込める：空欄の表で今の仕切価格を消さない／品番と仕切価格だけの表で入れる', () => {
  const now: Material[] = [
    {id: 'a', name: '手すり', price: 0, listPrice: 18600, pieceLengthM: 4, maker: 'マツ六', code: 'BD-134', unit: '本', favorite: true, updatedAt: 1},
    {id: 'b', name: 'ブラケット', price: 760, listPrice: 2350, pieceLengthM: 0, maker: 'マツ六', code: 'BD-08G', unit: '個', favorite: false, updatedAt: 1},
  ];
  // 品番と仕切価格だけの表（商品名の列なし）
  const grid = textToGrid('品番\t仕切価格\nBD-134\t5,952\nBD-08G\t\nXX-999\t100\n');
  const m = detectMapping(grid);
  assert.deepEqual([m.name, m.code, m.price], [-1, 0, 1]);
  const c = gridCandidates(grid, m, 'マツ六');
  // 仕切価格が空欄の行（BD-08G）は読まない
  assert.deepEqual(c.map((x) => [x.code, x.price, x.include]), [
    ['BD-134', 5952, true],
    ['XX-999', 100, true],
  ]);
  const r = mergeMaterials(now, c, 9);
  assert.deepEqual(r.list.map((x) => [x.code, x.name, x.price, x.listPrice]), [
    ['BD-134', '手すり', 5952, 18600], // 仕切価格が入る（商品名・定価・★はそのまま）
    ['BD-08G', 'ブラケット', 760, 2350], // 空欄の行は今のまま
  ]);
  assert.equal(r.list[0].favorite, true);
  assert.deepEqual([r.added, r.updated], [0, 1]); // 部材リストにない XX-999 は足さない
  // 定価だけの表を取り込み直しても、入っている仕切価格は消えない
  const again = mergeMaterials(
    r.list,
    [{key: 'k', row: 2, name: 'ブラケット', price: null, listPrice: 2450, code: 'BD-08G', maker: 'マツ六', unit: '個', pieceLengthM: 0, include: true, favorite: false}],
    10,
  );
  assert.deepEqual([again.list[1].price, again.list[1].listPrice], [760, 2450]);
});

test('メーカー名を表の上の文字・ファイル名から', () => {
  assert.equal(guessMaker(['2025年10月 価格改定 価格表', 'TOTO九州販売株式会社']), 'TOTO');
  assert.equal(guessMaker(['矢崎化工_住宅改修_価格表.xlsx']), '矢崎化工');
  assert.equal(guessMaker(['ヤザキ 屋外手すり']), '矢崎化工');
  assert.equal(guessMaker(['バリアフリー建材カタログ vol.24 価格表']), '');
});

test('UTF-8（BOM付き）の文字', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('品名,仕切\n手すり,3000\n')]);
  assert.equal(decodeText(bytes), '品名,仕切\n手すり,3000\n');
});

test('Excel からコピーした表（タブ区切り）の貼り付け', () => {
  const grid = textToGrid('品番\t商品名\t定価\t仕切\nBP-600\t手すり 600\t4,800\t3,360\n');
  const m = detectMapping(grid);
  assert.deepEqual([m.code, m.name, m.price, m.list], [0, 1, 3, 2]);
  assert.deepEqual(gridCandidates(grid, m, 'マツ六').map((x) => [x.code, x.name, x.price, x.listPrice]), [['BP-600', '手すり 600', 3360, 4800]]);
});

test('見出しのない表：数字の列を価格、長い文字の列を商品名と推測', () => {
  const grid = parseDelimited('BP-600,手すり I型 600mm,3360\nBP-800,手すり I型 800mm,3920\nBK-01,ブラケット,1500\n', ',');
  const m = detectMapping(grid);
  assert.deepEqual([m.header, m.code, m.name, m.price, m.list], [-1, 0, 1, 2, -1]);
  // 金額の列が2つ並び、左の方がほとんど大きければ、左を定価・右を仕切価格とみなす
  const two = parseDelimited('BP-600,手すり I型 600mm,4800,3360\nBP-800,手すり I型 800mm,5600,3920\nBK-01,ブラケット,2000,1500\n', ',');
  const m2 = detectMapping(two);
  assert.deepEqual([m2.name, m2.price, m2.list], [1, 3, 2]);
  // 左の方が小さい（数量など）なら定価にしない
  const qty = parseDelimited('BP-600,手すり,10,3360\nBP-800,手すり,20,3920\n', ',');
  assert.equal(detectMapping(qty).list, -1);
});

test('PDF・貼り付けの「1行ずつ読む」：右から何番目の数字を仕切価格にするか選べる', () => {
  assert.deepEqual(splitLine('BP-600  手すり I型 600mm  4,800  3,360'), {
    code: 'BP-600',
    name: '手すり I型 600mm',
    unit: '',
    prices: [4800, 3360],
  });
  assert.deepEqual(splitLine('ブラケット（エンド）　￥１，５００'), {code: '', name: 'ブラケット(エンド)', unit: '', prices: [1500]});
  // メーカー名が先頭にあっても品番を見つけ、価格のうしろの「本」は単位にする
  assert.deepEqual(splitLine('マツ六     BP-600   手すり I型 600mm         4800      3360 本'), {
    code: 'BP-600',
    name: 'マツ六 手すり I型 600mm',
    unit: '本',
    prices: [4800, 3360],
  });
  // 「600mm」「35φ」などは商品名のまま。数字だけの品番（例：12345）は品番にしない
  assert.deepEqual(splitLine('12345 手すり 35φ 600mm 3,360'), {code: '', name: '12345 手すり 35φ 600mm', unit: '', prices: [3360]});
  const lines = textToLines('2026年4月改定 仕切価格表\n品番 商品名 定価 仕切\nBP-600 手すり I型 600mm 4,800 3,360\nBK-01\tブラケット\t2,000\t1,500\n- 1 -\n');
  const right1 = lineCandidates(lines, 1, 'マツ六');
  assert.deepEqual(right1.map((c) => [c.code, c.name, c.price]), [
    ['BP-600', '手すり I型 600mm', 3360],
    ['BK-01', 'ブラケット', 1500],
  ]);
  const right2 = lineCandidates(lines, 2, 'マツ六');
  assert.deepEqual(right2.map((c) => c.price), [4800, 2000]);
  // 定価は右から2番目（金額が1つしかない行は定価なし）
  assert.equal(detectListNth(lines), 2);
  assert.deepEqual(lineCandidates(lines, 1, 'マツ六', 2).map((c) => [c.price, c.listPrice]), [
    [3360, 4800],
    [1500, 2000],
  ]);
  assert.deepEqual(lineCandidates(lines, 1, 'マツ六').map((c) => c.listPrice), [null, null]);
  assert.equal(detectListNth(['手すり 3,360', 'ブラケット 1,500']), 0);
});

test('mergeMaterials：同じ品番は価格だけ更新し、★は残す', () => {
  const existing: Material[] = [
    {id: 'a', name: '手すり I型 600mm', price: 3200, listPrice: 4600, pieceLengthM: 0, maker: 'マツ六', code: 'BP-600', unit: '本', favorite: true, updatedAt: 1},
    {id: 'b', name: 'ブラケット', price: 1500, listPrice: 2000, pieceLengthM: 0, maker: 'マツ六', code: '', unit: '', favorite: false, updatedAt: 1},
  ];
  const base = {key: '', row: 1, unit: '', pieceLengthM: 0, include: true, favorite: false, listPrice: null};
  const r = mergeMaterials(
    existing,
    [
      {...base, name: '手すり I型 600mm', price: 3360, listPrice: 4800, maker: 'マツ六', code: 'bp-600'},
      {...base, name: 'ブラケット', price: 1500, maker: 'マツ六', code: ''},
      {...base, name: '手すり I型 800mm', price: 3920, maker: 'マツ六', code: 'BP-800', favorite: true},
      {...base, name: '取り込まない行', price: 100, maker: 'マツ六', code: '', include: false},
    ],
    99,
  );
  assert.deepEqual([r.added, r.updated, r.unchanged], [1, 1, 1]);
  assert.equal(r.list.length, 3);
  assert.deepEqual(r.list[0], {...existing[0], price: 3360, listPrice: 4800, pieceLengthM: 0.6, updatedAt: 99});
  assert.equal(r.list[1].updatedAt, 1); // 変わっていない
  assert.equal(r.list[1].listPrice, 2000); // 表に定価がなければ、前の定価のまま
  assert.equal(r.list[2].favorite, true);
  assert.equal(r.list[2].code, 'BP-800');
  assert.equal(r.list[2].listPrice, 0);
  assert.equal(r.list[2].pieceLengthM, 0.8); // 「800mm」から
});

test('商品名から1本の長さ（m）を読む', () => {
  assert.equal(guessPieceLengthM('木製手すり 35φ 4m'), 4);
  assert.equal(guessPieceLengthM('木製手すり 35φ ４ｍ'), 4);
  assert.equal(guessPieceLengthM('手すり 2.5M ナチュラル'), 2.5);
  assert.equal(guessPieceLengthM('木製手すり 35φ 2000mm'), 2);
  assert.equal(guessPieceLengthM('手すり I型 600mm'), 0.6);
  assert.equal(guessPieceLengthM('ディスタンスバー L=4000'), 4);
  assert.equal(guessPieceLengthM('ブラケット(エンド)'), 0);
  assert.equal(guessPieceLengthM('エンドキャップ 35φ'), 0);
  assert.equal(guessPieceLengthM('L型手すり 600×600'), 0);
  assert.equal(guessPieceLengthM('消毒液 500ml'), 0);
  assert.equal(guessPieceLengthM('TL-4000'), 0); // 品番の「L-4000」は長さにしない
});

test('PDFの表：見出しの位置に合わせて列をそろえる（右寄せの金額・長い商品名）', () => {
  const w = (s: string, x0: number, x1: number) => ({s, x0, x1});
  const rows = [
    [w('サンプル精工', 40, 100), w('仕切価格表', 110, 160)],
    [w('品番', 40, 58), w('商品名', 110, 137), w('定価', 362, 380), w('仕切価格', 424, 460)],
    // 金額は右寄せ（見出しの右端にそろう）。商品名は空白で語に分かれている
    [w('TS-35-600', 40, 80), w('木製手すり', 110, 150), w('35φ', 153, 165), w('600mm', 168, 195), w('4,800', 358, 380), w('3,360', 438, 460)],
    [w('AJ-K01', 40, 66), w('安寿', 110, 128), w('上がり框手すり', 131, 300), w('28,000', 352, 380), w('19,600', 432, 460)],
  ];
  const grid = alignToHeader(rows);
  assert.ok(grid);
  assert.deepEqual(grid[1], ['品番', '商品名', '定価', '仕切価格']);
  assert.deepEqual(grid[2], ['TS-35-600', '木製手すり 35φ 600mm', '4,800', '3,360']);
  assert.deepEqual(grid[3], ['AJ-K01', '安寿 上がり框手すり', '28,000', '19,600']);
  const m = detectMapping(grid);
  assert.deepEqual([m.header, m.code, m.name, m.price, m.list], [1, 0, 1, 3, 2]);
  assert.deepEqual(gridCandidates(grid, m, 'サンプル精工').map((c) => [c.code, c.name, c.price, c.listPrice]), [
    ['TS-35-600', '木製手すり 35φ 600mm', 3360, 4800],
    ['AJ-K01', '安寿 上がり框手すり', 19600, 28000],
  ]);
  assert.equal(alignToHeader([[w('こんにちは', 0, 50)]]), null);
});

test('矢崎化工の改定価格表（PDF）：見出しが列のまん中、商品名は見出しより左から。定価は改定後のガイド価格、仕切価格は空欄', () => {
  const w = (s: string, x0: number, x1: number) => ({s, x0, x1});
  // 実物の位置（A4・pt）。「価格改定」の〇×は、見出しが上下の行（「価格」「改定」）に分かれていて見出しの行にない
  const rows = [
    [w('改定価格表', 40, 120)],
    [w('改定前', 412, 437), w('改定後', 474, 498)],
    [w('価格', 520, 536)],
    [w('品番', 70, 86), w('品名', 240, 257), w('入数', 372, 388), w('ガイド価格', 404, 445), w('ガイド価格', 465, 506), w('UP率', 545, 564)],
    [w('改定', 520, 536)],
    [w('(税抜)', 413, 436), w('(税抜)', 474, 497)],
    [w('HCT-4000', 26, 62), w('T', 66, 71), w('USL', 75, 92), w('φ34屋外手すりパイプ', 133, 215), w('1本', 375, 389), w('14,000', 422, 450), w('14,000', 484, 512), w('×', 525, 532)],
    [w('ECA-5032', 26, 64), w('USL', 68, 85), w('φ34エンドブラケットアウター', 133, 262), w('1個', 375, 389), w('4,550', 427, 450), w('5,000', 489, 512), w('〇', 524, 533), w('110%', 546, 565)],
    [w('住宅改修', 230, 262), w('（屋内手すりφ35', 266, 330), w('テネシスシリーズ）', 334, 368)],
    // 品番が商品名のうしろにもう一度ある。オープンプライスは定価なし
    [w('CKM-02', 26, 55), w('SET', 60, 75), w('GR', 80, 90), w('たちあっぷ', 133, 159), w('ｻﾑﾘﾝｸﾞ', 164, 195), w('CKM-02', 200, 231), w('SET', 236, 252), w('GR', 257, 267), w('1', 378, 383), w('ｵｰﾌﾟﾝﾌﾟﾗｲｽ', 404, 445), w('ｵｰﾌﾟﾝﾌﾟﾗｲｽ', 466, 506), w('×', 525, 532)],
    [w('CKA-JB170', 26, 70), w('10ｲﾘ', 74, 92), w('蓄光リング', 133, 175), w('10枚', 372, 391), w('2,530', 427, 450), w('2,530', 489, 512), w('×', 525, 532)],
    [w('CKA-31', 26, 55), w('たちあっぷⅡ', 133, 180), w('1', 378, 383), w('89,400', 422, 450), w('95,000', 484, 512), w('〇', 524, 533), w('106%', 546, 565)],
  ];
  const grid = alignToHeader(rows);
  assert.ok(grid);
  assert.deepEqual(grid[3], ['品番', '品名', '入数', 'ガイド価格', 'ガイド価格', '', 'UP率']); // 〇×は見出しのない列
  assert.deepEqual(grid[6], ['HCT-4000 T USL', 'φ34屋外手すりパイプ', '1本', '14,000', '14,000', '×', '']);
  assert.deepEqual(grid[9].slice(0, 2), ['CKM-02 SET GR', 'たちあっぷ ｻﾑﾘﾝｸﾞ CKM-02 SET GR']);
  const m = detectMapping(grid);
  assert.deepEqual([m.header, m.code, m.name, m.unit, m.list, m.price], [3, 0, 1, 2, 4, -1]); // ガイド価格は定価（仕切価格にしない）
  assert.deepEqual(
    gridCandidates(grid, m, '矢崎化工').map((c) => [c.code, c.name, c.listPrice, c.price, c.unit, c.pieceLengthM, c.include]),
    [
      ['HCT-4000 T USL', 'φ34屋外手すりパイプ', 14000, null, '本', 4, true], // 1本の長さは品番の 4000（mm）
      ['ECA-5032 USL', 'φ34エンドブラケットアウター', 5000, null, '個', 0, true],
      // 小見出し（住宅改修（屋内手すりφ35 …））は出さない
      ['CKM-02 SET GR', 'たちあっぷ サムリング', null, null, '', 0, false],
      ['CKA-JB170 10イリ', '蓄光リング', 2530, null, '10枚', 0, true],
      ['CKA-31', 'たちあっぷII', 95000, null, '', 0, true],
    ],
  );
});

test('PDFの表：見出しが左寄せで、金額が見出しより右にある（見出しと重ならない）。単位がすぐ右どなり', () => {
  const w = (s: string, x0: number, x1: number) => ({s, x0, x1});
  // test/sasaoka/fixtures/maker-list.pdf と同じ位置
  const rows = [
    [w('メーカー', 55, 99), w('品番', 122, 144), w('商品名', 188, 221), w('定価', 355, 377), w('仕切価格', 410, 454), w('単位', 466, 488)],
    [w('マツ六', 55, 88), w('BP-600', 122, 153), w('手すり', 188, 222), w('I', 225, 228), w('型', 228, 239), w('600mm', 242, 276), w('4800', 386, 408), w('3360', 441, 464), w('本', 466, 477)],
    [w('マツ六', 55, 88), w('BK-01', 122, 148), w('ブラケット（エンド）', 188, 270), w('2000', 386, 408), w('1500', 441, 464), w('個', 466, 477)],
  ];
  assert.deepEqual(alignToHeader(rows), [
    ['メーカー', '品番', '商品名', '定価', '仕切価格', '単位'],
    ['マツ六', 'BP-600', '手すり I 型 600mm', '4800', '3360', '本'],
    ['マツ六', 'BK-01', 'ブラケット（エンド）', '2000', '1500', '個'],
  ]);
});

test('単位・入数の欄と、品番に入った1本の長さ', () => {
  assert.deepEqual(['1個', '1本', '1セット', '1', '10枚', '本', '3本', ''].map(unitText), ['個', '本', 'セット', '', '10枚', '本', '3本', '']);
  assert.equal(codeLengthM('HD5-4000 T LBR', 'φ35手すりイレクターパイプ', '本'), 4);
  assert.equal(codeLengthM('CZA-2500 LBR', 'φ35木製手すり丸棒', '本'), 2.5);
  assert.equal(codeLengthM('CZB-2000 LBR', '木製取付けベース(90幅)', '枚'), 2);
  assert.equal(codeLengthM('CYA-1300 3ボンイリ SGD', 'φ34屋外手すりパイプ', '3本'), 0); // 3本入り
  assert.equal(codeLengthM('ECL-5050 USL', 'φ42ガードパイプエンド', '個'), 0); // 品番の数字は長さではない
  assert.equal(codeLengthM('EB-5036GT GLD', 'φ32着脱手すり対面型', 'セット'), 0);
  assert.equal(codeLengthM('CKE-DK-2000', '伸縮つながるくんカバー', ''), 0); // カバーは切って使う部材ではない
});

test('同じ品番で寸法・色の違う商品は別々に残す（マツ六の「P-30V I-40」「Y-09-GR W50×L25000mm」など）', () => {
  const head = ['メーカー', '商品名', '品番等', '定価', '掛率', '', '備考'];
  const grid = [
    head,
    ['マツ六', 'ソフトハンド', 'P-30V I-40 φ30×400mm ホワイト', '12300', '0.4', '', ''],
    ['マツ六', 'ソフトハンド', 'P-30V I-60 φ30×600mm ホワイト', '14200', '0.4', '', ''],
    ['マツ六', 'パイオランテープ', 'Y-09-GR W50×L25000mm グリーン', 'オープン', '', '', ''],
    ['マツ六', 'パイオランテープ', 'Y-09-GR W38×L25000mm グリーン', '900', '', '', ''],
    ['マツ六', 'パイオランテープ', 'Y-09-GR W75×L25000mm グリーン', '1200', '', '', ''],
    ['マツ六', 'ソフトハンド', 'P-30V I-60 φ30×600mm ホワイト', '14200', '0.4', '', '別のページ'],
  ];
  const m = detectMapping(grid);
  assert.equal(m.price, -1); // 見出しのない列は空欄なので仕切価格はなし
  const c = gridCandidates(grid, m, '');
  const r = mergeMaterials([], c, 1);
  assert.deepEqual(
    r.list.map((x) => [x.code, x.name, x.listPrice]),
    [
      ['P-30V', 'ソフトハンド I-40 φ30×400mm ホワイト', 12300],
      ['P-30V', 'ソフトハンド I-60 φ30×600mm ホワイト', 14200],
      ['Y-09-GR', 'パイオランテープ W38×L25000mm グリーン', 900],
      ['Y-09-GR', 'パイオランテープ W75×L25000mm グリーン', 1200],
    ],
  );
  assert.deepEqual([r.added, r.unchanged], [4, 1]); // 2回載っている I-60 は1件

  // あとで「見出しのない列」に仕切価格を入れた同じ形の表を取り込むと、それぞれの商品に仕切価格が入る
  const filled = grid.map((row, i) => (i === 0 ? row : row.map((v, k) => (k === 5 ? String(Math.round(Number(row[3]) * 0.4) || '') : v))));
  const m2 = detectMapping(filled);
  assert.equal(m2.price, 5);
  const r2 = mergeMaterials(r.list, gridCandidates(filled, m2, ''), 2);
  assert.deepEqual(
    r2.list.map((x) => [x.name.split(' ')[1], x.price]),
    [
      ['I-40', 4920],
      ['I-60', 5680],
      ['W38×L25000mm', 360],
      ['W75×L25000mm', 480],
    ],
  );
  assert.equal(r2.added, 0);

  // 品番と仕切価格だけの表では、同じ品番が2つ以上ある部材は決められないので入れない（1つだけの品番は入る）
  const only = gridCandidates(textToGrid('品番\t仕切価格\nP-30V\t1\n'), {header: 0, name: -1, price: 1, code: 0, maker: -1, unit: -1, list: -1, spec: -1, len: -1}, 'マツ六');
  const r3 = mergeMaterials(r2.list, only, 3);
  assert.deepEqual([r3.updated, r3.list[0].price, r3.list[1].price], [0, 4920, 5680]);
});

test('商品名が変わっても、同じ品番が1つだけなら書き換える（新しい仕切り表に差し替えるとき）', () => {
  const existing: Material[] = [
    {id: 'a', name: '手すり I型 600', price: 3200, listPrice: 4600, pieceLengthM: 0, maker: 'マツ六', code: 'BP-600', unit: '本', favorite: true, updatedAt: 1},
  ];
  const base = {key: '', row: 1, unit: '', pieceLengthM: 0, include: true, favorite: false, maker: 'マツ六'};
  const r = mergeMaterials(existing, [{...base, name: '手すり I型 600mm', code: 'BP-600', price: 3360, listPrice: 4800}], 5);
  assert.deepEqual([r.added, r.updated], [0, 1]);
  assert.deepEqual([r.list[0].name, r.list[0].price, r.list[0].favorite], ['手すり I型 600mm', 3360, true]);
});

test('「1本の長さ」の列を読む（見出しの単位で m・mm・cm）', () => {
  const grid = textToGrid('品番\t品名\t入数\t1本の長さ(m)\t定価(税抜)\t仕切価格\nHD5-4000 T LBR\tφ35手すりイレクターパイプ\t1本\t4\t10,480\t\nCZA-2500 LBR\tφ35木製手すり丸棒\t1本\t2.5\t9,490\t\nECA-5031 SGD\tφ34つなぎジョイント\t1個\t\t4,300\t\n');
  const m = detectMapping(grid);
  assert.deepEqual([m.code, m.name, m.unit, m.len, m.list, m.price], [0, 1, 2, 3, 4, 5]);
  const c = gridCandidates(grid, m, '矢崎化工');
  assert.deepEqual(c.map((x) => [x.code, x.pieceLengthM, x.listPrice, x.price]), [
    ['HD5-4000 T LBR', 4, 10480, null],
    ['CZA-2500 LBR', 2.5, 9490, null],
    ['ECA-5031 SGD', 0, 4300, null],
  ]);
  assert.deepEqual(mergeMaterials([], c, 1).list.map((x) => x.pieceLengthM), [4, 2.5, 0]);
  assert.equal(parseLengthM('4000', '長さ(mm)'), 4);
  assert.equal(parseLengthM('120', '長さ(cm)'), 1.2);
  assert.equal(parseLengthM('2000', '長さ'), 2); // 単位がなく 100 以上は mm
  assert.equal(parseLengthM('4m', '長さ'), 4);
  assert.equal(parseLengthM('', '長さ'), 0);
});

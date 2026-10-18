import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strToU8, zipSync} from 'fflate';
import {
  alignToHeader,
  decodeText,
  detectListNth,
  detectMapping,
  guessPieceLengthM,
  gridCandidates,
  lineCandidates,
  mergeMaterials,
  parseDelimited,
  parsePrice,
  splitLine,
  textToGrid,
  textToLines,
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
  assert.deepEqual(m, {header: 1, name: 2, price: 4, code: 1, maker: 0, unit: 5, list: 3});
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

test('定価の列しかない表：仕切価格も定価の列（取り込む画面で選び直せる）', () => {
  const grid = textToGrid('商品名\t定価\n手すり 600\t4,800\n');
  const m = detectMapping(grid);
  assert.deepEqual([m.name, m.price, m.list], [0, 1, 1]);
  assert.deepEqual(gridCandidates(grid, m, '').map((x) => [x.price, x.listPrice]), [[4800, 4800]]);
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
  const base = {key: '', row: 1, unit: '', include: true, favorite: false, listPrice: null};
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

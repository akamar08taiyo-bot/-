import assert from 'node:assert/strict';
import test from 'node:test';
import {strToU8, zipSync} from 'fflate';
import {
  detectMapping,
  gridCandidates,
  guessMaker,
  guessSupplier,
  lineCandidates,
  mergeProducts,
  parsePrice,
  taisText,
  taxTypeOf,
  textToGrid,
} from '../../src/tokutei/import/priceImport.ts';
import type {Candidate} from '../../src/tokutei/import/priceImport.ts';
import {readXlsx} from '../../src/tokutei/import/xlsx.ts';
import type {Product} from '../../src/tokutei/types.ts';

// 福祉用具の仕切り一覧表によくある並び（見本。ユーザーの価格表はリポジトリに入れない）
const TABLE = [
  ['介護用品 仕切り一覧表　2026年10月'],
  ['品番', '商品名', 'メーカー', 'TAISコード', 'JANコード', '定価(税抜)', '仕切価格', '税区分'],
  ['536-057', 'シャワーベンチ FSフィット ブルー', 'アロン化成', '00170000123', '4970210123456', '35,000', '21,000', '課税'],
  ['536-480', '浴槽台 ユクリア', 'アロン化成', '00170-000456', '', '13,800', '8,280', '課税'],
  ['FS4-B', '4点ステッキS', 'イーストアイ', '', '', '12,000', '7,200', '非課税'],
  ['T-100', 'T字杖 折りたたみ', 'イーストアイ', '', '', '4,000', '2,400', '非課税'],
  ['', '入浴用品', '', '', '', '', '', ''],
];

test('見出しから 品番・商品名・メーカー・TAIS・JAN・定価・仕切・税区分 の列を見つける', () => {
  const m = detectMapping(TABLE);
  assert.equal(m.header, 1);
  assert.deepEqual(
    [m.code, m.name, m.maker, m.tais, m.jan, m.list, m.price, m.tax],
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(m.priceTaxIn, false);
  assert.equal(m.listTaxIn, false);
});

test('候補：TAIS は 5桁-6桁 に、税区分・種目も読む。小見出しの行は入れない。T字杖は種目なしで理由を出す', () => {
  const c = gridCandidates(TABLE, detectMapping(TABLE), '');
  assert.equal(c.length, 4);
  assert.deepEqual(
    c.map((x) => [x.code, x.name, x.listPrice, x.price, x.tais, x.taxType, x.category, x.sub]),
    [
      ['536-057', 'シャワーベンチ FSフィット ブルー', 35000, 21000, '00170-000123', '10%', '入浴補助用具', '入浴用いす'],
      ['536-480', '浴槽台 ユクリア', 13800, 8280, '00170-000456', '10%', '入浴補助用具', '浴槽内いす'],
      ['FS4-B', '4点ステッキS', 12000, 7200, '', '非課税', '歩行補助つえ', '多点杖'],
      ['T-100', 'T字杖 折りたたみ', 4000, 2400, '', '非課税', '', ''],
    ],
  );
  assert.equal(c[0].jan, '4970210123456');
  assert.match(c[3].warn, /1本の杖は対象外/);
});

test('見出しに「税込」とある金額は税抜に直す（非課税の行はそのまま）', () => {
  const grid = [
    ['商品名', '定価(税込)', '仕切(税込)', '税区分'],
    ['シャワーチェア', '38,500', '23,100', '課税'],
    ['多点杖', '12,000', '7,200', '非課税'],
  ];
  const m = detectMapping(grid);
  assert.equal(m.listTaxIn, true);
  assert.equal(m.priceTaxIn, true);
  const c = gridCandidates(grid, m, '');
  assert.deepEqual(
    c.map((x) => [x.listPrice, x.price]),
    [
      [35000, 21000],
      [12000, 7200],
    ],
  );
});

test('Excel からコピーした表（タブ区切り）も読める', () => {
  const grid = textToGrid('品番\t品名\t定価\t納価\nAB-1\tバスグリップ\t9,800\t5,880\n');
  const c = gridCandidates(grid, detectMapping(grid), 'アロン化成');
  assert.deepEqual(
    c.map((x) => [x.code, x.name, x.maker, x.listPrice, x.price, x.category, x.sub]),
    [['AB-1', 'バスグリップ', 'アロン化成', 9800, 5880, '入浴補助用具', '浴槽用手すり']],
  );
});

test('1行ずつ読む（PDF の文字）：右から1番目を仕切、2番目を定価', () => {
  const c = lineCandidates(['536-057 シャワーベンチ FSフィット 35,000 21,000'], 1, 'アロン化成', 2);
  assert.deepEqual(
    c.map((x) => [x.code, x.name, x.listPrice, x.price, x.category]),
    [['536-057', 'シャワーベンチ FSフィット', 35000, 21000, '入浴補助用具']],
  );
});

test('メーカー名・仕入先・TAIS・税区分の小さな部品', () => {
  assert.equal(guessMaker(['安寿 仕切表.xlsx']), 'アロン化成');
  assert.equal(guessMaker(['エイジフリー 価格表']), 'パナソニック エイジフリー');
  assert.equal(guessSupplier(['ケアマックス_仕切り一覧_2026.xlsx'], ['ケアマックス', 'ウェルファン']), 'ケアマックス');
  assert.equal(taisText('00170000123'), '00170-000123');
  assert.equal(taxTypeOf('非課税'), '非課税');
  assert.equal(taxTypeOf('8%'), '8%');
  assert.equal(taxTypeOf('課税'), '10%');
  assert.equal(parsePrice('￥12,000'), 12000);
});

const product = (over: Partial<Product>): Product => ({
  id: 'p1',
  name: '',
  maker: '',
  code: '',
  tais: '',
  jan: '',
  category: '',
  sub: '',
  categoryByHand: false,
  listPrice: 0,
  cost: 0,
  taxType: '10%',
  unit: '',
  supplier: '',
  favorite: false,
  useCount: 0,
  lastUsedAt: 0,
  source: '',
  updatedAt: 1,
  ...over,
});

test('商品マスタへの取り込み：同じメーカー＋品番は価格だけ新しく。★・手で選んだ種目・使った回数は残す', () => {
  const existing = [
    product({
      id: 'p1',
      name: 'シャワーベンチ FSフィット ブルー',
      maker: 'アロン化成',
      code: '536-057',
      listPrice: 34000,
      cost: 20400,
      favorite: true,
      useCount: 7,
      category: '入浴補助用具',
      sub: '入浴台', // 手で選んだ（自動とは違う細目）
      categoryByHand: true,
      taxType: '非課税', // 手で直した税区分
    }),
  ];
  const incoming: Candidate[] = gridCandidates(TABLE, detectMapping(TABLE), '').map((c) => ({...c, taxKnown: c.code !== '536-057' && c.taxKnown}));
  const r = mergeProducts(existing, incoming, '仕切り一覧2026-10.xlsx', 'ケアマックス', 99);
  assert.equal(r.added, 2); // 浴槽台・4点ステッキ（対象外のT字杖は、最初はチェックしない）
  assert.equal(r.updated, 1);
  const p1 = r.list.find((p) => p.id === 'p1')!;
  assert.deepEqual(
    [p1.listPrice, p1.cost, p1.favorite, p1.useCount, p1.sub, p1.categoryByHand, p1.taxType, p1.tais, p1.supplier, p1.source, p1.updatedAt],
    [35000, 21000, true, 7, '入浴台', true, '非課税', '00170-000123', 'ケアマックス', '仕切り一覧2026-10.xlsx', 99],
  );
  const stool = r.list.find((p) => p.code === '536-480')!;
  assert.deepEqual([stool.category, stool.sub, stool.supplier, stool.favorite], ['入浴補助用具', '浴槽内いす', 'ケアマックス', false]);
});

test('取り込みの確認で選んだ種目・★は、手で選んだものとして入る', () => {
  const c = gridCandidates(TABLE, detectMapping(TABLE), '').filter((x) => x.code === 'T-100');
  const r = mergeProducts([], [{...c[0], include: true, favorite: true, category: '歩行補助つえ', sub: '多点杖', categoryByHand: true}]);
  assert.equal(r.list.length, 1);
  assert.deepEqual([r.list[0].category, r.list[0].categoryByHand, r.list[0].favorite], ['歩行補助つえ', true, true]);
});

test('仕切だけの表（品番と仕切の列だけ）は、同じ品番の商品に仕切だけを入れる', () => {
  const grid = [
    ['品番', '仕切価格'],
    ['536-057', '19,800'],
    ['XX-999', '1,000'],
  ];
  const m = detectMapping(grid);
  const c = gridCandidates(grid, m, 'アロン化成');
  const r = mergeProducts([product({id: 'p1', name: 'シャワーベンチ', maker: 'アロン化成', code: '536-057', listPrice: 35000, cost: 0})], c);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].cost, 19800);
  assert.equal(r.list[0].listPrice, 35000);
});

test('Excel（.xlsx）の表を読む', () => {
  const xml = (rows: string[][]) =>
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows
      .map(
        (r, i) =>
          `<row r="${i + 1}">` +
          r.map((v, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join('') +
          '</row>',
      )
      .join('') +
    '</sheetData></worksheet>';
  const bytes = zipSync({
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="仕切" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(xml(TABLE.slice(1, 4))),
  });
  const sheets = readXlsx(bytes);
  assert.equal(sheets[0].name, '仕切');
  const c = gridCandidates(sheets[0].rows, detectMapping(sheets[0].rows), '');
  assert.deepEqual(
    c.map((x) => [x.code, x.listPrice, x.price]),
    [
      ['536-057', 35000, 21000],
      ['536-480', 13800, 8280],
    ],
  );
});

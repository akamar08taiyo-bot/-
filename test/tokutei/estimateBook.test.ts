// 販売見積書（estimateBook.ts）：会社の見積書の原本（print/mitsumori.xltx）に書く欄・式の答え・備考の介護保険の内訳・プレビュー。
// 値はすべて架空（見本）
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {saleTotals} from '../../src/tokutei/calc.ts';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {ESTIMATE_ROWS, estimateFileName, estimateNotes, estimateOverflow, estimatePreview, fillEstimate} from '../../src/tokutei/estimateBook.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';
import {cellFormula, readCell} from '../../src/tokutei/xlsxEdit.ts';
import type {Files} from '../../src/tokutei/xlsxEdit.ts';

// 見本の案件（架空の方。本当のお客様の情報は使わない）
const S = {...defaultSettings(), company: '太陽シルバーサービス株式会社', officeName: '行橋営業所'};

function item(over: Partial<SaleItem>): SaleItem {
  return {
    id: 'i',
    productId: null,
    name: '',
    maker: '',
    code: '',
    tais: '',
    category: '',
    sub: '',
    unit: '台',
    supplier: '',
    taxType: '10%',
    listPrice: 0,
    cost: 0,
    qty: 1,
    discountRate: 20,
    unitPrice: null,
    reason: '',
    ...over,
  };
}

function sale(over: Partial<Sale> = {}): Sale {
  return {
    id: 's',
    customer: '見本 花子',
    kana: 'ミホン ハナコ',
    insuredNo: '1234567',
    birthDate: '1940-03-15',
    gender: '女',
    zip: '8240005',
    address: '行橋市中央1丁目2-3',
    tel: '0930-00-0000',
    careLevel: '要介護2',
    insurer: 'yukuhashi',
    insurerName: '',
    burdenRatio: 1,
    payMethod: '受領委任払い',
    remaining: null,
    perItem: false,
    welfare: false,
    staff: '土居 翔太',
    careOffice: '見本居宅介護支援事業所',
    careManager: '見本 太郎',
    carePlan: '',
    quoteNo: '20261022-1',
    estimateDate: '2026-10-22',
    applyDate: '2026-10-22',
    approveDate: '',
    deliveryDate: '2026-10-30',
    claimDate: '2026-11-02',
    collectDate: '',
    status: '申請',
    note: '',
    items: [
      item({id: 'a', name: 'シャワーチェア 見本A', maker: '見本工業', code: 'SC-01', tais: '00001-000001', category: '入浴補助用具', sub: '入浴用いす', listPrice: 32000, reason: '浴室の床からの立ち座りが困難なため。'}),
      item({id: 'b', name: '浴槽手すり 見本B', maker: '見本製作所', category: '入浴補助用具', sub: '浴槽用手すり', listPrice: 15800, qty: 2, unit: '個', reason: '浴槽の出入りでふらつくため。'}),
    ],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const template = (): Files => unzipSync(new Uint8Array(readFileSync(new URL('../../src/tokutei/print/mitsumori.xltx', import.meta.url))));
const SH = '見積書';

test('販売見積書：宛名・見積番号・見積日・営業所・件名・明細（品名・数量・単位・単価・金額の式・税率）', () => {
  const f = unzipSync(fillEstimate(template(), sale(), S));
  assert.equal(readCell(f, SH, 'A6'), '見本 花子　様');
  assert.equal(readCell(f, SH, 'I4'), '№　20261022-1');
  assert.equal(readCell(f, SH, 'I5'), '46317'); // 2026-10-22（Excel の日付の数）
  assert.equal(readCell(f, SH, 'H9'), '行橋営業所');
  assert.equal(readCell(f, SH, 'H12'), '福岡県行橋市大字流末1327番地'); // 原本の式（マスタのシート）の答え
  assert.match(cellFormula(f, SH, 'H12'), /^VLOOKUP\(H9,マスタ!/);
  assert.equal(readCell(f, SH, 'B14'), '特定福祉用具の購入');
  // 1行目：シャワーチェア 見本A（品番）・1台・32,000×0.8＝25,600円・10%
  assert.deepEqual(['A23', 'F23', 'G23', 'H23', 'I23', 'J23'].map((r) => readCell(f, SH, r)), ['シャワーチェア 見本A　SC-01', '1', '台', '25600', '25600', '0.1']);
  assert.equal(cellFormula(f, SH, 'I23'), 'IF(F23*H23,F23*H23,"")');
  // 2行目：浴槽手すり 見本B・2個・15,800×0.8＝12,640円 ×2＝25,280円
  assert.deepEqual(['A24', 'F24', 'G24', 'H24', 'I24'].map((r) => readCell(f, SH, r)), ['浴槽手すり 見本B', '2', '個', '12640', '25280']);
  // 3行目から下は空（原本で式のない行には書かない）
  assert.equal(readCell(f, SH, 'A25'), '');
  assert.equal(readCell(f, SH, 'I25'), '');
  // 品名の欄の書式はどの行も1行目と同じ（原本の2行目の10pt・3行目の赤の太字は使わない）。いちばん下の行は下の罫線の書式のまま
  const xml = strFromU8(f['xl/worksheets/sheet1.xml']);
  const style = (ref: string) => new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`).exec(xml)?.[1];
  for (const r of [24, 25, 41]) assert.equal(style(`A${r}`), style('A23'), `A${r}`);
  assert.notEqual(style('A42'), style('A23'));
  // 値段のない品目（手で入れてまだ値段がない）は単価・金額を空に
  const g = unzipSync(fillEstimate(template(), sale({items: [item({name: '見本の商品', listPrice: 0})]}), S));
  assert.deepEqual(['A23', 'F23', 'H23', 'I23'].map((r) => readCell(g, SH, r)), ['見本の商品', '1', '', '']);
});

test('販売見積書：合計は原本の式（税率ごとの合計・切り捨ての消費税）。答えもアプリの金額と同じ', () => {
  const v = sale();
  const t = saleTotals(v, S);
  const f = unzipSync(fillEstimate(template(), v, S));
  assert.equal(cellFormula(f, SH, 'E21'), 'C46+E46');
  assert.equal(Number(readCell(f, SH, 'C46')), t.amount); // 25,600＋25,280＝50,880
  assert.equal(Number(readCell(f, SH, 'E46')), t.tax); // 5,088
  assert.equal(Number(readCell(f, SH, 'E21')), t.total); // 55,968
  assert.equal(Number(readCell(f, SH, 'C47')), t.amount); // 10%対象
  // 非課税の商品は非課税の欄（消費税は「-」のまま）
  const g = unzipSync(fillEstimate(template(), sale({items: [item({id: 'n', name: '見本の杖', listPrice: 10000, taxType: '非課税'})]}), S));
  assert.equal(readCell(g, SH, 'J23'), '非課税');
  assert.deepEqual([readCell(g, SH, 'C47'), readCell(g, SH, 'C50'), readCell(g, SH, 'E21')], ['', '8000', '8000']);
});

test('販売見積書の備考：介護保険の内訳（受領委任払い・償還払い）と見積書の備考に足す文（3行まで）', () => {
  const v = sale({note: 'デモ機の貸し出しがあります。\n納品の前にお電話いたします。'});
  const t = saleTotals(v, S);
  const notes = estimateNotes(v, t);
  assert.equal(notes.length, 3);
  assert.match(notes[0], /^介護保険（受領委任払い）：介護保険の対象 55,968円　利用者負担（1割）5,597円　保険者負担（9割）50,371円$/);
  assert.equal(notes[1], 'お支払いいただく金額 5,597円');
  assert.equal(notes[2], 'デモ機の貸し出しがあります。');
  const back = estimateNotes(sale({payMethod: '償還払い'}), saleTotals(sale({payMethod: '償還払い'}), S));
  assert.equal(back[1], 'いったんお支払いいただく金額 55,968円（あとで保険者から 50,371円が払い戻されます）');
  const f = unzipSync(fillEstimate(template(), v, S));
  assert.equal(readCell(f, SH, 'A59'), '備　　考'); // 見出しはそのまま
  assert.deepEqual(['A60', 'A61', 'A62'].map((r) => readCell(f, SH, r)), notes);
});

test('販売見積書のプレビュー：原本の1枚。欄を押すと入れる所へ（宛名・番号・日付・明細・備考）', () => {
  const pages = estimatePreview(template(), sale(), S);
  assert.equal(pages.length, 1);
  const text = pages[0].texts.map((x) => x.runs.map((r) => r.text).join('')).join('\n');
  for (const s of ['御　見　積　書', '見本 花子　様', 'シャワーチェア 見本A　SC-01', '55,968', '太陽シルバーサービス株式会社', '登録番号：T1290001044462']) assert.ok(text.includes(s), s);
  assert.deepEqual([...new Set(pages[0].fields.map((x) => x.field))].sort(), ['customer', 'estimateDate', 'items', 'note', 'quoteNo']);
  // 印の枠（グループの中の2つの四角）は描く。赤い枠・説明の文字（印刷しない図形）は描かない
  assert.equal(pages[0].shapes.filter((x) => x.kind === 'rect' && !x.text).length, 2);
  assert.ok(!text.includes('赤枠内は編集不可です'));
});

test('販売見積書の原本：所長の印影の画像・作った人・パスを入れていない。名前・明細の行より多い商品', () => {
  const t = template();
  assert.ok(!Object.keys(t).some((k) => k.startsWith('xl/media/')));
  assert.ok(!/<xdr:pic>/.test(strFromU8(t['xl/drawings/drawing1.xml'])));
  assert.ok(!/absPath|OneDrive/.test(strFromU8(t['xl/workbook.xml'])));
  // 作った人・コメントを書いた人（パソコンの名前）も消した
  assert.match(strFromU8(t['docProps/core.xml']), /<dc:creator><\/dc:creator><cp:lastModifiedBy><\/cp:lastModifiedBy>/);
  assert.match(strFromU8(t['xl/comments1.xml']), /<authors><author><\/author><\/authors>/);
  assert.equal(estimateFileName(sale()), '御見積書_見本 花子様.xlsx');
  assert.equal(estimateFileName(sale({customer: ''})), '御見積書_（お客様名未入力）.xlsx');
  assert.equal(ESTIMATE_ROWS.length, 20);
  assert.equal(estimateOverflow(sale({items: Array.from({length: 22}, (_, i) => item({id: `x${i}`, name: `見本 ${i}`}))})), 2);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {saleTotals} from '../../src/tokutei/calc.ts';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {buildEstimateXlsx, estimateXlsxName} from '../../src/tokutei/print/estimateXlsx.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';

// 見積書の Excel が、印刷（calc.ts の saleTotals）と同じ金額の計算式になっているか。
// 式の中身（切り捨て・切り上げ・介護保険の内訳）は、LibreOffice で計算し直して同じ値になることも別に確かめた。

const S = defaultSettings();

function item(over: Partial<SaleItem> = {}): SaleItem {
  return {
    id: 'i',
    productId: null,
    name: 'シャワーベンチ FSフィット',
    maker: 'アロン化成',
    code: '536-057',
    tais: '',
    category: '入浴補助用具',
    sub: '入浴用いす',
    unit: '台',
    supplier: '',
    taxType: '10%',
    listPrice: 35000,
    cost: 21000,
    qty: 1,
    discountRate: 20,
    unitPrice: null,
    ...over,
  };
}

function sale(items: SaleItem[], over: Partial<Sale> = {}): Sale {
  return {
    id: 's',
    customer: '見本 花子',
    kana: '',
    insuredNo: '',
    birthDate: '',
    address: '',
    tel: '',
    careLevel: '',
    insurer: 'yukuhashi',
    insurerName: '',
    burdenRatio: 1,
    payMethod: '受領委任払い',
    remaining: null,
    perItem: false,
    welfare: false,
    staff: '見本 太郎',
    careOffice: '',
    careManager: '',
    quoteNo: 'T-001',
    estimateDate: '2026-10-21',
    applyDate: '',
    approveDate: '',
    deliveryDate: '',
    collectDate: '',
    status: '見積',
    note: '',
    items,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const two = [item(), item({id: 'j', name: '浴槽台 ユクリア', code: '536-480', sub: '浴槽内いす', listPrice: 13800, cost: 8280})];

function parts(x: Sale) {
  const files = unzipSync(buildEstimateXlsx(x, S));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  const strings = strFromU8(files['xl/sharedStrings.xml']);
  // 式と、開いた時点の値（キャッシュ）の組
  const formulas = [...sheet.matchAll(/<f>([^<]*)<\/f>(?:<v>([^<]*)<\/v>)?/g)].map((m) => ({f: m[1].replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), v: m[2]}));
  return {files, sheet, strings, formulas};
}
const valueOf = (fs: {f: string; v?: string}[], pattern: RegExp) => fs.filter((x) => pattern.test(x.f)).map((x) => x.v);

test('金額・消費税・合計が印刷と同じ値の計算式（1円未満は切り捨て）', () => {
  const x = sale(two);
  const t = saleTotals(x, S);
  const {formulas} = parts(x);
  assert.deepEqual(valueOf(formulas, /^INT\(ROUND\(/), ['28000', '11040']);
  assert.deepEqual(valueOf(formulas, /^INT\([A-Z]+\d+\*10\/100\)$/), ['2800', '1104']);
  assert.equal(t.total, 42944);
  assert.ok(valueOf(formulas, /^SUM\([^)]*\)\+SUM\([^)]*\)$/).every((v) => v === '42944'));
  assert.ok(formulas.some((x) => x.f.startsWith('"合計（税込）　¥"&TEXT(') && x.v === '合計（税込）　¥42,944'));
});

test('介護保険の内訳：利用者負担は切り上げ、保険者負担は残り', () => {
  const {formulas} = parts(sale(two));
  assert.deepEqual(valueOf(formulas, /^CEILING\(MIN\([A-Z]+\d+,100000\)\*1\/10,1\)$/), ['4295']); // 1割（42,944 → 4,295）
  assert.ok(valueOf(formulas, /^MAX\(0,MIN\(/).every((v) => v === '38649'));
});

test('今年度の残りを超えた分・個別切り上げ・生活保護・償還払い', () => {
  // 残り 30,000円：対象 30,000、超えた分 12,944、利用者 3,000＋12,944
  const over = parts(sale(two, {remaining: 30000}));
  assert.ok(over.strings.includes('限度額を超えた分（全額ご負担）'));
  assert.deepEqual(valueOf(over.formulas, /^\([A-Z]+\d+-MIN\(/), ['12944']);
  assert.ok(over.formulas.some((x) => x.v === String(3000 + 12944)));
  // 個別切り上げ（2割）：品目ごとに切り上げる式
  const per = sale(two, {perItem: true, burdenRatio: 2});
  const tp = saleTotals(per, S);
  assert.ok(tp.perItemApplied);
  assert.ok(parts(per).formulas.some((x) => x.f.includes('SUMPRODUCT(CEILING(') && x.v === String(tp.share)));
  // 生活保護：利用者負担は 0、負担割合の分は介護扶助
  const w = parts(sale(two, {welfare: true}));
  assert.ok(w.strings.includes('介護扶助（1割）'));
  assert.ok(w.formulas.some((x) => x.f === '0' && x.v === '0'));
  // 償還払い：いったん全額、あとで払い戻される金額
  const rp = parts(sale(two, {payMethod: '償還払い'}));
  assert.ok(rp.strings.includes('お支払いいただく金額（いったん全額）'));
  assert.ok(rp.strings.includes('あとで保険者から払い戻される金額'));
});

test('非課税の品目は消費税の欄が「非課税」（値は 0 なので合計の式はそのまま使える）', () => {
  const x = sale([item({name: '4点ステッキS', taxType: '非課税', category: '歩行補助つえ', sub: '多点杖', listPrice: 12000})]);
  const {files, formulas} = parts(x);
  assert.match(strFromU8(files['xl/styles.xml']), /formatCode="&quot;非課税&quot;;&quot;非課税&quot;;&quot;非課税&quot;"/);
  assert.ok(valueOf(formulas, /^SUM\([^)]*\)\+SUM\([^)]*\)$/).every((v) => v === '9600'));
});

test('宛名・会社の枠・備考・A4縦1枚の印刷設定・ファイル名', () => {
  const {sheet, strings} = parts(sale(two, {note: 'デモ機を含みます'}));
  for (const s of ['見本 花子　', '様', '御　 見　 積　 書', '見積番号', 'T-001', '2026年10月21日', '太陽シルバーサービス株式会社', '登録番号', '所長印', '担当印', '担当　見本 太郎', '備考', 'デモ機を含みます', '特定福祉用具（介護保険）']) {
    assert.ok(strings.includes(s), s);
  }
  assert.match(sheet, /paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/);
  assert.equal(estimateXlsxName(sale(two)), '御見積書_見本 花子様.xlsx');
  assert.equal(estimateXlsxName(sale(two, {customer: ''})), '御見積書_（お客様名未入力）.xlsx');
});

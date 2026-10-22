import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {carePlanOf, excelDate, fillShinsei, padInsuredNo, reasonText, SHINSEI, shinseiChecks, shinseiFileName, shinseiValues} from '../../src/tokutei/shinsei.ts';
import type {ShinseiKey} from '../../src/tokutei/shinsei.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';
import {cellFormula, ellipseCount, readCell, sheetPaths} from '../../src/tokutei/xlsxEdit.ts';
import type {Files} from '../../src/tokutei/xlsxEdit.ts';

// 見本の案件（架空の方。本当のお客様の情報は使わない）
const S = {...defaultSettings(), company: '太陽シルバーサービス株式会社'};

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

const TEMPLATE_FILES: Record<ShinseiKey, string> = {yukuhashi: 'yukuhashi.xltx', kanda: 'kanda.xltx', miyako: 'miyako.xlsx'};
const template = (key: ShinseiKey): Files => unzipSync(new Uint8Array(readFileSync(new URL(`../../src/tokutei/shinsei/${TEMPLATE_FILES[key]}`, import.meta.url))));
const fill = (key: ShinseiKey, over: Partial<Sale> = {}): Files => unzipSync(fillShinsei(template(key), SHINSEI[key], shinseiValues(sale({insurer: key, ...over}), S)));

test('被保険者番号は10けた（足りない左は0）', () => {
  assert.equal(padInsuredNo('11530'), '0000011530');
  assert.equal(padInsuredNo('１２３４５６７８９０'), '1234567890');
  assert.equal(padInsuredNo(''), '');
});

test('理由：用具が2つ以上なら用具ごとに頭に名前を付ける', () => {
  const v = shinseiValues(sale(), S);
  assert.equal(reasonText(v), '入浴用いす：浴室の床からの立ち座りが困難なため。\n浴槽用手すり：浴槽の出入りでふらつくため。');
  const one = shinseiValues(sale({items: [sale().items[0]]}), S);
  assert.equal(reasonText(one), '浴室の床からの立ち座りが困難なため。');
});

test('申請書に書く値：福祉用具名・製造事業者名及び販売事業者名・購入金額・保険給付額', () => {
  const v = shinseiValues(sale(), S);
  assert.equal(v.items[0].label, '入浴補助用具（入浴用いす）\nシャワーチェア 見本A');
  assert.equal(v.items[0].makerSeller, '見本工業\n太陽シルバーサービス株式会社');
  assert.equal(v.items[0].total, 28160); // 32,000×0.8＝25,600 ＋ 税 2,560
  assert.equal(v.items[1].label, '入浴補助用具（浴槽用手すり）\n浴槽手すり 見本B（2個）');
  assert.equal(v.items[1].total, 27808); // 12,640×2＝25,280 ＋ 税 2,528
  assert.equal(v.benefit, 55968 - Math.ceil(55968 / 10));
  assert.equal(v.recorder, '見本居宅介護支援事業所　見本 太郎');
  assert.equal(v.zip, '824-0005');
  assert.equal(carePlanOf({carePlan: '', careOffice: 'A'}), '有');
  assert.equal(carePlanOf({carePlan: '無', careOffice: 'A'}), '無');
  assert.equal(carePlanOf({carePlan: '', careOffice: ''}), '');
});

test('行橋市：事前申請書・委任状・完了写真に書く', () => {
  const f = fill('yukuhashi');
  const sh = '用具・受領委任払';
  assert.equal(readCell(f, sh, 'F4'), 'ミホン ハナコ');
  assert.equal(readCell(f, sh, 'F5'), '見本 花子');
  assert.deepEqual(['Z7', 'AA7', 'AB7', 'AC7', 'AD7', 'AE7', 'AF7', 'AG7', 'AH7', 'AI7'].map((r) => readCell(f, sh, r)).join(''), '0001234567');
  assert.equal(readCell(f, sh, 'Z4'), '4'); // 事業者番号は原本のまま
  assert.equal(readCell(f, sh, 'F9'), '明・大・昭　15年3月15日生');
  assert.equal(readCell(f, sh, 'G10'), '824-0005');
  assert.equal(readCell(f, sh, 'F11'), '行橋市中央1丁目2-3');
  assert.equal(readCell(f, sh, 'A15'), '入浴補助用具（入浴用いす）\nシャワーチェア 見本A');
  assert.equal(readCell(f, sh, 'L16'), '見本製作所\n太陽シルバーサービス株式会社');
  assert.equal(readCell(f, sh, 'V15'), '28160');
  assert.equal(readCell(f, sh, 'AB15'), '令和8年10月30日');
  assert.equal(readCell(f, sh, 'AB17'), '　　　年　　月　　日'); // 使わない行は原本のまま
  assert.match(readCell(f, sh, 'E18'), /^入浴用いす：/);
  assert.equal(readCell(f, sh, 'L20'), '見本居宅介護支援事業所　見本 太郎');
  assert.equal(readCell(f, sh, 'C26'), '令和8年10月22日');
  assert.match(readCell(f, sh, 'G29'), /久保/); // 申請者（会社）は原本のまま
  assert.equal(ellipseCount(f, sh), 3); // 元号（昭）・性別・要介護度
  // 委任状
  assert.match(readCell(f, '委任状', 'B23'), /50,371円$/);
  assert.match(readCell(f, '委任状', 'A29'), /令和8年10月22日$/);
  assert.match(readCell(f, '委任状', 'A32'), /住　所　　行橋市中央1丁目2-3$/);
  assert.match(readCell(f, '委任状', 'A36'), /氏　名　　見本 花子　+㊞/);
  // 完了写真：氏名・番号は式（答えも合わせる）。式の誤り（G2 が AD7）は直してある。納品名・撮影日は書く
  assert.equal(readCell(f, '完了写真', 'B2'), '見本 花子');
  assert.equal(cellFormula(f, '完了写真', 'G2'), '用具・受領委任払!AC7');
  assert.equal(['D2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2', 'K2', 'L2', 'M2'].map((r) => readCell(f, '完了写真', r)).join(''), '0001234567');
  assert.equal(readCell(f, '完了写真', 'B3'), 'シャワーチェア 見本A / SC-01、浴槽手すり 見本B');
  assert.equal(readCell(f, '完了写真', 'B4'), String(excelDate('2026-10-30')));
  // 雛形 → ふつうのブック、開いたときに計算し直す、計算の順番の表は外す
  assert.match(strFromU8(f['[Content_Types].xml']), /spreadsheetml\.sheet\.main\+xml/);
  assert.match(strFromU8(f['xl/workbook.xml']), /fullCalcOnLoad="1"/);
  assert.equal(f['xl/calcChain.xml'], undefined);
  assert.equal(sheetPaths(f).size, 3); // シートは消さない
});

test('苅田町：支給申請書は事前申請書を参照する式。丸は両方に', () => {
  const f = fill('kanda');
  const pre = '用具・受領委任払';
  const post = '用具・支給申請　受領委任払 (2)';
  assert.equal(['Z4', 'AA4', 'AB4', 'AC4', 'AD4', 'AE4', 'AF4', 'AG4', 'AH4', 'AI4'].map((r) => readCell(f, pre, r)).join(''), '0001234567');
  assert.equal(readCell(f, pre, 'K30'), '0930-00-0000'); // 申請者（本人）の電話
  assert.equal(readCell(f, pre, 'K29'), '見本 花子'); // 申請者の氏名は式（=F5）
  assert.equal(readCell(f, post, 'F5'), '見本 花子');
  assert.equal(readCell(f, post, 'A16'), '入浴補助用具（浴槽用手すり）\n浴槽手すり 見本B（2個）');
  assert.equal(readCell(f, post, 'AB15'), '令和8年10月30日'); // 購入日＝納品日
  assert.equal(readCell(f, post, 'C26'), '令和8年11月2日'); // 支給申請日
  assert.equal(ellipseCount(f, pre), 3);
  assert.equal(ellipseCount(f, post), 3);
  assert.match(strFromU8(f[sheetPaths(f).get(post) ?? '']), /<sheetView showZeros="0"/);
});

test('みやこ町：承認申請書・支給申請書・写真の用紙（1枚に1つ）', () => {
  const f = fill('miyako');
  const a = '福祉用具購入受領委任払申請書';
  const b = '福祉用具支給申請(受領委任）';
  assert.equal(readCell(f, a, 'I5'), '見本 花子');
  assert.equal(['W4', 'X4', 'Y4', 'Z4', 'AA4', 'AB4', 'AC4', 'AD4', 'AE4', 'AF4'].map((r) => readCell(f, a, r)).join(''), '0001234567');
  assert.equal(readCell(f, a, 'I7'), '昭和15年03月15日生');
  assert.equal(readCell(f, a, 'I8'), '〒824-0005');
  assert.equal(readCell(f, a, 'Y12'), '00001-000001');
  assert.equal(readCell(f, a, 'R14'), '27808');
  // 届出の行が1行目、理由、署名の空いた行
  assert.equal(readCell(f, a, 'I20'), '（居宅サービス計画の届出　　有・無）\n入浴用いす：浴室の床からの立ち座りが困難なため。\n浴槽用手すり：浴槽の出入りでふらつくため。\n');
  assert.equal(readCell(f, a, 'B12'), '入浴補助用具（入浴用いす）　シャワーチェア 見本A'); // 欄が小さいので1つの段落
  assert.deepEqual(['D30', 'F30', 'I30', 'L30'].map((r) => readCell(f, a, r)), ['令和', '8', '10', '22']);
  assert.equal(readCell(f, a, 'I34'), '見本 花子');
  assert.equal(readCell(f, a, 'I36'), '土居 翔太');
  assert.equal(ellipseCount(f, a), 2); // 性別・届出の有
  // 支給申請書：氏名などは式。明細・購入日・申請日は書く
  assert.equal(readCell(f, b, 'I5'), '見本 花子');
  assert.equal(readCell(f, b, 'B12'), '入浴補助用具（入浴用いす）　シャワーチェア 見本A');
  assert.equal(readCell(f, b, 'V14'), '令和8年10月30日');
  assert.deepEqual(['H25', 'J25', 'M25', 'P25'].map((r) => readCell(f, b, r)), ['令和', '8', '11', '2']);
  assert.equal(cellFormula(f, b, 'AA14'), 'IF(福祉用具購入受領委任払申請書!Y14="","",福祉用具購入受領委任払申請書!Y14)');
  assert.equal(ellipseCount(f, b), 1);
  // 写真の用紙：商品の数だけ
  assert.equal(readCell(f, '納品確認写真用紙', 'J7'), 'シャワーチェア 見本A / SC-01');
  assert.equal(readCell(f, '納品確認写真用紙 (2)', 'Y5'), '0001234567');
  assert.equal(readCell(f, '納品確認写真用紙 (3)', 'J5'), '');
});

test('アプリに入れた原本は空（前の方の記入・写真・丸が残っていない）', () => {
  for (const key of ['yukuhashi', 'kanda', 'miyako'] as ShinseiKey[]) {
    const f = template(key);
    assert.equal(Object.keys(f).filter((n) => n.startsWith('xl/media/')).length, 0, key);
    for (const n of Object.keys(f).filter((x) => /^xl\/drawings\/drawing\d+\.xml$/.test(x))) assert.doesNotMatch(strFromU8(f[n]), /prst="ellipse"|<xdr:pic>/, `${key} ${n}`);
  }
  const k = template('kanda');
  assert.equal(['Z4', 'AA4', 'AI4'].map((r) => readCell(k, '用具・受領委任払', r)).join(''), '');
  const m = template('miyako');
  assert.equal(readCell(m, '福祉用具購入受領委任払申請書', 'I7'), '');
  for (const sh of ['納品確認写真用紙', '納品確認写真用紙 (2)', '納品確認写真用紙 (3)', '納品確認写真用紙 (4)']) {
    assert.equal(['J5', 'Y5', 'J7'].map((r) => readCell(m, sh, r)).join(''), '', sh);
  }
  // 共有の文字の表に、どの欄からも使われない文字（消した記入の名残り）がない
  const used = new Set<number>();
  for (const p of sheetPaths(m).values()) for (const x of strFromU8(m[p]).matchAll(/<c r="[A-Z]+\d+"[^>]*?\st="s"[^>]*>\s*<v>(\d+)<\/v>/g)) used.add(Number(x[1]));
  const count = (strFromU8(m['xl/sharedStrings.xml']).match(/<si>/g) ?? []).length;
  assert.equal(used.size, count);
});

test('作る前に確かめる：まだ入っていない欄・様式の行より多い商品', () => {
  const ok = shinseiChecks(sale(), S);
  assert.deepEqual(ok.missing, []);
  assert.equal(ok.overflow, '');
  const thin = shinseiChecks(sale({gender: '', zip: '', items: [...sale().items, sale().items[0], sale().items[1]].map((i, k) => ({...i, id: `x${k}`, reason: k ? i.reason : ''}))}), S);
  assert.ok(thin.missing.includes('性別'));
  assert.ok(thin.missing.includes('郵便番号'));
  assert.ok(thin.missing.includes('福祉用具が必要な理由（1つ）'));
  assert.match(thin.overflow, /3行です。4つ目からの商品/);
  assert.equal(shinseiChecks(sale({insurer: 'miyako', careOffice: ''}), S).missing.includes('居宅サービス計画の届出（有・無）'), true);
});

test('ファイル名：「見本花子様特定福祉用具申請書.xlsx」', () => {
  assert.equal(shinseiFileName({customer: '見本 花子'}), '見本花子様特定福祉用具申請書.xlsx');
  assert.equal(shinseiFileName({customer: ''}), 'お客様様特定福祉用具申請書.xlsx');
});

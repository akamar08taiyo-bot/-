import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {defaultSettings, OFFICES, settingsForOffice} from '../../src/tokutei/defaults.ts';
import {
  carePlanOf,
  corpShort,
  fillShinsei,
  FUKUOKA_SHEET,
  fukuokaInsurerNo,
  fukuokaWard,
  insurerCheckDigit,
  KITAKYUSHU_SHEETS,
  kitakyushuAddress,
  KOUIKI_SHEETS,
  KURUME_KIND_TEXT,
  KURUME_RATIO_TEXT,
  KURUME_SHEETS,
  kurumeAddress,
  kurumePays,
  OITA_REASON_CELLS,
  OITA_SHEETS,
  padInsuredNo,
  pairBoxes,
  reasonText,
  SHINSEI,
  shinseiChecks,
  shinseiFileName,
  shinseiValues,
} from '../../src/tokutei/shinsei.ts';
import type {ShinseiKey} from '../../src/tokutei/shinsei.ts';
import {cleanSettings} from '../../src/tokutei/storage.ts';
import {KK_CELLS} from '../../src/tokutei/shinsei/kitakyushuCells.ts';
import {KU_CELLS} from '../../src/tokutei/shinsei/kurumeCells.ts';
import type {Sale, SaleItem, Settings} from '../../src/tokutei/types.ts';
import {boxes, cellBox, cellFormula, cellStyle, ellipseCount, emOf, printOverflow, rangeBox, readCell, sheetLayout, sheetPath, sheetPaths} from '../../src/tokutei/xlsxEdit.ts';
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

const TEMPLATE_FILES: Record<ShinseiKey, string> = {yukuhashi: 'yukuhashi.xltx', kanda: 'kanda.xltx', miyako: 'miyako.xlsx', kouiki: 'kouiki.xlsx', fukuoka: 'fukuoka.xlsx', kitakyushu: 'kitakyushu.xlsx', kurume: 'kurume.xlsx', oita: 'oita.xlsx'};
const template = (key: ShinseiKey): Files => unzipSync(new Uint8Array(readFileSync(new URL(`../../src/tokutei/shinsei/${TEMPLATE_FILES[key]}`, import.meta.url))));
const fill = (key: ShinseiKey, over: Partial<Sale> = {}): Files => unzipSync(fillShinsei(template(key), SHINSEI[key], shinseiValues(sale({insurer: key, ...over}), S)));

test('被保険者番号は10けた（足りない左は0）', () => {
  assert.equal(padInsuredNo('11530'), '0000011530');
  assert.equal(padInsuredNo('１２３４５６７８９０'), '1234567890');
  assert.equal(padInsuredNo(''), '');
});

test('理由：用具ごとに1行。頭に種目の名前は付けない（「固定用スロープという文言は不要」2026-10-26）。同じ文は1回', () => {
  const v = shinseiValues(sale(), S);
  assert.equal(reasonText(v), '浴室の床からの立ち座りが困難なため。\n浴槽の出入りでふらつくため。');
  const same = shinseiValues(sale({items: sale().items.map((i) => ({...i, reason: '屋内の段差でつまずくため。'}))}), S);
  assert.equal(reasonText(same), '屋内の段差でつまずくため。');
  const one = shinseiValues(sale({items: [sale().items[0]]}), S);
  assert.equal(reasonText(one), '浴室の床からの立ち座りが困難なため。');
});

test('申請書に書く値：福祉用具名・製造事業者名及び販売事業者名・購入金額・保険給付額', () => {
  const v = shinseiValues(sale(), S);
  assert.equal(v.items[0].label, '入浴補助用具\nシャワーチェア 見本A');
  assert.equal(v.items[0].makerSeller, '見本工業\n太陽シルバーサービス㈱');
  assert.equal(v.items[0].total, 28160); // 32,000×0.8＝25,600 ＋ 税 2,560
  assert.equal(v.items[1].label, '入浴補助用具\n浴槽手すり 見本B'); // 数量（「（2個）」）は書かない（「2台　などの文言は不要」2026-10-26）
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
  assert.equal(readCell(f, sh, 'A15'), '入浴補助用具\nシャワーチェア 見本A');
  assert.equal(readCell(f, sh, 'L16'), '見本製作所\n太陽シルバーサービス㈱');
  assert.equal(readCell(f, sh, 'V15'), '28160');
  assert.doesNotMatch(readCell(f, sh, 'AB15') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.equal(readCell(f, sh, 'AB17'), '　　　年　　月　　日'); // 使わない行は原本のまま
  assert.match(readCell(f, sh, 'E18'), /^浴室の床からの立ち座りが困難なため。/);
  assert.equal(readCell(f, sh, 'L20'), '見本居宅介護支援事業所　見本 太郎');
  assert.doesNotMatch(readCell(f, sh, 'C26') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.match(readCell(f, sh, 'G29'), /久保/); // 申請者（会社）は原本のまま
  assert.equal(ellipseCount(f, sh), 3); // 元号（昭）・性別・要介護度
  // 委任状
  assert.match(readCell(f, '委任状', 'B23'), /50,371円$/);
  // 保険給付額は大きく（ユーザーの指示「…金額の部分の文字が小さすぎる。大きく表示する」2026-10-26、「委任状の金額部分は、もう少し大きくする」2026-10-27）。
  // 「円」の右の端は原本の 11pt のときと同じ所（全角28字分）。行は字が入る高さに、すぐ下の空いた行を同じだけ低く（下の欄の位置は変わらない）
  assert.equal(cellBox(f, '委任状', 'B23').style.size, 18);
  assert.ok(Math.abs((emOf(readCell(f, '委任状', 'B23')) * 18) / 11 - 28) < 1, readCell(f, '委任状', 'B23'));
  const proxyXml = strFromU8(f[sheetPath(f, '委任状')]);
  const rowHt = (r: number) => Number(new RegExp(`<row\\b[^>]*\\sr="${r}"[^>]*>`).exec(proxyXml)?.[0].match(/\sht="([^"]+)"/)?.[1] ?? 18.75);
  assert.ok(rowHt(23) >= 18 * 1.3 - 0.01 && rowHt(23) + rowHt(24) === 18.75 * 2, `${rowHt(23)} ${rowHt(24)}`);
  assert.doesNotMatch(readCell(f, '委任状', 'A29') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.match(readCell(f, '委任状', 'A32'), /住　所　　行橋市中央1丁目2-3$/);
  // 委任者の氏名は自筆（ユーザーの指示「委任状では、名前の部分は自筆となるため、印字しない」2026-10-27）：原本の「氏　名　…㊞」のまま
  assert.equal(readCell(f, '委任状', 'A36'), readCell(template('yukuhashi'), '委任状', 'A36'));
  assert.ok(!readCell(f, '委任状', 'A36').includes('見本'));
  // 完了写真：氏名・番号は式（答えも合わせる）。式の誤り（G2 が AD7）は直してある。納品名は書く（撮影日は書かない。Excel で手入力。2026-10-28）
  assert.equal(readCell(f, '完了写真', 'B2'), '見本 花子');
  assert.equal(cellFormula(f, '完了写真', 'G2'), '用具・受領委任払!AC7');
  assert.equal(['D2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2', 'K2', 'L2', 'M2'].map((r) => readCell(f, '完了写真', r)).join(''), '0001234567');
  assert.equal(readCell(f, '完了写真', 'B3'), 'シャワーチェア 見本A / SC-01、浴槽手すり 見本B');
  assert.equal(readCell(f, '完了写真', 'B4') ?? '', '');
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
  assert.equal(readCell(f, post, 'A16'), '入浴補助用具\n浴槽手すり 見本B');
  assert.doesNotMatch(readCell(f, post, 'AB15') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.doesNotMatch(readCell(f, post, 'C26') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
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
  assert.equal(readCell(f, a, 'I20'), '（居宅サービス計画の届出　　有・無）\n浴室の床からの立ち座りが困難なため。\n浴槽の出入りでふらつくため。\n');
  assert.equal(readCell(f, a, 'B12'), '入浴補助用具\nシャワーチェア 見本A'); // 種目と商品名を1行ずつ（名前は折り返さない大きさに）
  assert.ok(['D30', 'F30', 'I30', 'L30'].slice(1).every((r) => !/\d/.test(readCell(f, a, r) ?? ''))); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.equal(readCell(f, a, 'I34'), '見本 花子');
  assert.equal(readCell(f, a, 'I36'), '土居 翔太');
  assert.equal(ellipseCount(f, a), 2); // 性別・届出の有
  // 支給申請書：氏名などは式。明細は書く（購入日・申請日は書かない）
  assert.equal(readCell(f, b, 'I5'), '見本 花子');
  assert.equal(readCell(f, b, 'B12'), '入浴補助用具\nシャワーチェア 見本A');
  assert.doesNotMatch(readCell(f, b, 'V14') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.ok(['H25', 'J25', 'M25', 'P25'].slice(1).every((r) => !/\d/.test(readCell(f, b, r) ?? ''))); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.equal(cellFormula(f, b, 'AA14'), 'IF(福祉用具購入受領委任払申請書!Y14="","",福祉用具購入受領委任払申請書!Y14)');
  assert.equal(ellipseCount(f, b), 1);
  // 写真の用紙：商品の数だけ
  assert.equal(readCell(f, '納品確認写真用紙', 'J7'), 'シャワーチェア 見本A / SC-01');
  assert.equal(readCell(f, '納品確認写真用紙 (2)', 'Y5'), '0001234567');
  assert.equal(readCell(f, '納品確認写真用紙 (3)', 'J5'), '');
});

test('広域連合：支払方法が受領委任払いなら受領委任払用（支給申請書と委任状）・写真貼付用紙に書く', () => {
  const f = fill('kouiki', {zip: '8290301', address: '築上郡築上町大字椎田1-2-3'});
  const sh = KOUIKI_SHEETS.juryo;
  assert.equal(readCell(f, sh, 'G2'), 'ミホン ハナコ');
  assert.equal(readCell(f, sh, 'G3'), '見本 花子');
  assert.equal(['W4', 'X4', 'Y4', 'Z4', 'AA4', 'AB4', 'AC4', 'AD4', 'AE4', 'AF4'].map((r) => readCell(f, sh, r)).join(''), '0001234567');
  assert.equal(['AA2', 'AB2', 'AC2', 'AD2', 'AE2', 'AF2'].map((r) => readCell(f, sh, r)).join(''), '406470'); // 保険者番号は原本のまま
  assert.equal(readCell(f, sh, 'G6'), '明 ・ 大 ・ 昭　　15年3月15日生');
  assert.equal(readCell(f, sh, 'G8'), '〒829-0301');
  assert.equal(readCell(f, sh, 'G9'), '築上郡築上町大字椎田1-2-3');
  assert.equal(readCell(f, sh, 'Z9'), '0930-00-0000');
  assert.equal(readCell(f, sh, 'B12'), '入浴補助用具\nシャワーチェア 見本A');
  assert.equal(readCell(f, sh, 'I14'), '見本製作所\n太陽シルバーサービス㈱');
  assert.equal(readCell(f, sh, 'R12'), '28160');
  assert.doesNotMatch(readCell(f, sh, 'Y14') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.equal(readCell(f, sh, 'R18'), String(28160 + 27808)); // 合計
  assert.equal(readCell(f, sh, 'R16'), ''); // 使わない行は空のまま
  assert.match(readCell(f, sh, 'J20'), /^浴室の床からの立ち座りが困難なため。\n浴槽の出入りでふらつくため。/);
  assert.equal(readCell(f, sh, 'J21'), ' 居宅サービス計画の届出　　　有　・　無\n 居宅の事業所名　見本居宅介護支援事業所');
  // 申請日も書かない（Excel で手入力）
  assert.ok(['C27', 'F27', 'I27', 'L27'].slice(1).every((r) => !/\d/.test(readCell(f, sh, r) ?? ''))); // 日付は書かない（Excel で手入力。2026-10-28）
  // 申請者（受領委任事業者）は申請書の営業所（築上町は設定の行橋営業所のまま）。原本と同じ書き方（2026-11-05）
  assert.equal(readCell(f, sh, 'M30'), '太陽シルバーサービス株式会社行橋営業所');
  assert.equal(readCell(f, sh, 'M29'), '福岡県行橋市大字流末1327番地');
  assert.equal(readCell(f, sh, 'M31'), '0930-26-9640');
  assert.equal(['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB'].map((c) => readCell(f, sh, `${c}34`)).join(''), '4072601802'); // 事業所番号
  assert.equal(['Z33', 'AA33', 'AB33'].map((r) => readCell(f, sh, r)).join(''), '802'); // 受領委任契約番号（行橋営業所の番号）
  assert.equal(readCell(f, sh, 'L38'), '被保険者氏名'); // 委任状の氏名は自署（原本のまま。「空けて自署にする」2026-10-26）
  assert.equal(readCell(f, sh, 'G40'), ''); // 口座の欄は書かない
  assert.equal(ellipseCount(f, sh), 3); // 元号（昭）・性別・居宅サービス計画の届出（有）
  // 償還払い用は空のまま
  assert.equal(readCell(f, KOUIKI_SHEETS.shokan, 'I6'), '');
  assert.equal(ellipseCount(f, KOUIKI_SHEETS.shokan), 0);
  // 写真貼付用紙：氏名・番号・商品名（2つ以上なら「、」でつなぐ）
  const ph = KOUIKI_SHEETS.photo;
  assert.equal(readCell(f, ph, 'B3'), '見本 花子');
  assert.equal(['G3', 'H3', 'I3', 'J3', 'K3', 'L3', 'M3', 'N3', 'O3', 'P3'].map((r) => readCell(f, ph, r)).join(''), '0001234567');
  assert.equal(readCell(f, ph, 'B4'), 'シャワーチェア 見本A / SC-01、浴槽手すり 見本B');
  assert.match(strFromU8(f['xl/workbook.xml']), /fullCalcOnLoad="1"/);
  assert.equal(sheetPaths(f).size, 5); // 収録様式一覧・説明用シートも消さない
});

test('広域連合：償還払いなら償還払い用（申請者は本人）に書く。届出の無・平成生まれ・事業所なし', () => {
  const f = fill('kouiki', {payMethod: '償還払い', zip: '8290301', address: '築上郡築上町大字椎田1-2-3'});
  const sh = KOUIKI_SHEETS.shokan;
  assert.equal(readCell(f, sh, 'I4'), 'ミホン ハナコ');
  assert.equal(readCell(f, sh, 'I6'), '見本 花子');
  assert.equal(['W6', 'X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6'].map((r) => readCell(f, sh, r)).join(''), '0001234567');
  assert.equal(readCell(f, sh, 'I8'), '昭和15年3月15日生'); // 元号の字がない様式なので元号を書く
  assert.equal(readCell(f, sh, 'I10'), '〒829-0301');
  assert.equal(readCell(f, sh, 'I11'), '築上郡築上町大字椎田1-2-3');
  assert.equal(readCell(f, sh, 'B16'), '入浴補助用具\n浴槽手すり 見本B');
  assert.equal(readCell(f, sh, 'R14'), '28160');
  assert.doesNotMatch(readCell(f, sh, 'Y16') ?? '', /令和8年/); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.equal(readCell(f, sh, 'R20'), String(28160 + 27808));
  assert.match(readCell(f, sh, 'I22'), /^浴室の床からの立ち座りが困難なため。/);
  assert.match(readCell(f, sh, 'I23'), /居宅の事業所名　見本居宅介護支援事業所$/);
  assert.ok(['H30', 'J30', 'M30', 'P30'].slice(1).every((r) => !/\d/.test(readCell(f, sh, r) ?? ''))); // 日付は書かない（Excel で手入力。2026-10-28）
  assert.deepEqual(['J32', 'J34', 'Y34'].map((r) => readCell(f, sh, r)), ['築上郡築上町大字椎田1-2-3', '見本 花子', '0930-00-0000']); // 申請者（本人）
  assert.equal(readCell(f, sh, 'J36'), ''); // 届出者は書かない
  assert.equal(ellipseCount(f, sh), 2); // 性別・届出（有）
  assert.equal(readCell(f, KOUIKI_SHEETS.juryo, 'G3'), ''); // 受領委任払用は空のまま
  assert.equal(ellipseCount(f, KOUIKI_SHEETS.juryo), 0);
  // 居宅介護支援事業所がなければ届出も空（丸なし）・事業所名は原本のまま。「無」を選べば無に丸。平成生まれは元号を書く（丸なし）
  const g = fill('kouiki', {careOffice: '', careManager: '', birthDate: '1990-05-01'});
  assert.match(readCell(g, KOUIKI_SHEETS.juryo, 'J21'), /^ 居宅サービス計画の届出　+有　・　無\r?\n 居宅の事業所名$/); // 原本の文のまま
  assert.equal(readCell(g, KOUIKI_SHEETS.juryo, 'G6'), '平成2年5月1日生');
  assert.equal(ellipseCount(g, KOUIKI_SHEETS.juryo), 1); // 性別だけ
  assert.equal(ellipseCount(fill('kouiki', {carePlan: '無'}), KOUIKI_SHEETS.juryo), 3);
});

// 福岡市：受任者は設定の営業所（福岡東営業所）。事業者番号は架空の番号
const FUKUOKA_S = {...settingsForOffice(S, '福岡東営業所'), providerNo: '4000000001'};
const fukuokaSale = (over: Partial<Sale> = {}) => sale({insurer: 'fukuoka', zip: '8100001', address: '福岡県福岡市中央区天神1丁目2-3', ...over});
const fillFukuoka = (over: Partial<Sale> = {}, s: Settings = FUKUOKA_S): Files => unzipSync(fillShinsei(template('fukuoka'), SHINSEI.fukuoka, shinseiValues(fukuokaSale(over), s)));
const joined = (f: Files, refs: string[]) => refs.map((r) => readCell(f, FUKUOKA_SHEET, r)).join('');

test('福岡市：支給申請書（受領委任払用）。申請者は本人、受任者（販売事業者）は設定の営業所', () => {
  const f = fillFukuoka();
  const at = (ref: string) => readCell(f, FUKUOKA_SHEET, ref);
  assert.equal(at('E5'), 'ミホン ハナコ');
  assert.equal(at('E6'), '見本 花子');
  assert.equal(joined(f, pairBoxes('Y', 6, 5)), '401331'); // 原本の 4013 のうしろに、中央区の 31（様式の記載例と同じ）
  assert.equal(joined(f, pairBoxes('Q', 10, 7)), '0001234567');
  assert.deepEqual(['E8', 'H8', 'J8', 'L8'].map(at), ['明・大・昭', '15', '3', '15']);
  assert.equal(at('E10'), '浴室の床からの立ち座りが困難なため。\n浴槽の出入りでふらつくため。');
  // 販売事業者名・事業者番号（10けた）
  assert.equal(at('E11'), '太陽シルバーサービス㈱　福岡東営業所');
  assert.equal(joined(f, pairBoxes('Q', 10, 11)), '4000000001');
  // 明細：種目の番号（入浴補助用具＝3）・商品名・製造事業者名・購入金額（税込）と合計。使わない行は空
  assert.deepEqual(['C13', 'D13', 'J13', 'Q13'].map(at), ['3', 'シャワーチェア 見本A', '見本工業', '28160']);
  assert.deepEqual(['C15', 'D15', 'J15', 'Q15'].map(at), ['3', '浴槽手すり 見本B', '見本製作所', '27808']);
  assert.equal(joined(f, ['C17', 'D17', 'J17', 'Q17']), '');
  assert.equal(at('Q19'), String(28160 + 27808));
  // 日付（年度・購入日・申請日）は書かない（Excel で手入力。2026-10-28）
  assert.equal(joined(f, ['AA3', 'AB13', 'AE13', 'AH13', 'AB15']), '');
  assert.doesNotMatch(at('C23'), /\d/);
  // 申請者（本人）：あて先の区長・住所（記載例と同じ形。原本の「区」の欄は消す）・氏名・日中の連絡先
  assert.equal(at('D25'), '福岡市　中央　区長');
  assert.equal(at('L25'), '福岡市　中央　区　天神1丁目2-3');
  assert.equal(at('O25'), '');
  assert.equal(at('L26'), '見本 花子');
  assert.match(at('P28'), /^（電話　　　0930-00-0000　+）$/);
  // 受任者：設定の営業所の郵便番号・住所・電話・名称・代表者職氏名（所長）
  assert.match(at('E31'), new RegExp(`^（〒　　　${FUKUOKA_S.postal}　+）$`));
  assert.equal(at('E32'), FUKUOKA_S.address);
  assert.equal(at('W31'), FUKUOKA_S.tel);
  assert.equal(at('E33'), '太陽シルバーサービス㈱　福岡東営業所');
  assert.equal(at('Q33'), `所長　${FUKUOKA_S.manager}`);
  // 振込先は書かない
  assert.equal(joined(f, ['G38', 'G39']), '');
  // 丸：元号（昭）・本人の状況（在宅）
  assert.equal(ellipseCount(f, FUKUOKA_SHEET), 2);
  // 購入金額は記載例と同じ「#,##0」・必要な理由は折り返す書式
  const xml = strFromU8(f[sheetPath(f, FUKUOKA_SHEET)]);
  const styles = [...strFromU8(f['xl/styles.xml']).split('<cellXfs')[1].matchAll(/<xf\b[\s\S]*?(?:\/>|<\/xf>)/g)].map((m) => m[0]);
  const xfOf = (ref: string) => styles[Number(new RegExp(`<c r="${ref}"[^>]*\\ss="(\\d+)"`).exec(xml)?.[1] ?? 0)];
  for (const ref of ['Q13', 'Q15', 'Q19']) assert.match(xfOf(ref), /numFmtId="3"/, ref);
  assert.match(xfOf('E10'), /wrapText="1"/);
  assert.equal(sheetPaths(f).size, 1);
});

test('福岡市：保険者番号は区ごと（4013＋区の番号＋検証番号）・区のない住所・平成生まれ・事業者番号がないとき', () => {
  // 検証番号：広域連合の様式の 406470、福岡市の記載例（中央区）の 401331 と合う
  assert.equal(insurerCheckDigit('40647'), 0);
  assert.equal(insurerCheckDigit('40133'), 1);
  const wards: [string, string][] = [
    ['福岡市東区松田1-1', '401315'],
    ['福岡県福岡市博多区博多駅前1-1', '401323'],
    ['福岡市中央区天神1-1', '401331'],
    ['福岡市南区高宮1-1', '401349'],
    ['福岡市西区姪浜1-1', '401356'],
    ['福岡市城南区七隈1-1', '401364'],
    ['福岡市 早良区 小田部1-1', '401372'],
  ];
  for (const [address, no] of wards) assert.equal(fukuokaInsurerNo(address), no, address);
  assert.equal(fukuokaInsurerNo('行橋市中央1丁目2-3'), '');
  assert.deepEqual(fukuokaWard('福岡県福岡市東区松田1-1'), {ward: '東', rest: '松田1-1'});
  // 1字の区：あて先の「福岡市　　東　区長」（原本のすき間の4字分に区の名前を入れる）
  const east = fillFukuoka({address: '福岡市東区松田1-1', birthDate: '1990-05-01', tel: ''});
  assert.equal(readCell(east, FUKUOKA_SHEET, 'D25'), '福岡市　　東　区長');
  assert.equal(joined(east, ['AG5', 'AI5']), '15');
  // 平成生まれは元号を書く（丸はない）。電話がなければ原本の「（電話　…）」のまま
  assert.deepEqual(['E8', 'H8', 'J8', 'L8'].map((r) => readCell(east, FUKUOKA_SHEET, r)), ['平成', '2', '5', '1']);
  assert.match(readCell(east, FUKUOKA_SHEET, 'P28'), /^（電話　+/);
  assert.equal(ellipseCount(east, FUKUOKA_SHEET), 1); // 在宅だけ
  // 区のない住所：原本の「福岡市　　　　区長」「福岡市」「区」と保険者番号の空欄のまま。住所は福岡県を外して書く
  const other = fillFukuoka({address: '福岡県行橋市中央1丁目2-3'});
  assert.equal(readCell(other, FUKUOKA_SHEET, 'D25'), '福岡市　　　　区長');
  assert.equal(readCell(other, FUKUOKA_SHEET, 'L25'), '行橋市中央1丁目2-3');
  assert.equal(joined(other, ['AG5', 'AI5']), '');
  // 事業者番号がない営業所：原本の 4・0 のまま（ほかのマスは空）。作る前の確かめで知らせる
  const noNo = fillFukuoka({}, {...FUKUOKA_S, providerNo: ''});
  assert.equal(joined(noNo, pairBoxes('Q', 10, 11)), '40');
  assert.deepEqual(shinseiChecks(fukuokaSale(), {...FUKUOKA_S, providerNo: ''}).missing, ['販売事業者の事業者番号（10けた）']);
  // 福岡市の様式にない欄（性別・郵便番号・要介護度・記載者）は知らせない
  assert.deepEqual(shinseiChecks(fukuokaSale({gender: '', zip: '', careLevel: '', careOffice: '', careManager: ''}), FUKUOKA_S).missing, []);
  assert.match(shinseiChecks(fukuokaSale({items: [0, 1, 2, 3].map((k) => item({id: `k${k}`, name: `見本の杖${k}`, reason: '見本'}))}), FUKUOKA_S).overflow, /^福岡市の申請書の商品の欄は3行です。/);
});

test('福岡市：長い商品名・メーカー名は1行に入る大きさ。行橋営業所の設定でも販売事業者は福岡市の営業所（事業者番号はその営業所の番号）', () => {
  const f = fillFukuoka({items: [item({id: 'a', name: '見本のシャワーベンチ背付きワイド 536-057 ロング', maker: 'パナソニックエイジフリー（株）', category: '入浴補助用具', listPrice: 30000})]});
  for (const ref of ['D13', 'J13']) {
    const text = readCell(f, FUKUOKA_SHEET, ref);
    const {box, style} = cellBox(f, FUKUOKA_SHEET, ref);
    assert.ok(emOf(text) * ((style.size * 4) / 3) <= box.w - 6 + 0.01, `${ref}「${text}」が幅 ${box.w} に入らない（${style.size}pt）`);
  }
  assert.equal(readCell(f, FUKUOKA_SHEET, 'J13'), 'パナソニックエイジフリー㈱');
  // ユーザーの指示「福岡は、福岡東、福岡南、福岡西／こちらの該当営業所と所長にする」（2026-11-05）：中央区は福岡西営業所。行橋営業所の事業者番号は書かない
  const yk = fillFukuoka({}, settingsForOffice(S, '行橋営業所'));
  assert.equal(readCell(yk, FUKUOKA_SHEET, 'E11'), '太陽シルバーサービス㈱　福岡西営業所');
  // 福岡西営業所の事業所番号（営業所の一覧。チラシ作成（レンタル）と同じ。2026-11-05 から。前は行橋営業所のほかは番号がなく原本の頭の「40」のままだった）
  assert.equal(joined(yk, pairBoxes('Q', 10, 11)), '4073500615');
  // 番号がないとき（一覧にない営業所の名前）は原本の頭の「40」のまま
  assert.equal(joined(fillFukuoka({}, {...settingsForOffice(S, '行橋営業所'), providerNos: {福岡西営業所: ''}}), pairBoxes('Q', 10, 11)), '40');
  const ykNo = fillFukuoka({}, {...settingsForOffice(S, '行橋営業所'), providerNos: {福岡西営業所: '4000000002'}});
  assert.equal(joined(ykNo, pairBoxes('Q', 10, 11)), '4000000002');
  assert.equal(printOverflow(ykNo, FUKUOKA_SHEET) ?? 0, 0); // A4 1枚（原本の「ページに合わせる」のまま）
});

// 北九州市：申請するのは事業者（設定の営業所。小倉営業所）。事業者番号は架空の番号
const KK_S: Settings = {...settingsForOffice(S, '小倉営業所'), providerNo: '4000000001'};
const kkSale = (over: Partial<Sale> = {}) => sale({insurer: 'kitakyushu', zip: '8030814', address: '福岡県北九州市小倉北区城内1-1', ...over});
const fillKK = (over: Partial<Sale> = {}, s: Settings = KK_S): Files => unzipSync(fillShinsei(template('kitakyushu'), SHINSEI.kitakyushu, shinseiValues(kkSale(over), s)));
const KS: Record<string, string> = KK_CELLS.shikyu;
const KG: Record<string, string> = KK_CELLS.gaiyo;
/** 丸（楕円の図形）の左の位置（EMU） */
const ellipseXs = (f: Files, sheet: string): number[] => {
  const path = sheetPath(f, sheet);
  const rels = strFromU8(f[path.replace(/([^/]+)$/, '_rels/$1.rels')]);
  const target = /Target="\.\.\/drawings\/([^"]+)"/.exec(rels)?.[1];
  return target ? [...strFromU8(f[`xl/drawings/${target}`]).matchAll(/<a:off x="(\d+)"[^>]*\/><a:ext[^>]*\/><\/a:xfrm><a:prstGeom prst="ellipse"/g)].map((m) => Number(m[1])) : [];
};

test('北九州市：支給申請書（受領委任払用）。申請内容は種目ごとの金額（税抜）と合計金額（税込）。申請するのは設定の営業所', () => {
  const f = fillKK();
  const at = (ref: string) => readCell(f, KITAKYUSHU_SHEETS.shikyu, ref);
  assert.deepEqual([...sheetPaths(f).keys()], ['支給申請書', '支給申請書（裏）', '概要書', '概要書（裏）']);
  assert.equal(at(KS.provider), '４００００００００１'); // 市の記入例と同じ全角（10けた）
  assert.equal(at(KS.kana), 'ミホン ハナコ');
  assert.equal(at(KS.name), '見本 花子');
  assert.equal(Array.from({length: 10}, (_, i) => at(KS[`no${i}`])).join(''), '0001234567');
  assert.equal(at(KS.address), '小倉北区城内1-1'); // 記入例と同じ区から
  assert.equal(at(KS.tel), '0930-00-0000');
  // 入浴補助用具（3）：税抜の 25,600＋25,280。ほかの種目は空
  assert.equal(at(KS.kind3), String(25600 + 25280));
  for (const no of [1, 2, 4, 5, 6, 7, 8, 9]) assert.equal(at(KS[`kind${no}`]), '', `kind${no}`);
  assert.equal(at(KS.total), String(28160 + 27808));
  assert.equal(at(KS.prev), ''); // 今年度の残りが空欄
  assert.equal(at(KS.benefit), String(55968 - Math.ceil(55968 / 10)));
  assert.equal(at(KS.reason), '浴室の床からの立ち座りが困難なため。\n浴槽の出入りでふらつくため。');
  // 委任の欄・申請の欄の事業者は設定の営業所（住所は区から）。委任の欄の被保険者氏名は自署なので書かない
  for (const ref of [KS.sellerA, KS.sellerB]) assert.equal(at(ref), '太陽シルバーサービス㈱　小倉営業所');
  for (const ref of [KS.repA, KS.repB]) assert.equal(at(ref), '所長　森口 賢一');
  assert.equal(at(KS.sellerAddress), '小倉北区重住3丁目11-21');
  assert.equal(at(KS.sellerTel), '093-952-1616');
  // 丸：給付率の９０だけ。金額は「#,##0」
  assert.equal(ellipseCount(f, KITAKYUSHU_SHEETS.shikyu), 1);
  const xml = strFromU8(f[sheetPath(f, KITAKYUSHU_SHEETS.shikyu)]);
  const styles = [...strFromU8(f['xl/styles.xml']).split('<cellXfs')[1].matchAll(/<xf\b[\s\S]*?(?:\/>|<\/xf>)/g)].map((m) => m[0]);
  const xfOf = (ref: string) => styles[Number(new RegExp(`<c r="${ref}"[^>]*\\ss="(\\d+)"`).exec(xml)?.[1] ?? 0)];
  for (const ref of [KS.kind3, KS.total, KS.benefit]) assert.match(xfOf(ref), /numFmtId="3"/, ref);
  // 裏（委任状）と概要書の裏（注意事項）は原本のまま
  for (const sh of [KITAKYUSHU_SHEETS.back, KITAKYUSHU_SHEETS.gaiyoBack]) assert.equal(strFromU8(f[sheetPath(f, sh)]), strFromU8(template('kitakyushu')[sheetPath(f, sh)]), sh);
});

test('北九州市：概要書は商品ごとに 種目・品目、形式等（商品名と品番）・金額（税抜）。合計・消費税・総合計・業者名（連絡先）・担当者', () => {
  const f = fillKK();
  const g = (ref: string) => readCell(f, KITAKYUSHU_SHEETS.gaiyo, ref);
  assert.equal(g(KG.name), '見本 花子');
  assert.equal(g(KG.insured), '0001234567');
  assert.deepEqual([g(KG.amount), g(KG.tax), g(KG.total)], [String(25600 + 25280), String(2560 + 2528), String(28160 + 27808)]);
  assert.equal(g(KG.seller), '太陽シルバーサービス㈱　小倉営業所\n〒802-0011　福岡県北九州市小倉北区重住3丁目11-21\n電話　093-952-1616');
  assert.equal(g(KG.manager), '土居 翔太');
  assert.deepEqual([g(KG.kind0), g(KG.item0), g(KG.yen0)], ['入浴補助用具', 'シャワーチェア 見本A\nSC-01', '25600']);
  assert.deepEqual([g(KG.kind1), g(KG.item1), g(KG.yen1)], ['入浴補助用具', '浴槽手すり 見本B', '25280']);
  assert.equal([g(KG.kind2), g(KG.item2), g(KG.yen2), g(KG.about0), g(KG.about1)].join(''), ''); // 概要（特長等）は手で書く
  // 商品が13個あれば12個まで（画面で知らせる）
  const many = Array.from({length: 13}, (_, k) => item({id: `m${k}`, name: `見本の杖${k}`, category: '歩行補助つえ', listPrice: 10000, reason: '見本'}));
  assert.match(shinseiChecks(kkSale({items: many}), KK_S).overflow, /^北九州市の申請書の商品の欄は12行です。13つ目からの商品/);
  const fm = fillKK({items: many});
  assert.equal(readCell(fm, KITAKYUSHU_SHEETS.gaiyo, KG.item11), '見本の杖11');
  assert.equal(readCell(fm, KITAKYUSHU_SHEETS.shikyu, KS.kind9), String(8000 * 13)); // 申請書の種目の金額は全部の商品
});

test('北九州市：給付率の丸は負担割合から（1割＝９０・2割＝８０・3割＝７０）・前回までの給付実績は今年度の残りから・選んでいなければ空', () => {
  const xs = ([1, 2, 3] as const).map((burdenRatio) => ellipseXs(fillKK({burdenRatio}), KITAKYUSHU_SHEETS.shikyu));
  for (const x of xs) assert.equal(x.length, 1);
  assert.ok(xs[0][0] > xs[1][0] && xs[1][0] > xs[2][0], JSON.stringify(xs)); // ９０ は ８０ の右、８０ は ７０ の右
  const two = fillKK({burdenRatio: 2, remaining: 70000});
  const at = (ref: string) => readCell(two, KITAKYUSHU_SHEETS.shikyu, ref);
  assert.equal(at(KS.prev), '30000'); // 10万円 − 今年度の残り 7万円
  assert.equal(at(KS.benefit), String(55968 - Math.ceil((55968 * 2) / 10))); // 合計が残りより少ないので合計の8割
  const none = fillKK({burdenRatio: null});
  assert.equal(ellipseCount(none, KITAKYUSHU_SHEETS.shikyu), 0);
  assert.equal(readCell(none, KITAKYUSHU_SHEETS.shikyu, KS.benefit), '');
  // 事業者番号がない営業所：書かない。作る前の確かめで知らせる。様式にない欄（生年月日・性別・郵便番号・要介護度・記載者）は知らせない
  const noNo = fillKK({}, {...KK_S, providerNo: ''});
  assert.equal(readCell(noNo, KITAKYUSHU_SHEETS.shikyu, KS.provider), '');
  assert.deepEqual(shinseiChecks(kkSale(), {...KK_S, providerNo: ''}).missing, ['販売事業者の事業者番号（10けた）']);
  assert.deepEqual(shinseiChecks(kkSale({birthDate: '', gender: '', zip: '', careLevel: '', careOffice: '', careManager: ''}), KK_S).missing, []);
  // 市の外の住所は福岡県だけ外す
  assert.equal(kitakyushuAddress('福岡県行橋市大字流末1327番地'), '行橋市大字流末1327番地');
  assert.equal(kitakyushuAddress('北九州市 八幡東区中央1-1'), '八幡東区中央1-1');
});

// 久留米市・大分市（2026-11-04 にいただいた市の様式から作った原本）。見本の方・営業所の番号は架空
const KU_S: Settings = {...settingsForOffice(S, '久留米営業所'), providerNo: '4000000001', entrustRegNo: '12345678'};
const kuSale = (over: Partial<Sale> = {}) => sale({insurer: 'kurume', zip: '8300000', address: '福岡県久留米市見本町1-2-3', ...over});
const fillKU = (over: Partial<Sale> = {}, s: Settings = KU_S): Files => unzipSync(fillShinsei(template('kurume'), SHINSEI.kurume, shinseiValues(kuSale(over), s)));
const KUP: Record<string, string> = KU_CELLS.proxy;
const KUC: Record<string, string> = KU_CELLS.claim;
const KUT: Record<string, string> = KU_CELLS.teisyutu;

test('久留米市：支給申請書（第１号様式）。☑は種目・全額と支払・TAIS コード・事業所番号・登録番号。申請者の欄は本人の自書なので書かない', () => {
  const f = fillKU();
  const at = (ref: string) => readCell(f, KURUME_SHEETS.shinsei, ref);
  assert.deepEqual([...sheetPaths(f).keys()], ['申請書', '委任状（受領委任払用）', '請求書', '委任状（提出用）']);
  assert.equal(readCell(template('kurume'), KURUME_SHEETS.shinsei, 'C11'), KURUME_KIND_TEXT); // 原本の【福祉用具名】の文字と同じ
  assert.equal(readCell(template('kurume'), KURUME_SHEETS.shinsei, 'AG20'), KURUME_RATIO_TEXT);
  assert.deepEqual([at('E4'), at('E5')], ['ミホン ハナコ', '見本 花子']);
  assert.equal(boxes('AD', 10, 5).map(at).join(''), '0001234567');
  assert.equal(boxes('AH', 6, 4).map(at).join(''), '402032'); // 保険者番号は原本のまま
  assert.equal(at('E7'), '明 ・ 大 ・ 昭　　　　15年　　　3月　　　15日生');
  assert.equal(at('E9'), '〒　830　－　0000');
  assert.deepEqual([at('E10'), at('I10')], ['久留米市', '見本町1-2-3']);
  // 1つ目の商品：入浴補助用具に☑・税込 28,160（定価 32,000 の2割引き）・TAIS コード 00001-000001・事業所番号は設定の営業所
  assert.equal(at('C11'), KURUME_KIND_TEXT.replace('□入浴補助用具', '☑入浴補助用具'));
  assert.equal(at('C12'), '【種目名及び商品名】　入浴補助用具\nシャワーチェア 見本A');
  assert.equal(at('S11'), '【製造事業者名】\n見本工業');
  assert.equal(at('S12'), '【販売事業者名】\n太陽シルバーサービス㈱　久留米営業所');
  assert.equal(at('AH12'), '28160');
  assert.equal([...boxes('G', 5, 13), ...boxes('M', 6, 13)].map(at).join(''), '00001000001');
  assert.equal(boxes('V', 10, 13).map(at).join(''), '4000000001');
  // 2つ目（数量2の浴槽手すり 27,808）。TAIS コードのない商品はマスが空
  assert.equal(at('AH15'), '27808');
  assert.equal([...boxes('G', 5, 16), ...boxes('M', 6, 16)].map(at).join(''), '');
  assert.equal(at('C17'), KURUME_KIND_TEXT); // 3つ目の行は原本のまま（□だけ）
  // 支払：1割（商品ごとに切り上げ、最後の商品で合計＝購入金額−保険給付額に合わせる）
  const total = 28160 + 27808;
  const pay = Math.ceil(total / 10);
  assert.deepEqual([at('AH13'), at('AH16')], [String(Math.ceil(28160 / 10)), String(pay - Math.ceil(28160 / 10))]);
  assert.deepEqual([at('H20'), at('L22')], [String(total), String(pay)]);
  assert.equal(at('AG20'), KURUME_RATIO_TEXT.replace('□', '☑'));
  assert.equal(pairBoxes('Q', 8, 44).map(at).join(''), '12345678');
  // 申請者（被保険者）の住所・氏名・電話番号の欄は原本のまま（※本人自書）。丸は元号と支払方法の「２．受領委任払い」
  assert.equal(at('E27'), readCell(template('kurume'), KURUME_SHEETS.shinsei, 'E27'));
  assert.equal(at('X30'), readCell(template('kurume'), KURUME_SHEETS.shinsei, 'X30'));
  assert.equal(ellipseCount(f, KURUME_SHEETS.shinsei), 2);
  for (const ref of ['AH12', 'AH13', 'H20', 'L22']) assert.ok(cellStyle(f, strFromU8(f[sheetPath(f, KURUME_SHEETS.shinsei)]), ref), ref);
  assert.equal(printOverflow(f, KURUME_SHEETS.shinsei), null);
});

test('久留米市：委任状（受領委任払用）・請求書は設定の営業所と保険給付額。提出用の委任状は担当と営業所・委任者の住所、福祉用具購入費支給申請に丸', () => {
  const f = fillKU();
  const benefit = 28160 + 27808 - Math.ceil((28160 + 27808) / 10);
  const p = (ref: string) => readCell(f, KURUME_SHEETS.proxy, ref);
  assert.equal(p(KUP.sellerAddress), '〒838-0141\n福岡県小郡市小郡97-19');
  assert.equal(p(KUP.sellerTel), '0942-72-8822');
  assert.equal(p(KUP.seller), '太陽シルバーサービス㈱　久留米営業所\n所長　牟田 知広');
  assert.equal(p(KUP.benefit), String(benefit));
  assert.equal(p(KUP.address), '見本町1-2-3'); // 原本に「久留米市」が入っている
  const c = (ref: string) => readCell(f, KURUME_SHEETS.claim, ref);
  assert.equal(Array.from({length: 11}, (_, k) => c(KUC[`d${k}`])).join(''), `￥${benefit}`);
  assert.equal(c(KUC[`d${10 - String(benefit).length}`]), '￥'); // 金額の頭に￥
  assert.equal(Array.from({length: 7}, (_, k) => c(KUC[`z${k}`])).join(''), '8380141');
  assert.equal(c(KUC.seller), '太陽シルバーサービス㈱　久留米営業所　所長　牟田 知広');
  assert.deepEqual([c(KUC.telA), c(KUC.telB), c(KUC.telC)], ['0942', '72', '8822']);
  assert.equal(c(KUC.name), '見本 花子');
  const t = (ref: string) => readCell(f, KURUME_SHEETS.teisyutu, ref);
  assert.deepEqual([t(KUT.visitor), t(KUT.office), t(KUT.sellerTel), t(KUT.address)], ['土居 翔太', '太陽シルバーサービス㈱　久留米営業所', '0942-72-8822', '福岡県久留米市見本町1-2-3']);
  assert.equal(ellipseCount(f, KURUME_SHEETS.teisyutu), 1);
  for (const sh of [KURUME_SHEETS.proxy, KURUME_SHEETS.claim, KURUME_SHEETS.teisyutu]) assert.equal(printOverflow(f, sh), null, sh);
});

test('久留米市：償還払いは支払＝全額・委任状と請求書は空・登録番号なし。市の外の住所・確かめる欄', () => {
  const f = fillKU({payMethod: '償還払い', address: '福岡県小郡市見本1-1'});
  const at = (ref: string) => readCell(f, KURUME_SHEETS.shinsei, ref);
  assert.deepEqual([at('AH13'), at('AH16'), at('L22')], ['28160', '27808', String(28160 + 27808)]);
  assert.equal(pairBoxes('Q', 8, 44).map(at).join(''), '');
  assert.deepEqual([at('E10'), at('I10')], ['', '小郡市見本1-1']);
  assert.equal(ellipseCount(f, KURUME_SHEETS.shinsei), 1); // 支払方法（口座・現金）は本人が選ぶ
  for (const sh of [KURUME_SHEETS.proxy, KURUME_SHEETS.claim]) assert.equal(strFromU8(f[sheetPath(f, sh)]), strFromU8(template('kurume')[sheetPath(f, sh)]), sh);
  assert.deepEqual(kurumePays({items: [{total: 10001}, {total: 999}] as never, payMethod: '受領委任払い', ratioSet: true, ratio: 2, benefit: 11000 - 2201}), [2001, 200]);
  assert.equal(kurumePays({items: [{total: 100}] as never, payMethod: '受領委任払い', ratioSet: false, ratio: 1, benefit: 0}), null);
  assert.equal(kurumeAddress('福岡県久留米市 見本町1-1'), '見本町1-1');
  // 確かめる欄：性別・要介護度・電話・理由・記載者の欄はない。事業者番号と（受領委任払いなら）登録番号が要る
  assert.deepEqual(shinseiChecks(kuSale({gender: '', careLevel: '', tel: '', careOffice: '', careManager: '', items: sale().items.map((i) => ({...i, reason: ''}))}), KU_S).missing, []);
  assert.deepEqual(shinseiChecks(kuSale(), {...KU_S, providerNo: '', entrustRegNo: ''}).missing, ['販売事業者の事業者番号（10けた）', '久留米市の受領委任払取扱事業所登録番号（設定）']);
  assert.deepEqual(shinseiChecks(kuSale({payMethod: '償還払い'}), {...KU_S, entrustRegNo: ''}).missing, []);
  assert.match(shinseiChecks(kuSale({items: [0, 1, 2, 3].map((k) => item({id: `k${k}`, name: `見本の杖${k}`}))}), KU_S).overflow, /^久留米市の申請書の商品の欄は3行です。/);
});

const OT_S: Settings = {...settingsForOffice(S, '大分営業所'), providerNo: '4000000002'};
const otSale = (over: Partial<Sale> = {}) => sale({insurer: 'oita', zip: '8700000', address: '大分県大分市見本町1-2-3', ...over});
const fillOT = (over: Partial<Sale> = {}, s: Settings = OT_S): Files => unzipSync(fillShinsei(template('oita'), SHINSEI.oita, shinseiValues(otSale(over), s)));

test('大分市：支給申請書（第12号様式）と委任状。受領委任に■・販売事業者は設定の営業所・理由は5行・記入者はケアマネジャー', () => {
  const f = fillOT();
  const at = (ref: string) => readCell(f, OITA_SHEETS.shinsei, ref);
  assert.deepEqual([...sheetPaths(f).keys()], ['支給申請書', '委任状']);
  assert.equal(at('AK3'), '　□償還　　■受領委任');
  assert.deepEqual([at('I4'), at('I5')], ['ミホン ハナコ', '見本 花子']);
  assert.equal(boxes('AK', 10, 4).map(at).join(''), '0001234567');
  assert.equal(at('I8'), '明･大･昭　　15年　3月　15日生');
  assert.equal(at('AD8'), '要支援(　　　）　･　要介護（　２　）');
  assert.equal(at('A12'), '入浴補助用具\nシャワーチェア 見本A');
  assert.deepEqual([at('N12'), at('Y12'), at('Y14')], ['見本工業', '28,160円', '27,808円']);
  assert.equal(at('Y16'), '円'); // 使わない行は原本のまま
  assert.equal(at('I20'), '太陽シルバーサービス㈱　大分営業所');
  assert.equal(boxes('AK', 10, 20).map(at).join(''), '4000000002');
  assert.deepEqual(OITA_REASON_CELLS.map(at), ['浴室の床からの立ち座りが困難なため。', '浴槽の出入りでふらつくため。', '', '', '']);
  assert.match(at('I27'), /^　（記入者名）　見本 太郎　+（事業者名）　見本居宅介護支援事業所\n/);
  assert.match(at('I27'), /■介護支援専門員/);
  assert.deepEqual([at('F36'), at('AF37')], ['住所　大分県大分市見本町1-2-3', '電話番号　　0930-00-0000']);
  assert.equal(at('F38'), readCell(template('oita'), OITA_SHEETS.shinsei, 'F38')); // 申請者の氏名は自署
  // 書いた値は黒（原本の書く欄は赤）
  const xml = strFromU8(f[sheetPath(f, OITA_SHEETS.shinsei)]);
  const fonts = [...strFromU8(f['xl/styles.xml']).split('<fonts')[1].split('</fonts>')[0].matchAll(/<font\b[\s\S]*?<\/font>/g)].map((m) => m[0]);
  const xfs = [...strFromU8(f['xl/styles.xml']).split('<cellXfs')[1].matchAll(/<xf\b[\s\S]*?(?:\/>|<\/xf>)/g)].map((m) => m[0]);
  const colorOf = (ref: string) => /rgb="([0-9A-F]+)"/.exec(fonts[Number(/fontId="(\d+)"/.exec(xfs[Number(new RegExp(`<c r="${ref}"[^>]*\\ss="(\\d+)"`).exec(xml)?.[1] ?? 0)])?.[1] ?? 0)])?.[1];
  for (const ref of ['I4', 'I5', 'A12', 'N12', 'I20', 'AK20', 'I22']) assert.equal(colorOf(ref), 'FF000000', ref);
  assert.equal(ellipseCount(f, OITA_SHEETS.shinsei) - ellipseCount(template('oita'), OITA_SHEETS.shinsei), 1); // 元号の丸（原本の印の点線の丸は残す）
  // 委任状：生年月日（昭和に丸）・住所、受任者は設定の営業所・所長と住所。福祉用具購入費支給申請と販売業者に丸。氏名・日付は自署
  const p = (ref: string) => readCell(f, OITA_SHEETS.proxy, ref);
  assert.equal(p('C5'), '　  　明治 ・ 大正 ・ 昭和　　15年　　3月　　15日');
  assert.equal(p('C6'), '大分県大分市見本町1-2-3');
  assert.equal(p('C22'), '太陽シルバーサービス㈱　大分営業所　所長　山下 厚');
  assert.equal(p('C23'), '〒870-0953　大分県大分市下郡東1-4-35');
  assert.deepEqual([p('C4'), p('H2')], [readCell(template('oita'), OITA_SHEETS.proxy, 'C4'), readCell(template('oita'), OITA_SHEETS.proxy, 'H2')]);
  assert.equal(ellipseCount(f, OITA_SHEETS.proxy), 3);
  for (const sh of [OITA_SHEETS.shinsei, OITA_SHEETS.proxy]) assert.equal(printOverflow(f, sh), null, sh);
});

test('大分市：償還払いは■償還・長い理由は小さくして5行に。確かめる欄（性別・郵便番号の欄はない）', () => {
  const long = '見本の理由の文です。'.repeat(30);
  const f = fillOT({payMethod: '償還払い', items: [item({id: 'a', name: '見本の杖', category: '歩行補助つえ', listPrice: 9800, taxType: '非課税', reason: long})]});
  const at = (ref: string) => readCell(f, OITA_SHEETS.shinsei, ref);
  assert.equal(at('AK3'), '　■償還　　□受領委任');
  assert.equal(OITA_REASON_CELLS.map(at).join(''), long);
  const xml = strFromU8(f[sheetPath(f, OITA_SHEETS.shinsei)]);
  assert.ok(cellStyle(f, xml, 'I22').size < cellStyle(template('oita'), strFromU8(template('oita')[sheetPath(template('oita'), OITA_SHEETS.shinsei)]), 'I22').size);
  assert.deepEqual(shinseiChecks(otSale({gender: '', zip: ''}), OT_S).missing, []);
  assert.deepEqual(shinseiChecks(otSale({careLevel: '', careOffice: '', careManager: ''}), {...OT_S, providerNo: ''}).missing, ['要介護度', '居宅介護支援事業所・ケアマネジャー（理由の記載者）', '販売事業者の事業者番号（10けた）']);
});

test('アプリに入れた原本は空（前の方の記入・写真・丸が残っていない）', () => {
  for (const key of ['yukuhashi', 'kanda', 'miyako', 'kouiki', 'fukuoka', 'kitakyushu'] as ShinseiKey[]) {
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
  // 広域連合：被保険者番号・生年月日・写真の用紙の氏名と商品名・口座の欄。外部リンク・プリンターの設定・保存した場所・文書のプロパティの名前もない
  const k2 = template('kouiki');
  const ju = KOUIKI_SHEETS.juryo;
  assert.equal(['W4', 'X4', 'Y4', 'Z4', 'AA4', 'AB4', 'AC4', 'AD4', 'AE4', 'AF4', 'G40', 'O40'].map((r) => readCell(k2, ju, r)).join(''), '');
  assert.doesNotMatch(readCell(k2, ju, 'G6'), /\d/);
  assert.equal(['B3', 'G3', 'H3', 'P3', 'B4'].map((r) => readCell(k2, KOUIKI_SHEETS.photo, r)).join(''), '');
  assert.equal(Object.keys(k2).filter((n) => /^xl\/(externalLinks|printerSettings)\//.test(n)).length, 0);
  assert.doesNotMatch(strFromU8(k2['xl/workbook.xml']), /absPath|externalReference|#REF!|\[\d+\]/);
  assert.doesNotMatch(strFromU8(k2['docProps/core.xml']), /<dc:creator>[^<]|<cp:lastModifiedBy>[^<]|lastPrinted/);
  assert.doesNotMatch(strFromU8(k2['docProps/app.xml']), /<Company>[^<]/);
  // 福岡市：記載例のシート（見本の名前・会社名）を外した。番号・氏名・商品の欄は空、保険者番号は原本の 4013 だけ
  const fk = template('fukuoka');
  assert.deepEqual([...sheetPaths(fk).keys()], [FUKUOKA_SHEET]);
  assert.equal(joined(fk, [...pairBoxes('Q', 10, 7), 'E5', 'E6', 'E10', 'E11', 'D13', 'J13', 'Q13', 'L26', 'E32', 'E33', 'Q33']), '');
  assert.equal(joined(fk, pairBoxes('Y', 6, 5)), '4013');
  assert.doesNotMatch(strFromU8(fk['xl/workbook.xml']), /記載例|absPath/);
  assert.doesNotMatch(strFromU8(fk['xl/sharedStrings.xml']), /天神|福岡\s*太郎/);
  assert.doesNotMatch(strFromU8(fk['docProps/core.xml']), /<dc:creator>[^<]|<cp:lastModifiedBy>[^<]|lastPrinted/);
  assert.equal(Object.keys(fk).filter((n) => /^xl\/(drawings|externalLinks)\//.test(n)).length, 0);
  // 北九州市：市の様式（Word・Excel）から作った原本。書く欄はどれも空で、記入例（001053094.pdf）の見本の名前は入っていない
  const kk = template('kitakyushu');
  assert.deepEqual([...sheetPaths(kk).keys()], ['支給申請書', '支給申請書（裏）', '概要書', '概要書（裏）']);
  assert.equal(Object.values(KK_CELLS.shikyu).map((r) => (r === KK_CELLS.shikyu.ratio ? '' : readCell(kk, KITAKYUSHU_SHEETS.shikyu, r))).join(''), '');
  assert.equal(Object.values(KK_CELLS.gaiyo).map((r) => readCell(kk, KITAKYUSHU_SHEETS.gaiyo, r)).join(''), '');
  assert.doesNotMatch(strFromU8(kk['xl/sharedStrings.xml']), /北九\s*花子|小倉福祉用具|戸畑|城内/);
  assert.equal(Object.keys(kk).filter((n) => /^xl\/(externalLinks|printerSettings)\//.test(n)).length, 0);
  // 共有の文字の表に、どの欄からも使われない文字（消した記入の名残り）がない
  for (const [key, book] of [['miyako', m], ['kouiki', k2], ['fukuoka', fk], ['kitakyushu', kk]] as const) {
    const used = new Set<number>();
    for (const p of sheetPaths(book).values()) for (const x of strFromU8(book[p]).matchAll(/<c r="[A-Z]+\d+"[^>]*?\st="s"[^>]*>\s*<v>(\d+)<\/v>/g)) used.add(Number(x[1]));
    const count = (strFromU8(book['xl/sharedStrings.xml']).match(/<si>/g) ?? []).length;
    assert.equal(used.size, count, key);
  }
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
  // 広域連合：要介護度の欄はない。居宅の事業所名（居宅介護支援事業所）と届出の有・無
  assert.deepEqual(shinseiChecks(sale({insurer: 'kouiki', careLevel: ''}), S).missing, []);
  assert.deepEqual(shinseiChecks(sale({insurer: 'kouiki', careOffice: ''}), S).missing, ['居宅介護支援事業所（居宅の事業所名）', '居宅サービス計画の届出（有・無）']);
  assert.match(shinseiChecks(sale({insurer: 'kouiki', items: [0, 1, 2, 3].map((k) => item({id: `k${k}`, name: `見本の杖${k}`, reason: '見本'}))}), S).overflow, /^広域連合の申請書の商品の欄は3行です。/);
});

test('ファイル名：「見本花子様特定福祉用具申請書.xlsx」', () => {
  assert.equal(shinseiFileName({customer: '見本 花子'}), '見本花子様特定福祉用具申請書.xlsx');
  assert.equal(shinseiFileName({customer: ''}), 'お客様様特定福祉用具申請書.xlsx');
});

test('会社の名前は㈱に短く・名前の欄は1つの名前が2行に折り返さない（ユーザーの指示「会社名や商品名は、1行から増えないようにする　太陽シルバーサービス㈱などでも良い」）', () => {
  assert.equal(corpShort('太陽シルバーサービス株式会社'), '太陽シルバーサービス㈱');
  assert.equal(corpShort('パナソニックエイジフリー（株）'), 'パナソニックエイジフリー㈱');
  assert.equal(corpShort('株式会社 見本'), '㈱見本');
  assert.equal(corpShort('見本工業(株)'), '見本工業㈱');
  assert.equal(corpShort('有限会社見本'), '㈲見本');
  assert.equal(corpShort('アロン化成'), 'アロン化成');
  const long = sale({
    items: [item({id: 'a', name: '見本のシャワーベンチ背付きワイド 536-057', maker: 'パナソニックエイジフリー（株）', category: '入浴補助用具', listPrice: 30000})],
  });
  // どの保険者でも、種目及び商品名・製造事業者名及び販売事業者名の欄は、改行で分けた1行ずつが欄の幅に入る大きさ（Excel が折り返さない）
  const cases: [ShinseiKey, string, string[]][] = [
    ['yukuhashi', '用具・受領委任払', ['A15', 'L15']],
    ['kanda', '用具・受領委任払', ['A15', 'L15']],
    ['miyako', '福祉用具購入受領委任払申請書', ['B12', 'I12']],
    ['kouiki', KOUIKI_SHEETS.juryo, ['B12', 'I12']],
  ];
  for (const [key, sheet, refs] of cases) {
    const f = fill(key, {items: long.items});
    for (const ref of refs) {
      const text = readCell(f, sheet, ref);
      const {box, style} = cellBox(f, sheet, ref);
      for (const line of text.split('\n')) assert.ok(emOf(line) * ((style.size * 4) / 3) <= box.w - 6 + 0.01, `${key} ${ref}「${line}」が幅 ${box.w} に入らない（${style.size}pt）`);
    }
    assert.match(readCell(f, sheet, refs[1]), /パナソニックエイジフリー㈱\n太陽シルバーサービス㈱/);
  }
});

test('印刷：A4 から少しはみ出す原本のシート（広域連合の様式第8号・償還払い用・写真貼付用紙）は「1ページに合わせる」にする。入るシートはそのまま', () => {
  for (const pay of ['受領委任払い', '償還払い'] as const) {
    const f = fill('kouiki', {payMethod: pay});
    for (const sh of [pay === '償還払い' ? KOUIKI_SHEETS.shokan : KOUIKI_SHEETS.juryo, KOUIKI_SHEETS.photo]) {
      const xml = strFromU8(f[sheetPaths(f).get(sh)!]);
      assert.match(xml, /<pageSetUpPr\b[^>]*fitToPage="1"/, sh);
      assert.match(xml, /<pageSetup\b[^>]*fitToWidth="1"[^>]*fitToHeight="1"/, sh);
      assert.equal(printOverflow(f, sh), null); // もう「ページに合わせる」
    }
  }
  const y = fill('yukuhashi');
  const pre = strFromU8(y[sheetPaths(y).get('用具・受領委任払')!]);
  assert.doesNotMatch(pre, /fitToPage="1"/); // 原本の倍率で入る
  assert.ok((printOverflow(y, '用具・受領委任払') ?? 9) < 1);
});

test('保険者番号（ユーザーの指示「広域連合の場合は、築上町・豊前市・上毛町・吉富町…それぞれ保険者番号が違うため、保険者を選択できる項目を」2026-10-29）：広域連合の様式の6マスを、選んだ・住所の市町村の番号で書きかえる', () => {
  const digits = (files: Files, sheet: string, cols: string[], row: number) => cols.map((c) => String(readCell(files, sheet, `${c}${row}`) ?? '')).join('');
  const AA = ['AA', 'AB', 'AC', 'AD', 'AE', 'AF'];
  // 豊前市の方：受領委任払用（様式第8号）は 402149（原本の 406470 を書きかえる）
  const buzen = fill('kouiki', {address: '福岡県豊前市大字八屋1-1'});
  assert.equal(digits(buzen, KOUIKI_SHEETS.juryo, AA, 2), '402149');
  // 選んだ番号（上毛町）が先。償還払い用（空のマス）にも書く
  const picked = fill('kouiki', {address: '福岡県豊前市大字八屋1-1', insurerNo: '406462', payMethod: '償還払い'});
  assert.equal(digits(picked, KOUIKI_SHEETS.shokan, AA, 4), '406462');
  // 市町村が分からなければ原本と同じ 406470（築上町）
  assert.equal(digits(fill('kouiki', {address: ''}), KOUIKI_SHEETS.juryo, AA, 2), '406470');
  assert.equal(shinseiValues(sale({insurer: 'kitakyushu', address: '北九州市八幡東区見本1'}), S).insurerNo, '401083');
  assert.equal(shinseiValues(sale({insurer: 'yukuhashi'}), S).insurerNo, '402131');
});

test('原本の図形の大きさ（a:ext の cx・cy）はどれも数（前は北九州市の原本の文字の枠が cy="left" で、Excel で開くと修復になるおそれがあった。2026-10-29）', () => {
  for (const key of Object.keys(TEMPLATE_FILES) as ShinseiKey[]) {
    const files = template(key);
    for (const [name, data] of Object.entries(files)) {
      if (!/^xl\/drawings\/drawing\d+\.xml$/.test(name)) continue;
      const bad = [...strFromU8(data).matchAll(/<a:ext\s[^>]*\bc[xy]="[^"]*"[^>]*>/g)].map((m) => m[0]).filter((e) => !/^<a:ext cx="\d+" cy="\d+"\/>$/.test(e));
      assert.deepEqual(bad, [], `${key} ${name}`);
    }
  }
});

test('委任状（行橋市・苅田町）：受任者の欄（会社名・営業所・所長名の3行）は C14:H18 の縦の中央。長い委任者の住所は下線（G 列）の右の端までに入る大きさ', () => {
  // ユーザーの指示「委任状の部分…社長名であったりだとか、もろもろはみ出しの部分などがありました」（2026-11-02）：3行の 12pt の欄（C15:H17）は Excel でぎりぎりで
  // 所長名の行が欄の下で切れることがあった。長い住所は縮める処理がなく、下線・表の右の線を越えて用紙の外まで伸びた
  const long = '福岡県行橋市大字流末1234番地56　見本マンション行橋駅前東館1203号室';
  for (const key of ['yukuhashi', 'kanda'] as const) {
    const files = fill(key, {address: long});
    const xml = strFromU8(files[sheetPath(files, '委任状')]);
    assert.match(xml, /<mergeCell ref="C14:H18"\/>/, key);
    assert.doesNotMatch(xml, /C15:H17/, key);
    assert.match(xml, /<pageSetUpPr fitToPage="1"\/>/, key); // 印刷は1ページに合わせる（表の右の線が2枚目に分かれないように）
    assert.match(readCell(files, '委任状', 'C14'), /^\u3000太陽シルバーサービス株式会社/, key);
    assert.equal(cellStyle(files, xml, 'C14').vertical, 'center', key);
    const text = String(readCell(files, '委任状', 'A32'));
    assert.ok(text.endsWith(long), key);
    const pt = cellStyle(files, xml, 'A32').size;
    const width = rangeBox(sheetLayout(xml), 'A32:G32').w;
    assert.ok(pt < 11 && (emOf(text) * pt * 4) / 3 <= width, `${key} ${pt}pt ${emOf(text)}em ${width}px`);
    // 短い住所は原本の大きさのまま
    const short = fill(key);
    assert.equal(cellStyle(short, strFromU8(short[sheetPath(short, '委任状')]), 'A32').size, 11, key);
  }
});

test('北九州市の支給申請書：受任者（事業者名・代表者名・住所・電話番号）は見出しと同じ 10.5pt のまま（行の高さで縮めない）。幅に入らないときだけ小さく', () => {
  // 前は行の高さ（11.25pt）に入る大きさに縮めて 6.5pt になり、見出し「事業者名」「代表者名」よりずっと小さかった（2026-11-02）
  const files = fillKK();
  const xml = strFromU8(files[sheetPath(files, KITAKYUSHU_SHEETS.shikyu)]);
  const c = KK_CELLS.shikyu;
  for (const ref of [c.sellerA, c.repA, c.sellerB, c.repB, c.sellerAddress, c.sellerTel]) assert.equal(cellStyle(files, xml, ref).size, 10.5, ref);
  const long = fillKK({}, {...KK_S, company: '見本見本見本見本見本見本見本見本見本見本見本見本見本見本株式会社'});
  const longXml = strFromU8(long[sheetPath(long, KITAKYUSHU_SHEETS.shikyu)]);
  assert.ok(cellStyle(long, longXml, c.sellerA).size < 10.5);
});

test('申請書の販売事業者の営業所：大分市は大分・久留米市は久留米・北九州市と福岡市は区の近く・広域連合の田川市と田川郡は田川（設定の営業所がその中ならそのまま）', () => {
  // ユーザーの指示（2026-11-05）「大分の申請書は、大分営業所／久留米は久留米営業所／…／こちらの該当営業所と所長にする」。見積書の発行元（設定）は変えない
  const yk = settingsForOffice(S, '行橋営業所');
  const cases: [Partial<Sale>, string][] = [
    [{insurer: 'oita', address: '大分県大分市見本町1-1'}, '大分営業所'],
    [{insurer: 'kurume', address: '福岡県久留米市見本町1-1'}, '久留米営業所'],
    [{insurer: 'kitakyushu', address: '福岡県北九州市若松区見本1-1'}, '八幡西営業所'],
    [{insurer: 'kitakyushu', address: '福岡県北九州市門司区見本1-1'}, '小倉営業所'],
    [{insurer: 'fukuoka', address: '福岡県福岡市博多区見本1-1'}, '福岡東営業所'],
    [{insurer: 'fukuoka', address: '福岡県福岡市南区見本1-1'}, '福岡南営業所'],
    [{insurer: 'kouiki', address: '福岡県田川郡福智町見本1-1'}, '田川営業所'],
    [{insurer: 'kouiki', address: '福岡県豊前市見本1-1'}, '行橋営業所'],
    [{insurer: 'yukuhashi', address: '福岡県行橋市見本1-1'}, '行橋営業所'],
  ];
  for (const [over, office] of cases) {
    const o = OFFICES.find((x) => x.name === office)!;
    const v = shinseiValues(sale(over), yk);
    assert.deepEqual([v.seller.name, v.seller.address, v.seller.rep], [`太陽シルバーサービス㈱　${o.name}`, o.address, `所長　${o.manager}`], String(over.address));
  }
  // 北九州市の中の営業所の設定は、区がちがってもそのまま（設定で直した所長も）
  const own = {...settingsForOffice(S, '八幡東営業所'), manager: '見本 次郎'};
  assert.equal(shinseiValues(sale({insurer: 'kitakyushu', address: '福岡県北九州市小倉北区見本1-1'}), own).seller.rep, '所長　見本 次郎');
});

test('事業所番号：営業所の一覧に19営業所の事業所番号（チラシ作成（レンタル）と同じ）。広域連合の田川市・田川郡は田川営業所の住所・名称・電話・番号、行橋市は設定の営業所の番号（2026-11-05）', () => {
  assert.equal(OFFICES.filter((o) => /^\d{10}$/.test(o.providerNo ?? '')).length, OFFICES.length);
  assert.equal(OFFICES.find((o) => o.name === '田川営業所')?.providerNo, '4071901971');
  const sh = KOUIKI_SHEETS.juryo;
  const f = fill('kouiki', {zip: '8260000', address: '福岡県田川市見本1-1'});
  const t = OFFICES.find((o) => o.name === '田川営業所')!;
  assert.deepEqual([readCell(f, sh, 'M29'), readCell(f, sh, 'M30'), readCell(f, sh, 'M31')], [t.address, '太陽シルバーサービス株式会社田川営業所', t.tel]);
  assert.equal(['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB'].map((c) => readCell(f, sh, `${c}34`)).join(''), '4071901971');
  // 受領委任契約番号：田川営業所は分からないので空のマス（ユーザーの答え「今はわからないので空白にしてください」2026-11-05。前は原本の行橋営業所の 802 のまま）
  assert.equal(['Z33', 'AA33', 'AB33'].map((r) => readCell(f, sh, r) ?? '').join(''), '');
  assert.equal(OFFICES.find((o) => o.name === '田川営業所')?.juryoNo, undefined);
  assert.equal(OFFICES.find((o) => o.name === '行橋営業所')?.juryoNo, '802');
  // 行橋市の受領委任払の申請書：事業者番号（Z4:AI4）。行橋営業所の設定なら行橋営業所の番号、田川営業所の設定なら田川営業所の番号
  const cols = ['Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI'];
  const yk = fill('yukuhashi');
  assert.equal(cols.map((c) => readCell(yk, '用具・受領委任払', `${c}4`)).join(''), '4072601802');
  const tg = unzipSync(fillShinsei(template('yukuhashi'), SHINSEI.yukuhashi, shinseiValues(sale({insurer: 'yukuhashi'}), settingsForOffice(S, '田川営業所'))));
  assert.equal(cols.map((c) => readCell(tg, '用具・受領委任払', `${c}4`)).join(''), '4071901971');
  // 前に事業者番号を空のまま保存した設定は、営業所の一覧の番号（storage.ts の cleanSettings）
  assert.equal(cleanSettings({...settingsForOffice(S, '田川営業所'), providerNo: ''}).providerNo, '4071901971');
});

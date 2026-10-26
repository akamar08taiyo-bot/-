import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {carePlanOf, corpShort, excelDate, fillShinsei, KOUIKI_SHEETS, padInsuredNo, reasonText, SHINSEI, shinseiChecks, shinseiFileName, shinseiValues} from '../../src/tokutei/shinsei.ts';
import type {ShinseiKey} from '../../src/tokutei/shinsei.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';
import {cellBox, cellFormula, ellipseCount, emOf, printOverflow, readCell, sheetPaths} from '../../src/tokutei/xlsxEdit.ts';
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

const TEMPLATE_FILES: Record<ShinseiKey, string> = {yukuhashi: 'yukuhashi.xltx', kanda: 'kanda.xltx', miyako: 'miyako.xlsx', kouiki: 'kouiki.xlsx'};
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
  assert.equal(readCell(f, sh, 'AB15'), '令和8年10月30日');
  assert.equal(readCell(f, sh, 'AB17'), '　　　年　　月　　日'); // 使わない行は原本のまま
  assert.match(readCell(f, sh, 'E18'), /^浴室の床からの立ち座りが困難なため。/);
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
  assert.equal(readCell(f, post, 'A16'), '入浴補助用具\n浴槽手すり 見本B');
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
  assert.equal(readCell(f, a, 'I20'), '（居宅サービス計画の届出　　有・無）\n浴室の床からの立ち座りが困難なため。\n浴槽の出入りでふらつくため。\n');
  assert.equal(readCell(f, a, 'B12'), '入浴補助用具\nシャワーチェア 見本A'); // 種目と商品名を1行ずつ（名前は折り返さない大きさに）
  assert.deepEqual(['D30', 'F30', 'I30', 'L30'].map((r) => readCell(f, a, r)), ['令和', '8', '10', '22']);
  assert.equal(readCell(f, a, 'I34'), '見本 花子');
  assert.equal(readCell(f, a, 'I36'), '土居 翔太');
  assert.equal(ellipseCount(f, a), 2); // 性別・届出の有
  // 支給申請書：氏名などは式。明細・購入日・申請日は書く
  assert.equal(readCell(f, b, 'I5'), '見本 花子');
  assert.equal(readCell(f, b, 'B12'), '入浴補助用具\nシャワーチェア 見本A');
  assert.equal(readCell(f, b, 'V14'), '令和8年10月30日');
  assert.deepEqual(['H25', 'J25', 'M25', 'P25'].map((r) => readCell(f, b, r)), ['令和', '8', '11', '2']);
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
  assert.equal(readCell(f, sh, 'Y14'), '令和8年10月30日'); // 購入日＝納品日
  assert.equal(readCell(f, sh, 'R18'), String(28160 + 27808)); // 合計
  assert.equal(readCell(f, sh, 'R16'), ''); // 使わない行は空のまま
  assert.match(readCell(f, sh, 'J20'), /^浴室の床からの立ち座りが困難なため。\n浴槽の出入りでふらつくため。/);
  assert.equal(readCell(f, sh, 'J21'), ' 居宅サービス計画の届出　　　有　・　無\n 居宅の事業所名　見本居宅介護支援事業所');
  // 申請日（事前の申請のない様式なので、案件の申請日）
  assert.deepEqual(['C27', 'F27', 'I27', 'L27'].map((r) => readCell(f, sh, r)), ['令和', '8', '10', '22']);
  assert.equal(readCell(f, sh, 'M30'), '太陽シルバーサービス株式会社行橋営業所'); // 申請者（受領委任事業者）は原本のまま
  assert.equal(['Z33', 'AA33', 'AB33'].map((r) => readCell(f, sh, r)).join(''), '802'); // 受領委任契約番号も原本のまま
  assert.equal(readCell(f, sh, 'L38'), '被保険者氏名　　見本 花子'); // 委任状
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
  assert.equal(readCell(f, sh, 'Y16'), '令和8年10月30日');
  assert.equal(readCell(f, sh, 'R20'), String(28160 + 27808));
  assert.match(readCell(f, sh, 'I22'), /^浴室の床からの立ち座りが困難なため。/);
  assert.match(readCell(f, sh, 'I23'), /居宅の事業所名　見本居宅介護支援事業所$/);
  assert.deepEqual(['H30', 'J30', 'M30', 'P30'].map((r) => readCell(f, sh, r)), ['令和', '8', '10', '22']);
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

test('アプリに入れた原本は空（前の方の記入・写真・丸が残っていない）', () => {
  for (const key of ['yukuhashi', 'kanda', 'miyako', 'kouiki'] as ShinseiKey[]) {
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
  // 共有の文字の表に、どの欄からも使われない文字（消した記入の名残り）がない
  for (const [key, book] of [['miyako', m], ['kouiki', k2]] as const) {
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

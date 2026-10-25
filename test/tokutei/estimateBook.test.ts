// 販売見積書（estimateBook.ts）：会社の見積書の原本（print/mitsumori.xltx）に書く欄・式の答え・備考の介護保険の内訳・プレビュー。
// 値はすべて架空（見本）
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {basisNote, itemNote, saleTotals} from '../../src/tokutei/calc.ts';
import {defaultSettings, settingsForOffice} from '../../src/tokutei/defaults.ts';
import {CONT_ROWS, contBlock, ESTIMATE_CAPACITY, ESTIMATE_ROWS, estimateFileName, estimateNotes, estimateOverflow, estimatePages, estimatePreview, fillEstimate, fitScale} from '../../src/tokutei/estimateBook.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';
import {cellFormula, readCell, sheetLayout} from '../../src/tokutei/xlsxEdit.ts';
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
  // 会社の欄（ユーザーの指示「会社名や社長名などの部分は、左寄せを統一」「会社住所の下に、電話番号とFAX番号」「担当名をいれる」）：1行ずつ・式ではなく値
  assert.deepEqual(['H8', 'H9', 'H11', 'H12', 'H13', 'H14', 'H15', 'H16'].map((r) => readCell(f, SH, r)), [
    '太陽シルバーサービス株式会社',
    '行橋営業所　所長　久保　匠史',
    '〒824-0043',
    '福岡県行橋市大字流末1327番地',
    'TEL：0930-26-9640',
    'FAX：0930-26-9641',
    '登録番号：T1290001044462',
    '担当：土居 翔太',
  ]);
  assert.equal(cellFormula(f, SH, 'H12'), '');
  assert.equal(readCell(f, SH, 'I9'), '');
  assert.equal(readCell(f, SH, 'B14'), '特定福祉用具の購入');
  // 1行目：シャワーチェア 見本A（品番）・1台・32,000×0.8＝25,600円・10%・備考に算出根拠
  assert.deepEqual(['A23', 'F23', 'G23', 'H23', 'I23', 'J23', 'K23'].map((r) => readCell(f, SH, r)), ['シャワーチェア 見本A　SC-01', '1', '台', '25600', '25600', '0.1', '定価32,000円の20%引き']);
  assert.equal(cellFormula(f, SH, 'I23'), 'IF(F23*H23,F23*H23,"")');
  // 2行目：浴槽手すり 見本B・2個・15,800×0.8＝12,640円 ×2＝25,280円
  assert.deepEqual(['A24', 'F24', 'G24', 'H24', 'I24'].map((r) => readCell(f, SH, r)), ['浴槽手すり 見本B', '2', '個', '12640', '25280']);
  // 3行目から下は空（原本で式のない行には書かない）
  assert.equal(readCell(f, SH, 'A25'), '');
  assert.equal(readCell(f, SH, 'I25'), '');
  // 品名の欄の書式はどの行も1行目と同じ（原本の2行目の10pt・3行目の赤の太字は使わない）。いちばん下の行は下の罫線の書式のまま
  const xml = strFromU8(f['xl/worksheets/sheet1.xml']);
  const style = (ref: string) => new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`).exec(xml)?.[1];
  for (const r of [24, 25, 37]) assert.equal(style(`A${r}`), style('A23'), `A${r}`);
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
  const v = sale({note: '納品の前にお電話いたします。\nご不明な点は担当までお問い合わせください。'});
  const t = saleTotals(v, S);
  const notes = estimateNotes(v, t);
  assert.equal(notes.length, 3);
  assert.match(notes[0], /^介護保険（受領委任払い）：介護保険の対象 55,968円　利用者負担（1割）5,597円　保険者負担（9割）50,371円$/);
  assert.equal(notes[1], 'お支払いいただく金額 5,597円');
  assert.equal(notes[2], '納品の前にお電話いたします。');
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
  for (const s of ['御　見　積　書', '見本 花子　様', 'シャワーチェア 見本A　SC-01', '55,968', '太陽シルバーサービス株式会社', '登録番号：T1290001044462', 'TEL：0930-26-9640', 'FAX：0930-26-9641', '担当：土居 翔太', '定価32,000円の20%引き', '備考']) assert.ok(text.includes(s), s);
  assert.deepEqual([...new Set(pages[0].fields.map((x) => x.field))].sort(), ['customer', 'estimateDate', 'items', 'note', 'quoteNo', 'staff']);
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
  assert.equal(ESTIMATE_ROWS.length, 16); // ユーザーの指示「見積もりの行数は4行ぐらい減らしていい」
  assert.equal(estimateOverflow(sale({items: many(22)})), 0); // 3ページまで入る
  assert.equal(estimateOverflow(sale({items: many(ESTIMATE_CAPACITY + 2)})), 2);
});

/** 架空の商品 n 点（定価 10,000円・課税） */
const many = (n: number) => Array.from({length: n}, (_, i) => item({id: `x${i}`, name: `見本の商品 ${i + 1}`, listPrice: 10000, cost: 6000}));

test('3ページまで（ユーザーの指示「ページは3ページまでいけるようにする」）：2・3ページ目の明細の行の数は、1ページ目と同じ高さに入るだけ', () => {
  const xml = strFromU8(template()['xl/worksheets/sheet1.xml']);
  const lay = sheetLayout(xml);
  const h = (a: number, b: number) => Array.from({length: b - a + 1}, (_, i) => lay.rowH(a + i)).reduce((x, y) => x + y, 0);
  assert.equal(CONT_ROWS, Math.floor((h(1, 62) - h(1, 7) - lay.rowH(22)) / lay.rowH(23)));
  assert.equal(ESTIMATE_CAPACITY, 16 + CONT_ROWS * 2);
  assert.deepEqual([0, 1, 16, 17, 16 + CONT_ROWS, 17 + CONT_ROWS, ESTIMATE_CAPACITY, ESTIMATE_CAPACITY + 5].map(estimatePages), [1, 1, 1, 2, 2, 3, 3, 3]);
  // 1ページ目が1枚に入る倍率（原本の「1ページに収める」と同じ。明細を16行にして縦が短くなったので前の 76% より大きい）
  assert.equal(fitScale(xml), 82);
});

test('2ページ（25点）：つづきに題名・番号・日付・宛名と明細。合計の式は2ページ目も足す。手動の改ページ・印刷の範囲・倍率', () => {
  const v = sale({items: many(25)});
  const f = unzipSync(fillEstimate(template(), v, S));
  const xml = strFromU8(f['xl/worksheets/sheet1.xml']);
  const {top, head, rows} = contBlock(2);
  assert.equal(top, 63);
  assert.equal(readCell(f, SH, `D${top}`), '御　見　積　書');
  assert.equal(readCell(f, SH, `I${top + 3}`), '№　20261022-1');
  assert.equal(readCell(f, SH, `I${top + 4}`), '46317');
  assert.equal(readCell(f, SH, `A${top + 5}`), '見本 花子　様');
  assert.equal(readCell(f, SH, `A${head}`), '品名');
  assert.equal(readCell(f, SH, 'A4'), '1／2');
  assert.equal(readCell(f, SH, `A${top + 3}`), '2／2（明細のつづき）');
  // 17点目から2ページ目（1ページ目は16行）
  assert.equal(readCell(f, SH, 'A38'), '見本の商品 16');
  assert.equal(readCell(f, SH, 'A39'), '');
  assert.deepEqual(['A', 'F', 'H', 'I', 'J', 'K'].map((c) => readCell(f, SH, `${c}${rows[0]}`)), ['見本の商品 17', '1', '8000', '8000', '0.1', '定価10,000円の20%引き']);
  assert.equal(cellFormula(f, SH, `I${rows[0]}`), `IF(F${rows[0]}*H${rows[0]},F${rows[0]}*H${rows[0]},"")`);
  assert.equal(readCell(f, SH, `A${rows[8]}`), '見本の商品 25');
  assert.equal(readCell(f, SH, `A${rows[9]}`), '');
  // 合計：25点×8,000円＝200,000円＋税20,000円。式は1ページ目と2ページ目の明細を足す
  const t = saleTotals(v, S);
  assert.equal(Number(readCell(f, SH, 'E21')), t.total);
  assert.equal(t.total, 220000);
  assert.equal(cellFormula(f, SH, 'C47'), `SUMIF($J$23:$J$42,A53,$I$23:$I$42)+SUMIF($J$${rows[0]}:$J$${rows.at(-1)},A53,$I$${rows[0]}:$I$${rows.at(-1)})`);
  // 金額の欄に「共有の式」を残さない（原本の26〜42行。親を書きかえると下の行がこわれる）
  assert.ok(!/t="shared"/.test(xml));
  // 結合は重ならない・印刷：手動の改ページ（62行のあと）・1ページに収めるをやめて倍率・印刷の範囲は2ページ目の下まで
  const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g)].map((m) => [m[1].charCodeAt(0), Number(m[2]), m[3].charCodeAt(0), Number(m[4])]);
  for (const [i, a] of merges.entries()) for (const b of merges.slice(i + 1)) assert.ok(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1], `結合が重なる ${a} ${b}`);
  assert.equal(Number(/<mergeCells count="(\d+)">/.exec(xml)?.[1]), merges.length);
  assert.match(xml, /<pageSetUpPr fitToPage="0"\/>/);
  assert.match(xml, /<pageSetup\b[^>]*\sscale="82"/);
  assert.match(xml, /<rowBreaks count="1" manualBreakCount="1"><brk id="62" max="16383" man="1"\/><\/rowBreaks><colBreaks count="1" manualBreakCount="1"><brk id="11"/);
  assert.match(strFromU8(f['xl/workbook.xml']), new RegExp(`見積書!\\$A\\$1:\\$K\\$${rows.at(-1)}<`));
  assert.match(xml, new RegExp(`<dimension ref="A1:K${rows.at(-1)}"/>`));
  assert.match(xml, new RegExp(`sqref="J23:J42 J${rows[0]}:J${rows.at(-1)}"`));
  // 1ページ（20点まで）は原本のまま「1ページに収める」。共有の式も残さない
  const one = strFromU8(unzipSync(fillEstimate(template(), sale(), S))['xl/worksheets/sheet1.xml']);
  assert.match(one, /<pageSetUpPr fitToPage="1"\/>/);
  assert.ok(!/<rowBreaks/.test(one));
  assert.ok(!/t="shared"/.test(one));
});

test('3ページ（80点）：3ページ目まで書く。プレビューも3枚（印の枠は1枚目だけ・押すと入れる所へ）', () => {
  const v = sale({items: many(80)});
  const f = unzipSync(fillEstimate(template(), v, S));
  const p3 = contBlock(3);
  assert.equal(readCell(f, SH, `A${p3.rows[0]}`), `見本の商品 ${17 + CONT_ROWS}`);
  assert.equal(readCell(f, SH, `A${p3.top + 3}`), '3／3（明細のつづき）');
  assert.equal(readCell(f, SH, `A${contBlock(2).top + 3}`), '2／3（明細のつづき）');
  assert.equal(Number(readCell(f, SH, 'E21')), saleTotals(v, S).total);
  assert.equal(cellFormula(f, SH, 'C47').split('SUMIF').length - 1, 3);
  assert.match(strFromU8(f['xl/worksheets/sheet1.xml']), new RegExp(`<rowBreaks count="2" manualBreakCount="2"><brk id="62" max="16383" man="1"/><brk id="${contBlock(2).rows.at(-1)}" max="16383" man="1"/></rowBreaks>`));
  const pages = estimatePreview(template(), v, S);
  assert.equal(pages.length, 3);
  const text = (i: number) => pages[i].texts.map((x) => x.runs.map((r) => r.text).join('')).join('\n');
  assert.ok(text(0).includes('見本の商品 16') && !text(0).includes('見本の商品 17'));
  assert.ok(text(1).includes('見本の商品 17') && text(1).includes('2／3（明細のつづき）') && text(1).includes('御　見　積　書') && text(1).includes('見本 花子　様'));
  assert.ok(text(2).includes('見本の商品 80'));
  assert.equal(pages[0].shapes.filter((x) => x.kind === 'rect' && !x.text).length, 2);
  assert.equal(pages[1].shapes.length, 0);
  assert.deepEqual([...new Set(pages[2].fields.map((x) => x.field))].sort(), ['customer', 'estimateDate', 'items', 'quoteNo']); // 担当は1ページ目の会社の欄だけ
  assert.ok(pages[1].height <= pages[0].height);
});

test('販売見積書の原本（2026-10-25 の直し）：薄い水色・明細16行（39〜42行は隠す）・税率の右に備考の列・右の端は K', () => {
  const t = template();
  const xml = strFromU8(t['xl/worksheets/sheet1.xml']);
  const styles = strFromU8(t['xl/styles.xml']);
  // 灰色の塗り（背景色の15%暗い色）はもうない。見出しは薄い水色
  assert.ok(!/<fgColor theme="0" tint="-0\.1499/.test(styles));
  assert.match(styles, /<fgColor rgb="FFDDEEF9"\/>/);
  for (const r of [39, 40, 41, 42]) assert.match(xml, new RegExp(`<row r="${r}" hidden="1"`));
  assert.ok(!/<row r="38" hidden/.test(xml));
  assert.equal(readCell(t, SH, 'K22'), '備考');
  for (const m of ['D1:I2', 'I4:K4', 'I5:K5', 'H45:K46', 'A59:K59', 'A62:K62']) assert.ok(xml.includes(`<mergeCell ref="${m}"/>`), m);
  assert.match(strFromU8(t['xl/workbook.xml']), /見積書!\$A\$1:\$K\$62</);
  assert.ok(!/t="shared"/.test(xml));
  // 会社の欄は式をやめて値（アプリが設定の営業所の値を書く）。TEL と FAX は別の行
  assert.equal(readCell(t, SH, 'H13'), 'TEL：0930-26-9640');
  assert.equal(readCell(t, SH, 'H14'), 'FAX：0930-26-9641');
  assert.ok(!/VLOOKUP/.test(xml));
});

test('算出根拠（税率の右の備考）：定価×割引・手で入れた単価・定価のない商品・手で直した文', () => {
  const line = (over: Partial<SaleItem>) => saleTotals(sale({items: [item({id: 'k', name: '見本', listPrice: 28000, ...over})]}), S).lines[0];
  assert.equal(basisNote(line({})), '定価28,000円の20%引き');
  assert.equal(basisNote(line({discountRate: 10})), '定価28,000円の10%引き');
  assert.equal(basisNote(line({discountRate: 0})), '定価28,000円');
  assert.equal(basisNote(line({unitPrice: 21000})), '定価28,000円の25%引き'); // 手で入れた単価でも、ちょうど何%引きならそう書く
  assert.equal(basisNote(line({unitPrice: 21500})), '定価28,000円');
  assert.equal(basisNote(line({listPrice: 0, cost: 10000})), ''); // 仕切×125%（仕入れの値段は見せない）
  assert.equal(itemNote(line({basisNote: 'お試し価格'})), 'お試し価格');
  assert.equal(itemNote(line({basisNote: ''})), ''); // 手で消したら空のまま
  assert.equal(itemNote(line({basisNote: null})), '定価28,000円の20%引き');
  const f = unzipSync(fillEstimate(template(), sale({items: [item({id: 'k', name: '見本', listPrice: 28000, basisNote: 'お試し価格'})]}), S));
  assert.equal(readCell(f, SH, 'K23'), 'お試し価格');
});

test('会社の欄：設定の営業所の値（ほかの営業所でも、TEL・FAX・所長・登録番号）。担当がいなければ空', () => {
  const kokura = settingsForOffice(S, '小倉営業所');
  const f = unzipSync(fillEstimate(template(), sale({staff: ''}), kokura));
  assert.deepEqual(['H9', 'H11', 'H13', 'H14', 'H16'].map((r) => readCell(f, SH, r)), ['小倉営業所　所長　森口　賢一', '〒802-0011', 'TEL：093-952-1616', 'FAX：093-952-1627', '']);
});

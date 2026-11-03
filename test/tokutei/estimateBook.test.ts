// 販売見積書（estimateBook.ts）：会社の見積書の原本（print/mitsumori.xltx）に書く欄・式の答え・備考の介護保険の内訳・プレビュー。
// 値はすべて架空（見本）
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {basisNote, itemNote, saleTotals} from '../../src/tokutei/calc.ts';
import {defaultSettings, settingsForOffice} from '../../src/tokutei/defaults.ts';
import {CONT_ROWS, contBlock, ESTIMATE_CAPACITY, ESTIMATE_ROWS, estimateFileName, estimateLayout, estimateNotes, estimateOverflow, insuranceLines, estimatePreview, fillEstimate, fitScale, itemNameLines, belowItemLines, MIN_SHOWN_ROWS, saleLayout, shownRowsOnPage1} from '../../src/tokutei/estimateBook.ts';
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
  assert.equal(readCell(f, SH, 'A6'), '　見本 花子　様');
  assert.equal(readCell(f, SH, 'I4'), '№　20261022-1');
  assert.equal(readCell(f, SH, 'I5'), '46317'); // 2026-10-22（Excel の日付の数）
  // 会社の欄（ユーザーの指示「会社名や社長名などの部分は、左寄せを統一」「会社住所の下に、電話番号とFAX番号」「担当名をいれる」）：1行ずつ・式ではなく値
  assert.deepEqual(['I8', 'I9', 'I11', 'I12', 'I13', 'I14', 'I15', 'I16'].map((r) => readCell(f, SH, r)), [
    '太陽シルバーサービス株式会社',
    '行橋営業所　所長　久保　匠史',
    '〒824-0043',
    '福岡県行橋市大字流末1327番地',
    'TEL：0930-26-9640',
    'FAX：0930-26-9641',
    '登録番号：T1290001044462',
    '担当：土居 翔太',
  ]);
  assert.equal(cellFormula(f, SH, 'I12'), '');
  for (const r of [8, 9, 12, 16]) assert.equal(readCell(f, SH, `H${r}`), ''); // 前の場所（H）は空
  assert.equal(readCell(f, SH, 'B14'), '特定福祉用具の購入');
  // 品名は1商品を メーカー名／商品名（色まで）／【品番】の行に。数量・単位・単価・金額・税率・備考は1行目（ユーザーの指示 2026-11-01）。
  // 1つ目：見本工業／シャワーチェア 見本A／【品番】SC-01（23〜25行）・1台・32,000×0.8＝25,600円・10%・備考に算出根拠
  assert.deepEqual(['A23', 'A24', 'A25'].map((r) => readCell(f, SH, r)), ['見本工業', 'シャワーチェア 見本A', '【品番】SC-01']);
  assert.deepEqual(['F23', 'G23', 'H23', 'I23', 'J23', 'K23'].map((r) => readCell(f, SH, r)), ['1', '台', '25600', '25600', '0.1', '定価32,000円の20%引き']);
  assert.equal(cellFormula(f, SH, 'I23'), 'IF(F23*H23,F23*H23,"")');
  for (const r of [24, 25]) assert.deepEqual(['F', 'G', 'H', 'I', 'J', 'K'].map((c) => readCell(f, SH, `${c}${r}`)), ['', '', '', '', '', ''], `${r}`);
  // 1つ目の下に1行あける（26行。ユーザーの指示「１商品目と２商品目の間には１行開ける」2026-11-03）
  assert.deepEqual(['A', 'F', 'I'].map((c) => readCell(f, SH, `${c}26`)), ['', '', '']);
  // 2つ目：品番が空なので2行（見本製作所／浴槽手すり 見本B。27・28行。品名の中に空白の行を残さない）・2個・15,800×0.8＝12,640円 ×2＝25,280円
  assert.deepEqual(['A27', 'A28', 'F27', 'G27', 'H27', 'I27'].map((r) => readCell(f, SH, r)), ['見本製作所', '浴槽手すり 見本B', '2', '個', '12640', '25280']);
  // 商品の欄は初めから3商品分の12行（23〜34行。「３商品までは一度に入力できるようにする」2026-11-03）。空いた行は空欄
  for (const r of [29, 30, 31, 32, 33, 34]) assert.equal(readCell(f, SH, `A${r}`), '', `A${r}`);
  assert.equal(readCell(f, SH, 'I29'), '');
  // 品名の欄の書式はどの行も1行目と同じ（原本の2行目の10pt・3行目の赤の太字は使わない）。いちばん下の行は下の罫線の書式のまま
  const xml = strFromU8(f['xl/worksheets/sheet1.xml']);
  const style = (ref: string) => new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`).exec(xml)?.[1];
  for (const r of [24, 31, 32, 38]) assert.equal(style(`A${r}`), style('A23'), `A${r}`);
  assert.notEqual(style('A42'), style('A23'));
  // 商品の区切りは実線（1つ目の下にあけた26行の下・2つ目の下にあけた29行の下・商品の欄の終わりの34行の下）。1つの商品の中の行の間と、商品とあけた行の間は原本の細い点線（hair）のまま
  const styles = strFromU8(f['xl/styles.xml']);
  const list = (outer: string, inner: string) => [...(new RegExp(`<${outer}\\b[^>]*>([\\s\\S]*?)</${outer}>`).exec(styles)?.[1] ?? '').matchAll(new RegExp(`<${inner}\\b[^>]*?(?:/>|>[\\s\\S]*?</${inner}>)`, 'g'))].map((m) => m[0]);
  const xfs = list('cellXfs', 'xf');
  const borders = list('borders', 'border');
  const edge = (ref: string, side: string) => new RegExp(`<${side} style="(\\w+)"`).exec(borders[Number(/borderId="(\d+)"/.exec(xfs[Number(style(ref))])?.[1] ?? 0)])?.[1] ?? '';
  for (const r of [26, 29, 34]) for (const c of ['A', 'C', 'F', 'I', 'K']) assert.equal(edge(`${c}${r}`, 'bottom'), 'thin', `${c}${r}`);
  for (const r of [27, 30, 35]) assert.equal(edge(`A${r}`, 'top'), 'thin', `A${r}`);
  for (const r of [23, 24, 25, 27, 28, 31]) assert.equal(edge(`A${r}`, 'bottom'), 'hair', `A${r}`);
  // 値段のない品目（手で入れてまだ値段がない）は単価・金額を空に
  const g = unzipSync(fillEstimate(template(), sale({items: [item({name: '見本の商品', listPrice: 0})]}), S));
  assert.deepEqual(['A23', 'F23', 'H23', 'I23', 'A24'].map((r) => readCell(g, SH, r)), ['見本の商品', '1', '', '', '']);
  // 品名の行：メーカー・品番が空なら詰める。品番は末尾まで
  assert.deepEqual(itemNameLines(item({maker: 'パナソニック', name: 'シャワーチェアAir コンパクトワンタッチ ブルー', code: 'PN-L41432A'})), ['パナソニック', 'シャワーチェアAir コンパクトワンタッチ ブルー', '【品番】PN-L41432A']);
  assert.deepEqual(itemNameLines(item({name: '見本の商品', code: 'X-1'})), ['見本の商品', '【品番】X-1']);
  assert.deepEqual(itemNameLines(item({})), ['']);
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

test('介護保険の内訳は明細の下に1行ずつ（「備考欄に記載している部分を上にずらす」「行を変えて見やすくする」「この部分のみ記載する形で良い　利用者負担額の部分のみ赤字で記載する」2026-10-26）。備考は足す文だけ（御見積合計の右に5行まで）', () => {
  const v = sale({note: '納品の前にお電話いたします。\nご不明な点は担当までお問い合わせください。'});
  const t = saleTotals(v, S);
  assert.deepEqual(insuranceLines(v, t), ['介護保険（受領委任払い）', '介護保険の対象　55,968円', '利用者負担（1割）　5,597円', '保険者負担（9割）　50,371円']);
  const back = sale({payMethod: '償還払い'});
  assert.deepEqual(insuranceLines(back, saleTotals(back, S)).slice(-2), ['いったんお支払いいただく金額　55,968円', '（あとで保険者から 50,371円が払い戻されます）']);
  assert.deepEqual(estimateNotes(v), ['納品の前にお電話いたします。', 'ご不明な点は担当までお問い合わせください。']);
  const f = unzipSync(fillEstimate(template(), v, S));
  // 備考は御見積合計の右（前の「※※消費税について※※」の枠。ユーザーの指示「消費税については、この部分では不要の為、代わりに備考欄にする（行数を増やす）」2026-11-03）
  assert.equal(readCell(f, SH, 'H45'), '備　　考');
  assert.deepEqual(['H47', 'H48', 'H49', 'H50', 'H51'].map((r) => readCell(f, SH, r)), ['納品の前にお電話いたします。', 'ご不明な点は担当までお問い合わせください。', '', '', '']);
  // 2点（23〜28行目）。商品の欄は初めから12行（23〜34行）なので、その下の 35〜38行目。金額の欄・税率は空で、合計は変わらない
  const at = (r: number) => readCell(f, SH, `A${r}`);
  assert.equal(at(34), '');
  assert.deepEqual([35, 36, 37, 38].map(at), insuranceLines(v, t));
  assert.equal(at(39), '');
  assert.equal(readCell(f, SH, 'I36'), '');
  assert.equal(readCell(f, SH, 'J36'), '');
  // 利用者負担（自己負担額）の行だけ赤
  const xml = strFromU8(f['xl/worksheets/sheet1.xml']);
  const styles = strFromU8(f['xl/styles.xml']);
  const fontOf = (ref: string) => {
    const st = Number(/\ss="(\d+)"/.exec(new RegExp(`<c r="${ref}"[^>]*`).exec(xml)?.[0] ?? '')?.[1] ?? 0);
    const xf = [...(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '').matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)][st]?.[0] ?? '';
    return [...(/<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(styles)?.[1] ?? '').matchAll(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g)][Number(/fontId="(\d+)"/.exec(xf)?.[1] ?? 0)]?.[0] ?? '';
  };
  assert.match(fontOf('A37'), /<color rgb="FFFF0000"\/>/);
  for (const r of ['A35', 'A36', 'A38']) assert.doesNotMatch(fontOf(r), /FFFF0000/, r);
  // 宛名は原本（16pt）より2段大きく 20pt（ユーザーの指示「名前の部分は2段階ぐらい大きくする」2026-10-28）
  assert.match(fontOf('A6'), /<sz val="20"\/>/);
  // プレビューでも赤
  const page = estimatePreview(template(), v, S)[0];
  const red = page.texts.find((x) => x.runs.map((r) => r.text).join('') === '利用者負担（1割）　5,597円');
  assert.ok(red && /^#?ff0000$/i.test(red.runs[0].font.color), JSON.stringify(red?.runs[0].font));
  assert.equal(page.texts.find((x) => x.runs.map((r) => r.text).join('') === '保険者負担（9割）　50,371円')?.runs[0].font.color.replace(/^#/, '').toLowerCase() === 'ff0000', false);
});

test('販売見積書のプレビュー：原本の1枚。欄を押すと入れる所へ（宛名・番号・日付・明細・備考）', () => {
  const pages = estimatePreview(template(), sale(), S);
  assert.equal(pages.length, 1);
  const text = pages[0].texts.map((x) => x.runs.map((r) => r.text).join('')).join('\n');
  for (const s of ['御　見　積　書', '見本 花子　様', '見本工業', 'シャワーチェア 見本A', '【品番】SC-01', '55,968', '太陽シルバーサービス株式会社', '登録番号：T1290001044462', 'TEL：0930-26-9640', 'FAX：0930-26-9641', '担当：土居 翔太', '定価32,000円の20%引き', '備考']) assert.ok(text.includes(s), s);
  assert.deepEqual([...new Set(pages[0].fields.map((x) => x.field))].sort(), ['customer', 'estimateDate', 'items', 'note', 'quoteNo', 'selfPay', 'staff']);
  // 印の枠（グループの中の2つの四角）は描く。その上に小さな枠で「所長印」「担当印」（左・右。「□の印鑑欄の上に小さく横□で囲み…」2026-10-26）。
  // 赤い枠・説明の文字（印刷しない図形）は描かない
  const stamps = pages[0].shapes.filter((x) => x.kind === 'rect' && !x.text);
  assert.equal(stamps.length, 2);
  const labels = ['所長印', '担当印'].map((t) => pages[0].shapes.find((x) => x.text === t));
  assert.ok(labels.every(Boolean));
  const [left, right] = [...stamps].sort((a, b) => a.x - b.x);
  assert.ok(Math.abs(labels[0]!.x - left.x) < 1 && Math.abs(labels[1]!.x - right.x) < 1 && Math.abs(labels[0]!.y + labels[0]!.h - left.y) < 1, '名前の枠が印の枠の上にない');
  assert.ok(!text.includes('赤枠内は編集不可です'));
});

test('販売見積書の原本：所長の印影の画像・作った人・パスを入れていない。名前・明細の行より多い商品', () => {
  const t = template();
  assert.ok(!Object.keys(t).some((k) => k.startsWith('xl/media/')));
  assert.ok(!/<xdr:pic>/.test(strFromU8(t['xl/drawings/drawing1.xml'])));
  assert.ok(!/absPath|OneDrive/.test(strFromU8(t['xl/workbook.xml'])));
  // 作った人・コメントを書いた人（パソコンの名前）も消した
  assert.match(strFromU8(t['docProps/core.xml']), /<dc:creator><\/dc:creator><cp:lastModifiedBy><\/cp:lastModifiedBy>/);
  assert.ok(!t['xl/comments1.xml']); // 「リストから営業所を選択してください」のメモも消した（営業所の一覧から選ぶ式をやめたので。2026-10-26）
  // ユーザーの指示「保存のときの名前は、木村 米子様 販売見積書 とする」2026-10-26（名前のすき間は全角でも半角1つ）
  assert.equal(estimateFileName(sale()), '見本 花子様 販売見積書.xlsx');
  assert.equal(estimateFileName(sale({customer: '見本　花子'})), '見本 花子様 販売見積書.xlsx');
  assert.equal(estimateFileName(sale({customer: '見本花子 様'})), '見本花子様 販売見積書.xlsx');
  assert.equal(estimateFileName(sale({customer: ''})), '販売見積書.xlsx');
  // 1ページ目の明細は20行（2026-10-25 に16行にしたが、2026-11-03 に下の備考を御見積合計の右へ移した分で戻した。「行数をつくり…３商品までは一度に入力できるようにする」）
  assert.equal(ESTIMATE_ROWS.length, 20);
  assert.equal(estimateOverflow(sale({items: many(22)})), 0); // 3ページまで入る
  assert.equal(ESTIMATE_CAPACITY, 25);
  assert.equal(estimateOverflow(sale({items: manyFull(ESTIMATE_CAPACITY)})), 0); // 品名が3行の商品は（商品の下に1行あけて）25点まで
  assert.equal(estimateOverflow(sale({items: manyFull(ESTIMATE_CAPACITY + 2)})), 2);
});

/** 架空の商品 n 点（定価 10,000円・課税）。品名は1行（メーカー・品番なし） */
const many = (n: number) => Array.from({length: n}, (_, i) => item({id: `x${i}`, name: `見本の商品 ${i + 1}`, listPrice: 10000, cost: 6000}));
/** 品名が3行（メーカー・商品名・品番）の架空の商品 n 点 */
const manyFull = (n: number) => Array.from({length: n}, (_, i) => item({id: `y${i}`, maker: '見本工業', name: `見本の商品 ${i + 1}`, code: `MI-${i + 1}`, listPrice: 10000, cost: 6000}));

test('3ページまで（ユーザーの指示「ページは3ページまでいけるようにする」）：2・3ページ目の明細の行の数は、1ページ目と同じ高さに入るだけ', () => {
  const xml = strFromU8(template()['xl/worksheets/sheet1.xml']);
  const lay = sheetLayout(xml);
  const h = (a: number, b: number) => Array.from({length: b - a + 1}, (_, i) => lay.rowH(a + i)).reduce((x, y) => x + y, 0);
  assert.equal(CONT_ROWS, Math.floor((h(1, 62) - h(1, 7) - lay.rowH(22)) / lay.rowH(23)));
  assert.equal(ESTIMATE_CAPACITY, 5 + Math.floor((CONT_ROWS + 1) / 4) * 2); // 品名が3行の商品は、商品の下に1行あけて4行ずつ（ページの最後はあけない）
  // 1ページ目が1枚に入る倍率（原本の「1ページに収める」と同じ。明細を16行にして縦が短くなったので前の 76% より大きい。
  // 2026-10-26 に会社の欄の行を高くして 82% → 81%）
  assert.equal(fitScale(xml), 81);
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
  assert.equal(readCell(f, SH, `A${top + 5}`), '　見本 花子　様');
  assert.equal(readCell(f, SH, `A${head}`), '品名');
  assert.equal(readCell(f, SH, 'A4'), '1／2');
  assert.equal(readCell(f, SH, `A${top + 3}`), '2／2（明細のつづき）');
  // 11点目から2ページ目（1ページ目は20行。品名が1行の商品と、その下にあける1行で2行ずつ）。介護保険の内訳は最後の商品の下にあけた行のすぐ下
  assert.equal(readCell(f, SH, 'A41'), '見本の商品 10');
  assert.equal(readCell(f, SH, 'A42'), '');
  assert.deepEqual(['A', 'F', 'H', 'I', 'J', 'K'].map((c) => readCell(f, SH, `${c}${rows[0]}`)), ['見本の商品 11', '1', '8000', '8000', '0.1', '定価10,000円の20%引き']);
  assert.equal(cellFormula(f, SH, `I${rows[0]}`), `IF(F${rows[0]}*H${rows[0]},F${rows[0]}*H${rows[0]},"")`);
  assert.equal(readCell(f, SH, `A${rows[2]}`), '見本の商品 12'); // 2ページ目も商品の下に1行あける
  assert.equal(readCell(f, SH, `A${rows[28]}`), '見本の商品 25');
  assert.equal(readCell(f, SH, `A${rows[29]}`), '');
  assert.equal(readCell(f, SH, `A${rows[30]}`), '介護保険（受領委任払い）');
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
  assert.match(xml, /<pageSetup\b[^>]*\sscale="81"/);
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

test('3ページ（48点）：3ページ目まで書く。プレビューも3枚（印の枠は1枚目だけ・押すと入れる所へ）', () => {
  const v = sale({items: many(48)});
  const f = unzipSync(fillEstimate(template(), v, S));
  const p3 = contBlock(3);
  // 品名が1行の商品は2行ずつ：1ページ目 10点、2ページ目 21点（41行）→ 3ページ目は32点目から
  assert.equal(readCell(f, SH, `A${p3.rows[0]}`), `見本の商品 ${10 + Math.floor((CONT_ROWS + 1) / 2) + 1}`);
  assert.equal(readCell(f, SH, `A${p3.top + 3}`), '3／3（明細のつづき）');
  assert.equal(readCell(f, SH, `A${contBlock(2).top + 3}`), '2／3（明細のつづき）');
  assert.equal(Number(readCell(f, SH, 'E21')), saleTotals(v, S).total);
  assert.equal(cellFormula(f, SH, 'C47').split('SUMIF').length - 1, 3);
  assert.match(strFromU8(f['xl/worksheets/sheet1.xml']), new RegExp(`<rowBreaks count="2" manualBreakCount="2"><brk id="62" max="16383" man="1"/><brk id="${contBlock(2).rows.at(-1)}" max="16383" man="1"/></rowBreaks>`));
  const pages = estimatePreview(template(), v, S);
  assert.equal(pages.length, 3);
  const text = (i: number) => pages[i].texts.map((x) => x.runs.map((r) => r.text).join('')).join('\n');
  assert.ok(text(0).includes('見本の商品 10') && !text(0).includes('見本の商品 11'));
  assert.ok(text(1).includes('見本の商品 11') && text(1).includes('2／3（明細のつづき）') && text(1).includes('御　見　積　書') && text(1).includes('見本 花子　様'));
  assert.ok(text(2).includes('見本の商品 48'));
  assert.equal(pages[0].shapes.filter((x) => x.kind === 'rect' && !x.text).length, 2);
  assert.equal(pages[1].shapes.length, 0);
  assert.deepEqual([...new Set(pages[2].fields.map((x) => x.field))].sort(), ['customer', 'estimateDate', 'items', 'quoteNo', 'selfPay']); // 担当は1ページ目の会社の欄だけ。自己負担額は3ページ目の最後の商品の下
  assert.ok(pages[1].height <= pages[0].height);
});

test('販売見積書の原本（2026-10-25・2026-11-03 の直し）：薄い水色・明細20行・御見積合計の右は備考（下の備考は隠す）・税率の右に備考の列・右の端は K', () => {
  const t = template();
  const xml = strFromU8(t['xl/worksheets/sheet1.xml']);
  const styles = strFromU8(t['xl/styles.xml']);
  // 灰色の塗り（背景色の15%暗い色）はもうない。見出しは薄い水色
  assert.ok(!/<fgColor theme="0" tint="-0\.1499/.test(styles));
  assert.match(styles, /<fgColor rgb="FFDDEEF9"\/>/);
  // 明細は 23〜42行の20行（39〜42行を戻した）。下の備考（58〜62行）は隠し、御見積合計の右の枠（前の「※※消費税について※※」）を備考に
  for (const r of [38, 39, 40, 41, 42]) assert.doesNotMatch(xml, new RegExp(`<row r="${r}"[^>]*hidden="1"`), `${r}`);
  for (const r of [58, 59, 60, 61, 62]) assert.match(xml, new RegExp(`<row r="${r}"[^>]*hidden="1"`), `${r}`);
  assert.equal(readCell(t, SH, 'H45'), '備　　考');
  for (const r of ['H47', 'H48', 'H49']) assert.equal(readCell(t, SH, r), '', r); // 「・左記の消費税は参考となります。」などを消した
  assert.ok(!strFromU8(t['xl/worksheets/sheet1.xml']).includes('消費税について'));
  assert.equal(readCell(t, SH, 'K22'), '備考');
  for (const m of ['D1:I2', 'I4:K4', 'I5:K5', 'H45:K46', 'A59:K59', 'A62:K62']) assert.ok(xml.includes(`<mergeCell ref="${m}"/>`), m);
  assert.match(strFromU8(t['xl/workbook.xml']), /見積書!\$A\$1:\$K\$62</);
  assert.ok(!/t="shared"/.test(xml));
  // 会社の欄は式をやめて値（アプリが設定の営業所の値を書く）。TEL と FAX は別の行
  assert.equal(readCell(t, SH, 'I13'), 'TEL：0930-26-9640');
  assert.equal(readCell(t, SH, 'I14'), 'FAX：0930-26-9641');
  assert.ok(!/VLOOKUP/.test(xml));
});

test('算出根拠（税率の右の備考）：定価×割引・手で入れた単価・定価のない商品・手で直した文', () => {
  const line = (over: Partial<SaleItem>) => saleTotals(sale({items: [item({id: 'k', name: '見本', listPrice: 28000, ...over})]}), S).lines[0];
  assert.equal(basisNote(line({})), '定価28,000円の20%引き');
  assert.equal(basisNote(line({discountRate: 10})), '定価28,000円の10%引き');
  assert.equal(basisNote(line({discountRate: 0})), '定価28,000円');
  assert.equal(basisNote(line({unitPrice: 21000})), '定価28,000円の25%引き'); // 手で入れた単価でも、ちょうど何%引きならそう書く
  // 手で入れた単価（税込・利益率を打った単価も）は、割引率を書く（ユーザーの指示「当然備考の部分も連動して数字が変わる」2026-11-03。前は「定価28,000円」だけ）。
  // 小数2けたまでで単価がちょうど合えばその%、合わなければ「約」
  assert.equal(basisNote(line({unitPrice: 21500})), '定価28,000円の約23.2%引き');
  assert.equal(basisNote(line({unitPrice: 21560})), '定価28,000円の23%引き');
  assert.equal(basisNote(line({listPrice: 11000, unitPrice: 8569})), '定価11,000円の22.1%引き');
  assert.equal(basisNote(line({listPrice: 11000, unitPrice: 8572})), '定価11,000円の22.07%引き');
  assert.equal(basisNote(line({unitPrice: 28000})), '定価28,000円'); // 定価のまま
  assert.equal(basisNote(line({listPrice: 0, cost: 10000})), ''); // 仕切×125%（仕入れの値段は見せない）
  assert.equal(itemNote(line({basisNote: 'お試し価格'})), 'お試し価格');
  assert.equal(itemNote(line({basisNote: ''})), ''); // 手で消したら空のまま
  assert.equal(itemNote(line({basisNote: null})), '定価28,000円の20%引き');
  const f = unzipSync(fillEstimate(template(), sale({items: [item({id: 'k', name: '見本', listPrice: 28000, basisNote: 'お試し価格'})]}), S));
  assert.equal(readCell(f, SH, 'K23'), 'お試し価格');
});

test('会社の欄の場所と大きさ（ユーザーの指示「社名の部分が全体的に小さい。そして、社名は所長印、担当の上にもってくる」2026-10-26）', () => {
  const xml = strFromU8(template()['xl/worksheets/sheet1.xml']);
  for (const r of [8, 9, 11, 12, 13, 14, 15, 16]) assert.ok(xml.includes(`<mergeCell ref="I${r}:K${r}"/>`), `I${r}:K${r}`);
  assert.ok(!/legacyDrawing|<xm:sqref>H9</.test(xml)); // H9 の営業所の一覧・メモはもうない
  const page = estimatePreview(template(), sale(), S)[0];
  const at = (s: string) => page.texts.find((x) => x.runs.map((r) => r.text).join('') === s);
  const name = at('太陽シルバーサービス株式会社')!;
  const office = at('行橋営業所　所長　久保　匠史')!;
  const lines = ['〒824-0043', '福岡県行橋市大字流末1327番地', 'TEL：0930-26-9640', 'FAX：0930-26-9641', '登録番号：T1290001044462', '担当：土居 翔太'].map((x) => at(x)!);
  // 字の大きさ（画素）：会社名 14pt・営業所 12pt・ほか 11pt（前は 11pt・10pt）
  assert.deepEqual([name, office, lines[0]].map((x) => Math.round((x.runs[0].font.size * 72) / 96)), [14, 12, 11]);
  // どの行も同じ左の端（I 列）で、縮めて K の右の端まで（はみ出さない）
  for (const x of [office, ...lines]) assert.equal(x.x, name.x);
  for (const x of [name, office, ...lines]) assert.ok(x.shrink, x.ref);
  // 印の枠（所長印・担当印）は会社の欄の下、会社の欄の左右の中
  const stamps = page.shapes.filter((x) => x.kind === 'rect' && !x.text);
  assert.equal(stamps.length, 2);
  const last = lines[lines.length - 1];
  for (const b of stamps) {
    assert.ok(b.y >= last.y + last.h - 1, `印の枠が会社の欄の下にない：${b.y} < ${last.y + last.h}`);
    assert.ok(b.x >= name.x && b.x + b.w <= name.x + name.w + 1, `印の枠が会社の欄の左右の中にない：${b.x}〜${b.x + b.w}（会社の欄 ${name.x}〜${name.x + name.w}）`);
  }
  // 長い住所の営業所（熊本営業所）でも I〜K の中（縮めて入れる）
  const kumamoto = estimatePreview(template(), sale(), settingsForOffice(S, '熊本営業所'))[0];
  const addr = kumamoto.texts.find((x) => x.runs.map((r) => r.text).join('').startsWith('熊本県'))!;
  assert.ok(addr.shrink && addr.x + addr.w <= name.x + name.w + 1);
});

test('見積書のバランスの直し（2026-10-26）：備考の列を広く・10pt、題名の枠は用紙のまん中、見積日は「2026年10月22日」の形', () => {
  const t = template();
  const xml = strFromU8(t['xl/worksheets/sheet1.xml']);
  const styles = strFromU8(t['xl/styles.xml']);
  const width = (c: number) => Number(new RegExp(`<col min="${c}" max="${c}" width="([\\d.]+)"`).exec(xml)?.[1]);
  const px = (c: number) => Math.floor(8 * width(c) + 0.5);
  const total = Array.from({length: 11}, (_, i) => px(i + 1)).reduce((a, b) => a + b, 0);
  assert.equal(total, 816); // 全体の幅は前と同じ（印刷の大きさが変わらない）
  assert.ok(px(11) >= 155, `備考の列 ${px(11)}px`);
  const left = [1, 2, 3].reduce((a, c) => a + px(c), 0);
  const right = left + [4, 5, 6, 7, 8, 9].reduce((a, c) => a + px(c), 0);
  assert.ok(Math.abs((left + right) / 2 - total / 2) <= 3, `題名の枠（D〜I）のまん中 ${(left + right) / 2} と用紙のまん中 ${total / 2}`);
  // 見積日：組み込みの 31 番（日本語の Excel だけ年月日）ではなく、決めた形
  const nf = /<numFmt numFmtId="(\d+)" formatCode="yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;"\/>/.exec(styles);
  assert.ok(nf);
  const s5 = Number(/<c r="I5" s="(\d+)"/.exec(xml)?.[1]);
  const xf = [...(/<cellXfs count="\d+">(.*?)<\/cellXfs>/s.exec(styles)?.[1] ?? '').matchAll(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/gs)][s5][0];
  assert.match(xf, new RegExp(`numFmtId="${nf[1]}"`));
  const page = estimatePreview(t, sale(), S)[0];
  assert.ok(page.texts.some((x) => x.runs.map((r) => r.text).join('') === '2026年10月22日'));
  // 備考（算出根拠）は 10pt
  const k = page.texts.find((x) => x.runs.map((r) => r.text).join('') === '定価32,000円の20%引き')!;
  assert.equal(Math.round((k.runs[0].font.size * 72) / 96), 10);
  // 題名（ユーザーの指示「見積もりの部分、なんか見た目…きれいに直して」）：黒い太い枠をやめて、薄い水色の帯の下に紺の二重線。字は太字でない紺の 26pt
  const title = page.texts.find((x) => x.runs.map((r) => r.text).join('') === '御　見　積　書')!;
  assert.equal(title.runs[0].font.bold, false);
  assert.equal(Math.round((title.runs[0].font.size * 72) / 96), 26); // 22pt から少し大きく（ユーザーの指示「御見積書の部分は、少し文字を大きくする」2026-10-26）
  assert.match(title.runs[0].font.color, /1f3864/i);
  const under = page.lines.filter((l) => l.double && l.y1 === l.y2 && Math.abs(l.y1 - (title.y + title.h)) <= 2);
  assert.ok(under.length > 0, '題名の下に二重線がない');
  assert.ok(!page.lines.some((l) => l.x1 === l.x2 && l.y1 <= title.y + 1 && l.y2 >= title.y + title.h - 1 && Math.abs(l.x1 - title.x) <= 2), '題名の枠の左の線が残っている');
  // 太字は使いすぎない：残すのは御見積合計の金額と、税率ごとの合計の表の合計の行だけ（宛名・見出しは太字でない）
  const bold = page.texts.filter((x) => x.runs.some((r) => r.font.bold && r.text.trim())).map((x) => x.runs.map((r) => r.text).join(''));
  const tt = saleTotals(sale(), S);
  assert.deepEqual(bold.sort(), [...[tt.amount, tt.tax, tt.total].map((n) => n.toLocaleString('ja-JP')), '円'].sort());
  // 備考は左寄せ（ユーザーの指示「一番下の備考欄の部分、中央揃えじゃなくて左詰めにしてください」。2026-11-03 から御見積合計の右の H47〜H51）
  const withNote = estimatePreview(t, sale({note: '納品の前にお電話いたします。\nご不明な点は担当までお問い合わせください。'}), S)[0];
  const notes = withNote.texts.filter((x) => /^H(4[7-9]|5[01])$/.test(x.ref) && x.runs.some((r) => r.text.trim()));
  assert.ok(notes.length >= 2);
  for (const n of notes) assert.equal(n.align, 'left', n.ref);
  // 印刷しない赤い枠・「赤枠内は編集不可です」のメモは原本から消した（スマホで開くと金額の列に赤い線が出た）。印の枠は残す
  const drawing = strFromU8(t['xl/drawings/drawing1.xml']);
  assert.ok(!/fPrintsWithSheet="0"/.test(drawing));
  assert.ok(drawing.includes('<xdr:grpSp>'));
});

test('自己負担額を表示（初めからオン）：外すと明細の下の介護保険の内訳を書かない。置き場所はページに入るように', () => {
  const one = [item({id: 'a', name: '見本の台', listPrice: 30000})]; // 24,000円＋税 2,400円＝26,400円 → 1割 2,640円
  // 明細の割り付け（ユーザーの指示 2026-11-01・2026-11-03）：商品の下に1行あける。商品の欄は初めから3商品分の12行（1〜3商品は変えない）。4商品から必要な分だけ増やす。
  // 介護保険の内訳は商品の欄のすぐ下。1ページ目（20行）に入らなければ次のページの初めから。1つの商品の行はページをまたがない
  const lay = (n: number, rows = 3, below = 4) => estimateLayout(Array.from({length: n}, () => rows), below);
  assert.deepEqual(lay(1), {items: [{start: 0, rows: 3}], areaEnd: 11, below: 12, pages: 1});
  assert.deepEqual(lay(3), {items: [0, 4, 8].map((start) => ({start, rows: 3})), areaEnd: 11, below: 12, pages: 1}); // 3商品：行は増えない。商品の間は1行
  assert.deepEqual(lay(4), {items: [0, 4, 8, 12].map((start) => ({start, rows: 3})), areaEnd: 15, below: 16, pages: 1}); // 4商品：16行に
  assert.deepEqual(lay(5).items.at(-1), {start: 16, rows: 3});
  assert.deepEqual([lay(5).areaEnd, lay(5).below, lay(5).pages], [19, ESTIMATE_ROWS.length, 2]); // 内訳が入らない → 2ページ目の初め
  assert.deepEqual(lay(6).items.at(-1), {start: ESTIMATE_ROWS.length, rows: 3}); // 6つ目は2ページ目の初めから（1ページ目の残りにまたがない）
  assert.deepEqual([lay(6).areaEnd, lay(6).below, lay(6).pages], [ESTIMATE_ROWS.length + 3, ESTIMATE_ROWS.length + 4, 2]);
  assert.equal(lay(1, 3, 0).below, -1);
  assert.deepEqual(lay(0), {items: [], areaEnd: 11, below: -1, pages: 1});
  assert.equal(lay(ESTIMATE_CAPACITY + 1, 3, 0).items.length, ESTIMATE_CAPACITY);
  // 初め（品名1行の商品1つ）：商品の欄（23〜34行）の下の A35〜A38 に内訳
  const on = sale({items: one});
  const f = unzipSync(fillEstimate(template(), on, S));
  assert.deepEqual(['A35', 'A36', 'A37', 'A38'].map((r) => readCell(f, SH, r)), ['介護保険（受領委任払い）', '介護保険の対象　26,400円', '利用者負担（1割）　2,640円', '保険者負担（9割）　23,760円']);
  assert.equal(readCell(f, SH, 'A34'), '');
  // 外す（false）：書かない。合計は変わらない
  const off = unzipSync(fillEstimate(template(), sale({items: one, showSelfPay: false}), S));
  assert.equal(readCell(off, SH, 'A35'), '');
  assert.equal(readCell(f, SH, 'E21'), readCell(off, SH, 'E21'));
  // 生活保護・限度額を超えた分
  const w = sale({items: one, welfare: true});
  assert.deepEqual(belowItemLines(w, S).lines.slice(2, 4), ['利用者負担（1割）　0円', '生活保護（1割）　2,640円']);
  const over = sale({items: one, remaining: 6400});
  assert.ok(belowItemLines(over, S).lines.includes('限度額を超えた分　20,000円'));
  assert.deepEqual(belowItemLines(sale({items: []}), S).lines, []);
  // プレビューにも出て、押すと「自己負担額」の行へ
  const page = estimatePreview(template(), on, S)[0];
  assert.ok(page.texts.some((x) => x.runs.map((r) => r.text).join('') === '利用者負担（1割）　2,640円'));
  assert.equal(page.fields.filter((x) => x.field === 'selfPay').length, 4);
  // 10点（品名1行・下に1行あけて20行）：1ページ目がいっぱいなので、2ページ目の1行目から書く（2ページになる）。外せば1ページ。8点なら1ページに入る
  const p10 = sale({items: many(10)});
  const g = unzipSync(fillEstimate(template(), p10, S));
  assert.equal(readCell(g, SH, `A${contBlock(2).rows[0]}`), '介護保険（受領委任払い）');
  assert.equal(estimatePreview(template(), p10, S).length, 2);
  assert.equal(estimatePreview(template(), sale({items: many(10), showSelfPay: false}), S).length, 1);
  assert.equal(estimatePreview(template(), sale({items: many(8)}), S).length, 1);
});

test('会社の欄：設定の営業所の値（ほかの営業所でも、TEL・FAX・所長・登録番号）。担当がいなければ空', () => {
  const kokura = settingsForOffice(S, '小倉営業所');
  const f = unzipSync(fillEstimate(template(), sale({staff: ''}), kokura));
  assert.deepEqual(['I9', 'I11', 'I13', 'I14', 'I16'].map((r) => readCell(f, SH, r)), ['小倉営業所　所長　森口　賢一', '〒802-0011', 'TEL：093-952-1616', 'FAX：093-952-1627', '']);
});

// ユーザーの指示「3商品＋受領委任自己負担の説明をフルにいれた場合、1番下の行をあけるのは1行だけで良い」2026-11-03：
// 1ページ目の明細は、使った行の次の1行まで見せて（少なくとも 3商品分12行＋受領委任払いの内訳4行＋1行＝17行）、下の行は隠す
test('1ページ目の明細の行：3商品＋受領委任払いの内訳で、下にあくのは1行だけ（17行）。中身が多ければ20行まで', () => {
  const hidden = (sale: Sale) => {
    const xml = strFromU8(unzipSync(fillEstimate(template(), sale, S))['xl/worksheets/sheet1.xml']);
    return ESTIMATE_ROWS.filter((r) => new RegExp(`<row r="${r}"[^>]*hidden="1"`).test(xml));
  };
  const three = manyFull(3);
  // 3商品（12行）＋内訳4行（35〜38行）＋あける1行（39行）→ 40〜42行を隠す
  assert.equal(MIN_SHOWN_ROWS, 17);
  const full = sale({items: three});
  assert.deepEqual(belowItemLines(full, S).lines.length, 4);
  assert.deepEqual(hidden(full), [40, 41, 42]);
  const f = unzipSync(fillEstimate(template(), full, S));
  assert.match(readCell(f, SH, 'A38'), /^保険者負担/);
  assert.match(readCell(f, SH, 'A35'), /^介護保険（受領委任払い）/);
  assert.equal(readCell(f, SH, 'A39'), '');
  // 1商品・内訳なしでも 17行（3商品分の枠は残す）
  assert.deepEqual(hidden(sale({items: manyFull(1), showSelfPay: false})), [40, 41, 42]);
  // 償還払いは内訳が6行 → 12＋6＋1＝19行
  assert.deepEqual(hidden(sale({items: three, payMethod: '償還払い'})), [42]);
  // 4商品（16行）＋内訳4行＝20行：あける行はないが、20行まで（隠さない）
  assert.deepEqual(hidden(sale({items: manyFull(4)})), []);
  // 2ページになるときは1ページ目は20行のまま
  assert.deepEqual(hidden(sale({items: many(25)})), []);
  // 隠した行はプレビューにも出ない（高さ 0）。1枚のまま
  assert.equal(estimatePreview(template(), full, S).length, 1);
  assert.equal(shownRowsOnPage1(saleLayout(full, S), 4), 17);
});

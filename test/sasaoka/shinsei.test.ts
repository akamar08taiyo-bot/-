import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync, zipSync} from 'fflate';
import {estimateXlsx} from '../../src/sasaoka/estimateXlsx.ts';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {MARK_INFO, NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {boxLabels, checkBoxes, fillShinsei, fitLinesSize, insuredBoxes, padInsuredNo, parseWorkLine, placeBox, rangeBox, readShinsei, SHINSEI, sheetLayout, shinseiCost, shinseiFileName, shinseiKinds, shinseiMarkKeys, shinseiPhotos, shinseiValues, shinseiWorks, workItems} from '../../src/sasaoka/shinsei.ts';
import type {Insurer, Job, Place, Row, ShinseiInfo, ShinseiMarks} from '../../src/sasaoka/types.ts';

const RATES = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateOverheadRate: 0.1, taxRate: 0.1};
const blank = {code: '', maker: '', unit: '', price: 0, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
let seq = 0;
const mat = (name: string, extra: Partial<Row> = {}): Row => ({...blank, id: `r${++seq}`, kind: 'material', refId: null, name, qty: 1, listPrice: 10000, ...extra});
const lab = (price: number): Row => ({...blank, id: `r${++seq}`, kind: 'labor', refId: null, name: '木', price, qty: 1});
const place = (name: string, rows: Row[], extra: Partial<Place> = {}): Place => ({id: `p${++seq}`, name, rows, kind: 1, photo: 0, ...extra});

const job = (extra: Partial<Job> = {}): Job => ({
  id: 'j1',
  month: '2026-10',
  customer: '山田 太郎',
  suffix: '様邸',
  staff: '久保 匠史',
  date: '',
  address: '福岡県京都郡苅田町富久町1-1',
  note: '',
  insuredNo: '0000366989',
  insurer: 'kanda',
  form: 'yukuhashi',
  overhead: null,
  overheadTarget: null,
  shikiri: true,
  places: [
    place('浴室', [mat('木の手すり 35φ 4m', {lengthCm: 60, pieceLengthM: 4}), lab(2000)]),
    place('廊下', []), // 行のない箇所は見積書に出ないので書かない
    place('玄関', [mat('木の手すり 35φ 4m', {lengthCm: 40, pieceLengthM: 4}), mat('木の手すり 35φ 4m', {lengthCm: 60, pieceLengthM: 4, qty: 2})], {photo: 5}),
    place('トイレ', [mat('段差解消スロープ')], {kind: 2}),
  ],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const KANDA = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/kanda.xltx', import.meta.url)));
const YUKUHASHI = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/yukuhashi.xltx', import.meta.url)));
const MIYAKO = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/miyako.xltx', import.meta.url)));
const KOUIKI = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/kouiki.xltx', import.meta.url)));

/** シート名 → そのシートの XML */
function sheets(bytes: Uint8Array): {files: Record<string, Uint8Array>; byName: Map<string, string>} {
  const files = unzipSync(bytes);
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const byName = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? '';
    byName.set(m[1], strFromU8(files[`xl/${target}`]));
  }
  return {files, byName};
}
const cell = (xml: string, ref: string) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)?.[0] ?? '';
/** 欄の文字（inlineStr）。空なら '' */
const txt = (xml: string, ref: string) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(cell(xml, ref))?.[1] ?? '').replace(/&#10;/g, '\n');
const digitsOf = (xml: string, refs: string[]) => refs.map((r) => txt(xml, r)).join('');
const row = (col: string, n: number, r: number) => Array.from({length: n}, (_, i) => {
  const c = [...col].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) + i;
  const name = (k: number): string => (k <= 0 ? '' : name(Math.floor((k - 1) / 26)) + String.fromCharCode(65 + ((k - 1) % 26)));
  return `${name(c)}${r}`;
});

test('改修の内容・箇所及び規模：「①浴室　手すりの取り付け　L=600mm」（写真番号・改修場所・改修の種類の名前・寸法。手すりの長さは入れなければ見積書の使う長さ）', () => {
  assert.deepEqual(shinseiWorks(job(), RATES), ['①浴室　手すりの取り付け　L=600mm', '⑤玄関　手すりの取り付け　L=400×600×600mm', '③トイレ　段差の解消']);
  assert.deepEqual(insuredBoxes('0000366989'), [...'0000366989']);
  assert.deepEqual(insuredBoxes('３６６９８９'), [...'0000366989']); // 全角でもよい。足りなければ右に寄せ、空いた左のマスは 0
  assert.deepEqual(insuredBoxes('12345'), [...'0000012345']);
  assert.deepEqual(insuredBoxes(''), Array(10).fill('')); // 番号がなければ空のまま
  // 番号の欄で確定したとき：右に詰めて空いた左は 0（数字がなければ打ったまま、10けたより長ければ数字のまま）
  assert.deepEqual(['366989', '３６６９８９', ' 0000366989 ', '12-345', '', '未定', '123456789012'].map((v) => padInsuredNo(v)), ['0000366989', '0000366989', '0000366989', '0000012345', '', '未定', '123456789012']);
  assert.equal(shinseiFileName(SHINSEI.kanda!, job(), '2026-10-21'), '苅田町申請書_山田 太郎様_2026-10-21.xlsx');
  // 改修の種類ごと（住宅改修内訳明細書の行）：申請書と同じ書き方。写真番号 → 改修場所（写真貼付用紙）
  const kinds = shinseiKinds(job(), RATES);
  assert.equal(kinds.length, 6);
  assert.deepEqual(kinds[0], {places: '浴室・玄関', works: ['①浴室　手すりの取り付け　L=600mm', '⑤玄関　手すりの取り付け　L=400×600×600mm']});
  assert.deepEqual(kinds[1], {places: 'トイレ', works: ['③トイレ　段差の解消']});
  assert.deepEqual(kinds.slice(2), [0, 0, 0, 0].map(() => ({places: '', works: []})));
  assert.deepEqual(shinseiPhotos(job(), RATES), {1: '浴室', 5: '玄関', 3: 'トイレ'});
  // 長さは見積書の切って使う部材の使う長さ（補強板・ベースプレートはのぞく）。段差の解消・床材の変更などは種類の名前
  const more = job({
    places: [
      place('廊下', [
        mat('BAUHAUS 35アッシュ丸棒 ディンプル付 φ35×4000mm Mオーク', {code: 'BD-134', lengthCm: 160, pieceLengthM: 4}),
        mat('木製ベースプレート 120mm幅', {code: 'BH-422', lengthCm: 170, pieceLengthM: 4}),
        mat('35コーナーブラケット', {code: 'BD-13G'}),
      ]),
      place('玄関', [mat('木製踏台 DX 1段 15')], {kind: 2}),
      place('浴室', [mat('インテリア・バーF Lタイプ ホワイト', {code: 'TS136GLU66'})]),
      place('居室', [mat('クッションフロア')], {kind: 3}),
    ],
  });
  assert.deepEqual(
    shinseiKinds(more, RATES).map((k) => k.works),
    [['①廊下　手すりの取り付け　L=1600mm', '③浴室　手すりの取り付け'], ['②玄関　段差の解消'], ['④居室　床材の変更'], [], [], []],
  );
  // 申請書のタブで入れた寸法（ユーザーの指示）：手すりは長さ（見積書の長さより先）・高さ（任意）、段差の解消は「W600mm D350mm H150mm」。そのほかはうしろに足す
  const sized = job({
    places: [
      place('玄関', [mat('木の手すり 35φ 4m', {lengthCm: 60, pieceLengthM: 4})], {dims: {l: '800', h: '750'}}),
      place('屋外', [mat('木製踏台 DX 1段 15')], {kind: 2, dims: {w: '600', d: '350', h: '150'}}),
      place('トイレ', [mat('L型手すり')], {dims: {l: '６００，８５０mm'}, shinseiText: '木製'}), // 全角・区切り・mm を打っても
      place('浴室', [mat('段差解消スロープ')], {kind: 2, dims: {w: '700'}}),
    ],
  });
  assert.deepEqual(shinseiWorks(sized, RATES), [
    '①玄関　手すりの取り付け　L=800mm H=750mm',
    '②屋外　段差の解消　W600mm D350mm H150mm',
    '③トイレ　手すりの取り付け　L=600×850mm　木製',
    '④浴室　段差の解消　W700mm',
  ]);
  assert.deepEqual(shinseiKinds(sized, RATES)[1].works, ['②屋外　段差の解消　W600mm D350mm H150mm', '④浴室　段差の解消　W700mm']); // 内訳明細書も同じ
  // 「1,600」は3けた区切り（長さ1つ）、「600,850」は長さ2つ
  assert.deepEqual(shinseiWorks(job({places: [place('廊下', [mat('L型手すり')], {dims: {l: '1,600'}}), place('居室', [mat('L型手すり')], {dims: {l: '600,850'}})]}), RATES), ['①廊下　手すりの取り付け　L=1600mm', '②居室　手すりの取り付け　L=600×850mm']);
});

test('苅田町の申請書：事前申請書の氏名・住所・被保険者番号（10マス）・改修の内容に入れる。ほかのシート・欄は原本のまま', () => {
  const out = fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job(), RATES));
  const {files, byName} = sheets(out);
  const orig = sheets(KANDA);
  // シートは15枚のまま（消さない）。テンプレートはふつうのブックにする
  assert.deepEqual([...byName.keys()], [...orig.byName.keys()]);
  assert.equal(byName.size, 15);
  assert.match(strFromU8(files['[Content_Types].xml']), /spreadsheetml\.sheet\.main\+xml/);
  assert.match(strFromU8(files['xl/workbook.xml']), /<calcPr fullCalcOnLoad="1"/);
  const pre = byName.get('事前申請書')!;
  assert.match(cell(pre, 'J7'), /^<c r="J7" s="233" t="inlineStr"><is><t xml:space="preserve">山田 太郎<\/t><\/is><\/c>$/);
  assert.match(cell(pre, 'J11'), /福岡県京都郡苅田町富久町1-1/);
  assert.equal([...'XYZ'].map((c) => cell(pre, `${c}6`)).concat(['AA6', 'AG6'].map((r) => cell(pre, r))).map((c) => /<t[^>]*>(\d)<\/t>/.exec(c)?.[1]).join(''), '00009');
  assert.equal(txt(pre, 'J14'), '①浴室　手すりの取り付け　L=600mm\n⑤玄関　手すりの取り付け　L=400×600×600mm\n③トイレ　段差の解消');
  assert.match(cell(pre, 'J14'), /L=600mm&#10;⑤玄関/); // 改行は &#10;（LibreOffice・スマホのプレビューでも改行する）
  // 事後申請書は事前申請書を参照する式。保存しておく答えも同じにする（スマホのプレビュー用）
  const post = byName.get('事後申請書')!;
  assert.match(cell(post, 'I7'), /<f>事前申請書!J7<\/f><v>山田 太郎<\/v>/);
  assert.match(cell(post, 'AF6'), /<f>事前申請書!AG6<\/f><v>9<\/v>/);
  // 転記した欄のほかは原本と同じ（式・図形・平面図・写真・承諾書・委任状のシート）
  const changed = Object.keys(files).filter((k) => strFromU8(files[k]) !== strFromU8(orig.files[k] ?? new Uint8Array()));
  // 平面図（sheet6）は表題の氏名と、下の空いた所の工事内容のテキストボックス（drawing4）。
  // 事前申請書・事後申請書の図形（drawing1・2）は元号の丸（選んでいなければ昭和。ユーザーの指示「昭和がデフォルトにする」）。
  // 写真番号①③⑤の写真の用紙（sheet7・9・11）は、改修箇所・実施した工事種類の□（その写真番号の箇所を■）
  assert.deepEqual(changed.sort(), [
    '[Content_Types].xml',
    'xl/drawings/drawing1.xml',
    'xl/drawings/drawing2.xml',
    'xl/drawings/drawing4.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet11.xml',
    'xl/worksheets/sheet2.xml',
    'xl/worksheets/sheet6.xml',
    'xl/worksheets/sheet7.xml',
    'xl/worksheets/sheet9.xml',
  ]);
  assert.equal(txt(byName.get('平面図  (2)')!, 'C2'), '山田 太郎');
  const legend = strFromU8(files['xl/drawings/drawing4.xml']);
  assert.match(legend, /<xdr:cNvSpPr txBox="1"\/>/);
  assert.deepEqual([...legend.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]), ['①浴室　手すりの取り付け　L=600mm', '⑤玄関　手すりの取り付け　L=400×600×600mm', '③トイレ　段差の解消']);
  const strip = (x: string) => x.replace(/<c r="[A-Z]+\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, '');
  assert.equal(strip(pre), strip(orig.byName.get('事前申請書')!)); // 欄のほか（罫線・結合・印刷の範囲など）はそのまま
});

test('苅田町の写真の用紙：改修箇所・実施した工事種類の□は、その写真番号の箇所・改修の種類を■に（一覧にない場所は「■勝手口」）。撮影日も書く', () => {
  const j = job({places: [...job().places, place('勝手口', [mat('L型手すり')], {photoDates: {before: '2026-10-01', after: '2026-11-20'}})]});
  const {files, byName} = sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(j, RATES)));
  const strings = [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1].replace(/\r\n/g, '\n')).join(''),
  );
  // 欄の文字（共有の文字か、書いた文字）
  const text = (xml: string, ref: string) => {
    const shared = new RegExp(`<c r="${ref}"[^>]*t="s"[^>]*><v>(\\d+)</v>`).exec(xml)?.[1];
    return shared === undefined ? txt(xml, ref) : strings[Number(shared)];
  };
  const byNo = new Map([...byName].filter(([name]) => name.startsWith('1 ')).map(([, xml]) => [text(xml, 'G42').replace('写真番号', ''), xml]));
  assert.equal(byNo.size, 9);
  const at = (no: string, ref: string) => text(byNo.get(no)!, ref);
  // ①浴室（手すり）・③トイレ（段差の解消）・④勝手口（一覧にない）・⑤玄関
  assert.equal(at('①', 'B2'), '□廊下　□階段　□台所　□居間・食堂　□寝室　□洗面・脱衣室　■浴室　□トイレ\n□玄関　□玄関～道路　□その他（　　　）');
  assert.ok(at('①', 'B4').startsWith('■手すりの取り付け　□(2)段差の解消　□(3)'));
  assert.ok(at('③', 'B2').includes('■トイレ') && at('③', 'B2').split('■').length === 2);
  assert.ok(at('③', 'B4').startsWith('□手すりの取り付け　■(2)段差の解消　□(3)'));
  assert.ok(at('④', 'B2').endsWith('□玄関　□玄関～道路　■勝手口'));
  assert.ok(at('⑤', 'B2').includes('■玄関　□玄関～道路'));
  // 撮影日（改修前 D6・改修後 D23）。入れていない写真番号は原本のまま
  assert.deepEqual([at('④', 'D6'), at('④', 'D23')], ['令和8年10月1日', '令和8年11月20日']);
  assert.equal(at('①', 'D23'), '年　　　月　　　日');
  // 箇所のない写真番号の用紙（②⑥〜⑨）は原本のまま
  assert.ok(at('②', 'B4').startsWith('🔳手すりの取り付け　□(2)段差の解消　□(3)'));
  assert.ok(at('②', 'B2').includes('□その他（　　　）'));
  assert.ok(!strings.some((s) => s.includes('手摺')));
});

test('改修の内容が10箇所・12箇所でも欄からはみ出さない：入らなければ文字を小さくする（申請書の欄・式で同じ内容を出す欄・内訳明細書の行・平面図）', () => {
  const NAMES = ['玄関', '上がり框', '廊下', '階段', 'トイレ', '浴室', '脱衣所', '洗面所', '居室', '寝室', '台所', '勝手口'];
  const many = (n: number, insurer: Insurer = 'kanda') => job({insurer, places: NAMES.slice(0, n).map((name) => place(name, [mat('L型手すり')], {dims: {l: '600×850', h: '800'}}))});
  // 欄の文字の大きさ（pt）と、欄の大きさ（画素）
  const sizeOf = (files: Record<string, Uint8Array>, xml: string, ref: string) => {
    const st = strFromU8(files['xl/styles.xml']);
    const list = (outer: string, inner: string) => [...(new RegExp(`<${outer}\\b[^>]*>([\\s\\S]*?)</${outer}>`).exec(st)?.[1] ?? '').matchAll(new RegExp(`<${inner}\\b[^>]*?(?:/>|>[\\s\\S]*?</${inner}>)`, 'g'))].map((m) => m[0]);
    const xf = list('cellXfs', 'xf')[Number(/\ss="(\d+)"/.exec(cell(xml, ref))?.[1] ?? 0)];
    const font = list('fonts', 'font')[Number(/fontId="(\d+)"/.exec(xf)?.[1] ?? 0)];
    return Number(/<sz val="([\d.]+)"/.exec(font)?.[1]);
  };
  const fits = (files: Record<string, Uint8Array>, xml: string, ref: string, lines: number) => {
    const box = rangeBox(sheetLayout(xml), ref);
    return lines * ((sizeOf(files, xml, ref) * 4) / 3) * 1.25 <= box.h - 4;
  };
  const orig = sheets(KANDA);
  for (const n of [3, 10, 12]) {
    const {files, byName} = sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(many(n), RATES)));
    const pre = byName.get('事前申請書')!;
    const post = byName.get('事後申請書')!;
    assert.equal(txt(pre, 'J14').split('\n').length, n);
    assert.ok(fits(files, pre, 'J14', n), `事前申請書 ${n}箇所`);
    assert.ok(fits(files, post, 'I14', n), `事後申請書 ${n}箇所`); // =事前申請書!J14 の式の欄も
    const base = sizeOf(orig.files, orig.byName.get('事前申請書')!, 'J14');
    if (n === 3) assert.equal(sizeOf(files, pre, 'J14'), base); // 入るときは原本の大きさのまま
    else assert.ok(sizeOf(files, pre, 'J14') < base && sizeOf(files, pre, 'J14') >= 5, `${n}箇所 ${sizeOf(files, pre, 'J14')}pt`);
    // 平面図の工事内容の枠（12pt。入らなければ小さく）
    const legend = strFromU8(files['xl/drawings/drawing4.xml']);
    assert.match(legend, /sz="\d+"/);
  }
  // 行橋市の申請書の欄・みやこ町の内訳明細書の改修の種類の行（12箇所とも手すり＝①の行に12行）
  const yk = sheets(fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, shinseiValues(many(12, 'yukuhashi'), RATES)));
  assert.ok(fits(yk.files, yk.byName.get('住改・受領委任払')!, 'F14', 12));
  const my = sheets(fillShinsei(MIYAKO, SHINSEI.miyako!, shinseiValues(many(12, 'miyako'), RATES)));
  assert.ok(fits(my.files, my.byName.get('住宅改修内訳明細書')!, 'K14', 12));
  // 大きさの決め方：入るときは base、入らなければ 0.5pt ずつ小さく（長い行は折り返した行数で数える）
  assert.equal(fitLinesSize(['あ'], 300, 100, 11), 11);
  assert.equal(fitLinesSize(Array(12).fill('①玄関　手すりの取り付け'), 300, 126, 11), 6);
  assert.ok(fitLinesSize(['①玄関　手すりの取り付け　L=600×850mm H=800mm　とても長い説明の文がつづく'], 120, 40, 11) < 11);
});

test('改修箇所の□の一覧：同じ名前・言いかえ・名前に入っている項目に■。一覧にない場所は「その他」の所を「■名前」に', () => {
  const list = '□廊下　□階段　□台所　□居間・食堂　□寝室　□洗面・脱衣室　□浴室　□トイレ\r\n□玄関　◻︎玄関～道路　□その他（　　　）';
  const labels = boxLabels(list);
  assert.deepEqual(labels, ['廊下', '階段', '台所', '居間・食堂', '寝室', '洗面・脱衣室', '浴室', 'トイレ', '玄関', '玄関～道路', 'その他（　　　）']);
  assert.deepEqual(
    ['廊下', '洗面所', '脱衣所', 'リビング', '2階廊下', '屋外・アプローチ', '玄関', '玄関～道路', '勝手口', '上がり框', '居室', '', 'その他'].map((n) => placeBox(labels, n)),
    [0, 5, 5, 3, 0, 9, 8, 9, null, null, null, null, null],
  );
  assert.equal(checkBoxes(list, 9), '□廊下　□階段　□台所　□居間・食堂　□寝室　□洗面・脱衣室　□浴室　□トイレ\n□玄関　■玄関～道路　□その他（　　　）');
  assert.equal(checkBoxes(list, null, '勝手口'), '□廊下　□階段　□台所　□居間・食堂　□寝室　□洗面・脱衣室　□浴室　□トイレ\n□玄関　□玄関～道路　■勝手口');
  assert.equal(checkBoxes('🔳手すりの取り付け　□(2)段差の解消', 1), '□手すりの取り付け　■(2)段差の解消');
});

test('行橋市の申請書：住改・受領委任払の氏名・住所・被保険者番号（10マス）・改修の内容。読み戻すと同じ', () => {
  const v = shinseiValues(job({insurer: 'yukuhashi', address: '福岡県行橋市中央1-1'}), RATES);
  const out = fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, v);
  const {byName} = sheets(out);
  assert.equal(byName.size, 14);
  const main = byName.get('住改・受領委任払')!;
  assert.match(cell(main, 'F5'), /山田 太郎/);
  assert.match(cell(main, 'F11'), /福岡県行橋市中央1-1/);
  assert.match(cell(main, 'Z7'), /<t[^>]*>0<\/t>/);
  assert.match(cell(main, 'AI7'), /<t[^>]*>9<\/t>/);
  assert.match(cell(main, 'F14'), /①浴室　手すりの取り付け　L=600mm/);
  // 書き込んだ申請書から読む（申請書から見積書を作るとき）。どの保険者の申請書かはシートで見分ける。うしろの文は書いたまま（全角のすき間も）
  const places = [
    {photo: 1, name: '浴室', kind: 1, text: '手すりの取り付け　L=600mm'},
    {photo: 5, name: '玄関', kind: 1, text: '手すりの取り付け　L=400×600×600mm'},
    {photo: 3, name: 'トイレ', kind: 2, text: '段差の解消'},
  ];
  assert.deepEqual(readShinsei(out), {insurer: 'yukuhashi', name: v.name, address: v.address, insuredNo: v.insuredNo, places, info: {}});
  assert.equal(readShinsei(fillShinsei(KANDA, SHINSEI.kanda!, v))?.insurer, 'kanda');
  // 原本のまま（何も書いていない）なら空
  for (const [insurer, bytes] of [['kanda', KANDA], ['miyako', MIYAKO], ['kouiki', KOUIKI]] as const) {
    assert.deepEqual(readShinsei(bytes), {insurer, name: '', address: '', insuredNo: '', places: [], info: {}});
  }
  // 申請書でない Excel は null
  assert.equal(readShinsei(estimateXlsx(job(), defaultSettings(), '2026-10-21').bytes), null);
  assert.equal(readShinsei(new Uint8Array([1, 2, 3])), null);
});

test('改修の内容を手で直す（Place.shinseiLine）：直した文を写真番号のうしろに書く（申請書・内訳明細書・平面図とも）。空にした行は書かない', () => {
  const base = job();
  const at = (i: number, extra: Partial<Place>) => job({places: base.places.map((p, k) => (k === i ? {...p, ...extra} : p))});
  const edited = at(0, {shinseiLine: '浴室　手すりの取り付け　L=650mm　木製 '});
  assert.deepEqual(shinseiWorks(edited, RATES), ['①浴室　手すりの取り付け　L=650mm　木製', '⑤玄関　手すりの取り付け　L=400×600×600mm', '③トイレ　段差の解消']);
  // 画面の欄：直した行は打ったまま（edited）、ほかは自動の文。auto は自動の文（同じに戻したら手で直していないことにする）
  assert.deepEqual(
    workItems(edited, RATES).map((w) => [w.photo, w.edited, w.text, w.auto]),
    [
      [1, true, '浴室　手すりの取り付け　L=650mm　木製 ', '浴室　手すりの取り付け　L=600mm'],
      [5, false, '玄関　手すりの取り付け　L=400×600×600mm', '玄関　手すりの取り付け　L=400×600×600mm'],
      [3, false, 'トイレ　段差の解消', 'トイレ　段差の解消'],
    ],
  );
  assert.deepEqual(shinseiKinds(edited, RATES)[0].works, ['①浴室　手すりの取り付け　L=650mm　木製', '⑤玄関　手すりの取り付け　L=400×600×600mm']);
  const pre = sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(edited, RATES))).byName.get('事前申請書')!;
  assert.equal(txt(pre, 'J14').split('\n')[0], '①浴室　手すりの取り付け　L=650mm　木製');
  // 写真番号は見積書の番号のまま（文の中に打っても付けない）
  assert.deepEqual(shinseiWorks(at(3, {photo: 7, shinseiLine: 'トイレ　スロープ'}), RATES).slice(-1), ['⑦トイレ　スロープ']);
  // 空にした行は申請書に書かない（欄は出す）。改修の種類の行の箇所にも入れない
  const empty = at(3, {shinseiLine: '  '});
  assert.deepEqual(shinseiWorks(empty, RATES), ['①浴室　手すりの取り付け　L=600mm', '⑤玄関　手すりの取り付け　L=400×600×600mm']);
  assert.deepEqual(shinseiKinds(empty, RATES)[1], {places: '', works: []});
  assert.equal(workItems(empty, RATES).length, 3);
});

test('改修の内容の1行から、写真番号・改修場所・改修の種類を読む', () => {
  assert.deepEqual(parseWorkLine('①浴室　手すりの取付　長さ60cm'), {photo: 1, name: '浴室', kind: 1, text: '手すりの取付　長さ60cm'});
  assert.deepEqual(parseWorkLine('①玄関　手すり取り付け　L=600㎜'), {photo: 1, name: '玄関', kind: 1, text: '手すり取り付け　L=600㎜'}); // このアプリの書き方
  assert.deepEqual(parseWorkLine('③トイレ　スロープ設置'), {photo: 3, name: 'トイレ', kind: 2, text: 'スロープ設置'});
  assert.deepEqual(parseWorkLine('(3) 玄関 段差の解消'), {photo: 3, name: '玄関', kind: 2, text: '段差の解消'});
  assert.deepEqual(parseWorkLine('（４）居室　床材の変更'), {photo: 4, name: '居室', kind: 3, text: '床材の変更'});
  assert.deepEqual(parseWorkLine('⑫トイレ　便器の取替'), {photo: 12, name: 'トイレ', kind: 5, text: '便器の取替'});
  assert.deepEqual(parseWorkLine('廊下 手摺取付'), {photo: 0, name: '廊下', kind: 1, text: '手摺取付'});
  // 改修場所のうしろに写真番号（広域連合の内訳明細書の書き方）。改修の種類の行に書いてあれば、その種類。うしろの文は申請書の文として残す（書いたまま）
  assert.deepEqual(parseWorkLine('玄関① 木製L字手すり L=600×850㎜ H=850mm'), {photo: 1, name: '玄関', kind: 1, text: '木製L字手すり L=600×850㎜ H=850mm'});
  assert.deepEqual(parseWorkLine('玄関② 木製踏台'), {photo: 2, name: '玄関', kind: 2, text: '木製踏台'}); // 踏台は段差の解消
  assert.deepEqual(parseWorkLine('玄関②\u3000木製踏台L=400×600mm  H=170mm', 2), {photo: 2, name: '玄関', kind: 2, text: '木製踏台L=400×600mm H=170mm'});
});

test('みやこ町の申請書：承認届出書の氏名・住所・番号（ほかのシートは式で同じ）、支給申請書の氏名、内訳明細書の改修の種類の行、平面図・写真', () => {
  const v = shinseiValues(job({insurer: 'miyako', address: '福岡県京都郡みやこ町勝山1-1'}), RATES);
  const out = fillShinsei(MIYAKO, SHINSEI.miyako!, v);
  const {files, byName} = sheets(out);
  const orig = sheets(MIYAKO);
  assert.deepEqual([...byName.keys()], [...orig.byName.keys()]); // 12枚のまま
  const top = byName.get('住宅改修承認届出書')!;
  assert.deepEqual([txt(top, 'I5'), txt(top, 'I9'), digitsOf(top, row('W', 10, 4))], ['山田 太郎', '福岡県京都郡みやこ町勝山1-1', '0000366989']);
  const pay = byName.get('住宅改修費支給申請書(受領委任払用)')!;
  assert.equal(txt(pay, 'J6'), '山田 太郎'); // 式でない欄なので書く
  // 承認届出書を参照する式（=IF(承認届出書!W4="","",承認届出書!W4)）の答えも同じにする（スマホのプレビュー用）
  assert.match(cell(pay, 'X5'), /<f>IF\(住宅改修承認届出書!W4="","",住宅改修承認届出書!W4\)<\/f><v>0<\/v>/);
  assert.match(cell(pay, 'AG5'), /<v>9<\/v>/);
  assert.match(cell(pay, 'J10'), /<v>福岡県京都郡みやこ町勝山1-1<\/v>/);
  const detail = byName.get('住宅改修内訳明細書')!;
  assert.match(cell(detail, 'I6'), /<v>山田 太郎<\/v>/);
  assert.deepEqual([txt(detail, 'D15'), txt(detail, 'K14'), txt(detail, 'D17'), txt(detail, 'K16'), txt(detail, 'K18')], [
    '浴室・玄関',
    '①浴室　手すりの取り付け　L=600mm\n⑤玄関　手すりの取り付け　L=400×600×600mm',
    'トイレ',
    '③トイレ　段差の解消',
    '',
  ]);
  assert.equal(txt(byName.get('平面図')!, 'A1'), '山田 太郎　邸　平面図');
  // 写真（1）〜（4）：原本の写真番号（①〜④）の改修場所。写真番号のない②④は空
  assert.deepEqual([1, 2, 3, 4].map((n) => txt(byName.get(`写真 (${n})`)!, 'B5')), ['浴室', '', 'トイレ', '']);
  assert.deepEqual([1, 2, 3, 4].map((n) => txt(byName.get(`写真 (${n})`)!, 'B4') + digitsOf(byName.get(`写真 (${n})`)!, row('D', 10, 4))), Array(4).fill('山田 太郎0000366989'));
  // 承諾書・理由書は原本のまま
  const changed = Object.keys(files).filter((k) => strFromU8(files[k]) !== strFromU8(orig.files[k] ?? new Uint8Array()));
  assert.ok(!changed.some((k) => /sheet(4|5|11|12)\.xml$/.test(k)), changed.join(' '));
  assert.deepEqual(readShinsei(out), {insurer: 'miyako', name: '山田 太郎', address: '福岡県京都郡みやこ町勝山1-1', insuredNo: '0000366989', info: {}, places: [
    {photo: 1, name: '浴室', kind: 1, text: '手すりの取り付け　L=600mm'},
    {photo: 5, name: '玄関', kind: 1, text: '手すりの取り付け　L=400×600×600mm'},
    {photo: 3, name: 'トイレ', kind: 2, text: '段差の解消'},
  ]});
});

test('広域連合（築上町など）の申請書：承認申請書・支給申請書（受領委任払用）・内訳明細書（別紙）・平面図・写真貼付用紙10枚', () => {
  const v = shinseiValues(job({insurer: 'kouiki', address: '福岡県築上郡築上町椎田1-1'}), RATES);
  const out = fillShinsei(KOUIKI, SHINSEI.kouiki!, v);
  const {files, byName} = sheets(out);
  const orig = sheets(KOUIKI);
  assert.deepEqual([...byName.keys()], [...orig.byName.keys()]); // 25枚のまま
  for (const name of ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）']) {
    const x = byName.get(name)!;
    // 住所は2行目（J10）。1行目（J9）は〒と郵便番号で、入れていなければ原本のまま（空）
    assert.deepEqual([txt(x, 'J6'), txt(x, 'J9'), txt(x, 'J10'), digitsOf(x, row('X', 10, 7))], ['山田 太郎', '', '福岡県築上郡築上町椎田1-1', '0000366989'], name);
  }
  const b = byName.get('様式第2号別紙（住宅改修内訳明細書）')!;
  assert.deepEqual([txt(b, 'I6'), digitsOf(b, row('W', 10, 7)), txt(b, 'D15'), txt(b, 'K14'), txt(b, 'D17'), txt(b, 'K16')], [
    '山田 太郎',
    '0000366989',
    '浴室・玄関',
    '①浴室　手すりの取り付け　L=600mm\n⑤玄関　手すりの取り付け　L=400×600×600mm',
    'トイレ',
    '③トイレ　段差の解消',
  ]);
  assert.equal(txt(byName.get('平面図 (2)')!, 'A1'), '　山田 太郎　様　邸　平面図');
  // 写真貼付用紙：原本の写真番号（①①②②③③④④⑤⑤）ごとの改修場所。番号は10マス
  const photoSheets = SHINSEI.kouiki!.sheets.filter((x) => x.photoPlace).map((x) => byName.get(x.sheet)!);
  assert.equal(photoSheets.length, 10);
  assert.deepEqual(photoSheets.map((x) => txt(x, 'B5')), ['浴室', '浴室', '', '', 'トイレ', 'トイレ', '', '', '玄関', '玄関']);
  assert.ok(photoSheets.every((x) => txt(x, 'B4') === '山田 太郎' && digitsOf(x, row('D', 10, 4)) === '0000366989'));
  // 償還払い用・取下げ・承諾書・理由書は原本のまま
  const changed = Object.keys(files).filter((k) => strFromU8(files[k]) !== strFromU8(orig.files[k] ?? new Uint8Array()));
  assert.ok(!changed.some((k) => /sheet(19|2[0-5])\.xml$/.test(k)), changed.join(' '));
  assert.deepEqual(readShinsei(out), {insurer: 'kouiki', name: '山田 太郎', address: '福岡県築上郡築上町椎田1-1', insuredNo: '0000366989', info: {}, places: [
    {photo: 1, name: '浴室', kind: 1, text: '手すりの取り付け　L=600mm'},
    {photo: 5, name: '玄関', kind: 1, text: '手すりの取り付け　L=400×600×600mm'},
    {photo: 3, name: 'トイレ', kind: 2, text: '段差の解消'},
  ]});
});

/** シートの図形のファイルの場所（xl/drawings/drawing1.xml）。図形のないシートは '' */
function drawingPath(files: Record<string, Uint8Array>, sheet: string): string {
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const rid = [...wb.matchAll(/<sheet [^>]*>/g)].map((m) => m[0]).find((t) => /name="([^"]*)"/.exec(t)?.[1] === sheet)?.match(/r:id="([^"]+)"/)?.[1];
  const path = `xl/${new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]}`;
  const drawingId = /<drawing r:id="([^"]+)"/.exec(strFromU8(files[path]))?.[1];
  if (!drawingId) return '';
  const sheetRels = strFromU8(files[path.replace(/([^/]+)$/, '_rels/$1.rels')]);
  const target = new RegExp(`<Relationship [^>]*Id="${drawingId}"[^>]*Target="\\.\\./drawings/([^"]+)"`).exec(sheetRels)?.[1];
  return `xl/drawings/${target}`;
}
/** 図形のファイルの図形（1つずつ。twoCellAnchor・oneCellAnchor など） */
const anchorsOf = (d: string) => [...d.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g)].map((m) => m[0]);
/** 図形の置き場所（from・to の [列, 列の中の位置, 行, 行の中の位置]。0始まり） */
const anchorOf = (a: string) => {
  const n = [...a.matchAll(/<xdr:(?:col|colOff|row|rowOff)>(\d+)</g)].map((m) => Number(m[1]));
  return {from: n.slice(0, 4), to: n.slice(4, 8)};
};

/** シートの楕円の図形（from・to の [列, 列の中の位置, 行, 行の中の位置]。0始まり） */
function ellipses(bytes: Uint8Array, sheet: string): {from: number[]; to: number[]}[] {
  const files = unzipSync(bytes);
  const path = drawingPath(files, sheet);
  if (!path) return [];
  return anchorsOf(strFromU8(files[path]))
    .filter((a) => /prst="ellipse"/.test(a))
    .map(anchorOf);
}
const marksOf = (m: Partial<ShinseiMarks>): ShinseiMarks => ({gender: '', era: '', care: '', renovated: '', ...m});
const TEMPLATES: Record<Insurer, Uint8Array> = {kanda: KANDA, yukuhashi: YUKUHASHI, miyako: MIYAKO, kouiki: KOUIKI};

test('申請書の丸：選んだ性別・元号・要介護状態区分・改修状況を楕円で囲む（苅田町は事前申請書と事後申請書の両方）。選ばなければ囲まない', () => {
  assert.deepEqual(shinseiMarkKeys('kanda'), ['gender', 'era', 'care']);
  assert.deepEqual(shinseiMarkKeys('yukuhashi'), ['gender', 'era', 'care']);
  assert.deepEqual(shinseiMarkKeys('miyako'), ['gender', 'renovated']);
  assert.deepEqual(shinseiMarkKeys('kouiki'), ['gender', 'renovated']);
  // 苅田町：生年月日（昭）・性別（女）は9行目、要介護状態区分（要介護２）は12行目。文字の位置から計算した場所
  const kd = fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job({shinsei: {...NO_SHINSEI, ...marksOf({gender: '女', era: '昭和', care: '要介護2'})}}), RATES));
  assert.deepEqual(ellipses(kd, '事前申請書'), [
    {from: [15, 37386, 8, 19050], to: [16, 123111, 8, 285750]},
    {from: [28, 69056, 8, 19050], to: [29, 173831, 8, 285750]},
    {from: [17, 885825, 11, 38100], to: [20, 27813, 11, 266700]},
  ]);
  assert.equal(ellipses(kd, '事後申請書').length, 3);
  // 元号は選んでいなければ昭和（保存する値は空のまま）。選んだらその元号
  assert.equal(shinseiValues(job(), RATES).marks.era, '昭和');
  assert.equal(shinseiValues(job(), RATES).texts.era, '昭和');
  assert.equal(shinseiValues(job({shinsei: {...NO_SHINSEI, era: '大正'}}), RATES).marks.era, '大正');
  // 選ばなければ、元号の昭和だけを囲む（ユーザーの指示「昭和がデフォルトにする」）。ほかの図形は原本のまま（前の申請の丸は原本から消してある）
  assert.deepEqual(ellipses(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job(), RATES)), '事前申請書'), [{from: [15, 37386, 8, 19050], to: [16, 123111, 8, 285750]}]);
  // 保険者・項目・値のどれでも：値の欄の行に1つ。左の値ほど左（申請書に並んでいる順）。元号のほかは、選ばなくても出る昭和の丸を数えない
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) {
    for (const sheet of SHINSEI[insurer]!.sheets.filter((x) => x.marks)) {
      const base = new Set(ellipses(fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, shinseiValues(job(), RATES)), sheet.sheet).map((e) => JSON.stringify(e)));
      for (const mark of sheet.marks!) {
        const row = Number(/\d+$/.exec(mark.cell)![0]) - 1;
        let last = [-1, 0];
        for (const value of MARK_INFO[mark.key].options) {
          const out = fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, shinseiValues(job({shinsei: {...NO_SHINSEI, ...marksOf({[mark.key]: value})}}), RATES));
          const mine = ellipses(out, sheet.sheet).filter((e) => e.from[2] <= row + 1 && e.to[2] >= row && (mark.key === 'era' || !base.has(JSON.stringify(e))));
          assert.equal(mine.length, 1, `${insurer} ${sheet.sheet} ${mark.cell} ${value}`);
          const at = mine[0].from;
          assert.ok(at[0] > last[0] || (at[0] === last[0] && at[1] > last[1]), `${insurer} ${sheet.sheet} ${value} が前の値より右にない`);
          last = at;
        }
      }
    }
  }
});

test('申請書の丸：図形のないシート（行橋市の申請書・みやこ町の支給申請書）には図形のファイルを足す。もとの図形は残す', () => {
  const marks = marksOf({gender: '男', era: '大正', care: '要支援1', renovated: '有'});
  const yk = unzipSync(fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, shinseiValues(job({insurer: 'yukuhashi', shinsei: {...NO_SHINSEI, ...marks}}), RATES)));
  const sheet1 = strFromU8(yk['xl/worksheets/sheet1.xml']);
  const rid = /<drawing r:id="(rId\d+)"\/><\/worksheet>$|<drawing r:id="(rId\d+)"\/><(?:legacyDrawing|tableParts|extLst)/.exec(sheet1);
  assert.ok(rid, '住改・受領委任払のシートに <drawing> がない');
  const rels = strFromU8(yk['xl/worksheets/_rels/sheet1.xml.rels']);
  const target = new RegExp(`Id="${rid[1] ?? rid[2]}" Type="[^"]*/drawing" Target="\\.\\./drawings/(drawing\\d+\\.xml)"`).exec(rels)?.[1];
  assert.ok(target && yk[`xl/drawings/${target}`], rels);
  assert.match(strFromU8(yk['[Content_Types].xml']), new RegExp(`PartName="/xl/drawings/${target}" ContentType="application/vnd\\.openxmlformats-officedocument\\.drawing\\+xml"`));
  assert.equal((strFromU8(yk[`xl/drawings/${target}`]).match(/prst="ellipse"/g) ?? []).length, 3);
  // 行橋市の要支援は「要支援　１・２」の数字を囲む（数字1字の幅より大きく）
  const yb = fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, shinseiValues(job({insurer: 'yukuhashi', shinsei: {...NO_SHINSEI, ...marks}}), RATES));
  assert.equal(ellipses(yb, '住改・受領委任払').length, 3);
  // みやこ町：承認届出書は原本の図形（受領委任払いの丸など2つ）に足す。支給申請書は図形を作る
  const my = fillShinsei(MIYAKO, SHINSEI.miyako!, shinseiValues(job({insurer: 'miyako', shinsei: {...NO_SHINSEI, ...marks}}), RATES));
  assert.equal(ellipses(my, '住宅改修承認届出書').length, 2 + 2);
  assert.equal(ellipses(my, '住宅改修費支給申請書(受領委任払用)').length, 2);
  const d1 = strFromU8(unzipSync(my)['xl/drawings/drawing1.xml']);
  const ids = [...d1.matchAll(/<xdr:cNvPr [^>]*\bid="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, '図形の番号が重なっている');
  // 広域連合：承認申請書・支給申請書の性別・改修状況
  const kk = fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues(job({insurer: 'kouiki', shinsei: {...NO_SHINSEI, ...marks}}), RATES));
  for (const name of ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）']) assert.equal(ellipses(kk, name).length, 2, name);
});

test('内訳明細書の②〜⑥の行も、①の行と同じ折り返しの書式にする（①②ごとに1行で見えるように）', () => {
  const two = job({
    insurer: 'kouiki',
    places: [place('玄関', [mat('段差解消スロープ')], {kind: 2}), place('勝手口', [mat('木製踏台 DX 1段 15')], {kind: 2})],
  });
  const style = (xml: string, ref: string) => /\ss="(\d+)"/.exec(cell(xml, ref))?.[1];
  for (const [insurer, name] of [['kouiki', '様式第2号別紙（住宅改修内訳明細書）'], ['miyako', '住宅改修内訳明細書']] as const) {
    const out = sheets(fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, shinseiValues({...two, insurer}, RATES))).byName.get(name)!;
    const orig = sheets(TEMPLATES[insurer]).byName.get(name)!;
    assert.equal(txt(out, 'K16'), '①玄関　段差の解消\n②勝手口　段差の解消');
    assert.equal(style(out, 'K16'), style(orig, 'K14'), insurer); // 左上にそろえて折り返す
    assert.equal(style(out, 'D17'), style(orig, 'D15'), insurer);
    assert.equal(style(out, 'K18'), style(orig, 'K18'), insurer); // 書かない行は原本のまま
  }
});

/** 申請書の画面で入れる項目（見本） */
const INFO: ShinseiInfo = {
  ...NO_SHINSEI,
  kana: 'ヤマダ　タロウ',
  era: '昭和',
  birthY: '23',
  birthM: '5',
  birthD: '6',
  gender: '男',
  care: '要介護2',
  renovated: '無',
  zip: '800-0300',
  phone: '0930-00-0000',
  owner: '山田 太郎',
  relation: '本人',
  reasonOffice: '見本居宅介護支援事業所',
  reasonName: '見本 花子',
  start: '2026-11-05',
  end: '2026-11-20',
};
const yenText = (n: number) => n.toLocaleString('en-US');

test('申請書の画面で入れた項目：苅田町は事前申請書の フリガナ・生年月日・〒・電話番号・住宅の所有者・本人との関係・完了予定日・改修予定費用（事後申請書は式で同じ）。着工予定日は空白。読み戻せる', () => {
  const j = job({shinsei: INFO});
  const cost = shinseiCost(j, RATES)!;
  assert.ok(cost > 0); // 見積書の介護保険対象分の合計（税込）
  const out = fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(j, RATES));
  const {byName} = sheets(out);
  const pre = byName.get('事前申請書')!;
  assert.deepEqual(
    ['J6', 'J9', 'J10', 'AB11', 'J13', 'W13', 'Y16', 'J17'].map((r) => txt(pre, r)),
    ['ヤマダ　タロウ', '明　・　大　・　昭　23年5月6日生', '〒800-0300', '0930-00-0000', '山田 太郎', '本人との関係（本人）', '令和8年11月20日', `${yenText(cost)}円`],
  );
  // 着工予定日（Y15）は書かない（ユーザーの指示「申請書の着工予定日は空白にする」）。着工の日を入れてあっても原本のまま
  assert.equal(cell(pre, 'Y15'), cell(sheets(KANDA).byName.get('事前申請書')!, 'Y15'));
  const post = byName.get('事後申請書')!;
  assert.match(cell(post, 'I6'), /<f>事前申請書!J6<\/f><v>ヤマダ　タロウ<\/v>/);
  assert.match(cell(post, 'I9'), /<v>明　・　大　・　昭　23年5月6日生<\/v>/);
  assert.match(cell(post, 'V13'), /<v>本人との関係（本人）<\/v>/);
  // 生年月日を書いても、元号の丸は書いた文字の「昭」を囲む（事前・事後とも）
  assert.equal(ellipses(out, '事前申請書').length, 3);
  assert.deepEqual(readShinsei(out)?.info, {kana: 'ヤマダ　タロウ', birthY: '23', birthM: '5', birthD: '6', zip: '800-0300', phone: '0930-00-0000', owner: '山田 太郎', relation: '本人', end: '2026-11-20'});
  // 何も入れていなければ原本の文字のまま（「本人との関係（　　　）」「明　・　大　・　昭   年月日生」）
  const blank = sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job(), RATES))).byName.get('事前申請書')!;
  const orig = sheets(KANDA).byName.get('事前申請書')!;
  for (const r of ['J6', 'J9', 'J10', 'AB11', 'J13', 'W13', 'Y15', 'Y16']) assert.equal(cell(blank, r), cell(orig, r), r);
});

test('申請書の画面で入れた項目：行橋市（〒のうしろ・数の欄の改修予定費用）・みやこ町（支給申請書の日付の欄・式の答えは数）・広域連合（承認と支給の申請書・別紙のフリガナ）', () => {
  const j = job({shinsei: INFO});
  const cost = shinseiCost(j, RATES)!;
  // 行橋市：改修予定費用は数（表示形式 #,##0 の欄）
  const yk = sheets(fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, shinseiValues({...j, insurer: 'yukuhashi'}, RATES))).byName.get('住改・受領委任払')!;
  assert.deepEqual(['F4', 'F9', 'G10', 'Y10', 'F13', 'V13', 'AB18'].map((r) => txt(yk, r)), ['ヤマダ　タロウ', '明・大・昭　23年5月6日生', '800-0300', '0930-00-0000', '山田 太郎', '本人との関係（本人）', '令和8年11月20日']);
  assert.equal(cell(yk, 'AB16'), cell(sheets(YUKUHASHI).byName.get('住改・受領委任払')!, 'AB16')); // 着工予定日は空白（原本のまま）
  assert.match(cell(yk, 'F20'), new RegExp(`^<c r="F20" s="\\d+"><v>${cost}</v></c>$`));
  // みやこ町：承認届出書。支給申請書・内訳明細書は式で同じ（改修費用の式の答えは数）。支給申請書の着工日・完成日は Excel の日付
  const m = sheets(fillShinsei(MIYAKO, SHINSEI.miyako!, shinseiValues({...j, insurer: 'miyako'}, RATES))).byName;
  const top = m.get('住宅改修承認届出書')!;
  assert.deepEqual(['I4', 'I7', 'I8', 'Z9', 'I10', 'N11', 'N12'].map((r) => txt(top, r)), ['ヤマダ　タロウ', '昭和　23年5月6日生', '〒800-0300', '0930-00-0000', '山田 太郎　　　　本人との関係（本人）', '見本居宅介護支援事業所', '見本 花子']);
  assert.match(cell(top, 'I23'), new RegExp(`<v>${cost}</v>`));
  const pay = m.get('住宅改修費支給申請書(受領委任払用)')!;
  assert.equal(txt(pay, 'AA10'), '0930-00-0000');
  assert.match(cell(pay, 'J16'), /<v>46331<\/v>/); // 2026年11月5日
  assert.match(cell(pay, 'X16'), /<v>46346<\/v>/);
  assert.match(cell(pay, 'J18'), new RegExp(`^<c r="J18" s="\\d+"><f>[^<]*</f><v>${cost}</v></c>$`)); // =IF(承認届出書!I23…) の答え（数）
  assert.match(cell(pay, 'J5'), /<v>ヤマダ　タロウ<\/v>/);
  assert.match(cell(pay, 'J8'), /<v>昭和　23年5月6日生<\/v>/);
  assert.match(cell(pay, 'J11'), /<v>山田 太郎　　　　本人との関係（本人）<\/v>/);
  assert.match(cell(m.get('住宅改修内訳明細書')!, 'I5'), /<v>ヤマダ　タロウ<\/v>/);
  // 広域連合：承認申請書（様式第2号）・支給申請書（様式第7号）・別紙
  const g = sheets(fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues({...j, insurer: 'kouiki'}, RATES))).byName;
  const two = g.get('様式第2号（住宅改修承認申請書）')!;
  // 郵便番号は住所の欄の1行目（J9）。住所は2行目（J10）
  assert.deepEqual(['J5', 'J8', 'J9', 'J11', 'O13', 'O14', 'J22'].map((r) => txt(two, r)), ['ヤマダ　タロウ', '昭和　23年5月6日生', '〒800-0300', '山田 太郎　　　　本人との関係（本人）', '見本居宅介護支援事業所', '見本 花子', `${yenText(cost)}円`]);
  const seven = g.get('様式第7号（住宅改修費支給申請書（受領委任払用）')!;
  assert.deepEqual(['J5', 'J8', 'J9', 'AA10', 'J11', 'X12', 'X14', 'J16', 'J18'].map((r) => txt(seven, r)), [
    'ヤマダ　タロウ',
    '昭和　23年5月6日生',
    '〒800-0300',
    '0930-00-0000',
    '山田 太郎　　　　本人との関係（本人）',
    '令和8年11月5日',
    '令和8年11月20日',
    yenText(cost),
    '見本居宅介護支援事業所　見本 花子',
  ]);
  assert.equal(txt(g.get('様式第2号別紙（住宅改修内訳明細書）')!, 'I5'), 'ヤマダ　タロウ');
  // 読み戻す（様式第7号の「事業所名　氏名」はすき間だけの区切りなので読まない。様式第2号から読む）
  const back = readShinsei(fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues({...j, insurer: 'kouiki'}, RATES)))!;
  assert.deepEqual(back.info, {kana: 'ヤマダ　タロウ', era: '昭和', birthY: '23', birthM: '5', birthD: '6', zip: '800-0300', owner: '山田 太郎', relation: '本人', reasonOffice: '見本居宅介護支援事業所', reasonName: '見本 花子', phone: '0930-00-0000', start: '2026-11-05', end: '2026-11-20'});
});

test('申請書から先に作る：見積書の行がない箇所（空白の行だけ）も写真番号と改修の内容の行が出る。寸法は入れたもの。改修費用は手で入れた金額、見積書も手入力もなければ書かない', () => {
  const blankRow: Row = {...blank, id: 'b1', kind: 'material', refId: null, name: '', qty: 0};
  const only = job({
    places: [place('玄関', [blankRow], {dims: {l: '600×850', h: '850'}}), place('トイレ', [{...blankRow, id: 'b2'}]), place('浴室', [{...blankRow, id: 'b3'}], {kind: 2})],
    shinsei: {...NO_SHINSEI, kana: 'ヤマダ'},
  });
  assert.deepEqual(shinseiWorks(only, RATES), ['①玄関　手すりの取り付け　L=600×850mm H=850mm', '②トイレ　手すりの取り付け', '③浴室　段差の解消']);
  assert.equal(shinseiCost(only, RATES), null);
  const pre = sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(only, RATES))).byName.get('事前申請書')!;
  assert.equal(txt(pre, 'J17'), '　　円'.replace('　　円', txt(sheets(KANDA).byName.get('事前申請書')!, 'J17'))); // 原本のまま
  const manual = job({...only, shinsei: {...NO_SHINSEI, cost: 180000}});
  assert.equal(shinseiCost(manual, RATES), 180000);
  assert.equal(txt(sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(manual, RATES))).byName.get('事前申請書')!, 'J17'), '180,000円');
  // 見積書の使う長さより、入れた長さが先
  assert.deepEqual(shinseiWorks(job({places: [place('浴室', [mat('木の手すり 35φ 4m', {lengthCm: 60, pieceLengthM: 4})], {dims: {l: '650', h: '750'}})]}), RATES), ['①浴室　手すりの取り付け　L=650mm H=750mm']);
});

/** 範囲（'A7:H22'）→ [左の列, 上の行, 右の列, 下の行]（0始まり） */
const cellsOf = (range: string) => {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)!;
  const col = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [col(m[1]), Number(m[2]) - 1, col(m[3]), Number(m[4]) - 1];
};

test('平面図：空いた所に工事内容（申請書の改修の内容と同じ行）を書く（平面図そのものは Excel で描く）。箇所がなければ書かない', () => {
  const lines = ['①浴室　手すりの取り付け　L=600mm', '⑤玄関　手すりの取り付け　L=400×600×600mm', '③トイレ　段差の解消'];
  for (const insurer of ['kanda', 'yukuhashi', 'kouiki'] as const) {
    const sheet = SHINSEI[insurer]!.sheets.find((x) => x.legend?.box)!;
    const files = unzipSync(fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, shinseiValues(job({insurer}), RATES)));
    const anchors = anchorsOf(strFromU8(files[drawingPath(files, sheet.sheet)]));
    const box = anchors.filter((a) => /<xdr:cNvSpPr txBox="1"\/>/.test(a) && a.includes(lines[0]));
    assert.equal(box.length, 1, insurer);
    assert.deepEqual([...box[0].matchAll(/<a:p>[\s\S]*?<a:t>([^<]*)<\/a:t>[\s\S]*?<\/a:p>/g)].map((m) => m[1]), lines, insurer);
    assert.match(box[0], /<a:noFill\/><a:ln w="9525"><a:noFill\/><\/a:ln>/); // 線・塗りなし
    assert.doesNotMatch(box[0], /Overflow="clip"/); // 行が多くても隠さない
    // 置き場所：原本の空いた所（前の申請の平面図で工事内容を書いていた所）
    const [c1, r1, c2, r2] = cellsOf(sheet.legend!.box!);
    const {from, to} = anchorOf(box[0]);
    assert.deepEqual([from[0], from[2]], [c1, r1], insurer);
    assert.ok(to[0] <= c2 + 1 && to[2] <= r2 + 1, `${insurer} ${to}`);
    // 図形の番号（cNvPr の id）は重ならない
    const ids = [...anchors.join('').matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, insurer);
    // 箇所がなければ足さない（原本の図形のまま）
    const none = unzipSync(fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, shinseiValues(job({insurer, places: []}), RATES)));
    const orig = unzipSync(TEMPLATES[insurer]);
    const path = drawingPath(none, sheet.sheet);
    assert.equal(path ? strFromU8(none[path]) : '', path ? strFromU8(orig[path]) : '', insurer);
  }
  // みやこ町は平面図の下の欄（M48。折り返しの書式）に1行ずつ
  const my = sheets(fillShinsei(MIYAKO, SHINSEI.miyako!, shinseiValues(job({insurer: 'miyako'}), RATES))).byName.get('平面図')!;
  assert.equal(txt(my, 'M48'), lines.join('\n'));
  // 苅田町・行橋市の平面図の表題：C2 に氏名（「様邸　平面図」は原本の AC2）
  assert.equal(txt(sheets(fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, shinseiValues(job({insurer: 'yukuhashi'}), RATES))).byName.get('平面図  (2)')!, 'C2'), '山田 太郎');
});

test('写真貼付用紙：写真番号の用紙の改修前・改修後の枠の中に写真を貼る（縦横の比はそのまま・Excel で動かせる）。用紙のない番号・広域連合の2枚目には貼らない', () => {
  const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 0xff, 0xd9]); // 写真のファイルはそのまま入る
  const photoImages = {1: {before: {bytes: jpeg(1), w: 1600, h: 1200}, after: {bytes: jpeg(2), w: 900, h: 1600}}, 5: {before: {bytes: jpeg(3), w: 1200, h: 1200}}, 7: {after: {bytes: jpeg(4), w: 10, h: 10}}};
  // 浴室①・玄関⑤に写真（トイレ③はなし。写真番号⑦の箇所はない）。みやこ町の写真の用紙は④まで
  const expected: Record<Insurer, string[]> = {
    kanda: ['1 :before:1', '1 :after:2', '1  (5):before:3'],
    yukuhashi: ['住改・写真 ①:before:1', '住改・写真 ①:after:2', '住改・写真④ (3):before:3'],
    miyako: ['写真 (1):before:1', '写真 (1):after:2'],
    kouiki: ['写真貼付用紙:before:1', '写真貼付用紙:after:2', '写真貼付用紙 (5):before:3'],
  };
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) {
    const files = unzipSync(fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, {...shinseiValues(job({insurer}), RATES), photoImages}));
    const got: string[] = [];
    for (const sheet of SHINSEI[insurer]!.sheets.filter((x) => x.photoPlace)) {
      const path = drawingPath(files, sheet.sheet);
      if (!path) continue;
      const d = strFromU8(files[path]);
      const relsPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
      const rels = files[relsPath] ? strFromU8(files[relsPath]) : '';
      for (const a of anchorsOf(d).filter((x) => x.includes('<xdr:pic>'))) {
        const rid = /<a:blip r:embed="([^"]+)"/.exec(a)![1];
        const target = new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*Type="[^"]*/image"[^>]*Target="\\.\\./media/([^"]+)"`).exec(rels)?.[1];
        assert.ok(target?.endsWith('.jpeg'), `${insurer} ${sheet.sheet} ${rid}`);
        const bytes = files[`xl/media/${target}`];
        // どちらの枠か：写真の左上・右下が枠の中
        const {from, to} = anchorOf(a);
        const slot = (['before', 'after'] as const).find((k) => {
          const [c1, r1, c2, r2] = cellsOf(sheet.photoPlace![k]!);
          return from[0] >= c1 && from[2] >= r1 && to[0] <= c2 && to[2] <= r2;
        });
        got.push(`${sheet.sheet}:${slot}:${bytes[4]}`);
        // 縦横の比はそのまま（1600×1200 → 4:3、900×1600、1200×1200）・比を変えない設定
        const [cx, cy] = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(a)!.slice(1).map(Number);
        const img = Object.values(photoImages).flatMap((x) => Object.values(x)).find((x) => x.bytes[4] === bytes[4])!;
        assert.ok(Math.abs(cx / cy - img.w / img.h) < 0.01, `${insurer} ${cx}/${cy}`);
        assert.match(a, /<a:picLocks noChangeAspect="1"\/>/);
      }
      if (d.includes('<xdr:pic>')) assert.match(d.match(/<xdr:wsDr\b[^>]*>/)![0], /xmlns:r="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships"/);
      const ids = [...d.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${insurer} ${sheet.sheet}`);
    }
    assert.deepEqual(got.sort(), [...expected[insurer]].sort(), insurer);
    assert.match(strFromU8(files['[Content_Types].xml']), /<Default Extension="jpeg" ContentType="image\/jpeg"\/>/);
    assert.ok(readShinsei(zipSync(files)), insurer); // 開き直せる（読み戻せる）
  }
  // 向き・大きさ（ユーザーの指示「写真の方向転換」「角を持って縮小・拡大」）：写真の図形を回す前の四角に置いて rot だけ回す。
  // 回したあとの写真が枠に収まる大きさ（縦横の比はそのまま）、縮めた写真は小さく（まん中はそのまま）
  const edited = {1: {before: {...photoImages[1].before, edit: {rot: 90, scale: 1}}, after: {...photoImages[1].after, edit: {rot: 0, scale: 0.5}}}};
  const ef = unzipSync(fillShinsei(KOUIKI, SHINSEI.kouiki!, {...shinseiValues(job({insurer: 'kouiki'}), RATES), photoImages: edited}));
  const kSheet = SHINSEI.kouiki!.sheets.find((x) => x.photoPlace)!;
  const pics = anchorsOf(strFromU8(ef[drawingPath(ef, kSheet.sheet)!])).filter((x) => x.includes('<xdr:pic>'));
  const ext = (a: string) => /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(a)!.slice(1).map(Number);
  const [rotated, small] = pics;
  assert.match(rotated, /<a:xfrm rot="5400000">/);
  assert.doesNotMatch(small, /rot="/);
  const [rw, rh] = ext(rotated);
  assert.ok(Math.abs(rw / rh - 1600 / 1200) < 0.01); // 回す前の形（1600×1200）のまま
  const unedited = anchorsOf(strFromU8(unzipSync(fillShinsei(KOUIKI, SHINSEI.kouiki!, {...shinseiValues(job({insurer: 'kouiki'}), RATES), photoImages}))[drawingPath(ef, kSheet.sheet)!])).filter((x) => x.includes('<xdr:pic>'));
  const [ow, oh] = ext(unedited[1]);
  const [sw, sh] = ext(small);
  assert.ok(Math.abs(sw - ow / 2) <= 2 && Math.abs(sh - oh / 2) <= 2, `${sw}×${sh} / ${ow}×${oh}`);
  // 回した写真の外側の四角（高さ＝回す前の幅）は、改修前の枠の高さに収まる
  const [c1, r1, c2, r2] = cellsOf(kSheet.photoPlace!.before!);
  const {from, to} = anchorOf(rotated);
  assert.ok(from[2] >= r1 && to[2] <= r2 + 1, `${from} ${to} / ${r1}-${r2}`);
  assert.ok(c1 >= 0 && c2 >= c1);
  // 写真がなければ、写真のファイル・図形は足さない
  const plain = unzipSync(fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues(job({insurer: 'kouiki'}), RATES)));
  assert.ok(!Object.keys(plain).some((k) => k.startsWith('xl/media/') && !unzipSync(KOUIKI)[k]));
  assert.doesNotMatch(strFromU8(plain['[Content_Types].xml']), /Extension="jpeg"/);
});

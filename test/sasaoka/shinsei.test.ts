import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {estimateXlsx} from '../../src/sasaoka/estimateXlsx.ts';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {fillShinsei, insuredBoxes, parseWorkLine, readShinsei, SHINSEI, shinseiFileName, shinseiKinds, shinseiPhotos, shinseiValues, shinseiWorks} from '../../src/sasaoka/shinsei.ts';
import type {Job, Place, Row} from '../../src/sasaoka/types.ts';

const RATES = {estimateRate: 0.8, estimateLaborRate: 1.5};
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

test('改修の内容・箇所及び規模：前の申請と同じ書き方「浴室① 浴室用手すり L=600㎜」（改修場所・写真番号・品名・切って使う長さ）', () => {
  assert.deepEqual(shinseiWorks(job(), RATES), ['浴室① 浴室用手すり L=600㎜', '玄関⑤ 木製手すり L=400×600×600㎜', 'トイレ③ スロープ']);
  assert.deepEqual(insuredBoxes('0000366989'), [...'0000366989']);
  assert.deepEqual(insuredBoxes('３６６９８９'), ['', '', '', '', '3', '6', '6', '9', '8', '9']); // 全角でもよい。足りなければ右に寄せる
  assert.equal(shinseiFileName(SHINSEI.kanda!, job(), '2026-10-21'), '苅田町申請書_山田 太郎様_2026-10-21.xlsx');
  // 改修の種類ごと（住宅改修内訳明細書の行）：前の申請の書き方「玄関① 木製L字手すり L=600×850㎜」。写真番号 → 改修場所（写真貼付用紙）
  const kinds = shinseiKinds(job(), RATES);
  assert.equal(kinds.length, 6);
  assert.deepEqual(kinds[0], {places: '浴室・玄関', works: ['浴室① 浴室用手すり L=600㎜', '玄関⑤ 木製手すり L=400×600×600㎜']});
  assert.deepEqual(kinds[1], {places: 'トイレ', works: ['トイレ③ スロープ']});
  assert.deepEqual(kinds.slice(2), [0, 0, 0, 0].map(() => ({places: '', works: []})));
  assert.deepEqual(shinseiPhotos(job(), RATES), {1: '浴室', 5: '玄関', 3: 'トイレ'});
  // 品名の見当：L型・コーナーの部材 → L字、木の部材 → 木製、浴室 → 浴室用、踏台 → 木製踏台。補強板（ベースプレート）の長さは別に。1,000mm からはカンマ
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
    [['廊下① 木製L字手すり L=1,600㎜ 補強板L=1,700㎜', '浴室③ 浴室用L字手すり'], ['玄関② 木製踏台'], ['居室④ 床材の変更'], [], [], []],
  );
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
  assert.equal(txt(pre, 'J14'), '浴室① 浴室用手すり L=600㎜\n玄関⑤ 木製手すり L=400×600×600㎜\nトイレ③ スロープ');
  assert.match(cell(pre, 'J14'), /L=600㎜&#10;玄関⑤/); // 改行は &#10;（LibreOffice・スマホのプレビューでも改行する）
  // 事後申請書は事前申請書を参照する式。保存しておく答えも同じにする（スマホのプレビュー用）
  const post = byName.get('事後申請書')!;
  assert.match(cell(post, 'I7'), /<f>事前申請書!J7<\/f><v>山田 太郎<\/v>/);
  assert.match(cell(post, 'AF6'), /<f>事前申請書!AG6<\/f><v>9<\/v>/);
  // 転記した欄のほかは原本と同じ（式・図形・平面図・写真・承諾書・委任状のシート）
  const changed = Object.keys(files).filter((k) => strFromU8(files[k]) !== strFromU8(orig.files[k] ?? new Uint8Array()));
  assert.deepEqual(changed.sort(), ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  const strip = (x: string) => x.replace(/<c r="[A-Z]+\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, '');
  assert.equal(strip(pre), strip(orig.byName.get('事前申請書')!)); // 欄のほか（罫線・結合・印刷の範囲など）はそのまま
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
  assert.match(cell(main, 'F14'), /浴室① 浴室用手すり L=600㎜/);
  // 書き込んだ申請書から読む（申請書から見積書を作るとき）。どの保険者の申請書かはシートで見分ける
  const places = [
    {photo: 1, name: '浴室', kind: 1},
    {photo: 5, name: '玄関', kind: 1},
    {photo: 3, name: 'トイレ', kind: 2},
  ];
  assert.deepEqual(readShinsei(out), {insurer: 'yukuhashi', name: v.name, address: v.address, insuredNo: v.insuredNo, places});
  assert.equal(readShinsei(fillShinsei(KANDA, SHINSEI.kanda!, v))?.insurer, 'kanda');
  // 原本のまま（何も書いていない）なら空
  for (const [insurer, bytes] of [['kanda', KANDA], ['miyako', MIYAKO], ['kouiki', KOUIKI]] as const) {
    assert.deepEqual(readShinsei(bytes), {insurer, name: '', address: '', insuredNo: '', places: []});
  }
  // 申請書でない Excel は null
  assert.equal(readShinsei(estimateXlsx(job(), defaultSettings(), '2026-10-21').bytes), null);
  assert.equal(readShinsei(new Uint8Array([1, 2, 3])), null);
});

test('改修の内容の1行から、写真番号・改修場所・改修の種類を読む', () => {
  assert.deepEqual(parseWorkLine('①浴室　手すりの取付　長さ60cm'), {photo: 1, name: '浴室', kind: 1});
  assert.deepEqual(parseWorkLine('(3) 玄関 段差の解消'), {photo: 3, name: '玄関', kind: 2});
  assert.deepEqual(parseWorkLine('（４）居室　床材の変更'), {photo: 4, name: '居室', kind: 3});
  assert.deepEqual(parseWorkLine('⑫トイレ　便器の取替'), {photo: 12, name: 'トイレ', kind: 5});
  assert.deepEqual(parseWorkLine('廊下 手摺取付'), {photo: 0, name: '廊下', kind: 1});
  // 改修場所のうしろに写真番号（広域連合の内訳明細書の書き方）。改修の種類の行に書いてあれば、その種類
  assert.deepEqual(parseWorkLine('玄関① 木製L字手すり L=600×850㎜ H=850mm'), {photo: 1, name: '玄関', kind: 1});
  assert.deepEqual(parseWorkLine('玄関② 木製踏台'), {photo: 2, name: '玄関', kind: 2}); // 踏台は段差の解消
  assert.deepEqual(parseWorkLine('玄関②\u3000木製踏台L=400×600mm  H=170mm', 2), {photo: 2, name: '玄関', kind: 2});
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
    '浴室① 浴室用手すり L=600㎜\n玄関⑤ 木製手すり L=400×600×600㎜',
    'トイレ',
    'トイレ③ スロープ',
    '',
  ]);
  assert.equal(txt(byName.get('平面図')!, 'A1'), '山田 太郎　邸　平面図');
  // 写真（1）〜（4）：原本の写真番号（①〜④）の改修場所。写真番号のない②④は空
  assert.deepEqual([1, 2, 3, 4].map((n) => txt(byName.get(`写真 (${n})`)!, 'B5')), ['浴室', '', 'トイレ', '']);
  assert.deepEqual([1, 2, 3, 4].map((n) => txt(byName.get(`写真 (${n})`)!, 'B4') + digitsOf(byName.get(`写真 (${n})`)!, row('D', 10, 4))), Array(4).fill('山田 太郎0000366989'));
  // 承諾書・理由書は原本のまま
  const changed = Object.keys(files).filter((k) => strFromU8(files[k]) !== strFromU8(orig.files[k] ?? new Uint8Array()));
  assert.ok(!changed.some((k) => /sheet(4|5|11|12)\.xml$/.test(k)), changed.join(' '));
  assert.deepEqual(readShinsei(out), {insurer: 'miyako', name: '山田 太郎', address: '福岡県京都郡みやこ町勝山1-1', insuredNo: '0000366989', places: [
    {photo: 1, name: '浴室', kind: 1},
    {photo: 5, name: '玄関', kind: 1},
    {photo: 3, name: 'トイレ', kind: 2},
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
    assert.deepEqual([txt(x, 'J6'), txt(x, 'J9'), digitsOf(x, row('X', 10, 7))], ['山田 太郎', '福岡県築上郡築上町椎田1-1', '0000366989'], name);
  }
  const b = byName.get('様式第2号別紙（住宅改修内訳明細書）')!;
  assert.deepEqual([txt(b, 'I6'), digitsOf(b, row('W', 10, 7)), txt(b, 'D15'), txt(b, 'K14'), txt(b, 'D17'), txt(b, 'K16')], [
    '山田 太郎',
    '0000366989',
    '浴室・玄関',
    '浴室① 浴室用手すり L=600㎜\n玄関⑤ 木製手すり L=400×600×600㎜',
    'トイレ',
    'トイレ③ スロープ',
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
  assert.deepEqual(readShinsei(out), {insurer: 'kouiki', name: '山田 太郎', address: '福岡県築上郡築上町椎田1-1', insuredNo: '0000366989', places: [
    {photo: 1, name: '浴室', kind: 1},
    {photo: 5, name: '玄関', kind: 1},
    {photo: 3, name: 'トイレ', kind: 2},
  ]});
});

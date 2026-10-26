import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync, zipSync} from 'fflate';
import {estimateXlsx} from '../../src/sasaoka/estimateXlsx.ts';
import {DEFAULT_PLACES, defaultSettings} from '../../src/sasaoka/defaults.ts';
import {MARK_INFO, NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {boxLabels, checkBoxes, fillShinsei, fitLinesSize, insuredBoxes, NOTE_GAP, NOTE_INSET, oneRowPt, padInsuredNo, parseWorkLine, photoDay, photoNoteLayout, photoNoteLines, photoNotePt, photoPlacement, placeBox, planPlacement, rangeBox, readShinsei, SHINSEI, sheetLayout, shinseiCost, styleParts, shinseiFileName, shinseiKinds, shinseiMarkKeys, shinseiPhotos, shinseiValues, shinseiWorks, workItems, workText} from '../../src/sasaoka/shinsei.ts';
import {shinseiPreview} from '../../src/sasaoka/shinseiPreview.ts';
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
  assert.equal(shinseiFileName(SHINSEI.kanda!, job(), '2026-10-21'), '山田太郎様住宅改修申請書.xlsx'); // ユーザーの指示「山田花子様住宅改修申請書」
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
  // 申請書のタブで入れた寸法（ユーザーの指示）：手すりは長さ（見積書の長さより先）・高さ（任意）、段差の解消は「W600mm D350mm H150mm」。そのほかは次の行
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
    '③トイレ　手すりの取り付け　L=600×850mm',
    '　木製', // そのほかは次の行に下げて（「そのほかの部分の記載は、行替えして表示するようにする」2026-10-26）
    '④浴室　段差の解消　W700mm',
  ]);
  assert.deepEqual(shinseiKinds(sized, RATES)[1].works, ['②屋外　段差の解消　W600mm D350mm H150mm', '④浴室　段差の解消　W700mm']); // 内訳明細書も同じ
  // 「1,600」は3けた区切り（長さ1つ）、「600,850」は長さ2つ
  assert.deepEqual(shinseiWorks(job({places: [place('廊下', [mat('L型手すり')], {dims: {l: '1,600'}}), place('居室', [mat('L型手すり')], {dims: {l: '600,850'}})]}), RATES), ['①廊下　手すりの取り付け　L=1600mm', '②居室　手すりの取り付け　L=600×850mm']);
  // cm・m で打った数は mm に。前に打った「L=」「H=」は外す（「L=60cmmm」「L=L=600mm」にしない）
  const dims = (d: Place['dims'], kind = 1) => workText({kind, rows: [], dims: d});
  assert.equal(dims({l: '60cm', h: '80cm'}), '手すりの取り付け　L=600mm H=800mm');
  assert.equal(dims({l: '0.6m', h: 'H=８００ｍｍ'}), '手すりの取り付け　L=600mm H=800mm');
  assert.equal(dims({l: 'L=600'}), '手すりの取り付け　L=600mm');
  assert.equal(dims({l: '60 cm×85cm'}), '手すりの取り付け　L=600×850mm');
  assert.equal(dims({l: '60×85cm'}), '手すりの取り付け　L=600×850mm'); // 単位が最後にだけあれば全部 cm
  assert.equal(dims({l: '６０センチ'}), '手すりの取り付け　L=600mm');
  assert.equal(dims({w: '60cm', d: 'D350', h: '15 cm'}, 2), '段差の解消　W600mm D350mm H150mm');
  assert.equal(dims({l: '600〜700mm'}), '手すりの取り付け　L=600〜700mm'); // 数でないものは打ったまま（うしろの mm は外す）
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

test('苅田町の原本：事後申請書の被保険者番号（事前申請書を参照する式）に、前の方の番号の数字が残っていない（式の値はどれも 0）', () => {
  const xml = sheets(KANDA).byName.get('事後申請書')!;
  const cached = ['W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF'].map((c) => /<v>([^<]*)<\/v>/.exec(cell(xml, `${c}6`))?.[1]);
  assert.deepEqual(cached, Array(10).fill('0'));
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
  // 撮影日（改修前 D6・改修後 D23）。日付のない写真番号も、写真番号の順で最初に入っている日付（一覧の改修前日付・改修後日付）
  assert.deepEqual([at('④', 'D6'), at('④', 'D23')], ['令和8年10月1日', '令和8年11月20日']);
  assert.deepEqual([at('①', 'D6'), at('①', 'D23')], ['令和8年10月1日', '令和8年11月20日']);
  // 箇所のない写真番号の用紙（②⑥〜⑨）は原本のまま
  assert.ok(at('②', 'B4').startsWith('🔳手すりの取り付け　□(2)段差の解消　□(3)'));
  assert.ok(at('②', 'B2').includes('□その他（　　　）'));
  assert.ok(!strings.some((s) => s.includes('手摺')));
});

test('改修前日付・改修後日付：入っていなければ改修前は当日・改修後は空（原本のまま）。写真の日付が入っていれば、写真番号の順で最初の日付', () => {
  // ユーザーの指示「改修前は当日デフォルト」「改修後はデフォルト空白」「日付入り写真を添付した場合は、その日付に合わせて自動入力（優先）」（2026-10-22）
  const plain = job();
  assert.deepEqual([photoDay(plain, RATES, 'before', '2026-10-22'), photoDay(plain, RATES, 'after', '2026-10-22')], ['2026-10-22', '']);
  const v = shinseiValues(plain, RATES, '2026-10-22');
  assert.deepEqual(Object.values(v.photoDates ?? {}), [{before: '2026-10-22'}, {before: '2026-10-22'}, {before: '2026-10-22'}]);
  const {byName} = sheets(fillShinsei(KANDA, SHINSEI.kanda!, v));
  const first = [...byName].find(([name]) => name === '1 ')![1];
  assert.equal(txt(first, 'D6'), '令和8年10月22日');
  assert.ok(!/<c r="D23"[^>]*t="(?:inlineStr|str)"/.test(first)); // 改修後は書かない（原本のまま）
  // ⑤玄関の写真の日付（改修前 9月17日）が入っていれば、それが一覧の改修前日付（当日より写真の日付）。写真の日付のないほかの写真番号もその日
  const places = plain.places.map((p) => (p.name === '玄関' ? {...p, photoDates: {before: '2026-09-17'}} : p));
  const dated = job({places});
  assert.deepEqual([photoDay(dated, RATES, 'before', '2026-10-22'), photoDay(dated, RATES, 'after', '2026-10-22')], ['2026-09-17', '']);
  assert.ok(Object.values(shinseiValues(dated, RATES, '2026-10-22').photoDates ?? {}).every((d) => d.before === '2026-09-17' && !d.after));
});

test('箇所の候補（箇所を足す・改修場所の候補）は、苅田町の写真の用紙の改修箇所の□の名前と同じ（その他は名前を打つ）', () => {
  const xml = strFromU8(unzipSync(KANDA)['xl/sharedStrings.xml']);
  const text = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''))
    .find((t) => t.includes('□廊下'))!;
  const labels = boxLabels(text);
  assert.equal(labels.at(-1)?.replace(/[（）\s　]/g, ''), 'その他');
  assert.deepEqual(DEFAULT_PLACES, labels.slice(0, -1));
  // どの候補も、その写真の用紙の□に当たる
  assert.deepEqual(DEFAULT_PLACES.map((name) => placeBox(labels, name)), DEFAULT_PLACES.map((_, i) => i));
});

test('みやこ町の写真の用紙の撮影日：原本の「撮影日」のうしろに日付（改修前 D7・改修後 D32）。日付のない写真番号もほかの写真と同じ日。広域連合は書かない', () => {
  const j = job({insurer: 'miyako', places: [...job().places, place('勝手口', [mat('L型手すり')], {photoDates: {before: '2026-10-01', after: '2026-11-20'}})]});
  const {files, byName} = sheets(fillShinsei(MIYAKO, SHINSEI.miyako!, shinseiValues(j, RATES)));
  const strings = [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''),
  );
  const text = (xml: string, ref: string) => {
    const shared = new RegExp(`<c r="${ref}"[^>]*t="s"[^>]*><v>(\\d+)</v>`).exec(xml)?.[1];
    return shared === undefined ? txt(xml, ref) : strings[Number(shared)];
  };
  // ①浴室（撮影日なし）は④勝手口（撮影日あり）と同じ日
  assert.deepEqual([1, 4].map((n) => byName.get(`写真 (${n})`)!).map((xml) => [text(xml, 'R4'), text(xml, 'D7'), text(xml, 'D32')]), [
    ['①', '撮影日　令和8年10月1日', '撮影日　令和8年11月20日'],
    ['④', '撮影日　令和8年10月1日', '撮影日　令和8年11月20日'],
  ]);
  // 日付を入れていなければ、改修前は当日・改修後は原本のまま（「撮影日」だけ）
  const none = sheets(fillShinsei(MIYAKO, SHINSEI.miyako!, shinseiValues(job({insurer: 'miyako'}), RATES, '2026-10-22'))).byName.get('写真 (1)')!;
  assert.deepEqual([text(none, 'D7'), text(none, 'D32')], ['撮影日　令和8年10月22日', '撮影日']);
  // 広域連合の写真貼付用紙には撮影日の欄がないので書かない（A7:S8 は「改　　修　　前」の結合の欄）
  assert.ok(!SHINSEI.kouiki!.sheets.some((x) => x.photoPlace?.dates));
});

test('みやこ町・広域連合の写真貼付用紙の改修の種別：その写真番号の箇所の改修の種類を楕円で囲む（原本に残っていた前の申請の丸は消す。箇所のない用紙は丸なし）', () => {
  for (const insurer of ['miyako', 'kouiki'] as const) {
    const v = shinseiValues(job({insurer}), RATES);
    assert.deepEqual(v.photoKinds, {1: 1, 3: 2, 5: 1}); // 浴室①は手すり・トイレ③は段差の解消・玄関⑤は手すり（②④は箇所なし）
    const {files, byName} = sheets(fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, v));
    const strings = [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      [...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''),
    );
    const photoSheets = SHINSEI[insurer]!.sheets.filter((x) => x.photoPlace?.kindCircles);
    assert.equal(photoSheets.length, insurer === 'miyako' ? 4 : 10);
    for (const sheet of photoSheets) {
      const xml = byName.get(sheet.sheet)!;
      const no = (strings[Number(/<c r="R4"[^>]*t="s"[^>]*><v>(\d+)<\/v>/.exec(xml)?.[1])] ?? '').charCodeAt(0) - 0x2460 + 1; // 原本の写真番号（①〜⑤）
      const lay = sheetLayout(xml);
      const path = drawingPath(files, sheet.sheet);
      // 楕円のまん中がある種別の欄（1〜6。どれでもなければ 0）
      const kinds = (path ? anchorsOf(strFromU8(files[path])) : [])
        .filter((a) => /prst="ellipse"/.test(a))
        .map((a) => {
          const {from, to} = anchorOf(a);
          const [cx, cy] = [(posPx(from[0], from[1], lay.colW) + posPx(to[0], to[1], lay.colW)) / 2, (posPx(from[2], from[3], lay.rowH) + posPx(to[2], to[3], lay.rowH)) / 2];
          return (
            sheet.photoPlace!.kindCircles!.findIndex((r) => {
              const b = rangeBox(lay, r);
              return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
            }) + 1
          );
        });
      assert.deepEqual(kinds, v.photoKinds![no] ? [v.photoKinds![no]] : [], `${insurer} ${sheet.sheet}（${no}）`);
    }
  }
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
    // 入るときは原本の大きさのまま（1行ずつ欄の幅に入るかは、はみ出さない側に数えるので、長めの行だと 0.5pt だけ小さくなる）
    if (n === 3) assert.ok(sizeOf(files, pre, 'J14') >= base - 0.5 && sizeOf(files, pre, 'J14') <= base, `3箇所 ${sizeOf(files, pre, 'J14')}pt`);
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
  // 1つの箇所は2行にしない（ユーザーの指示「改修の内容・箇所及び規模では、一つの項目、例 廊下 で2行にならないようにする」2026-10-26）：
  // 欄の幅より長い行は、1行で入る大きさにする（前は折り返して「mm」だけ次の行に出ていた）。1箇所だけでも
  const base0 = sizeOf(orig.files, orig.byName.get('事前申請書')!, 'J14');
  for (const places of [
    [place('玄関から廊下にかけて（上がり框の横）', [mat('L型手すり')], {dims: {l: '600×1800', h: '800'}}), place('廊下', [mat('I型手すり')], {dims: {l: '3600', h: '800'}})],
    [place('玄関から廊下にかけて（上がり框の横）', [mat('L型手すり')], {dims: {l: '600×1800', h: '800'}})],
  ]) {
    const lf = sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job({insurer: 'kanda', places}), RATES)));
    for (const [name, ref] of [['事前申請書', 'J14'], ['事後申請書', 'I14']] as const) {
      const xml = lf.byName.get(name)!;
      const pt = sizeOf(lf.files, xml, ref);
      const lines = txt(lf.byName.get('事前申請書')!, 'J14').split('\n');
      assert.ok(pt < base0, `${name} ${places.length}箇所 ${pt}pt`);
      // 折り返しの数え方は申請書の計算と同じ（半角 0.55・全角 1 の幅。はみ出さない側に数える）
      const em = (t: string) => [...t].reduce((k, ch) => k + (/[ -~｡-ﾟ]/.test(ch) ? 0.55 : 1), 0);
      const w = rangeBox(sheetLayout(xml), ref).w;
      assert.ok(lines.every((l) => (em(l) * pt * 4) / 3 <= w - 6), `${name} ${places.length}箇所：${pt}pt で1行ずつ欄の幅に入る`);
    }
  }
  // 短い行の1箇所は原本の大きさのまま
  {
    const short = sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job({insurer: 'kanda', places: [place('廊下', [mat('I型手すり')], {dims: {l: '3600', h: '800'}})]}), RATES)));
    assert.equal(sizeOf(short.files, short.byName.get('事前申請書')!, 'J14'), base0);
  }
  // 大きさの決め方：入るときは base、入らなければ 0.5pt ずつ小さく（長い行は折り返した行数で数える。oneRow なら1行ずつ折り返さずに入る大きさ）
  assert.equal(fitLinesSize(['あ'], 300, 100, 11), 11);
  assert.ok(fitLinesSize(['あ'.repeat(40)], 300, 100, 11, 4.5, true) < fitLinesSize(['あ'.repeat(40)], 300, 100, 11));
  assert.equal(fitLinesSize(Array(12).fill('①玄関　手すりの取り付け'), 300, 126, 11), 6);
  assert.ok(fitLinesSize(['①玄関　手すりの取り付け　L=600×850mm H=800mm　とても長い説明の文がつづく'], 120, 40, 11) < 11);
});

test('長い住所・改修場所・氏名も欄の中に全部見せる：長くて2行入る欄は折り返し、ほかは縮小して全体を表示（はみ出せる欄は小さく）。氏名は折り返さない。短い値は原本のまま', () => {
  // 欄の書式：文字の大きさ（pt）・折り返し・縮小して全体を表示
  const styleOf = (files: Record<string, Uint8Array>, xml: string, ref: string) => {
    const st = strFromU8(files['xl/styles.xml']);
    const list = (outer: string, inner: string) => [...(new RegExp(`<${outer}\\b[^>]*>([\\s\\S]*?)</${outer}>`).exec(st)?.[1] ?? '').matchAll(new RegExp(`<${inner}\\b[^>]*?(?:/>|>[\\s\\S]*?</${inner}>)`, 'g'))].map((m) => m[0]);
    const s = /\ss="(\d+)"/.exec(cell(xml, ref))?.[1] ?? '0';
    const xf = list('cellXfs', 'xf')[Number(s)];
    const font = list('fonts', 'font')[Number(/fontId="(\d+)"/.exec(xf)?.[1] ?? 0)];
    return {s, size: Number(/<sz val="([\d.]+)"/.exec(font)?.[1]), wrap: /wrapText="1"/.test(xf), shrink: /shrinkToFit="1"/.test(xf)};
  };
  const longPlace = '玄関から廊下にかけて（上がり框の横）';
  const longJob = (insurer: Insurer, address: string) =>
    job({insurer, address, customer: '見本長谷川原　美千代子', places: [place(longPlace, [mat('L型手すり')])]});
  // みやこ町：承認届出書の住所（I9:V9。2行入る高さ）は折り返して小さく。式で同じ住所を出す欄（支給申請書など）も収める
  const my = sheets(fillShinsei(MIYAKO, SHINSEI.miyako!, shinseiValues(longJob('miyako', '福岡県京都郡みやこ町犀川大坂1234番地5　見本コーポ犀川第三203号室'), RATES)));
  const myMain = styleOf(my.files, my.byName.get('住宅改修承認届出書')!, 'I9');
  assert.ok(myMain.wrap && myMain.size < 11, JSON.stringify(myMain));
  let copies = 0;
  for (const [name, xml] of my.byName) {
    for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?><f>([^<]*)<\/f>/g)) {
      if (!/^IF\((?:住宅改修承認届出書!)?I9=/.test(m[2])) continue; // =IF(I9="","",I9)・=IF(住宅改修承認届出書!I9="","",…)
      const st = styleOf(my.files, xml, m[1]);
      assert.ok(st.wrap || st.shrink || st.size < 11, `${name}!${m[1]} ${JSON.stringify(st)}`);
      copies++;
    }
  }
  assert.ok(copies > 0);
  // 写真の用紙の改修箇所（B5:B6。16pt の高い欄）は折り返す
  assert.equal(styleOf(my.files, my.byName.get('写真 (1)')!, 'B5').wrap, true);
  // 広域連合：承認申請書の住所（J10:W10。1行の高さ）は縮小して全体を表示（折り返さない）
  const ko = sheets(fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues(longJob('kouiki', '福岡県築上郡築上町大字椎田1234番地56　見本レジデンス椎田南第一101号'), RATES)));
  assert.deepEqual([styleOf(ko.files, ko.byName.get('様式第2号（住宅改修承認申請書）')!, 'J10').shrink, styleOf(ko.files, ko.byName.get('様式第2号（住宅改修承認申請書）')!, 'J10').wrap], [true, false]);
  // 行橋市：写真添付用紙の改修場所（E4。結合していない欄で、となりの空いた欄へはみ出して見える）は、はみ出せる幅に入る大きさに
  const yk = sheets(fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, shinseiValues(longJob('yukuhashi', '福岡県行橋市中央1-1'), RATES)));
  const e4 = styleOf(yk.files, yk.byName.get('住改・写真 ①')!, 'E4');
  assert.ok(!e4.shrink && !e4.wrap && e4.size < 11 && e4.size >= 8, JSON.stringify(e4));
  // 短い住所は原本の書式のまま
  const short = sheets(fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues(longJob('kouiki', '福岡県築上郡築上町椎田1-1'), RATES)));
  const orig = sheets(KOUIKI);
  assert.equal(styleOf(short.files, short.byName.get('様式第2号（住宅改修承認申請書）')!, 'J10').s, styleOf(orig.files, orig.byName.get('様式第2号（住宅改修承認申請書）')!, 'J10').s);
  // プレビューも同じ（縮小の欄は画面の幅で縮める・折り返しの欄は折り返す）
  const pv = shinseiPreview(unzipSync(KOUIKI), SHINSEI.kouiki!, shinseiValues(longJob('kouiki', '福岡県築上郡築上町大字椎田1234番地56　見本レジデンス椎田南第一101号'), RATES));
  assert.equal(pv.find((p) => p.sheet === '様式第2号（住宅改修承認申請書）')?.texts.find((t) => t.ref === 'J10')?.shrink, true);
  const pvMy = shinseiPreview(unzipSync(MIYAKO), SHINSEI.miyako!, shinseiValues(longJob('miyako', '福岡県京都郡みやこ町犀川大坂1234番地5　見本コーポ犀川第三203号室'), RATES));
  assert.equal(pvMy.find((p) => p.sheet === '住宅改修承認届出書')?.texts.find((t) => t.ref === 'I9')?.wrap, true);
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
  // 写真添付用紙の工事種類（M4）：その写真番号の箇所の改修の種類（原本の1枚目の「手すり取り付け」は消した）。箇所のない写真番号の用紙は空
  assert.match(cell(byName.get('住改・写真 ①')!, 'M4'), /<t[^>]*>手すりの取り付け<\/t>/);
  assert.match(cell(byName.get('住改・写真③')!, 'M4'), /<t[^>]*>段差の解消<\/t>/);
  assert.doesNotMatch(cell(byName.get('住改・写真②')!, 'M4'), /<t|<v/);
  // 書き込んだ申請書から読む（申請書から見積書を作るとき）。どの保険者の申請書かはシートで見分ける。うしろの文は書いたまま（全角のすき間も）
  const places = [
    {photo: 1, name: '浴室', kind: 1, text: '手すりの取り付け　L=600mm'},
    {photo: 5, name: '玄関', kind: 1, text: '手すりの取り付け　L=400×600×600mm'},
    {photo: 3, name: 'トイレ', kind: 2, text: '段差の解消'},
  ];
  assert.deepEqual(readShinsei(out), {insurer: 'yukuhashi', name: v.name, address: v.address, insuredNo: v.insuredNo, places, info: {}});
  assert.equal(readShinsei(fillShinsei(KANDA, SHINSEI.kanda!, v))?.insurer, 'kanda');
  // そのほかは次の行に下げて書き、読み戻すと前の行のつづき（「そのほかの部分の記載は、行替えして表示するようにする」2026-10-26）
  const extra = shinseiValues(job({insurer: 'yukuhashi', places: [place('廊下', [mat('L型手すり')], {dims: {l: '2400'}, shinseiText: 'ベースプレート　L=2400mm'})]}), RATES);
  assert.deepEqual(extra.works, ['①廊下　手すりの取り付け　L=2400mm', '　ベースプレート　L=2400mm']);
  const back = fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, extra);
  assert.match(cell(sheets(back).byName.get('住改・受領委任払')!, 'F14'), /①廊下　手すりの取り付け　L=2400mm(&#10;|\n)　ベースプレート　L=2400mm/);
  assert.deepEqual(readShinsei(back)?.places, [{photo: 1, name: '廊下', kind: 1, text: '手すりの取り付け　L=2400mm　ベースプレート　L=2400mm'}]);
  // 原本のまま（何も書いていない）なら空
  for (const [insurer, bytes] of [['kanda', KANDA], ['miyako', MIYAKO], ['kouiki', KOUIKI]] as const) {
    assert.deepEqual(readShinsei(bytes), {insurer, name: '', address: '', insuredNo: '', places: [], info: {}});
  }
  // 申請書でない Excel は null
  assert.equal(readShinsei(estimateXlsx(job(), defaultSettings(), '2026-10-21').bytes), null);
  assert.equal(readShinsei(new Uint8Array([1, 2, 3])), null);
});

test('改修の内容はいつも自動の文（寸法・そのほかから作る）：前の版で手で直した文（Place.shinseiLine）が残っていても使わない（ユーザーの指示「申請書に書く内容という部分はなくす」2026-10-26）', () => {
  const base = job();
  const at = (i: number, extra: Partial<Place>) => job({places: base.places.map((p, k) => (k === i ? {...p, ...extra} : p))});
  const auto = shinseiWorks(base, RATES);
  assert.deepEqual(auto, ['①浴室　手すりの取り付け　L=600mm', '⑤玄関　手すりの取り付け　L=400×600×600mm', '③トイレ　段差の解消']);
  for (const extra of [{shinseiLine: '浴室　手すりの取り付け　L=650mm　木製 '}, {shinseiLine: '  '}, {shinseiLine: ''}]) {
    const old = at(0, extra);
    assert.deepEqual(shinseiWorks(old, RATES), auto);
    assert.deepEqual(shinseiKinds(old, RATES), shinseiKinds(base, RATES));
    assert.equal(txt(sheets(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(old, RATES))).byName.get('事前申請書')!, 'J14').split('\n')[0], '①浴室　手すりの取り付け　L=600mm');
  }
  assert.deepEqual(
    workItems(base, RATES).map((w) => [w.photo, w.line]),
    [
      [1, '①浴室　手すりの取り付け　L=600mm'],
      [5, '⑤玄関　手すりの取り付け　L=400×600×600mm'],
      [3, '③トイレ　段差の解消'],
    ],
  );
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
/** シートのファイルの名前（xl/worksheets/sheet1.xml） */
function sheetPath(files: Record<string, Uint8Array>, sheet: string): string {
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const rid = [...wb.matchAll(/<sheet [^>]*>/g)].map((m) => m[0]).find((t) => /name="([^"]*)"/.exec(t)?.[1] === sheet)?.match(/r:id="([^"]+)"/)?.[1];
  return `xl/${new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]}`;
}
function drawingPath(files: Record<string, Uint8Array>, sheet: string): string {
  const path = sheetPath(files, sheet);
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
/** 置き場所の列（行）の番号と、その中の位置（EMU）→ シートの左上からの画素 */
const posPx = (n: number, off: number, size: (i: number) => number) => Array.from({length: n}, (_, i) => size(i + 1)).reduce((a, b) => a + b, 0) + off / 9525;

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
  // Excel は 90°回した図形の置き場所（from・to）を、まん中で 90°回した四角（縦横を入れかえた四角）で持つ：置き場所の幅＝回す前の高さ、高さ＝回す前の幅。まん中は同じ
  const lay = sheetLayout(strFromU8(ef[sheetPath(ef, kSheet.sheet)]));
  const [ax1, ay1, ax2, ay2] = [posPx(from[0], from[1], lay.colW), posPx(from[2], from[3], lay.rowH), posPx(to[0], to[1], lay.colW), posPx(to[2], to[3], lay.rowH)];
  const [ox, oy] = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(rotated)!.slice(1).map((v) => Number(v) / 9525);
  assert.ok(Math.abs(ax2 - ax1 - rh / 9525) < 1 && Math.abs(ay2 - ay1 - rw / 9525) < 1, `置き場所が縦横を入れかえた四角でない ${[ax1, ay1, ax2, ay2]} / ${rw}×${rh}`);
  assert.ok(Math.abs((ax1 + ax2) / 2 - (ox + rw / 9525 / 2)) < 1 && Math.abs((ay1 + ay2) / 2 - (oy + rh / 9525 / 2)) < 1, '置き場所のまん中が写真のまん中でない');
  // 写真がなければ、写真のファイル・図形は足さない
  const plain = unzipSync(fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues(job({insurer: 'kouiki'}), RATES)));
  assert.ok(!Object.keys(plain).some((k) => k.startsWith('xl/media/') && !unzipSync(KOUIKI)[k]));
  assert.doesNotMatch(strFromU8(plain['[Content_Types].xml']), /Extension="jpeg"/);
});

test('写真の用紙の写真の横（下）に書く欄：縦の写真は左に寄せて右に、横の写真・写真のない枠は写真が上・書く欄は下で中央ぞろえ（ユーザーの指示「写真をめいいっぱいにしない」「画像を上に、画像の下に寸法」）', () => {
  const frame = {x: 0, y: 0, w: 600, h: 300};
  const lines = ['手すりの取り付け　L=800mm H=600mm', 'ベースプレート　L=800mm'];
  // 書くことがなければ枠いっぱい（前と同じ）
  assert.deepEqual(photoNoteLayout(frame, {w: 900, h: 1600}, []), {photo: frame, note: null, align: 'left'});
  // 縦の写真：枠の高さに合わせた写真の幅を左に、残りを右の書く欄に
  const tall = photoNoteLayout(frame, {w: 900, h: 1600}, lines);
  assert.ok(Math.abs(tall.photo.w - (((300 - 8) * 900) / 1600 + 8)) < 0.01, JSON.stringify(tall));
  assert.ok(tall.note && Math.abs(tall.note.x - tall.photo.w) < 0.01 && tall.note.w > 250 && tall.note.h === 300 && tall.photo.h === 300);
  assert.equal(tall.align, 'left');
  // 横の写真：上に写真、その下に NOTE_GAP あけて書く欄（あけた分もふくめて枠の高さの 16〜32%）。文字は中央ぞろえ
  // （ユーザーの指示「写真と文字の位置を少しだけずらす。（文字をもう少し下にする）」2026-10-25。前は写真のすぐ下）
  const wide = photoNoteLayout(frame, {w: 1600, h: 1200}, lines);
  assert.ok(wide.note && wide.photo.y === 0 && wide.note.w === 600 && wide.note.h + NOTE_GAP >= 48 && wide.note.h + NOTE_GAP <= 96, JSON.stringify(wide));
  assert.ok(Math.abs(wide.note.y - wide.photo.h - NOTE_GAP) < 0.01 && Math.abs(wide.photo.h + NOTE_GAP + wide.note.h - 300) < 0.01);
  assert.equal(wide.align, 'center');
  assert.ok(NOTE_GAP >= 6 && NOTE_GAP <= 12); // 少しだけ（字の半行ほど）
  // 枠より横に長い写真は、写真の高さまでが写真の所で、書く欄は NOTE_GAP あけたその下から（余った高さは書く欄に）
  const pano = photoNoteLayout(frame, {w: 3200, h: 1000}, lines);
  assert.ok(Math.abs(pano.photo.h - ((600 - 8) * 1000) / 3200 - 8) < 0.01 && pano.note!.y === pano.photo.h + NOTE_GAP && pano.note!.y + pano.note!.h === 300, JSON.stringify(pano));
  // 横の写真を 90°回すと縦の写真と同じ（縦の写真の右の書く欄は、あけない）。写真のない枠は下に書く欄
  const turned = photoNoteLayout(frame, {w: 1600, h: 900, rot: 90}, lines);
  assert.ok(Math.abs(turned.photo.w - tall.photo.w) < 0.01 && turned.note!.y === 0);
  const none = photoNoteLayout(frame, null, lines);
  assert.ok(none.photo.y === 0 && none.note!.y === none.photo.h + NOTE_GAP && none.note!.y > 200);
  // 写真の下の端から書く欄の文字の上まで：写真の余白（4画素）＋あけた分＋書く欄の上の余白。前の 7画素より NOTE_GAP 下。どれも枠の中
  for (const [size, l] of [[{w: 1600, h: 1200}, wide], [{w: 3200, h: 1000}, pano]] as const) {
    const pic = photoPlacement(l.photo, size.w, size.h);
    assert.ok(Math.abs(l.note!.y + NOTE_INSET.y - (pic.y + pic.h) - (7 + NOTE_GAP)) < 0.01, JSON.stringify([pic, l.note]));
    assert.ok(l.note!.y + l.note!.h <= frame.y + frame.h + 1e-9 && pic.y + pic.h <= l.photo.y + l.photo.h);
  }
  // 低い枠・行の多い書く欄でも、書く欄はなくならず、字は入る大きさ（6pt まで小さく）
  const many = photoNoteLayout({x: 0, y: 0, w: 600, h: 120}, {w: 1600, h: 1200}, [...lines, ...lines, ...lines]);
  assert.ok(many.note!.h > 20 && many.note!.y + many.note!.h === 120 && photoNotePt(many.note!, [...lines, ...lines, ...lines]) >= 6, JSON.stringify(many));
  // 書く内容：自動の文（改修の種類・寸法）のあとに、手で足した行（空の行は書かない）
  assert.deepEqual(photoNoteLines({kind: 1, rows: [], dims: {l: '800', h: '600'}, photoNote: 'ベースプレート　L=800mm\n\n 補強板 '}), ['手すりの取り付け　L=800mm H=600mm', 'ベースプレート　L=800mm', '補強板']);
  assert.deepEqual(photoNoteLines({kind: 2, rows: [], dims: {w: '600', d: '350', h: '150'}}), ['段差の解消　W600mm D350mm H150mm']);
});

test('写真の用紙（Excel）：改修前の写真の横（上）の書く欄に、自動の文と手で足した行をテキストボックスで書き、写真は残りの所に。改修後は写真を枠いっぱい。写真のない写真番号にも書く', () => {
  const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 0xff, 0xd9]);
  const j = job({insurer: 'kanda', places: job().places.map((p, i) => (i === 0 ? {...p, photoNote: 'ベースプレート　L=800mm'} : p))});
  // 浴室①：改修前は縦の写真（900×1600）、改修後は横の写真（1600×1200）
  const files = unzipSync(fillShinsei(KANDA, SHINSEI.kanda!, {...shinseiValues(j, RATES), photoImages: {1: {before: {bytes: jpeg(1), w: 900, h: 1600}, after: {bytes: jpeg(2), w: 1600, h: 1200}}}}));
  const anchors = anchorsOf(strFromU8(files[drawingPath(files, '1 ')!]));
  const isNote = (a: string) => /name="改修[前後]の説明 \d+"/.test(a); // 足した書く欄（原本のテキストボックスとは名前で分ける）
  const boxes = anchors.filter(isNote);
  const pics = anchors.filter((a) => a.includes('<xdr:pic>'));
  // 書く欄は改修前の枠だけ（ユーザーの指示「改修後には入れる必要はありません。改修前の時に、工務店さんの方に…内容を伝える時に、見やすく分かりやすく伝えるもの」）
  assert.equal(boxes.length, 1);
  assert.match(boxes[0], /name="改修前の説明 \d+"/);
  assert.deepEqual([...boxes[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]), ['手すりの取り付け　L=600mm', 'ベースプレート　L=800mm']);
  // 字体は原本のテキストボックスと同じテーマの本文の字体（書かないと明朝などで出る）
  assert.match(boxes[0], /<xdr:style>.*<a:fontRef idx="minor">.*<\/xdr:style><xdr:txBody>/);
  const sheet = SHINSEI.kanda!.sheets.find((x) => x.sheet === '1 ')!;
  const inFrame = (a: string, k: 'before' | 'after') => {
    const [c1, r1, c2, r2] = cellsOf(sheet.photoPlace![k]!);
    const {from, to} = anchorOf(a);
    return from[0] >= c1 && from[2] >= r1 && to[0] <= c2 + 1 && to[2] <= r2 + 1; // 枠の右・下の端まで（終わりは次の欄の始まり）
  };
  const [bp, ap] = (['before', 'after'] as const).map((k) => pics.find((a) => inFrame(a, k))!);
  assert.ok(inFrame(boxes[0], 'before'));
  // 改修前の縦の写真は書く欄の左（書く欄の始まりの列は、写真の終わりの列より右か同じ）
  assert.ok(anchorOf(boxes[0]).from[0] >= anchorOf(bp).to[0] - 1, `${JSON.stringify(anchorOf(bp))} ${JSON.stringify(anchorOf(boxes[0]))}`);
  // 改修後の写真は、書く欄なしで枠いっぱい（前と同じ置き方）
  const lay = sheetLayout(strFromU8(files[sheetPath(files, '1 ')]));
  const full = photoPlacement(rangeBox(lay, sheet.photoPlace!.after!), 1600, 1200);
  const [ox, oy, cx, cy] = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(ap)!.slice(1).map((n) => Number(n) / 9525);
  assert.ok(Math.abs(ox - full.x) < 1 && Math.abs(oy - full.y) < 1 && Math.abs(cx - full.w) < 1 && Math.abs(cy - full.h) < 1, `${[ox, oy, cx, cy]} / ${JSON.stringify(full)}`);
  // 写真のない写真番号（⑤玄関）にも、改修前の枠の下に書く欄（自動の文だけ。中央ぞろえ）。改修後の枠には書かない
  const five = anchorsOf(strFromU8(files[drawingPath(files, '1  (5)')!])).filter(isNote);
  assert.equal(five.length, 1);
  assert.match(five[0], /name="改修前の説明 \d+"/);
  assert.deepEqual([...five[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]), ['手すりの取り付け　L=400×600×600mm']);
  assert.match(five[0], /<a:p><a:pPr algn="ctr"\/>/);
  // 画面のプレビュー（photoImages なし）では書かない（画面は枠に重ねて描く）
  const pv = unzipSync(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(j, RATES)));
  assert.ok(!anchorsOf(strFromU8(pv[drawingPath(pv, '1 ')!] ?? new Uint8Array())).some(isNote));
});

test('平面図の図：表題と工事内容のあいだの範囲に、縦横の比のまま・範囲に収まるだけ大きく貼る（図形のいちばんうしろ）。図がなければ貼らない（4つの保険者）', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 0xff, 0xd9]); // 写真のファイルはそのまま入る
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) {
    const map = SHINSEI[insurer]!;
    const sheet = map.sheets.find((x) => x.plan)!;
    assert.ok(sheet?.legend, insurer); // 工事内容を書く平面図のシート
    for (const [w, h] of [
      [1600, 1131], // A4 横の図
      [1131, 1600], // A4 縦の図
      [40, 30], // 小さい図も範囲いっぱいに（ただし範囲より大きくしない）
    ]) {
      const files = unzipSync(fillShinsei(TEMPLATES[insurer], map, {...shinseiValues(job({insurer}), RATES), planImage: {bytes: jpeg, w, h}}));
      const path = drawingPath(files, sheet.sheet);
      const anchors = anchorsOf(strFromU8(files[path]));
      const pics = anchors.filter((a) => a.includes('<xdr:pic>'));
      assert.equal(pics.length, 1, insurer);
      assert.equal(anchors[0], pics[0], `${insurer}：図は図形のいちばんうしろ（工事内容・あとから描く線が上に出る）`);
      assert.match(pics[0], /<xdr:cNvPr id="\d+" name="平面図 \d+"\/>/);
      assert.match(pics[0], /<a:picLocks noChangeAspect="1"\/>/);
      // 写真のファイルとつながり
      const rid = /<a:blip r:embed="([^"]+)"/.exec(pics[0])![1];
      const rels = strFromU8(files[path.replace(/([^/]+)$/, '_rels/$1.rels')]);
      const media = new RegExp(`Id="${rid}"[^>]*Type="[^"]*/image"[^>]*Target="\\.\\./media/([^"]+)"`).exec(rels)?.[1];
      assert.deepEqual(files[`xl/media/${media}`], jpeg, insurer);
      assert.match(strFromU8(files['[Content_Types].xml']), /<Default Extension="jpeg" ContentType="image\/jpeg"\/>/);
      // 位置と大きさ：画面のプレビューと同じ計算（planPlacement）。範囲の中・縦横の比はそのまま
      const lay = sheetLayout(strFromU8(files[sheetPath(files, sheet.sheet)]));
      const frame = rangeBox(lay, sheet.plan!);
      const want = planPlacement(frame, w, h);
      const [ox, oy, cx, cy] = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(pics[0])!.slice(1).map((n) => Number(n) / 9525);
      assert.ok(Math.abs(ox - want.x) < 0.01 && Math.abs(oy - want.y) < 0.01 && Math.abs(cx - want.w) < 0.01 && Math.abs(cy - want.h) < 0.01, `${insurer} ${[ox, oy, cx, cy]}`);
      assert.ok(Math.abs(cx / cy - w / h) < 0.01, insurer);
      assert.ok(ox >= frame.x && oy >= frame.y && ox + cx <= frame.x + frame.w + 0.01 && oy + cy <= frame.y + frame.h + 0.01, insurer);
      assert.ok(Math.abs(cx - (frame.w - 8)) < 0.01 || Math.abs(cy - (frame.h - 8)) < 0.01, `${insurer}：範囲いっぱいでない`);
      const {from, to} = anchorOf(pics[0]);
      const [c1, r1, c2, r2] = cellsOf(sheet.plan!);
      assert.ok(from[0] >= c1 && from[2] >= r1 && to[0] <= c2 + 1 && to[2] <= r2 + 1, `${insurer} ${from} ${to}`);
      // 図形の番号は重ならない
      const ids = [...anchors.join('').matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, insurer);
      // 範囲は表題の下・工事内容（テキストボックス・みやこ町は下の欄）の上（重ならない）
      const title = rangeBox(lay, sheet.name!);
      const legend = rangeBox(lay, sheet.legend!.box ?? sheet.legend!.cell!);
      assert.ok(frame.y >= title.y + title.h && frame.y + frame.h <= legend.y, `${insurer} ${JSON.stringify([title, frame, legend])}`);
      assert.ok(readShinsei(zipSync(files)), insurer); // 開き直せる
    }
    // 図がなければ足さない（原本の図形のまま。工事内容だけ）
    const plain = unzipSync(fillShinsei(TEMPLATES[insurer], map, shinseiValues(job({insurer}), RATES)));
    assert.ok(!anchorsOf(strFromU8(plain[drawingPath(plain, sheet.sheet)])).some((a) => a.includes('<xdr:pic>')), insurer);
  }
  // 範囲は平面図のシートだけ（写真貼付用紙・様式には平面図の範囲はない）
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) assert.equal(SHINSEI[insurer]!.sheets.filter((x) => x.plan).length, 1);
});

/** 欄の字の大きさと太字（styles.xml の書式から） */
const fontOf = (files: Record<string, Uint8Array>, xml: string, ref: string) => {
  const {fonts, xfs} = styleParts(files);
  const s = Number(/\ss="(\d+)"/.exec(cell(xml, ref))?.[1] ?? 0);
  const font = fonts[Number(/fontId="(\d+)"/.exec(xfs[s])?.[1] ?? 0)];
  return {size: Number(/<sz val="([\d.]+)"/.exec(font)?.[1]), bold: /<b\/>/.test(font), name: /<name val="([^"]+)"/.exec(font)?.[1]};
};

test('□の一覧の欄を1行ずつに：苅田町の写真の用紙の実施した工事種類（B4）は、原本の2行がそれぞれ1行に入る 9.5pt（行の高さ・欄の大きさは原本のまま）。改修箇所（B2）は 11pt のまま。長い改修場所は小さく', () => {
  // ユーザーの指示「申請書の枠が込みの部分が無駄に行替えがされているため、修正する」（2026-10-25）：B4 の2行が欄の幅を数文字こえて、Excel で「…床材の変」「更」の4行になっていた
  const w = 675; // B4:H4 の幅（画素）
  const line1 = '■手すりの取り付け　□(2)段差の解消　□(3)滑り防止及び移動の円滑化のための床材の変更';
  const line2 = '□(4)引戸等への扉の取替　□(5)洋式便器等への便器の取替　□(6)その他(1)～(5)に付帯する工事';
  // 原本の 11pt の太字では入らない（Excel でも折り返した）。9.5pt なら2行とも入る。太字でなければ少し大きくても入る
  assert.ok(oneRowPt([line1], w, 11, true) < 11 && oneRowPt([line2], w, 11, true) < 11);
  assert.equal(oneRowPt([line1, line2], w, 11, true), 9.5);
  assert.ok(oneRowPt([line1, line2], w, 11, false) >= 9.5);
  // 改修箇所の1行目（全角40字）は 11pt の太字で入る。入らないほど長ければ 6pt まで
  assert.equal(oneRowPt(['□廊下　□階段　□台所　□居間・食堂　□寝室　□洗面・脱衣室　□浴室　□トイレ'], w, 11, true), 11);
  assert.equal(oneRowPt(['あ'.repeat(200)], w, 11, true), 6);
  // 原本（9枚の写真の用紙）：B4 は 9.5pt の太字（字体は原本のまま）、B2 は 11pt。欄の大きさ（行の高さ）は原本のまま
  const orig = unzipSync(KANDA);
  const kandaSheets = SHINSEI.kanda!.sheets.filter((x) => x.photoPlace);
  assert.equal(kandaSheets.length, 9);
  for (const sheet of kandaSheets) {
    const xml = strFromU8(orig[sheetPath(orig, sheet.sheet)]);
    assert.deepEqual(fontOf(orig, xml, 'B4'), {size: 9.5, bold: true, name: 'HGSｺﾞｼｯｸM'}, sheet.sheet);
    assert.deepEqual(fontOf(orig, xml, 'B2'), {size: 11, bold: true, name: 'HGSｺﾞｼｯｸM'}, sheet.sheet);
    const lay = sheetLayout(xml);
    assert.deepEqual([rangeBox(lay, 'B4').w, rangeBox(lay, 'B4').h, rangeBox(lay, 'B2').h], [w, 70, 70], sheet.sheet);
  }
  // 書いた申請書：どの改修の種類を■にしても1行ずつ入る（9.5pt のまま。■と□は同じ幅）
  for (const kind of [1, 2, 3, 4, 5, 6]) {
    const j = job({insurer: 'kanda', places: [place('浴室', [mat('木の手すり 35φ 4m', {lengthCm: 60, pieceLengthM: 4})], {kind})]});
    const files = unzipSync(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(j, RATES)));
    const xml = strFromU8(files[sheetPath(files, '1 ')]);
    const lines = txt(xml, 'B4').split('\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[kind <= 3 ? 0 : 1].includes('■'), true, `${kind}`);
    assert.equal(fontOf(files, xml, 'B4').size, 9.5, `${kind}`);
    assert.equal(oneRowPt(lines, w, 9.5, true), 9.5, `${kind}`);
  }
  // 一覧にない長い改修場所（「■名前」）で改修箇所の2行目が入らなければ、その欄だけ小さく（行の高さは原本のまま）
  const long = '勝手口から車庫までの屋外通路と物置前の段差のある所と駐車場の間の通路';
  const lf = unzipSync(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job({insurer: 'kanda', places: [place(long, [mat('手すり')])]}), RATES)));
  const lx = strFromU8(lf[sheetPath(lf, '1 ')]);
  const b2 = txt(lx, 'B2').split('\n');
  assert.ok(b2[1].includes(`■${long}`), b2[1]);
  const pt = fontOf(lf, lx, 'B2').size;
  assert.ok(pt < 11 && oneRowPt(b2, w, pt, true) === pt, `${pt}`);
  assert.equal(fontOf(lf, lx, 'B4').size, 9.5);
});

/** XML が整った形か（開きと閉じのタグが合っている）。合わなければその所 */
function xmlProblem(xml: string): string {
  const stack: string[] = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<|>/g)) {
    if (m[0] === '<' || m[0] === '>') return `ばらの ${m[0]}（${m.index}）`;
    if (m[4]) continue;
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return `</${m[2]}>（${m.index}）`;
  }
  return stack.length ? `閉じていない <${stack.at(-1)}>` : '';
}

test('写真・平面図に Excel で描く図形・線のはじめの形（原本のテーマ）：図形は茶色の太い枠線（6pt・塗りなし）、線は黄色の少し細い線（2.25pt）（4つの保険者）', () => {
  // ユーザーの指示「写真の線の細さをデフォルトの線を補足する。デフォルトの色は枠が込みの場合は、茶色、横棒のみの場合は黄色がデフォルトにする」（2026-10-25）：
  // Excel で図形（四角・丸）を描くと茶色の太い枠、線を描くと黄色の線。線は「少し細い」（ユーザーの答え。茶色の太い枠の中に引く線）
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) {
    for (const [label, bytes] of [
      ['原本', TEMPLATES[insurer]],
      ['書いた申請書', fillShinsei(TEMPLATES[insurer], SHINSEI[insurer]!, shinseiValues(job({insurer}), RATES))],
    ] as const) {
      const theme = strFromU8(unzipSync(bytes)['xl/theme/theme1.xml']);
      assert.equal(xmlProblem(theme), '', `${insurer} ${label}`);
      assert.equal((theme.match(/<a:objectDefaults\b/g) ?? []).length, 1);
      // 置き場所：themeElements のうしろ、extraClrSchemeLst の前（DrawingML の決まった順）
      assert.match(theme, /<\/a:themeElements><a:objectDefaults>[\s\S]*<\/a:objectDefaults><a:extraClrSchemeLst\/>/, `${insurer} ${label}`);
      const od = /<a:objectDefaults>([\s\S]*?)<\/a:objectDefaults>/.exec(theme)![1];
      const sp = /^<a:spDef>([\s\S]*?)<\/a:spDef><a:lnDef>([\s\S]*?)<\/a:lnDef>$/.exec(od);
      assert.ok(sp, `${insurer}：spDef・lnDef の順`);
      const [spDef, lnDef] = [sp[1], sp[2]];
      // spPr・bodyPr・lstStyle・style の順（CT_DefaultShapeDefinition）
      for (const d of [spDef, lnDef]) assert.match(d, /^<a:spPr>[\s\S]*<\/a:spPr><a:bodyPr\b[^>]*\/><a:lstStyle\/><a:style><a:lnRef\b[\s\S]*<\/a:lnRef><a:fillRef\b[\s\S]*<\/a:fillRef><a:effectRef\b[\s\S]*<\/a:effectRef><a:fontRef\b[\s\S]*<\/a:fontRef><\/a:style>$/);
      // 図形：塗りなし（写真が透ける）・茶色の 6pt（76200 EMU）の枠線
      assert.match(spDef, /^<a:spPr><a:noFill\/><a:ln w="76200"[^>]*><a:solidFill><a:srgbClr val="993300"\/><\/a:solidFill>/);
      // 線：黄色の少し細い 2.25pt（28575 EMU。端は丸く）。図形の枠より細い
      assert.match(lnDef, /^<a:spPr><a:ln w="28575" cap="rnd"[^>]*><a:solidFill><a:srgbClr val="FFFF00"\/><\/a:solidFill>/);
    }
  }
  // 調べ方の確かめ：閉じていないタグは見つける
  assert.notEqual(xmlProblem('<a:x><a:y></a:x>'), '');
});

test('印刷：A4 から少しはみ出す原本のシート（広域連合の様式・苅田町の事後申請書・行橋市の平面図・みやこ町の支給申請書）は「1ページに合わせる」にする。入るシート・改ページのある理由書はそのまま', () => {
  const fitted = (bytes: Uint8Array, name: string) => {
    const {byName} = sheets(bytes);
    return /<pageSetUpPr\b[^>]*fitToPage="1"/.test(byName.get(name)!) && /<pageSetup\b[^>]*fitToWidth="1"[^>]*fitToHeight="1"/.test(byName.get(name)!);
  };
  const k = fillShinsei(KOUIKI, SHINSEI.kouiki!, shinseiValues(job({insurer: 'kouiki', form: 'kouiki'}), RATES));
  for (const name of ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）', '様式第2号別紙（住宅改修内訳明細書）', '写真貼付用紙']) assert.ok(fitted(k, name), name);
  const kanda = fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job({insurer: 'kanda'}), RATES));
  assert.ok(fitted(kanda, '事後申請書'));
  const y = fillShinsei(YUKUHASHI, SHINSEI.yukuhashi!, shinseiValues(job({insurer: 'yukuhashi'}), RATES));
  assert.ok(fitted(y, '平面図  (2)'));
  assert.equal(fitted(y, '住改・受領委任払'), false); // 原本の倍率で入る
});

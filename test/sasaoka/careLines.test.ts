// 見積書の明細の下の介護保険の内訳（careLines.ts）と、申請書の委任状の保険給付額（shinsei.ts）。
// ユーザーの指示「工事見積書にも販売見積書と同様に記載する。記載する、記載しないは販売見積もりと同様に選択できるようにする」
// 「住宅改修の委任状の保険給付額の部分が連動されていない」「住宅改修の申請書にも負担割合を設置」2026-10-28。お客様は架空の見本
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {estimateTotals} from '../../src/sasaoka/calc.ts';
import {CARE_LINE, careAmounts, careLines, withCareLines} from '../../src/sasaoka/careLines.ts';
import {FORM_INFO, formLines, NO_SHINSEI, paginate, TOTAL_ROWS} from '../../src/sasaoka/estimateForms.ts';
import {estimateXlsx} from '../../src/sasaoka/estimateXlsx.ts';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {fillShinsei, SHINSEI, shinseiValues} from '../../src/sasaoka/shinsei.ts';
import type {Job, Place, Row, ShinseiInfo} from '../../src/sasaoka/types.ts';

const S = defaultSettings();
const blank = {code: '', maker: '', unit: '', price: 0, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
let seq = 0;
const mat = (name: string, listPrice: number, extra: Partial<Row> = {}): Row => ({...blank, id: `r${++seq}`, kind: 'material', refId: null, name, qty: 1, listPrice, ...extra});
const place = (name: string, rows: Row[]): Place => ({id: `p${++seq}`, name, rows, kind: 1, photo: 0});
const job = (info: Partial<ShinseiInfo> = {}, extra: Partial<Job> = {}): Job => ({
  id: 'j1',
  month: '2026-10',
  customer: '見本 花子',
  suffix: '様邸',
  staff: '',
  date: '',
  address: '福岡県京都郡苅田町富久町1-1',
  note: '',
  insuredNo: '0000000001',
  insurer: 'kanda',
  form: 'yukuhashi',
  overhead: null,
  overheadTarget: null,
  shikiri: true,
  places: [place('廊下', [mat('見本の手すり', 20000)]), place('浴室', [mat('見本の手すり', 30000)])],
  shinsei: {...NO_SHINSEI, ...info},
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

test('内訳の行：介護保険の対象・利用者負担（切り上げ・赤字）・保険者負担。負担割合を選ぶまで割合の行は書かない', () => {
  const total = estimateTotals(job(), S).all.total;
  assert.ok(total > 0 && total < 200000);
  assert.deepEqual(careLines(job(), S).lines, ['介護保険（受領委任払い）', `介護保険の対象　${total.toLocaleString('en-US')}円`]);
  const one = careLines(job({burden: '1'}), S);
  const share = Math.ceil(total / 10);
  assert.deepEqual(one.lines, [
    '介護保険（受領委任払い）',
    `介護保険の対象　${total.toLocaleString('en-US')}円`,
    `利用者負担（1割）　${share.toLocaleString('en-US')}円`,
    `保険者負担（9割）　${(total - share).toLocaleString('en-US')}円`,
  ]);
  assert.equal(one.red, 2);
  assert.equal(one.user, share);
  // 生活保護：「生活保護（1割）」（赤字の利用者負担は書かない。「介護扶助」とは書かない）
  const welfare = careLines(job({burden: '1', welfare: true}), S);
  assert.equal(welfare.red, -1);
  assert.match(welfare.lines[2], /^生活保護（1割）　/);
  // 償還払い：いったん全額と払い戻し
  const back = careLines(job({burden: '2'}, {uriage: {billing: 'reimbursement'}}), S);
  assert.equal(back.lines[0], '介護保険（償還払い）');
  assert.match(back.lines.at(-2)!, /^いったんお支払いいただく金額　/);
  assert.match(back.lines.at(-1)!, /^（あとで保険者から .+円が払い戻されます）$/);
  for (const l of [...one.lines, ...welfare.lines, ...back.lines]) assert.ok(CARE_LINE.test(l), l); // 取り込むときに見分けられる
});

test('内訳の行：介護保険の対象は限度額20万円まで（超えた分）・介護保険の対象外の工事', () => {
  const big = job({burden: '2'}, {places: [place('浴室', [mat('見本のユニットバス', 300000), mat('見本の照明', 10000, {excluded: true})])]});
  const t = estimateTotals(big, S);
  const a = careAmounts(big, S);
  assert.equal(a.covered, 200000);
  assert.equal(a.share, 40000);
  assert.equal(a.benefit, 160000);
  const lines = careLines(big, S).lines;
  assert.ok(lines.includes('介護保険の対象　200,000円'));
  assert.ok(lines.includes(`限度額を超えた分　${(t.target.total - 200000).toLocaleString('en-US')}円`));
  assert.ok(lines.includes(`介護保険の対象外　${(t.all.total - t.target.total).toLocaleString('en-US')}円`));
});

test('見積書の明細のあとに1行あけて内訳。「自己負担額を表示」を外せば書かない。合計の上に入らなければ次のページ', () => {
  const per = FORM_INFO.yukuhashi.perPage;
  const j = job({burden: '1'});
  const base = formLines(j, S, 'yukuhashi');
  const lines = withCareLines(base, j, S, per);
  const memos = lines.filter((l) => l.memo);
  assert.equal(memos[0].memo?.text, ''); // 1行あける
  assert.deepEqual(memos.slice(1).map((l) => l.memo?.text), careLines(j, S).lines);
  assert.equal(memos.findIndex((l) => l.memo?.red), 3);
  assert.equal(paginate(lines, per).length, 1);
  assert.deepEqual(withCareLines(base, {...j, showSelfPay: false}, S, per), base);
  // 明細が多くて合計の上に入らないときは、内訳と合計を次のページに
  const many = job({burden: '1'}, {places: Array.from({length: 12}, (_, i) => place(`見本${i}`, [mat('見本の手すり', 1000)]))});
  const pages = paginate(withCareLines(formLines(many, S, 'yukuhashi'), many, S, per), per);
  assert.equal(pages.length, 2);
  assert.ok(pages[1].every((l) => l.memo) && pages[1].length + TOTAL_ROWS <= per);
  assert.ok(pages[1][0].memo?.text, '次のページの初めは1行あけない');
});

test('Excel の見積書にも内訳（左の3つの欄を結合・利用者負担は赤字）', () => {
  const j = job({burden: '1'});
  const files = unzipSync(estimateXlsx(j, S, '2026-10-28').bytes);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  const red = careLines(j, S);
  for (const l of red.lines) assert.ok(sheet.includes(`>${l}<`), l);
  assert.match(strFromU8(files['xl/styles.xml']), /<color rgb="FFC00000"\/>/);
  // 結合（A〜C）
  const row = /<c r="A(\d+)"[^>]*t="inlineStr"><is><t[^>]*>介護保険の対象/.exec(sheet)?.[1];
  assert.ok(row && sheet.includes(`<mergeCell ref="A${row}:C${row}"/>`), row);
  // 書かないとき
  const off = strFromU8(unzipSync(estimateXlsx({...j, showSelfPay: false}, S, '2026-10-28').bytes)['xl/worksheets/sheet1.xml']);
  assert.ok(!off.includes('介護保険の対象'));
});

const KANDA = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/kanda.xltx', import.meta.url)));
const proxySheet = (bytes: Uint8Array) => {
  const files = unzipSync(bytes);
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const id = /<sheet [^>]*name="委任状"[^>]*r:id="([^"]+)"/.exec(wb)![1];
  const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)![1];
  return {xml: strFromU8(files[`xl/${target}`]), styles: strFromU8(files['xl/styles.xml'])};
};
const cellText = (xml: string, ref: string) => {
  const c = new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)</c>`).exec(xml)?.[1] ?? '';
  return /<t[^>]*>([\s\S]*?)<\/t>/.exec(c)?.[1] ?? '';
};

test('委任状の保険給付額：負担割合を選べば 介護保険の対象−負担割合の分（18pt・円の位置は原本のまま）。選ぶまで原本のまま', () => {
  const j = job({burden: '1'});
  const benefit = careAmounts(j, S).benefit;
  const {xml, styles} = proxySheet(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(j, S)));
  const text = cellText(xml, 'B23');
  assert.match(text, new RegExp(`^　+${benefit.toLocaleString('ja-JP')}円$`));
  // 18pt の書式・行の高さ（特定福祉用具の委任状と同じ）
  const s = Number(/<c r="B23"[^>]*\ss="(\d+)"/.exec(xml)?.[1]);
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)![1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
  const fontId = Number(/fontId="(\d+)"/.exec(xfs[s])![1]);
  const font = /<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(styles)![1].match(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g)![fontId];
  assert.match(font, /<sz val="18"\/>/);
  assert.match(xml, /<row r="23"[^>]*ht="24" customHeight="1"/);
  // 負担割合を選んでいなければ原本の「すき間＋円」のまま
  const orig = proxySheet(KANDA).xml;
  assert.equal(cellText(proxySheet(fillShinsei(KANDA, SHINSEI.kanda!, shinseiValues(job(), S))).xml, 'B23'), cellText(orig, 'B23'));
});

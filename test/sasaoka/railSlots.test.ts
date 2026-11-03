// 申請書で箇所を入れたときの見積書の空きの行（railSlots.ts）と、既製品の手すりの長さ（見積書 → 申請書）
import assert from 'node:assert/strict';
import test from 'node:test';
import {isBlankRow} from '../../src/sasaoka/calc.ts';
import {formLines} from '../../src/sasaoka/estimateForms.ts';
import {insertRowsAt, materialRow, newPlace} from '../../src/sasaoka/rows.ts';
import {readyLengths, railType, slotNames, slotQuery, withSlots} from '../../src/sasaoka/railSlots.ts';
import {estimateLength} from '../../src/sasaoka/shinsei.ts';
import {deleteTouchesShinsei, describeKey, insertAfterId} from '../../src/sasaoka/sheetEdit.ts';
import type {Job, Material, Place, Row, Settings} from '../../src/sasaoka/types.ts';

const S = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateHourRate: 2500, estimateOverheadRate: 0.1, taxRate: 0.1} as const satisfies Pick<
  Settings,
  'estimateRate' | 'estimateLaborRate' | 'estimateHourRate' | 'estimateOverheadRate' | 'taxRate'
>;
const slots = (p: Place) => p.rows.map((r) => r.slot ?? '');
const mat = (name: string, patch: Partial<Material> = {}): Material => ({
  id: `m-${name}`, name, code: '', maker: '見本工業', unit: '本', price: 1000, listPrice: 2000, pieceLengthM: 0, favorite: false, updatedAt: 0, ...patch,
});
const job = (places: Place[]): Job => ({
  id: 'j1', month: '2026-11', customer: '見本 花子', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '', insurer: 'yukuhashi',
  form: 'yukuhashi', overhead: null, overheadTarget: null, shikiri: true, places, createdAt: 0, updatedAt: 0,
});

test('木手すり（初め）は 手すり・ブラケット・施工費 の3行。L字（600×800）も同じ3行', () => {
  const p = withSlots(newPlace('廊下'));
  assert.deepEqual(slots(p), ['手すり', 'ブラケット', '施工費']);
  assert.ok(p.rows.every(isBlankRow));
  const l = withSlots({...p, dims: {l: '600×800'}});
  assert.deepEqual(slots(l), ['手すり', 'ブラケット', '施工費']);
  assert.equal(l, withSlots(l)); // 同じなら同じ箇所（作り直さない）
});

test('木手すり＋ベースプレート：ベースプレートの行も1つ（手すりのすぐ下）', () => {
  const p = withSlots({...newPlace('廊下'), plateLength: '1300'});
  assert.deepEqual(slots(p), ['手すり', 'ベースプレート', 'ブラケット', '施工費']);
});

test('既製品（TOTO など）は 材料費・施工費 の2行。前からある空白の行の id は残す', () => {
  const p = withSlots(newPlace('トイレ'));
  const ids = p.rows.map((r) => r.id);
  const t = withSlots({...p, rail: 'ready'});
  assert.deepEqual(slots(t), ['材料費', '施工費']);
  assert.deepEqual(t.rows.map((r) => r.id), ids.slice(0, 2));
});

test('屋外で高さを入れると 支柱・手すり・ブラケット・施工費。選んだ種類が先', () => {
  const p = withSlots(newPlace('玄関～道路'));
  assert.equal(railType(p), 'wood');
  const h = withSlots({...p, dims: {h: '800'}});
  assert.equal(railType(h), 'post');
  assert.deepEqual(slots(h), ['支柱', '手すり', 'ブラケット', '施工費']);
  // 屋内（廊下）は高さを入れても木手すり
  assert.deepEqual(slots(withSlots({...newPlace('廊下'), dims: {h: '800'}})), ['手すり', 'ブラケット', '施工費']);
  // 手で木手すりを選べば、屋外で高さがあっても木手すり
  assert.deepEqual(slots(withSlots({...h, rail: 'wood'})), ['手すり', 'ブラケット', '施工費']);
});

test('手すりの取り付けでない箇所は 材料費・施工費', () => {
  assert.deepEqual(slots(withSlots({...newPlace('玄関'), kind: 2})), ['材料費', '施工費']);
});

test('見積書に何か入れた箇所は作り直さない（種類を変えても）', () => {
  const p = withSlots(newPlace('廊下'));
  const filled: Place = {...p, rows: insertRowsAt(p.rows, [materialRow(mat('手すり 4m', {pieceLengthM: 4}))], p.rows[0].id)};
  assert.deepEqual(slots(filled), ['', 'ブラケット', '施工費']);
  assert.equal(withSlots({...filled, rail: 'ready'}).rows, filled.rows);
});

test('空きの行を選んで部材を入れると、その行に入る（行は増えない）', () => {
  const p = withSlots(newPlace('廊下'));
  const add = materialRow(mat('エンドブラケット', {unit: '個'}), 2);
  const rows = insertRowsAt(p.rows, [add], p.rows[1].id);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].id, add.id);
  assert.equal(rows[0].slot, '手すり');
});

test('印刷・Excel：入れなかった空きの行は出さない。空きの行だけの箇所は1行（改修場所を出す）。見積書の画面には全部（名前つき）', () => {
  const a = withSlots(newPlace('廊下'));
  const b = withSlots(newPlace('トイレ'));
  const bFilled: Place = {...b, rows: insertRowsAt(b.rows, [materialRow(mat('手すり 4m', {pieceLengthM: 4}))], b.rows[0].id)};
  const lines = formLines(job([a, bFilled]), S, 'yukuhashi');
  assert.deepEqual(lines.map((l) => [l.placeName, l.blank]), [['廊下', true], ['トイレ', false]]);
  assert.ok(lines.every((l) => !l.slot || l.blank));
  const sheet = formLines(job([a, bFilled]), S, 'yukuhashi', {all: true});
  assert.deepEqual(sheet.map((l) => l.slot ?? ''), ['手すり', 'ブラケット', '施工費', '', 'ブラケット', '施工費']);
});

test('部材リストの検索の言葉：ブラケット・支柱・ベースプレートの行だけ', () => {
  assert.equal(slotQuery('ブラケット'), 'ブラケット');
  assert.equal(slotQuery('支柱'), '支柱');
  assert.equal(slotQuery('手すり'), '');
  assert.equal(slotQuery(undefined), '');
});

test('選んでいる欄の名前：空きの行も「空白の行」（手すりなどの名前は出さない。ユーザーの指示「誤解をまねくため、不要」2026-11-03）', () => {
  const p = withSlots(newPlace('廊下'));
  assert.match(describeKey(job([p]), `line:${p.rows[0].id}:text`, S), /空白の行/);
});

test('挿入で行が入る所：部材の行を選ぶと、すぐ下の施工費のまとまりの下', () => {
  const m = materialRow(mat('手すり 4m', {pieceLengthM: 4}));
  const labor: Row = {...materialRow(mat('取付')), id: 'w1', kind: 'labor'};
  const labor2: Row = {...labor, id: 'w2'};
  const tail = materialRow(mat('エンドキャップ'));
  const p: Place = {...newPlace('廊下'), rows: [m, labor, labor2, tail]};
  assert.equal(insertAfterId(job([p]), m.id), 'w2');
  assert.equal(insertAfterId(job([p]), 'w1'), 'w2');
  assert.equal(insertAfterId(job([p]), tail.id), tail.id);
  assert.equal(insertAfterId(job([p]), 'nope'), null);
});

test('既製品の手すりの長さ：商品名の長さ（I型 600mm・L=800）・L型は2本・数量の分。部品・4m の材・切って使う行はのぞく', () => {
  const r = (name: string, patch: Partial<Row> = {}): Row => ({...materialRow(mat(name, {pieceLengthM: 0})), ...patch});
  assert.deepEqual(readyLengths(r('TOTO 手すり I型 600mm', {pieceLengthM: 0.6})), [600]);
  assert.deepEqual(readyLengths(r('ストレート手すり L=800', {pieceLengthM: 0.8, qty: 2})), [800, 800]);
  assert.deepEqual(readyLengths(r('手すり L型 600×800mm', {pieceLengthM: 0.8})), [600, 800]);
  assert.deepEqual(readyLengths(r('エンドブラケット', {pieceLengthM: 0})), []);
  assert.deepEqual(readyLengths(r('手すり用ベースプレート 1m', {pieceLengthM: 1})), []);
  assert.deepEqual(readyLengths(r('木の手すり 35φ 4m', {pieceLengthM: 4})), []); // 切って使う材（まるごと1本）
  assert.deepEqual(readyLengths(r('木の手すり 35φ 4m', {pieceLengthM: 4, lengthCm: 60})), []); // 使う長さを入れた行（estimateLength が読む）
  assert.deepEqual(readyLengths(r('手すり（長さなし）', {pieceLengthM: 0})), []);
});

test('申請書の長さ（見積書から）：切って使う手すりの使う長さと、既製品の手すりの長さ', () => {
  const cut = {...materialRow(mat('木の手すり 35φ 4m', {pieceLengthM: 4})), lengthCm: 120};
  const ready = {...materialRow(mat('TOTO 手すり I型 600mm', {pieceLengthM: 0.6}))};
  assert.equal(estimateLength({rows: [cut]}), '1200');
  assert.equal(estimateLength({rows: [ready]}), '600');
  assert.equal(estimateLength({rows: [cut, ready]}), '1200×600');
});

test('見積書の削除：申請書の箇所の何か入った行を消して空きの行だけになるときは聞く。空きの行を消すとき（ほかの行が残る）は聞かない', () => {
  const p = withSlots({...newPlace('廊下'), dims: {l: '600'}});
  const rail = materialRow(mat('手すり 4m', {pieceLengthM: 4}));
  const filled: Place = {...p, rows: insertRowsAt(p.rows, [rail], p.rows[0].id)};
  const j = job([filled]);
  assert.equal(deleteTouchesShinsei(j, rail.id)?.id, p.id);
  assert.equal(deleteTouchesShinsei(j, filled.rows[1].id), null); // （ブラケット）の空きの行
  // 空きの行が最後の1行なら聞く（今までの空白の行と同じ）
  const last: Place = {...p, rows: [p.rows[2]]};
  assert.equal(deleteTouchesShinsei(job([last]), p.rows[2].id)?.id, p.id);
  // 申請書の内容がない箇所は聞かない
  assert.equal(deleteTouchesShinsei(job([{...filled, dims: undefined}]), rail.id), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {cutRow, dimsLengths, fillAdded, lengthsToRows, placeAfterQty, placeFromDims} from '../../src/sasaoka/cutLink.ts';
import {estimateQty} from '../../src/sasaoka/calc.ts';
import {applySheet} from '../../src/sasaoka/sheetEdit.ts';
import type {Job, Place, Row, Settings} from '../../src/sasaoka/types.ts';

const S = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateHourRate: 2500, estimateOverheadRate: 0.1, taxRate: 0.1} as const satisfies Pick<
  Settings,
  'estimateRate' | 'estimateLaborRate' | 'estimateHourRate' | 'estimateOverheadRate' | 'taxRate'
>;
const row = (id: string, name: string, patch: Partial<Row> = {}): Row => ({
  id, kind: 'material', refId: null, name, code: '', maker: 'マツ六', unit: '', price: 0, qty: 1, listPrice: 12000, lengthCm: 0, pieceLengthM: 2,
  estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null, ...patch,
});
const rail = (patch: Partial<Row> = {}) => row('rail', 'BD-132 35アッシュ丸棒 ディンプル付 Mオーク 2m', patch);
const plate = (patch: Partial<Row> = {}) => row('plate', 'BH-412 木製ベースプレート 120mm幅 Mブラウン 2m', {listPrice: 15000, ...patch});
const bracket = row('br', 'BD-08G 35エンドブラケットカバー付 ゴールド', {qty: 2, pieceLengthM: 0, listPrice: 3000});
const place = (rows: Row[], patch: Partial<Place> = {}): Place => ({id: 'p1', name: '廊下', kind: 1, photo: 0, rows, ...patch});
const qtys = (p: Place) => Object.fromEntries(p.rows.filter((r) => r.pieceLengthM > 0).map((r) => [r.id, estimateQty(r)]));

test('申請書の長さの読み方：「600×1800」「600, 1800」「600+1800」「2,400mm」', () => {
  assert.deepEqual(dimsLengths('600×1800'), [600, 1800]);
  assert.deepEqual(dimsLengths('600, 1800'), [600, 1800]);
  assert.deepEqual(dimsLengths('６００＋１８００'), [600, 1800]);
  assert.deepEqual(dimsLengths('2,400mm'), [2400]);
  assert.deepEqual(dimsLengths(''), []);
  // 長さで数える行：使う長さがあるか、2m・4m の材でまだ1本以下。ブラケット・2本の本数で入れた行はのぞく
  assert.deepEqual([cutRow(rail()), cutRow(plate({qty: 0})), cutRow(bracket), cutRow(rail({qty: 2}))], [true, true, false, false]);
});

test('申請書の長さ（L=600×1800mm）を入れると、見積書の手すりとベースプレートが 2400mm÷2000mm＝1.2本（ユーザーの指示、2026-10-22）', () => {
  const p = placeFromDims(place([rail(), bracket, plate()], {dims: {l: '600×1800'}}));
  assert.deepEqual(qtys(p), {rail: 1.2, plate: 1.2});
  assert.equal(p.rows[1], bracket); // ブラケットはそのまま
  // 手すりの行が長さの数と同じだけあれば順に（ベースプレートは合計）
  const two = lengthsToRows([rail(), {...rail(), id: 'rail2'}, plate()], [600, 1800]);
  assert.deepEqual(two.map((r) => r.lengthCm), [60, 180, 240]);
  // 手すりの取り付けでない箇所・長さを空にしたときは変えない
  const other = place([rail()], {kind: 2, dims: {l: '600'}});
  assert.equal(placeFromDims(other), other);
  const empty = place([rail({lengthCm: 260})]);
  assert.equal(placeFromDims(empty), empty);
});

test('見積書で手すりの数量を入れると、ベースプレートも同じ長さ。逆も同じ。前から違う長さにしてあれば変えない', () => {
  const job = (p: Place): Job => ({
    id: 'j', month: '2026-10', customer: '', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null, shikiri: true,
    places: [p], createdAt: 1, updatedAt: 1,
  });
  const ctx = {settings: S, form: 'yukuhashi'} as const;
  // 手すりに 1.2 → ベースプレート（まだ空）も 1.2
  let j = applySheet(job(place([rail(), plate({qty: 0})])), 'line:rail:qty', '1.2', ctx).job;
  assert.deepEqual(qtys(j.places[0]), {rail: 1.2, plate: 1.2});
  // ベースプレートを 2600mm に → 手すりも 1.3（前は同じ長さだったので）
  j = applySheet(j, 'line:plate:qty', '2600mm', ctx).job;
  assert.deepEqual(qtys(j.places[0]), {rail: 1.3, plate: 1.3});
  // 手すりだけ 1.5 にしたあと、ベースプレートを直しても手すりは前から違う長さなのでそのまま
  j = applySheet(j, 'line:rail:qty', '1.5', ctx).job;
  assert.deepEqual(qtys(j.places[0]), {rail: 1.5, plate: 1.5});
  j = {...j, places: [{...j.places[0], rows: j.places[0].rows.map((r) => (r.id === 'plate' ? {...r, lengthCm: 200} : r))}]};
  j = applySheet(j, 'line:plate:qty', '1.1', ctx).job;
  assert.deepEqual(qtys(j.places[0]), {rail: 1.5, plate: 1.1});
});

test('見積書の手すりを直したら、前は同じ長さだった申請書の長さは空けて見積書の長さを出す。違う長さを書いてあればそのまま', () => {
  const before = place([rail({lengthCm: 240}), plate({lengthCm: 240})], {dims: {l: '600×1800', h: '800'}});
  const after = {...before, rows: before.rows.map((r) => (r.id === 'rail' ? {...r, lengthCm: 260} : r))};
  const p = placeAfterQty(before, after, 'rail');
  assert.deepEqual(p.dims, {h: '800'});
  assert.deepEqual(qtys(p), {rail: 1.3, plate: 1.3});
  const differ = {...before, dims: {l: '3000'}};
  assert.deepEqual(placeAfterQty(differ, {...after, dims: {l: '3000'}}, 'rail').dims, {l: '3000'});
});

test('長さの分かっている箇所に部材リストから入れた手すり・ベースプレートは、その長さ', () => {
  // 申請書の長さがあればその長さ
  let p = fillAdded(place([rail({lengthCm: 260}), plate({qty: 1})], {dims: {l: '600×1800'}}), new Set(['plate']));
  assert.deepEqual(qtys(p), {rail: 1.3, plate: 1.2});
  // なければ同じ箇所の手すりの長さ
  p = fillAdded(place([rail({lengthCm: 260}), plate({qty: 1})]), new Set(['plate']));
  assert.deepEqual(qtys(p), {rail: 1.3, plate: 1.3});
  // 入れた行でなければ変えない
  const keep = place([rail({lengthCm: 260}), plate({qty: 1})]);
  assert.equal(fillAdded(keep, new Set(['br'])), keep);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {cutRow, dimsLengths, fillAdded, lengthsToRows, midBrackets, placeAfterQty, placeFromDims, withBrackets} from '../../src/sasaoka/cutLink.ts';
import {estimateQty} from '../../src/sasaoka/calc.ts';
import {applySheet} from '../../src/sasaoka/sheetEdit.ts';
import {laborRow, materialRow} from '../../src/sasaoka/rows.ts';
import type {Job, Material, Place, Row, Settings} from '../../src/sasaoka/types.ts';

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

// ---------------------------------------------------------------- 中間のブラケット（ユーザーの指示「見積書で、中間のブラケット（BD-01G）の数も」→「おねがいします」、2026-10-22）

const mat = (id: string, name: string, code: string, patch: Partial<Material> = {}): Material => ({
  id, name, code, maker: 'マツ六', unit: '個', price: 600, listPrice: 1000, pieceLengthM: 0, favorite: false, updatedAt: 1, ...patch,
});
const MID_G = mat('m01g', '35ブラケット横型カバー付 ゴールド', 'BD-01G');
const MID_S = mat('m01s', '35ブラケット横型カバー付 シルバー', 'BD-01S');
const MATS = [MID_G, MID_S];
const mids = (p: Place) => p.rows.filter((r) => /BD-01/.test(r.code)).map((r) => [r.code, r.qty]);
const job1 = (p: Place): Job => ({
  id: 'j', month: '2026-10', customer: '', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null, shikiri: true,
  places: [p], createdAt: 1, updatedAt: 1,
});
const sheet = {settings: S, form: 'yukuhashi', materials: MATS} as const;

test('中間のブラケットの数：手すり1本ごとに ceil(長さ÷900mm)−1（ブラケットの間は 900mm 以内）', () => {
  assert.deepEqual([600, 900, 901, 1800, 2400, 2700, 4000].map((mm) => midBrackets([mm])), [0, 0, 1, 1, 2, 2, 4]);
  assert.equal(midBrackets([600, 1800]), 1); // L字（L=600×1800）は1本ずつ
});

test('申請書の長さ（L=600×1800）を入れると、手すりのすぐ下に BD-01G を1個（部材リストから。端のブラケットはそのまま）', () => {
  const before = place([rail(), bracket], {dims: {l: '600×1800'}});
  const after = withBrackets(before, placeFromDims(before), MATS);
  assert.deepEqual(after.rows.map((r) => r.id === 'rail' || r.id === 'br' ? r.id : r.code), ['rail', 'BD-01G', 'br']);
  const added = after.rows[1];
  assert.deepEqual([added.refId, added.qty, added.unit, added.price], ['m01g', 1, '個', 600]);
  // まっすぐ 2400mm なら2個
  const straight = place([rail(), bracket], {dims: {l: '2400'}});
  assert.deepEqual(mids(withBrackets(straight, placeFromDims(straight), MATS)), [['BD-01G', 2]]);
  // 端のブラケットがシルバー（BD-08S）なら BD-01S。部材リストになければ品番だけの行（単価は空。仕切価格が空欄の知らせに出る）
  const silver = place([rail(), {...bracket, name: 'BD-08S 35エンドブラケットカバー付 シルバー'}], {dims: {l: '2400'}});
  assert.deepEqual(mids(withBrackets(silver, placeFromDims(silver), MATS)), [['BD-01S', 2]]);
  const none = withBrackets(straight, placeFromDims(straight), []).rows[1];
  assert.deepEqual([none.code, none.maker, none.name, none.unit, none.qty, none.price, none.listPrice], ['BD-01G', 'マツ六', '35ブラケット横型カバー付 ゴールド', '個', 2, 0, 0]);
});

test('見積書で手すりの数量を直すと BD-01G も入れ直す。手で別の数にしたらそのまま。900mm までにしたら外す', () => {
  let j = applySheet(job1(place([rail(), bracket])), 'line:rail:qty', '1.2', sheet).job; // 2400mm
  assert.deepEqual(mids(j.places[0]), [['BD-01G', 2]]);
  j = applySheet(j, 'line:rail:qty', '1800mm', sheet).job;
  assert.deepEqual(mids(j.places[0]), [['BD-01G', 1]]);
  // 4000mm の手すりを切らずに2本（数量 2）なら 4個×2
  const full = applySheet(job1(place([{...rail(), id: 'bar', name: 'BD-134 35アッシュ丸棒 ディンプル付 Mオーク 4m', pieceLengthM: 4}])), 'line:bar:qty', '2', sheet).job;
  assert.deepEqual(mids(full.places[0]), [['BD-01G', 8]]);
  // 手で3個にしたら、手すりの長さを変えても3個のまま
  const midId = j.places[0].rows.find((r) => r.code === 'BD-01G')!.id;
  j = applySheet(j, `line:${midId}:qty`, '3', sheet).job;
  j = applySheet(j, 'line:rail:qty', '2400mm', sheet).job;
  assert.deepEqual(mids(j.places[0]), [['BD-01G', 3]]);
  // 手で直していなければ、900mm までの手すりにしたら行を外す（単価を直した行は数を 0 に）
  let k = applySheet(job1(place([rail(), bracket])), 'line:rail:qty', '2400mm', sheet).job;
  k = applySheet(k, 'line:rail:qty', '900mm', sheet).job;
  assert.deepEqual(mids(k.places[0]), []);
  k = applySheet(job1(place([rail(), bracket])), 'line:rail:qty', '2400mm', sheet).job;
  const kid = k.places[0].rows.find((r) => r.code === 'BD-01G')!.id;
  k = applySheet(k, `line:${kid}:price`, '777', sheet).job;
  k = applySheet(k, 'line:rail:qty', '600mm', sheet).job;
  assert.deepEqual(mids(k.places[0]), [['BD-01G', 0]]);
});

test('部材＋施工費（常用）の BD-01G（数は空け）を長さの分かっている箇所に入れると中間の数。部材リストから入れた BD-01G も', () => {
  const labor = laborRow({id: 'l1', name: '木', price: 1000, estPrice: null, note: ''}, 2);
  const kit = [{...materialRow(mat('m134', 'BD-134 35アッシュ丸棒 ディンプル付 Mオーク 4m', 'BD-134', {pieceLengthM: 4, unit: '本'}), 0)}, {...bracket, id: 'end', qty: 0}, materialRow(MID_G, 0), labor];
  const before = place([], {dims: {l: '600×1800'}});
  const ids = new Set(kit.map((r) => r.id));
  const p = withBrackets(before, fillAdded({...before, rows: kit}, ids), MATS);
  assert.deepEqual(mids(p), [['BD-01G', 1]]);
  assert.deepEqual(p.rows.map((r) => r.kind), ['material', 'material', 'material', 'labor']); // 行は増えない（施工費は下のまま）
  // 600mm だけなら要らないので外す
  const short = place([], {dims: {l: '600'}});
  assert.deepEqual(mids(withBrackets(short, fillAdded({...short, rows: kit}, ids), MATS)), []);
  // 手すりの長さが分かっている箇所に、部材リストから BD-01G を入れた
  const has = place([rail({lengthCm: 240}), bracket]);
  const picked = materialRow(MID_G);
  assert.deepEqual(mids(withBrackets(has, {...has, rows: [...has.rows, picked]}, MATS)), [['BD-01G', 2]]);
});

test('中間のブラケットを入れないとき：マツ六の 35 の丸棒（BD-1xx）でない・長さが変わらない・BD-01G が2行以上', () => {
  const yazaki = place([rail({name: 'HD5-4000 ハンドレール', maker: '矢崎化工', pieceLengthM: 4})], {dims: {l: '2400'}});
  assert.equal(withBrackets(yazaki, placeFromDims(yazaki), MATS).rows.length, 1);
  // 手すりの長さが前と同じなら、消した BD-01G を入れ直さない（単価などを直しただけ）
  const same = place([rail({lengthCm: 240}), bracket]);
  assert.equal(withBrackets(same, {...same, rows: same.rows.map((r) => (r.id === 'rail' ? {...r, estPrice: 5000} : r))}, MATS).rows.length, 2);
  // 2行に分けてある（手で入れた）ならそのまま
  const two = place([rail(), materialRow(MID_G, 1), materialRow(MID_G, 1)], {dims: {l: '2400'}});
  assert.deepEqual(mids(withBrackets(two, placeFromDims(two), MATS)), [['BD-01G', 1], ['BD-01G', 1]]);
});

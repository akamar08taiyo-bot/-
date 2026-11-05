import assert from 'node:assert/strict';
import test from 'node:test';
import {cutRow, dimsLengths, fillAdded, lengthsToRows, midBrackets, placeAfterQty, placeFromDims, plateFromText, withBrackets} from '../../src/sasaoka/cutLink.ts';
import {photoNoteAuto, workItems} from '../../src/sasaoka/shinsei.ts';
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
  // 「600×2」「600mm×2本」は 600mm を2本（前は 602mm と読んでいた）。× のうしろでも 100 以上は長さ
  assert.deepEqual(dimsLengths('600×2'), [600, 600]);
  assert.deepEqual(dimsLengths('600mm×2本'), [600, 600]);
  assert.deepEqual(dimsLengths('600×1'), [600]);
  assert.deepEqual(qtys(placeFromDims(place([rail()], {dims: {l: '600×2'}}))), {rail: 0.6}); // 1200mm÷2000mm
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

test('申請書の「＋ ベースプレート」の長さ（1300mm）は、見積書のベースプレートだけの長さ。空にしても見積書のベースプレートはそのまま（2026-11-02・11-04）', () => {
  // 手すり L=2100mm・ベースプレート 1300mm → 手すり 2100÷2000＝1.05本、ベースプレート 1300÷2000＝0.65本
  let p = placeFromDims(place([rail(), bracket, plate()], {dims: {l: '2100'}, plateLength: '1300'}));
  assert.deepEqual(qtys(p), {rail: 1.05, plate: 0.65});
  // ベースプレートの長さを空にしても、見積書のベースプレートは変えない（手すりの長さが変わっても変えない。2026-11-04）
  p = placeFromDims({...p, plateLength: undefined});
  assert.deepEqual(qtys(p), {rail: 1.05, plate: 0.65});
  p = placeFromDims({...p, dims: {l: '2400'}});
  assert.deepEqual(qtys(p), {rail: 1.2, plate: 0.65});
  // 手すりの長さがなくても、ベースプレートの長さだけで入る
  assert.deepEqual(qtys(placeFromDims(place([rail({lengthCm: 90}), plate()], {plateLength: '800'}))), {rail: 0.45, plate: 0.4});
  // あとから部材リストから入れたベースプレートも、その長さ
  const added = fillAdded(place([rail({lengthCm: 210}), plate()], {dims: {l: '2100'}, plateLength: '1300'}), new Set(['plate']));
  assert.deepEqual(qtys(added), {rail: 1.05, plate: 0.65});
  // ベースプレートの長さを入れてあれば、見積書で手すりの数量を直してもベースプレートは変えない。ベースプレートを直したら申請書の長さは空ける（見積書の長さを出す）
  const before = place([rail({lengthCm: 210}), plate({lengthCm: 130})], {dims: {l: '2100'}, plateLength: '1300'});
  const railed = placeAfterQty(before, {...before, rows: [rail({lengthCm: 240}), plate({lengthCm: 130})]}, 'rail');
  assert.deepEqual(qtys(railed), {rail: 1.2, plate: 0.65});
  const plated = placeAfterQty(before, {...before, rows: [rail({lengthCm: 210}), plate({lengthCm: 150})]}, 'plate');
  assert.deepEqual([qtys(plated), plated.dims, plated.plateLength], [{rail: 1.05, plate: 0.75}, {l: '2100'}, undefined]);
  // 申請書の改修の内容には手すりの長さだけ。ベースプレートは書かない（ユーザーの指示「手すりの長さを申請書に転記するときは、ベースプレートは不要」2026-11-05）。
  // 写真に書く内容には「ベースプレート　L=1300mm」の行（photoNoteAuto）
  const job = {places: [{...before, rows: [rail({lengthCm: 210}), plate({lengthCm: 130})]}]};
  assert.equal(workItems(job, S)[0].line, '①廊下　手すりの取り付け　L=2100mm');
  assert.deepEqual(photoNoteAuto(job.places[0]), ['手すり　L=2100mm', 'ベースプレート　L=1300mm']);
  // そのほかに打ってあったベースプレート（「ベースプレート　1300mm」）は、「＋ ベースプレート」を押すと長さの欄に移す
  assert.deepEqual(plateFromText('ベースプレート　1300mm'), {bp: '1300', rest: ''});
  assert.deepEqual(plateFromText('ベースプレート L=800mm　補強あり'), {bp: '800', rest: '補強あり'});
  assert.equal(plateFromText('補強板 900mm'), null);
});

test('見積書で手すりの数量を入れると、まだ空のベースプレートは同じ長さ。長さの入ったベースプレートは手すりを直しても変えない（逆も同じ。2026-11-04）', () => {
  const job = (p: Place): Job => ({
    id: 'j', month: '2026-10', customer: '', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null, shikiri: true,
    places: [p], createdAt: 1, updatedAt: 1,
  });
  const ctx = {settings: S, form: 'yukuhashi'} as const;
  // 手すりに 1.2 → ベースプレート（まだ空）も 1.2
  let j = applySheet(job(place([rail(), plate({qty: 0})])), 'line:rail:qty', '1.2', ctx).job;
  assert.deepEqual(qtys(j.places[0]), {rail: 1.2, plate: 1.2});
  // ベースプレートを 2600mm に → 手すりはそのまま 1.2
  j = applySheet(j, 'line:plate:qty', '2600mm', ctx).job;
  assert.deepEqual(qtys(j.places[0]), {rail: 1.2, plate: 1.3});
  // 手すりを 1.5 に → ベースプレートはそのまま 1.3（前は同じ長さなら合わせていた）
  j = applySheet(j, 'line:rail:qty', '1.5', ctx).job;
  assert.deepEqual(qtys(j.places[0]), {rail: 1.5, plate: 1.3});
  // 申請書の長さ（ベースプレートの長さはなし）を変えても、長さの入ったベースプレートはそのまま
  j = {...j, places: [placeFromDims({...j.places[0], dims: {l: '2000'}})]};
  assert.deepEqual(qtys(j.places[0]), {rail: 1, plate: 1.3});
});

test('見積書の手すりを直したら、前は同じ長さだった申請書の長さは空けて見積書の長さを出す。違う長さを書いてあればそのまま', () => {
  const before = place([rail({lengthCm: 240}), plate({lengthCm: 240})], {dims: {l: '600×1800', h: '800'}});
  const after = {...before, rows: before.rows.map((r) => (r.id === 'rail' ? {...r, lengthCm: 260} : r))};
  const p = placeAfterQty(before, after, 'rail');
  assert.deepEqual(p.dims, {h: '800'});
  assert.deepEqual(qtys(p), {rail: 1.3, plate: 1.2}); // ベースプレートは変えない（2026-11-04）
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

test('手すりを入れても・長さを入れても BD-01G（横受け）は自動では入れない（「手すりをいれると横受けが自動的にはいるが、はいらなくてよい」2026-11-04）', () => {
  const before = place([rail(), bracket]);
  assert.deepEqual(mids(withBrackets(before, placeFromDims({...before, dims: {l: '600×1800'}}), MATS)), []);
  const straight = place([rail(), bracket], {dims: {l: '2400'}});
  assert.deepEqual(mids(withBrackets(before, placeFromDims(straight), MATS)), []);
  assert.deepEqual(mids(applySheet(job1(place([rail(), bracket])), 'line:rail:qty', '1.2', sheet).job.places[0]), []); // 見積書で 2400mm にしても
  const withL = place([], {dims: {l: '1800'}});
  const barRow = {...rail(), id: 'bar', name: 'BD-134 35アッシュ丸棒 ディンプル付 Mオーク 4m', pieceLengthM: 4};
  assert.deepEqual(mids(withBrackets(withL, {...withL, rows: [{...barRow, qty: 1}]}, MATS)), []); // 部材リストから手すりを入れても
});

test('自分で入れた BD-01G は、見積書で手すりの数量を直すと中間の数に入れ直す。手で別の数にしたらそのまま。900mm までにしたら 0（行は消さない）', () => {
  const mid = (qty = 1): Row => ({...materialRow(MID_G, qty), id: 'mid'});
  let j = applySheet(job1(place([rail(), mid(), bracket])), 'line:rail:qty', '1.2', sheet).job; // 2400mm
  assert.deepEqual(mids(j.places[0]), [['BD-01G', 2]]);
  j = applySheet(j, 'line:rail:qty', '1800mm', sheet).job;
  assert.deepEqual(mids(j.places[0]), [['BD-01G', 1]]);
  // 申請書の長さ（L=1800）があれば、まるごとの1本を発注していても、取り付ける 1800mm の手すりの数（1個）
  const barRow = {...rail(), id: 'bar', name: 'BD-134 35アッシュ丸棒 ディンプル付 Mオーク 4m', pieceLengthM: 4};
  const withL = place([], {dims: {l: '1800'}});
  assert.deepEqual(mids(withBrackets(withL, {...withL, rows: [{...barRow, qty: 1}, mid(0)]}, MATS)), [['BD-01G', 1]]);
  // 使う長さの行を、まるごとの1本にしたら（長さが分からなくなったら）中間の数にしてある BD-01G は 0
  let back = applySheet(job1(place([barRow, mid()])), 'line:bar:qty', '2400mm', sheet).job;
  assert.deepEqual(mids(back.places[0]), [['BD-01G', 2]]);
  back = applySheet(back, 'line:bar:qty', '1', sheet).job;
  assert.deepEqual(mids(back.places[0]), [['BD-01G', 0]]);
  // 手で3個にしたら、手すりの長さを変えても3個のまま
  j = applySheet(j, 'line:mid:qty', '3', sheet).job;
  j = applySheet(j, 'line:rail:qty', '2400mm', sheet).job;
  assert.deepEqual(mids(j.places[0]), [['BD-01G', 3]]);
  // 900mm までの手すりにしたら数を 0 に（行は消さない）。また長くすると中間の数に戻る
  let k = applySheet(job1(place([rail(), mid(), bracket])), 'line:rail:qty', '2400mm', sheet).job;
  k = applySheet(k, 'line:rail:qty', '900mm', sheet).job;
  assert.deepEqual(mids(k.places[0]), [['BD-01G', 0]]);
  k = applySheet(k, 'line:rail:qty', '1800mm', sheet).job;
  assert.deepEqual(mids(k.places[0]), [['BD-01G', 1]]);
  k = applySheet(job1(place([rail(), mid(), bracket])), 'line:rail:qty', '2400mm', sheet).job;
  k = applySheet(k, 'line:mid:price', '777', sheet).job;
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
  // 600mm だけなら要らないので数は 0 のまま（行は消さない。2026-11-04 から）
  const short = place([], {dims: {l: '600'}});
  assert.deepEqual(mids(withBrackets(short, fillAdded({...short, rows: kit}, ids), MATS)), [['BD-01G', 0]]);
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

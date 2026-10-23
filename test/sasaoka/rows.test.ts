import assert from 'node:assert/strict';
import test from 'node:test';
import {addMaterial, insertRowsAt, kitFromRows, kitRows, laborCount, laborRange, laborRow, laborSpot, manualRow, materialRow, removeOneMaterial, replaceRange, setLaborCount, workRange} from '../../src/sasaoka/rows.ts';
import type {LaborItem, Material} from '../../src/sasaoka/types.ts';

const wood: LaborItem = {id: 'l01', name: '木', price: 1000, estPrice: null, note: ''};
const tile: LaborItem = {id: 'l02', name: 'タイル', price: 1500, estPrice: null, note: ''};
const rail: Material = {
  id: 'm1',
  name: '木製手すり 4m',
  price: 10000,
  listPrice: 20000,
  pieceLengthM: 4,
  maker: 'マツ六',
  code: 'TS-35',
  unit: '本',
  favorite: true,
  updatedAt: 1,
};
const bracket: Material = {...rail, id: 'm2', name: 'ブラケット', price: 1500, listPrice: 2100, pieceLengthM: 0, code: 'BK', unit: '個'};

test('materialRow は仕切り価格・定価・1本の長さを書き写す', () => {
  const r = materialRow(rail, 2);
  assert.deepEqual(
    [r.kind, r.refId, r.price, r.listPrice, r.pieceLengthM, r.unit, r.qty, r.lengthCm, r.estPrice],
    ['material', 'm1', 10000, 20000, 4, '本', 2, 0, null],
  );
});

test('setLaborCount：増やすと同じ手間の一番下の行に足し、なければ最後に1行入れる', () => {
  let rows = [materialRow(rail)];
  rows = setLaborCount(rows, wood, 2);
  assert.deepEqual(rows.map((r) => [r.name, r.qty]), [['木製手すり 4m', 1], ['木', 2]]);
  rows = setLaborCount(rows, wood, 3);
  assert.deepEqual(rows.map((r) => [r.name, r.qty]), [['木製手すり 4m', 1], ['木', 3]]);
  rows = setLaborCount(rows, wood, 0);
  assert.deepEqual(rows.map((r) => r.name), ['木製手すり 4m']);
});

test('setLaborCount：部材ごとに分けた手間（同上施工費）の行はまとめない', () => {
  // 手すり（木×2）・L型手すり（木×1）
  const rows = [materialRow(rail), laborRow(wood, 2), materialRow(bracket), laborRow(wood, 1)];
  assert.equal(laborCount(rows, 'l01'), 3);
  const more = setLaborCount(rows, wood, 4);
  assert.deepEqual(more.map((r) => [r.name, r.qty]), [['木製手すり 4m', 1], ['木', 2], ['ブラケット', 1], ['木', 2]]);
  const less = setLaborCount(rows, wood, 1);
  assert.deepEqual(less.map((r) => [r.name, r.qty]), [['木製手すり 4m', 1], ['木', 1], ['ブラケット', 1]]);
});

test('workRange・replaceRange：部材のすぐ下の手間だけを数え直す', () => {
  const rows = [materialRow(rail), laborRow(wood, 2), materialRow(bracket), laborRow(tile, 1)];
  assert.deepEqual(workRange(rows, 0), [1, 2]);
  assert.deepEqual(workRange(rows, 2), [3, 4]);
  // ブラケットの施工費に木を1つ足す（手すりの施工費は変えない）
  const range = workRange(rows, 2);
  const next = replaceRange(rows, range, setLaborCount(rows.slice(...range), wood, 1));
  assert.deepEqual(next.map((r) => [r.name, r.qty]), [['木製手すり 4m', 1], ['木', 2], ['ブラケット', 1], ['タイル', 1], ['木', 1]]);
  // 手間のない部材（すぐ下が部材）には、その部材のすぐ下に入る
  const r2 = [materialRow(rail), materialRow(bracket)];
  const range2 = workRange(r2, 0);
  assert.deepEqual(range2, [1, 1]);
  assert.deepEqual(replaceRange(r2, range2, setLaborCount([], wood, 2)).map((r) => r.name), ['木製手すり 4m', '木', 'ブラケット']);
});

test('見積書で選んでいる（タップしている）行のところに入れる：空白の行なら入れ替え、ほかの行ならその部材と同上施工費のすぐ下。選んでいなければいちばん下', () => {
  const blankRow = manualRow('material');
  const rows = [materialRow(rail), laborRow(wood, 2), blankRow, materialRow(bracket)];
  const names = (rs: typeof rows) => rs.map((r) => r.name || '（空白）');
  const pipe = materialRow({...bracket, id: 'm3', name: '手すり受け'});
  assert.deepEqual(names(insertRowsAt(rows, [pipe], blankRow.id)), ['木製手すり 4m', '木', '手すり受け', 'ブラケット']); // 空白の行と入れ替え
  assert.deepEqual(names(insertRowsAt(rows, [pipe], rows[0].id)), ['木製手すり 4m', '木', '手すり受け', '（空白）', 'ブラケット']); // 部材を選んでいたら、同上施工費のすぐ下
  assert.deepEqual(names(insertRowsAt(rows, [pipe], rows[1].id)), ['木製手すり 4m', '木', '手すり受け', '（空白）', 'ブラケット']); // 同上施工費を選んでいても同じ
  assert.deepEqual(names(insertRowsAt(rows, [pipe], null)), ['木製手すり 4m', '木', '（空白）', 'ブラケット', '手すり受け']); // 選んでいなければいちばん下
  // 部材リストから入れる：同じ部材があれば数が増えるだけ（どこを選んでいても）
  const more = addMaterial(rows, materialRow(bracket), blankRow.id);
  assert.deepEqual([names(more), more[3].qty], [names(rows), 2]);
  assert.deepEqual(names(addMaterial(rows, pipe, blankRow.id)), ['木製手すり 4m', '木', '手すり受け', 'ブラケット']);
});

test('施工費を入れる所（見積書で選んでいる行）：部材ならその同上施工費、同上施工費ならそのまとまり、空白の行ならその行に入って同上施工費になる', () => {
  const blankRow = manualRow('material');
  const rows = [materialRow(rail), laborRow(wood, 2), blankRow, materialRow(bracket), laborRow(tile, 1)];
  const range = (id: string | null) => laborRange(rows, laborSpot(rows, id));
  assert.deepEqual(range(rows[0].id), [1, 2]); // 手すり → その同上施工費
  assert.deepEqual(range(rows[1].id), [1, 2]); // 手すりの同上施工費を選んでいても同じ
  assert.deepEqual(range(rows[3].id), [4, 5]); // ブラケット
  assert.deepEqual(range(rows[4].id), [4, 5]);
  assert.deepEqual(range(null), [0, 5]); // 選んでいなければ箇所の全部
  // 空白の行：その行に入れる（空白の行はなくなり、すぐ上の手すりの同上施工費にまとまる）
  const spot = laborSpot(rows, blankRow.id);
  assert.deepEqual(spot, {whole: false, owner: rows[0].id, drop: blankRow.id});
  const r = laborRange(rows, spot);
  assert.deepEqual(r, [1, 3]);
  const counted = rows.slice(...r).filter((x) => x.id !== blankRow.id);
  const next = replaceRange(rows, r, setLaborCount(counted, tile, 1));
  assert.deepEqual(next.map((x) => [x.name, x.qty]), [['木製手すり 4m', 1], ['木', 2], ['タイル', 1], ['ブラケット', 1], ['タイル', 1]]);
  // 入れたあと（空白の行がない）も同じ所を数える
  assert.deepEqual(laborRange(next, spot), [1, 3]);
  // 箇所のはじめの空白の行・施工費：箇所のはじめの施工費（いちばん下には入れない）
  const top = [blankRow, materialRow(bracket)];
  assert.deepEqual(laborRange(top, laborSpot(top, blankRow.id)), [0, 1]);
  const lead = [laborRow(wood, 1), materialRow(bracket)];
  assert.deepEqual(laborRange(lead, laborSpot(lead, lead[0].id)), [0, 1]);
});

test('部材＋施工費（常用）：登録したときの行を、今の仕切り価格・定価・手間の単価で入れる', () => {
  const kit = kitFromRows(' 玄関の一式 ', [{...materialRow(rail), lengthCm: 60}, laborRow(wood, 2), materialRow(bracket, 2)]);
  assert.equal(kit.name, '玄関の一式');
  const newer = [{...rail, price: 11000, listPrice: 22000}, bracket];
  const rows = kitRows(kit, newer, [{...wood, price: 1200}, tile]);
  assert.deepEqual(rows.map((r) => [r.name, r.price, r.listPrice, r.qty, r.lengthCm]), [
    ['木製手すり 4m', 11000, 22000, 1, 60],
    ['木', 1200, 0, 2, 0],
    ['ブラケット', 1500, 2100, 2, 0],
  ]);
  // 行のIDは毎回付け直す（同じものを2回入れても別の行）
  assert.notEqual(rows[0].id, kit.rows[0].id);
  assert.notEqual(kitRows(kit, newer, [wood])[0].id, rows[0].id);
  // 部材リストから消えた部材は、登録したときの単価のまま
  assert.equal(kitRows(kit, [], [])[0].price, 10000);
});

test('部材を選ぶ画面の −：0 になったら部材を消す。上が施工費なら同上施工費も一緒に消す（見積書と請求書が合わなくなっていた）。上が部材ならその同上施工費として残す', () => {
  const end: Material = {...bracket, id: 'm3', name: 'エンド', code: 'EN'};
  // ブラケット＋同上施工費、手すり＋同上施工費：手すりを消すと手すりの同上施工費も消える
  const bw = laborRow(wood, 2);
  let rows = removeOneMaterial([materialRow(bracket, 2), bw, materialRow(rail, 1), laborRow(wood, 1)], rail.id);
  assert.deepEqual(rows.map((r) => r.name), ['ブラケット', '木']);
  assert.equal(rows[1], bw);
  // 手すり・ブラケット・エンドのあとの施工費：エンドを消しても施工費は残る（ブラケットの同上施工費になる）
  rows = removeOneMaterial([materialRow(rail, 1), materialRow(bracket, 2), materialRow(end, 1), laborRow(tile, 1)], end.id);
  assert.deepEqual(rows.map((r) => r.name), ['木製手すり 4m', 'ブラケット', 'タイル']);
  // 1つ減らすだけなら数量
  rows = removeOneMaterial([materialRow(bracket, 2), laborRow(wood, 1)], bracket.id);
  assert.deepEqual(rows.map((r) => [r.name, r.qty]), [['ブラケット', 1], ['木', 1]]);
});

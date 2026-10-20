import assert from 'node:assert/strict';
import test from 'node:test';
import {kitFromRows, kitRows, laborCount, laborRow, materialRow, replaceRange, setLaborCount, workRange} from '../../src/sasaoka/rows.ts';
import type {LaborItem, Material} from '../../src/sasaoka/types.ts';

const wood: LaborItem = {id: 'l01', name: '木', price: 1000, note: ''};
const tile: LaborItem = {id: 'l02', name: 'タイル', price: 1500, note: ''};
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

// 平面図の頂点の編集（ユーザーの指示「頂点で編集できるようにもする。頂点の編集も上におく。色んな形の図形を後付けでつくれる」2026-11-10）
import assert from 'node:assert/strict';
import test from 'node:test';
import {canVertexEdit, handlesOf, moved, resized, turnedItem, walls} from '../../src/sasaoka/madori/edit.ts';
import type {MItem} from '../../src/sasaoka/madori/model.ts';
import {bounds} from '../../src/sasaoka/madori/model.ts';
import {isOrtho, labelSpot, inPoly, pointRemoved, polyEdges} from '../../src/sasaoka/madori/poly.ts';
import {floorSvg} from '../../src/sasaoka/madori/render.ts';
import {shapeToPts} from '../../src/sasaoka/madori/shapes.ts';

const box: MItem = {id: 's', kind: 'shape', type: '四角', x: 1000, y: 1000, w: 1800, h: 900};

test('図形を頂点にする：四角は四隅、矢印は角、丸は 12 の点のなめらかな線。回した向きも頂点に入れる', () => {
  assert.deepEqual(shapeToPts(box), {pts: [{x: 1000, y: 1000}, {x: 2800, y: 1000}, {x: 2800, y: 1900}, {x: 1000, y: 1900}], curve: false});
  assert.equal(shapeToPts({...box, type: '右矢印'}).pts.length, 7);
  const round = shapeToPts({...box, type: '丸'});
  assert.equal(round.pts.length, 12);
  assert.equal(round.curve, true);
  // 90°回した四角：囲む四角は縦長（まん中は同じ）
  const t = shapeToPts({...box, rot: 90});
  const xs = t.pts.map((p) => p.x);
  const ys = t.pts.map((p) => p.y);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [1450, 2350, 550, 2350]);
  assert.equal(canVertexEdit(box), true);
  assert.equal(canVertexEdit({...box, type: '矢印'}), false); // 線の図形は両端のつまみ
  assert.equal(canVertexEdit({id: 'r', kind: 'room', x: 0, y: 0, w: 910, h: 910}), true);
  assert.equal(canVertexEdit({id: 'n', kind: 'num', x: 0, y: 0, w: 0, h: 0}), false);
});

test('頂点の編集：角だけを動かす・辺のまん中で角を足す・角を消す（3つまで）。ふだんは囲む四角でのびちぢみ', () => {
  const it: MItem = {...box, ...shapeToPts(box)};
  const hs = handlesOf(it, true);
  assert.deepEqual(hs.map((h) => h.h), ['v0', 'v1', 'v2', 'v3', 'e0', 'e1', 'e2', 'e3']);
  const a = resized(it, 'v1', {x: 3203, y: 602}, 455, true);
  assert.deepEqual(a.pts, [{x: 1000, y: 1000}, {x: 3200, y: 600}, {x: 2800, y: 1900}, {x: 1000, y: 1900}]);
  assert.deepEqual(bounds(a), {x: 1000, y: 600, w: 2200, h: 1300});
  const b = resized(a, 'e2', {x: 1900, y: 2400}, 455, true);
  assert.equal(b.pts?.length, 5);
  assert.deepEqual(b.pts?.[3], {x: 1900, y: 2400});
  // となりの角と横・縦に近ければそろえる（8° まで）
  const c = resized(it, 'v2', {x: 2830, y: 1950}, 455, true);
  assert.equal(c.pts?.[2].x, 2800);
  assert.deepEqual(pointRemoved(b.pts!, 0).length, 4);
  assert.deepEqual(pointRemoved(pointRemoved(it.pts!, 0), 0).length, 3);
  // ふだんのつまみ（四隅・四辺）は形のまま大きくする
  assert.deepEqual(handlesOf(a).map((h) => h.h), ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  const big = resized(a, 'e', {x: 5400, y: 1000}, 455);
  assert.equal(bounds(big).w, 4400);
  assert.equal(big.pts?.[1].x, 5400);
  // 動かす・回すと頂点も一緒に
  const mv = moved(a, {x: 100, y: 0}, [], 455);
  assert.deepEqual(mv.pts?.[0], {x: 1100, y: 1000});
  const tn = turnedItem(a, 455);
  assert.equal(tn.pts?.length, 4);
  assert.deepEqual([bounds(tn).w, bounds(tn).h], [1300, 2200]);
  // 絵：頂点のままの道（丸はなめらかな線）
  assert.match(floorSvg([a], {module: 910, showArea: false, showDims: false, nums: new Map()}), /<path d="M1000 1000L3200 600L2800 1900L1000 1900Z"/);
  const r = {...box, type: '丸', ...shapeToPts({...box, type: '丸'})};
  assert.match(floorSvg([r], {module: 910, showArea: false, showDims: false, nums: new Map()}), /<path d="M[^"]*C[^"]*Z"/);
});

test('ななめの辺のある部屋：ななめの辺は壁にしない・名前は部屋の中・ふだんは囲む四角のつまみ', () => {
  const pts = [{x: 0, y: 0}, {x: 3640, y: 0}, {x: 1820, y: 2730}];
  const room: MItem = {id: 'r', kind: 'room', type: '洋室', x: 0, y: 0, w: 3640, h: 2730, pts};
  assert.equal(isOrtho(pts), false);
  assert.equal(polyEdges(pts).length, 1);
  assert.equal(walls([room]).length, 1);
  const spot = labelSpot(pts);
  assert.ok(inPoly(spot, pts));
  assert.deepEqual(handlesOf(room).map((h) => h.h).slice(0, 3), ['nw', 'n', 'ne']);
  const v = handlesOf(room, true);
  assert.equal(v.filter((h) => h.h.startsWith('v')).length, 3);
});

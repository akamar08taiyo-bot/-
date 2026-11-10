import assert from 'node:assert/strict';
import test from 'node:test';
import {closed, edgeMoved, inPoly, labelSpot, orthoNext, polyArea, shapeOf, tidy, turnedPts, vertexMoved} from '../../src/sasaoka/madori/poly.ts';
import {handlesOf, hitTest, moved, resized, walls} from '../../src/sasaoka/madori/edit.ts';
import {cleanMadori, roomAreaOf} from '../../src/sasaoka/madori/model.ts';
import type {MItem} from '../../src/sasaoka/madori/model.ts';
import {floorSvg} from '../../src/sasaoka/madori/render.ts';

const M = 910;
// L 字：横 3 マス・縦 3 マスの右下 2×2 を欠いたもの
const L = [
  {x: 0, y: 0},
  {x: 3 * M, y: 0},
  {x: 3 * M, y: M},
  {x: M, y: M},
  {x: M, y: 3 * M},
  {x: 0, y: 3 * M},
];

test('多角形の広さ・中か・名前の場所（L 字の角の外に出さない）', () => {
  assert.equal(polyArea(L), 5 * M * M);
  assert.equal(inPoly({x: 100, y: 100}, L), true);
  assert.equal(inPoly({x: 2 * M, y: 2 * M}, L), false); // 欠いた所
  const s = labelSpot(L);
  assert.equal(inPoly(s, L), true);
});

test('頂点で描く：横・縦にそろえ、閉じるときに角を足す。四角になったら頂点は持たない', () => {
  assert.deepEqual(orthoNext({x: 0, y: 0}, {x: 900, y: 120}), {x: 900, y: 0});
  assert.deepEqual(orthoNext({x: 0, y: 0}, {x: 100, y: 800}), {x: 0, y: 800});
  // 0,0 → 3M,0 → 3M,2M で閉じると、0,2M を足して四角
  const sq = shapeOf(closed([{x: 0, y: 0}, {x: 3 * M, y: 0}, {x: 3 * M, y: 2 * M}]));
  assert.deepEqual(sq, {x: 0, y: 0, w: 3 * M, h: 2 * M});
  const l = shapeOf(L);
  assert.equal(l.pts?.length, 6);
  assert.deepEqual({x: l.x, y: l.y, w: l.w, h: l.h}, {x: 0, y: 0, w: 3 * M, h: 3 * M});
  assert.deepEqual(tidy([{x: 0, y: 0}, {x: 500, y: 0}, {x: 1000, y: 0}, {x: 1000, y: 800}, {x: 0, y: 800}]).length, 4); // 一直線の途中の点を除く
});

test('頂点・辺を動かす：となりも横・縦のまま。四角の部屋のつまみは今までどおり', () => {
  // 欠いた所の角（M,M）を（2M,2M）へ → 欠きが小さくなる
  const v = vertexMoved(L, 3, {x: 2 * M, y: 2 * M});
  assert.deepEqual(v[2], {x: 3 * M, y: 2 * M});
  assert.deepEqual(v[4], {x: 2 * M, y: 3 * M});
  assert.equal(polyArea(v), 8 * M * M);
  // 上の辺（0）を下へ 1 マス
  const e = edgeMoved(L, 0, {x: 0, y: -M});
  assert.equal(e[0].y, -M);
  assert.equal(e[1].y, -M);
  const room: MItem = {id: 'r', kind: 'room', type: '洋室', ...shapeOf(L)};
  const hs = handlesOf(room);
  assert.equal(hs.filter((h) => h.h.startsWith('v')).length, 6);
  assert.equal(hs.filter((h) => h.h.startsWith('e')).length, 6);
  const r2 = resized(room, 'v3', {x: 2 * M + 30, y: 2 * M - 20}, M / 2);
  assert.equal(roomAreaOf(r2, 910).jo, 4); // 8 マス＝4帖
  // 動かすと頂点も一緒に
  const mv = moved(room, {x: M, y: 0}, [room], M / 2);
  assert.deepEqual(mv.pts?.[0], {x: M, y: 0});
  // 回す
  assert.equal(polyArea(turnedPts(L, M / 2)), polyArea(L));
  // 欠いた所は押しても部屋でない・壁は辺ごと
  assert.equal(hitTest([room], {x: 2 * M, y: 2 * M}, 10), null);
  assert.equal(hitTest([room], {x: 300, y: 2 * M}, 10)?.id, 'r');
  assert.equal(walls([room]).length, 6);
});

test('読み込み・絵：多角形の部屋の頂点を残し、道で塗る', () => {
  const m = cleanMadori({floors: [{items: [{id: 'r', kind: 'room', type: '和室', x: 0, y: 0, w: 1, h: 1, pts: [...L, {x: 'bad'}]}]}]})!;
  const r = m.floors[0].items[0];
  assert.equal(r.pts?.length, 6);
  assert.equal(r.w, 3 * M);
  const svg = floorSvg([r], {module: 910, showArea: true, showDims: false, nums: new Map(), pid: 't'});
  assert.match(svg, /<path d="M0 0L2730 0L2730 910L910 910L910 2730L0 2730Z" fill="#e3f6e8"/);
  assert.match(svg, /clip-path="url\(#t-c-r\)"/); // 畳割りを形で切り抜く
  assert.match(svg, />2\.5帖</);
});

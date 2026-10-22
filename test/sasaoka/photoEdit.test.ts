import assert from 'node:assert/strict';
import test from 'node:test';
import {cleanEdit, clampScale, normRot, PHOTO_MIN_SCALE, ROT_SNAP, turn} from '../../src/sasaoka/photoEdit.ts';
import {photoFit, photoPlacement, photoSlack} from '../../src/sasaoka/shinsei.ts';

test('写真の向き：0〜360°、回している途中は 90°の近く（7°以内）にそろう。↻・↺ は 90°ずつ（斜めならそろえてから）', () => {
  assert.deepEqual([normRot(0), normRot(90), normRot(360), normRot(450), normRot(-90), normRot(359.99), normRot(NaN)], [0, 90, 0, 90, 270, 0, 0]);
  assert.deepEqual([normRot(85, ROT_SNAP), normRot(95, ROT_SNAP), normRot(80, ROT_SNAP), normRot(-4, ROT_SNAP), normRot(30, ROT_SNAP)], [90, 90, 80, 0, 30]);
  assert.deepEqual(turn(undefined, 1), {rot: 90, scale: 1});
  assert.deepEqual(turn({rot: 270, scale: 0.5}, 1), {rot: 0, scale: 0.5});
  assert.deepEqual(turn({rot: 0, scale: 1}, -1), {rot: 270, scale: 1});
  assert.deepEqual(turn({rot: 30, scale: 1}, 1), {rot: 90, scale: 1}); // 30° → そろえて 0° → 90°
});

test('写真の大きさ：0.2〜1（枠より大きくしない）。そのまま（0°・1）なら持たない', () => {
  assert.deepEqual([clampScale(2), clampScale(0.5), clampScale(0), clampScale(NaN)], [1, 0.5, PHOTO_MIN_SCALE, 1]);
  assert.equal(cleanEdit({rot: 0, scale: 1}), undefined);
  assert.equal(cleanEdit(undefined), undefined);
  assert.deepEqual(cleanEdit({rot: 720.04, scale: 0.12345}), {rot: 0, scale: 0.2});
  assert.deepEqual(cleanEdit({rot: 90}), {rot: 90, scale: 1});
});

test('写真を枠に置く位置：そのままなら今までと同じ。回すと回したあとの形で枠に収め、縮めるとまん中のまま小さく', () => {
  const frame = {x: 10, y: 20, w: 500, h: 300};
  const plain = photoPlacement(frame, 1600, 1200);
  assert.deepEqual({...photoFit(frame, 1600, 1200)}, {x: plain.x, y: plain.y, w: plain.w, h: plain.h});
  assert.equal(plain.rot, 0);
  // 横長の写真を 90°回す：回したあと（縦長）の高さが枠の高さ（−余白）に収まる
  const r = photoPlacement(frame, 1600, 1200, {rot: 90, scale: 1});
  assert.equal(r.rot, 90);
  assert.ok(Math.abs(r.w - 292) < 1e-6 && Math.abs(r.h - 219) < 1e-6, `${r.w}×${r.h}`);
  assert.ok(Math.abs(r.x + r.w / 2 - 260) < 1e-6 && Math.abs(r.y + r.h / 2 - 170) < 1e-6); // まん中は枠のまん中
  // 半分の大きさ：まん中はそのまま
  const half = photoPlacement(frame, 1600, 1200, {rot: 0, scale: 0.5});
  assert.ok(Math.abs(half.w - plain.w / 2) < 1e-6 && Math.abs(half.h - plain.h / 2) < 1e-6);
  assert.ok(Math.abs(half.x + half.w / 2 - (plain.x + plain.w / 2)) < 1e-6);
  // 斜め（30°）に回しても、写真の四隅は枠の中（枠より大きくならない）
  for (const rot of [30, 45, 135, 200, 333]) {
    const b = photoPlacement(frame, 1600, 900, {rot, scale: 1});
    const t = (rot * Math.PI) / 180;
    const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const [px, py] = [(dx * b.w) / 2, (dy * b.h) / 2];
      const [x, y] = [cx + px * Math.cos(t) - py * Math.sin(t), cy + px * Math.sin(t) + py * Math.cos(t)];
      assert.ok(x >= frame.x + 3.99 && x <= frame.x + frame.w - 3.99 && y >= frame.y + 3.99 && y <= frame.y + frame.h - 3.99, `${rot}° (${x}, ${y})`);
    }
  }
});

test('写真の位置（ユーザーの指示「写真の位置の調整をおこなえるようにする」2026-10-22）：−1〜1、まん中は持たない。回しても位置はそのまま', () => {
  assert.deepEqual(cleanEdit({rot: 0, scale: 0.5, x: 0.25, y: -2}), {rot: 0, scale: 0.5, x: 0.25, y: -1});
  assert.deepEqual(cleanEdit({rot: 0, scale: 1, x: 0, y: 0}), undefined);
  assert.deepEqual(cleanEdit({rot: 0, scale: 1, x: 0.5}), {rot: 0, scale: 1, x: 0.5});
  assert.deepEqual(turn({rot: 0, scale: 0.5, x: 1}, 1), {rot: 90, scale: 0.5, x: 1});
  // 置く位置：空き（枠の余白の内側と写真の差）の中で動く。端まで動かしても枠からはみ出さない
  const frame = {x: 0, y: 0, w: 408, h: 308};
  const mid = photoPlacement(frame, 400, 300, {rot: 0, scale: 0.5});
  assert.deepEqual([mid.x, mid.y, mid.w, mid.h], [104, 79, 200, 150]);
  assert.deepEqual(photoSlack(frame, 400, 300, {rot: 0, scale: 0.5}), {sx: 200, sy: 150});
  const left = photoPlacement(frame, 400, 300, {rot: 0, scale: 0.5, x: -1, y: 1});
  assert.deepEqual([left.x, left.y], [4, 154]); // 左の端（余白 4）・下の端（308−4−150）
  // 枠いっぱいの写真は動かない（空きがない）
  const full = photoPlacement(frame, 400, 300, {rot: 0, scale: 1, x: 1, y: 1});
  assert.deepEqual([full.x, full.y], [4, 4]);
});

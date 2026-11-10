// 1つの写真の枠に写真を足して並べる（ユーザーの指示「追加で写真を追加できる機能もつける」2026-10-29。photoTile.ts・photoMarks.ts の marksIntoTile）
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {marksBetween, marksIntoTile} from '../../src/sasaoka/photoMarks.ts';
import {cleanJobs} from '../../src/sasaoka/storage.ts';
import {bestTiling, tilings} from '../../src/sasaoka/photoTile.ts';
import type {PhotoMark} from '../../src/sasaoka/types.ts';

/** 枠（幅 fw・高さ fh の画素）に w×h の絵を収めたときの倍率 */
const frame = (fw: number, fh: number) => (w: number, h: number) => Math.min(fw / w, fh / h);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('並べ方：どの並べ方でも、写真は並べた絵の中に収まり、重ならない・形（縦横の比）はそのまま', () => {
  const aspects = [0.75, 1.333, 0.6, 1];
  for (const n of [2, 3, 4]) {
    for (const t of tilings(aspects.slice(0, n))) {
      assert.equal(t.rects.length, n);
      t.rects.forEach((r, i) => {
        assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9, JSON.stringify(r));
        assert.ok(Math.abs((r.w * t.w) / (r.h * t.h) - aspects[i]) < 1e-6, `形 ${i}`);
        for (const q of t.rects.slice(i + 1)) assert.ok(r.x + r.w <= q.x + 1e-9 || q.x + q.w <= r.x + 1e-9 || r.y + r.h <= q.y + 1e-9 || q.y + q.h <= r.y + 1e-9, '重ならない');
      });
    }
  }
});

test('横に長い枠（北九州市の完了報告書の改修後）に縦の写真を2枚：横に並べる。縦に長い枠に横の写真2枚：縦に並べる', () => {
  const wide = bestTiling([0.75, 0.75], frame(600, 330));
  assert.ok(wide.w > wide.h, '横に並べる');
  assert.ok(wide.rects[1].x > wide.rects[0].x + wide.rects[0].w - 1e-9);
  const tall = bestTiling([1.333, 1.333], frame(330, 600));
  assert.ok(tall.h > tall.w, '縦に並べる');
  assert.ok(tall.rects[1].y > tall.rects[0].y);
});

/** 並べた絵の中の写真 i の見える面積（枠に入れたあとの画素²） */
const areaOf = (t: ReturnType<typeof bestTiling>, i: number, fit: (w: number, h: number) => number) => {
  const k = fit(t.w, t.h);
  return t.rects[i].w * t.w * k * t.rects[i].h * t.h * k;
};

test('メインの写真（1枚目）はいつもいちばん大きく、ほかは小さくてよい（ユーザーの指示「メインの写真は1枚必ず、その他は小さくても良い」2026-11-10）', () => {
  for (const aspects of [[0.75, 1.333], [1.333, 0.75, 0.75], [0.75, 1.333, 1.333, 0.6], [1, 1, 1]]) {
    for (const f of [frame(600, 330), frame(330, 600), frame(500, 400)]) {
      const t = bestTiling(aspects, f);
      const main = areaOf(t, 0, f);
      for (let i = 1; i < aspects.length; i++) assert.ok(areaOf(t, i, f) <= main + 1e-6, `${aspects} の ${i}枚目はメインより大きくない`);
    }
  }
});

test('2枚：縦に並べる（四角に近い枠の横の写真2枚）。横に長い枠に縦の写真2枚のように、横に並べた方がずっと大きく見えるときだけ横（臨機応変）', () => {
  const two = bestTiling([1.333, 1.333], frame(500, 400));
  assert.ok(two.rects[1].y > two.rects[0].y + two.rects[0].h - 1e-9, '2枚目はメインの下');
  const side = bestTiling([0.75, 0.75], frame(500, 400));
  assert.ok(side.rects[1].x > side.rects[0].x + side.rects[0].w - 1e-9, '縦の写真2枚は横に');
});

test('3枚：縦の写真はメインを左に大きく・右に2枚を縦に。横の写真はメインを上に大きく・下に2枚を横に（ユーザーの指示「縦1枚と横に2枚並べる（臨機応変）」）', () => {
  const tall = bestTiling([0.75, 0.75, 0.75], frame(500, 400));
  const [m, a, b] = tall.rects;
  assert.ok(a.x >= m.x + m.w - 1e-9 && b.x >= m.x + m.w - 1e-9, `右に ${JSON.stringify(tall.rects)}`);
  assert.ok(b.y >= a.y + a.h - 1e-9, '右の2枚は上下');
  assert.ok(near(m.h, 1), 'メインは高さいっぱい');
  const wide = bestTiling([1.333, 1.333, 1.333], frame(500, 400));
  const [m2, c, d] = wide.rects;
  assert.ok(c.y >= m2.y + m2.h - 1e-9 && d.y >= m2.y + m2.h - 1e-9, `下に ${JSON.stringify(wide.rects)}`);
  assert.ok(d.x >= c.x + c.w - 1e-9, '下の2枚は左右');
  assert.ok(near(m2.w, 1), 'メインは幅いっぱい');
  // 4枚：メインと、ほかの3枚を下か右に
  const four = bestTiling([1.333, 1.333, 1.333, 1.333], frame(500, 400));
  assert.ok(four.rects.slice(1).every((r) => r.y >= four.rects[0].y + four.rects[0].h - 1e-9), JSON.stringify(four.rects));
});

test('書き込みは並べた絵の中のもとの写真の所に移す（写真の同じ所）。文字は写真が小さくなった分だけ小さく、線の太さはそのまま', () => {
  const m: PhotoMark = {id: 'a', kind: 'text', x1: 0.5, y1: 0.25, x2: 1, y2: 0.5, line: '', width: 1.5, dash: 'solid', fill: '', text: 'L=600mm', size: 14, color: '000000'};
  const line: PhotoMark = {...m, id: 'b', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, text: undefined};
  const [t, l] = marksIntoTile([m, line], {x: 0, y: 0, w: 0.5, h: 1}, 0.5);
  assert.deepEqual([t.x1, t.y1, t.x2, t.y2], [0.25, 0.25, 0.5, 0.5]);
  assert.equal(t.size, 7);
  assert.equal(t.width, 1.5);
  assert.deepEqual([l.x1, l.y1, l.x2, l.y2], [0, 0, 0.5, 1]);
  // 右に置いたとき・大きくはしない
  const [r] = marksIntoTile([m], {x: 0.5, y: 0.1, w: 0.5, h: 0.8}, 1.4);
  assert.deepEqual([r.x1, r.y1, r.x2, r.y2, r.size], [0.75, 0.3, 1, 0.5, 14]);
});

test('もう一度足して並べ直すとき：書き込みは前に並べた写真の中の場所から、新しく並べた写真の中の同じ写真の場所へ', () => {
  const m: PhotoMark = {id: 'a', kind: 'rect', x1: 0.6, y1: 0.2, x2: 0.8, y2: 0.6, line: 'FF0000', width: 2, dash: 'solid', fill: '', size: 11, color: '000000'};
  // 前は右半分（x 0.5〜1）にあった写真が、新しい並べ方では左上（x 0〜0.5・y 0〜0.5）に
  const [r] = marksBetween([m], {x: 0.5, y: 0, w: 0.5, h: 1}, {x: 0, y: 0, w: 0.5, h: 0.5}, 0.5);
  assert.deepEqual([r.x1, r.y1, r.x2, r.y2], [0.1, 0.1, 0.3, 0.3]);
  assert.equal(r.size, 5.5);
});

test('並べたもとの写真（Place.photoTiles）：2〜4枚で、番号・向き・場所の数がそろったものだけ読む', () => {
  const tiles = {of: 'ph-new', ids: ['ph-1', 'ph-2'], rots: [90, 0], rects: [[0, 0, 0.49, 1], [0.51, 0, 0.49, 1]]};
  const [j] = cleanJobs([
    {
      places: [
        {name: '玄関', photos: {after: 'ph-new'}, photoTiles: {after: tiles, before: {...tiles, ids: ['ph-1']}}},
        {name: 'トイレ', photoTiles: {after: {...tiles, rects: [[0, 0, 2, 1], [0.5, 0, 0.5, 1]]}}},
      ],
    },
  ]);
  assert.deepEqual(j.places[0].photoTiles, {after: tiles});
  assert.equal(j.places[1].photoTiles, undefined);
});

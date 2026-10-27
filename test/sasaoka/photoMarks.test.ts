import assert from 'node:assert/strict';
import test from 'node:test';
import {arrowHead, cleanMarks, cmToPx, colorName, dashArray, lineEnds, markBounds, photoBounds, pxToCm, rotatedBounds, shapeBox, turnMarks} from '../../src/sasaoka/photoMarks.ts';
import type {PhotoMark} from '../../src/sasaoka/types.ts';

const base = {line: 'FF0000', width: 2.25, dash: 'solid', fill: '', size: 11, color: '000000'} as const;
const mk = (m: Partial<PhotoMark> & Pick<PhotoMark, 'kind' | 'x1' | 'y1' | 'x2' | 'y2'>): PhotoMark => ({id: m.kind, ...base, ...m});
const near = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≒ ${b}`);

test('写真への書き込みの位置：写真の見えている四角（回したあとの外側の四角）の中の割合。cm は Excel のサイズの欄と同じ（96dpi）', () => {
  // 横 400・縦 300 の写真を 90°回すと、見えている四角は横 300・縦 400（まん中は同じ）
  assert.deepEqual(photoBounds({x: 100, y: 50, w: 400, h: 300, rot: 90}), {x: 150, y: 0, w: 300, h: 400});
  const b45 = rotatedBounds({x: 0, y: 0, w: 100, h: 100}, 45);
  near(b45.w, 141.421);
  const vb = {x: 10, y: 20, w: 200, h: 100};
  assert.deepEqual(lineEnds(mk({kind: 'line', x1: 0, y1: 1, x2: 0.5, y2: 0}), vb), {x1: 10, y1: 120, x2: 110, y2: 20});
  const sb = shapeBox(mk({kind: 'rect', x1: 0.6, y1: 0.8, x2: 0.1, y2: 0.2, rot: 30}), vb);
  [sb.x, sb.y, sb.w, sb.h, sb.rot].forEach((v, i) => near(v, [30, 40, 100, 60, 30][i]));
  assert.deepEqual(markBounds(mk({kind: 'line', x1: 0.5, y1: 1, x2: 0, y2: 0}), vb), {x: 10, y: 20, w: 100, h: 100});
  near(cmToPx(2.54), 96);
  near(pxToCm(cmToPx(3.7)), 3.7);
  assert.equal(colorName('FF0000'), '赤');
  assert.equal(colorName('4472C4'), '青、アクセント 1');
  assert.equal(colorName('D9E1F2'), '青、アクセント 1、白 + 基本色 80%');
  assert.equal(colorName('123456'), '#123456');
});

test('線の種類（Excel の実線／点線）と矢印の先（線の太さの3倍の三角。線は三角の根元まで）', () => {
  assert.deepEqual(dashArray('solid', 3), {cap: 'butt'});
  assert.deepEqual(dashArray('dash', 3), {array: '12 9', cap: 'butt'});
  assert.deepEqual(dashArray('lgDashDotDot', 2), {array: '16 6 2 6 2 6', cap: 'butt'});
  assert.equal(dashArray('sysDot', 4).cap, 'round'); // 丸点線は丸い点
  const h = arrowHead({x: 100, y: 0}, {x: 0, y: 0}, 4);
  assert.deepEqual(h.base, {x: 88, y: 0});
  assert.deepEqual(h.points, [
    [100, 0],
    [88, 6],
    [88, -6],
  ]);
  // 細い線でも 1pt（4/3画素）の3倍。短い線では線の長さまで（両端なら半分まで）
  near(100 - arrowHead({x: 100, y: 0}, {x: 0, y: 0}, 0.5).base.x, 4);
  assert.equal(arrowHead({x: 10, y: 0}, {x: 0, y: 0}, 6, true).base.x, 5);
});

test('書き込みをそろえる：位置は 0〜1・色は大文字の RRGGBB・太さ 0.25〜24pt・同じ番号は付け直す。長さのない直線・文字のないテキストボックスは捨てる', () => {
  const out = cleanMarks([
    {id: 'a', kind: 'line', x1: -1, y1: 0.5, x2: 0.5, y2: 0.5, line: '#00b050', width: 99, dash: 'dash', start: true, fill: 'FFFFFF'},
    {id: 'a', kind: 'ellipse', x1: 0.5, y1: 0.5, x2: 0.1, y2: 0.1, width: 0, fill: 'ffff00', text: '踏み台', size: 'x', color: 'zz', bold: true},
    {id: 'c', kind: 'line', x1: 0.2, y1: 0.2, x2: 0.2, y2: 0.2},
    {id: 'd', kind: 'text', x1: 0, y1: 0, x2: 0.5, y2: 0.5, text: ''},
    null,
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {id: 'a', kind: 'line', x1: 0, y1: 0.5, x2: 0.5, y2: 0.5, line: '00B050', width: 24, dash: 'dash', start: true, fill: '', size: 11, color: '000000'});
  assert.notEqual(out[1].id, 'a');
  assert.deepEqual({...out[1], id: ''}, {id: '', kind: 'ellipse', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, line: '', width: 2.25, dash: 'solid', fill: 'FFFF00', text: '踏み台', size: 11, color: '000000', bold: true});
  assert.deepEqual(cleanMarks('x'), []);
});

test('写真を 90°回すと書き込みも一緒に回る：直線の端は (x, y) → (1−y, x)、四角形は縦横を入れかえ、テキストボックスは横書きのまま大きさを保つ。斜めはそのまま', () => {
  const photo = {w: 400, h: 300}; // 見えている四角の 幅÷高さ＝4/3（回す前）
  const line = mk({kind: 'line', x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.9});
  const rect = mk({kind: 'rect', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.5});
  const text = mk({kind: 'text', x1: 0.5, y1: 0.4, x2: 0.8, y2: 0.5, text: '手すり'});
  const [l, r, t] = turnMarks([line, rect, text], photo, 0, 90);
  assert.deepEqual([l.x1, l.y1, l.x2, l.y2], [0.8, 0.1, 0.1, 0.5]);
  // 四角形：まん中 (0.2, 0.3) → (0.7, 0.2)、幅と高さを入れかえ（0.2・0.4 → 0.4・0.2）
  [r.x1, r.y1, r.x2, r.y2].forEach((v, i) => near(v, [0.5, 0.1, 0.9, 0.3][i]));
  // テキストボックス：紙の上の大きさはそのまま（写真の画素で 幅 0.3×400＝120・高さ 0.1×300＝30 → 回したあとの写真は 300×400 なので 0.4・0.075）
  near(t.x2 - t.x1, 0.4);
  near(t.y2 - t.y1, 0.075);
  near((t.x1 + t.x2) / 2, 1 - 0.45);
  near((t.y1 + t.y2) / 2, 0.65);
  // 4回まわすと元に戻る・180°は点対称・斜めは変えない
  const back = turnMarks(turnMarks(turnMarks(turnMarks([line, rect, text], photo, 0, 90), photo, 90, 180), photo, 180, 270), photo, 270, 0);
  back.forEach((m, i) => (['x1', 'y1', 'x2', 'y2'] as const).forEach((k) => near(m[k], [line, rect, text][i][k])));
  const half = turnMarks([line], photo, 0, 180)[0];
  assert.deepEqual([half.x1, half.y1, half.x2, half.y2], [0.9, 0.8, 0.5, 0.1]);
  assert.equal(turnMarks([line], photo, 0, 30)[0], line);
  assert.equal(turnMarks([line], photo, 90, 90)[0], line);
});

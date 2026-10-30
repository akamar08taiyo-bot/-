import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arrowHead,
  BOARD_PTS,
  BOARD_STYLE,
  cleanMarks,
  cmToPx,
  colorName,
  dashArray,
  isScribble,
  lineEnds,
  MARK_FONTS,
  markBounds,
  markFontCss,
  markPts,
  markVertices,
  nextNumberText,
  PEN_STYLE,
  photoBounds,
  pxToCm,
  rotatedBounds,
  SHAPE_STYLE,
  shapeBox,
  simplifyStroke,
  turnMarks,
  withVertices,
} from '../../src/sasaoka/photoMarks.ts';
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
    {id: 'a', kind: 'ellipse', x1: 0.5, y1: 0.5, x2: 0.1, y2: 0.1, width: 0, fill: 'ffff00', text: '踏み台', size: 'x', color: 'zz', bold: true}, // 太さが読めなければ初めの 2pt
    {id: 'c', kind: 'line', x1: 0.2, y1: 0.2, x2: 0.2, y2: 0.2},
    {id: 'd', kind: 'text', x1: 0, y1: 0, x2: 0.5, y2: 0.5, text: ''},
    null,
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {id: 'a', kind: 'line', x1: 0, y1: 0.5, x2: 0.5, y2: 0.5, line: '00B050', width: 24, dash: 'dash', start: true, fill: '', size: 11, color: '000000'});
  assert.notEqual(out[1].id, 'a');
  assert.deepEqual({...out[1], id: ''}, {id: '', kind: 'ellipse', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, line: '', width: 2, dash: 'solid', fill: 'FFFF00', text: '踏み台', size: 11, color: '000000', bold: true});
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

test('手書きの線・補強板・番号の初めの書式：線・ペンは黄色、枠囲み（四角形）・補強板は茶色（ユーザーの指示「初期の色は黄色」「枠囲みの初期データは茶色」2026-10-29）', () => {
  assert.equal(SHAPE_STYLE.line, 'FFFF00');
  assert.equal(PEN_STYLE.line, 'FFFF00');
  assert.equal(BOARD_STYLE.line, '996633');
});

test('手書きの線・補強板をそろえる：点は 0〜1 に丸め、点が1つの手書きの線は捨てる。補強板の点がなければ左下から右上の斜め。手書きの線・補強板には文字を持たない', () => {
  const out = cleanMarks([
    {id: 'p', kind: 'pen', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.4, line: 'ffff00', width: 3, pts: [[0, 0], [0.5, 2], ['x', 0.3], [1, 1]], text: 'x'},
    {id: 'q', kind: 'pen', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.4, pts: [[0, 0]]},
    {id: 'b', kind: 'board', x1: 0.2, y1: 0.2, x2: 0.4, y2: 0.3, line: '996633', fill: 'ffffff'},
  ]);
  assert.deepEqual(out.map((m) => m.kind), ['pen', 'board']);
  assert.deepEqual(out[0].pts, [[0, 0], [0.5, 1], [0, 0.3], [1, 1]]);
  assert.equal(out[0].fill, '');
  assert.equal(out[0].text, undefined);
  assert.deepEqual(out[1].pts, BOARD_PTS);
  assert.equal(out[1].fill, 'FFFFFF');
  // 紙の上の点（回す前の四角の中の割合 → 画素）
  const vb = {x: 0, y: 0, w: 200, h: 100};
  assert.deepEqual(markPts(out[1], vb), [
    {x: 40, y: 30},
    {x: 80, y: 20},
  ]);
});

test('手書きの線を間引く：まっすぐな所の点は捨て、角の点は残す（見た目は同じ）', () => {
  const pts = [...Array.from({length: 21}, (_, i) => ({x: i * 5, y: 0})), ...Array.from({length: 20}, (_, i) => ({x: 100, y: (i + 1) * 5}))];
  assert.deepEqual(simplifyStroke(pts, 0.5), [
    {x: 0, y: 0},
    {x: 100, y: 0},
    {x: 100, y: 100},
  ]);
  assert.equal(simplifyStroke(pts.slice(0, 2), 0.5).length, 2);
});

test('ぐしゃぐしゃに描いた線か（上から消すしぐさ）：何度も折り返す線だけ。まっすぐ・L字・丸・小さな線はちがう', () => {
  const zigzag = Array.from({length: 12}, (_, i) => ({x: (i % 2) * 80 + i * 2, y: i * 4}));
  assert.equal(isScribble(zigzag), true);
  assert.equal(isScribble(Array.from({length: 20}, (_, i) => ({x: i * 10, y: 0}))), false); // まっすぐ
  assert.equal(isScribble([...Array.from({length: 10}, (_, i) => ({x: i * 10, y: 0})), ...Array.from({length: 10}, (_, i) => ({x: 90, y: i * 10}))]), false); // L字
  assert.equal(isScribble(Array.from({length: 40}, (_, i) => ({x: 50 + 40 * Math.cos(i / 6), y: 50 + 40 * Math.sin(i / 6)}))), false); // 丸
  assert.equal(isScribble(zigzag.map((p) => ({x: p.x / 10, y: p.y / 10}))), false); // 小さすぎる
});

test('次に置く番号：書き込みにある番号のいちばん大きい数の次（①②…⑳、その次は (21)）。番号でない文字は数えない', () => {
  const t = (text: string, kind: PhotoMark['kind'] = 'text') => mk({kind, x1: 0, y1: 0, x2: 0.1, y2: 0.1, text});
  assert.equal(nextNumberText([]), '①');
  assert.equal(nextNumberText([t('①'), t('③'), t('手すり')]), '④');
  assert.equal(nextNumberText([t('④', 'rect')]), '①'); // 四角形の中の文字は番号とみない
  assert.equal(nextNumberText([t('⑳')]), '(21)');
  assert.equal(nextNumberText([t('(21)')]), '(22)');
});

test('写真を 90°回すと、手書きの線・補強板は紙の上の大きさのまま図形ごと 90°回る（中の線も一緒に）', () => {
  const photo = {w: 400, h: 300};
  const pen = mk({kind: 'pen', x1: 0.3, y1: 0.4, x2: 0.6, y2: 0.5, pts: [[0, 0], [1, 1]]});
  const [p] = turnMarks([pen], photo, 0, 90);
  assert.equal(p.rot, 90);
  assert.deepEqual(p.pts, pen.pts);
  // 紙の上の大きさ（写真の画素）：幅 0.3×400＝120・高さ 0.1×300＝30 → 回したあとの写真（300×400）で 0.4・0.075
  near(p.x2 - p.x1, 0.4);
  near(p.y2 - p.y1, 0.075);
  const back = turnMarks(turnMarks(turnMarks([p], photo, 90, 180), photo, 180, 270), photo, 270, 0)[0];
  assert.equal(back.rot, undefined);
  (['x1', 'y1', 'x2', 'y2'] as const).forEach((k) => near(back[k], pen[k]));
});

test('文字のフォント：初めはメイリオ・30種類。知らないフォント・文字のない図形のフォントは捨てる。画面はそのフォント → 英語の名前 → 近いフォント', () => {
  assert.equal(MARK_FONTS.length, 30);
  assert.equal(MARK_FONTS[0].name, 'メイリオ');
  assert.equal(new Set(MARK_FONTS.map((f) => f.name)).size, 30);
  for (const st of [SHAPE_STYLE, PEN_STYLE, BOARD_STYLE]) assert.equal(st.font, 'メイリオ');
  const out = cleanMarks([
    {id: 't', kind: 'text', x1: 0, y1: 0, x2: 0.5, y2: 0.2, text: '手すり', font: 'HG丸ｺﾞｼｯｸM-PRO'},
    {id: 'u', kind: 'text', x1: 0, y1: 0, x2: 0.5, y2: 0.2, text: '手すり', font: 'ないフォント'},
    {id: 'l', kind: 'line', x1: 0, y1: 0, x2: 0.5, y2: 0.2, font: 'メイリオ'},
  ]);
  assert.deepEqual(out.map((m) => m.font), ['HG丸ｺﾞｼｯｸM-PRO', undefined, undefined]);
  assert.match(markFontCss('メイリオ')!, /^"メイリオ", "Meiryo", .*sans-serif$/);
  assert.match(markFontCss('ＭＳ 明朝')!, /^"ＭＳ 明朝", "MS Mincho", .*serif$/);
  assert.equal(markFontCss('ないフォント'), null);
});

test('頂点の編集：頂点の見えている位置（回した図形も）・1つ動かしてもほかの頂点は動かない・閉じた四角・頂点を足す／消す', () => {
  const V = {x: 0, y: 0, w: 1000, h: 800};
  const near = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;
  // 折れ線（開いた形）：x 100〜500・y 80〜400 の四角の中に3点
  const poly = {...base, id: 'p', kind: 'pen' as const, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, pts: [[0, 0], [1, 0.5], [0.25, 1]] as [number, number][]};
  const v0 = markVertices(poly, V);
  assert.equal(v0.closed, false);
  assert.deepEqual(v0.pts.map((p) => [Math.round(p.x), Math.round(p.y)]), [[100, 80], [500, 240], [200, 400]]);
  // 2つめの頂点を (700, 100) に：ほかの頂点はそのまま、四角は広がる
  const moved = withVertices(poly, V, [v0.pts[0], {x: 700, y: 100}, v0.pts[2]], false);
  const v1 = markVertices(moved, V);
  assert.ok(near(v1.pts[0], v0.pts[0]) && near(v1.pts[2], v0.pts[2]) && near(v1.pts[1], {x: 700, y: 100}), JSON.stringify(v1.pts));
  assert.deepEqual([moved.line, moved.width, moved.id], [poly.line, poly.width, 'p']); // 書式はそのまま
  // 30°回した四角（閉じた形）：見えている位置で動かしても、ほかの3つの角は動かない（回した角度はそのまま）
  const quad = {...base, id: 'q', kind: 'pen' as const, x1: 0.3, y1: 0.3, x2: 0.6, y2: 0.6, rot: 30, pts: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]] as [number, number][]};
  const q0 = markVertices(quad, V);
  assert.equal(q0.closed, true);
  assert.equal(q0.pts.length, 4);
  const q1pts = q0.pts.map((p, i) => (i === 2 ? {x: p.x + 60, y: p.y + 40} : p));
  const quad2 = withVertices(quad, V, q1pts, true);
  assert.equal(quad2.rot, 30);
  const q1 = markVertices(quad2, V);
  assert.equal(q1.closed, true);
  q1.pts.forEach((p, i) => assert.ok(near(p, q1pts[i]), `${i} ${JSON.stringify([p, q1pts[i]])}`));
  // 頂点を足す（2つめと3つめの間）・消す
  const added = markVertices(withVertices(quad, V, [q0.pts[0], q0.pts[1], {x: 500, y: 200}, q0.pts[2], q0.pts[3]], true), V);
  assert.equal(added.pts.length, 5);
  const removed = markVertices(withVertices(quad, V, q0.pts.filter((_, i) => i !== 1), true), V);
  assert.equal(removed.pts.length, 3);
  // まっすぐな横の線（高さ 0）でも四角の高さは 0 にしない
  const flat = withVertices(poly, V, [{x: 100, y: 300}, {x: 600, y: 300}], false);
  assert.ok(Math.abs(flat.y2 - flat.y1) * 800 >= 2 - 1e-6);
  assert.ok(markVertices(flat, V).pts.every((p) => Math.abs(p.y - 300) < 0.05));
});

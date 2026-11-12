// 平面図の手すりを自由に曲げる棒（ユーザーの指示「横棒とL字など、自由自在に曲げれる棒（線は真っ直ぐ）」2026-11-10）と、
// ぐしゃぐしゃに書いて線・図形を消す（「グジャグジャってすると線や図形は消せる」）の計算。図はすべて架空のもの
import assert from 'node:assert/strict';
import test from 'node:test';
import {ERASABLE, eraseHits, handlesOf, hitTest, makeItem, moved, railFrom, railPolyline, resized, scribbleHits, turnedItem} from '../../src/sasaoka/madori/edit.ts';
import {bounds, cleanMadori, legendText, railPts, railSegs} from '../../src/sasaoka/madori/model.ts';
import type {MItem} from '../../src/sasaoka/madori/model.ts';
import {floorSvg} from '../../src/sasaoka/madori/render.ts';
import {isScribble} from '../../src/sasaoka/photoMarks.ts';

/** 角を結んだ道（10mm ごとに点。手でなぞったのと同じく、点が細かい） */
function stroke(corners: [number, number][], wobble = 0): {x: number; y: number}[] {
  const out: {x: number; y: number}[] = [];
  for (let i = 1; i < corners.length; i++) {
    const [a, b] = [corners[i - 1], corners[i]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const w = wobble ? Math.sin(out.length) * wobble : 0;
      out.push({x: a[0] + (b[0] - a[0]) * t + w, y: a[1] + (b[1] - a[1]) * t + w});
    }
  }
  const z = corners[corners.length - 1];
  out.push({x: z[0], y: z[1]});
  return out;
}
const none = () => undefined;
const ctx = {items: [] as MItem[], module: 910 as const, step: 455, tol: 120};

test('コ字をなぞる → 角が2つの曲げた棒（線はまっすぐ・50mm にそろう）', () => {
  const path = stroke([[1000, 1000], [1000, 2000], [2200, 2000], [2200, 1000]], 15);
  const it = makeItem({t: 'rail'}, path[0], path[path.length - 1], false, {...ctx, path})!;
  assert.equal(it.kind, 'rail');
  assert.deepEqual(it.pts, [
    {x: 1000, y: 1000},
    {x: 1000, y: 2000},
    {x: 2200, y: 2000},
    {x: 2200, y: 1000},
  ]);
  // x・y・w・h は1本目
  assert.deepEqual([it.x, it.y, it.w, it.h], [1000, 1000, 0, 1000]);
  assert.deepEqual(railSegs(it), [1000, 1200, 1000]);
  assert.equal(legendText(it, none), 'L＝1,000＋1,200＋1,000mm');
  assert.deepEqual(bounds(it), {x: 1000, y: 1000, w: 1200, h: 1000});
});

test('まっすぐ・L 字をなぞったときは前と同じ（まっすぐの手すり・L型）', () => {
  const straight = stroke([[1000, 1000], [2000, 1010]], 10);
  const a = makeItem({t: 'rail'}, straight[0], straight[straight.length - 1], false, {...ctx, path: straight})!;
  assert.equal(a.pts, undefined);
  assert.deepEqual([a.x, a.y, a.w, a.h], [1000, 1000, 1000, 0]);
  const l = stroke([[1000, 1000], [1600, 1000], [1600, 1800]]);
  const b = makeItem({t: 'rail'}, l[0], l[l.length - 1], false, {...ctx, path: l})!;
  assert.equal(b.pts, undefined);
  assert.equal(b.len, 800);
  assert.equal(b.turn, 1);
});

test('ななめ（45°）の区間もそのまま曲げた棒に', () => {
  const p = railPolyline(stroke([[0, 0], [1000, 0], [1700, 700]]), [], 120);
  assert.deepEqual(p, [
    {x: 0, y: 0},
    {x: 1000, y: 0},
    {x: 1700, y: 700},
  ]);
});

test('指を離すときの短いはねは除く・壁の近くの区間は壁ぞいに', () => {
  const p = railPolyline(stroke([[1000, 1000], [1000, 2000], [2000, 2000], [2060, 1960]]), [], 120);
  assert.equal(p.length, 3);
  // 部屋の左の壁（x=910）のそば：縦の区間が壁の面の内側（910＋30＋50）に
  const walls = [{h: false, at: 910, from: 0, to: 3000}];
  const q = railPolyline(stroke([[1000, 1000], [1000, 2000], [2000, 2000], [2000, 1000]]), walls, 120);
  assert.equal(q[0].x, 990);
  assert.equal(q[1].x, 990);
});

test('区間のまん中（□）をつまむとそこで曲がる・角（■）を動かす・まっすぐに並べば点が減る', () => {
  const bar: MItem = {id: 'r', kind: 'rail', x: 0, y: 0, w: 2000, h: 0};
  const hs = handlesOf(bar).map((h) => h.h);
  assert.deepEqual(hs, ['p0', 'p1', 'e0']);
  const bent = resized(bar, 'e0', {x: 1000, y: 600}, 455);
  assert.deepEqual(bent.pts, [
    {x: 0, y: 0},
    {x: 1000, y: 600},
    {x: 2000, y: 0},
  ]);
  assert.deepEqual(handlesOf(bent).map((h) => h.h), ['v0', 'v1', 'v2', 'e0', 'e1']);
  // 角を下へ：となりの点と縦にそろえる（8° まで）
  const v1 = resized(bent, 'v1', {x: 2040, y: 900}, 455);
  assert.deepEqual(v1.pts?.[1], {x: 2000, y: 900});
  // 角を線の上に戻すと、まっすぐの手すりに戻る（pts なし）
  const back = resized(bent, 'v1', {x: 1000, y: 0}, 455);
  assert.equal(back.pts, undefined);
  assert.deepEqual([back.x, back.y, back.w, back.h], [0, 0, 2000, 0]);
  // L型（len・turn）も点で曲げられる
  const L: MItem = {id: 'l', kind: 'rail', x: 0, y: 0, w: 1000, h: 0, len: 600, turn: 1};
  const L2 = resized(L, 'e1', {x: 1500, y: 300}, 455);
  assert.equal(L2.len, undefined);
  assert.equal(L2.turn, undefined);
  assert.equal(L2.pts?.length, 4);
});

test('曲げた棒を動かす・回す・押して選ぶ・読み込み・図', () => {
  const it = railFrom({id: 'r', kind: 'rail', x: 0, y: 0, w: 0, h: 0}, [
    {x: 0, y: 0},
    {x: 0, y: 1000},
    {x: 1000, y: 1000},
    {x: 1000, y: 0},
  ]);
  const mv = moved(it, {x: 500, y: 200}, [], 455);
  assert.deepEqual(mv.pts?.[0], {x: 500, y: 200});
  assert.deepEqual(mv.pts?.[3], {x: 1500, y: 200});
  const tn = turnedItem(it, 455);
  assert.equal(tn.pts?.length, 4);
  assert.deepEqual(bounds(tn), bounds(it));
  // 2本目（下の横の区間）を押すと選べる。まん中の空いた所は選ばない
  assert.equal(hitTest([it], {x: 500, y: 1010}, 20)?.id, 'r');
  assert.equal(hitTest([it], {x: 500, y: 500}, 20), null);
  // 読み込み（保存したものを開き直す）
  const m = cleanMadori({module: 910, snap: 2, floors: [{id: 'f', name: '1階', items: [{...it}, {id: 'x', kind: 'rail', x: 0, y: 0, w: 900, h: 0, pts: [{x: 0, y: 0}, {x: 'a'}]}]}], optRev: 2})!;
  assert.deepEqual(m.floors[0].items[0].pts, it.pts);
  assert.equal(m.floors[0].items[1].pts, undefined); // 壊れた点は捨てて、まっすぐの手すり
  const svg = floorSvg([it], {module: 910, showDims: false, showArea: false, nums: new Map([['r', 1]])});
  assert.ok(svg.includes('M0 0L0 1000L1000 1000L1000 0'));
  assert.ok(!svg.includes('①')); // 棒には番号を描かない（ユーザーの指示「棒は棒、丸は丸のみ」2026-11-12）
  assert.deepEqual(railPts(it), it.pts);
});

test('縦手すりは塗りつぶしの丸（青）', () => {
  const svg = floorSvg([{id: 'v', kind: 'vrail', x: 500, y: 500, w: 0, h: 0}], {module: 910, showDims: false, showArea: false, nums: new Map()});
  assert.ok(svg.includes('<circle cx="500" cy="500" r="75" fill="#0070c0"/>'));
  assert.ok(!svg.includes('r="32"')); // 前の赤い輪（白い中）ではない
});

test('ぐしゃぐしゃの道：上を通った線・図形・手すり・番号を消す（部屋・建具は消さない）', () => {
  const items: MItem[] = [
    {id: 'room', kind: 'room', type: '洋室', x: 0, y: 0, w: 3640, h: 2730},
    {id: 'door', kind: 'door', type: '片開き戸', x: 1820, y: 2730, w: 780, h: 0},
    {id: 'line', kind: 'shape', type: '直線', x: 500, y: 1000, w: 1000, h: 0},
    {id: 'box', kind: 'shape', type: '四角', x: 2400, y: 400, w: 600, h: 400},
    {id: 'rail', kind: 'rail', x: 500, y: 2000, w: 1000, h: 0},
    {id: 'num', kind: 'num', x: 3300, y: 2300, w: 0, h: 0},
  ];
  // 直線と手すりの上を左右に何回も
  const zig: {x: number; y: number}[] = [];
  for (let i = 0; i < 8; i++) zig.push({x: i % 2 ? 1400 : 600, y: 900 + i * 160});
  const ids = scribbleHits(items, zig, 40);
  assert.deepEqual(ids.sort(), ['line', 'rail']);
  // 部屋・建具の上を書いても消さない
  const over = [{x: 1500, y: 2600}, {x: 2100, y: 2800}, {x: 1500, y: 2650}, {x: 2100, y: 2850}];
  assert.deepEqual(scribbleHits(items, over, 40), []);
  assert.ok(!ERASABLE.includes('room') && !ERASABLE.includes('door') && !ERASABLE.includes('fix'));
});

test('「🗑 削除」を押してからなぞる：部屋・建具・設備も消す。小さい部品の上だけなら部屋は残す', () => {
  // ユーザーの指示「削除をタップして、グジャグジャってなぞると、消せるように」2026-11-10
  const items: MItem[] = [
    {id: 'toilet', kind: 'room', type: 'トイレ', x: 0, y: 0, w: 910, h: 1820},
    {id: 'bed', kind: 'room', type: '洋室', x: 910, y: 0, w: 3640, h: 2730},
    {id: 'closet', kind: 'room', type: '収納', x: 3640, y: 0, w: 910, h: 910}, // 洋室の中の収納
    {id: 'wc', kind: 'fix', type: '洋式便器', x: 250, y: 200, w: 400, h: 700},
    {id: 'door', kind: 'door', type: '片開き戸', x: 1820, y: 2730, w: 780, h: 0},
  ];
  const zig = (x0: number, x1: number, y0: number, y1: number, n = 10) => Array.from({length: n}, (_, i) => ({x: i % 2 ? x1 : x0, y: y0 + ((y1 - y0) * i) / (n - 1)}));
  // 便器の上だけ：便器だけ（トイレの部屋は残る）
  assert.deepEqual(eraseHits(items, zig(300, 600, 250, 850), 40), ['wc']);
  // 建具の上：建具だけ
  assert.deepEqual(eraseHits(items, zig(1900, 2500, 2700, 2760), 40), ['door']);
  // 部屋の中を押しただけ・なぞった：その部屋（中の収納の所は収納）
  assert.deepEqual(eraseHits(items, [{x: 2000, y: 1000}], 40), ['bed']);
  assert.deepEqual(eraseHits(items, [{x: 4000, y: 400}], 40), ['closet']);
  assert.deepEqual(eraseHits(items, zig(1200, 3000, 300, 2000), 40), ['bed']);
  // トイレの部屋じゅうをぐしゃぐしゃ：便器も部屋も
  assert.deepEqual(eraseHits(items, zig(50, 860, 50, 1770, 16), 40).sort(), ['toilet', 'wc']);
  // 何もない所は何も消さない
  assert.deepEqual(eraseHits(items, zig(6000, 7000, 6000, 7000), 40), []);
  assert.deepEqual(eraseHits(items, [], 40), []);
});

test('ぐしゃぐしゃかどうか（画面の px）：往復が多いとき・L 字やコ字は違う', () => {
  const zig = Array.from({length: 12}, (_, i) => ({x: i % 2 ? 160 : 100, y: 100 + i * 6}));
  assert.equal(isScribble(stroke(zig.map((q) => [q.x, q.y] as [number, number]))), true);
  assert.equal(isScribble(stroke([[0, 0], [0, 200], [300, 200], [300, 0]])), false);
  assert.equal(isScribble(stroke([[0, 0], [300, 0], [300, 300]])), false);
});

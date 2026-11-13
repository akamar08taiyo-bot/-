// 平面図（📐 平面図のタブ。madori/）：広さ・番号・一覧（凡例）・読み込みの整え・壁への吸い付き・絵・見取図の紙・Excel。
// お客様・会社の値は架空のもの（見本 花子）だけ
import assert from 'node:assert/strict';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {cleanJobs} from '../../src/sasaoka/storage.ts';
import {copied, fixInRoom, floorArea, hitTest, makeItem, moved, nudged, placeFixture, resized, spunTo, placeOpening, railLine, turnedItem, walls} from '../../src/sasaoka/madori/edit.ts';
import {bounds, cleanMadori, emptyMadori, hasMadori, legendLines, legendText, numberItems, roomArea} from '../../src/sasaoka/madori/model.ts';
import type {Madori, MItem} from '../../src/sasaoka/madori/model.ts';
import {floorSvg} from '../../src/sasaoka/madori/render.ts';
import {ROOM_ROWS, ROOM_TYPES} from '../../src/sasaoka/madori/catalog.ts';
import {floorLegend, pageSvg, planSvg, sheetLayout, sheetLegend, sheetText, sheetTitle, sheetWorks} from '../../src/sasaoka/madori/sheet.ts';
import {madoriXlsx} from '../../src/sasaoka/madori/xlsx.ts';
import type {Job} from '../../src/sasaoka/types.ts';

const M = 910;
const room = (id: string, x: number, y: number, w: number, h: number, type = '洋室'): MItem => ({id, kind: 'room', type, x, y, w, h});
const none = () => undefined;

test('部屋の広さ：910mm の方眼の 3×4 マスは 6帖・9.94㎡（1帖＝1マス×2マス）、1000mm なら 12㎡', () => {
  assert.deepEqual(roomArea(3 * M, 4 * M, 910), {m2: 9.94, jo: 6, tsubo: 3.01});
  assert.equal(roomArea(3000, 4000, 1000).m2, 12);
  assert.equal(roomArea(1.5 * M, 3 * M, 910).jo, 2.3); // 2.25 → 小数1けた
});

test('番号：番号の道具の部品だけ（申請書の箇所につないだら写真番号、手で決めた番号はそのまま、ほかは空いている番号を置いた順に。階をまたいで通し）。手すり・丸・横四角には付けない', () => {
  // ユーザーの指示「番号はセットにしなくても良い。棒は棒、丸は丸のみ」2026-11-12（前は手すり・縦手すり・段差の解消にも①②…）
  const num = (id: string, more: Partial<MItem> = {}): MItem => ({id, kind: 'num', x: 0, y: 0, w: 0, h: 0, ...more});
  const f1 = {id: 'f1', name: '1階', items: [{id: 'a', kind: 'rail', x: 0, y: 0, w: 600, h: 0}, {id: 'b', kind: 'rail', x: 0, y: 0, w: 800, h: 0, place: 'p2'}, num('x', {place: 'p2'}), num('y'), room('r', 0, 0, M, M)] as MItem[]};
  const f2 = {id: 'f2', name: '2階', items: [{id: 'c', kind: 'vrail', x: 0, y: 0, w: 0, h: 0, n: 5}, num('z', {n: 5}), {id: 'd', kind: 'step', x: 0, y: 0, w: 600, h: 400}, num('w')] as MItem[]};
  const nums = numberItems([f1, f2], (id) => (id === 'p2' ? 1 : undefined));
  assert.deepEqual(Object.fromEntries(nums), {x: 1, z: 5, y: 2, w: 3});
  for (const id of ['a', 'b', 'c', 'd', 'r']) assert.equal(nums.has(id), false, id); // 手すり・丸・横四角・部屋には番号を付けない
  // 絵にも、手すり・丸・横四角の番号は描かない
  const svg = floorSvg([...f1.items, ...f2.items], {module: 910, showArea: false, showDims: false, nums: new Map([['a', 7], ['c', 8], ['d', 9], ['x', 1]]), pid: 't'});
  assert.match(svg, />①</);
  assert.doesNotMatch(svg, /⑦|⑧|⑨/);
});

test('番号の部品の一覧：申請書の箇所につなぐと改修の内容・手で書いた文（手すり・丸・横四角は番号がないので出さない）・部品の文の書き方・手で直した一覧', () => {
  const items: MItem[] = [
    {id: 'a', kind: 'rail', x: 0, y: 0, w: 900, h: 0},
    {id: 'b', kind: 'rail', x: 0, y: 0, w: 0, h: -600, len: 600},
    {id: 'c', kind: 'vrail', x: 0, y: 0, w: 0, h: 0, len: 800},
    {id: 'd', kind: 'step', type: '踏み台', x: 0, y: 0, w: 600, h: 400},
    {id: 'e', kind: 'num', x: 0, y: 0, w: 0, h: 0, place: 'p1'},
    {id: 'f', kind: 'num', x: 0, y: 0, w: 0, h: 0, note: '廊下　L＝900mm'},
  ];
  const m = {floors: [{id: 'f', name: '1階', items}]};
  const lines = legendLines(m, (id) => (id === 'p1' ? 1 : undefined), (id) => (id === 'p1' ? '①玄関　手すりの取り付け　L=600mm' : undefined));
  assert.deepEqual(lines, ['①　玄関　手すりの取り付け　L=600mm', '②　廊下　L＝900mm']);
  // 部品の文の書き方（見本の「L＝600mm」「L型　600×600mm」）
  assert.deepEqual(items.slice(0, 4).map((it) => legendText(it, none)), ['L＝900mm', 'L型　600×600mm', '縦手すり　L＝800mm', '踏み台　600×400mm']);
  assert.equal(legendText({...items[0], note: '廊下　L＝900mm'}, none), '廊下　L＝900mm');
  assert.deepEqual(legendLines({...m, legend: '①　手で直した\n\n②　二行目'}, none, none), ['①　手で直した', '②　二行目']);
});

test('読み込み：壊れた部品・知らない種類は捨て、方眼・そろえ・表示は初めの値に。下絵は写真の番号と大きさがあるときだけ', () => {
  assert.equal(cleanMadori(null), undefined);
  assert.equal(cleanMadori({floors: []}), undefined);
  const m = cleanMadori({
    module: 123,
    snap: 3,
    showDims: false,
    floors: [
      {
        items: [{id: 'x', kind: 'room', x: 0, y: 0, w: 910, h: '9'}, {kind: 'bomb'}, null, {kind: 'rail', x: 1, y: 2, w: 600, h: 0, rot: 45, place: 'p', n: -1, flip: 'yes'}],
        underlay: {photo: 'ph1', x: 0, y: 0, w: 9100, h: 6000, opacity: 7},
      },
      {name: '2階', items: [], underlay: {photo: '', w: 1, h: 1}},
    ],
  })!;
  assert.equal(m.module, 910);
  assert.equal(m.snap, 2);
  // 方眼（尺）は初めは出す（showGrid がない＝出す）・チェックを外した平面図だけ false を覚える（ユーザーの指示「ほうがんしのデフォルトはonにする」2026-11-13。
  // 前は「デフォルトは表示しない」2026-11-12 で、true のときだけ出していた → 前の版で保存した平面図（true か、なし）は出す）
  assert.equal(m.showGrid, undefined);
  assert.equal(emptyMadori().showGrid, undefined);
  assert.equal(cleanMadori({floors: [{items: []}], showGrid: false})!.showGrid, false);
  assert.equal(cleanMadori({floors: [{items: []}], showGrid: true})!.showGrid, undefined);
  assert.equal(cleanMadori({floors: [{items: []}], showGrid: 'no'})!.showGrid, undefined);
  assert.equal(m.showDims, false);
  assert.equal(m.showArea, false); // 前の版の平面図（optRev なし）は、寸法・広さとも初めはオフで読む
  const kept = cleanMadori({optRev: 2, showDims: true, showArea: true, floors: [{items: []}]})!;
  assert.equal(kept.showDims, true); // オフにしたあとの版でチェックを入れたものは残す
  assert.equal(kept.showArea, true);
  assert.equal(emptyMadori().showDims, false);
  assert.equal(emptyMadori().showArea, false);
  assert.deepEqual(m.floors[0].items[0], {id: 'x', kind: 'room', x: 0, y: 0, w: 910, h: 0});
  assert.equal(m.floors[0].items.length, 2);
  assert.deepEqual(m.floors[0].items[1].place, 'p');
  assert.equal(m.floors[0].items[1].rot, undefined);
  assert.equal(m.floors[0].items[1].n, undefined);
  assert.equal(m.floors[0].items[1].flip, undefined);
  assert.equal(m.floors[0].name, '1階');
  assert.equal(m.floors[0].underlay?.opacity, 1);
  assert.equal(m.floors[1].underlay, undefined);
  assert.equal(hasMadori(m), true);
  assert.equal(hasMadori(emptyMadori()), false);
});

test('様邸の保存と読み込み（cleanJobs）で平面図が残る・壊れた平面図は持たない', () => {
  const madori: Madori = {...emptyMadori(), floors: [{id: 'f', name: '1階', items: [room('r', 0, 0, M, M, '和室')]}]};
  const [j] = cleanJobs([{customer: '見本 花子', madori}]);
  assert.equal(j.madori?.floors[0].items[0].type, '和室');
  const [k] = cleanJobs([{customer: '見本 花子', madori: {floors: 'x'}}]);
  assert.equal('madori' in k, false);
});

test('ドア・窓は近くの壁に吸い付く：横の壁は rot 0、縦の壁は rot 90、押した側に開く。壁が遠ければ置かない', () => {
  const ws = walls([room('r', 0, 0, 3 * M, 4 * M)]);
  const d = placeOpening('door', '片開き戸', {x: 1000, y: 150}, ws, 455)!;
  assert.equal(d.y, 0); // 上の壁の上
  assert.equal(d.rot, undefined);
  assert.equal(d.flip, undefined); // 押したのは壁の下（部屋の中）→ 下に開く
  assert.ok(Math.abs(d.x - d.w / 2 - Math.round((d.x - d.w / 2) / 227.5) * 227.5) < 1e-6); // 開口の端は半マスの半分にそろう
  const up = placeOpening('door', '片開き戸', {x: 1000, y: -150}, ws, 455)!;
  assert.equal(up.flip, true);
  const v = placeOpening('window', '引違い窓', {x: 3 * M - 100, y: 1800}, ws, 455)!;
  assert.deepEqual([v.x, v.rot, v.kind], [3 * M, 90, 'window']);
  assert.equal(placeOpening('door', '片開き戸', {x: 1000, y: 1800}, ws, 455), null);
  // 壁より広い開口は壁の長さまで
  const small = walls([room('t', 0, 0, M, 1.5 * M, 'トイレ')]);
  assert.equal(placeOpening('door', '引違い戸', {x: 400, y: 0}, small, 455)!.w, M);
});

test('設備は背中（上の辺）を近くの壁に向けて、壁の面にぴったり付ける', () => {
  const ws = walls([room('t', 0, 0, M, 1.5 * M, 'トイレ')]);
  const top = placeFixture('洋式便器', {x: 455, y: 250}, ws);
  assert.deepEqual([top.rot, top.y, top.x + top.w / 2], [undefined, 30, 455]); // 上の壁の面（中心線＋壁の厚みの半分 30mm）
  const right = placeFixture('洗面台', {x: M - 200, y: 700}, ws);
  assert.equal(right.rot, 90);
  // 回したあとの外まわりの右の辺が右の壁の面（910−30）
  const cx = right.x + right.w / 2;
  assert.equal(cx + right.h / 2, M - 30);
  const far = placeFixture('ベッド', {x: 5000, y: 5000}, ws);
  assert.equal(far.rot, undefined);
});

test('手すりは横・縦にそろい、壁の近くなら壁ぞい（面から 50mm 内側）。長さは 50mm 刻み、押しただけなら 600mm', () => {
  const ws = walls([room('r', 0, 0, 6 * M, M, '廊下')]);
  const l = railLine({x: 300, y: M - 120}, {x: 2730, y: M - 60}, ws, false);
  assert.deepEqual(l, {x: 300, y: M - 80, w: 2450, h: 0});
  const c = railLine({x: 300, y: 200}, {x: 300, y: 200}, ws, true);
  assert.deepEqual([c.w, c.h, c.y], [600, 0, 80]);
  const it = makeItem({t: 'rail', place: 'p1', len: 800}, {x: 300, y: 200}, {x: 300, y: 200}, true, {items: [room('r', 0, 0, 6 * M, M)], module: 910, step: 455})!;
  assert.deepEqual([it.w, it.place], [800, 'p1']);
});

test('部屋：ドラッグは方眼にそろえ、押しただけなら種類の大きさ（マイホームクラウドの一覧の大きさ）', () => {
  const ctx = {items: [], module: 910 as const, step: 455};
  const r = makeItem({t: 'room', type: '和室'}, {x: 10, y: 20}, {x: 2700, y: 3600}, false, ctx)!;
  assert.deepEqual([r.x, r.y, r.w, r.h], [0, 0, 2730, 3640]);
  const c = makeItem({t: 'room', type: 'トイレ'}, {x: 2000, y: 2000}, {x: 2000, y: 2000}, true, ctx)!;
  assert.deepEqual([c.w, c.h], [910, 1365]);
});

test('押した所の部品：手すりは部屋より先、部屋は中のいちばん小さい部屋（洋室の中の収納）', () => {
  const items: MItem[] = [room('big', 0, 0, 4 * M, 4 * M), room('small', 0, 0, M, M, '収納'), {id: 'rail', kind: 'rail', x: 2000, y: 2000, w: 1000, h: 0}];
  assert.equal(hitTest(items, {x: 300, y: 300}, 50)?.id, 'small');
  assert.equal(hitTest(items, {x: 2500, y: 2030}, 50)?.id, 'rail');
  assert.equal(hitTest(items, {x: 2500, y: 3000}, 50)?.id, 'big');
  assert.equal(hitTest(items, {x: 9000, y: 9000}, 50), null);
});

test('部屋の大きさのつまみは細かく：画面でドラッグすると 10mm 刻み、方眼の線・となりの部屋の辺の近くだけ吸い付く（ユーザーの答え「より細かく」2026-11-12）', () => {
  const r = room('r', 0, 0, 2 * M, 2 * M);
  const near = {tol: 30};
  // 半マス（455mm）の線から離れた所：10mm 刻みで止まる（前は 2730 に飛んだ）
  assert.deepEqual(resized(r, 'se', {x: 2000, y: 1904}, 455, false, near), {...r, w: 2000, h: 1900});
  assert.deepEqual(resized(r, 'e', {x: 2347, y: 999}, 455, false, near), {...r, w: 2350});
  // 方眼の線（455 の倍数）の近く（30mm 以内）は線にそろう
  assert.deepEqual(resized(r, 'e', {x: 2 * M + 455 - 20, y: 0}, 455, false, near), {...r, w: 2 * M + 455});
  // となりの部屋の辺の近くはその辺にそろう
  const next = room('n', 2200, 0, M, M);
  assert.deepEqual(resized(r, 'e', {x: 2215, y: 0}, 455, false, near, [r, next]), {...r, w: 2200});
  // Alt（free）は吸い付かない
  assert.deepEqual(resized(r, 'e', {x: 2 * M + 455 - 20, y: 0}, 455, false, {...near, free: true}), {...r, w: 2 * M + 440});
  // 小さくしても 100mm より小さくはならない（前は半マス）
  assert.deepEqual(resized(r, 'w', {x: 1900, y: 0}, 455, false, near), {...r, x: 2 * M - 100, w: 100});
  // 階段も同じ
  const st: MItem = {id: 's', kind: 'stair', x: 0, y: 0, w: M, h: 2 * M};
  assert.equal(resized(st, 's', {x: 0, y: 2 * M + 123}, 455, false, near).h, 2 * M + 120);
  // 渡さなければ今までどおり半マス（テスト・ほかの呼び出し）
  assert.deepEqual(resized(r, 'se', {x: 3 * M + 100, y: 2 * M}, 455), {...r, w: 2730, h: 1820});
});

test('動かす・大きさ・回す・写す', () => {
  const r = room('r', 0, 0, 2 * M, 2 * M);
  assert.deepEqual(moved(r, {x: 300, y: 500}, [r], 455), {...r, x: 455, y: 455});
  assert.deepEqual(resized(r, 'se', {x: 3 * M + 100, y: 2 * M}, 455), {...r, w: 2730, h: 1820});
  const t = turnedItem(room('t', 0, 0, M, 2 * M), 455);
  assert.deepEqual([t.w, t.h], [2 * M, M]);
  const rail: MItem = {id: 'a', kind: 'rail', x: 0, y: 0, w: 600, h: 0, place: 'p', n: 2};
  const c = copied(rail, 455);
  assert.notEqual(c.id, 'a');
  assert.equal(c.place, undefined); // 同じ番号が2つにならないように
  assert.equal(c.n, undefined);
});

test('動かすときの微調節：そろえたい所の近く（tol 以内）だけ吸い付き、ほかは 10mm 刻み。Alt（free）は吸い付かない', () => {
  // ユーザーの指示「住設などもカクカク動くので、微調節をして動かせるようにする」2026-11-12（前は部屋が半マスごと・設備が壁から 140mm で飛んだ）
  const tol = 75; // 画面の 6px（倍率 0.08）
  const big = room('big', 0, 0, 4 * M, 4 * M, '寝室');
  const small = room('s', 455, 455, M, 455, '洗面脱衣室');
  // 部屋：方眼の線から遠い所は 10mm 刻みで、その所に止まる
  const a = moved(small, {x: 123, y: 148}, [big, small], 455, {tol});
  assert.deepEqual([a.x, a.y], [580, 600]);
  assert.equal(moved(small, {x: 0, y: 47}, [big, small], 455, {tol}).y, 455); // 線から 47mm（6px 以内）は線に戻る
  // 方眼の線（910）の近く（左の辺が 900）は線にそろう
  assert.equal(moved(small, {x: 445, y: 0}, [big, small], 455, {tol}).x, 910);
  // ほかの部屋の辺（右の辺 3640）にもそろう：右の辺が 3640 から 20mm の所
  const b = moved(small, {x: 3640 - 455 - M - 20, y: 0}, [big, small], 455, {tol});
  assert.equal(b.x + b.w, 3640);
  // Alt を押しているときは吸い付かない
  assert.equal(moved(small, {x: 445, y: 0}, [big, small], 455, {tol, free: true}).x, 900);
  // 頂点のある部屋も頂点ごと同じだけ
  const poly: MItem = {id: 'p', kind: 'room', type: '洋室', x: 0, y: 0, w: M, h: M, pts: [{x: 0, y: 0}, {x: M, y: 0}, {x: M, y: M}, {x: 0, y: M}]};
  const pm = moved(poly, {x: 123, y: 0}, [big, poly], 455, {tol});
  assert.deepEqual([pm.x, pm.pts![0].x, pm.pts![2].x], [120, 120, M + 120]);
  // 設備：壁の面から tol より離れていれば、壁に飛ばずにその所に（前は 140mm 以内で必ず壁へ）
  const ws = [big];
  const fix: MItem = {id: 'f', kind: 'fix', type: '洋式便器', x: 1000, y: 1000, w: 400, h: 700};
  const f1 = moved(fix, {x: 0, y: -(1000 - 30 - 100)}, ws, 455, {tol}); // 上の辺が壁の面（30）から 100mm
  assert.equal(f1.y, 130);
  const f2 = moved(fix, {x: 0, y: -(1000 - 30 - 40)}, ws, 455, {tol}); // 40mm なら壁の面に付く
  assert.equal(f2.y, 30);
  assert.equal(moved(fix, {x: 0, y: -(1000 - 30 - 40)}, ws, 455, {tol, free: true}).y, 70);
  // snap を渡さないとき（前と同じ）は 140mm で壁へ
  assert.equal(moved(fix, {x: 0, y: -(1000 - 30 - 100)}, ws, 455).y, 30);
  // ドア：壁にそって 10mm 刻み（前は半マスの半分＝227.5mm ごと）
  const wsDoor = walls([big]);
  const door = placeOpening('door', '片開き戸', {x: 1820, y: 0}, wsDoor, 455)!;
  const dm = moved({...door, id: 'd'}, {x: 130, y: 0}, [big, {...door, id: 'd'}], 455, {tol});
  assert.ok(Math.abs(dm.x - door.x - 130) <= 5, String(dm.x - door.x)); // 10mm の刻み（前は 227.5mm）
  assert.equal(dm.y, door.y);
});

test('微調整（矢印キー・ボタン）：10mm ずつ。頂点も一緒に、ドア・窓は壁にそってだけ', () => {
  const poly: MItem = {id: 'p', kind: 'shape', type: '四角', x: 0, y: 0, w: 100, h: 100, pts: [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}]};
  const n = nudged(poly, 10, -10);
  assert.deepEqual([n.x, n.y, n.pts![1].x, n.pts![1].y], [10, -10, 110, -10]);
  const door: MItem = {id: 'd', kind: 'door', type: '片開き戸', x: 500, y: 0, w: 800, h: 0};
  assert.deepEqual([nudged(door, 10, 10).x, nudged(door, 10, 10).y], [510, 0]);
  assert.equal(nudged(door, 0, 10), door); // 横の壁のドアは上下に動かさない（ボタンも出さない）
  const vdoor: MItem = {...door, rot: 90};
  assert.deepEqual([nudged(vdoor, 10, 10).x, nudged(vdoor, 10, 10).y], [500, 10]);
});

test('便器はトイレの中・浴槽は浴室の中：ドアのない壁に背中を付けてまん中（便器は短い壁・浴槽は長い壁）。入っている部屋・部屋がないときは null', () => {
  // ユーザーの指示「便器を選択したらトイレの中にいれる。浴槽を選択したら、浴室の中に入れる」2026-11-12
  const wc = room('wc', 0, 0, M, 1.5 * M, 'トイレ'); // 910×1365
  const t1 = fixInRoom('洋式便器', [wc])!;
  assert.equal(t1.room.id, 'wc');
  assert.deepEqual([t1.item.x, t1.item.y, t1.item.rot ?? 0], [255, 30, 0]); // 上の短い壁の面（30）に背中・左右のまん中（455−200）
  // ドアが上の壁にあれば、下の短い壁に背中（180°）
  const top: MItem = {id: 'd', kind: 'door', type: '片開き戸', x: 455, y: 0, w: 600, h: 0};
  const t2 = fixInRoom('洋式便器', [wc, top])!;
  assert.equal(t2.item.rot, 180);
  const b2 = bounds(t2.item);
  assert.equal(b2.y + b2.h, 1.5 * M - 30);
  // もう便器が入っているトイレには入れない（ほかのトイレがあればそこへ）
  const wc2 = room('wc2', 3 * M, 0, M, 1.5 * M, 'トイレ');
  assert.equal(fixInRoom('洋式便器', [wc, t1.item, wc2])!.room.id, 'wc2');
  assert.equal(fixInRoom('洋式便器', [wc, t1.item]), null);
  assert.equal(fixInRoom('洋式便器', [room('w', 0, 0, 3 * M, 4 * M, '洋室')]), null); // トイレがなければ今までどおり押して置く
  // 浴槽（1500×750）は浴室（1820×1365＝横に長い）の長い壁に。ドアが下なら上の壁
  const bath = room('b', 0, 0, 2 * M, 1.5 * M, '浴室');
  const down: MItem = {id: 'd2', kind: 'door', type: '折れ戸', x: M, y: 1.5 * M, w: 800, h: 0};
  const u = fixInRoom('浴槽', [bath, down])!;
  assert.deepEqual([u.item.x, u.item.y, u.item.rot ?? 0], [160, 30, 0]);
  // 名前に「トイレ」とある部屋（種類が別でも）にも入る
  assert.ok(fixInRoom('和式便器', [{...room('x', 0, 0, M, 1.5 * M, '洗面所'), label: '1階トイレ'}]));
  // 浴槽の入らない小さな浴室は null
  assert.equal(fixInRoom('浴槽', [room('s', 0, 0, M, M, '浴室')]), null);
});

test('向きを 360° 自由に：↻ をドラッグした角度（0・90・180・270° の近くは吸い付き・Shift は 15°・Alt は 1°）。外まわり・読み込み・大きさ', () => {
  // ユーザーの指示「向きなどは360度自由自在に動かせるようにする」2026-11-12
  const fix: MItem = {id: 'f', kind: 'fix', type: '洋式便器', x: 0, y: 0, w: 400, h: 700};
  const c = {x: 200, y: 350};
  const a = {x: 200, y: 0}; // つまみ（まん中の真上）
  const at = (deg: number) => ({x: c.x + 500 * Math.sin((deg * Math.PI) / 180), y: c.y - 500 * Math.cos((deg * Math.PI) / 180)});
  assert.equal(spunTo(fix, c, a, at(37)).rot, 37);
  assert.equal(spunTo(fix, c, a, at(88)).rot, 90); // 90° の近くは吸い付く
  assert.equal(spunTo(fix, c, a, at(88), {free: true}).rot, 88);
  assert.equal(spunTo(fix, c, a, at(37), {shift: true}).rot, 30);
  assert.equal(spunTo(fix, c, a, at(-45)).rot, 315);
  assert.equal(spunTo(fix, c, a, at(2)).rot, undefined); // 0° は rot なし
  // 回してある部品は、押した所からの差だけ回る（つまみを押しただけで向きが飛ばない）
  assert.equal(spunTo({...fix, rot: 90}, c, a, at(30)).rot, 120);
  // 外まわり：45° の 400×700 は（400＋700）×0.707 の四角
  const b = bounds({...fix, rot: 45});
  assert.ok(Math.abs(b.w - 1100 * Math.SQRT1_2) < 0.01 && Math.abs(b.h - b.w) < 0.01);
  assert.ok(Math.abs(b.x + b.w / 2 - 200) < 0.01 && Math.abs(b.y + b.h / 2 - 350) < 0.01); // まん中は同じ
  // 押すと 90° ずつ（45° → 135°）
  assert.equal(turnedItem({...fix, rot: 45}, 455).rot, 135);
  // 読み込み：住設の 45° は残す・建具・窓は 90° ずつだけ
  const mm = cleanMadori({module: 910, floors: [{id: 'f', name: '1階', items: [{...fix, rot: 45}, {id: 'd', kind: 'door', type: '片開き戸', x: 0, y: 0, w: 780, h: 0, rot: 45}, {...fix, id: 'g', rot: 400}]}]})!;
  assert.deepEqual(mm.floors[0].items.map((it) => it.rot), [45, undefined, 40]);
  // 30° に回した部品のつまみを動かすと、外まわりが新しい四角になる幅・奥行に（まん中はそのまま）
  const r30: MItem = {...fix, rot: 30};
  const b0 = bounds(r30);
  const big = resized(r30, 'se', {x: b0.x + b0.w + 100, y: b0.y + b0.h + 100}, 455);
  const b1 = bounds(big);
  assert.ok(big.w > 400 && big.h > 700, JSON.stringify(big));
  assert.ok(Math.abs(b1.w - (b0.w + 100)) < 15 && Math.abs(b1.h - (b0.h + 100)) < 15, JSON.stringify([b0, b1]));
});

test('部屋の一覧の2段目は英語の略称（廊下・L・K・DK・LDK・LD・D）。言葉の名前で描いた部屋は読み込むと略称に（名前を打った部屋の名前はそのまま）', () => {
  // ユーザーの指示「キッチン、リビングダイニングキッチンは K、L、D、DK、LDK みたいな形で、略称、英語の略称で、に戻してください」2026-11-12
  assert.deepEqual(ROOM_ROWS[1].map((r) => r.name), ['廊下', 'L', 'K', 'DK', 'LDK', 'LD', 'D']);
  assert.equal(ROOM_TYPES.find((r) => r.name === 'LDK')?.full, 'リビングダイニングキッチン');
  const old = cleanMadori({module: 910, floors: [{id: 'f', name: '1階', items: [
    {id: 'a', kind: 'room', type: 'リビングダイニングキッチン', x: 0, y: 0, w: 3640, h: 3640},
    {id: 'b', kind: 'room', type: 'キッチン', label: '台所', x: 0, y: 0, w: 1820, h: 2730},
    {id: 'c', kind: 'fix', type: 'I型キッチン', x: 0, y: 0, w: 2550, h: 650},
  ]}]})!;
  assert.deepEqual(old.floors[0].items.map((it) => [it.type, it.label]), [['LDK', undefined], ['K', '台所'], ['I型キッチン', undefined]]);
});

test('床面積：屋外・バルコニーと、ほかの部屋の中に描いた部屋は数えない', () => {
  const items = [room('a', 0, 0, 4 * M, 4 * M), room('in', 0, 0, M, M, '収納'), room('b', 4 * M, 0, 4 * M, M, 'バルコニー'), room('c', 0, 4 * M, M, M, 'トイレ')];
  assert.equal(floorArea(items), Math.round(((16 + 1) * M * M) / 1e4) / 100);
  // 道路・駐車場・ベランダも外（2026-11-11。道路を一覧に足したとき）
  const out = ['道路', '駐車場', 'ベランダ'].map((t, i) => room(`o${i}`, 10 * M, i * 5 * M, 8 * M, 4 * M, t));
  assert.equal(floorArea([...items, ...out]), floorArea(items));
});

test('絵：床の柄・壁・名前と広さ・手すりの赤い線と番号。名前の字はエスケープする', () => {
  const items: MItem[] = [room('a', 0, 0, 3 * M, 4 * M, '和室'), {...room('b', 3 * M, 0, M, M, 'トイレ'), label: '<b>トイレ</b>'}, {id: 'r', kind: 'rail', x: 100, y: 100, w: 600, h: 0}, {id: 'n', kind: 'num', x: 900, y: 100, w: 0, h: 0}];
  const svg = floorSvg(items, {module: 910, showArea: true, showDims: true, nums: new Map([['n', 1]]), pid: 't'});
  assert.match(svg, /和室/);
  assert.match(svg, />6帖</); // 広さは帖だけ（㎡は出さない）
  assert.doesNotMatch(svg, /㎡/);
  assert.match(svg, /url\(#t-tile-water\)|fill="#e4f4fd"/); // 部屋の色は種類の色（トイレ＝水まわりの水色）
  assert.match(svg, /#e3f6e8/); // 和室＝緑
  assert.match(svg, /&lt;b&gt;トイレ&lt;\/b&gt;/);
  assert.doesNotMatch(svg, /<b>/);
  assert.match(svg, /#e01b24/);
  assert.match(svg, /①/);
  assert.match(svg, />2730</); // 寸法線
});

const job = (over: Partial<Job> = {}): Job => cleanJobs([{customer: '見本 花子', address: '福岡県行橋市大字見本1-1', staff: '見本', places: [], ...over}])[0];

test('見取図の紙：題名（〇〇様邸　見取図）・日付・会社の名前は書かない。縦が基本で、横に広い図は横', () => {
  // ユーザーの指示「〇〇様邸　平面図、日付などは不要」「基本的には縦印刷、横広の場合は、自動的に横にする」2026-11-10
  assert.equal(sheetText(job()).fileName, '見本花子様住宅改修平面図');
  const tall: Madori = {...emptyMadori(), floors: [{id: 'f1', name: '1階', items: [room('a', 0, 0, 3 * M, 4 * M, '和室'), {id: 'r1', kind: 'rail', x: 0, y: 0, w: 600, h: 0}]}]};
  const lay = sheetLayout(tall.floors, ['①　L＝600mm']);
  assert.equal(lay.landscape, false);
  assert.deepEqual([lay.w, lay.h], [210, 297]);
  // 一覧の枠は平面図の下
  assert.ok(lay.legend && lay.plan && lay.legend.y >= lay.plan.y + lay.plan.h);
  const page = pageSvg(tall, tall.floors, lay, ['①　L＝600mm'], none, 'p');
  assert.match(page, /viewBox="0 0 210 297"/);
  assert.match(page, /①　L＝600mm/);
  assert.ok(!/見取図|様邸|年|株式会社|担当者/.test(page.replace(/<pattern[\s\S]*?<\/pattern>/g, '')));
  // 横に広い図（7マス×2マス）は横
  const wide: Madori = {...emptyMadori(), floors: [{id: 'f1', name: '1階', items: [room('a', 0, 0, 7 * M, 2 * M)]}]};
  const lw = sheetLayout(wide.floors, []);
  assert.equal(lw.landscape, true);
  assert.deepEqual([lw.w, lw.h], [297, 210]);
  assert.equal(lw.legend, null); // 番号がなければ一覧の枠は出さない
  assert.match(pageSvg(wide, wide.floors, lw, [], none, 'p'), /viewBox="0 0 297 210"/);
  // 正方形に近い図は縦のまま
  const sq: Madori = {...emptyMadori(), floors: [{id: 'f1', name: '1階', items: [room('a', 0, 0, 4 * M, 4 * M)]}]};
  assert.equal(sheetLayout(sq.floors, []).landscape, false);
});

test('見取図のいちばん上の「〇〇様邸」：名前＋様邸（呼び方が「様」でも様邸・名前の終わりの様／様邸は重ねない・名前がなければ書かない）', () => {
  // ユーザーの指示「平面図の一番上に〇〇様邸と表示しておく」2026-11-11
  assert.equal(sheetTitle({customer: '見本 花子'}), '見本 花子様邸');
  assert.equal(sheetTitle({customer: '見本花子様'}), '見本花子様邸');
  assert.equal(sheetTitle({customer: ' 見本花子様邸 '}), '見本花子様邸');
  assert.equal(sheetTitle({customer: '  '}), '');
  const tall: Madori = {...emptyMadori(), floors: [{id: 'f1', name: '1階', items: [room('a', 0, 0, 3 * M, 4 * M, '和室')]}]};
  const plain = sheetLayout(tall.floors, ['①玄関　手すりの取り付け　L=600mm']);
  const lay = sheetLayout(tall.floors, ['①玄関　手すりの取り付け　L=600mm'], '見本花子様邸');
  assert.equal(plain.title, null);
  // 題名の段のぶん、平面図は下から始まる（紙からはみ出さない・一覧の枠は平面図の下のまま）
  assert.ok(lay.title && lay.area.y > plain.area.y && lay.title.y < lay.area.y);
  assert.ok(lay.plan && lay.legend && lay.legend.y >= lay.plan.y + lay.plan.h && lay.legend.y + lay.legend.h <= lay.h - 10 + 0.01);
  const page = pageSvg(tall, tall.floors, lay, ['①玄関　手すりの取り付け　L=600mm'], none, 'p', {}, '見本花子様邸');
  // 「〇〇様邸」は大きく（9mm）、下の改修の内容は申請書の平面図の様式と同じ 12pt（4.2mm）から（ユーザーの指示「〇〇様邸の部分を大きくする」2026-11-12、
  // 「申請書の内容の部分はもう少し小さくする」2026-11-12 で 3.4mm にしたら「申請書の内容の部分の文字が小さい」2026-11-13）
  assert.match(page, /<text x="105" y="[\d.]+" font-size="9" font-weight="700" text-anchor="middle"[^>]*>見本花子様邸<\/text>/);
  assert.equal(lay.legend.fs, 4.2);
  assert.ok(!/見取図|平面図|年|株式会社|担当者/.test(page.replace(/<pattern[\s\S]*?<\/pattern>/g, '')), '「見取図」・日付・会社の名前は書かない');
});

test('見取図の下の枠：申請書の改修の内容（方眼の下の欄と同じ文。そのほかの行も）に、申請書にない平面図の番号を番号の順に足す', () => {
  // ユーザーの指示「改修の内容（申請書）…常時表示しておく・印刷時にも表示する」「（右の枠の一覧は）この部分は不要」2026-11-11
  const m: Madori = {
    ...emptyMadori(),
    legend: '手で直した古い一覧', // 右の枠を外したので使わない
    floors: [
      {
        id: 'f1',
        name: '1階',
        items: [
          room('a', 0, 0, 3 * M, 3 * M),
          {id: 'r1', kind: 'rail', x: 0, y: 0, w: 600, h: 0, place: 'p1'}, // 手すりには番号を付けない（前の版でつないだ箇所が残っていても）
          {id: 'n1', kind: 'num', x: 0, y: 0, w: 0, h: 0, place: 'p1'}, // ①（申請書の箇所につないだ番号）
          {id: 'n9', kind: 'num', x: 0, y: 0, w: 0, h: 0, n: 9, note: 'L＝900mm'}, // ⑨ 申請書にない番号（手で書いた文）
          {id: 'n5', kind: 'num', x: 0, y: 0, w: 0, h: 0, n: 5}, // ⑤ 申請書にない番号だけの部品
        ] as MItem[],
      },
    ],
  };
  const list = [
    {id: 'p2', photo: 2, name: 'トイレ', line: '②トイレ　手すりの取り付け　L=1500mm\n　　　　 ベースプレート　1800mm'},
    {id: 'p1', photo: 1, name: '屋外', line: '①屋外　手すりの取り付け　L=600mm'},
  ];
  const byId = new Map(list.map((w) => [w.id, w]));
  const look = {no: (id: string) => byId.get(id)?.photo, line: (id: string) => byId.get(id)?.line, byNo: (n: number) => list.find((w) => w.photo === n)?.line, list};
  assert.deepEqual(sheetWorks(m, m.floors, look), [
    '①屋外　手すりの取り付け　L=600mm',
    '②トイレ　手すりの取り付け　L=1500mm',
    '　　　　 ベースプレート　1800mm',
    '⑤',
    '⑨L＝900mm',
  ]);
  // 申請書の箇所がなく、平面図にも番号がなければ枠は出さない
  const empty = {no: none, line: none, byNo: none, list: []};
  const plain: Madori = {...emptyMadori(), floors: [{id: 'f1', name: '1階', items: [room('a', 0, 0, M, M)]}]};
  assert.deepEqual(sheetWorks(plain, plain.floors, empty), []);
  assert.equal(sheetLayout(plain.floors, []).legend, null);
  // 下げたそのほかの行の半角のすき間がつぶれないように
  const lay = sheetLayout(m.floors, sheetWorks(m, m.floors, look));
  assert.match(pageSvg(m, m.floors, lay, sheetWorks(m, m.floors, look), look.no, 'p'), /xml:space="preserve"[^>]*>　　　　 ベースプレート/);
});

test('2階建て：1枚に1階・2階を並べる（見出し「1階」「2階」）。一覧は両方の階の番号', () => {
  // ユーザーの指示「2階を作成した際は、1階と2階の内容を1枚におさまるようにする」2026-11-10
  const m: Madori = {
    ...emptyMadori(),
    floors: [
      {id: 'f1', name: '1階', items: [room('a', 0, 0, 3 * M, 3 * M), {id: 'r1', kind: 'num', x: 0, y: 0, w: 0, h: 0, note: 'L＝600mm'}]},
      {id: 'f2', name: '2階', items: [room('b', 0, 0, 3 * M, 3 * M), {id: 'r2', kind: 'num', x: 0, y: 0, w: 0, h: 0, note: 'L＝900mm'}]},
    ],
  };
  assert.deepEqual(floorLegend(m, m.floors[1], none, none, false), ['②　L＝900mm']);
  const legend = sheetLegend(m, m.floors, none, none);
  assert.deepEqual(legend, ['①　L＝600mm', '②　L＝900mm']);
  const p = planSvg(m, m.floors, none);
  assert.match(p.svg, />1階</);
  assert.match(p.svg, />2階</);
  const lay = sheetLayout(m.floors, legend);
  // 正方形の階が2つ：縦の紙に縦に重ねる
  assert.equal(lay.landscape, false);
  assert.equal(lay.dir, 'col');
  const page = pageSvg(m, m.floors, lay, legend, none, 'p');
  assert.match(page, />1階</);
  assert.match(page, />2階</);
  assert.match(page, /②　L＝900mm/);
  // 横に長い階が2つ：横の紙でも縦の紙でも、平面図はいちばん大きく入る並べ方
  const flat: Madori = {...m, floors: m.floors.map((f) => ({...f, items: [room(`w${f.id}`, 0, 0, 8 * M, 2 * M)]}))};
  const lf = sheetLayout(flat.floors, []);
  assert.equal(lf.dir, 'col');
});

test('Excel：見取図を1シート（縦が基本）・一覧は赤い字・平面図は1つの画像（PNG。階をみな）', async () => {
  const m: Madori = {
    ...emptyMadori(),
    floors: [
      {id: 'f1', name: '1階', items: [room('a', 0, 0, 3 * M, 4 * M, '和室'), {id: 'r1', kind: 'num', x: 0, y: 0, w: 0, h: 0, note: 'L＝600mm'}]},
      {id: 'f2', name: '2階', items: [room('b', 0, 0, M, M)]},
      {id: 'f3', name: '3階', items: []},
    ],
  };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const seen: string[] = [];
  const r = await madoriXlsx(job(), defaultSettings(), m, async (svg) => (seen.push(svg), png));
  assert.equal(r.fileName, '見本花子様住宅改修平面図.xlsx');
  assert.equal(seen.length, 1);
  assert.match(seen[0], />1階</);
  assert.match(seen[0], />2階</);
  assert.ok(!seen[0].includes('3階')); // 何も描いていない 3階 は出さない
  const z = unzipSync(r.bytes);
  const wb = strFromU8(z['xl/workbook.xml']);
  assert.deepEqual([...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((x) => x[1]), ['平面図']);
  const s1 = strFromU8(z['xl/worksheets/sheet1.xml']);
  assert.match(s1, /orientation="portrait"/);
  // 行の高さは Excel の上限（409pt）まで（平面図の段は何行かに分ける）
  const hts = [...s1.matchAll(/<row [^>]*ht="([\d.]+)"/g)].map((x) => Number(x[1]));
  assert.ok(hts.length > 3 && Math.max(...hts) <= 409, JSON.stringify(hts));
  assert.match(s1, /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/); // 字体のちがう PC でも1枚に
  assert.match(s1, /fitToWidth="1" fitToHeight="1"/);
  assert.match(s1, /<drawing r:id="rId1"\/>/);
  // 下の枠は改修の内容の書き方（申請書の箇所がなければ、平面図の番号の部品の文）・いちばん上に「〇〇様邸」（太字・4つの列を結合）
  assert.match(s1, /①L＝600mm/);
  assert.match(s1, /<row r="1" [^>]*><c r="A1" s="\d+" t="inlineStr"><is><t xml:space="preserve">見本 花子様邸<\/t>/);
  assert.match(s1, /<mergeCell ref="A1:D1"\/>/);
  assert.ok(!/見取図|株式会社/.test(s1));
  assert.match(strFromU8(z['xl/styles.xml']), /FFE01B24/);
  // 下の枠の赤い字は、申請書の平面図の様式の下の欄と同じ 12pt（ユーザーの指摘「申請書の内容の部分の文字が小さい」2026-11-13。前は 9.5pt）
  const red = [...strFromU8(z['xl/styles.xml']).matchAll(/<font>((?:(?!<\/font>)[\s\S])*)<\/font>/g)].map((x) => x[1]).filter((f) => f.includes('FFE01B24'));
  assert.ok(red.length > 0 && red.every((f) => /<sz val="12"\/>/.test(f)), red.join(' | '));
  assert.deepEqual([...z['xl/media/image1.png']], [...png]);
  assert.match(strFromU8(z['[Content_Types].xml']), /Extension="png"/);
});

test('手すりの一筆の L 字：横へなぞって角で下へ曲げると1本の L 字（番号1つ・一覧は L型）。まっすぐ・ななめは今までどおり', async () => {
  const {railStroke} = await import('../../src/sasaoka/madori/edit.ts');
  const {railBend: bend, legendText: lt} = await import('../../src/sasaoka/madori/model.ts');
  const path = (pts: [number, number][]) => pts.map(([x, y]) => ({x, y}));
  // 横 600 → 下 800（壁なし）
  const L = railStroke({x: 1000, y: 1000}, {x: 1600, y: 1800}, path([[1000, 1000], [1300, 1000], [1600, 1000], [1600, 1400], [1600, 1800]]), []);
  assert.deepEqual(L, {x: 1000, y: 1000, w: 600, h: 0, len: 800, turn: 1});
  const it = {id: 'r', kind: 'rail' as const, ...L};
  assert.deepEqual(bend(it), {x: 1600, y: 1800});
  assert.equal(lt(it, () => undefined), 'L型　600×800mm');
  // 縦 700 → 左 500
  const L2 = railStroke({x: 2000, y: 0}, {x: 1500, y: 700}, path([[2000, 0], [2000, 350], [2000, 700], [1750, 700], [1500, 700]]), []);
  assert.deepEqual(L2, {x: 2000, y: 0, w: 0, h: 700, len: 500, turn: -1});
  // ななめにまっすぐ（角のそばを通らない）は1本の直線のまま
  const S = railStroke({x: 0, y: 0}, {x: 900, y: 600}, path([[0, 0], [450, 300], [900, 600]]), []);
  assert.equal('turn' in S, false);
  // 回すと2本目も一緒に回る（横の下向き → 縦の左向き）
  const {turnedItem} = await import('../../src/sasaoka/madori/edit.ts');
  const t = turnedItem(it, 455);
  assert.equal(t.h, 600);
  assert.equal(t.turn, -1);
});

// 平面図（📐 平面図のタブ。madori/）：広さ・番号・一覧（凡例）・読み込みの整え・壁への吸い付き・絵・見取図の紙・Excel。
// お客様・会社の値は架空のもの（見本 花子）だけ
import assert from 'node:assert/strict';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {cleanJobs} from '../../src/sasaoka/storage.ts';
import {copied, floorArea, hitTest, makeItem, moved, placeFixture, placeOpening, railLine, resized, turnedItem, walls} from '../../src/sasaoka/madori/edit.ts';
import {cleanMadori, emptyMadori, hasMadori, legendLines, legendText, numberItems, roomArea} from '../../src/sasaoka/madori/model.ts';
import type {Madori, MItem} from '../../src/sasaoka/madori/model.ts';
import {floorSvg} from '../../src/sasaoka/madori/render.ts';
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
  assert.equal(sheetText(job()).fileName, '見本花子様住宅改修見取図');
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
  // 「〇〇様邸」は大きく（9mm）、下の改修の内容は少し小さく（3.4mm から）（ユーザーの指示「〇〇様邸の部分を大きくする」「申請書の内容の部分はもう少し小さくする」2026-11-12）
  assert.match(page, /<text x="105" y="[\d.]+" font-size="9" font-weight="700" text-anchor="middle"[^>]*>見本花子様邸<\/text>/);
  assert.equal(lay.legend.fs, 3.4);
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
  assert.equal(r.fileName, '見本花子様住宅改修見取図.xlsx');
  assert.equal(seen.length, 1);
  assert.match(seen[0], />1階</);
  assert.match(seen[0], />2階</);
  assert.ok(!seen[0].includes('3階')); // 何も描いていない 3階 は出さない
  const z = unzipSync(r.bytes);
  const wb = strFromU8(z['xl/workbook.xml']);
  assert.deepEqual([...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((x) => x[1]), ['見取図']);
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

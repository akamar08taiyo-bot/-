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
import {areaOf, floorLegend, pageSvg, planSvg, sheetText} from '../../src/sasaoka/madori/sheet.ts';
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

test('番号：申請書の箇所につないだ手すりは写真番号、手で決めた番号はそのまま、ほかは空いている番号を置いた順に（階をまたいで通し）', () => {
  const f1 = {id: 'f1', name: '1階', items: [{id: 'a', kind: 'rail', x: 0, y: 0, w: 600, h: 0}, {id: 'b', kind: 'rail', x: 0, y: 0, w: 800, h: 0, place: 'p2'}, room('r', 0, 0, M, M)] as MItem[]};
  const f2 = {id: 'f2', name: '2階', items: [{id: 'c', kind: 'vrail', x: 0, y: 0, w: 0, h: 0, n: 5}, {id: 'd', kind: 'step', x: 0, y: 0, w: 600, h: 400}] as MItem[]};
  const nums = numberItems([f1, f2], (id) => (id === 'p2' ? 1 : undefined));
  assert.deepEqual(Object.fromEntries(nums), {b: 1, c: 5, a: 2, d: 3});
  assert.equal(nums.has('r'), false); // 部屋には番号を付けない
});

test('一覧（右の枠）：見本と同じ「①　L＝600mm」「L型　600×600mm」・申請書の箇所につなぐと改修の内容・手で直した一覧', () => {
  const items: MItem[] = [
    {id: 'a', kind: 'rail', x: 0, y: 0, w: 900, h: 0},
    {id: 'b', kind: 'rail', x: 0, y: 0, w: 0, h: -600, len: 600},
    {id: 'c', kind: 'vrail', x: 0, y: 0, w: 0, h: 0, len: 800},
    {id: 'd', kind: 'step', type: '踏み台', x: 0, y: 0, w: 600, h: 400},
    {id: 'e', kind: 'rail', x: 0, y: 0, w: 600, h: 0, place: 'p1'},
  ];
  const m = {floors: [{id: 'f', name: '1階', items}]};
  const lines = legendLines(m, (id) => (id === 'p1' ? 1 : undefined), (id) => (id === 'p1' ? '①玄関　手すりの取り付け　L=600mm' : undefined));
  assert.deepEqual(lines, ['①　玄関　手すりの取り付け　L=600mm', '②　L＝900mm', '③　L型　600×600mm', '④　縦手すり　L＝800mm', '⑤　踏み台　600×400mm']);
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
});

test('絵：床の柄・壁・名前と広さ・手すりの赤い線と番号。名前の字はエスケープする', () => {
  const items: MItem[] = [room('a', 0, 0, 3 * M, 4 * M, '和室'), {...room('b', 3 * M, 0, M, M, 'トイレ'), label: '<b>トイレ</b>'}, {id: 'r', kind: 'rail', x: 100, y: 100, w: 600, h: 0}];
  const svg = floorSvg(items, {module: 910, showArea: true, showDims: true, nums: new Map([['r', 1]]), pid: 't'});
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

test('見取図の紙：題名は「市区町村　○○様邸　住宅改修工事　見取図」、下に会社・営業所・担当者', () => {
  assert.equal(areaOf('福岡県行橋市大字見本1-1'), '行橋市');
  assert.equal(areaOf('福岡県福岡市博多区見本町1'), '博多区');
  assert.equal(areaOf('福岡県京都郡苅田町大字見本'), '苅田町');
  assert.equal(areaOf('北九州市小倉北区見本1'), '小倉北区');
  assert.equal(areaOf(''), '');
  const s = {...defaultSettings(), officeName: '見本営業所', staffList: ['見本 一郎']};
  const m: Madori = {...emptyMadori(), updatedAt: new Date(2026, 10, 9).getTime()};
  const t = sheetText(job(), s, m);
  assert.equal(t.title, '行橋市　見本 花子様邸　住宅改修工事　見取図');
  assert.equal(t.date, '2026年11月9日');
  assert.equal(t.footer, '太陽シルバーサービス株式会社　見本営業所　担当者：見本 一郎');
  assert.equal(t.fileName, '見本花子様住宅改修見取図');
});

test('2階建て：一覧はその階の番号だけ、平面図の絵は階を横に並べて「1階」「2階」', () => {
  const m: Madori = {
    ...emptyMadori(),
    floors: [
      {id: 'f1', name: '1階', items: [room('a', 0, 0, M, M), {id: 'r1', kind: 'rail', x: 0, y: 0, w: 600, h: 0}]},
      {id: 'f2', name: '2階', items: [room('b', 0, 0, M, M), {id: 'r2', kind: 'rail', x: 0, y: 0, w: 900, h: 0}]},
    ],
  };
  assert.deepEqual(floorLegend(m, m.floors[1], none, none, false), ['②　L＝900mm']);
  const p = planSvg(m, m.floors, none);
  assert.match(p.svg, />1階</);
  assert.match(p.svg, />2階</);
  const page = pageSvg(sheetText(job(), defaultSettings(), m), m, m.floors[0], ['①　L＝600mm'], none, '1階', 'p');
  assert.match(page, /住宅改修工事　見取図（1階）/);
  assert.match(page, /viewBox="0 0 297 210"/);
});

test('Excel：階ごとに1シート（A4横）・題名・一覧は赤い字・平面図は画像（PNG）', async () => {
  const m: Madori = {
    ...emptyMadori(),
    floors: [
      {id: 'f1', name: '1階', items: [room('a', 0, 0, 3 * M, 4 * M, '和室'), {id: 'r1', kind: 'rail', x: 0, y: 0, w: 600, h: 0}]},
      {id: 'f2', name: '2階', items: [room('b', 0, 0, M, M)]},
      {id: 'f3', name: '3階', items: []},
    ],
  };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const seen: string[] = [];
  const r = await madoriXlsx(job(), defaultSettings(), m, async (svg) => (seen.push(svg), png));
  assert.equal(r.fileName, '見本花子様住宅改修見取図.xlsx');
  assert.equal(seen.length, 2); // 何も描いていない 3階 は出さない
  const z = unzipSync(r.bytes);
  const wb = strFromU8(z['xl/workbook.xml']);
  assert.deepEqual([...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((x) => x[1]), ['1階', '2階']);
  const s1 = strFromU8(z['xl/worksheets/sheet1.xml']);
  assert.match(s1, /orientation="landscape"/);
  assert.match(s1, /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/); // 字体のちがう PC でも1枚に
  assert.match(s1, /fitToWidth="1" fitToHeight="1"/);
  assert.match(s1, /<drawing r:id="rId1"\/>/);
  assert.match(s1, /行橋市　見本 花子様邸　住宅改修工事　見取図（1階）/);
  assert.match(s1, /①　L＝600mm/);
  assert.match(strFromU8(z['xl/styles.xml']), /FFE01B24/);
  assert.deepEqual([...z['xl/media/image1.png']], [...png]);
  assert.match(strFromU8(z['[Content_Types].xml']), /Extension="png"/);
  assert.match(strFromU8(z['[Content_Types].xml']), /drawing2\.xml/);
  assert.match(strFromU8(z['xl/drawings/_rels/drawing2.xml.rels']), /image2\.png/);
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

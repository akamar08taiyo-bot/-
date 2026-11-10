// 申請書の箇所から平面図の置き場に部品を用意する（ユーザーの指示「申請書を事前に入力していた場合は、事前に空きスペースに用意する。
// ①横棒 ②塗り潰し丸記号など ③スロープ記号など、移動するだけで平面図が作成できる」2026-11-10）。お客様・寸法は架空の見本
import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyMadori} from '../../src/sasaoka/madori/model.ts';
import type {MItem} from '../../src/sasaoka/madori/model.ts';
import {stagedItems, stageItem} from '../../src/sasaoka/madori/stage.ts';
import type {Place, Row} from '../../src/sasaoka/types.ts';

const place = (id: string, kind: number, photo: number, over: Partial<Place> = {}): Place => ({id, name: '', rows: [], kind, photo, ...over});
const row = (name: string) => ({name}) as Row;

test('箇所ごとの部品：手すり＝横棒（長さは L）、縦手すり＝塗りつぶしの丸、段差の解消＝スロープ（踏み台なら横四角）、ほか＝番号', () => {
  assert.deepEqual(stageItem(place('a', 1, 1, {name: '玄関', dims: {l: '６００'}})), {id: 'stage-a', kind: 'rail', x: 0, y: 0, w: 600, h: 0, place: 'a'});
  assert.equal(stageItem(place('b', 1, 2, {name: 'トイレ', rows: [row('縦手すり I型 600mm')]})).kind, 'vrail');
  const slope = stageItem(place('c', 2, 3, {name: '屋外', dims: {w: '900', d: '1500'}}));
  assert.deepEqual([slope.kind, slope.type, slope.w, slope.h, slope.fill], ['step', 'スロープ', 900, 1500, undefined]);
  const stepBox = stageItem(place('d', 2, 4, {name: '玄関', shinseiText: '踏み台の設置'}));
  assert.deepEqual([stepBox.kind, stepBox.type, stepBox.fill], ['step', '踏み台', true]);
  assert.equal(stageItem(place('e', 3, 5, {name: '居室'})).kind, 'num');
  assert.equal(stageItem(place('f', 1, 6)).w, 800); // 長さがなければ 800mm
});

test('置き場：まだ図にない箇所だけを、図の右に縦に並べる（つないだ部品・同じ番号があれば出さない）', () => {
  const m = emptyMadori();
  const f = m.floors[0];
  const roomIt: MItem = {id: 'r', kind: 'room', type: '洋室', x: 0, y: 0, w: 3640, h: 2730};
  const linked: MItem = {id: 'x', kind: 'rail', x: 100, y: 100, w: 600, h: 0, place: 'a'};
  const num3: MItem = {id: 'n', kind: 'num', x: 500, y: 500, w: 0, h: 0, n: 3};
  f.items.push(roomIt, linked, num3);
  const places = [place('a', 1, 1), place('b', 1, 2, {dims: {l: '900'}}), place('c', 2, 3), place('d', 2, 4)];
  const list = places.map((p) => ({id: p.id, photo: p.photo, name: `見本${p.photo}`}));
  const no = (id: string) => places.find((p) => p.id === id)?.photo;
  const s = stagedItems(m.floors, f, places, list, no, 910);
  assert.deepEqual(s.items.map((it) => it.place), ['b', 'd']); // ①はつないである・③は番号がある
  assert.ok(s.items.every((it) => it.x > 3640)); // 図の右
  assert.ok(s.items[1].y > s.items[0].y); // 縦に並ぶ
  assert.ok(s.box && s.box.x > 3640);
  assert.deepEqual(s.labels.map((l) => l.text), ['見本2', '見本4']); // 部品の右に改修場所の名前
  assert.ok(s.labels.every((l) => s.box && l.x > s.box.x && l.x < s.box.x + s.box.w));
  // 全部図にあれば置き場は出さない
  const none = stagedItems(m.floors, f, [places[0]], [list[0]], no, 910);
  assert.deepEqual(none, {items: [], labels: [], box: null});
});

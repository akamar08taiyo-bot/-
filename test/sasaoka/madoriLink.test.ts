// 申請書の平面図の枠と平面図のタブを同じ図にする（ユーザーの指示「平面図は、申請書でもつくれるし、平面図専用からもつくれる。相互転記させる」2026-11-10）と、
// ど真ん中の道具（丸・横四角の塗りつぶし・横棒・自在棒）の計算。図・様邸はすべて架空のもの
import assert from 'node:assert/strict';
import test from 'node:test';
import {handlesOf, makeItem, resized} from '../../src/sasaoka/madori/edit.ts';
import {bounds, cleanMadori, emptyMadori} from '../../src/sasaoka/madori/model.ts';
import type {Madori, MItem} from '../../src/sasaoka/madori/model.ts';
import {floorSvg} from '../../src/sasaoka/madori/render.ts';
import {linkPlan, madoriHasPlan, planLinked, planSvg, planView, sheetFloors, withoutPlan, withPlanImage} from '../../src/sasaoka/madori/sheet.ts';
import {missingFrames} from '../../src/sasaoka/photoImport.ts';
import type {Job} from '../../src/sasaoka/types.ts';

const job = (extra: Partial<Job> = {}) => ({id: 'j', customer: '見本 花子', places: [], ...extra}) as unknown as Job;
const drawn = (): Madori => {
  const m = emptyMadori();
  m.floors[0].items.push({id: 'r', kind: 'room', type: '洋室', x: 0, y: 0, w: 2730, h: 3640});
  return m;
};
const ctx = {items: [] as MItem[], module: 910 as const, step: 455, tol: 120};

test('平面図のタブで描けば、申請書の枠はその図（つながる）。前の版で入れた図・枠から外したときはつながらない', () => {
  assert.equal(planLinked(job()), false); // 何も描いていない
  assert.equal(planLinked(job({madori: emptyMadori()})), false);
  assert.equal(planLinked(job({madori: drawn()})), true);
  assert.equal(planLinked(job({madori: drawn(), planPhoto: 'p-old'})), false);
  assert.equal(planLinked(job({madori: drawn(), planOff: true})), false);
  // つなぐ：前の版の図・書き込み・外した印を消す
  const j = linkPlan(job({madori: drawn(), planPhoto: 'p-old', planMarks: [], planOff: true}));
  assert.equal(j.planPhoto, undefined);
  assert.equal(j.planMarks, undefined);
  assert.equal(j.planOff, undefined);
  assert.equal(planLinked(j), true);
});

test('申請書の枠に入れた画像は、平面図の1階の「図に入れる下絵」（濃さ 1・長い辺 9100mm）。描いた部品はそのまま', () => {
  const j = withPlanImage(job({madori: drawn(), planPhoto: 'p-old'}), 'p-new', 1600, 1131);
  const u = j.madori!.floors[0].underlay!;
  assert.deepEqual(u, {photo: 'p-new', x: 0, y: 0, w: 9100, h: 6433, opacity: 1, print: true});
  assert.equal(j.madori!.floors[0].items.length, 1);
  assert.equal(j.planPhoto, undefined);
  assert.equal(planLinked(j), true);
  // 何も描いていない様邸でも、図だけで申請書の枠に出る
  const k = withPlanImage(job(), 'p1', 900, 1600);
  assert.equal(madoriHasPlan(k.madori), true);
  assert.deepEqual(planView(k.madori!.floors[0]), {x: 0, y: 0, w: 5119, h: 9100});
  assert.equal(sheetFloors(k.madori!).length, 1);
  // 読み直しても「図に入れる」は残る
  assert.equal(cleanMadori(JSON.parse(JSON.stringify(k.madori)))!.floors[0].underlay!.print, true);
});

test('図に入れる下絵は申請書・印刷・Excel の絵に描く（なぞるための下絵は描かない）', () => {
  const k = withPlanImage(job(), 'p1', 1600, 1131);
  const p = planSvg(k.madori!, sheetFloors(k.madori!), () => undefined, 'sp', {p1: 'data:image/jpeg;base64,AAAA'});
  assert.ok(p.svg.includes('<image href="data:image/jpeg;base64,AAAA" x="0" y="0" width="9100" height="6433"'));
  const tracing = {...k.madori!, floors: [{...k.madori!.floors[0], underlay: {...k.madori!.floors[0].underlay!, print: undefined}}]};
  assert.ok(!planSvg(tracing, sheetFloors(tracing), () => undefined, 'sp', {p1: 'data:x'}).svg.includes('<image'));
  assert.equal(madoriHasPlan(tracing), false);
});

test('申請書の枠の図を消す：描いた部品があれば平面図のタブの図は残して枠から外す。画像だけなら画像も外す', () => {
  const both = withPlanImage(job({madori: drawn()}), 'p1', 1600, 1131);
  const off = withoutPlan(both);
  assert.equal(off.planOff, true);
  assert.equal(off.madori!.floors[0].items.length, 1);
  assert.equal(planLinked(off), false);
  const only = withoutPlan(withPlanImage(job(), 'p1', 1600, 1131));
  assert.equal(only.planOff, undefined);
  assert.equal(only.madori!.floors[0].underlay, undefined);
  assert.equal(madoriHasPlan(only.madori), false);
  // 前の版の図は消す
  assert.equal(withoutPlan(job({planPhoto: 'p-old', planMarks: []})).planPhoto, undefined);
});

test('取り込み：平面図のタブの図が申請書に出ていれば、平面図の枠は空きではない', () => {
  const frames = [{photo: 0, slot: 'plan' as const}];
  assert.equal(missingFrames(job(), frames, {} as never).length, 1);
  assert.equal(missingFrames(job({madori: drawn()}), frames, {} as never).length, 0);
});

test('丸（縦手すり）：押すと 150mm の丸・なぞると大きさと形（だ円）・角のつまみで変える', () => {
  const dot = makeItem({t: 'vrail'}, {x: 1000, y: 1000}, {x: 1000, y: 1000}, true, ctx)!;
  assert.deepEqual(bounds(dot), {x: 925, y: 925, w: 150, h: 150});
  const oval = makeItem({t: 'vrail'}, {x: 1000, y: 1000}, {x: 1600, y: 1300}, false, ctx)!;
  assert.deepEqual([oval.x, oval.y, oval.w, oval.h], [1300, 1150, 600, 300]);
  assert.ok(floorSvg([oval], {module: 910, showDims: false, showArea: false, nums: new Map()}).includes('<ellipse cx="1300" cy="1150" rx="300" ry="150" fill="#0070c0"/>'));
  assert.deepEqual(handlesOf(dot).map((h) => h.h), ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  const big = resized(dot, 'se', {x: 1300, y: 1300}, 455);
  assert.deepEqual([big.x, big.y, big.w, big.h], [1112.5, 1112.5, 375, 375]);
});

test('横四角（塗りつぶし）：なぞった大きさの青い四角・横棒はなぞっても曲げない', () => {
  const box = makeItem({t: 'step', type: '踏み台', fill: true}, {x: 0, y: 0}, {x: 900, y: 450}, false, ctx)!;
  assert.equal(box.fill, true);
  assert.deepEqual([box.w, box.h], [900, 450]);
  const svg = floorSvg([box], {module: 910, showDims: false, showArea: false, nums: new Map()});
  assert.ok(svg.includes('<rect width="900" height="450" stroke="#0070c0" stroke-width="22" fill="#0070c0"/>'));
  const path = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({x: 1000 + i * 100, y: 1000 + (i > 5 ? (i - 5) * 150 : 0)}));
  const bar = makeItem({t: 'rail', straight: true}, path[0], path[path.length - 1], false, {...ctx, path})!;
  assert.equal(bar.pts, undefined);
  assert.equal(bar.len, undefined);
  assert.equal(bar.h, 0);
  // 自在棒は同じなぞり方で曲がる
  const free = makeItem({t: 'rail', free: true}, path[0], path[path.length - 1], false, {...ctx, path})!;
  assert.ok(free.pts || free.len);
});

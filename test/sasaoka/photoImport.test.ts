// 取り込んだ申請書の写真貼付用紙・平面図の写真と書き込み（photoImport.ts）。ユーザーの指示「申請書などを取り込んだときに、一括で写真などもと取り込めるようにする」2026-10-28。
// 申請書はこのアプリの書き出し（架空の見本 山田 太郎）に、Excel で足したような図形（2枚目の写真・黄色のフリーフォーム・テキストボックス）を足して作る
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {dateOf} from '../../src/sasaoka/importDocs.ts';
import {frameLayout, missingFrames, readShinseiPhotos, withImportedPhotos} from '../../src/sasaoka/photoImport.ts';
import {fillShinsei, SHINSEI, shinseiValues} from '../../src/sasaoka/shinsei.ts';
import {withExcelShapes} from './photoFixture.ts';
import type {Job, PhotoMark, Place, Row} from '../../src/sasaoka/types.ts';

const RATES = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateOverheadRate: 0.1, taxRate: 0.1};
const blank = {code: '', maker: '', unit: '', price: 0, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
let seq = 0;
const mat = (name: string): Row => ({...blank, id: `r${++seq}`, kind: 'material', refId: null, name, qty: 1, listPrice: 10000});
const place = (name: string, extra: Partial<Place> = {}): Place => ({id: `p${++seq}`, name, rows: [mat('見本の手すり')], kind: 1, photo: 0, ...extra});
const job = (extra: Partial<Job> = {}): Job => ({
  id: 'j1',
  month: '2026-10',
  customer: '山田 太郎',
  suffix: '様邸',
  staff: '',
  date: '',
  address: '福岡県京都郡苅田町富久町1-1',
  note: '',
  insuredNo: '0000000001',
  insurer: 'kanda',
  form: 'yukuhashi',
  overhead: null,
  overheadTarget: null,
  shikiri: true,
  places: [place('浴室', {photoDates: {before: '2026-10-21'}}), place('玄関')],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const KANDA = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/kanda.xltx', import.meta.url)));
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 0xff, 0xd9]);
const base = {line: 'FF0000', width: 2.25, dash: 'solid', fill: '', size: 11, color: '000000'} as const;
const MARKS: PhotoMark[] = [
  {...base, id: 'a', kind: 'line', x1: 0.1, y1: 0.9, x2: 0.6, y2: 0.2, end: true, line: '0070C0', width: 4.5},
  {...base, id: 'b', kind: 'rect', x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.5, fill: 'FFFF00'},
  {...base, id: 'c', kind: 'text', x1: 0.5, y1: 0.05, x2: 0.95, y2: 0.25, text: '手すり L=800mm', size: 14, color: '00B050', fill: 'FFFFFF', line: ''},
  {...base, id: 'd', kind: 'ellipse', x1: 0.7, y1: 0.6, x2: 0.9, y2: 0.8},
];
const written = () => fillShinsei(KANDA, SHINSEI.kanda!, {...shinseiValues(job(), RATES), photoImages: {1: {before: {bytes: jpeg(1), w: 1600, h: 1200, marks: MARKS}, after: {bytes: jpeg(2), w: 900, h: 1600}}}});

test('このアプリで書いた申請書：写真番号の改修前・改修後の写真と書き込み（写真の中の割合はそのまま）・撮影日。「改修前の説明」は読まない', () => {
  const frames = readShinseiPhotos(written(), 'kanda');
  assert.deepEqual(
    frames.map((f) => [f.photo, f.slot, f.pics.length]),
    [
      [1, 'before', 1],
      [1, 'after', 1],
    ],
  );
  const [before, after] = frames;
  assert.deepEqual([...before.pics[0].bytes], [...jpeg(1)]);
  assert.equal(before.pics[0].type, 'image/jpeg');
  assert.equal(dateOf(before.date), '2026-10-21');
  const {region, marks} = frameLayout(before);
  // 書き込みは写真の中なので、範囲は写真の四角。割合は書いたとおり（0.01 まで）
  assert.ok(Math.abs(region.w / region.h - 1600 / 1200) < 0.01);
  assert.deepEqual(
    marks.map((m) => m.kind),
    MARKS.map((m) => m.kind),
  );
  for (const [i, m] of marks.entries()) {
    const w = MARKS[i];
    for (const k of ['x1', 'y1', 'x2', 'y2'] as const) assert.ok(Math.abs(m[k] - w[k]) < 0.01, `${w.kind} ${k} ${m[k]} / ${w[k]}`);
    assert.deepEqual([m.line, m.fill], [w.line, w.fill], w.kind);
    if (w.line) assert.equal(m.width, w.width, w.kind); // 線のない図形の太さは使わない
  }
  assert.equal(marks[0].end, true);
  assert.deepEqual([marks[2].text, marks[2].size, marks[2].color], ['手すり L=800mm', 14, '00B050']);
  assert.ok(!marks.some((m) => /手すりの取り付け/.test(m.text ?? ''))); // 写真に書く内容（改修前の説明）は自動の文で書き直すので読まない
  assert.equal(after.marks.length, 0);
});

test('Excel で足した図形：同じ枠の2枚目の写真（回した・切り抜いた）・フリーフォームは1本ずつの直線（黄色 3pt）・テキストボックス。文字のないテキストボックスは読まない', () => {
  const frames = readShinseiPhotos(withExcelShapes(written()), 'kanda');
  const before = frames.find((f) => f.photo === 1 && f.slot === 'before')!;
  assert.equal(before.pics.length, 2);
  const second = before.pics[1];
  assert.equal(second.rot, 90);
  assert.equal(second.crop.l, 0.1);
  assert.ok(Math.abs(second.box.w - 1600000 / 9525) < 0.5 && Math.abs(second.box.h - 1200000 / 9525) < 0.5);
  const lines = before.marks.filter((m) => m.kind === 'line' && m.line === 'FFFF00');
  assert.equal(lines.length, 2); // 3つの点 → 2本
  assert.deepEqual([lines[0].width, lines[1].width], [3, 3]);
  // 1本目の終わり＝2本目の始まり（つながっている）。1本目は左下から上へ
  assert.ok(Math.abs(lines[0].x2 - lines[1].x1) < 0.01 && Math.abs(lines[0].y2 - lines[1].y1) < 0.01);
  assert.ok(lines[0].y1 > lines[0].y2);
  const texts = before.marks.filter((m) => m.kind === 'text');
  assert.deepEqual(
    texts.map((m) => [m.text, m.size, m.color, m.fill, m.line]),
    [
      ['手すり L=800mm', 14, '00B050', 'FFFFFF', ''],
      ['見本 L=600mm', 16, '000000', '', ''],
    ],
  );
  // 範囲は2枚の写真と書き込みを囲む（枠の中だけ）。書き込みは範囲の中の割合
  const {region, marks} = frameLayout(before);
  assert.ok(region.w > 0 && region.h > 0 && region.x >= before.frame.x && region.x + region.w <= before.frame.x + before.frame.w + 0.01);
  assert.ok(marks.every((m) => [m.x1, m.y1, m.x2, m.y2].every((v) => v >= 0 && v <= 1)));
});

test('様邸に入れる：写真番号の箇所の空いた枠だけ（入っている写真は変えない）・書き込み・撮影日（入っていなければ）・平面図', () => {
  const j = job({places: [place('浴室', {photos: {after: 'ph-old'}}), place('玄関')], planPhoto: undefined});
  const frames = [
    {photo: 1, slot: 'before' as const, id: 'ph-1b', marks: [MARKS[0]], date: '2026-10-21'},
    {photo: 1, slot: 'after' as const, id: 'ph-1a', marks: [], date: ''},
    {photo: 2, slot: 'before' as const, id: 'ph-2b', marks: [], date: ''},
    {photo: 9, slot: 'before' as const, id: 'ph-9b', marks: [], date: ''}, // 写真番号⑨の箇所はない
    {photo: 0, slot: 'plan' as const, id: 'ph-plan', marks: [], date: ''},
  ];
  assert.deepEqual(
    missingFrames(j, frames, RATES).map((f) => f.id),
    ['ph-1b', 'ph-2b', 'ph-plan'],
  );
  const out = withImportedPhotos(j, frames, RATES);
  assert.deepEqual(out.places[0].photos, {after: 'ph-old', before: 'ph-1b'});
  assert.deepEqual(out.places[0].photoMarks, {before: [MARKS[0]]});
  assert.deepEqual(out.places[0].photoDates, {before: '2026-10-21'});
  assert.deepEqual(out.places[1].photos, {before: 'ph-2b'});
  assert.equal(out.places[1].photoMarks, undefined);
  assert.equal(out.planPhoto, 'ph-plan');
  // もう一度入れても変わらない（前に取り込んだ申請書の写真だけを入れるときも、空いた所だけ）
  assert.deepEqual(missingFrames(out, frames, RATES), []);
  assert.deepEqual(withImportedPhotos(out, frames.map((f) => ({...f, id: `${f.id}-2`})), RATES), out);
});

test('平面図の図も読む（4つの保険者。図だけ・写真の枠の写真とは別）', () => {
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) {
    const tmpl = new Uint8Array(readFileSync(new URL(`../../src/sasaoka/shinsei/${insurer}.xltx`, import.meta.url)));
    const out = fillShinsei(tmpl, SHINSEI[insurer]!, {...shinseiValues(job({insurer}), RATES), planImage: {bytes: jpeg(9), w: 1600, h: 1131}});
    const frames = readShinseiPhotos(out, insurer);
    assert.deepEqual(
      frames.map((f) => [f.photo, f.slot, f.pics.length, f.marks.length]),
      [[0, 'plan', 1, 0]],
      insurer,
    );
    assert.deepEqual([...frames[0].pics[0].bytes], [...jpeg(9)]);
  }
});

// 平面図の階段の種類（ユーザーの指示「階段の種類は増やす」2026-11-10）と、曲がる向きの左右反転。図はすべて架空のもの
import assert from 'node:assert/strict';
import test from 'node:test';
import {STAIR_TYPES} from '../../src/sasaoka/madori/catalog.ts';
import {makeItem, turnedItem} from '../../src/sasaoka/madori/edit.ts';
import {bounds, cleanMadori} from '../../src/sasaoka/madori/model.ts';
import type {MItem} from '../../src/sasaoka/madori/model.ts';
import {floorSvg, thumbSvg} from '../../src/sasaoka/madori/render.ts';

const ctx = {items: [] as MItem[], module: 910 as const, step: 455};
const draw = (it: MItem) => floorSvg([it], {module: 910, showDims: false, showArea: false, nums: new Map()});

test('階段は9種類（前の5つ＋折返し回り・直階段（踊り場）・らせん・外階段（3段））。先頭は前と同じ折返し階段', () => {
  assert.deepEqual(
    STAIR_TYPES.map((s) => s.name),
    ['折返し階段', '折返し回り階段', 'L字階段', '回り階段', '直階段', '直階段（踊り場）', 'コ字階段', 'らせん階段', '外階段（3段）'],
  );
  // どの絵もちがう形で、壊れた数（NaN・Infinity）がない
  const svgs = STAIR_TYPES.map((s) => thumbSvg('stair', s.name, s.size[0] * 910, s.size[1] * 910));
  assert.equal(new Set(svgs).size, svgs.length);
  for (const svg of svgs) assert.ok(!/NaN|Infinity/.test(svg), svg);
  // 知らない種類は折返し階段で置く
  assert.equal(makeItem({t: 'stair', type: 'ない階段'}, {x: 0, y: 0}, {x: 0, y: 0}, true, ctx)?.type, '折返し階段');
});

test('押して置くと種類ごとの大きさ（らせん 2×2 マス・外階段 1.5×1 マス・直階段（踊り場） 1×5 マス）', () => {
  const at = (type: string) => {
    const it = makeItem({t: 'stair', type}, {x: 910, y: 910}, {x: 910, y: 910}, true, ctx)!;
    return [it.w, it.h];
  };
  assert.deepEqual(at('らせん階段'), [1820, 1820]);
  assert.deepEqual(at('外階段（3段）'), [1365, 910]);
  assert.deepEqual(at('直階段（踊り場）'), [910, 4550]);
});

test('らせん階段は丸と12段・外階段（3段）は段の線が2本・直階段（踊り場）は踊り場の線が2本', () => {
  const spiral = draw({id: 's', kind: 'stair', type: 'らせん階段', x: 0, y: 0, w: 1820, h: 1820});
  assert.equal((spiral.match(/<circle /g) ?? []).length, 2);
  const rays = spiral.match(/<path d="((?:M[^"]*)+)" stroke="[^"]+" stroke-width="10"\/>/)?.[1] ?? '';
  assert.equal((rays.match(/M/g) ?? []).length, 12);
  const out = draw({id: 'o', kind: 'stair', type: '外階段（3段）', x: 0, y: 0, w: 1365, h: 910});
  assert.ok(out.includes('<path d="M0 303.3H1365M0 606.7H1365"'), out);
  const landing = draw({id: 'l', kind: 'stair', type: '直階段（踊り場）', x: 0, y: 0, w: 910, h: 4550});
  assert.ok(landing.includes('<path d="M0 1820H910M0 2730H910" stroke="#203a55" stroke-width="16"/>'), landing);
});

test('左右反転：四角の中で左右を入れかえる（回しても・読み直しても残る）。大きさ・場所は同じ', () => {
  const it: MItem = {id: 'a', kind: 'stair', type: 'L字階段', x: 910, y: 0, w: 1820, h: 2730, flip: true};
  assert.ok(draw(it).includes('<g transform="translate(910 0) translate(1820 0) scale(-1 1)">'));
  assert.ok(!draw({...it, flip: undefined}).includes('scale(-1 1)'));
  const tn = turnedItem(it, 455);
  assert.equal(tn.flip, true);
  assert.ok(draw(tn).includes('rotate(90 910 1365) translate(1820 0) scale(-1 1)'));
  assert.deepEqual(bounds(it), bounds({...it, flip: undefined}));
  const m = cleanMadori({module: 910, snap: 2, floors: [{id: 'f', name: '1階', items: [it]}], optRev: 2})!;
  assert.equal(m.floors[0].items[0].flip, true);
});

#!/usr/bin/env node
// 「存在しない街」の設定（街のカード）を組み合わせて作る。過去の回とかぶらないように台帳を見る。
//
// 使い方:
//   node town-seed.mjs [--count 3] [--seed 123] [--registry <シリーズ>/towns.json] [--out <エピソードのフォルダ>]
//     → 候補のカードを出す。--out を付けると 1 枚目を <out>/town.json に保存
//   node town-seed.mjs --register <エピソードのフォルダ>/town.json --registry <シリーズ>/towns.json [--no 3] [--title "…"] [--url "…"]
//     → 完成した回を台帳に記録（次から名前・要素がかぶらないようにする）
//
// 材料は references/town-elements.json。カードは「たたき台」なので、良くなるなら自由に書き換えてよい。
// 生成した町名は、実在の自治体・有名な地名でないかを必ず検索で確かめる（blocklist は一部だけ）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, writeJson, ensureDir } from './lib/common.mjs';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EL = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'town-elements.json'), 'utf8'));
const args = parseArgs(process.argv.slice(2), { flags: ['help', 'json'] });

if (args.help) {
  console.log('node town-seed.mjs [--count 3] [--seed N] [--registry towns.json] [--out DIR]\nnode town-seed.mjs --register DIR/town.json --registry towns.json [--no N] [--title T] [--url U]');
  process.exit(0);
}

function loadRegistry(file) {
  if (!file) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

// ───── 台帳への記録 ─────
if (args.register) {
  if (!args.registry) {
    console.error('--registry <towns.json> を指定してください');
    process.exit(1);
  }
  const card = JSON.parse(fs.readFileSync(path.resolve(args.register), 'utf8'));
  const reg = loadRegistry(args.registry);
  if (reg.some((r) => r.name === card.name)) {
    console.error(`「${card.name}」はもう台帳にあります`);
    process.exit(1);
  }
  const entry = {
    no: Number(args.no) || reg.length + 1,
    name: card.name,
    reading: card.reading,
    title: args.title || null,
    url: args.url || null,
    date: new Date().toISOString().slice(0, 10),
    terrain: card.terrain,
    era: card.era,
    seasonTime: card.seasonTime,
    character: card.character,
    places: card.places,
    sounds: card.sounds,
    palette: card.palette,
    viewpoint: card.viewpoint,
    uncanny: card.uncanny,
  };
  reg.push(entry);
  ensureDir(path.dirname(path.resolve(args.registry)));
  writeJson(path.resolve(args.registry), reg);
  console.log(`台帳に記録しました：#${entry.no} ${entry.name}（全 ${reg.length} 件）`);
  process.exit(0);
}

// ───── 組み合わせ ─────
/** 再現できる乱数（同じ seed なら同じ街） */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const registry = loadRegistry(args.registry && path.resolve(args.registry));
const recent = registry.slice(-5);
const usedNames = new Set(registry.map((r) => r.name));
const recentUse = (key) => new Set(recent.flatMap((r) => [].concat(r[key] ?? []).map((x) => (Array.isArray(x) ? x[0] : x))));

const C = EL.constraints || {};
/** 立地・季節と合わない要素を外す */
function fits(item, ctx) {
  const v = Array.isArray(item) ? item[0] : item;
  if (!ctx) return true;
  if ((C.coastalOnly || []).includes(v) && !ctx.coastal) return false;
  if ((C.waterOnly || []).includes(v) && !ctx.coastal && !ctx.water) return false;
  if ((C.summerOnly || []).includes(v) && ctx.season !== 'summer') return false;
  if ((C.winterOnly || []).includes(v) && ctx.season !== 'winter') return false;
  return true;
}

/** 直近 5 回で使った要素を避けて選ぶ（全部使っていたら気にせず選ぶ） */
function pick(r, list, key, n = 1, ctx = null) {
  const avoid = recentUse(key);
  const label = (x) => (Array.isArray(x) ? x[0] : x);
  list = list.filter((x) => fits(x, ctx));
  let pool = list.filter((x) => !avoid.has(label(x)));
  if (pool.length < n) pool = [...list];
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(r() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return n === 1 ? out[0] : out;
}

function makeName(r) {
  for (let tries = 0; tries < 200; tries++) {
    const h = EL.name.head[Math.floor(r() * EL.name.head.length)];
    const t = EL.name.tail[Math.floor(r() * EL.name.tail.length)];
    const sfx = EL.name.suffix[Math.floor(r() * EL.name.suffix.length)];
    const stem = h[0] + t[0];
    if (EL.name.blocklist.includes(stem)) continue;
    const name = stem + sfx[0];
    if (usedNames.has(name)) continue;
    return { name, reading: h[1] + t[1] + sfx[1], stem };
  }
  throw new Error('名前の組み合わせが尽きました（town-elements.json の name に材料を足してください）');
}

function makeCard(seed) {
  const r = rng(seed);
  const nm = makeName(r);
  const terrain = pick(r, EL.terrain, 'terrain');
  const era = pick(r, EL.era, 'era');
  const seasonTime = pick(r, EL.seasonTime, 'seasonTime');
  const ctx = {
    coastal: (C.coastalTerrain || []).includes(terrain),
    water: (C.waterTerrain || []).includes(terrain),
    season: (C.winterSeason || []).includes(seasonTime) ? 'winter' : (C.summerSeason || []).includes(seasonTime) ? 'summer' : 'other',
  };
  const palette = pick(r, EL.palette, 'palette', 1, ctx);
  const year = era[1] ? era[1] + Math.floor(r() * 4) : null;
  return {
    seed,
    name: nm.name,
    reading: nm.reading,
    terrain,
    character: pick(r, EL.character, 'character', 1, ctx),
    era: era[0],
    year,
    seasonTime,
    places: pick(r, EL.places, 'places', 4, ctx),
    sounds: pick(r, EL.sounds, 'sounds', 3, ctx),
    palette: palette[0],
    grade: palette[1],
    viewpoint: pick(r, EL.viewpoint, 'viewpoint'),
    fragments: pick(r, EL.fragments, 'fragments', 3, ctx),
    uncanny: pick(r, EL.uncanny, 'uncanny'),
  };
}

function toMarkdown(c, k) {
  return [
    `## 候補 ${k}：${c.name}（${c.reading}）  seed=${c.seed}`,
    `- 立地：${c.terrain}`,
    `- 町の性格：${c.character}`,
    `- 時代：${c.era}${c.year ? `（${c.year}年ごろ）` : ''}／${c.seasonTime}`,
    `- 場所：${c.places.join('・')}`,
    `- 音：${c.sounds.join('・')}`,
    `- 色：${c.palette}（look.grade の目安：${c.grade}）`,
    `- 視点：${c.viewpoint}`,
    `- 記憶の断片：${c.fragments.join('／')}`,
    `- 少しだけ不思議なこと：${c.uncanny}`,
  ].join('\n');
}

const count = Math.max(1, Number(args.count) || 3);
const base = Number.isFinite(Number(args.seed)) && args.seed !== undefined ? Number(args.seed) : Math.floor(Date.now() % 1e9);
const cards = [];
for (let k = 0; k < count; k++) {
  const c = makeCard(base + k * 7919);
  usedNames.add(c.name); // 候補どうしも名前をかぶらせない
  cards.push(c);
}

if (args.out) {
  const dir = ensureDir(path.resolve(args.out));
  writeJson(path.join(dir, 'town.json'), cards[0]);
}
if (args.json) console.log(JSON.stringify(cards, null, 2));
else {
  console.log(cards.map((c, k) => toMarkdown(c, k + 1)).join('\n\n'));
  console.log(
    `\n※ 町名は実在しないことを検索で確かめる（例：「${cards[0].name}」「${cards[0].name.slice(0, -1)}」）。台帳 ${registry.length} 件と照合済み` +
      (args.out ? `\n※ 候補 1 を ${path.join(path.resolve(args.out), 'town.json')} に保存。別の候補にするなら --seed <その seed> --count 1 --out で作り直す` : ''),
  );
}

#!/usr/bin/env node
// 街のカード（town.json）と動画の型（formats.json）から、1 本分の作業フォルダのひな形を作る：
//   episode.json（章・場面・つなぎ・動かす場面・環境音の骨組み。TODO を埋める）、plan.md（企画メモと見積もり）、
//   images/ clips/ voice/ audio/ out/
//
// 使い方:
//   node new-episode.mjs --town <エピソードのフォルダ>/town.json [--format cinematic|short|slow]
//                        [--minutes 20] [--chapters 8] [--no 3] [--series <シリーズのフォルダ>] [--force]
//
// 型は <シリーズ>/formats.json があればそれを、無ければスキルの references/formats.json を使う。
// --no を省くと、台帳（towns.json）の件数＋1。ショート版など同じ街の別版は、本編と同じ番号を --no で渡す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, writeJson, writeText, ensureDir } from './lib/common.mjs';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 想定内のエラーは、内部の情報を出さずにメッセージだけ表示する
process.on('uncaughtException', (e) => {
  console.error(`エラー：${e?.message || e}`);
  process.exit(1);
});

const args = parseArgs(process.argv.slice(2), { flags: ['help', 'force'] });
if (args.help || !args.town) {
  console.log('node new-episode.mjs --town <DIR>/town.json [--format cinematic|short|slow] [--minutes 20] [--chapters 8] [--no N] [--series DIR] [--force]');
  process.exit(args.help ? 0 : 1);
}

const townFile = path.resolve(args.town);
const town = JSON.parse(fs.readFileSync(townFile, 'utf8'));
const EP_DIR = path.dirname(townFile);
const SERIES = path.resolve(args.series || path.dirname(EP_DIR));
const seriesFormats = path.join(SERIES, 'formats.json');
const F = JSON.parse(fs.readFileSync(fs.existsSync(seriesFormats) ? seriesFormats : path.join(SKILL_DIR, 'references', 'formats.json'), 'utf8'));
const fmtName = args.format || 'cinematic';
const fmt = F[fmtName];
if (!fmt || !fmt.format) {
  console.error(`--format は ${Object.keys(F).filter((k) => F[k]?.format).join(' / ')} のどれか`);
  process.exit(1);
}
const epFile = path.join(EP_DIR, 'episode.json');
if (fs.existsSync(epFile) && !args.force) {
  console.error(`もうあります：${epFile}（上書きするなら --force。手で直した内容は消えます）`);
  process.exit(1);
}
let registryCount = 0;
try {
  registryCount = JSON.parse(fs.readFileSync(path.join(SERIES, 'towns.json'), 'utf8')).length;
} catch {
  /* 台帳がまだ無い */
}
const no = Number(args.no) || registryCount + 1;
const NNN = String(no).padStart(3, '0');
for (const d of ['images', 'clips', 'voice', 'audio', 'out']) ensureDir(path.join(EP_DIR, d));

// 決まった乱数（街の seed から。同じ街なら同じひな形）
let a = (Number(town.seed) || 1) >>> 0;
const r = () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pad2 = (n) => String(n).padStart(2, '0');

// ───── 章と場面の数 ─────
const minutes = Number(args.minutes) || fmt.minutes;
const nCh = Math.max(1, Number(args.chapters) || fmt.chapters);
const avgDur = (fmt.dur[0] + fmt.dur[1]) / 2;
const perCh = Math.max(3, Math.round((minutes * 60) / avgDur / nCh));
const themes = F.chapterThemes?.list || [{ theme: '町', season: '', time: '', hint: '{place}' }];
// 章の数に合わせてテーマを選ぶ（最初と最後は残し、間を等間隔に）
const pickThemes = (n) => {
  if (n === 1) return [themes[0]];
  if (n >= themes.length) return [...Array(n).keys()].map((k) => themes[k % themes.length]);
  return [...Array(n).keys()].map((k) => themes[Math.round((k * (themes.length - 1)) / (n - 1))]);
};
const chapters = pickThemes(nCh).map((t, c) => ({ ...t, no: c + 1, place: town.places[c % town.places.length] }));

// 距離の配分（遠景・中景・寄り・物のアップ）。各章の最初は遠景
const DIST = { wide: '遠景', medium: '中景', close: '寄り', detail: '物のアップ' };
const distBag = Object.entries(fmt.distance || { wide: 1, medium: 1 }).flatMap(([k, w]) => Array(w).fill(k));
const MOVE_FOR = { wide: ['in', 'right', 'left', 'still'], medium: ['still', 'in', 'right', 'left'], close: ['still', 'in', 'hold'], detail: ['hold', 'still'] };

const shots = [];
const chapterRanges = [];
let moveIdx = 0;
for (const ch of chapters) {
  const first = shots.length + 1; // 1 始まりの場面番号
  for (let k = 0; k < perCh; k++) {
    const dist = k === 0 ? 'wide' : distBag[Math.floor(r() * distBag.length)];
    const options = MOVE_FOR[dist] || fmt.moves;
    const move = options[moveIdx++ % options.length];
    const stem = `c${pad2(ch.no)}_${pad2(k + 1)}`;
    const s = {
      image: `images/${stem}.png`,
      prompt: `TODO（第${ch.no}章「${ch.theme}」${ch.season}・${ch.time}／${ch.hint.replace('{place}', ch.place)}／${DIST[dist]}）`,
      dur: Math.round((fmt.dur[0] + r() * (fmt.dur[1] - fmt.dur[0])) * 2) / 2,
      move,
    };
    const isChapterHead = k === 0 && shots.length > 0;
    const tr = isChapterHead ? fmt.betweenChapters : fmt.inChapter;
    if (shots.length > 0) {
      s.transition = tr.transition;
      if (tr.transitionDur) s.transitionDur = tr.transitionDur;
    }
    // AI 動画にする候補（clipEvery 場面ごと。物のアップは静止画のままでも成立しやすいので外す）
    if (fmt.clipEvery && k % fmt.clipEvery === 2 && dist !== 'detail') {
      s.video = `clips/${stem}.mp4`;
      s.motion = 'TODO（動き：例 遠くを人がゆっくり横切る・湯気が立ちのぼる・電車が奥を通る。カメラはほぼ固定）';
    }
    shots.push(s);
  }
  chapterRanges.push({ ...ch, first, last: shots.length });
}

// 最初の場面に、町名と時代の小さなテロップ（このチャンネルの名札）
if (fmt.openingCaption && shots[0]) {
  shots[0].caption = `${town.name}${town.year ? `\n${town.year}年` : ''}`;
  shots[0].captionStart = 1.5;
}
if (fmt.titleCard) shots.unshift({ card: { title: town.name, subtitle: `存在しない街の記憶 #${NNN}` }, dur: fmt.titleCard.dur });
if (fmt.endCard) shots.push({ card: { title: town.name, subtitle: fmt.endCard.subtitle }, dur: fmt.endCard.dur, transition: 'fadeblack', transitionDur: 2 });
const offset = fmt.titleCard ? 1 : 0; // タイトルカードがあると場面番号が 1 つずれる
const lastShot = shots.length;

// ───── 音：ずっと鳴る下地＋章ごとの環境音（街のカードの音＋章のテーマの音） ─────
const P = F.soundPresets || {};
const TS = F.themeSounds || {};
const ambience = [];
const kinds = new Map(); // 種類 → 必要な長さ（秒）
const span = (s1, s2) => shots.slice(s1 - 1, s2 - 1).reduce((acc, s) => acc + s.dur, 0);
const bedKind = /工場|造船|製氷|炭鉱|鉄道|乗り換え|窯/.test(town.character) ? 'hum' : 'room';
const totalSec = shots.reduce((acc, s) => acc + s.dur, 0);
ambience.push({ file: `audio/amb_${bedKind}.wav`, gain: fmt.audio.bedGain ?? 4, _note: '下地（ずっと薄く鳴る）' });
kinds.set(bedKind, Math.ceil(totalSec) + 5);
const unmapped = [];
const townKinds = (town.sounds || []).map((s) => ({ s, k: P[s] })).filter((x) => (x.k ? true : (unmapped.push(x.s), false)));
chapterRanges.forEach((ch, c) => {
  const add = new Set(TS[ch.theme] || []);
  // 街のカードの音を章に配る
  townKinds.forEach((x, j) => {
    if (Math.floor((j * chapterRanges.length) / townKinds.length) === c || chapterRanges.length < townKinds.length) add.add(x.k);
  });
  add.delete(bedKind);
  // 下地のほかに何も無い章には、季節の音を 1 つ足す
  if (!add.size) add.add({ 春: 'birds', 夏: 'cicada', 秋: 'crickets', 冬: 'wind' }[ch.season] || 'wind');
  const from = ch.first + offset;
  const to = ch.last + offset + 1;
  for (const k of add) {
    const accent = ['crossing', 'chime', 'clock', 'train'].includes(k);
    ambience.push({
      file: `audio/amb_${k}.wav`,
      gain: (fmt.audio.ambienceGain ?? 6) - (accent ? 2 : 0),
      from: `shot:${from}`,
      ...(to <= lastShot ? { to: `shot:${to}` } : {}),
      _note: `第${ch.no}章「${ch.theme}」`,
    });
    kinds.set(k, Math.max(kinds.get(k) || 0, Math.ceil(span(from, Math.min(to, lastShot + 1))) + 5));
  }
});

// 語り（型が語りありのときだけ）。テロップのある場面・文字だけの場面は避ける
const narr = fmt.narration && fmt.narration !== 'none' && !/語り手はいない/.test(town.viewpoint || '');
const voice = [];
if (narr) {
  const lines = fmtName === 'short' ? 3 : 8;
  for (let j = 0; j < lines; j++) {
    let t = Math.min(lastShot, 2 + offset + Math.round((j * shots.length) / lines));
    while (t < lastShot && (shots[t - 1].caption || shots[t - 1].card)) t++;
    voice.push({ file: `voice/v${pad2(j + 1)}.wav`, at: `shot:${t}+0.8`, text: 'TODO' });
  }
}

const ep = {
  id: `ep${NNN}${fmtName === 'cinematic' ? '' : `_${fmtName}`}`,
  title: `TODO（例：${town.name}の記憶）`,
  town: { name: town.name, reading: town.reading, seed: town.seed },
  format: fmt.format,
  look: { ...fmt.look },
  text: fmt.text,
  ...(fmt.stamp && town.year ? { stamp: { text: `'${String(town.year).slice(2)}  8 14`, font: 'mono', position: 'br' } } : {}),
  defaults: { dur: fmt.dur[0], transition: fmt.inChapter.transition, transitionDur: fmt.inChapter.transitionDur || 1, zoom: fmt.zoom },
  imageStyle: String(F.imageStyle || '').replace('{era}', town.year ? `${Math.floor(town.year / 10) * 10}s` : 'late Showa era'),
  imageRefs: [],
  clipStyle: F.clipStyle || '',
  chapters: chapterRanges.map((c) => ({ no: c.no, theme: c.theme, season: c.season, time: c.time, place: c.place, shots: [c.first + offset, c.last + offset] })),
  shots,
  ...(narr ? { narration: { voice: 'Achernar', style: '静かに、思い出をたどるように、少しゆっくり読んでください' } } : {}),
  music: { prompt: `TODO（入れるなら。例：Very soft ambient piano and acoustic guitar, sparse notes, ${town.seasonTime}, small Japanese town, calm and nostalgic, 60 BPM）` },
  audio: {
    bgm: { file: 'audio/bgm.mp3', gain: fmt.audio.bgmGain, fadeIn: 8, fadeOut: 10 },
    ambience,
    voice,
    sfx: [],
    clipGain: fmt.audio.clipGain,
    duck: narr ? 8 : fmt.audio.duck,
    loudness: fmt.audio.loudness,
  },
  startFade: fmt.startFade,
  endFade: fmt.endFade,
};
writeJson(epFile, ep);

// ───── plan.md ─────
const nImages = shots.filter((s) => s.image).length;
const nClips = shots.filter((s) => s.video).length;
const fmtMin = (sec) => `${Math.floor(sec / 60)}分${String(Math.round(sec % 60)).padStart(2, '0')}秒`;
const plan = `# ${town.name}（${town.reading}）— 企画メモ  #${NNN}・${fmt.label}

## 街のカード
- 立地：${town.terrain}
- 町の性格：${town.character}
- 時代：${town.era}${town.year ? `（${town.year}年ごろ）` : ''}／いちばん印象に残す季節と時間：${town.seasonTime}
- 場所：${town.places.join('・')}
- 音：${town.sounds.join('・')}${unmapped.length ? `（合成できない音：${unmapped.join('・')} → AI 動画の音か外部素材で。無理なら使わない）` : ''}
- 色：${town.palette}
- 視点：${town.viewpoint}
- 記憶の断片：${town.fragments.join('／')}
- 少しだけ不思議なこと：${town.uncanny}

## この回の芯
TODO：見終わったあとに残したい感情を 1 文で（例：もう戻れない夏の町の、やさしい明るさ）

## 章立て（${nCh} 章・各 ${perCh} 場面・約 ${fmtMin(totalSec)}）
章の並び・テーマ・場所は、この街に合うように入れ替えてよい。季節と時間は一方向に進める。
| 章 | テーマ | 季節・時間 | 場所 | 場面 |
|---|---|---|---|---|
${chapterRanges.map((c) => `| ${c.no} | ${c.theme} | ${c.season}・${c.time} | ${c.place} | ${c.first + offset}〜${c.last + offset} |`).join('\n')}

- 記憶の断片（${town.fragments.join('／')}）を、どの章のどの画で見せるか：TODO
- 少しだけ不思議なこと（${town.uncanny}）を、どの章でほのめかすか：TODO（はっきり見せない）

## 作る素材と見積もり（先にユーザーに伝える）
- 画像：${nImages} 枚（gen-images.mjs）
- AI 動画：${nClips} 本（gen-clips.mjs。1 本あたりの秒数は episode の clipSeconds、既定 6 秒）。費用が大きいので、本数と秒数を伝えて了承を取ってから
- 環境音：${[...kinds].map(([k, sec]) => `${k}（${sec}秒）`).join('、')}
  → \`node <SKILL>/scripts/gen-ambience.mjs <種類> --dur <秒> --out audio/amb_<種類>.wav\`
- BGM：入れるなら gen-music.mjs（参考動画は環境音が主役。入れるならごく小さく）。入れないなら episode.json の audio.bgm を消す

## オリジナリティの確認
- 参考動画の固有の要素（海上都市・水没した実在の名所・特定の人物の物語など）を使っていない
- 実在の地名・店名・ブランド・有名な建物に寄っていない。towns.json の過去回と町名・色・最初の画がかぶっていない
`;
writeText(path.join(EP_DIR, 'plan.md'), plan);
console.log(`✓ ${epFile}\n✓ ${path.join(EP_DIR, 'plan.md')}`);
console.log(`型 ${fmtName}：${nCh} 章 × ${perCh} 場面 ＝ 画像 ${nImages} 枚（うち AI 動画の候補 ${nClips}）・約 ${fmtMin(totalSec)}`);
console.log('次：plan.md を埋める → episode.json の TODO（prompt・motion・title・music.prompt）を埋める');

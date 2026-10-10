#!/usr/bin/env node
// 街のカード（town.json）と動画の型（formats.json）から、1 本分の作業フォルダのひな形を作る：
//   episode.json（場面・テロップ・音の骨組み。TODO を埋める）、plan.md（企画メモ）、images/ voice/ audio/ out/
//
// 使い方:
//   node new-episode.mjs --town <エピソードのフォルダ>/town.json --format long|short|ambient [--no 3] [--series <シリーズのフォルダ>] [--force]
//
// 型は <シリーズ>/formats.json があればそれを、無ければスキルの references/formats.json を使う。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, writeJson, writeText, ensureDir } from './lib/common.mjs';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2), { flags: ['help', 'force'] });
if (args.help || !args.town) {
  console.log('node new-episode.mjs --town <DIR>/town.json --format long|short|ambient [--no N] [--series DIR] [--force]');
  process.exit(args.help ? 0 : 1);
}

const townFile = path.resolve(args.town);
const town = JSON.parse(fs.readFileSync(townFile, 'utf8'));
const EP_DIR = path.dirname(townFile);
const seriesFormats = args.series && path.join(path.resolve(args.series), 'formats.json');
const F = JSON.parse(fs.readFileSync(seriesFormats && fs.existsSync(seriesFormats) ? seriesFormats : path.join(SKILL_DIR, 'references', 'formats.json'), 'utf8'));
const fmtName = args.format || 'long';
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
  registryCount = JSON.parse(fs.readFileSync(path.join(path.resolve(args.series || path.dirname(EP_DIR)), 'towns.json'), 'utf8')).length;
} catch {
  /* 台帳がまだ無い */
}
const no = Number(args.no) || registryCount + 1;
const NNN = String(no).padStart(3, '0');
for (const d of ['images', 'voice', 'audio', 'out']) ensureDir(path.join(EP_DIR, d));

// 決まった乱数（街の seed から）
let a = (Number(town.seed) || 1) >>> 0;
const r = () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 日付スタンプ：季節から月日を決める（例 '87  8 14）
const month = /夏|お盆|夕立|台風/.test(town.seasonTime) ? 8 : /雪|冬|年の瀬/.test(town.seasonTime) ? (/年の瀬/.test(town.seasonTime) ? 12 : 1) : /梅雨/.test(town.seasonTime) ? 6 : /秋/.test(town.seasonTime) ? 10 : /春/.test(town.seasonTime) ? 3 : 7;
const day = 1 + Math.floor(r() * 28);
const stamp = fmt.stamp && town.year ? `'${String(town.year).slice(2)}  ${month} ${String(day).padStart(2, ' ')}` : null;

const era = town.year ? `${town.year}s` : 'late Showa era';
const imageStyle = String(F.imageStyle || '').replace('{era}', town.year ? `${Math.floor(town.year / 10) * 10}s` : era);
const shots = [];
if (fmt.titleCard) shots.push({ card: { title: town.name, subtitle: `存在しない街の記憶 #${NNN}` }, dur: fmt.titleCard.dur, transition: 'fadeblack' });
const n = fmt.shots;
for (let k = 0; k < n; k++) {
  const place = town.places[k % town.places.length];
  const dur = Math.round((fmt.dur[0] + r() * (fmt.dur[1] - fmt.dur[0])) * 2) / 2;
  const s = {
    image: `images/${String(k + 1).padStart(3, '0')}.png`,
    prompt: `TODO（場所：${place}／${town.seasonTime}／${town.palette}）`,
    dur,
    move: fmt.moves[k % fmt.moves.length],
    transition: k === 0 && fmt.titleCard ? 'fadeblack' : fmt.transitions[k % fmt.transitions.length],
  };
  if (fmt.captionsEvery && k % fmt.captionsEvery === 0) s.caption = k === 0 && town.year ? `TODO（例：${town.year}年　${town.seasonTime}）` : `TODO（短い地名・場所名。例：${place}）`;
  shots.push(s);
}
if (fmt.endCard) shots.push({ card: { title: town.name, subtitle: 'この町は実在しません' }, dur: fmt.endCard.dur, transition: 'fadeblack' });

// 音：街の「音」を環境音の種類に置き換える（無いものは TODO）
const P = F.soundPresets || {};
const ambience = [];
const todoSounds = [];
for (const s of town.sounds || []) {
  const kind = P[s];
  if (!kind) {
    todoSounds.push(s);
    continue;
  }
  const accent = ['crossing', 'chime', 'clock'].includes(kind);
  const k0 = 2 + Math.floor(r() * Math.max(1, n - 4));
  ambience.push({
    file: `audio/amb_${kind}.wav`,
    gain: fmt.audio.ambienceGain + (accent ? -2 : 0),
    ...(accent ? { from: `shot:${k0}`, to: `shot:${Math.min(shots.length, k0 + 2)}` } : {}),
    _sound: s,
  });
}
// 型が「語りなし」か、街のカードの視点が「語り手はいない」なら声の枠を作らない
const narr = fmt.narration !== 'none' && !/語り手はいない/.test(town.viewpoint || '');
const voice = narr
  ? [...Array(fmtName === 'short' ? 3 : 8).keys()].map((j) => ({
      file: `voice/v${String(j + 1).padStart(2, '0')}.wav`,
      at: `shot:${Math.min(shots.length, (fmt.titleCard ? 2 : 1) + Math.round((j * n) / (fmtName === 'short' ? 3 : 8)))}+0.8`,
      text: 'TODO',
    }))
  : [];

const ep = {
  id: `ep${NNN}`,
  title: `TODO（例：${town.name}の記憶）`,
  town: { name: town.name, reading: town.reading, seed: town.seed },
  format: fmt.format,
  look: { grade: town.grade || 'faded-warm', ...fmt.look },
  text: fmt.text,
  ...(stamp ? { stamp: { text: stamp, font: 'mono', position: fmtName === 'short' ? 'bc' : 'br' } } : {}),
  defaults: { dur: fmt.dur[0], transitionDur: fmt.transitionDur, zoom: fmt.zoom },
  imageStyle,
  imageRefs: [],
  shots,
  ...(narr ? { narration: { voice: 'Achernar', style: '静かに、思い出をたどるように、少しゆっくり読んでください' } } : {}),
  music: { prompt: `TODO（例：Slow nostalgic instrumental for a small Japanese town, ${town.seasonTime}, ${town.palette} mood, soft piano and warm pads, 70 BPM）` },
  audio: {
    bgm: { file: 'audio/bgm.mp3', gain: fmt.audio.bgmGain, fadeIn: 3, fadeOut: 6 },
    ambience,
    voice,
    sfx: [],
    duck: fmt.audio.duck,
    loudness: fmt.audio.loudness,
  },
  endFade: 3,
};
writeJson(epFile, ep);

const plan = `# ${town.name}（${town.reading}）— 企画メモ  #${NNN}・${fmt.label}

## 街のカード
- 立地：${town.terrain}
- 町の性格：${town.character}
- 時代：${town.era}${town.year ? `（${town.year}年ごろ）` : ''}／${town.seasonTime}
- 場所：${town.places.join('・')}
- 音：${town.sounds.join('・')}${todoSounds.length ? `（環境音の種類が無いもの：${todoSounds.join('・')} → Lyria で作るか使わない）` : ''}
- 色：${town.palette}（look.grade = ${town.grade}）
- 視点：${town.viewpoint}
- 記憶の断片：${town.fragments.join('／')}
- 少しだけ不思議なこと：${town.uncanny}

## ひとことで（この回の芯）
TODO：見終わったあとに残したい感情を 1 文で

## 流れ
| 区間 | 割合 | 何を見せるか |
|---|---|---|
| 導入 | 10% | 町に入る（遠景・道・駅など） |
| 歩く | 40% | 場所を 3〜4 か所、時間帯を少しずつ進める |
| 記憶の核 | 25% | 記憶の断片を 1〜2 個、いちばん印象的な画で |
| 不思議の気配 | 10% | ${town.uncanny}（はっきり見せない） |
| 余韻 | 15% | 町を離れる・灯りが消える・タイトルへ |

## 場面表
episode.json の shots の TODO を、上の流れに沿って埋める（prompt は references/image-prompts.md の型で）

## 語り${narr ? '' : '（この型では入れない）'}
${narr ? 'references/narration.md の型で 8 行前後（短い文・五感・過去形）。audio.voice の text を埋める' : '-'}

## 音
- BGM：music.prompt を埋めて gen-music.mjs（または手持ちの権利のはっきりした曲）
- 環境音：${ambience.map((x) => `${x._sound}→${path.basename(x.file)}`).join('、') || 'なし'}

## オリジナリティの確認
- 参考動画・過去回と、町名・台詞・構図・サムネイルの型がかぶっていないか（towns.json と比べる）
- 実在の地名・店名・ブランド・人物に寄っていないか
`;
writeText(path.join(EP_DIR, 'plan.md'), plan);
console.log(`✓ ${epFile}\n✓ ${path.join(EP_DIR, 'plan.md')}`);
console.log(`場面 ${shots.length}（画像 ${n}）・型 ${fmtName}・look.grade ${ep.look.grade}${stamp ? `・スタンプ ${stamp}` : ''}`);
console.log('次：plan.md を埋める → episode.json の TODO（prompt・caption・text・music.prompt・title）を埋める');

#!/usr/bin/env node
// エピソード設計（episode.json）から動画を書き出す。ffmpeg だけで動く。
//   画像をゆっくり動かす（寄る・引く・横や縦に流す）／動画素材（AI 動画など）を入れる → カット・ディゾルブでつなぐ →
//   色・粒子・周辺減光・ゆらぎ・黒帯 → テロップ・日付スタンプ → 音（動画素材の音・環境音・BGM・声・効果音。
//   声の間は自動で下げる）→ 音量をそろえる（既定 -14 LUFS）→ 確認用のコマ一覧と検査結果
//
// 使い方:
//   node render-town.mjs <episode.json> [--draft] [--out <mp4>] [--stills 0,12.5,40] [--sheet 24] [--keep-temp] [--no-audio]
//   --draft   半分の解像度で速く書き出す（確認用）
//   --stills  指定の秒のコマを PNG で書き出す
//   --sheet   確認用に全体から抜くコマ数（既定 12。12 枚ごとに 1 枚のシート）
//
// episode.json の書き方は references/episode-schema.md
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, parseTime, writeText, writeJson, ensureDir, fmtTime, run } from './lib/common.mjs';
import { findFont, escPath, ffmpeg, probe, measureLoudness } from './lib/media.mjs';

// 想定内のエラーは、内部の情報を出さずにメッセージだけ表示する
process.on('uncaughtException', (e) => {
  console.error(`エラー：${e?.message || e}`);
  process.exit(1);
});

const args = parseArgs(process.argv.slice(2), { flags: ['draft', 'keep-temp', 'help', 'no-audio'] });
if (args.help || !args._[0]) {
  console.log('node render-town.mjs <episode.json> [--draft] [--out <mp4>] [--stills 0,12.5] [--sheet 24] [--keep-temp] [--no-audio]');
  process.exit(args.help ? 0 : 1);
}

const EP_FILE = path.resolve(args._[0]);
const EP_DIR = path.dirname(EP_FILE);
const ep = JSON.parse(fs.readFileSync(EP_FILE, 'utf8'));
const DRAFT = Boolean(args.draft);
const id = ep.id || path.parse(EP_FILE).name;

const fullW = ep.format?.width || 1920;
const fullH = ep.format?.height || 1080;
const FPS = ep.format?.fps || 30;
const W = DRAFT ? Math.round(fullW / 4) * 2 : fullW;
const H = DRAFT ? Math.round(fullH / 4) * 2 : fullH;
const K = DRAFT ? 2 : 3; // 動きをなめらかにするため、元の画像を出力の K 倍に広げてから切り出す

const look = { grade: 'faded-warm', grain: 0.25, vignette: 0.3, flicker: 0.15, letterbox: 0, blur: 0, glow: 0, ...(ep.look || {}) };
const text = { font: 'mincho', color: '#F3EEE6', size: 0.042, position: 'bl', fade: 0.8, shadow: 0.6, box: 0, ...(ep.text || {}) };
const defaults = { dur: 7, move: 'auto', zoom: 0.1, transition: 'fade', transitionDur: 1.5, fit: 'cover', ...(ep.defaults || {}) };
const audio = { duck: 8, loudness: -14, clipGain: -3, ...(ep.audio || {}) };
const endFade = ep.endFade ?? 2.0;
const startFade = ep.startFade ?? 0.8;

const TMP = ensureDir(path.join(EP_DIR, '.render_tmp', `${id}${DRAFT ? '_draft' : ''}`));
const OUT = path.resolve(args.out || path.join(EP_DIR, 'out', `${id}${DRAFT ? '_draft' : ''}.mp4`));
ensureDir(path.dirname(OUT));
const CHECK = ensureDir(path.join(path.dirname(OUT), `${path.parse(OUT).name}_check`));

// ffmpeg の版（7 以降は -/filter_complex、それより前は -filter_complex_script）。"N-…" や日付の版は新しいとみなす
const ffVersion = run('ffmpeg', ['-version']).stdout;
const ffMajor = Number((ffVersion.match(/ffmpeg version n?(\d+)/i) || [])[1] || (/ffmpeg version N-/i.test(ffVersion) ? 8 : 6));
/** 長いフィルタはファイルで渡す（コマンドの長さ制限とエスケープを避ける） */
function graphArgs(graph, name) {
  const f = path.join(TMP, `${name}.txt`);
  fs.writeFileSync(f, graph, 'utf8');
  return ffMajor >= 7 ? ['-/filter_complex', f] : ['-filter_complex_script', f];
}

const rel = (p) => (p ? path.resolve(EP_DIR, p) : null);
const hex = (c, a = 1) => `${String(c || '#ffffff').replace('#', '0x')}@${a}`;
const num = (x, d = 3) => Number(x).toFixed(d);

// ───────────────────────── 1. タイミング ─────────────────────────
const TRANS = {
  fade: 'fade', // なめらかに重ねる（ディゾルブ）
  dissolve: 'fade',
  fadeblack: 'fadeblack', // いったん黒へ
  fadewhite: 'fadewhite', // いったん白へ（光・夏・回想）
  fadegrays: 'fadegrays', // 色が抜けながら変わる（記憶が薄れる感じ）
  blur: 'hblur', // にじみながら変わる
  slideleft: 'smoothleft',
  slideright: 'smoothright',
  circle: 'circleopen',
  cut: 'fade', // 1 コマで切り替え（ふつうのカット）
};
const PAD = 2; // 各場面の後ろに足すコマ数（つなぎの途中で前の場面が尽きて映像が切れるのを防ぐ）
const CHUNK = 16; // 一度につなぐ場面の数（多いと ffmpeg のメモリが足りなくなる）
const shots = (ep.shots || []).map((s, i) => ({ ...defaults, ...s, i }));
if (!shots.length) throw new Error('shots が空です');
const AUTO = ['in', 'right', 'out', 'left', 'in', 'down', 'out', 'up'];
let tline = 0;
shots.forEach((s, i) => {
  s.dur = Number(s.dur);
  if (!(s.dur > 0)) throw new Error(`場面 ${i + 1} の dur（秒）がありません`);
  if (s.move === 'auto') s.move = s.card ? 'still' : AUTO[i % AUTO.length];
  const tname = i === 0 ? null : s.transition || defaults.transition;
  if (tname && !TRANS[tname]) throw new Error(`場面 ${i + 1} の transition「${tname}」は使えません（${Object.keys(TRANS).join(' / ')}）`);
  let td = i === 0 ? 0 : tname === 'cut' ? 1 / FPS : Number(s.transitionDur ?? defaults.transitionDur);
  if (i > 0) td = Math.min(td, shots[i - 1].dur * 0.45, s.dur * 0.45);
  s.tIn = td;
  s.tName = tname;
  s.start = i === 0 ? 0 : tline - td;
  s.end = s.start + s.dur;
  s.head = s.start + td / 2; // 「場面の頭」＝前の場面とのつなぎの真ん中（テロップも音もここを基準にする）
  tline = s.end;
});
const TOTAL = tline;

/** 秒数・"1:30"・"shot:3+0.5"（3 番目の場面の頭から 0.5 秒） → 秒。読めなければエラー */
function atTime(v, what = '時刻') {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const str = String(v ?? '').trim();
  const m = str.match(/^shot:(\d+)\s*(?:([+-])\s*([\d.]+)\s*(?:s|秒)?)?$/i);
  if (m) {
    const s = shots[Number(m[1]) - 1];
    if (!s) throw new Error(`${what}「${str}」：場面 ${m[1]} がありません（全 ${shots.length} 場面）`);
    return s.head + (m[2] === '-' ? -1 : 1) * Number(m[3] || 0);
  }
  const t = parseTime(str);
  if (t == null) throw new Error(`${what}「${str}」が読めません（秒の数字・"1:30"・"shot:3+0.8" のどれか）`);
  return t;
}

// ───────────────────────── 2. 場面ごとの映像 ─────────────────────────
function moveExpr(s, N) {
  const Z = Number(s.zoom ?? defaults.zoom);
  const [fx, fy] = s.focus || [0.5, 0.5];
  const p = N > 1 ? `min(on/${N - 1},1)` : '1';
  const e = `(${p}*${p}*(3-2*${p}))`;
  const cx = `(iw-iw/zoom)*${fx}`;
  const cy = `(ih-ih/zoom)*${fy}`;
  switch (s.move) {
    case 'in':
      return { z: `1+${Z}*${e}`, x: cx, y: cy };
    case 'out':
      return { z: `1+${Z}*(1-${e})`, x: cx, y: cy };
    case 'right':
      return { z: `${1 + Z}`, x: `(iw-iw/zoom)*${e}`, y: cy };
    case 'left':
      return { z: `${1 + Z}`, x: `(iw-iw/zoom)*(1-${e})`, y: cy };
    case 'down':
      return { z: `${1 + Z}`, x: cx, y: `(ih-ih/zoom)*${e}` };
    case 'up':
      return { z: `${1 + Z}`, x: cx, y: `(ih-ih/zoom)*(1-${e})` };
    case 'hold':
      return { z: '1', x: '0', y: '0' };
    default: // still：ごくわずかに寄る（止まって見えないように）
      return { z: `1+0.02*${e}`, x: cx, y: cy };
  }
}

function textFile(name, content) {
  const f = path.join(TMP, `${name}.txt`);
  fs.writeFileSync(f, String(content), 'utf8');
  return escPath(f);
}

const segEnc = (frames) => [
  '-an', '-c:v', 'libx264', '-preset', DRAFT ? 'ultrafast' : 'veryfast', '-crf', DRAFT ? '23' : '15',
  '-pix_fmt', 'yuv420p', '-r', String(FPS), '-frames:v', String(frames),
];

function renderShot(s) {
  const seg = path.join(TMP, `seg_${String(s.i).padStart(3, '0')}.mp4`);
  const N = Math.max(1, Math.round(s.dur * FPS));
  const NP = N + PAD;
  const bigW = W * K;
  const bigH = H * K;

  if (s.card) {
    const c = s.card;
    const font = findFont(c.font || text.font, EP_DIR);
    if (!font) throw new Error('日本語の書体が見つかりません（references/episode-schema.md の「書体」）');
    const F = 0.7;
    const a = `'if(lt(t,${F}),t/${F},if(lt(t,${num(s.dur - F)}),1,max(0,(${num(s.dur)}-t)/${F})))'`;
    const titleSize = Math.round(H * (c.size || (c.layout === 'top' ? 0.06 : 0.075)));
    // layout: center（真ん中）／top（上に寄せる。下に YouTube の終了画面の要素を置く場所を空ける）
    const titleY = c.layout === 'top' ? `${Math.round(H * 0.12)}` : `(h-th)/2-${Math.round(H * (c.subtitle ? 0.04 : 0))}`;
    const subY = c.layout === 'top' ? `${Math.round(H * 0.12 + titleSize * 1.35)}` : `(h/2)+${Math.round(H * 0.045)}`;
    const parts = [];
    if (c.title) {
      parts.push(
        `drawtext=fontfile='${escPath(font)}':textfile='${textFile(`card${s.i}_t`, c.title)}':expansion=none:fontsize=${titleSize}:fontcolor=${hex(c.color || text.color)}:x=(w-tw)/2:y=${titleY}:alpha=${a}`,
      );
    }
    if (c.subtitle) {
      parts.push(
        `drawtext=fontfile='${escPath(font)}':textfile='${textFile(`card${s.i}_s`, c.subtitle)}':expansion=none:fontsize=${Math.round(H * 0.03)}:fontcolor=${hex(c.color || text.color, 0.8)}:x=(w-tw)/2:y=${subY}:alpha=${a}`,
      );
    }
    const bgImg = c.image && fs.existsSync(rel(c.image)) ? rel(c.image) : null;
    if (bgImg) {
      // 背景は画像をぼかして暗くしたもの（最後の場面の画像などを指定）
      const vf = [
        `scale=${W}:${H}:force_original_aspect_ratio=increase`,
        `crop=${W}:${H}`,
        `gblur=sigma=${Math.round(14 * (W / 1920)) + 2}`,
        `eq=brightness=${c.dim ?? -0.22}:saturation=0.75`,
        `fps=${FPS}`,
        'format=yuv420p',
        ...parts,
      ].join(',');
      ffmpeg(['-loop', '1', '-framerate', String(FPS), '-i', bgImg, '-vf', vf, ...segEnc(NP), seg], { label: `場面 ${s.i + 1}（文字だけの場面）` });
    } else {
      const vf = [`format=yuv420p`, ...parts].join(',');
      ffmpeg(['-f', 'lavfi', '-i', `color=c=${hex(c.bg || '#0b0b0d')}:s=${W}x${H}:r=${FPS}:d=${num(s.dur + PAD / FPS)}`, '-vf', vf, ...segEnc(NP), seg], { label: `場面 ${s.i + 1}（文字だけの場面）` });
    }
    return seg;
  }

  if (s.video && !fs.existsSync(rel(s.video)) && s.image) {
    console.log(`\n（場面 ${s.i + 1}：${s.video} がまだ無いので画像 ${s.image} で作ります）`);
  } else if (s.video) {
    const src = rel(s.video);
    if (!fs.existsSync(src)) throw new Error(`動画が見つかりません：${s.video}`);
    const speed = Number(s.speed || 1);
    const vf = [`setpts=PTS/${speed}`, `fps=${FPS}`, `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${W}:${H}`, 'setsar=1', 'format=yuv420p'].join(',');
    ffmpeg(['-stream_loop', '-1', '-ss', num(Number(s.from ?? 0)), '-i', src, '-vf', vf, ...segEnc(NP), seg], { label: `場面 ${s.i + 1}（動画）` });
    return seg;
  }

  const img = rel(s.image);
  if (!img || !fs.existsSync(img)) throw new Error(`画像が見つかりません：${s.image}`);
  let srcImg = img;
  // 縦長の画面に横長の画像を入れるときなど：ぼかした背景の上に全体を載せる
  if (s.fit === 'contain-blur') {
    srcImg = path.join(TMP, `fit_${s.i}.png`);
    ffmpeg(
      [
        '-i', img,
        '-filter_complex',
        `[0]scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH},gblur=sigma=${20 * K},eq=brightness=-0.08:saturation=0.8[bg];[0]scale=${bigW}:${bigH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`,
        '-frames:v', '1', srcImg,
      ],
      { label: `場面 ${s.i + 1}（背景ぼかし）` },
    );
  }
  const m = moveExpr(s, N);
  const vf = [
    `scale=${bigW}:${bigH}:force_original_aspect_ratio=increase`,
    `crop=${bigW}:${bigH}`,
    `zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${NP}:s=${W}x${H}:fps=${FPS}`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');
  ffmpeg(['-i', srcImg, '-vf', vf, ...segEnc(NP), seg], { label: `場面 ${s.i + 1}（画像）` });
  return seg;
}

// ───────────────────────── 3. つなぐ（質感をかける前の素の映像） ─────────────────────────
/**
 * items = [{ file, start }]（start は全体の時間軸での開始秒）、joins[k] = items[k+1] に入るときのつなぎ。
 * xfade の offset は「次の素材の開始秒 − 最初の素材の開始秒」になる。
 */
function xfadeJoin(items, joins, out, label) {
  if (items.length === 1) {
    fs.copyFileSync(items[0].file, out);
    return out;
  }
  const t0 = items[0].start;
  const lines = [];
  let last = '0:v';
  for (let k = 1; k < items.length; k++) {
    const j = joins[k - 1];
    lines.push(`[${last}][${k}:v]xfade=transition=${TRANS[j.name] || 'fade'}:duration=${num(j.dur)}:offset=${num(items[k].start - t0)}[x${k}]`);
    last = `x${k}`;
  }
  lines.push(`[${last}]format=yuv420p[vout]`);
  ffmpeg(
    [
      ...items.flatMap((it) => ['-i', it.file]),
      ...graphArgs(lines.join(';\n'), `join_${path.parse(out).name}`),
      '-map', '[vout]', '-an',
      '-c:v', 'libx264', '-preset', DRAFT ? 'ultrafast' : 'veryfast', '-crf', DRAFT ? '20' : '14', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      out,
    ],
    { label },
  );
  return out;
}

function renderTimeline(segs) {
  // 16 場面ずつのかたまりにつないでから、かたまりどうしをつなぐ
  const chunks = [];
  for (let a = 0; a < shots.length; a += CHUNK) {
    const idx = [...Array(Math.min(CHUNK, shots.length - a)).keys()].map((k) => a + k);
    const file = path.join(TMP, `chunk_${String(chunks.length).padStart(3, '0')}.mp4`);
    xfadeJoin(
      idx.map((i) => ({ file: segs[i], start: shots[i].start })),
      idx.slice(1).map((i) => ({ name: shots[i].tName, dur: shots[i].tIn })),
      file,
      `場面のつなぎ（${idx[0] + 1}〜${idx[idx.length - 1] + 1}）`,
    );
    chunks.push({ file, start: shots[a].start, first: a });
    // 長い回は一時ファイルが数 GB になるので、使い終わった場面はすぐ消す
    if (!args['keep-temp']) for (const i of idx) fs.rmSync(segs[i], { force: true });
  }
  const timeline = path.join(TMP, 'timeline.mp4');
  xfadeJoin(
    chunks,
    chunks.slice(1).map((c) => ({ name: shots[c.first].tName, dur: shots[c.first].tIn })),
    timeline,
    'かたまりのつなぎ',
  );
  if (!args['keep-temp'] && chunks.length > 1) for (const c of chunks) fs.rmSync(c.file, { force: true });
  return timeline;
}

// ───────────────────────── 4. 質感・文字 ─────────────────────────
function gradeFilters() {
  const g = look.grade;
  const lift = (b, w) => `curves=all='0/${b} 0.5/0.5 1/${w}'`;
  const presets = {
    none: [],
    cinema: [lift(0.03, 0.97), 'colorbalance=rs=-0.02:bs=0.03:rm=0.01:rh=0.03:bh=-0.03', 'eq=contrast=1.04:saturation=0.95'],
    'faded-warm': [lift(0.07, 0.93), 'colorbalance=rs=0.05:bs=-0.05:rm=0.03:bm=-0.03:rh=0.03:bh=-0.04', 'eq=saturation=0.85:contrast=0.96'],
    'faded-cool': [lift(0.07, 0.94), 'colorbalance=rs=-0.03:bs=0.05:rm=-0.02:bm=0.02:rh=-0.01:bh=0.03', 'eq=saturation=0.8:contrast=0.96'],
    dusk: [lift(0.05, 0.95), 'colorbalance=rs=0.04:bs=0.07:rm=0.05:bm=-0.02:rh=0.07:bh=-0.07', 'eq=saturation=0.92:gamma=0.97'],
    summer: [lift(0.06, 0.97), 'colorbalance=rs=0.02:bs=-0.02:rh=0.04:bh=-0.03', 'eq=brightness=0.03:saturation=1.03:contrast=0.92'],
    night: [lift(0.04, 0.92), 'colorbalance=rs=-0.02:bs=0.07:rh=0.08:gh=0.02:bh=-0.08', 'eq=brightness=-0.02:saturation=0.85'],
    vhs: [lift(0.06, 0.92), 'eq=saturation=1.12:contrast=0.9', `rgbashift=rh=-${Math.max(1, Math.round(W / 960))}:bh=${Math.max(1, Math.round(W / 960))}`],
    mono: ['hue=s=0', lift(0.08, 0.92), 'eq=contrast=1.05'],
  };
  if (!(g in presets)) throw new Error(`look.grade は ${Object.keys(presets).join(' / ')} のどれか`);
  return presets[g];
}

function lookChain(input) {
  const f = [...gradeFilters()];
  if (look.blur > 0) f.push(`gblur=sigma=${num(look.blur * 1.2 * (W / 1920), 2)}`);
  if (look.flicker > 0) {
    const a = look.flicker * 0.03;
    f.push(`eq=brightness='${num(a, 4)}*sin(2*PI*t*1.3)+${num(a / 2, 4)}*sin(2*PI*t*3.7)':eval=frame`);
  }
  if (look.vignette > 0) f.push(`vignette=angle=${num(0.15 + 0.75 * look.vignette, 3)}`);
  if (look.grade === 'vhs') f.push(`drawgrid=w=0:h=${Math.max(2, Math.round(H / 270))}:t=1:c=black@0.12`);
  if (look.grain > 0) f.push(`noise=c0s=${Math.round(look.grain * 28)}:c0f=t+u`);
  if (startFade > 0) f.push(`fade=t=in:st=0:d=${num(startFade)}`);
  if (endFade > 0) f.push(`fade=t=out:st=${num(TOTAL - endFade)}:d=${num(endFade)}`);
  const lines = [];
  let cur = input;
  if (look.glow > 0) {
    // 明るさ（Y）だけをにじませる。色の成分まで screen で重ねると全体が赤紫にかぶる
    lines.push(
      `[${cur}]split[g0][g1]`,
      `[g1]gblur=sigma=${Math.round(18 * (W / 1920))}[g2]`,
      `[g0][g2]blend=c0_mode=screen:c0_opacity=${num(look.glow * 0.35)}[glowed]`,
    );
    cur = 'glowed';
  }
  lines.push(`[${cur}]${f.join(',') || 'null'}[looked]`);
  return lines;
}

function posXY(pos, extraY = 0) {
  const mx = Math.round(W * 0.06);
  const my = Math.round(H * 0.07) + extraY;
  return {
    bl: { x: `${mx}`, y: `h-th-${my}` },
    bc: { x: '(w-tw)/2', y: `h-th-${my}` },
    br: { x: `w-tw-${mx}`, y: `h-th-${my}` },
    tl: { x: `${mx}`, y: `${my}` },
    tc: { x: '(w-tw)/2', y: `${my}` },
    tr: { x: `w-tw-${mx}`, y: `${my}` },
    c: { x: '(w-tw)/2', y: '(h-th)/2' },
  }[pos || 'bl'];
}

function captionFilters() {
  const out = [];
  const bar = look.letterbox > 0 ? Math.max(0, Math.round((H - W / look.letterbox) / 2)) : 0;
  const font = findFont(text.font, EP_DIR);
  for (const s of shots) {
    if (!s.caption) continue;
    if (!font) throw new Error('日本語の書体が見つかりません（references/episode-schema.md の「書体」）');
    const next = shots[s.i + 1];
    // 既定：つなぎが終わってから出し、次のつなぎが始まる前に消す。captionStart/End は「場面の頭」からの秒
    const A = s.captionStart != null ? s.head + Number(s.captionStart) : s.head + Math.max(0.6, s.tIn / 2);
    const B = s.captionEnd != null ? s.head + Number(s.captionEnd) : s.end - (next ? next.tIn : 0) - 0.3;
    if (!(B - A > 0.5)) throw new Error(`場面 ${s.i + 1} のテロップを出す時間がありません（dur を長くするか captionStart/End を見直す）`);
    const F = Math.min(text.fade, (B - A) / 3);
    const p = posXY(s.captionPos || text.position, bar);
    const alpha = `'if(lt(t,${num(A)}),0,if(lt(t,${num(A + F)}),(t-${num(A)})/${num(F)},if(lt(t,${num(B - F)}),1,max(0,(${num(B)}-t)/${num(F)}))))'`;
    out.push(
      `drawtext=fontfile='${escPath(findFont(s.captionFont || text.font, EP_DIR) || font)}':textfile='${textFile(`cap${s.i}`, s.caption)}':expansion=none` +
        `:fontsize=${Math.round(H * (s.captionSize || text.size))}:fontcolor=${hex(text.color)}:line_spacing=${Math.round(H * 0.012)}` +
        `:shadowcolor=black@${text.shadow}:shadowx=${Math.max(1, Math.round(H / 540))}:shadowy=${Math.max(1, Math.round(H / 540))}` +
        (text.box > 0 ? `:box=1:boxcolor=black@${text.box}:boxborderw=${Math.round(H * 0.012)}` : '') +
        `:x=${p.x}:y=${p.y}:alpha=${alpha}:enable='between(t,${num(A)},${num(B)})'`,
    );
  }
  if (ep.stamp?.text) {
    const st = ep.stamp;
    const sf = findFont(st.font || 'mono', EP_DIR);
    if (sf) {
      const p = posXY(st.position || 'br', bar);
      const wins = shots.filter((s) => !s.card && s.stamp !== false).map((s) => `between(t,${num(s.start + s.tIn)},${num(s.end)})`);
      if (wins.length) {
        out.push(
          `drawtext=fontfile='${escPath(sf)}':textfile='${textFile('stamp', st.text)}':expansion=none:fontsize=${Math.round(H * (st.size || 0.034))}` +
            `:fontcolor=${hex(st.color || '#FFB347', st.opacity ?? 0.9)}:shadowcolor=black@0.4:shadowx=1:shadowy=1:x=${p.x}:y=${p.y}:enable='${wins.join('+')}'`,
        );
      }
    }
  }
  if (bar > 0) out.push(`drawbox=x=0:y=0:w=iw:h=${bar}:c=black:t=fill`, `drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:c=black:t=fill`);
  return out;
}

function renderLook(timeline) {
  const lines = [...lookChain('0:v')];
  const caps = captionFilters();
  lines.push(`[looked]${caps.length ? caps.join(',') : 'null'},format=yuv420p[vout]`);
  const video = path.join(TMP, 'video.mp4');
  ffmpeg(
    [
      '-i', timeline,
      ...graphArgs(lines.join(';\n'), 'look_graph'),
      '-map', '[vout]', '-an',
      '-c:v', 'libx264', '-preset', DRAFT ? 'veryfast' : 'medium', '-crf', DRAFT ? '24' : '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-t', num(TOTAL), video,
    ],
    { label: '質感・文字' },
  );
  return video;
}

// ───────────────────────── 5. 音 ─────────────────────────
function renderAudio() {
  const inputs = [];
  const lines = [];
  const bus = [];
  let nIn = 0;
  const add = (file, loop, pre = []) => {
    const f = rel(file);
    if (!fs.existsSync(f)) throw new Error(`音のファイルが見つかりません：${file}`);
    inputs.push(...(loop ? ['-stream_loop', '-1'] : []), ...pre, '-i', f);
    return nIn++;
  };
  const fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';
  // 声（区間を記録して、ほかの音を下げる）
  const voiceWins = [];
  const voices = [];
  for (const [j, v] of (audio.voice || []).entries()) {
    const at = atTime(v.at, `audio.voice[${j}].at`);
    const idx = add(v.file);
    const d = probe(rel(v.file)).duration;
    voiceWins.push([at, at + d]);
    lines.push(`[${idx}:a]${fmt},volume=${v.gain ?? 0}dB,adelay=${Math.round(at * 1000)}:all=1[v${j}]`);
    voices.push(`[v${j}]`);
  }
  const duckExpr = () => {
    if (!voiceWins.length || !audio.duck) return null;
    const g = 10 ** (-audio.duck / 20);
    const w = voiceWins.map(([a, b]) => `max(0,min(1,min((t-${num(a - 0.35)})/0.35,(${num(b + 0.6)}-t)/0.6)))`);
    const wmax = w.reduce((acc, x) => (acc ? `max(${acc},${x})` : x), '');
    return `volume='1-${num(1 - g, 4)}*${wmax}':eval=frame`;
  };
  const bed = []; // 声の間に下げる層（動画素材の音・環境音・BGM）
  // 動画素材の音（AI 動画の環境音など）。場面の長さに切り、つなぎに合わせてフェード
  for (const s of shots) {
    if (!s.video || s.audio === false) continue;
    const src = rel(s.video);
    if (!fs.existsSync(src) || !probe(src).hasAudio) continue;
    const speed = Number(s.speed || 1);
    if (speed < 0.5 || speed > 2) continue; // 極端な速度変更では音を使わない
    const next = shots[s.i + 1];
    const len = s.dur;
    const fin = Math.max(0.05, s.tIn);
    const fout = Math.max(0.05, next ? next.tIn : endFade || 0.3);
    const idx = add(s.video, true, ['-ss', num(Number(s.from ?? 0))]);
    lines.push(
      `[${idx}:a]${fmt}${speed !== 1 ? `,atempo=${speed}` : ''},atrim=0:${num(len)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=${num(fin)},afade=t=out:st=${num(Math.max(0, len - fout))}:d=${num(fout)},` +
        `volume=${s.audioGain ?? audio.clipGain}dB,adelay=${Math.round(s.start * 1000)}:all=1[clip${s.i}]`,
    );
    bed.push(`[clip${s.i}]`);
  }
  // BGM
  if (audio.bgm?.file) {
    const b = audio.bgm;
    const idx = add(b.file, b.loop !== false);
    const st = atTime(b.start ?? 0, 'audio.bgm.start');
    const len = Math.max(0.1, TOTAL - st);
    lines.push(
      `[${idx}:a]${fmt},atrim=0:${num(len)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${num(b.fadeIn ?? 2)},afade=t=out:st=${num(Math.max(0, len - (b.fadeOut ?? 5)))}:d=${num(b.fadeOut ?? 5)},volume=${b.gain ?? -6}dB,adelay=${Math.round(st * 1000)}:all=1[bgm]`,
    );
    bed.push('[bgm]');
  }
  // 環境音
  for (const [j, a] of (audio.ambience || []).entries()) {
    const idx = add(a.file, a.loop !== false);
    const from = atTime(a.from ?? 0, `audio.ambience[${j}].from`);
    const to = a.to != null ? atTime(a.to, `audio.ambience[${j}].to`) : TOTAL;
    const len = Math.max(0.1, Math.min(TOTAL, to) - from);
    lines.push(
      `[${idx}:a]${fmt},atrim=0:${num(len)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${num(a.fadeIn ?? 2)},afade=t=out:st=${num(Math.max(0, len - (a.fadeOut ?? 2)))}:d=${num(a.fadeOut ?? 2)},volume=${a.gain ?? -12}dB,adelay=${Math.round(from * 1000)}:all=1[amb${j}]`,
    );
    bed.push(`[amb${j}]`);
  }
  if (bed.length) {
    const dx = duckExpr();
    lines.push(`${bed.join('')}amix=inputs=${bed.length}:normalize=0:duration=longest${dx ? `,${dx}` : ''}[bed]`);
    bus.push('[bed]');
  }
  if (voices.length) {
    lines.push(`${voices.join('')}amix=inputs=${voices.length}:normalize=0:duration=longest[vox]`);
    bus.push('[vox]');
  }
  for (const [j, s] of (audio.sfx || []).entries()) {
    const at = atTime(s.at, `audio.sfx[${j}].at`);
    const idx = add(s.file);
    lines.push(`[${idx}:a]${fmt},volume=${s.gain ?? -6}dB,adelay=${Math.round(at * 1000)}:all=1[sfx${j}]`);
    bus.push(`[sfx${j}]`);
  }
  const mix = path.join(TMP, 'mix.wav');
  if (!bus.length) {
    ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', num(TOTAL), mix], { label: '無音トラック' });
    return { file: mix, silent: true, voiceWins };
  }
  lines.push(
    `${bus.join('')}amix=inputs=${bus.length}:normalize=0:duration=longest,apad,atrim=0:${num(TOTAL)}` +
      `${endFade > 0 ? `,afade=t=out:st=${num(TOTAL - endFade)}:d=${num(endFade)}` : ''}[aout]`,
  );
  ffmpeg([...inputs, ...graphArgs(lines.join(';\n'), 'audio_graph'), '-map', '[aout]', '-ar', '48000', '-c:a', 'pcm_s16le', mix], { label: '音のミックス' });

  // 2 回で測ってから目標の大きさ（既定 -14 LUFS）にそろえる。ピークは -1.5 dBTP 以下
  const target = Number(audio.loudness ?? -14);
  const p1 = run('ffmpeg', ['-hide_banner', '-nostats', '-i', mix, '-af', `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
  const j = JSON.parse((p1.stderr.match(/\{[\s\S]*?\}/g) || ['{}']).pop());
  const norm = path.join(TMP, 'mix_norm.wav');
  if (j.input_i && Number.isFinite(Number(j.input_i)) && Number(j.input_i) > -70) {
    ffmpeg(
      [
        '-i', mix,
        '-af',
        `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`,
        '-ar', '48000', '-c:a', 'pcm_s16le', norm,
      ],
      { label: '音量をそろえる' },
    );
    return { file: norm, silent: false, voiceWins };
  }
  return { file: mix, silent: true, voiceWins };
}

// ───────────────────────── 6. 字幕（声に text があるとき） ─────────────────────────
function writeSrt(voiceWins) {
  const items = (audio.voice || []).map((v, j) => ({ text: v.text, win: voiceWins?.[j] })).filter((x) => x.text && x.win);
  if (!items.length) return null;
  const ts = (t) => {
    const ms = Math.max(0, Math.round(t * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  const srt = items.map((x, k) => `${k + 1}\n${ts(x.win[0])} --> ${ts(x.win[1])}\n${x.text}\n`).join('\n');
  const f = OUT.replace(/\.mp4$/i, '.srt');
  writeText(f, srt);
  return f;
}

// ───────────────────────── 7. 確認・検査 ─────────────────────────
function checkSheets() {
  const n = Math.max(4, Number(args.sheet) || 12);
  const frames = [];
  for (let k = 0; k < n; k++) {
    const t = Math.min(TOTAL - 0.1, (TOTAL * (k + 0.5)) / n);
    const f = path.join(TMP, `chk_${String(frames.length).padStart(3, '0')}.png`);
    ffmpeg(['-ss', num(t), '-i', OUT, '-frames:v', '1', '-vf', `scale=480:-2`, f], { label: '確認用のコマ' });
    if (fs.existsSync(f)) frames.push({ f, t });
  }
  for (const f of fs.readdirSync(CHECK)) if (/^sheet(_\d+)?\.jpg$/.test(f)) fs.unlinkSync(path.join(CHECK, f));
  const sheets = [];
  for (let s = 0; s * 12 < frames.length; s++) {
    const group = frames.slice(s * 12, s * 12 + 12);
    const name = frames.length > 12 ? `sheet_${String(s + 1).padStart(2, '0')}.jpg` : 'sheet.jpg';
    const listDir = ensureDir(path.join(TMP, `sheet_${s}`));
    group.forEach((g, k) => fs.copyFileSync(g.f, path.join(listDir, `${String(k).padStart(2, '0')}.png`)));
    ffmpeg(['-i', path.join(listDir, '%02d.png'), '-vf', 'tile=4x3:padding=4:margin=4:color=black', '-frames:v', '1', '-q:v', '3', path.join(CHECK, name)], { label: 'コマ一覧' });
    sheets.push({ file: path.join(CHECK, name), times: group.map((g) => fmtTime(g.t)) });
  }
  if (args.stills) {
    for (const t of String(args.stills).split(',').map(Number).filter((x) => Number.isFinite(x))) {
      ffmpeg(['-ss', num(Math.min(t, TOTAL - 0.05)), '-i', OUT, '-frames:v', '1', path.join(CHECK, `still_${String(t).replace('.', '_')}.png`)], { label: 'コマ' });
    }
  }
  return sheets;
}

function verify(silent) {
  const p = probe(OUT);
  const loud = silent ? null : measureLoudness(OUT);
  const target = Number(audio.loudness ?? -14);
  const rows = [
    [p.width === W && p.height === H, `解像度 ${p.width}×${p.height}（期待 ${W}×${H}）`],
    [Math.abs(p.fps - FPS) < 0.01, `fps ${Math.round(p.fps * 100) / 100}（期待 ${FPS}）`],
    [Math.abs(p.videoDuration - TOTAL) < 0.25, `映像の長さ ${p.videoDuration.toFixed(2)}秒（計画 ${TOTAL.toFixed(2)}秒）`],
    [!p.hasAudio || Math.abs(p.audioDuration - TOTAL) < 0.25, `音の長さ ${p.hasAudio ? p.audioDuration.toFixed(2) : '-'}秒`],
    [p.hasAudio, `音声トラック ${p.hasAudio ? 'あり' : 'なし'}`],
  ];
  if (loud) {
    rows.push([loud.lufs != null && Math.abs(loud.lufs - target) <= 1.0, `平均の大きさ ${loud.lufs} LUFS（目標 ${target}）`]);
    rows.push([loud.truePeak != null && loud.truePeak <= -1.0, `ピーク ${loud.truePeak} dBTP（-1.0 以下）`]);
  } else rows.push([true, '音：無音（BGM・環境音・声・動画素材の音が無い）']);
  return rows.map(([ok, t]) => `${ok ? '✓' : '✗'} ${t}`);
}

// ───────────────────────── 本体 ─────────────────────────
const t0 = Date.now();
// 時刻の書き間違いは、時間のかかる書き出しの前に見つける
for (const [j, v] of (audio.voice || []).entries()) atTime(v.at, `audio.voice[${j}].at`);
for (const [j, s] of (audio.sfx || []).entries()) atTime(s.at, `audio.sfx[${j}].at`);
for (const [j, a] of (audio.ambience || []).entries()) {
  if (a.from != null) atTime(a.from, `audio.ambience[${j}].from`);
  if (a.to != null) atTime(a.to, `audio.ambience[${j}].to`);
}

console.log(`「${ep.title || id}」 ${shots.length} 場面・${fmtTime(TOTAL)}（${TOTAL.toFixed(1)}秒）・${W}×${H}・${FPS}fps${DRAFT ? '（下書き）' : ''}`);
const segs = shots.map((s) => {
  process.stdout.write(`\r場面 ${s.i + 1}/${shots.length} を作成中…`);
  return renderShot(s);
});
console.log('\n場面をつないでいます…');
const timeline = renderTimeline(segs);
console.log('質感・文字を合成中…');
const video = renderLook(timeline);
console.log('音を合成中…');
const mixed = args['no-audio'] ? { file: null, silent: true } : renderAudio();
if (mixed.file) {
  ffmpeg(['-i', video, '-i', mixed.file, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', num(TOTAL), '-movflags', '+faststart', OUT], { label: '書き出し' });
} else {
  fs.copyFileSync(video, OUT);
}
const srt = writeSrt(mixed.voiceWins);
const sheets = checkSheets();
const report = verify(mixed.silent);
writeJson(
  path.join(CHECK, 'timeline.json'),
  shots.map((s) => ({
    no: s.i + 1,
    start: +s.start.toFixed(2),
    head: +s.head.toFixed(2),
    end: +s.end.toFixed(2),
    move: s.move,
    transition: s.tName,
    caption: s.caption || null,
    src: s.card ? 'card' : s.video && fs.existsSync(rel(s.video)) ? s.video : s.image,
  })),
);
if (!args['keep-temp']) fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\n完成：${OUT}${srt ? `\n字幕：${srt}` : ''}`);
for (const s of sheets) console.log(`確認用：${s.file}（左上から右へ ${s.times.join(' / ')}）`);
console.log(report.join('\n'));
console.log(`所要 ${Math.round((Date.now() - t0) / 1000)}秒`);
if (report.some((r) => r.startsWith('✗'))) process.exitCode = 2;

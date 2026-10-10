#!/usr/bin/env node
// サムネイル（1280×720 の JPEG）を作る：画像に色・粒子・周辺減光をかけ、町名などの文字を大きく載せる。
//
// 使い方:
//   node make-thumb.mjs --image images/004.png --title "凪ヶ浦町" [--sub "存在しない街の記憶 #003"]
//                       [--stamp "'89 7 30"] [--pos bl|c|tl|...] [--grade faded-warm] [--font mincho]
//                       [--color "#F6F1E7"] [--out thumb.jpg] [--focus 0.5,0.5] [--zoom 1.0]
//
// 小さく表示されても読めるように：文字は 2〜8 文字、画面の高さの 14% 前後、背景の暗いところに置く。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, ensureDir } from './lib/common.mjs';
import { findFont, escPath, ffmpeg } from './lib/media.mjs';

// 想定内のエラーは、内部の情報を出さずにメッセージだけ表示する
process.on('uncaughtException', (e) => {
  console.error(`エラー：${e?.message || e}`);
  process.exit(1);
});

const args = parseArgs(process.argv.slice(2), { flags: ['help'] });
if (args.help || !args.image || !args.title) {
  console.log('node make-thumb.mjs --image <画像> --title "町名" [--sub "…"] [--stamp "…"] [--pos bl] [--grade faded-warm] [--out thumb.jpg]');
  process.exit(args.help ? 0 : 1);
}
const W = 1280;
const H = 720;
const img = path.resolve(args.image);
if (!fs.existsSync(img)) throw new Error(`画像が見つかりません：${args.image}`);
const out = path.resolve(args.out || 'thumb.jpg');
ensureDir(path.dirname(out));
// 書体の fonts/ はエピソードのフォルダに置く約束。画像が images/ の中なら、その 1 つ上がエピソードのフォルダ
const workDir = path.basename(path.dirname(img)) === 'images' ? path.dirname(path.dirname(img)) : path.dirname(img);
const font = findFont(args.font || 'mincho', workDir);
if (!font) throw new Error('日本語の書体が見つかりません');
const tmpDir = ensureDir(path.join(path.dirname(out), '.thumb_tmp'));
const tf = (name, s) => {
  const f = path.join(tmpDir, `${name}.txt`);
  fs.writeFileSync(f, s, 'utf8');
  return escPath(f);
};
const color = (args.color || '#F6F1E7').replace('#', '0x');
const pos = args.pos || 'bl';
const [fx, fy] = String(args.focus || '0.5,0.5').split(',').map(Number);
const zoom = Math.max(1, Number(args.zoom) || 1);

const GRADES = {
  none: '',
  cinema: "curves=all='0/0.03 0.5/0.5 1/0.97',colorbalance=rs=-0.02:bs=0.03:rh=0.03:bh=-0.03,eq=contrast=1.04:saturation=0.95",
  vhs: "curves=all='0/0.06 0.5/0.5 1/0.92',eq=saturation=1.12:contrast=0.9",
  'faded-warm': "curves=all='0/0.06 0.5/0.5 1/0.94',colorbalance=rs=0.05:bs=-0.05:rh=0.03:bh=-0.04,eq=saturation=0.9:contrast=1.02",
  'faded-cool': "curves=all='0/0.06 0.5/0.5 1/0.95',colorbalance=rs=-0.03:bs=0.05:bh=0.03,eq=saturation=0.85",
  dusk: "colorbalance=rs=0.04:bs=0.07:rh=0.07:bh=-0.07,eq=saturation=0.95",
  summer: "curves=all='0/0.05 1/0.98',eq=brightness=0.03:saturation=1.05:contrast=0.95",
  night: "colorbalance=bs=0.07:rh=0.08:bh=-0.08,eq=brightness=-0.02:saturation=0.9",
  mono: "hue=s=0,eq=contrast=1.08",
};
if (args.grade && !(args.grade in GRADES)) {
  console.error(`--grade は ${Object.keys(GRADES).join(' / ')} のどれか`);
  process.exit(1);
}
const grade = GRADES[args.grade || 'faded-warm'];
const big = Math.round(H * (Number(args.size) || 0.14));
const sub = Math.round(H * 0.045);
const m = Math.round(W * 0.055);
// 文字の位置（題の高さ≒文字サイズとして計算。副題は題のすぐ下）
const hasSub = Boolean(args.sub);
const vert = pos[0] === 't' ? 'top' : pos === 'c' ? 'center' : 'bottom';
const horiz = pos === 'c' || pos[1] === 'c' ? 'center' : pos[1] === 'r' ? 'right' : 'left';
const titleY =
  vert === 'top' ? m : vert === 'center' ? Math.round((H - big) / 2 - (hasSub ? sub * 0.6 : 0)) : Math.round(H - m - (hasSub ? sub * 1.7 : 0) - big);
const subY = titleY + Math.round(big * 1.12);
const X = horiz === 'center' ? '(w-tw)/2' : horiz === 'right' ? `w-tw-${m}` : `${m}`;
const P = { x: X, y: `${titleY}` };

const cw = Math.round(W / zoom);
const ch = Math.round(H / zoom);
const f = [
  `scale=${W}:${H}:force_original_aspect_ratio=increase`,
  `crop=${W}:${H}`,
  zoom > 1 ? `crop=${cw}:${ch}:${Math.round((W - cw) * fx)}:${Math.round((H - ch) * fy)},scale=${W}:${H}` : null,
  grade || null,
  'vignette=angle=0.55',
  'noise=c0s=10:c0f=u',
  `drawtext=fontfile='${escPath(font)}':textfile='${tf('title', args.title)}':expansion=none:fontsize=${big}:fontcolor=${color}:shadowcolor=black@0.7:shadowx=3:shadowy=3:x=${P.x}:y=${P.y}`,
  args.sub
    ? `drawtext=fontfile='${escPath(font)}':textfile='${tf('sub', args.sub)}':expansion=none:fontsize=${sub}:fontcolor=${color}@0.9:shadowcolor=black@0.7:shadowx=2:shadowy=2:x=${P.x}:y=${subY}`
    : null,
  args.stamp
    ? `drawtext=fontfile='${escPath(findFont('mono', workDir) || font)}':textfile='${tf('stamp', args.stamp)}':expansion=none:fontsize=${Math.round(H * 0.05)}:fontcolor=0xFFB347@0.95:shadowcolor=black@0.5:shadowx=2:shadowy=2:x=w-tw-${m}:y=h-th-${m}`
    : null,
].filter(Boolean);
ffmpeg(['-i', img, '-vf', f.join(','), '-frames:v', '1', '-q:v', '2', out], { label: 'サムネイル' });
fs.rmSync(tmpDir, { recursive: true, force: true });
const kb = Math.round(fs.statSync(out).size / 1024);
console.log(`✓ ${out}（${W}×${H}・${kb}KB${kb > 2000 ? '：2MB を超えています。-q:v を上げて小さく' : ''}）`);
console.log('Read で開き、縮小しても町名が読めるか・顔や文字が紛れていないかを確かめる');

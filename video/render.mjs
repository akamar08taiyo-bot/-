#!/usr/bin/env node
/**
 * 台本JSON → 縦型ショート動画（MP4 1080x1920）
 *
 *   node render.mjs                        # 既定の台本を書き出し
 *   node render.mjs --script scripts/x.json --out out/x.mp4
 *   node render.mjs --preview 0,6,22       # 指定秒の静止画だけ確認（高速）
 *   node render.mjs --no-audio             # BGMなし（あとから自分で付ける場合）
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ---------- 引数 ---------- */
function parseArgs(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const scriptPath = path.resolve(HERE, args.script || 'scripts/weight-trend.json');
const spec = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const fps = Number(args.fps || spec.fps || 30);
const width = Number(spec.width || 1080);
const height = Number(spec.height || 1920);
const quality = Number(args.quality || 96);
const withAudio = args['no-audio'] !== true;
const outFile = path.resolve(HERE, args.out || `out/${spec.id || 'short'}.mp4`);
const workDir = path.join(HERE, 'out', '.work', spec.id || 'short');
const duration = spec.scenes.reduce((sum, s) => sum + s.dur, 0);

/* ---------- フォント（node_modules から data URI で埋め込む） ---------- */
function fontFaces() {
  const dir = path.join(HERE, 'node_modules', '@fontsource', 'noto-sans-jp', 'files');
  if (!fs.existsSync(dir)) {
    console.warn('[warn] @fontsource/noto-sans-jp が見つかりません。システムのゴシック体で描画します。');
    return '';
  }
  const css = [];
  for (const weight of [400, 500, 700, 900]) {
    for (const subset of ['latin', 'japanese']) {
      const file = path.join(dir, `noto-sans-jp-${subset}-${weight}-normal.woff2`);
      if (!fs.existsSync(file)) continue;
      const b64 = fs.readFileSync(file).toString('base64');
      css.push(
        `@font-face{font-family:'Noto Sans JP';font-style:normal;font-weight:${weight};` +
        `font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
      );
    }
  }
  return css.join('\n');
}

/* ---------- Chromium の実体を探す ---------- */
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && fs.existsSync(root)) {
    const dirs = fs.readdirSync(root)
      .filter(d => d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  try { return chromium.executablePath(); } catch { return undefined; }
}

const pad = (n, w = 5) => String(n).padStart(w, '0');
const srtTime = sec => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms % 1000, 3)}`;
};

function writeSrt(target) {
  let t = 0;
  const lines = spec.scenes.map((s, i) => {
    const block = `${i + 1}\n${srtTime(t)} --> ${srtTime(t + s.dur)}\n${s.caption}\n`;
    t += s.dur;
    return block;
  });
  fs.writeFileSync(target, lines.join('\n'), 'utf8');
}

function run(bin, argv, label) {
  const r = spawnSync(bin, argv, {stdio: ['ignore', 'pipe', 'pipe']});
  if (r.status !== 0) {
    process.stderr.write(r.stderr?.toString() || '');
    throw new Error(`${label} に失敗しました (exit ${r.status})`);
  }
  return r;
}

/* ---------- BGM（依存ファイルなしで ffmpeg が合成する静かなパッド） ---------- */
function buildAudio(ffmpeg, target) {
  const expr = [
    '0.20*sin(2*PI*110*t)',
    '0.16*sin(2*PI*164.81*t)',
    '0.12*sin(2*PI*220*t)',
    '0.07*sin(2*PI*329.63*t)',
    '0.04*sin(2*PI*440*t)',
  ].join('+');
  run(ffmpeg, [
    '-y', '-f', 'lavfi',
    '-i', `aevalsrc=${expr}:d=${duration.toFixed(3)}:s=48000:c=stereo`,
    '-af', [
      'tremolo=f=0.11:d=0.32',
      'lowpass=f=760',
      'aecho=0.8:0.85:280|470:0.3|0.2',
      'volume=0.30',
      `afade=t=in:st=0:d=2`,
      `afade=t=out:st=${Math.max(0, duration - 2.5).toFixed(3)}:d=2.5`,
    ].join(','),
    '-c:a', 'aac', '-b:a', '160k', target,
  ], 'BGMの生成');
}

/* ---------- 本体 ---------- */
const html = fs
  .readFileSync(path.join(HERE, 'src', 'template.html'), 'utf8')
  .replace('__FONT_FACES__', fontFaces())
  .replace('__SCRIPT_JSON__', JSON.stringify(spec));

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
});
const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
await page.setContent(html, {waitUntil: 'load'});
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.__ready === true, null, {timeout: 20000});

const shoot = async (t, file) => {
  await page.evaluate(time => window.__render(time), t);
  await page.screenshot({path: file, type: path.extname(file) === '.png' ? 'png' : 'jpeg', ...(path.extname(file) === '.png' ? {} : {quality})});
};

if (args.preview) {
  const times = String(args.preview === true ? '0' : args.preview).split(',').map(Number);
  const dir = path.join(HERE, 'out', 'preview');
  fs.mkdirSync(dir, {recursive: true});
  for (const t of times) {
    const file = path.join(dir, `${spec.id}-${t.toFixed(2).replace('.', '_')}s.png`);
    await shoot(t, file);
    console.log('preview →', path.relative(HERE, file));
  }
  await browser.close();
  process.exit(0);
}

const framesDir = path.join(workDir, 'frames');
fs.rmSync(framesDir, {recursive: true, force: true});
fs.mkdirSync(framesDir, {recursive: true});

const totalFrames = Math.round(duration * fps);
console.log(`[render] ${spec.title} — ${duration.toFixed(1)}s / ${totalFrames}frames @${fps}fps ${width}x${height}`);
const started = Date.now();
for (let f = 0; f < totalFrames; f++) {
  await shoot(f / fps, path.join(framesDir, `${pad(f)}.jpg`));
  if (f % 60 === 0 || f === totalFrames - 1) {
    const done = f + 1;
    const eta = ((Date.now() - started) / done) * (totalFrames - done) / 1000;
    console.log(`  ${done}/${totalFrames} (${((done / totalFrames) * 100).toFixed(0)}%) 残り約${eta.toFixed(0)}s`);
  }
}
await browser.close();

const ffmpeg = ffmpegInstaller.path;
fs.mkdirSync(path.dirname(outFile), {recursive: true});

const videoArgs = ['-y', '-framerate', String(fps), '-i', path.join(framesDir, '%05d.jpg')];
let audioFile = null;
if (withAudio) {
  audioFile = path.join(workDir, 'bgm.m4a');
  buildAudio(ffmpeg, audioFile);
  videoArgs.push('-i', audioFile);
}
videoArgs.push(
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
  '-r', String(fps), '-movflags', '+faststart',
);
if (withAudio) videoArgs.push('-c:a', 'aac', '-b:a', '160k', '-shortest');
videoArgs.push(outFile);
run(ffmpeg, videoArgs, 'MP4のエンコード');

const srtFile = outFile.replace(/\.mp4$/, '.srt');
writeSrt(srtFile);
if (!args['keep-frames']) fs.rmSync(framesDir, {recursive: true, force: true});

const size = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log(`[done] ${path.relative(HERE, outFile)} (${size}MB) / ${path.relative(HERE, srtFile)}`);

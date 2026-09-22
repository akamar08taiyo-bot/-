/**
 * 動画メーカー（video.html）の通し確認。
 *
 * 画像の追加 → テロップ入力 → BGM 読み込み → 再生 → 書き出し → 書き出した動画の再生、
 * までを実ブラウザで一度に確かめる。素材は実行時に生成するので追加ファイルは要らない。
 *
 * 使い方:
 *   npm run build && npm run preview -- --port 4173   # 別のターミナルで起動しておく
 *   npx playwright@latest install chromium            # 初回のみ
 *   node tools/verify-video.mjs
 *
 * 環境変数:
 *   BASE_URL            確認先（既定 http://localhost:4173）
 *   CHROMIUM_PATH       Chromium の実行ファイルを明示したい場合
 */
import {chromium} from 'playwright';
import {mkdtempSync, writeFileSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const DIR = mkdtempSync(path.join(tmpdir(), 'video-verify-'));
const log = (...a) => console.log('•', ...a);

/** 依存を増やさずに済むよう、確認用の PNG はその場で組み立てる */
function writePng(file, w, h, pixel) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y, w, h);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) >>> 0 : crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
  return file;
}

// Node 20 以前には zlib.crc32 が無いため、自前で持っておく
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** 440Hz の WAV を作る（BGM 合成の確認用） */
function writeWav(file, seconds = 5) {
  const rate = 44100;
  const count = rate * seconds;
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) data.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
  return file;
}

const shots = [
  writePng(path.join(DIR, 'shot1.png'), 1200, 800, (x, y, w, h) => [30 + ((200 * x) / w) | 0, 60 + ((120 * y) / h) | 0, 200]),
  writePng(path.join(DIR, 'shot2.png'), 800, 1200, (x, y, w, h) => [220, 80 + ((150 * y) / h) | 0, 40 + ((120 * x) / w) | 0]),
  writePng(path.join(DIR, 'shot3.png'), 1000, 1000, (x, y) => [
    (255 * Math.abs(Math.sin(x / 70))) | 0,
    (255 * Math.abs(Math.cos(y / 90))) | 0,
    120,
  ]),
];
const bgm = writeWav(path.join(DIR, 'bgm.wav'));

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({viewport: {width: 1280, height: 1000}, acceptDownloads: true});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

/** キャンバスに絵が出ているか（単色でないか）を色数で判定する */
const canvasColors = () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 977) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return {width: c.width, height: c.height, colors: seen.size};
  });

await page.goto(`${BASE}/video.html`, {waitUntil: 'networkidle'});
log('対応状況:', JSON.stringify(await page.evaluate(() => ({
  mediaRecorder: typeof MediaRecorder !== 'undefined',
  captureStream: typeof HTMLCanvasElement.prototype.captureStream === 'function',
}))));

await page.setInputFiles('input[type=file][accept="image/*"]', shots);
await page.waitForSelector('li:has(img)');
const clips = await page.locator('li:has(img)').count();
log('カット数:', clips);
if (clips !== shots.length) throw new Error(`カットが ${shots.length} 件になりません: ${clips}`);

const titles = page.locator('input[placeholder="例：秋の京都へ"]');
await titles.nth(0).fill('写真からつくる動画、テロップも自動で折り返します。');
await titles.nth(1).fill('縦位置・揃え・大きさを変えられる');
await titles.nth(2).fill('BGMも合成できます');
await page.locator('input[placeholder="例：2026年11月"]').nth(0).fill('ブラウザの中だけで完結');

// 先頭フレームが背景色だけになっていないこと（1カット目が見えない不具合の番人）
const first = await canvasColors();
log('0秒時点:', JSON.stringify(first));
if (first.colors < 20) throw new Error('先頭フレームがほぼ単色です（1カット目が表示されていません）');

await page.setInputFiles('input[type=file][accept="audio/*"]', bgm);
await page.waitForSelector('text=bgm.wav', {timeout: 10000});
log('BGM 読み込み: ok');

// 再生して時刻が進むか
await page.getByRole('button', {name: '再生'}).click();
await page.waitForTimeout(1500);
const shown = await page.locator('span.tabular-nums').filter({hasText: '/'}).first().innerText();
await page.getByRole('button', {name: '一時停止'}).click();
log('再生中の時刻:', shown.replace(/\s+/g, ' '));
if (!/0:0[1-9]/.test(shown)) throw new Error('再生しても時刻が進みません: ' + shown);

// 縦型に切り替えたときの寸法
await page.getByRole('radio', {name: '9:16 縦'}).click();
await page.waitForTimeout(200);
const vertical = await canvasColors();
log('9:16 切替後:', JSON.stringify(vertical));
if (vertical.width >= vertical.height) throw new Error('9:16 で縦長になっていません');
await page.getByRole('radio', {name: '16:9 横'}).click();
await page.getByRole('radio', {name: '540p 軽い'}).click();

// 書き出し（実時間で動画の長さぶんかかる）
const downloadPromise = page.waitForEvent('download', {timeout: 180000});
await page.getByRole('button', {name: '動画を書き出す'}).click();
log('書き出し中…');
const download = await downloadPromise;
const saved = path.join(DIR, download.suggestedFilename());
await download.saveAs(saved);
log('保存:', download.suggestedFilename(), statSync(saved).size, 'bytes');
await page.waitForSelector('text=/書き出しました/', {timeout: 30000});

// 書き出した動画が実際に再生できるか
const playback = await page.evaluate(async () => {
  const v = document.querySelector('video');
  if (!v) return {error: 'video要素が見つかりません'};
  v.muted = true;
  await new Promise((res, rej) => {
    if (v.readyState >= 1) return res();
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error('動画を読み込めません'));
    setTimeout(() => rej(new Error('読み込みタイムアウト')), 15000);
  });
  await v.play();
  await new Promise((r) => setTimeout(r, 1500));
  const advanced = v.currentTime;
  v.pause();
  return {width: v.videoWidth, height: v.videoHeight, advanced};
});
log('書き出した動画の再生:', JSON.stringify(playback));
if (playback.error) throw new Error('書き出した動画を再生できません: ' + playback.error);
if (!(playback.width > 0 && playback.advanced > 0.3)) throw new Error('書き出した動画に映像がありません');

// スマホ幅で横スクロールが出ないか
const mobile = await ctx.newPage();
await mobile.goto(`${BASE}/video.html`, {waitUntil: 'networkidle'});
await mobile.setViewportSize({width: 390, height: 844});
await mobile.setInputFiles('input[type=file][accept="image/*"]', [shots[0]]);
await mobile.waitForSelector('li:has(img)');
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
log('スマホ幅の横はみ出し:', overflow, 'px');
if (overflow > 1) throw new Error('スマホ幅で横スクロールが発生します: ' + overflow);

await browser.close();
if (errors.length) {
  console.error('ページ内エラー:', errors);
  process.exit(1);
}
console.log('\n✅ すべての確認項目を通過（素材:', DIR, '）');

// カットごとに無音で書き出す → out/shots/<ID>.mp4（つなぎは scripts/assemble.py で ffmpeg が行う）
// 使い方: node scripts/render_shots.mjs [ID ...]   （省略時は全カット。書き出し済みのカットは飛ばす。--force で上書き）
import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, selectComposition} from '@remotion/renderer';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'out', 'shots');
fs.mkdirSync(outDir, {recursive: true});
const args = process.argv.slice(2);
const force = args.includes('--force');
const timeline = JSON.parse(fs.readFileSync(path.join(root, 'src', 'timeline.json'), 'utf8'));
let ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) ids = timeline.shots.map((s) => s.id);
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public')});
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const chromiumOptions = {gl: 'swangle'};
const open = () => openBrowser('chrome', {browserExecutable, chromiumOptions});
let browser = await open();
for (const id of ids) {
  const out = path.join(outDir, `${id}.mp4`);
  if (fs.existsSync(out) && !force) { console.log(id, 'exists'); continue; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    try {
      const inputProps = {id, filmLook: false};
      const composition = await selectComposition({serveUrl, id, puppeteerInstance: browser, inputProps});
      await renderMedia({
        composition, serveUrl, inputProps, outputLocation: out + '.tmp.mp4', codec: 'h264', crf: 16, pixelFormat: 'yuv420p',
        muted: true, concurrency: 4, puppeteerInstance: browser, browserExecutable, chromiumOptions, timeoutInMilliseconds: 120000, offthreadVideoCacheSizeInBytes: 2 * 1024 ** 3,
      });
      fs.renameSync(out + '.tmp.mp4', out);
      console.log(id, 'done', ((Date.now() - t0) / 1000).toFixed(0), 's');
      break;
    } catch (e) {
      console.log(id, 'failed attempt', attempt, String(e).slice(0, 300));
      try { await browser.close({silent: true}); } catch {}
      browser = await open();
      if (attempt === 3) console.log(id, 'GAVE UP');
    }
  }
}
await browser.close({silent: true});
console.log('all done');

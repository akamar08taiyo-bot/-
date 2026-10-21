// 映像を無音で書き出す（音は scripts/finish.py で重ねる）。 node scripts/render.mjs <回> [--draft]
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, selectComposition} from '@remotion/renderer';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ep = process.argv[2];
const draft = process.argv.includes('--draft');
const out = path.join(root, 'work', ep, draft ? 'video_draft.mp4' : 'video_silent.mp4');
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public'), outDir: path.join(root, 'work', 'bundle')});
const browser = await openBrowser('chrome', {
  browserExecutable: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  chromiumOptions: {gl: 'swangle'},
});
const composition = await selectComposition({serveUrl, id: ep, puppeteerInstance: browser});
const t0 = Date.now();
let last = 0;
await renderMedia({
  composition,
  serveUrl,
  outputLocation: out,
  codec: 'h264',
  crf: draft ? 26 : 16,
  scale: draft ? 0.5 : 1,
  pixelFormat: 'yuv420p',
  muted: true,
  concurrency: 4,
  puppeteerInstance: browser,
  timeoutInMilliseconds: 120000,
  onProgress: ({progress, renderedFrames}) => {
    const now = Date.now();
    if (now - last > 15000) {
      last = now;
      console.log(`${(progress * 100).toFixed(1)}%  frames ${renderedFrames}  ${((now - t0) / 1000).toFixed(0)}s`);
    }
  },
});
await browser.close({silent: true});
console.log('done', path.relative(root, out), ((Date.now() - t0) / 1000).toFixed(0), 's');

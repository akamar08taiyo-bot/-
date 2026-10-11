// 使い方: node scripts/render.mjs <出力.mp4> [開始フレーム-終了フレーム]
// 本編（Main）を無音で書き出す。音は別に ffmpeg で重ねる
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, selectComposition} from '@remotion/renderer';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'out', 'video_silent.mp4'));
const range = process.argv[3] ? process.argv[3].split('-').map(Number) : null;
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public'),
  // 毎回 /tmp に public ごと（1GB超）複製されてディスクを使い切ったため、置き場所を一つに固定して上書きする
  outDir: path.join(root, 'work', 'bundle')});
const browser = await openBrowser('chrome', {
  browserExecutable: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  chromiumOptions: {gl: 'swangle'},
});
const inputProps = {filmLook: false};
const composition = await selectComposition({serveUrl, id: 'Main', puppeteerInstance: browser, inputProps});
const t0 = Date.now();
let last = 0;
await renderMedia({
  composition, serveUrl, inputProps, outputLocation: out, codec: 'h264', crf: 17, pixelFormat: 'yuv420p',
  muted: true, concurrency: 4, puppeteerInstance: browser, frameRange: range, timeoutInMilliseconds: 600000,
  offthreadVideoCacheSizeInBytes: 2 * 1024 ** 3,
  onProgress: ({progress, renderedFrames}) => {
    const now = Date.now();
    if (now - last > 30000) {
      last = now;
      console.log(`${(progress * 100).toFixed(1)}%  frames ${renderedFrames}  ${((now - t0) / 1000).toFixed(0)}s`);
    }
  },
});
await browser.close({silent: true});
console.log('done', out, ((Date.now() - t0) / 1000).toFixed(0), 's');

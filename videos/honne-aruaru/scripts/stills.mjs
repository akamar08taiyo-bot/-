// 確認用の静止画。 node scripts/stills.mjs <回> 0 1.5 4 ...（秒）→ work/<回>/stills/f_<秒>.png と一覧 sheet.jpg
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [ep, ...rest] = process.argv.slice(2);
const times = rest.map(Number);
const outDir = path.join(root, 'work', ep, 'stills');
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public'), outDir: path.join(root, 'work', 'bundle')});
const browser = await openBrowser('chrome', {
  browserExecutable: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  chromiumOptions: {gl: 'swangle'},
});
const composition = await selectComposition({serveUrl, id: ep, puppeteerInstance: browser});
const files = [];
for (const t of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(t * composition.fps));
  const output = path.join(outDir, `f_${t.toFixed(2)}.png`);
  await renderStill({composition, serveUrl, output, frame, puppeteerInstance: browser, imageFormat: 'png'});
  files.push(output);
  console.log('still', t, frame);
}
await browser.close({silent: true});
execFileSync('python3', ['-I', path.join(root, 'scripts', 'img_sheet.py'), path.join(outDir, 'sheet.jpg'), ...files], {stdio: 'inherit'});

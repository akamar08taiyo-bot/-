// 使い方: node scripts/stills.mjs S01:2,10,18 P0:5,20  → work/stills/<id>_<sec>.jpg と sheet
import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {browserExecutable, chromiumOptions} from './browser.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'work', 'stills');
fs.mkdirSync(outDir, {recursive: true});
const specs = process.argv.slice(2).map((a) => {
  const [id, secs] = a.split(':');
  return {id, secs: (secs ?? '1').split(',').map(Number)};
});
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public'),
  // 毎回 /tmp に public ごと（1GB超）複製されてディスクを使い切ったため、置き場所を一つに固定して上書きする
  outDir: path.join(root, 'work', 'bundle')});
const browser = await openBrowser('chrome', {browserExecutable, chromiumOptions});
const outputs = [];
for (const {id, secs} of specs) {
  const composition = await selectComposition({serveUrl, id, puppeteerInstance: browser});
  for (const s of secs) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps));
    const output = path.join(outDir, `${id}_${String(s).replace('.', '_')}.jpg`);
    const t0 = Date.now();
    await renderStill({composition, serveUrl, output, frame, puppeteerInstance: browser, imageFormat: 'jpeg', jpegQuality: 88});
    console.log(`${id} @${s}s -> ${path.relative(root, output)} (${Date.now() - t0}ms)`);
    outputs.push(output);
  }
}
await browser.close({silent: true});
fs.writeFileSync(path.join(outDir, 'last.txt'), outputs.join('\n'));

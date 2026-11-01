// Render check frames and tile them into contact sheets.
// usage: node scripts/stills.mjs [t1 t2 ...]   (seconds; default = one frame per lyric line + key moments)
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const timing = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/timing.json'), 'utf8'));
const browserExecutable = process.env.REMOTION_BROWSER || '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

let times = process.argv.slice(2).map(Number);
if (!times.length) {
  times = [0.05];
  for (const l of timing.lines) {
    const last = l.phrases[l.phrases.length - 1];
    times.push(Math.min(l.end - 0.1, last.start + 0.45));
  }
  const s = (id) => timing.sections.find((x) => x.id === id).start;
  times.push(s('hook') - 0.05, s('v2') + 0.05, s('final') - 0.3, timing.cut + 0.3);
  times.sort((a, b) => a - b);
}

const outDir = path.join(ROOT, 'work', 'stills');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'MV', browserExecutable, inputProps: { withAudio: false } });
const files = [];
for (const [i, t] of times.entries()) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(t * composition.fps));
  const out = path.join(outDir, `s${String(i).padStart(2, '0')}_${t.toFixed(2)}.png`);
  await renderStill({ serveUrl, composition, frame, output: out, browserExecutable, inputProps: { withAudio: false }, chromiumOptions: { gl: 'swangle' } });
  files.push(out);
  process.stdout.write(`${t.toFixed(2)} `);
}
// contact sheets: 6 per sheet, labelled
execFileSync('python3', ['-c', `
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
files = sorted(glob.glob(os.path.join(sys.argv[1], 's*.png')))
font = ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', 40) if os.path.exists('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf') else None
W, H = 360, 640
for n in range(0, len(files), 6):
    chunk = files[n:n+6]
    sheet = Image.new('RGB', (W*len(chunk) + 10*(len(chunk)-1), H + 50), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        im = Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS)
        sheet.paste(im, (i*(W+10), 50))
        d.text((i*(W+10)+8, 4), os.path.basename(f)[4:-4] + 's', fill=(255,255,0), font=font)
    sheet.save(os.path.join(sys.argv[1], f'sheet-{n//6:02d}.png'))
`, outDir]);
console.log('\nsheets in', outDir);

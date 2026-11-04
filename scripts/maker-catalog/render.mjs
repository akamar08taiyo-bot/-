// メーカーのカタログの PDF を、ページの絵（jpg）と、ページの文字と位置（json）にする（pdf.js を Playwright の Chromium で動かす）。
// TOTO の手すりカタログ（2026-11-04 にいただいた PDF）は日本語の字体が PDF に入っておらず、poppler（pdftoppm）では日本語が消えた絵になる。
// pdf.js はパソコンの字体で日本語を描き、文字の位置も読めるので、こちらを使う（矢崎化工は文字のない絵だけの PDF なので読み取り＝scripts/yazaki-catalog/）。
// usage: node scripts/maker-catalog/render.mjs <PDF> <出力フォルダ> <名前の頭（toto など）> [最初のページ] [最後のページ] [dpi=150]
//   → <出力フォルダ>/<頭>-p012.jpg と <出力フォルダ>/<頭>-text.json（[{page, w, h, items: [[文字, x, y, w, h], …]}]。位置はページの幅・高さの割合）
// 金額の字も入るので、text.json はリポジトリに入れない（作業用のフォルダに置く）。
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
const [pdf, outDir, prefix, firstArg, lastArg, dpiArg] = process.argv.slice(2);
if (!pdf || !outDir || !prefix) throw new Error('usage: render.mjs <PDF> <出力フォルダ> <名前の頭> [最初] [最後] [dpi]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pdfjs = path.join(root, 'node_modules/pdfjs-dist');
mkdirSync(outDir, {recursive: true});

const types = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.pdf': 'application/pdf'};
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><script type="module">
import * as lib from '/pdfjs/legacy/build/pdf.mjs';
lib.GlobalWorkerOptions.workerSrc = '/pdfjs/legacy/build/pdf.worker.mjs';
const data = new Uint8Array(await (await fetch('/doc.pdf')).arrayBuffer());
window.doc = await lib.getDocument({data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/'}).promise;
window.ready = true;
</script>`;
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (url === '/') return res.writeHead(200, {'content-type': 'text/html'}).end(html);
    const file = url === '/doc.pdf' ? pdf : url.startsWith('/pdfjs/') ? path.join(pdfjs, url.slice(7)) : null;
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, {'content-type': types[path.extname(file)] ?? 'application/octet-stream'}).end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
await page.goto(base + '/');
await page.waitForFunction(() => window.ready, null, {timeout: 40000});
const count = await page.evaluate(() => window.doc.numPages);
const first = Number(firstArg || 1);
const last = Math.min(Number(lastArg || count), count);
const scale = Number(dpiArg || 150) / 72;
const texts = [];
for (let n = first; n <= last; n++) {
  const r = await page.evaluate(
    async ({n, scale}) => {
      const p = await window.doc.getPage(n);
      const vp = p.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await p.render({canvasContext: ctx, viewport: vp}).promise;
      const tc = await p.getTextContent();
      const base = p.getViewport({scale: 1});
      const items = tc.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => {
          const [a, b, , d, e, f] = it.transform;
          const h = Math.hypot(b, d) || Math.abs(d) || 1;
          // PDF の座標（左下が原点）→ ページの割合（左上が原点）
          return [it.str, e / base.width, 1 - (f + h * 0.85) / base.height, (it.width || 0) / base.width, (h * 1.1) / base.height].map((v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v));
        });
      return {jpg: canvas.toDataURL('image/jpeg', 0.72), w: canvas.width, h: canvas.height, items};
    },
    {n, scale},
  );
  writeFileSync(path.join(outDir, `${prefix}-p${String(n).padStart(3, '0')}.jpg`), Buffer.from(r.jpg.split(',')[1], 'base64'));
  texts.push({page: n, w: r.w, h: r.h, items: r.items});
  process.stdout.write(`p.${n} ${r.items.length}字の塊\n`);
}
writeFileSync(path.join(outDir, `${prefix}-text.json`), JSON.stringify(texts));
await browser.close();
server.close();

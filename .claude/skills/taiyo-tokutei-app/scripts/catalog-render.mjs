// 介援隊カタログの PDF を 300dpi の絵にする（目で見る点検用。pdftoppm はこの環境で日本語の字体を描けないので、アプリと同じ pdf.js で描く）
// 使い方：node catalog-render.mjs <リポジトリ> <出力フォルダ>   → <出力>/kaientai-pNNN.png
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [repo, out] = process.argv.slice(2).map((p) => path.resolve(p));
mkdirSync(out, {recursive: true});
const root = path.join(repo, 'node_modules/pdfjs-dist');
const pdfjs = await import(pathToFileURL(path.join(root, 'legacy/build/pdf.mjs')).href);
const dir = path.join(repo, 'public-tokutei/catalog');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()) {
  const task = pdfjs.getDocument({data: new Uint8Array(readFileSync(path.join(dir, file))), cMapUrl: `${root}/cmaps/`, cMapPacked: true, verbosity: 0, standardFontDataUrl: `${root}/standard_fonts/`});
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({scale: 300 / 72});
  const {canvas, context} = doc.canvasFactory.create(Math.round(vp.width), Math.round(vp.height));
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({canvas, canvasContext: context, viewport: vp}).promise;
  writeFileSync(path.join(out, file.replace(/\.pdf$/, '.png')), await canvas.encode('png'));
  await task.destroy();
  console.log(file);
}

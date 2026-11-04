// 矢崎化工カタログのページの絵（pdftoppm で 150dpi と 300dpi の PNG にしたもの）を tesseract.js（jpn）で読み、語と位置を1ページ1行の JSON で出す。
// 出力には金額の字も入るので、作業用のフォルダ（スクラッチ）に置き、リポジトリには入れない。品番だけを merge.py で yazakiCatalogData.ts にする。
// 使い方：node scripts/yazaki-catalog/ocr.mjs <作業フォルダ>/p012.png … > all.jsonl（300dpi は all300.jsonl）
//        python3 scripts/yazaki-catalog/merge.py all.jsonl all300.jsonl src/sasaoka/yazakiCatalogData.ts
// ページの絵（アプリで見せる JPEG）は 150dpi の PNG を convert -strip -interlace Plane -quality 72 で catalog-yazaki/yazaki-p012.jpg などに
import {createWorker} from '../../node_modules/tesseract.js/src/index.js';
const files = process.argv.slice(2);
const root = new URL('../../', import.meta.url).pathname;
const worker = await createWorker('jpn', 1, {langPath: `${root}node_modules/@tesseract.js-data/jpn/4.0.0`, gzip: true, cachePath: process.env.TMPDIR ?? '/tmp'});
for (const f of files) {
  const {data} = await worker.recognize(f, {}, {blocks: true});
  const words = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push({t: w.text, c: Math.round(w.confidence), b: w.bbox, line: l.text.trim()});
  console.log(JSON.stringify({file: f.split('/').pop(), words}));
}
await worker.terminate();

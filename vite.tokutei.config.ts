import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {createHash} from 'crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';
import {pathToFileURL} from 'url';
import {defineConfig} from 'vite';
import type {Plugin} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';
import {pageRules} from './src/tokutei/print/catalogRules.ts';

/**
 * 特定福祉用具 購入申請書・見積もり作成アプリだけを、1つのHTMLファイルとしてビルドする設定。
 * `npm run build:tokutei` で dist-tokutei/index.html に出力する（JS・CSS・PDF読み取り用のデータもすべて同梱）。
 * 1ファイルなので、太陽ポータル（taiyo-portal）の中の1フォルダにそのまま置いても、パソコンに保存して開いても動く。
 * 住宅改修 見積書・請求書アプリ（src/sasaoka）とは別の、独立したアプリ（設定もこのファイルの中だけで完結させる）。
 */

// 公開する版の印（ビルドした日時）。アプリに __APP_BUILD__ として埋め込み、同じ印を version.json にも書く。
// スマホのブラウザは前に開いたページを覚えていて、直した版がすぐには出ないことがあるので、
// アプリは version.json を見て、新しい版が出ていれば「読み込み直す」を出す（src/tokutei/update.ts）
const APP_BUILD = new Date().toISOString();

function appVersion(): Plugin {
  return {
    name: 'tokutei-app-version',
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'version.json', source: `${JSON.stringify({build: APP_BUILD})}\n`});
    },
  };
}

function htmlAsIndex(): Plugin {
  return {
    name: 'tokutei-html-as-index',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['tokutei.html'];
      if (page?.type !== 'asset') return;
      delete bundle['tokutei.html'];
      this.emitFile({type: 'asset', fileName: 'index.html', source: page.source});
    },
  };
}

/**
 * カタログの PDF（public-tokutei/catalog/）の文字と位置を1つのファイル catalog/text.json にまとめる（PDF ごとに [文字, 左, 上, 幅, 高さ] の並び。pt）。
 * 商品の一覧（種目を選んだとき・🔍 商品検索）・カタログの印刷の品番・カタログの窓の検索は、この文字だけで足りる（print/catalogPdf.ts の loadCatalogItems）。
 * 前は 26 ページの PDF（あわせて 24MB）を全部ダウンロードして読んでいて、種目を選んでから商品の一覧が出るまで 20 秒ほどかかった
 * （ユーザーの指示「カタログの読み込みスピードが遅くないか」2026-11-02）。読み方はアプリと同じ pdf.js（legacy 版）・同じ版
 */
function catalogText(): Plugin {
  return {
    name: 'tokutei-catalog-text',
    async generateBundle() {
      const dir = path.resolve(__dirname, 'public-tokutei/catalog');
      const root = path.resolve(__dirname, 'node_modules/pdfjs-dist');
      const pdfjs = await import(pathToFileURL(path.join(root, 'legacy/build/pdf.mjs')).href);
      const r = (n: number) => Math.round(n * 100) / 100;
      const out: Record<string, (string | number)[][]> = {};
      // 横の罫線（金額のまとまりの区切り。src/tokutei/print/catalogRules.ts）。catalog/rules.json に [左, 高さ, 長さ] の並び
      const rules: Record<string, number[][]> = {};
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()) {
        const task = pdfjs.getDocument({data: new Uint8Array(readFileSync(path.join(dir, file))), cMapUrl: `${root}/cmaps/`, cMapPacked: true, verbosity: 0});
        try {
          const page = await (await task.promise).getPage(1);
          const vp = page.getViewport({scale: 1});
          const tc = await page.getTextContent();
          out[file] = tc.items.flatMap((i: {str?: string; transform: number[]; width: number}) =>
            'str' in i ? [[i.str ?? '', r(i.transform[4]), r(vp.height - i.transform[5]), r(i.width), r(Math.abs(i.transform[3]))]] : [],
          );
          rules[file] = (await pageRules(page, pdfjs.OPS)).map((x) => [x.x, x.y, x.w]);
        } finally {
          await task.destroy();
        }
      }
      this.emitFile({type: 'asset', fileName: 'catalog/text.json', source: JSON.stringify(out)});
      this.emitFile({type: 'asset', fileName: 'catalog/rules.json', source: JSON.stringify(rules)});
      // ページの絵（catalog/kaientai-p040.jpg など）も、ここで作っておく（print/catalogPdf.ts の loadCatalogPage がまずこれを読む）。
      // 前は端末の中で pdf.js で PDF を絵にしていたが、pdf.js（legacy 版でも）は新しい書き方（class の static ブロックなど）を使っていて、
      // iPadOS 16.4 より前の Safari では読めず、カタログが開かなかった（ユーザーの話「タブレットで開くとパンフレットが開かない」2026-11-02）。
      // 絵なら、どの端末でもそのまま出せて、軽い。作るのに1ページ2秒ほどかかるので、PDF の中身が同じなら前に作った絵を使う（node_modules/.cache）
      const cacheDir = path.resolve(__dirname, 'node_modules/.cache/tokutei-catalog');
      mkdirSync(cacheDir, {recursive: true});
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()) {
        const data = readFileSync(path.join(dir, file));
        const key = createHash('sha1').update(data).update(`dpi=${CATALOG_DPI};q=${CATALOG_JPEG_QUALITY}`).digest('hex');
        const cached = path.join(cacheDir, `${key}.jpg`);
        if (!existsSync(cached)) {
          const task = pdfjs.getDocument({data: new Uint8Array(data), cMapUrl: `${root}/cmaps/`, cMapPacked: true, verbosity: 0, standardFontDataUrl: `${root}/standard_fonts/`});
          try {
            const doc = await task.promise;
            const page = await doc.getPage(1);
            const vp = page.getViewport({scale: CATALOG_DPI / 72});
            const {canvas, context} = doc.canvasFactory.create(Math.round(vp.width), Math.round(vp.height));
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({canvas, canvasContext: context, viewport: vp}).promise;
            writeFileSync(cached, await canvas.encode('jpeg', CATALOG_JPEG_QUALITY));
          } finally {
            await task.destroy();
          }
        }
        this.emitFile({type: 'asset', fileName: `catalog/${file.replace(/\.pdf$/, '.jpg')}`, source: readFileSync(cached)});
      }
    },
  };
}
/** カタログのページの絵の細かさ（アプリの print/catalogPdf.ts の DPI と同じ。カタログの窓の押せる枠は、ページの pt をこの倍率で絵の画素にする） */
const CATALOG_DPI = 200;
/** カタログのページの絵の JPEG の質（80 で1ページ 0.7〜0.9MB。印刷しても字がにじまない） */
const CATALOG_JPEG_QUALITY = 80;

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), htmlAsIndex(), appVersion(), catalogText()],
  base: './',
  // 介援隊のカタログの PDF（1ページずつ。catalog.ts）。index.html には入れず、隣の catalog/ に置く（印刷するときだけ読む）
  publicDir: 'public-tokutei',
  define: {__APP_BUILD__: JSON.stringify(APP_BUILD)},
  // PDFの日本語の文字を読むための対応表（pdf.js の CMap）をファイルとして同梱する
  // xltx・xlsx：申請書の原本（?inline で中に入れる。src/tokutei/shinseiFiles.ts）
  assetsInclude: ['**/*.bcmap', '**/*.xltx', '**/*.xlsx'],
  build: {
    outDir: 'dist-tokutei',
    emptyOutDir: true,
    // PDF読み取り（pdf.js）を同梱するため大きめになる。1ファイルにまとめるので分割の警告は出さない
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: {
        tokutei: path.resolve(__dirname, 'tokutei.html'),
      },
    },
  },
});

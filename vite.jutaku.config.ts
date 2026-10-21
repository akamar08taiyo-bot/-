import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import type {Plugin} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';
import {APP_BUILD, appVersion} from './vite.version.ts';

/**
 * 住宅改修 見積書作成アプリだけを、1つのHTMLファイルとしてビルドする設定（仕切り計算・請求書作成の vite.sasaoka.config.ts と同じ形）。
 * `npm run build:jutaku` で dist-jutaku/index.html に出力する（JS・CSS・PDF読み取り用のデータもすべて同梱）。
 * 太陽ポータル（taiyo-portal）の jutaku-mitsumori/ に置く。仕切り計算・請求書作成（sasaoka/）と同じサイトなので、部材リスト・様邸を一緒に使う。
 */
function htmlAsIndex(): Plugin {
  return {
    name: 'jutaku-html-as-index',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['jutaku.html'];
      if (page?.type !== 'asset') return;
      delete bundle['jutaku.html'];
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: page.source,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), htmlAsIndex(), appVersion()],
  base: './',
  // 公開する版の印（新しい版が出たら知らせる。vite.version.ts）
  define: {__APP_BUILD__: JSON.stringify(APP_BUILD)},
  // PDFの日本語の文字を読むための対応表（pdf.js の CMap）をファイルとして同梱する
  assetsInclude: ['**/*.bcmap', '**/*.xltx'], // xltx：申請書の原本（?inline で中に入れる）
  build: {
    outDir: 'dist-jutaku',
    emptyOutDir: true,
    // PDF読み取り（pdf.js）を同梱するため大きめになる。1ファイルにまとめるので分割の警告は出さない
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: {
        jutaku: path.resolve(__dirname, 'jutaku.html'),
      },
    },
  },
});

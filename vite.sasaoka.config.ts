import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import type {Plugin} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

/**
 * 仕切り計算・請求書作成アプリだけを、1つのHTMLファイルとしてビルドする設定。
 * `npm run build:sasaoka` で dist-sasaoka/index.html に出力する（JS・CSS・PDF読み取り用のデータもすべて同梱）。
 * 1ファイルなので、太陽ポータル（taiyo-portal）の中の 1フォルダ（書類送付状アプリの soufujo/ と同じ形）に
 * そのまま置いても、GitHub Pages・Netlify のサイト直下に置いても、パソコンに保存して開いても動く。
 */
function htmlAsIndex(): Plugin {
  return {
    name: 'sasaoka-html-as-index',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['sasaoka.html'];
      if (page?.type !== 'asset') return;
      delete bundle['sasaoka.html'];
      this.emitFile({type: 'asset', fileName: 'index.html', source: page.source});
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), htmlAsIndex()],
  base: './',
  // PDFの日本語の文字を読むための対応表（pdf.js の CMap）をファイルとして同梱する
  assetsInclude: ['**/*.bcmap'],
  build: {
    outDir: 'dist-sasaoka',
    emptyOutDir: true,
    // PDF読み取り（pdf.js）を同梱するため大きめになる。1ファイルにまとめるので分割の警告は出さない
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: {
        sasaoka: path.resolve(__dirname, 'sasaoka.html'),
      },
    },
  },
});

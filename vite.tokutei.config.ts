import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import type {Plugin} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

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

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), htmlAsIndex(), appVersion()],
  base: './',
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

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import type {Plugin} from 'vite';

/**
 * FAX送付状アプリだけを単独のサイトとして公開するためのビルド設定（GitHub Pages・Netlify 用）。
 * `npm run build:fax` で dist-fax/ に出力し、fax.html を index.html として置くので
 * サイトのトップページがそのままFAXアプリになる。
 */
function faxHtmlAsIndex(): Plugin {
  return {
    name: 'fax-html-as-index',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['fax.html'];
      if (page?.type !== 'asset') return;
      delete bundle['fax.html'];
      this.emitFile({type: 'asset', fileName: 'index.html', source: page.source});
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), faxHtmlAsIndex()],
  // 読み込むファイルを相対パスにして、GitHub Pages の /-/ のような下の階層でも、サイトの直下でも動くようにする
  base: './',
  build: {
    outDir: 'dist-fax',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        fax: path.resolve(__dirname, 'fax.html'),
      },
    },
  },
});

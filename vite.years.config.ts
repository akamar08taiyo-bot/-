import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import type {Plugin} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';
import {scrubTemplate} from './src/sasaoka/demo/scrub.ts';
import {APP_BUILD, appVersion} from './vite.version.ts';

/**
 * （株）イヤーズ デモアプリのビルド（`npm run build:years` → dist-years/index.html と version.json）。
 * ユーザーの指示「申請書、見積もりツールを（株）イヤーズ専用で作ろう…まだ正式販売していないので、サンプルURLを渡し、こちらが主導権を握れるようにする。
 * 正式なものができるまではずっと使わせない。ツールのどこかにイヤーズ（株）デモアプリみたいな感じでいれる。今までのアプリは絶対に残しておく」2026-11-10。
 * 答え：期限日＋止めるスイッチ（status.json）・すかしなし・住宅改修だけ・新しいリポジトリ（years-demo）。
 * 今までのアプリ（build:jutaku・build:sasaoka）はそのまま。このビルドだけ：
 *   - __DEMO__ に 'years'（src/sasaoka/demo/flag.ts。ポータル・特定福祉用具・受注簿などを出さない）
 *   - 会社ごとの値（src/sasaoka/company.ts）を src/sasaoka/demo/company.ts に置きかえる（営業所・所長・担当者・工務店の仕切り・登録番号を入れない）
 *   - 役所の原本（*.xltx）の会社名・営業所・所在地・電話・所長・作成者を、同じ長さの空白にしてから中に入れる（ふりがなの位置がずれないように）
 */
const REAL_COMPANY = path.resolve(__dirname, 'src/sasaoka/company.ts');
const DEMO_COMPANY = path.resolve(__dirname, 'src/sasaoka/demo/company.ts');

function demoCompany(): Plugin {
  return {
    name: 'years-demo-company',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/company\.ts$/.test(source)) return null;
      const r = await this.resolve(source, importer, {...options, skipSelf: true});
      return r && path.resolve(r.id) === REAL_COMPANY && path.resolve(importer) !== DEMO_COMPANY ? DEMO_COMPANY : null;
    },
  };
}

function demoTemplates(): Plugin {
  return {
    name: 'years-demo-templates',
    enforce: 'pre',
    load(id) {
      const m = /^(.+\.xltx)\?inline$/.exec(id);
      if (!m) return null;
      const clean = scrubTemplate(new Uint8Array(readFileSync(m[1])));
      return `export default ${JSON.stringify(`data:application/octet-stream;base64,${Buffer.from(clean).toString('base64')}`)}`;
    },
  };
}

function htmlAsIndex(): Plugin {
  return {
    name: 'years-html-as-index',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['years.html'];
      if (page?.type !== 'asset') return;
      delete bundle['years.html'];
      this.emitFile({type: 'asset', fileName: 'index.html', source: page.source});
    },
  };
}

/** 止めるスイッチの初めの中身（新しいリポジトリに置く status.json。期限は 2026-12-31＝ユーザーの答え「デモ期間は2026.12.31」2026-11-10。あとで延ばせる） */
function statusFile(): Plugin {
  return {
    name: 'years-demo-status',
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'status.json', source: `${JSON.stringify({enabled: true, until: '2026-12-31', message: ''}, null, 2)}\n`});
    },
  };
}

export default defineConfig({
  plugins: [demoCompany(), demoTemplates(), react(), tailwindcss(), viteSingleFile(), htmlAsIndex(), appVersion(), statusFile()],
  base: './',
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD),
    __DEMO__: JSON.stringify('years'),
    // テストのときだけ別の場所の status.json を読ませる（YEARS_STATUS_URL）。ふだんはデモのリポジトリの status.json（gate.ts）
    __DEMO_STATUS__: JSON.stringify(process.env.YEARS_STATUS_URL ?? ''),
  },
  assetsInclude: ['**/*.bcmap', '**/*.xltx', '**/*.wasm'],
  build: {
    outDir: 'dist-years',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {input: {years: path.resolve(__dirname, 'years.html')}},
  },
});

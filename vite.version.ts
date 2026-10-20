import type {Plugin} from 'vite';

/**
 * 公開する版の印（ビルドした日時）。アプリに __APP_BUILD__ として埋め込み、同じ印を version.json にも書く。
 * スマホのブラウザは前に開いたページをしばらく覚えていて、直した版がすぐには出ないことがあるので、
 * アプリは version.json を見て、新しい版が出ていれば「読み込み直す」を出す（src/sasaoka/update.ts）
 */
export const APP_BUILD = new Date().toISOString();

export function appVersion(): Plugin {
  return {
    name: 'app-version',
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'version.json', source: `${JSON.stringify({build: APP_BUILD})}\n`});
    },
  };
}

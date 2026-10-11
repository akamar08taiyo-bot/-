// 書き出しに使うブラウザ（Chrome Headless Shell）の場所。
// 環境変数 REMOTION_BROWSER があればそれを使い、なければ Playwright の置き場所（PLAYWRIGHT_BROWSERS_PATH、既定 /opt/pw-browsers）から探す。
// 見つからなければ null → Remotion が自分でダウンロードする（通信が許されている環境だけ）。
// renderMedia にも同じものを渡す：渡さないと、ブラウザを作り直すたびに Remotion が別の Chrome をダウンロードしに行った
import fs from 'node:fs';
import path from 'node:path';

const find = () => {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    for (const sub of ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const p = path.join(base, d, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
};

export const browserExecutable = find();
export const chromiumOptions = {gl: 'swangle'};

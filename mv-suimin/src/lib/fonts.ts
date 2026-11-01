import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import '@fontsource/zen-old-mincho/500.css';
import '@fontsource/zen-old-mincho/900.css';
import '@fontsource/dotgothic16/400.css';
import { continueRender, delayRender } from 'remotion';
import lyrics from '../data/lyrics.json';

export const F = {
  display: '"Dela Gothic One", "Noto Sans JP", sans-serif',
  sans: '"Noto Sans JP", sans-serif',
  mincho: '"Zen Old Mincho", serif',
  dot: '"DotGothic16", "Noto Sans JP", monospace',
};

// Every glyph the video can show, so each unicode-range subset is fetched before the first frame.
const UI_TEXT =
  'LIVE REC VERSE HOOK FINAL PUNCHLINE OUTRO 0123456789:.,%+-×▶■●▲▼ ' +
  '睡眠残高 配信終了 視聴 帳簿 勘定 収支 時間 目元 クマ 黒字 帳簿外 元本 資本 口座 損益 眠気 遮光 実況 配信 意識 ON OFF ' +
  '再生数 自分 選択 COLLAB 返信 即レス 既読 請求 未払い 十三年 紹介 仏教最高位 無我 無理 どこだ 感謝 カメラ 肩書き 足元 ' +
  'レイナ 送信済み 返済 青春 今から 今夜 幕 投資先 ツケ 明日の俺 世界 顔 zZ 夢 夜 秒 回 年';
const ALL =
  UI_TEXT +
  lyrics.sections
    .flatMap((s) => s.lines.map((l) => l.text))
    .join('');

const handle = delayRender('fonts');
const specs = [
  `400 100px "Dela Gothic One"`,
  `400 100px "Noto Sans JP"`,
  `700 100px "Noto Sans JP"`,
  `900 100px "Noto Sans JP"`,
  `500 100px "Zen Old Mincho"`,
  `900 100px "Zen Old Mincho"`,
  `400 100px "DotGothic16"`,
];
Promise.all(specs.map((s) => document.fonts.load(s, ALL)))
  .then(() => document.fonts.ready)
  .then(() => continueRender(handle))
  .catch((e) => {
    console.error(e);
    continueRender(handle);
  });

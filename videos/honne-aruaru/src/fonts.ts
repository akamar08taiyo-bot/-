// フォント（すべて SIL Open Font License）。読み込み終わるまで描画を待つ。
// public/fonts は画面に出る文字だけに絞ったもの（scripts/subset_fonts.py。台本を変えたら作り直す）
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

const FONTS: [string, string, string][] = [
  ['ZenMaru', 'fonts/ZenMaruGothic-Black.woff2', '900'],
  ['ZenMaru', 'fonts/ZenMaruGothic-Bold.woff2', '700'],
  ['Dela', 'fonts/DelaGothicOne-Regular.woff2', '400'],
  ['Yusei', 'fonts/YuseiMagic-Regular.woff2', '400'],
];

const handle = delayRender('fonts', {timeoutInMilliseconds: 60000, retries: 2});
Promise.all(
  FONTS.map(([family, file, weight]) =>
    new FontFace(family, `url(${staticFile(file)})`, {weight}).load().then((f) => {
      document.fonts.add(f);
    }),
  ),
)
  .then(() => continueRender(handle))
  .catch((e) => cancelRender(e));

export const F = {
  maru: '"ZenMaru", sans-serif',
  dela: '"Dela", "ZenMaru", sans-serif',
  hand: '"Yusei", "ZenMaru", sans-serif',
};

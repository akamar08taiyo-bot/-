import {continueRender, delayRender, staticFile} from 'remotion';

// 和文フォント（SIL OFL）。描画前に読み込み完了を待つ。
// 書き出しの負荷を下げるため、本編で使う文字だけに絞ったサブセット（public/fonts/sub、元は public/fonts の同名フォント）を読む。
// 文言を変えたら scripts/subset_fonts.py を実行し直すこと。
const FONTS: {family: string; file: string; weight: string}[] = [
  {family: 'Mincho', file: 'sub/MinchoR.ttf', weight: '400'},  // Zen Old Mincho Regular
  {family: 'Mincho', file: 'sub/MinchoB.ttf', weight: '700'},  // Zen Old Mincho Bold
  {family: 'Maru', file: 'sub/MaruB.ttf', weight: '700'},  // Zen Maru Gothic Bold
  {family: 'Maru', file: 'sub/MaruK.ttf', weight: '900'},  // Zen Maru Gothic Black
];

let started = false;
export const ensureFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('fonts');
  Promise.all(
    FONTS.map((f) => {
      const face = new FontFace(f.family, `url(${staticFile(`fonts/${f.file}`)})`, {weight: f.weight});
      return face.load().then((loaded) => {
        (document.fonts as unknown as {add: (f: FontFace) => void}).add(loaded);
      });
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
};

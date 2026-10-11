// 和文フォント（Zen Old Mincho／Zen Maru Gothic、SIL OFL）は、書き出す機械にシステムフォントとして入れて使う。
//   cp public/fonts/ZenOldMincho-{Regular,Bold}.ttf public/fonts/ZenMaruGothic-{Bold,Black}.ttf /usr/local/share/fonts/zen/ && fc-cache -f
// ブラウザ側で FontFace を読み込む方式は、並列書き出しのときにタブが読み込み待ちのまま固まることがあったためやめた。
export const ensureFonts = () => {};

// フォント（すべて SIL Open Font License）。
// 画面に出る文字だけに絞ったものを src/fonts_data.ts に埋め込んである（scripts/subset_fonts.py。台本を変えたら作り直す）。
// 読み込みはモジュールの読み込み時に始め、描画を待たせる delayRender は各回のコンポーネントの中で useFonts() から呼ぶ。
// （モジュールの頭で delayRender を呼ぶと、Remotion の初期化で待ち時間の記録が消え、解除しても約1分後に時間切れになる）
import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender} from 'remotion';
import {FONT_DATA} from './fonts_data';

const FONTS: [string, string, string][] = [
  ['ZenMaru', 'ZenMaruGothic-Black.woff2', '900'],
  ['ZenMaru', 'ZenMaruGothic-Bold.woff2', '700'],
  ['Dela', 'DelaGothicOne-Regular.woff2', '400'],
  ['Yusei', 'YuseiMagic-Regular.woff2', '400'],
  ['Mincho', 'ZenOldMincho-Bold.woff2', '700'],
];

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const loading = Promise.all(
  FONTS.map(([family, file, weight]) => {
    const data = FONT_DATA[file];
    if (!data) throw new Error(`fonts_data.ts に ${file} がありません（scripts/subset_fonts.py を実行）`);
    return new FontFace(family, bytes(data), {weight}).load().then((f) => {
      document.fonts.add(f);
    });
  }),
);

/** フォントが読み終わるまで描画を待たせる（各回の一番外のコンポーネントで1回呼ぶ） */
export const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts', {timeoutInMilliseconds: 60000, retries: 2}));
  useEffect(() => {
    loading.then(() => continueRender(handle)).catch((e) => cancelRender(e));
  }, [handle]);
};

export const F = {
  maru: '"ZenMaru", sans-serif',
  dela: '"Dela", "ZenMaru", sans-serif',
  hand: '"Yusei", "ZenMaru", sans-serif',
  mincho: '"Mincho", serif',
};

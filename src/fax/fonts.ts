import type {CSSProperties} from 'react';

/**
 * 印刷の書体の選択肢。会社のWindowsパソコン（Office入り）に入っている主な書体。
 * 「元の書体」は元のWord文書と同じ使い分け（従来の送信票は丸ゴシック＋明朝、表形式は游ゴシック）。
 * それ以外を選ぶと、用紙全体をその書体にそろえる。
 */
export type SheetFont =
  | 'original'
  | 'maru'
  | 'msMincho'
  | 'msGothic'
  | 'meiryo'
  | 'yuGothic'
  | 'yuMincho'
  | 'bizGothic'
  | 'bizMincho'
  | 'udKyokasho';

interface SheetFontOption {
  id: SheetFont;
  label: string;
  /** CSSの font-family に並べる書体名（入っていなければ次の書体を使う）。最後の serif などは付けない */
  families: string;
}

export const SHEET_FONTS: SheetFontOption[] = [
  {id: 'original', label: '元の書体（Wordと同じ）', families: ''},
  {id: 'maru', label: 'HG丸ゴシックM-PRO', families: "'HG丸ｺﾞｼｯｸM-PRO', 'HGMaruGothicMPRO', 'Kosugi Maru'"},
  {id: 'msMincho', label: 'ＭＳ 明朝', families: "'ＭＳ 明朝', 'MS Mincho', 'BIZ UDMincho'"},
  {id: 'msGothic', label: 'ＭＳ ゴシック', families: "'ＭＳ ゴシック', 'MS Gothic', 'IPAGothic'"},
  {id: 'meiryo', label: 'メイリオ', families: "'メイリオ', 'Meiryo'"},
  {id: 'yuGothic', label: '游ゴシック', families: "'Yu Gothic', 'YuGothic', '游ゴシック'"},
  {id: 'yuMincho', label: '游明朝', families: "'Yu Mincho', 'YuMincho', '游明朝', 'BIZ UDMincho'"},
  {id: 'bizGothic', label: 'BIZ UDゴシック', families: "'BIZ UDGothic', 'BIZ UDゴシック'"},
  {id: 'bizMincho', label: 'BIZ UD明朝', families: "'BIZ UDMincho', 'BIZ UD明朝'"},
  {id: 'udKyokasho', label: 'UDデジタル教科書体', families: "'UD デジタル 教科書体 N-R', 'UD Digi Kyokasho N-R'"},
];

export const sanitizeFont = (raw: unknown): SheetFont =>
  SHEET_FONTS.some((f) => f.id === raw) ? (raw as SheetFont) : 'original';

/**
 * 用紙に付けるスタイル。用紙のCSSは部品ごとに --fx-maru（丸ゴシック）・--fx-mincho（明朝）・
 * --fx-century（英数字）・--fx-yu（游ゴシック）を使い分けているので、全部を選んだ書体に置き換える。
 */
export function sheetFontStyle(font: SheetFont): CSSProperties | undefined {
  const option = SHEET_FONTS.find((f) => f.id === font);
  if (!option?.families) return undefined;
  const families = option.families;
  return {'--fx-maru': families, '--fx-mincho': families, '--fx-century': families, '--fx-yu': families} as CSSProperties;
}

/** 選択欄の各項目を、その書体で表示するためのスタイル */
export function fontPreviewStyle(font: SheetFont): CSSProperties | undefined {
  const option = SHEET_FONTS.find((f) => f.id === font);
  return option?.families ? {fontFamily: option.families} : undefined;
}

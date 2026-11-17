import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// フォントはすべて SIL Open Font License（public/fonts/ に同梱）。
// loadFont は読み込みが終わるまで書き出しを待ってくれる。
const font = (family: string, file: string, weight: string, style = "normal") =>
  loadFont({ family, url: staticFile(`fonts/${file}`), weight, style });

font("Noto JP", "noto-sans-jp-japanese-700-normal.woff2", "700");
font("Noto JP", "noto-sans-jp-japanese-900-normal.woff2", "900");
font("Noto Latin", "noto-sans-jp-latin-700-normal.woff2", "700");
font("Noto Latin", "noto-sans-jp-latin-900-normal.woff2", "900");
font("Barlow Condensed", "barlow-condensed-latin-700-normal.woff2", "700");
font("Barlow Condensed", "barlow-condensed-latin-700-italic.woff2", "700", "italic");
font("Barlow Condensed", "barlow-condensed-latin-900-italic.woff2", "900", "italic");

/** 日本語の見出し・本文 */
export const JP = '"Noto Latin", "Noto JP", sans-serif';
/** 数字・英字（スポーツ中継風の細長い斜体） */
export const NUM = '"Barlow Condensed", "Noto JP", sans-serif';

export const C = {
  white: "#FFFFFF",
  dim: "rgba(255,255,255,0.64)",
  navy: "#040A22",
  blue: "#1F4DFF",
  cyan: "#3DD6FF",
  red: "#E8002A",
  gold: "#FFC93C",
  silver: "#D8E1F0",
  bronze: "#F2A066",
};

export const GOLD_TEXT = "linear-gradient(180deg, #FFF6C2 0%, #FFC93C 48%, #F08A00 100%)";

/** 順位ごとの差し色（1位=金、2位=銀、3位=銅、それ以外=水色） */
export const accentFor = (rank: number | undefined) =>
  rank === 1 ? C.gold : rank === 2 ? C.silver : rank === 3 ? C.bronze : C.cyan;

export const gradientFor = (rank: number | undefined) =>
  rank === 1
    ? GOLD_TEXT
    : rank === 2
      ? "linear-gradient(180deg, #FFFFFF 0%, #D8E1F0 50%, #8FA0BF 100%)"
      : rank === 3
        ? "linear-gradient(180deg, #FFE0C2 0%, #F2A066 50%, #B8612A 100%)"
        : "linear-gradient(180deg, #D9F7FF 0%, #3DD6FF 50%, #1F7BFF 100%)";

// YouTube ショートの画面でボタンや説明文が重なる場所を避けるための目安（1080×1920）
export const SAFE = { left: 70, right: 930, top: 160, bottom: 1500 };

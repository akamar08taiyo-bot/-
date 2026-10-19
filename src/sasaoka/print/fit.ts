// 見積書の欄（幅と高さの決まったマス）に文字を入れる大きさを決める。
// Excel の「縮小して全体を表示」と同じく、入りきらなければ文字を小さくする（2行まで折り返してよい欄もある）。

import type {CSSProperties} from 'react';

const MM_PER_PT = 25.4 / 72;
const LINE = 1.12; // 行の高さ（文字の大きさの倍）

/** 文字の幅（全角を1、半角を約0.55として数える） */
export function textEm(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ -~｡-ﾟ]/.test(ch) ? 0.55 : 1;
  return w;
}

/**
 * 幅 widthMm・高さ heightMm の欄に text を入れる文字の大きさ（pt）と行数。
 * 1行で maxPt のまま入ればそのまま。入らなければ、lines（最大の行数）まで折り返すか小さくして、大きい方を選ぶ
 */
export function fitText(text: string, widthMm: number, heightMm: number, maxPt: number, lines = 1, minPt = 4.5): {pt: number; lines: number} {
  const em = textEm(text);
  const w = Math.max(1, widthMm - 1.6); // 左右の余白
  if (em === 0) return {pt: maxPt, lines: 1};
  let best = {pt: Math.min(maxPt, w / (em * MM_PER_PT)), lines: 1};
  for (let n = 2; n <= lines; n++) {
    // n 行に分けると1行の幅は em/n より少し長くなる（言葉の切れ目で折り返すため）
    const byWidth = (w * n * 0.88) / (em * MM_PER_PT);
    const byHeight = (heightMm - 0.4) / (n * LINE * MM_PER_PT);
    const pt = Math.min(maxPt, byWidth, byHeight);
    if (pt > best.pt + 0.2) best = {pt, lines: n};
  }
  return {pt: Math.max(minPt, Math.floor(best.pt * 10) / 10), lines: best.lines};
}

/** fitText の結果を欄の style にする */
export function fitStyle(text: string, widthMm: number, heightMm: number, maxPt: number, lines = 1): CSSProperties {
  const f = fitText(text, widthMm, heightMm, maxPt, lines);
  return f.lines > 1
    ? {fontSize: `${f.pt}pt`, lineHeight: LINE, whiteSpace: 'normal', wordBreak: 'break-all'}
    : {fontSize: `${f.pt}pt`, whiteSpace: 'nowrap'};
}

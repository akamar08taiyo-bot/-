// 見積書の欄（幅と高さの決まったマス）に文字を入れる大きさを決める。
// Excel の「縮小して全体を表示」と同じく、入りきらなければ文字を小さくする（2行まで折り返してよい欄もある）。
// 欄の外に出したり、欄の端で切ったりしない（ユーザーの指示「文字のはみ出し…横が切れていたり…見積もりの枠からはみ出ていたり…しっかり見て」、2026-10-22。
// 前は 4.5pt より小さくしなかったので、長い改修場所・品名・備考が欄の右で切れていた）

import type {CSSProperties} from 'react';

const MM_PER_PT = 25.4 / 72;
const LINE = 1.12; // 行の高さ（文字の大きさの倍）
/** 字の幅の見積もりの余裕（全角を1・半角を0.55で数えると、数字・英字の多い行は実際より短く出て、1〜2px はみ出していた） */
const SAFE = 0.97;
/** これより小さい字にはしない（どうしても入らない長さは、欄の中で切れる） */
const FLOOR_PT = 2.5;

/** 欄の中で文字を書ける幅（左右の余白と、字の幅の見積もりの余裕を引く） */
const usable = (widthMm: number) => Math.max(1, widthMm - 1.6) * SAFE;
/** 高さ heightMm の欄に pt の字で入る行の数 */
const rowsFor = (heightMm: number, pt: number) => Math.max(1, Math.floor((heightMm - 0.4) / (pt * LINE * MM_PER_PT)));

/** 文字の幅（全角を1、半角を約0.55として数える） */
export function textEm(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ -~｡-ﾟ]/.test(ch) ? 0.55 : 1;
  return w;
}

/**
 * 幅 widthMm・高さ heightMm の欄に text を入れる文字の大きさ（pt）と行数。
 * 1行で maxPt のまま入ればそのまま。入らなければ、lines（最大の行数）まで折り返すか小さくして、大きい方を選ぶ。
 * それでも minPt より小さくしないと入らない長い文字は、欄の高さに入るだけ行を増やして折り返し、なお入らなければ minPt より小さくする
 */
export function fitText(text: string, widthMm: number, heightMm: number, maxPt: number, lines = 1, minPt = 4.5): {pt: number; lines: number} {
  const em = textEm(text);
  const w = usable(widthMm);
  if (em === 0) return {pt: maxPt, lines: 1};
  // n 行に分けると1行の幅は em/n より少し長くなる（言葉の切れ目で折り返すため）
  const ptFor = (n: number) =>
    n === 1 ? Math.min(maxPt, w / (em * MM_PER_PT)) : Math.min(maxPt, (w * n * 0.88) / (em * MM_PER_PT), (heightMm - 0.4) / (n * LINE * MM_PER_PT));
  let best = {pt: ptFor(1), lines: 1};
  for (let n = 2; n <= lines; n++) {
    const pt = ptFor(n);
    if (pt > best.pt + 0.2) best = {pt, lines: n};
  }
  if (best.pt >= minPt) return {pt: Math.floor(best.pt * 10) / 10, lines: best.lines};
  for (let n = lines + 1; n <= rowsFor(heightMm, FLOOR_PT); n++) {
    const pt = ptFor(n);
    if (pt > best.pt + 0.05) best = {pt, lines: n};
  }
  return {pt: Math.max(FLOOR_PT, Math.floor(best.pt * 10) / 10), lines: best.lines};
}

/**
 * 決まった行（備考の「定価」と「長さの計算」など）を、それぞれ1行ずつ欄に入れる文字の大きさ（pt）。
 * minPt より小さくしないと入らない長い行があれば、その行が入るまで小さくする（行は増やせないので）
 */
export function fitLinesPt(lines: string[], widthMm: number, heightMm: number, maxPt: number, minPt = 4.5): number {
  const w = usable(widthMm);
  let pt = Math.min(maxPt, (heightMm - 0.4) / (lines.length * LINE * MM_PER_PT));
  for (const l of lines) {
    const em = textEm(l);
    if (em > 0) pt = Math.min(pt, w / (em * MM_PER_PT));
  }
  return Math.max(Math.min(minPt, FLOOR_PT), Math.floor(pt * 10) / 10);
}

/** fitLinesPt の大きさを欄の style にする */
export function fitLinesStyle(lines: string[], widthMm: number, heightMm: number, maxPt: number, minPt = 4.5): CSSProperties {
  return {fontSize: `${fitLinesPt(lines, widthMm, heightMm, maxPt, minPt)}pt`, lineHeight: LINE, whiteSpace: 'nowrap'};
}

/** fitText の結果を欄の style にする */
export function fitStyle(text: string, widthMm: number, heightMm: number, maxPt: number, lines = 1): CSSProperties {
  const f = fitText(text, widthMm, heightMm, maxPt, lines);
  return f.lines > 1
    ? {fontSize: `${f.pt}pt`, lineHeight: LINE, whiteSpace: 'normal', wordBreak: 'break-all'}
    : {fontSize: `${f.pt}pt`, whiteSpace: 'nowrap'};
}

/**
 * 品名（内容・規格）の長い文字を、言葉の切れ目（すき間）で lines 行までに分ける（ユーザーの指示、2026-10-22
 * 「適度に行替えをおこない、見やすくする。商品名が長い場合のみ」。前は欄の幅で字の途中から折り返していた：「ディンプル／付」）。
 * 1行に入る（`fitText` が1行と決める）・すき間のない文字はそのまま [text]。手で入れた改行があればそれで分ける。
 * 分け方は、文字がいちばん大きくできる所（行の数も、少ない方から）
 */
export function wordLines(text: string, widthMm: number, heightMm: number, maxPt: number, lines: number): string[] {
  if (text.includes('\n')) return text.split('\n');
  const f = fitText(text, widthMm, heightMm, maxPt, lines);
  // 折り返す大きさでも1行に入るなら分けない（長い商品名だけ分ける）
  if (lines < 2 || f.lines < 2 || textEm(text) * f.pt * MM_PER_PT <= usable(widthMm)) return [text];
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text];
  let best: {lines: string[]; pt: number} = {lines: [text], pt: 0};
  const tryLines = (n: number) => {
    const split = balance(words, n);
    const pt = fitLinesPt(split, widthMm, heightMm, maxPt);
    if (pt > best.pt + 0.05) best = {lines: split, pt};
  };
  for (let n = 2; n <= Math.min(lines, words.length); n++) tryLines(n);
  // lines 行では 4.5pt より小さくしないと入らない、とても長い品名：欄の高さに入るだけ行を増やす（欄の右で切らない）
  if (best.pt < 4.5) for (let n = lines + 1; n <= Math.min(words.length, rowsFor(heightMm, FLOOR_PT)); n++) tryLines(n);
  return best.lines;
}

/** 言葉を n 行に分ける：いちばん長い行（textEm）がいちばん短くなる分け方 */
function balance(words: string[], n: number): string[] {
  const w = words.length;
  const em = (i: number, j: number) => textEm(words.slice(i, j).join(' '));
  // cost[k][i]：words[i..] を k 行に分けたときの、いちばん長い行。cut[k][i]：その1行目の終わり
  const cost: number[][] = Array.from({length: n + 1}, () => Array(w + 1).fill(Infinity));
  const cut: number[][] = Array.from({length: n + 1}, () => Array(w + 1).fill(w));
  for (let i = 0; i < w; i++) cost[1][i] = em(i, w);
  for (let k = 2; k <= n; k++) {
    for (let i = 0; i <= w - k; i++) {
      for (let j = i + 1; j <= w - k + 1; j++) {
        const c = Math.max(em(i, j), cost[k - 1][j]);
        if (c < cost[k][i]) {
          cost[k][i] = c;
          cut[k][i] = j;
        }
      }
    }
  }
  const out: string[] = [];
  let i = 0;
  for (let k = n; k >= 2; k--) {
    const j = cut[k][i];
    out.push(words.slice(i, j).join(' '));
    i = j;
  }
  out.push(words.slice(i).join(' '));
  return out;
}

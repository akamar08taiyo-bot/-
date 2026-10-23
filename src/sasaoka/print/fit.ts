// 見積書の欄（幅と高さの決まったマス）に文字を入れる大きさと行を決める。
// Excel の「縮小して全体を表示」と同じく、入りきらなければ文字を小さくする（2行まで折り返してよい欄もある）。
// 欄の外に出したり、欄の端で切ったりしない（ユーザーの指示「文字のはみ出し…横が切れていたり…見積もりの枠からはみ出ていたり…しっかり見て」、2026-10-22。
// 前は 4.5pt より小さくしなかったので、長い改修場所・品名・備考が欄の右で切れていた）。
// 4.5pt より小さくしないと入らない長い文字は、欄の高さに入るだけ行を増やして折り返す（とても小さい字にしない）。
// 折り返す行はここで決めて、見積書の画面・印刷（EstimateForms.tsx）は1行ずつ書き、Excel（estimateXlsx.ts）は改行を入れる。
// ブラウザ・Excel の折り返しに任せないので、印刷と Excel で同じ大きさ・同じ改行になる

import type {CSSProperties} from 'react';

const MM_PER_PT = 25.4 / 72;
const LINE = 1.12; // 行の高さ（文字の大きさの倍）
/** 字の幅の見積もりの余裕（字体によって少し広い字がある。欄の左右の線の分も） */
const SAFE = 0.97;
/** 折り返しにするのは、これより小さい字になるとき */
const MIN_PT = 4.5;
/** これより小さい字にはしない（それでも入らない長さは、欄の下で切れる） */
const FLOOR_PT = 2.5;
/** 1行のままにするのは、折り返した方が大きくできても、その差がこれより小さいとき（「商品名が長い場合のみ」行替え） */
const PREFER_ONE_LINE = 1.05;

/**
 * 半角の英数字・記号の幅（1/100 em。0x20 の空白から 0x7E の ~ まで）。印刷の字体（Windows の ＭＳ Ｐゴシック・ＭＳ Ｐ明朝、
 * スマホのヒラギノ・Noto、テストの環境の IPA Pゴシック・Liberation Serif）で測った広い方。
 * 前は半角をみな 0.55 で数えていて、大文字・数字の多い品番（「CS232B+SH232BA#SC1」。W・M は 0.9 em をこえる、数字は 0.63 em）が 1〜2px はみ出していた
 */
// prettier-ignore
const ASCII_EM = [
  27, 33, 41, 63, 63, 85, 78, 19, 33, 33, 50, 63, 26, 36, 26, 50, // 空白 ! " # $ % & ' ( ) * + , - . /
  63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 32, 32, 63, 63, 63, 55, // 0〜9 : ; < = > ?
  92, 72, 67, 73, 76, 61, 57, 75, 75, 33, 39, 72, 61, 90, 76, 80, // @ A〜O
  62, 80, 67, 58, 61, 75, 72, 94, 72, 72, 64, 33, 63, 33, 50, 50, // P〜Z [ \ ] ^ _
  50, 55, 62, 54, 62, 57, 33, 56, 61, 28, 28, 52, 28, 87, 60, 60, // ` a〜o
  62, 62, 37, 46, 35, 60, 50, 75, 50, 50, 47, 48, 20, 48, 54, //     p〜z { | } ~
];

/** 1字の幅（全角＝1）：半角の英数字・記号は ASCII_EM、半角カナは 0.5、ほかは全角 */
function charEm(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 0x20 && c <= 0x7e) return ASCII_EM[c - 0x20] / 100;
  if (c >= 0xff61 && c <= 0xff9f) return 0.5;
  return 1;
}

/** 文字の幅（全角を1として数える。半角は字ごとの幅） */
export function textEm(s: string): number {
  let w = 0;
  for (const ch of s) w += charEm(ch);
  return w;
}

/** 欄の中で文字を書ける幅（mm。左右の余白と、字の幅の見積もりの余裕を引く） */
const usable = (widthMm: number) => Math.max(1, widthMm - 1.6) * SAFE;
/** 高さ heightMm の欄に、pt の字で n 行が入るか */
const fitsHeight = (n: number, heightMm: number, pt: number) => n * pt * LINE * MM_PER_PT <= heightMm - 0.4;
const floor1 = (pt: number) => Math.floor(pt * 10 + 1e-9) / 10;

/**
 * 文字を幅 maxEm（全角＝1）ごとの行に分ける。手で入れた改行はそのまま。
 * すき間（言葉の切れ目）があり、そこで分けても前の行が半分より長ければそこで、なければ字の途中で折り返す（Excel・ブラウザの折り返しと同じ考え）
 */
export function wrapEm(text: string, maxEm: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    let w = 0;
    let space = -1; // 行の中の最後のすき間の位置
    let wSpace = 0; // そのすき間までの幅（すき間をふくむ）
    for (const ch of para) {
      const cw = charEm(ch);
      if (line !== '' && w + cw > maxEm) {
        if (space > 0 && wSpace - charEm(' ') >= maxEm / 2) {
          out.push(line.slice(0, space));
          line = line.slice(space + 1);
          w -= wSpace;
        } else {
          out.push(line);
          line = '';
          w = 0;
        }
        space = -1;
        if (ch === ' ' && line === '') continue; // 行の頭のすき間は書かない
      }
      if (ch === ' ') {
        space = line.length;
        wSpace = w + cw;
      }
      line += ch;
      w += cw;
    }
    out.push(line);
  }
  return out;
}

/** 欄の文字の大きさ（pt）と、欄に書く行（1行なら [文字]。折り返すときは1行ずつ） */
export type Fit = {pt: number; lines: string[]};

/** 大きい方から 0.1pt ずつ下げて、行の決め方 linesAt で欄の高さに入る大きさ（maxLines 行まで）。なければ null */
function largest(maxPt: number, minPt: number, maxLines: number, heightMm: number, linesAt: (pt: number) => string[]): Fit | null {
  for (let t = Math.floor(maxPt * 10 + 1e-9); t >= Math.ceil(minPt * 10 - 1e-9); t--) {
    const pt = t / 10;
    const lines = linesAt(pt);
    if (lines.length <= maxLines && fitsHeight(lines.length, heightMm, pt)) return {pt, lines};
  }
  return null;
}

/**
 * 幅 widthMm・高さ heightMm の欄に text を入れる文字の大きさ（pt）と行。
 * 1行で maxPt のまま入ればそのまま。入らなければ、lines（最大の行数）まで折り返すか小さくして、大きい方を選ぶ（ほとんど変わらなければ1行）。
 * それでも minPt より小さくしないと入らない長い文字は、欄の高さに入るだけ行を増やして折り返し、なお入らなければ 2.5pt まで小さくする
 */
export function fitText(text: string, widthMm: number, heightMm: number, maxPt: number, lines = 1, minPt = MIN_PT): Fit {
  const em = textEm(text);
  if (em === 0) return {pt: maxPt, lines: [text]};
  const w = usable(widthMm);
  const wrapAt = (pt: number) => wrapEm(text, w / (pt * MM_PER_PT));
  // 1行（手で入れた改行がなければ）
  const one = text.includes('\n') ? null : floor1(Math.min(maxPt, w / (em * MM_PER_PT), (heightMm - 0.4) / (LINE * MM_PER_PT)));
  if (one !== null && one >= maxPt) return {pt: one, lines: [text]};
  let best: Fit | null = one !== null && one >= minPt ? {pt: one, lines: [text]} : null;
  if (lines > 1 || text.includes('\n')) {
    const wrapped = largest(maxPt, minPt, Math.max(lines, text.split('\n').length), heightMm, wrapAt);
    if (wrapped && (!best || wrapped.pt > best.pt * PREFER_ONE_LINE)) best = wrapped;
  }
  if (best) return best;
  // minPt 行まででは入らない：欄の高さに入るだけ行を増やす
  return largest(maxPt, FLOOR_PT, Infinity, heightMm, wrapAt) ?? {pt: FLOOR_PT, lines: wrapAt(FLOOR_PT)};
}

/**
 * 決まった行（備考の「定価」と「長さの計算」など）を、それぞれ1行ずつ欄に入れる文字の大きさ（pt）。
 * 小さくするだけ（行は増やさない）。字の大きさの下限なし
 */
export function fitLinesPt(lines: string[], widthMm: number, heightMm: number, maxPt: number): number {
  const w = usable(widthMm);
  let pt = Math.min(maxPt, (heightMm - 0.4) / (lines.length * LINE * MM_PER_PT));
  for (const l of lines) {
    const em = textEm(l);
    if (em > 0) pt = Math.min(pt, w / (em * MM_PER_PT));
  }
  return floor1(pt);
}

/**
 * 決まった行（備考の「定価」と「長さの計算」、言葉の切れ目で分けた品名など）を欄に入れる大きさと行。
 * ふつうは1行ずつ（入るまで小さくする）。minPt より小さくしないと入らないときは、それぞれの行を欄の中で折り返して、
 * 欄の高さと幅に入るいちばん大きい字にする（とても小さい字にしない。前は 2.5pt まで小さくしても入らず、欄の右で切れていた）
 */
export function fitLines(lines: string[], widthMm: number, heightMm: number, maxPt: number, minPt = MIN_PT): Fit {
  const pt = fitLinesPt(lines, widthMm, heightMm, maxPt);
  if (pt >= minPt) return {pt, lines};
  const w = usable(widthMm);
  const wrapAt = (p: number) => lines.flatMap((l) => wrapEm(l, w / (p * MM_PER_PT)));
  return largest(maxPt, Math.min(FLOOR_PT, pt), Infinity, heightMm, wrapAt) ?? {pt: FLOOR_PT, lines: wrapAt(FLOOR_PT)};
}

/**
 * 品名（内容・規格）の欄：長い商品名は言葉の切れ目で分けた行（`wordLines`）、1行に入る・すき間のない名前は `fitText`。
 * 言葉の切れ目で分けても 4.5pt より小さくなる（言葉の途中でも折り返すことになる）とても長い品名は、欄の幅で折り返した方が大きくできれば、そちら
 */
export function fitName(text: string, widthMm: number, heightMm: number, maxPt: number, lines: number): Fit {
  const parts = wordLines(text, widthMm, heightMm, maxPt, lines);
  if (parts.length < 2) return fitText(text, widthMm, heightMm, maxPt, lines);
  const f = fitLines(parts, widthMm, heightMm, maxPt);
  if ((f.pt >= MIN_PT && f.lines.length === parts.length) || text.includes('\n')) return f;
  const g = fitText(text, widthMm, heightMm, maxPt, lines);
  return g.pt > f.pt ? g : f;
}

/** fitText・fitLines の結果を欄の style にする（行は f.lines を1行ずつ書く。ブラウザに折り返させない） */
export function fitCss(f: Fit): CSSProperties {
  return f.lines.length > 1 ? {fontSize: `${f.pt}pt`, lineHeight: LINE, whiteSpace: 'nowrap'} : {fontSize: `${f.pt}pt`, whiteSpace: 'nowrap'};
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
  if (lines < 2 || f.lines.length < 2 || textEm(text) * f.pt * MM_PER_PT <= usable(widthMm)) return [text];
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
  if (best.pt < MIN_PT) for (let n = lines + 1; n <= words.length && fitsHeight(n, heightMm, FLOOR_PT); n++) tryLines(n);
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

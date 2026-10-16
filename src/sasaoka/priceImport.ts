// メーカーの仕切り表（Excel・CSV・PDF・貼り付けた文字）から、商品名と仕切り価格を読み取る。
// 読み取ったものは「候補」として一覧に出し、取り込む行・★（よく使う）を選んでから部材リストに入れる。

import type {Material} from './types.ts';
import {uid} from './util.ts';

export type Grid = string[][];

/** 全角英数・半角カナをそろえ、空白をまとめる */
export function normalize(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).normalize('NFKC').replace(/[\s　]+/g, ' ').trim();
}

/** 「¥3,800」「３，８００円」「3800」などを数値に。数字でなければ null */
export function parsePrice(s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s * 100) / 100 : null;
  const t = normalize(s).replace(/^[@＠]/, '').replace(/[¥\\$,円\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** 文字コードを判定して文字にする（UTF-8 でなければ Shift_JIS とみなす） */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** CSV・TSV（"..." で囲んだ値・改行入りの値にも対応） */
export function parseDelimited(text: string, delimiter: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function detectDelimiter(text: string): '\t' | ',' {
  const lines = text.split(/\r?\n/).slice(0, 30);
  const tabs = lines.reduce((n, l) => n + (l.match(/\t/g)?.length ?? 0), 0);
  const commas = lines.reduce((n, l) => n + (l.match(/,/g)?.length ?? 0), 0);
  return tabs > 0 && tabs >= commas / 3 ? '\t' : ',';
}

/** 表の形の文字（Excelからのコピーなど）を表にする */
export function textToGrid(text: string, kind: 'csv' | 'paste' = 'paste'): Grid {
  if (kind === 'csv') return parseDelimited(text, detectDelimiter(text));
  if (/\t/.test(text)) return parseDelimited(text, '\t');
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/ {2,}|　+/).map((c) => c.trim()).filter((c) => c !== ''))
    .filter((r) => r.length > 0);
}

/** 1行ずつの文字にする（PDF・貼り付け用の「1行ずつ読む」） */
export function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, '  ').trim())
    .filter((l) => l !== '');
}

const CODE_TOKEN = /^[a-z0-9][a-z0-9\-_/.#]{2,}$/i;
const DIMENSION = /^\d+(\.\d+)?(mm|cm|m|kg|g|φ|ml|l|w|v|a)$/i;
/** 品番らしい語：数字を含み、ハイフン入りか英字2文字以上で始まる（BP-600・EB35・AJ-K01 など） */
const isCode = (w: string) => /\d/.test(w) && CODE_TOKEN.test(w) && !DIMENSION.test(w) && (/-/.test(w) || /^[a-z]{2,}/i.test(w));

// ---------------------------------------------------------------- 表の列で読む

export type Mapping = {header: number; name: number; price: number; code: number; maker: number; unit: number};

const CODE_KEYS = ['品番', '型番', '商品コード', '品目コード', '製品コード', '型式', 'コード', 'jan'];
const NAME_KEYS = ['商品名', '品名', '製品名', '名称', '品目', '商品'];
const MAKER_KEYS = ['メーカー', '製造元', '仕入先'];
const UNIT_KEYS = ['単位', '入数'];
// 仕切り価格らしい見出しほど高い点（「定価」と「仕切」が両方あれば仕切を選ぶ）
const PRICE_KEYS: [string, number][] = [
  ['仕切', 10],
  ['納価', 9],
  ['卸', 8],
  ['ネット', 8],
  ['net', 8],
  ['特価', 7],
  ['掛', 6],
  ['単価', 5],
  ['価格', 4],
  ['金額', 3],
  ['定価', 2],
  ['希望小売', 1],
];

const has = (cell: string, keys: string[]) => {
  const c = normalize(cell).toLowerCase();
  return keys.some((k) => c.includes(k));
};
const priceScore = (cell: string) => {
  const c = normalize(cell).toLowerCase();
  let best = 0;
  for (const [k, w] of PRICE_KEYS) if (c.includes(k)) best = Math.max(best, w);
  return best;
};

export function columnCount(grid: Grid): number {
  return grid.reduce((n, r) => Math.max(n, r.length), 0);
}

/** 見出しの行と、商品名・仕切価格・品番などの列を推測する（画面で変えられる） */
export function detectMapping(grid: Grid): Mapping {
  const cols = columnCount(grid);
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r];
    let name = -1;
    let code = -1;
    let maker = -1;
    let unit = -1;
    let price = -1;
    let score = 0;
    row.forEach((cell, c) => {
      if (!normalize(cell)) return;
      if (code < 0 && has(cell, CODE_KEYS)) code = c;
      else if (name < 0 && has(cell, NAME_KEYS)) name = c;
      else if (maker < 0 && has(cell, MAKER_KEYS)) maker = c;
      else if (unit < 0 && has(cell, UNIT_KEYS)) unit = c;
      const s = priceScore(cell);
      if (s > score) {
        score = s;
        price = c;
      }
    });
    if (name >= 0 && price >= 0 && price !== name) return {header: r, name, price, code, maker, unit};
  }

  // 見出しがないとき：数字の多い一番右の列を価格、長い文字の列を商品名にする
  const stats = Array.from({length: cols}, (_, c) => {
    let filled = 0;
    let numeric = 0;
    let textLen = 0;
    let codeLike = 0;
    for (const row of grid) {
      const v = normalize(row[c]);
      if (!v) continue;
      filled++;
      if (parsePrice(v) !== null) numeric++;
      else textLen += v.length;
      if (isCode(v)) codeLike++;
    }
    return {c, filled, numeric, avgText: filled - numeric > 0 ? textLen / (filled - numeric) : 0, codeLike};
  });
  const rowsN = Math.max(1, grid.length);
  const priceCols = stats.filter((s) => s.filled >= rowsN * 0.4 && s.numeric >= s.filled * 0.6);
  const price = priceCols.length ? priceCols[priceCols.length - 1].c : Math.max(0, cols - 1);
  const textCols = stats.filter((s) => s.c !== price && s.numeric < s.filled * 0.5);
  const name = textCols.length ? textCols.reduce((a, b) => (b.avgText > a.avgText ? b : a)).c : 0;
  const codeCol = stats.find((s) => s.c !== price && s.c !== name && s.codeLike >= Math.max(1, s.filled * 0.5));
  return {header: -1, name, price, code: codeCol ? codeCol.c : -1, maker: -1, unit: -1};
}

export type Candidate = {
  key: string;
  row: number; // 元の表の何行目か（1から）
  name: string;
  price: number | null;
  code: string;
  maker: string;
  unit: string;
  include: boolean; // 取り込む
  favorite: boolean; // ★よく使う
};

const looksLikeHeader = (name: string) => NAME_KEYS.includes(name) || CODE_KEYS.includes(name.toLowerCase());

export function gridCandidates(grid: Grid, m: Mapping, defaultMaker: string): Candidate[] {
  const out: Candidate[] = [];
  const cell = (row: string[], c: number) => (c >= 0 ? normalize(row[c]) : '');
  grid.forEach((row, r) => {
    if (r <= m.header) return;
    const name = cell(row, m.name);
    const price = m.price >= 0 ? parsePrice(row[m.price]) : null;
    if (!name && price === null) return;
    if (looksLikeHeader(name)) return; // ページごとに繰り返される見出し
    const valid = name !== '' && price !== null && price > 0;
    out.push({
      key: `g${r}`,
      row: r + 1,
      name,
      price,
      code: cell(row, m.code),
      maker: cell(row, m.maker) || defaultMaker,
      unit: cell(row, m.unit),
      include: valid,
      favorite: false,
    });
  });
  return out;
}

/** PDFの1語（文字と左右の位置） */
export type PositionedWord = {s: string; x0: number; x1: number};

/**
 * PDFの表を、見出しの行の位置に合わせて列にそろえる（金額が右寄せで、見出しより左から始まっていても同じ列になる）。
 * 見出しの行（商品名・価格の言葉がある行）が見つからなければ null。
 */
export function alignToHeader(rows: PositionedWord[][]): Grid | null {
  for (let h = 0; h < Math.min(rows.length, 40); h++) {
    const head = rows[h];
    const texts = head.map((w) => w.s);
    if (!texts.some((t) => has(t, NAME_KEYS) || has(t, CODE_KEYS)) || !texts.some((t) => priceScore(t) > 0)) continue;
    const cols = head.map((w) => ({x0: w.x0, x1: w.x1}));
    return rows.map((row, r) => {
      if (r === h) return texts;
      const cells: string[][] = cols.map(() => []);
      for (const w of row) {
        let best = -1;
        let bestOverlap = 0;
        cols.forEach((c, i) => {
          const overlap = Math.min(w.x1, c.x1) - Math.max(w.x0, c.x0);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            best = i;
          }
        });
        if (best < 0) {
          // 重なる見出しがなければ、その語より左で始まる一番右の列（左寄せの長い商品名など）
          cols.forEach((c, i) => {
            if (c.x0 <= w.x0 + 0.5) best = i;
          });
          if (best < 0) best = 0;
        }
        cells[best].push(w.s);
      }
      return cells.map((c) => c.join(' '));
    });
  }
  return null;
}

// ---------------------------------------------------------------- 1行ずつ読む

const PRICE_TOKEN = /^[¥\\]?-?(\d{1,3}(,\d{3})+|\d{3,})(\.\d+)?円?$/;

const UNIT_TOKEN = /^(本|個|台|枚|組|式|セット|set|m|ｍ|cm|ケース|箱|袋|巻|足|対|ヶ|ヵ所|箇所|ペア)$/i;

/** 1行を「品番・商品名・単位・価格の候補（左から順）」に分ける */
export function splitLine(line: string): {code: string; name: string; unit: string; prices: number[]} {
  const tokens = normalize(line).split(' ').filter(Boolean);
  const prices: number[] = [];
  const words: string[] = [];
  let lastPriceAt = -1;
  tokens.forEach((t) => {
    // 行の先頭の数字（数字だけの品番・番号）は価格にしない。価格は商品名のうしろに並ぶ
    if (PRICE_TOKEN.test(t) && words.length > 0) {
      prices.push(parsePrice(t) as number);
      lastPriceAt = words.length;
    } else words.push(t);
  });
  // 価格のうしろにある「本」「個」などは単位
  let unit = '';
  if (lastPriceAt >= 0 && words.length > lastPriceAt + 0 && words.length - lastPriceAt === 1 && UNIT_TOKEN.test(words[words.length - 1])) {
    unit = words.pop() as string;
  }
  // 品番：最初の3語の中の、英数字とハイフンなどだけでできた語（「600mm」「35φ」のような寸法は除く）
  let code = '';
  const at = words.slice(0, 3).findIndex(isCode);
  if (at >= 0 && words.length > 1) code = words.splice(at, 1)[0];
  return {code, name: words.join(' '), unit, prices};
}

/** nthFromRight：1＝行の一番右の数字を仕切価格にする、2＝右から2番目 … */
export function lineCandidates(lines: string[], nthFromRight: number, defaultMaker: string): Candidate[] {
  const out: Candidate[] = [];
  lines.forEach((line, i) => {
    const {code, name, unit, prices} = splitLine(line);
    if (prices.length === 0 || !name) return;
    const idx = prices.length - Math.max(1, nthFromRight);
    const price = idx >= 0 ? prices[idx] : null;
    if (looksLikeHeader(name)) return;
    out.push({
      key: `l${i}`,
      row: i + 1,
      name,
      price,
      code,
      maker: defaultMaker,
      unit,
      include: price !== null && price > 0,
      favorite: false,
    });
  });
  return out;
}

// ---------------------------------------------------------------- 部材リストへの取り込み

const matKey = (maker: string, code: string, name: string) =>
  `${normalize(maker).toLowerCase()}|${code ? 'c:' + normalize(code).toLowerCase() : 'n:' + normalize(name).toLowerCase()}`;

export type MergeResult = {list: Material[]; added: number; updated: number; unchanged: number};

/**
 * 同じメーカーで品番（品番がなければ商品名）が同じものは、新しい価格に書き換える（★はそのまま残す）。
 * 新しい仕切り表に差し替えるときも、★を付け直さなくてよい。
 */
export function mergeMaterials(existing: Material[], incoming: Candidate[], now = Date.now()): MergeResult {
  const list = existing.map((m) => ({...m}));
  const index = new Map<string, number>();
  list.forEach((m, i) => index.set(matKey(m.maker, m.code, m.name), i));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const c of incoming) {
    if (!c.include || !c.name || c.price === null) continue;
    const key = matKey(c.maker, c.code, c.name);
    const at = index.get(key);
    if (at !== undefined) {
      const m = list[at];
      const changed = m.price !== c.price || m.name !== c.name || (c.unit && m.unit !== c.unit);
      list[at] = {
        ...m,
        name: c.name,
        price: c.price,
        unit: c.unit || m.unit,
        favorite: m.favorite || c.favorite,
        updatedAt: changed ? now : m.updatedAt,
      };
      if (changed) updated++;
      else unchanged++;
    } else {
      list.push({
        id: uid('m'),
        name: c.name,
        price: c.price,
        maker: c.maker,
        code: c.code,
        unit: c.unit,
        favorite: c.favorite,
        updatedAt: now,
      });
      index.set(key, list.length - 1);
      added++;
    }
  }
  return {list, added, updated, unchanged};
}

// メーカーの仕切り表（Excel・CSV・PDF・貼り付けた文字）から、商品名と仕切り価格・定価を読み取る。
// 読み取ったものは「候補」として一覧に出し、取り込む行・★（お気に入り）を選んでから部材リストに入れる。
// 定価は見積書の単価（定価×0.8）に使う。

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

/** 列の番号（-1 はその列なし）。list は定価の列 */
export type Mapping = {header: number; name: number; price: number; code: number; maker: number; unit: number; list: number};

const CODE_KEYS = ['品番', '型番', '商品コード', '品目コード', '製品コード', '型式', 'コード', 'jan'];
const NAME_KEYS = ['商品名', '品名', '製品名', '名称', '品目', '商品'];
const MAKER_KEYS = ['メーカー', '製造元', '仕入先'];
const UNIT_KEYS = ['単位', '入数'];
const LIST_KEYS = ['定価', '希望小売', '標準価格', '上代'];
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
    let list = -1;
    let score = 0;
    row.forEach((cell, c) => {
      if (!normalize(cell)) return;
      if (code < 0 && has(cell, CODE_KEYS)) code = c;
      else if (name < 0 && has(cell, NAME_KEYS)) name = c;
      else if (maker < 0 && has(cell, MAKER_KEYS)) maker = c;
      else if (unit < 0 && has(cell, UNIT_KEYS)) unit = c;
      if (list < 0 && has(cell, LIST_KEYS)) list = c;
      const s = priceScore(cell);
      if (s > score) {
        score = s;
        price = c;
      }
    });
    // 定価の列しかなければ、仕切価格の列も定価の列になる（画面で選び直せる）
    if (name >= 0 && price >= 0 && price !== name) return {header: r, name, price, code, maker, unit, list};
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
  // 価格の左どなりの数字の列が、ほとんどの行で価格以上なら定価とみなす（「定価 4,800　仕切 3,360」の並び）
  const left = priceCols.length >= 2 ? priceCols[priceCols.length - 2].c : -1;
  return {header: -1, name, price, code: codeCol ? codeCol.c : -1, maker: -1, unit: -1, list: left >= 0 && mostlyAtLeast(grid, left, price) ? left : -1};
}

/** 列 a の金額が、両方に金額のある行の8割以上で列 b 以上か */
function mostlyAtLeast(grid: Grid, a: number, b: number): boolean {
  let both = 0;
  let ok = 0;
  for (const row of grid) {
    const x = parsePrice(row[a]);
    const y = parsePrice(row[b]);
    if (x === null || y === null || x <= 0) continue;
    both++;
    if (x >= y) ok++;
  }
  return both > 0 && ok >= both * 0.8;
}

export type Candidate = {
  key: string;
  row: number; // 元の表の何行目か（1から）
  name: string;
  price: number | null; // 仕切価格
  listPrice: number | null; // 定価（なければ null）
  code: string;
  maker: string;
  unit: string;
  include: boolean; // 取り込む
  favorite: boolean; // ★お気に入り
};

const looksLikeHeader = (name: string) => NAME_KEYS.includes(name) || CODE_KEYS.includes(name.toLowerCase());

export function gridCandidates(grid: Grid, m: Mapping, defaultMaker: string): Candidate[] {
  const out: Candidate[] = [];
  const cell = (row: string[], c: number) => (c >= 0 ? normalize(row[c]) : '');
  grid.forEach((row, r) => {
    if (r <= m.header) return;
    const name = cell(row, m.name);
    const price = m.price >= 0 ? parsePrice(row[m.price]) : null;
    const listPrice = m.list >= 0 ? parsePrice(row[m.list]) : null;
    if (!name && price === null) return;
    if (looksLikeHeader(name)) return; // ページごとに繰り返される見出し
    const valid = name !== '' && price !== null && price > 0;
    out.push({
      key: `g${r}`,
      row: r + 1,
      name,
      price,
      listPrice,
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

/**
 * nthFromRight：1＝行の一番右の数字を仕切価格にする、2＝右から2番目 …
 * listNthFromRight：定価にする数字（0＝定価は読まない）
 */
export function lineCandidates(lines: string[], nthFromRight: number, defaultMaker: string, listNthFromRight = 0): Candidate[] {
  const out: Candidate[] = [];
  const pick = (prices: number[], nth: number) => {
    const idx = prices.length - nth;
    return nth > 0 && idx >= 0 ? prices[idx] : null;
  };
  lines.forEach((line, i) => {
    const {code, name, unit, prices} = splitLine(line);
    if (prices.length === 0 || !name) return;
    const price = pick(prices, Math.max(1, nthFromRight));
    if (looksLikeHeader(name)) return;
    out.push({
      key: `l${i}`,
      row: i + 1,
      name,
      price,
      listPrice: pick(prices, listNthFromRight),
      code,
      maker: defaultMaker,
      unit,
      include: price !== null && price > 0,
      favorite: false,
    });
  });
  return out;
}

/** 「1行ずつ読む」の定価：金額が2つ以上ある行が多く、右から2番目がほとんど右端以上なら 2（なければ 0） */
export function detectListNth(lines: string[]): number {
  const priced = lines.map((l) => splitLine(l).prices).filter((p) => p.length > 0);
  const two = priced.filter((p) => p.length >= 2);
  if (two.length === 0 || two.length < priced.length * 0.6) return 0;
  const ok = two.filter((p) => p[p.length - 2] >= p[p.length - 1]).length;
  return ok >= two.length * 0.8 ? 2 : 0;
}

// ---------------------------------------------------------------- 部材リストへの取り込み

const matKey = (maker: string, code: string, name: string) =>
  `${normalize(maker).toLowerCase()}|${code ? 'c:' + normalize(code).toLowerCase() : 'n:' + normalize(name).toLowerCase()}`;

export type MergeResult = {list: Material[]; added: number; updated: number; unchanged: number};

/**
 * 同じメーカーで品番（品番がなければ商品名）が同じものは、新しい価格に書き換える（★はそのまま残す）。
 * 新しい仕切り表に差し替えるときも、★を付け直さなくてよい。定価は、表に定価があるときだけ書き換える。
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
      const listPrice = c.listPrice ?? m.listPrice;
      const changed = m.price !== c.price || m.listPrice !== listPrice || m.name !== c.name || (c.unit && m.unit !== c.unit);
      list[at] = {
        ...m,
        name: c.name,
        price: c.price,
        listPrice,
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
        listPrice: c.listPrice ?? 0,
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

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

/**
 * 商品名から1本の長さ（m）を読む：「4m」「2.5m」「2000mm」「L=4000」など。読めなければ 0。
 * 手すりなど切って使う部材の、見積の数量（使う長さ÷1本の長さ）に使う
 */
export function guessPieceLengthM(name: string): number {
  const s = normalize(name).toLowerCase();
  const mm = /(?:^|[^\d.])(\d+(?:\.\d+)?) ?mm(?![a-z])/.exec(s);
  if (mm) return Math.round(Number(mm[1])) / 1000;
  const m = /(?:^|[^\d.])(\d+(?:\.\d+)?) ?m(?![a-z])/.exec(s);
  if (m) return Number(m[1]);
  const l = /(?:^|[^a-z])l ?[=:]? ?(\d{3,5})(?!\d)/.exec(s);
  if (l) return Number(l[1]) / 1000;
  return 0;
}

/**
 * 表の「1本の長さ」の欄を m にする。見出しに単位（mm・cm・m）があればそれで、なければ 100 以上は mm とみなす。
 * 「4m」「4000mm」のように単位の付いた文字はそのまま読む。読めなければ 0
 */
export function parseLengthM(v: unknown, header: unknown = ''): number {
  const n = parsePrice(v);
  if (n === null) return guessPieceLengthM(normalize(v));
  if (n <= 0) return 0;
  const h = normalize(header).toLowerCase();
  if (/mm|ミリ/.test(h)) return n / 1000;
  if (/cm|センチ/.test(h)) return n / 100;
  if (/\(m\)|\[m\]|メートル|（m）|m$/.test(h)) return n;
  return n >= 100 ? n / 1000 : n;
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
/** 規格の列（商品名2）の先頭の品番：品番らしい語のほか、数字で始まる古い形の品番（35AB4C など）も */
const isSpecCode = (w: string) => isCode(w) || /^\d+[a-z]{2,}\d[a-z\d]*$/i.test(w);

// ---------------------------------------------------------------- 表の列で読む

/**
 * 列の番号（-1 はその列なし）。list は定価の列、spec は商品名のうしろに付ける列（色・規格など）、len は1本の長さの列。
 * rate は掛率の列（仕切価格の欄が空の行は 定価×掛率 を仕切価格にする。マツ六の表）。
 * price（仕切価格）が -1 で掛率もなければ、仕切価格は空欄として取り込む（あとで仕切価格の入った表を取り込むと入る）
 */
export type Mapping = {header: number; name: number; price: number; code: number; maker: number; unit: number; list: number; spec: number; len: number; rate: number};

const keyScore = (cell: string, keys: [string, number][]) => {
  const c = normalize(cell).toLowerCase();
  let best = 0;
  for (const [k, w] of keys) if (c.includes(k)) best = Math.max(best, w);
  return best;
};
// 品番らしい見出しほど高い点（「商品コード」「JANコード」より「品番」）
const CODE_KEYS: [string, number][] = [
  ['品番', 6],
  ['型番', 5],
  ['型式', 4],
  ['商品コード', 3],
  ['品目コード', 3],
  ['製品コード', 3],
  ['コード', 2],
  ['jan', 1],
];
const NAME_KEYS: [string, number][] = [
  ['商品名', 5],
  ['品名', 4],
  ['製品名', 4],
  ['名称', 3],
  ['品目', 2],
  ['商品', 1],
];
const MAKER_KEYS = ['メーカー', '製造元', '仕入先'];
const UNIT_KEYS = ['単位', '入数'];
const LIST_KEYS = ['定価', '希望小売', '標準価格', '上代', 'ガイド価格'];
const SPEC_KEYS = ['色', 'カラー', '規格', '仕様', 'サイズ'];
const LEN_KEYS = ['1本の長さ', '長さ', '全長'];
// 仕切り価格らしい見出しほど高い点（「定価」と「仕切」が両方あれば仕切を選ぶ）。「掛率」「UP率」など「率」の列は価格にしない。
// 定価の見出し（「希望小売価格」「ガイド価格」（矢崎化工）など）の列は、仕切価格にしない
const PRICE_KEYS: [string, number][] = [
  ['仕切', 10],
  ['納価', 9],
  ['納入', 9],
  ['売価', 9],
  ['卸', 8],
  ['仕入', 8],
  ['御社', 8],
  ['貴社', 8],
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
const priceScore = (cell: string) => (normalize(cell).includes('率') ? 0 : keyScore(cell, PRICE_KEYS));
const isListHeader = (cell: string) => has(cell, LIST_KEYS) && keyScore(cell, PRICE_KEYS) < 5; // 「定価・売価」のように仕切価格の言葉もあれば定価にしない
// 掛率の列（「UP率」（値上げの率）は掛率ではない）
const RATE_HEADER = /掛け?率|仕切り?率|卸率/;

export function columnCount(grid: Grid): number {
  return grid.reduce((n, r) => Math.max(n, r.length), 0);
}

/** 見出しの続きの行に入る言葉（定価・単価・掛率 など） */
const SUB_WORDS = /定価|単価|価格|売価|仕切|納価|掛|率|税|入数|単位|数量|金額|上代|下代|ネット|net/i;
const hasRole = (s: string) => keyScore(s, PRICE_KEYS) > 0 || has(s, LIST_KEYS) || RATE_HEADER.test(normalize(s));

/**
 * 見出しが2行に分かれた表の、下の行（マツ六の価格改定一覧：「現行価格」「価格改定価格」の下に「定価・単価・掛率」）。
 * 見出しのすぐ下の行が、短い見出しの言葉（2つ以上）だけで金額のない行なら、その行。なければ null
 */
export function subHeaderOf(grid: Grid, header: number): string[] | null {
  const row = header >= 0 ? grid[header + 1] : undefined;
  if (!row) return null;
  const cells = row.map((c) => normalize(c)).filter(Boolean);
  if (cells.length < 2 || !cells.every((c) => c.length <= 8 && parsePrice(c) === null && SUB_WORDS.test(c))) return null;
  return row.map((c) => normalize(c));
}

/**
 * 列の見出しの文字。見出しが2行なら下の行の言葉で決める（「価格改定価格」の下の「単価」は単価、右の組ほど新しい）。
 * 下の行が「(税抜)」のように役目のない言葉なら上の行とつなぐ。上の行が空の列は、左の組の名前を引き継ぐ（結合したセル）
 */
export function headerLabels(grid: Grid, header: number): string[] {
  const top = (header >= 0 ? grid[header] ?? [] : []).map((c) => normalize(c));
  const sub = subHeaderOf(grid, header);
  if (!sub) return top;
  let group = '';
  return Array.from({length: Math.max(top.length, sub.length)}, (_, c) => {
    const t = top[c] ?? '';
    const s = sub[c] ?? '';
    if (t) group = s ? t : '';
    else if (!s) group = '';
    if (s && hasRole(s)) return s;
    return [t || group, s].filter(Boolean).join(' ');
  });
}

/** 掛率の欄：「0.32」「32」「32%」→ 0.32。読めない・0以下・100%を超えるものは null */
export function parseRate(v: unknown): number | null {
  const t = normalize(v);
  const pct = /%$/.test(t);
  const n = parsePrice(t.replace(/%$/, ''));
  if (n === null || n <= 0) return null;
  const r = pct || n > 1 ? n / 100 : n;
  return r > 0 && r <= 1 ? r : null;
}

/** 定価×掛率（1円未満は四捨五入。0.41 のような小数の計算の誤差で 266.5 が 266 にならないよう、先に小数3けたでそろえる） */
const byRate = (listPrice: number, rate: number) => Math.round(Math.round(listPrice * rate * 1000) / 1000);

/**
 * 見出しの行と、商品名・仕切価格・品番などの列を推測する（画面で変えられる）。
 * 「定価」「売価」が2組あるとき（改定前・改定後）は、右の（新しい）方を使う。
 */
export function detectMapping(grid: Grid): Mapping {
  const cols = columnCount(grid);
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    // 見出しが2行（「現行価格」「価格改定価格」の下に「定価・単価・掛率」）なら、下の行の言葉で列の役目を決める
    const labels = headerLabels(grid, r);
    let name = -1;
    let code = -1;
    let maker = -1;
    let unit = -1;
    let price = -1;
    let list = -1;
    let spec = -1;
    let len = -1;
    let rate = -1;
    let second = -1; // 「商品名2」（品番と色・寸法。マツ六の価格改定一覧）
    let codeBest = 0;
    let nameBest = 0;
    let score = 0;
    labels.forEach((cell, c) => {
      const t = normalize(cell);
      // 見出しは短い言葉。長い文（「※仕切価格は空欄です。品番で合わせます」のような注意書き）は見出しにしない
      if (!t || t.length > 24) return;
      const cs = keyScore(cell, CODE_KEYS);
      const ns = keyScore(cell, NAME_KEYS);
      // 掛率の列は価格にしない（仕切価格の欄がない行は 定価×掛率）。右の組（改定後）ほど新しい
      if (RATE_HEADER.test(t)) {
        rate = c;
        return;
      }
      // 1つの列は1つの役目だけ（「商品コード」は商品名ではなく品番の候補。品番・商品名の列は価格の列にしない）
      if (cs > 0 && cs >= ns) {
        if (cs > codeBest) {
          codeBest = cs;
          code = c;
        }
        return;
      } else if (ns > 0) {
        if (/名2$/.test(t)) {
          if (second < 0) second = c;
        } else if (ns > nameBest) {
          nameBest = ns;
          name = c;
        }
        return;
      } else if (maker < 0 && has(cell, MAKER_KEYS)) maker = c;
      else if (unit < 0 && has(cell, UNIT_KEYS)) unit = c;
      else if (len < 0 && has(cell, LEN_KEYS)) len = c;
      else if (has(cell, SPEC_KEYS)) spec = c; // 色の列が2つ（色の記号・色の名前）なら右の方
      if (has(cell, LIST_KEYS)) list = c;
      const s = isListHeader(cell) ? 0 : priceScore(cell);
      if (s > 2 && s >= score) {
        score = s;
        price = c;
      }
    });
    if (name < 0) name = second;
    else if (spec < 0) spec = second; // 「商品名2」は商品名のうしろに付ける（品番が入っていれば品番にする：gridCandidates）
    if (name >= 0 && (price >= 0 || list >= 0)) {
      // 仕切価格の見出しがなければ、定価より右の見出しのない列に金額が入っていればそれを使う。
      // なければ仕切価格は空欄で取り込む（掛率の列があれば 定価×掛率）
      if (price < 0) price = untitledPriceColumn(grid, r, labels, list, new Set([name, code, maker, unit, spec, len, rate]));
      return {header: r, name, price, code, maker, unit, list, spec, len, rate};
    }
    // 商品名の列がなくても、品番と仕切価格があれば「仕切価格だけを入れる表」として読む
    if (code >= 0 && price >= 0) return {header: r, name: -1, price, code, maker, unit, list, spec, len, rate};
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
  return {
    header: -1,
    name,
    price,
    code: codeCol ? codeCol.c : -1,
    maker: -1,
    unit: -1,
    list: left >= 0 && mostlyAtLeast(grid, left, price) ? left : -1,
    spec: -1,
    len: -1,
    rate: -1,
  };
}

/**
 * 定価の列より右にある見出しのない列のうち、定価のある行の半分以上に金額（1円以上）が入っている一番右の列。なければ -1。
 * マツ六の価格表のように、仕切価格の列の見出しが空のことがある（今は空欄でも、あとで金額を入れて取り込めば仕切価格になる）
 */
function untitledPriceColumn(grid: Grid, header: number, labels: string[], list: number, taken: Set<number>): number {
  if (list < 0) return -1;
  let best = -1;
  for (let c = list + 1; c < columnCount(grid); c++) {
    if (taken.has(c) || labels[c]) continue;
    let rows = 0;
    let prices = 0;
    for (let r = header + 1; r < grid.length; r++) {
      if (parsePrice(grid[r]?.[list]) === null) continue;
      rows++;
      if ((parsePrice(grid[r]?.[c]) ?? 0) >= 1) prices++;
    }
    if (rows > 0 && prices >= rows * 0.5) best = c;
  }
  return best;
}

/** 寸法・色らしい文字（φ・×・mm など、かな・漢字）。「T LBR」「SET SGD」のような英字だけのものは品番の続き */
const SPEC_LIKE = /[φΦ×*～~]|\d(mm|cm|m|kg|g|ml)(?![a-z])|[\u3040-\u30ff\u4e00-\u9fff\uff66-\uff9f]/i;

/**
 * 品番の列に「BD-134 φ35×4000mm Mオーク」のように品番と寸法・色が一緒に入っているか（半分以上の行）。
 * 「HD5-4000 T LBR」（矢崎化工）のように、空白のあとも英数字だけなら品番そのもの
 */
export function codeHasSpec(grid: Grid, m: Mapping): boolean {
  if (m.code < 0) return false;
  let filled = 0;
  let multi = 0;
  for (let r = m.header + 1; r < grid.length; r++) {
    const v = normalize(grid[r]?.[m.code]);
    if (!v) continue;
    filled++;
    const [first, ...rest] = v.split(' ');
    if (rest.length > 0 && isCode(first) && SPEC_LIKE.test(rest.join(' '))) multi++;
  }
  return filled > 0 && multi >= filled * 0.5;
}

/**
 * 規格の列（「商品名2」）の先頭に品番が入っているか（半分以上の行）：マツ六の価格改定一覧「AB-12CD ブラック」の形。
 * 品番の列が「品番」「型番」「型式」なら、その列を品番のままにする（「商品コード」「JANコード」は社内の番号なので、規格の列の品番を使う）
 */
export function specHasCode(grid: Grid, m: Mapping): boolean {
  if (m.spec < 0 || m.spec === m.code) return false;
  if (m.code >= 0 && keyScore(headerLabels(grid, m.header)[m.code] ?? '', CODE_KEYS) >= 4) return false;
  let filled = 0;
  let coded = 0;
  for (let r = m.header + 1; r < grid.length; r++) {
    const v = normalize(grid[r]?.[m.spec]);
    if (!v) continue;
    filled++;
    if (isSpecCode(v.split(' ')[0])) coded++;
  }
  return filled > 0 && coded >= filled * 0.5;
}

/** メーカー名：ファイル名か、表の上の方の文字に知っているメーカー名があれば使う（「TOTO九州販売」→ TOTO） */
const KNOWN_MAKERS: [RegExp, string][] = [
  [/toto/i, 'TOTO'],
  [/マツ六/, 'マツ六'],
  [/矢崎|ヤザキ|yazaki/i, '矢崎化工'],
  [/アロン化成/, 'アロン化成'],
  [/ナカ工業/, 'ナカ工業'],
  [/パナソニック|panasonic/i, 'パナソニック'],
  [/lixil|リクシル/i, 'LIXIL'],
  [/シコク/, 'シコク'],
  [/川口技研/, '川口技研'],
];

export function guessMaker(texts: string[]): string {
  for (const t of texts) {
    const s = normalize(t);
    for (const [re, name] of KNOWN_MAKERS) if (re.test(s)) return name;
  }
  return '';
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
  name: string; // 空なら「仕切価格だけを入れる行」（同じ品番の部材があるときだけ入れる）
  price: number | null; // 仕切価格（空欄なら null）
  listPrice: number | null; // 定価（なければ null）
  code: string;
  maker: string;
  unit: string;
  pieceLengthM: number; // 表の「1本の長さ」（m）。なければ 0（商品名から読む）
  include: boolean; // 取り込む
  favorite: boolean; // ★お気に入り
};

/** 単位・入数の欄：「1個」「1本」は「個」「本」、数字だけ（入数「1」）なら空欄。「10枚」のように2つ以上入りのものはそのまま */
export function unitText(s: string): string {
  const t = normalize(s);
  return /^\d+$/.test(t) ? '' : t.replace(/^1 ?(?=[^\d./])/, '');
}

// 切って使う部材らしい商品名（「カバー」はのぞく）
const BAR_LIKE = /パイプ|ディンプル|丸棒|手すり棒|取付け?ベース|(?<!カ)バー|レール/;

/**
 * 品番に入った1本の長さ（m）：手すりのパイプ・丸棒・木製の取付けベースなど切って使う部材で、品番に「-2000」「-4000」（mm）とあるもの
 * （矢崎化工の「HCT-4000 T USL」φ34屋外手すりパイプ など。商品名には長さがない）。1本ずつの部材だけ（「3本」入りなどは読まない）。読めなければ 0
 */
export function codeLengthM(code: string, name: string, unit: string): number {
  if (!BAR_LIKE.test(normalize(name)) || !['', '本', '枚'].includes(unit)) return 0;
  const mm = Number(/-(\d{4})(?!\d)/.exec(normalize(code))?.[1] ?? 0);
  return mm >= 1000 && mm <= 4000 && mm % 100 === 0 ? mm / 1000 : 0;
}

const looksLikeHeader = (text: string) => NAME_KEYS.some(([k]) => k === text) || CODE_KEYS.some(([k]) => k === text.toLowerCase());

export function gridCandidates(grid: Grid, m: Mapping, defaultMaker: string): Candidate[] {
  const out: Candidate[] = [];
  const cell = (row: string[], c: number) => (c >= 0 ? normalize(row[c]) : '');
  const split = codeHasSpec(grid, m);
  const fromSpec = specHasCode(grid, m);
  const labels = headerLabels(grid, m.header);
  const body = m.header + (subHeaderOf(grid, m.header) ? 2 : 1); // 見出しが2行なら、その下から
  grid.forEach((row, r) => {
    if (r < body) return;
    let code = cell(row, m.code);
    let spec = m.spec >= 0 && m.spec !== m.code ? cell(row, m.spec) : '';
    if (split && code.includes(' ')) {
      // 「BD-134 φ35×4000mm Mオーク」→ 品番 BD-134、寸法・色は商品名のうしろへ
      const at = code.indexOf(' ');
      spec = [code.slice(at + 1), spec].filter(Boolean).join(' ');
      code = code.slice(0, at);
    }
    const [first = '', ...rest] = spec.split(' ');
    if (fromSpec && isSpecCode(first)) {
      // 「商品名2」の「AB-12CD ブラック」→ 品番 AB-12CD（「商品コード」の社内の番号より、見積書・発注書で使う品番）、色は商品名のうしろへ
      code = first;
      spec = rest.join(' ');
    }
    const base = cell(row, m.name);
    const full = base && spec && !base.includes(spec) ? `${base} ${spec}` : base;
    // 商品名のうしろに品番がくり返されていれば外す（矢崎化工「たちあっぷ サムリング CKM-02 SET GR」）
    const name = code && full.endsWith(` ${code}`) ? full.slice(0, -code.length - 1) : full;
    const listPrice = m.list >= 0 ? parsePrice(row[m.list]) : null;
    let price = m.price >= 0 ? parsePrice(row[m.price]) : null;
    // 仕切価格の欄がない（空の）行は、表の掛率で 定価×掛率（マツ六の価格表の「掛率 0.32」）。決まった率で計算することはしない
    const rate = m.rate >= 0 ? parseRate(row[m.rate]) : null;
    if (!(price !== null && price > 0) && rate !== null && listPrice !== null && listPrice > 0) price = byRate(listPrice, rate);
    if (!name && (!code || price === null)) return;
    if (looksLikeHeader(base) || looksLikeHeader(code)) return; // ページごとに繰り返される見出し
    // 品番の列がある表で、品番も金額もない行は、表の中の小見出し（「住宅改修（屋外スタンダードシリーズ）」など）
    if (m.code >= 0 && !code && price === null && listPrice === null) return;
    const unit = unitText(cell(row, m.unit));
    // 仕切価格が空欄でも、定価があれば取り込む（仕切価格はあとで入れられる）
    const valid = (name !== '' || code !== '') && ((price ?? 0) > 0 || (listPrice ?? 0) > 0);
    out.push({
      key: `g${r}`,
      row: r + 1,
      name,
      price: price !== null && price > 0 ? price : null,
      listPrice: listPrice !== null && listPrice > 0 ? listPrice : null,
      code,
      maker: cell(row, m.maker) || defaultMaker,
      unit,
      pieceLengthM: (m.len >= 0 ? parseLengthM(row[m.len], labels[m.len] ?? '') : 0) || codeLengthM(code, name, unit),
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
    if (!texts.some((t) => keyScore(t, NAME_KEYS) > 0 || keyScore(t, CODE_KEYS) > 0) || !texts.some((t) => priceScore(t) > 0)) continue;
    return placeWords(head, rows, h);
  }
  return null;
}

const overlap = (a: {x0: number; x1: number}, b: {x0: number; x1: number}) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
const isPriceWord = (s: string) => parsePrice(s) !== null;

/**
 * 語を列に入れる。見出しの語と重なる語はその列（いちばん重なる列）。
 * 重ならない語は、その列の見出しと重なる語（ほかの行のものも）が並ぶ範囲に入っていればその列
 * （見出しが列のまん中にあり、短い商品名が見出しまで届かないとき。矢崎化工の価格表）。どの範囲にも入らなければ、
 *   左の列に見出しと重なる語が1つもない → 左の列（金額が右寄せで、見出しより右にあるとき）
 *   左の列と同じく文字 → 左の列（商品名の続き）
 *   それ以外（金額の列のすぐ右の〇×など）→ 見出しのない列（矢崎化工の「価格改定」の〇×は、見出しが上下の行に分かれている）
 */
function placeWords(head: PositionedWord[], rows: PositionedWord[][], h: number): Grid {
  const n = head.length;
  const titleOf = (w: PositionedWord) => {
    let best = -1;
    let most = 0;
    let hits = 0;
    head.forEach((t, i) => {
      const o = overlap(w, t);
      if (o > 0) hits++;
      if (o > most) {
        most = o;
        best = i;
      }
    });
    return {best, hits};
  };
  // 見出しごとに、見出しと重なる語が並ぶ範囲と、金額の語の多さ。表の行（3語以上）だけで数え、
  // 2つ以上の見出しにかかる長い語はのぞく（表の中の小見出し・注意書きで範囲を広げない）
  const span = head.map((t) => ({x0: t.x0, x1: t.x1, words: 0, prices: 0}));
  for (const row of rows.slice(h + 1)) {
    if (row.length < 3) continue;
    for (const w of row) {
      const {best, hits} = titleOf(w);
      if (best < 0 || hits > 1) continue;
      const sp = span[best];
      sp.x0 = Math.min(sp.x0, w.x0);
      sp.x1 = Math.max(sp.x1, w.x1);
      sp.words++;
      if (isPriceWord(w.s)) sp.prices++;
    }
  }
  const numeric = (i: number) => span[i].words > 0 && span[i].prices >= span[i].words / 2;
  // 列の番号：見出し i は 2i、見出し i と i+1 の間の見出しのない列は 2i+1
  const slotOf = (w: PositionedWord): number => {
    const {best} = titleOf(w);
    if (best >= 0) return best * 2;
    const mid = (w.x0 + w.x1) / 2;
    const inside = span.findIndex((sp) => sp.x0 <= mid && mid <= sp.x1);
    if (inside >= 0) return inside * 2;
    let left = -1;
    span.forEach((sp, i) => {
      if (sp.x1 <= mid) left = i;
    });
    if (left < 0) return 0;
    if (left === n - 1 || span[left].words === 0) return left * 2;
    if (!isPriceWord(w.s) && !numeric(left)) return left * 2;
    return left * 2 + 1;
  };
  const grid = rows.map((row, r) => {
    const cells: string[][] = Array.from({length: n * 2 - 1}, () => []);
    if (r === h) head.forEach((t, i) => cells[i * 2].push(t.s));
    else for (const w of row) cells[slotOf(w)].push(w.s);
    return cells.map((c) => c.join(' '));
  });
  // 見出しのない列は、どの行にも語がなければなくす
  const keep = Array.from({length: n * 2 - 1}, (_, c) => c % 2 === 0 || grid.some((row) => row[c] !== ''));
  return grid.map((row) => row.filter((_, c) => keep[c]));
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
      pieceLengthM: 0,
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

const norm = (s: string) => normalize(s).toLowerCase();
const codeKey = (maker: string, code: string) => `${norm(maker)}|${norm(code)}`;
const nameKey = (maker: string, name: string) => `${norm(maker)}|${norm(name)}`;

export type MergeResult = {list: Material[]; added: number; updated: number; unchanged: number};

/**
 * 同じメーカーで品番（品番がなければ商品名）が同じものは、新しい価格に書き換える（★はそのまま残す）。
 * 新しい仕切り表に差し替えるときも、★を付け直さなくてよい。
 * 同じ品番で寸法・色の違う商品（「P-30V I-40」「P-30V I-60」など、品番等の先頭が同じもの）は、商品名で分けて別々に残す。
 * 仕切価格・定価は、表に金額があるときだけ書き換える（空欄なら今の金額のまま）。
 * 商品名のない行（仕切価格だけの表）は、同じ品番の部材が1つだけあるときに仕切価格を入れる。
 */
export function mergeMaterials(existing: Material[], incoming: Candidate[], now = Date.now()): MergeResult {
  const list = existing.map((m) => ({...m}));
  const byCode = new Map<string, number[]>(); // 同じ品番の部材（寸法・色違いで2つ以上のこともある）
  const byName = new Map<string, number>(); // 品番のない部材
  const remember = (m: Material, i: number) => {
    if (m.code) byCode.set(codeKey(m.maker, m.code), [...(byCode.get(codeKey(m.maker, m.code)) ?? []), i]);
    else byName.set(nameKey(m.maker, m.name), i);
  };
  list.forEach(remember);
  const ok = (c: Candidate) => c.include && (c.name !== '' || c.code !== '') && (c.price !== null || c.listPrice !== null);
  // 取り込む表の中で、同じ品番に商品名がいくつあるか（2つ以上なら寸法・色違いの別の商品）
  const names = new Map<string, Set<string>>();
  for (const c of incoming) {
    if (!ok(c) || !c.code || !c.name) continue;
    const k = codeKey(c.maker, c.code);
    names.set(k, (names.get(k) ?? new Set()).add(norm(c.name)));
  }
  const find = (c: Candidate): number | undefined => {
    if (!c.code) return byName.get(nameKey(c.maker, c.name));
    const same = byCode.get(codeKey(c.maker, c.code)) ?? [];
    if (!c.name) return same.length === 1 ? same[0] : undefined;
    const exact = same.find((i) => norm(list[i].name) === norm(c.name));
    if (exact !== undefined) return exact;
    // 商品名だけ変わった（同じ品番の部材が1つだけで、表の中でもその品番は1種類）なら、その部材を書き換える
    return same.length === 1 && (names.get(codeKey(c.maker, c.code))?.size ?? 0) <= 1 ? same[0] : undefined;
  };
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const c of incoming) {
    if (!ok(c)) continue;
    const at = find(c);
    if (at !== undefined) {
      const m = list[at];
      const price = c.price ?? m.price;
      const listPrice = c.listPrice ?? m.listPrice;
      const name = c.name || m.name;
      const pieceLengthM = c.pieceLengthM || m.pieceLengthM || guessPieceLengthM(name);
      const changed =
        m.price !== price || m.listPrice !== listPrice || m.name !== name || m.pieceLengthM !== pieceLengthM || (c.unit !== '' && m.unit !== c.unit);
      list[at] = {
        ...m,
        name,
        price,
        listPrice,
        pieceLengthM,
        unit: c.unit || m.unit,
        favorite: m.favorite || c.favorite,
        updatedAt: changed ? now : m.updatedAt,
      };
      if (changed) updated++;
      else unchanged++;
    } else {
      if (!c.name) continue; // 仕切価格だけの行で、部材リストにない（または同じ品番が2つ以上ある）品番
      const m: Material = {
        id: uid('m'),
        name: c.name,
        price: c.price ?? 0,
        listPrice: c.listPrice ?? 0,
        pieceLengthM: c.pieceLengthM || guessPieceLengthM(c.name),
        maker: c.maker,
        code: c.code,
        unit: c.unit,
        favorite: c.favorite,
        updatedAt: now,
      };
      list.push(m);
      remember(m, list.length - 1);
      added++;
    }
  }
  return {list, added, updated, unchanged};
}

// 仕切り一覧表（メーカー・問屋の価格表：Excel・CSV・PDF・貼り付けた文字）から、商品名・定価・仕切を読み取る。
// 読み取ったものは「候補」として一覧に出し、取り込む行・★（お気に入り）・種目を選んでから商品マスタに入れる。
// 住宅改修 見積書アプリの src/sasaoka/priceImport.ts（2026-10-20 の版）を写して、このアプリ用に直したもの。
// このアプリは独立しているので、写したあとは別々に直す（向こうを直しても、こちらは変わらない）。
// 写したあとに足したもの：TAIS・JAN・税区分・種目（分類）の列、税込の表を税抜に直す、福祉用具のメーカー名。
// 外したもの：1本の長さ（手すりなど切って使う部材だけに要る）。

import {guessCategory} from '../category.ts';
import type {Product, TaxType} from '../types.ts';
import {uid} from '../util.ts';

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
/** 品番らしい語：数字を含み、ハイフン入りか英字2文字以上で始まる（536-057・EB35・AJ-K01 など） */
const isCode = (w: string) => /\d/.test(w) && CODE_TOKEN.test(w) && !DIMENSION.test(w) && (/-/.test(w) || /^[a-z]{2,}/i.test(w));

// ---------------------------------------------------------------- 表の列で読む

/**
 * 列の番号（-1 はその列なし）。list は定価の列、spec は商品名のうしろに付ける列（色・規格など）、
 * tais・jan はコード、tax は税区分（「非課税」の印）、cat は種目・分類の列。
 * priceTaxIn・listTaxIn は、その列の見出しに「税込」とあるか（税抜に直して取り込む）。
 * price（仕切）が -1 なら、仕切は空欄として取り込む（あとで仕切の入った表を取り込むと入る）
 */
export type Mapping = {
  header: number;
  name: number;
  price: number;
  code: number;
  maker: number;
  unit: number;
  list: number;
  spec: number;
  tais: number;
  jan: number;
  tax: number;
  cat: number;
  priceTaxIn: boolean;
  listTaxIn: boolean;
};

const keyScore = (cell: string, keys: [string, number][]) => {
  const c = normalize(cell).toLowerCase();
  let best = 0;
  for (const [k, w] of keys) if (c.includes(k)) best = Math.max(best, w);
  return best;
};
// 品番らしい見出しほど高い点（「商品コード」より「品番」）。JAN・TAIS は品番とは別の列として読む
const CODE_KEYS: [string, number][] = [
  ['品番', 6],
  ['型番', 5],
  ['型式', 4],
  ['商品コード', 3],
  ['品目コード', 3],
  ['製品コード', 3],
  ['コード', 2],
];
const NAME_KEYS: [string, number][] = [
  ['商品名', 5],
  ['品名', 4],
  ['製品名', 4],
  ['名称', 3],
  ['品目', 2],
  ['商品', 1],
];
const MAKER_KEYS = ['メーカー', '製造元', '製造事業者'];
const UNIT_KEYS = ['単位', '入数'];
const LIST_KEYS = ['定価', '希望小売', '標準価格', '上代', 'ガイド価格', '小売価格', 'メーカー価格'];
const SPEC_KEYS = ['色', 'カラー', '規格', '仕様', 'サイズ'];
const TAX_KEYS = ['税区分', '課税', '非課税', '税率'];
const CAT_KEYS = ['種目', '分類', 'カテゴリ'];
// 仕切らしい見出しほど高い点（「定価」と「仕切」が両方あれば仕切を選ぶ）。「掛率」「UP率」など「率」の列は価格にしない。
// 定価の見出し（「希望小売価格」「小売価格」など）の列は、仕切にしない
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
  return keys.some((k) => c.includes(k.toLowerCase()));
};
const priceScore = (cell: string) => (normalize(cell).includes('率') ? 0 : keyScore(cell, PRICE_KEYS));
const isListHeader = (cell: string) => has(cell, LIST_KEYS) && keyScore(cell, PRICE_KEYS) < 5; // 「定価・売価」のように仕切の言葉もあれば定価にしない
const taxIn = (cell: string | undefined) => /税込/.test(normalize(cell));

export function columnCount(grid: Grid): number {
  return grid.reduce((n, r) => Math.max(n, r.length), 0);
}

const NO_COLUMNS = {code: -1, maker: -1, unit: -1, list: -1, spec: -1, tais: -1, jan: -1, tax: -1, cat: -1, priceTaxIn: false, listTaxIn: false};

/**
 * 見出しの行と、商品名・仕切・定価・品番などの列を推測する（画面で変えられる）。
 * 「定価」「売価」が2組あるとき（改定前・改定後）は、右の（新しい）方を使う。
 */
export function detectMapping(grid: Grid): Mapping {
  const cols = columnCount(grid);
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r];
    const m: Mapping = {header: r, name: -1, price: -1, ...NO_COLUMNS};
    let codeBest = 0;
    let nameBest = 0;
    let score = 0;
    row.forEach((cell, c) => {
      const t = normalize(cell);
      // 見出しは短い言葉。長い文（注意書き）は見出しにしない
      if (!t || t.length > 24) return;
      const low = t.toLowerCase();
      // TAIS・JAN は品番の列にしない（「TAISコード」「JANコード」に「コード」が入っているため先に見る）
      if (low.includes('tais')) {
        if (m.tais < 0) m.tais = c;
        return;
      }
      if (low.includes('jan')) {
        if (m.jan < 0) m.jan = c;
        return;
      }
      const cs = keyScore(cell, CODE_KEYS);
      const ns = keyScore(cell, NAME_KEYS);
      // 1つの列は1つの役目だけ（「商品コード」は商品名ではなく品番の候補。品番・商品名の列は価格の列にしない）
      if (cs > 0 && cs >= ns) {
        if (cs > codeBest) {
          codeBest = cs;
          m.code = c;
        }
        return;
      } else if (ns > 0 && !has(cell, CAT_KEYS)) {
        if (ns > nameBest) {
          nameBest = ns;
          m.name = c;
        }
        return;
      } else if (m.maker < 0 && has(cell, MAKER_KEYS)) m.maker = c;
      else if (m.unit < 0 && has(cell, UNIT_KEYS)) m.unit = c;
      else if (m.cat < 0 && has(cell, CAT_KEYS)) m.cat = c;
      else if (m.tax < 0 && has(cell, TAX_KEYS) && !/価格|金額|単価|定価/.test(t)) m.tax = c;
      else if (has(cell, SPEC_KEYS)) m.spec = c; // 色の列が2つ（色の記号・色の名前）なら右の方
      if (has(cell, LIST_KEYS)) {
        m.list = c;
        m.listTaxIn = taxIn(cell);
      }
      const s = isListHeader(cell) ? 0 : priceScore(cell);
      if (s > 2 && s >= score) {
        score = s;
        m.price = c;
        m.priceTaxIn = taxIn(cell);
      }
    });
    if (m.name >= 0 && (m.price >= 0 || m.list >= 0)) {
      // 仕切の見出しがなければ、定価より右の見出しのない列に金額が入っていればそれを使う。なければ仕切は空欄で取り込む
      if (m.price < 0) m.price = untitledPriceColumn(grid, r, m.list, new Set([m.name, m.code, m.maker, m.unit, m.spec, m.tais, m.jan, m.tax, m.cat]));
      return m;
    }
    // 商品名の列がなくても、品番と仕切があれば「仕切だけを入れる表」として読む
    if (m.code >= 0 && m.price >= 0) return {...m, name: -1};
  }

  // 見出しがないとき：数字の多い一番右の列を仕切、文字の長い列を商品名にする
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
  // 仕切の左どなりの数字の列が、ほとんどの行で仕切以上なら定価とみなす（「定価 4,800　仕切 3,360」の並び）
  const left = priceCols.length >= 2 ? priceCols[priceCols.length - 2].c : -1;
  return {
    header: -1,
    name,
    price,
    ...NO_COLUMNS,
    code: codeCol ? codeCol.c : -1,
    list: left >= 0 && mostlyAtLeast(grid, left, price) ? left : -1,
  };
}

/**
 * 定価の列より右にある見出しのない列のうち、定価のある行の半分以上に金額（1円以上）が入っている一番右の列。なければ -1。
 * 仕切の列の見出しが空の価格表があるため（今は空欄でも、あとで金額を入れて取り込めば仕切になる）
 */
function untitledPriceColumn(grid: Grid, header: number, list: number, taken: Set<number>): number {
  if (list < 0) return -1;
  let best = -1;
  for (let c = list + 1; c < columnCount(grid); c++) {
    if (taken.has(c) || normalize(grid[header]?.[c])) continue;
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

/** 寸法・色らしい文字（φ・×・mm など、かな・漢字）。英字だけのものは品番の続き */
const SPEC_LIKE = /[φΦ×*～~]|\d(mm|cm|m|kg|g|ml)(?![a-z])|[぀-ヿ一-鿿ｦ-ﾟ]/i;

/** 品番の列に「536-057 ブルー」のように品番と色・寸法が一緒に入っているか（半分以上の行） */
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

/** メーカー名：ファイル名か、表の上の方の文字に知っているメーカー名があれば使う */
const KNOWN_MAKERS: [RegExp, string][] = [
  [/アロン化成|安寿/, 'アロン化成'],
  [/パナソニック|panasonic|エイジフリー/i, 'パナソニック エイジフリー'],
  [/toto/i, 'TOTO'],
  [/積水|セキスイ/, '積水ホームテクノ'],
  [/幸和製作所|テイコブ|tacaof/i, '幸和製作所'],
  [/島製作所/, '島製作所'],
  [/星光医療器/, '星光医療器製作所'],
  [/イーストアイ/, 'イーストアイ'],
  [/矢崎|ヤザキ|yazaki/i, '矢崎化工'],
  [/ウチヱ/, 'ウチヱ'],
  [/リッチェル/, 'リッチェル'],
  [/シンエンス/, 'シンエンス'],
  [/モリトー/, 'モリトー'],
  [/パラマウント/, 'パラマウントベッド'],
  [/フランスベッド/, 'フランスベッド'],
  [/日進医療器/, '日進医療器'],
  [/竹虎/, '竹虎'],
  [/lixil|リクシル/i, 'LIXIL'],
];

export function guessMaker(texts: string[]): string {
  for (const t of texts) {
    const s = normalize(t);
    for (const [re, name] of KNOWN_MAKERS) if (re.test(s)) return name;
  }
  return '';
}

/** 仕入先：ファイル名などに問屋の名前があれば（販売受注簿作成ツールの発注先と同じ名前） */
export function guessSupplier(texts: string[], suppliers: string[]): string {
  for (const t of texts) {
    const s = normalize(t);
    const hit = suppliers.find((x) => x && s.includes(normalize(x)));
    if (hit) return hit;
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
  name: string; // 空なら「仕切だけを入れる行」（同じ品番の商品があるときだけ入れる）
  price: number | null; // 仕切（税抜。空欄なら null）
  listPrice: number | null; // 定価（税抜。なければ null）
  code: string;
  maker: string;
  unit: string;
  tais: string;
  jan: string;
  taxType: TaxType;
  taxKnown: boolean; // 表に税区分の列・「非課税」の印があった（なければ商品マスタの税区分を変えない）
  category: string; // 種目（表の分類の列・商品名から推測。手で直せる）
  sub: string;
  categoryByHand?: boolean; // 取り込みの確認で種目を手で選んだ
  warn: string; // 対象外と分かったときの理由（T字杖など）
  include: boolean; // 取り込む
  favorite: boolean; // ★お気に入り
};

/** 単位・入数の欄：「1個」「1台」は「個」「台」、数字だけ（入数「1」）なら空欄。「10枚」のように2つ以上入りのものはそのまま */
export function unitText(s: string): string {
  const t = normalize(s);
  return /^\d+$/.test(t) ? '' : t.replace(/^1 ?(?=[^\d./])/, '');
}

/** 税区分：「非課税」「8%」の印。なければ 10% */
export function taxTypeOf(...texts: string[]): TaxType {
  const s = normalize(texts.join(' '));
  if (/非課税|非 ?課/.test(s)) return '非課税';
  if (/(^|[^\d])8 ?%|軽減/.test(s)) return '8%';
  return '10%';
}

/** TAISコードを「5桁-6桁」にそろえる（11桁の数字なら区切りを入れる。そのほかはそのまま） */
export function taisText(s: string): string {
  const t = normalize(s).replace(/[\s－ー―]/g, '-');
  const digits = t.replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : t;
}

/** 税込の金額を税抜に（受注簿ツールと同じく四捨五入）。非課税はそのまま */
const exTax = (v: number | null, inTax: boolean, t: TaxType) =>
  v === null || !inTax || t === '非課税' ? v : Math.round(v / (t === '8%' ? 1.08 : 1.1));

const looksLikeHeader = (text: string) => NAME_KEYS.some(([k]) => k === text) || CODE_KEYS.some(([k]) => k === text.toLowerCase());

export function gridCandidates(grid: Grid, m: Mapping, defaultMaker: string): Candidate[] {
  const out: Candidate[] = [];
  const cell = (row: string[], c: number) => (c >= 0 ? normalize(row[c]) : '');
  const split = codeHasSpec(grid, m);
  grid.forEach((row, r) => {
    if (r <= m.header) return;
    let code = cell(row, m.code);
    let spec = m.spec >= 0 && m.spec !== m.code ? cell(row, m.spec) : '';
    if (split && code.includes(' ')) {
      // 「536-057 ブルー」→ 品番 536-057、色・寸法は商品名のうしろへ
      const at = code.indexOf(' ');
      spec = [code.slice(at + 1), spec].filter(Boolean).join(' ');
      code = code.slice(0, at);
    }
    const base = cell(row, m.name);
    const full = base && spec && !base.includes(spec) ? `${base} ${spec}` : base;
    // 商品名のうしろに品番がくり返されていれば外す
    const name = code && full.endsWith(` ${code}`) ? full.slice(0, -code.length - 1) : full;
    const taxType = taxTypeOf(cell(row, m.tax), m.tax >= 0 ? '' : name);
    const rawPrice = m.price >= 0 ? parsePrice(row[m.price]) : null;
    const rawList = m.list >= 0 ? parsePrice(row[m.list]) : null;
    if (!name && (!code || rawPrice === null)) return;
    if (looksLikeHeader(base) || looksLikeHeader(code)) return; // ページごとに繰り返される見出し
    // 品番の列がある表で、品番も金額もない行は、表の中の小見出し（「入浴用品」など）
    if (m.code >= 0 && !code && rawPrice === null && rawList === null) return;
    const price = exTax(rawPrice, m.priceTaxIn, taxType);
    const listPrice = exTax(rawList, m.listTaxIn, taxType);
    const unit = unitText(cell(row, m.unit));
    const g = guessCategory(name, cell(row, m.cat));
    // 仕切が空欄でも、定価があれば取り込む（仕切はあとで入れられる）。対象外と分かった商品（T字杖など）は最初はチェックしない
    const valid = (name !== '' || code !== '') && ((price ?? 0) > 0 || (listPrice ?? 0) > 0) && !g.warn;
    out.push({
      key: `g${r}`,
      row: r + 1,
      name,
      price: price !== null && price > 0 ? price : null,
      listPrice: listPrice !== null && listPrice > 0 ? listPrice : null,
      code,
      maker: cell(row, m.maker) || defaultMaker,
      unit,
      tais: m.tais >= 0 ? taisText(cell(row, m.tais)) : '',
      jan: m.jan >= 0 ? cell(row, m.jan).replace(/\D/g, '') : '',
      taxType,
      taxKnown: m.tax >= 0 || taxType !== '10%',
      category: g.category,
      sub: g.sub,
      warn: g.warn,
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
 * 重ならない語は、その列の見出しと重なる語（ほかの行のものも）が並ぶ範囲に入っていればその列。どの範囲にも入らなければ、
 *   左の列に見出しと重なる語が1つもない → 左の列（金額が右寄せで、見出しより右にあるとき）
 *   左の列と同じく文字 → 左の列（商品名の続き）
 *   それ以外（金額の列のすぐ右の印など）→ 見出しのない列
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

const UNIT_TOKEN = /^(本|個|台|枚|組|式|セット|set|ケース|箱|袋|巻|足|対|ペア)$/i;

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
  // 価格のうしろにある「台」「個」などは単位
  let unit = '';
  if (lastPriceAt >= 0 && words.length - lastPriceAt === 1 && UNIT_TOKEN.test(words[words.length - 1])) {
    unit = words.pop() as string;
  }
  // 品番：最初の3語の中の、英数字とハイフンなどだけでできた語（「600mm」のような寸法は除く）
  let code = '';
  const at = words.slice(0, 3).findIndex(isCode);
  if (at >= 0 && words.length > 1) code = words.splice(at, 1)[0];
  return {code, name: words.join(' '), unit, prices};
}

/**
 * nthFromRight：1＝行の一番右の数字を仕切にする、2＝右から2番目 …
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
    const g = guessCategory(name);
    out.push({
      key: `l${i}`,
      row: i + 1,
      name,
      price,
      listPrice: pick(prices, listNthFromRight),
      code,
      maker: defaultMaker,
      unit,
      tais: '',
      jan: '',
      taxType: taxTypeOf(line),
      taxKnown: taxTypeOf(line) !== '10%',
      category: g.category,
      sub: g.sub,
      warn: g.warn,
      include: price !== null && price > 0 && !g.warn,
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

// ---------------------------------------------------------------- 商品マスタへの取り込み

const norm = (s: string) => normalize(s).toLowerCase();
const codeKey = (maker: string, code: string) => `${norm(maker)}|${norm(code)}`;
const nameKey = (maker: string, name: string) => `${norm(maker)}|${norm(name)}`;

export type MergeResult = {list: Product[]; added: number; updated: number; unchanged: number};

/**
 * 同じメーカーで品番（品番がなければ商品名）が同じものは、新しい価格に書き換える（★・手で選んだ種目・よく使う回数はそのまま残す）。
 * 新しい仕切り一覧表に差し替えるときも、★を付け直さなくてよい。
 * 同じ品番で色・寸法の違う商品は、商品名で分けて別々に残す。
 * 仕切・定価は、表に金額があるときだけ書き換える（空欄なら今の金額のまま）。
 * 商品名のない行（仕切だけの表）は、同じ品番の商品が1つだけあるときに仕切を入れる。
 * supplier：このファイルの仕入先（空でなければ、取り込んだ商品の仕入先にする）
 */
export function mergeProducts(existing: Product[], incoming: Candidate[], source = '', supplier = '', now = Date.now()): MergeResult {
  const list = existing.map((p) => ({...p}));
  const byCode = new Map<string, number[]>();
  const byName = new Map<string, number>();
  const remember = (p: Product, i: number) => {
    if (p.code) byCode.set(codeKey(p.maker, p.code), [...(byCode.get(codeKey(p.maker, p.code)) ?? []), i]);
    else byName.set(nameKey(p.maker, p.name), i);
  };
  list.forEach(remember);
  const ok = (c: Candidate) => c.include && (c.name !== '' || c.code !== '') && (c.price !== null || c.listPrice !== null);
  // 取り込む表の中で、同じ品番に商品名がいくつあるか（2つ以上なら色・寸法違いの別の商品）
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
    // 商品名だけ変わった（同じ品番の商品が1つだけで、表の中でもその品番は1種類）なら、その商品を書き換える
    return same.length === 1 && (names.get(codeKey(c.maker, c.code))?.size ?? 0) <= 1 ? same[0] : undefined;
  };
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const c of incoming) {
    if (!ok(c)) continue;
    const at = find(c);
    if (at !== undefined) {
      const p = list[at];
      const next: Product = {
        ...p,
        name: c.name || p.name,
        cost: c.price ?? p.cost,
        listPrice: c.listPrice ?? p.listPrice,
        unit: c.unit || p.unit,
        tais: c.tais || p.tais,
        jan: c.jan || p.jan,
        taxType: c.taxKnown ? c.taxType : p.taxType,
        supplier: supplier || p.supplier,
        favorite: p.favorite || c.favorite,
      };
      if (c.categoryByHand) {
        // 取り込みの確認で選んだ種目は、手で選んだものとして残す
        next.category = c.category;
        next.sub = c.sub;
        next.categoryByHand = true;
      } else if (!p.categoryByHand && c.category) {
        // 自動の種目は、新しい表で決まったときだけ書き換える（手で選んだ種目は変えない）
        next.category = c.category;
        next.sub = c.sub;
      }
      const changed = (['name', 'cost', 'listPrice', 'unit', 'tais', 'jan', 'taxType', 'supplier', 'category', 'sub', 'categoryByHand', 'favorite'] as const).some(
        (k) => next[k] !== p[k],
      );
      list[at] = changed ? {...next, source: source || p.source, updatedAt: now} : p;
      if (changed) updated++;
      else unchanged++;
    } else {
      if (!c.name) continue; // 仕切だけの行で、商品マスタにない（または同じ品番が2つ以上ある）品番
      const p: Product = {
        id: uid('p'),
        name: c.name,
        maker: c.maker,
        code: c.code,
        tais: c.tais,
        jan: c.jan,
        category: c.category,
        sub: c.sub,
        categoryByHand: !!c.categoryByHand,
        listPrice: c.listPrice ?? 0,
        cost: c.price ?? 0,
        taxType: c.taxType,
        unit: c.unit,
        supplier,
        favorite: c.favorite,
        useCount: 0,
        lastUsedAt: 0,
        source,
        updatedAt: now,
      };
      list.push(p);
      remember(p, list.length - 1);
      added++;
    }
  }
  return {list, added, updated, unchanged};
}

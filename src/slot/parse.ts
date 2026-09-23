/**
 * みんレポ等のスロットデータを取り込む。
 *
 * 次の3形式を受け付ける（どれかを自動判定する）。
 * - ページのHTMLソース（<table> を抜き出す。表に機種列がなければ直前の見出しを機種名とみなす）
 * - ブラウザで表を選択してコピーしたテキスト（タブ区切り / 2つ以上の空白区切り）
 * - このツールが書き出すCSV（date,store,machine,unit,games,diff,bb,rb）
 *
 * 列は見出しの名前で探すので、列の並び順が変わっても読める。
 * 台番と差枚の列がない表（機種別平均・末尾別などの集計表）は読み飛ばす。
 */
import type {SlotRow} from './types';

type Field = 'unit' | 'machine' | 'games' | 'diff' | 'bb' | 'rb' | 'date' | 'store';

// 見出しの表記ゆれ。上から順に照合し、最初に一致したものを採用する
const HEADER_PATTERNS: [Field, RegExp][] = [
  ['date', /^(date|日付)$/i],
  ['store', /^(store|店舗|店名|ホール)$/i],
  ['unit', /^(unit|台番号?|台no\.?|台ナンバー|no\.?)$/i],
  ['machine', /^(machine|機種名?|機種名称)$/i],
  ['diff', /^(diff|差枚数?|推定差枚|差玉|差枚\(推定\)|最終差枚)$/i],
  ['games', /^(games|g数|総g数?|ゲーム数|総ゲーム数?|回転数|総回転数?|累計g数?|g)$/i],
  ['bb', /^(bb|big|ビッグ|bb回数)$/i],
  ['rb', /^(rb|reg|レギュラー|rb回数)$/i],
];

function normalizeHeader(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\s　]/g, '')
    .replace(/[▲▼↑↓⇅]/g, '')
    .toLowerCase();
}

function headerField(cell: string): Field | null {
  const h = normalizeHeader(cell);
  for (const [field, re] of HEADER_PATTERNS) if (re.test(h)) return field;
  return null;
}

/** "+1,234枚" "−1234" "3,210G" "1/245.3"(確率) などから数値を取り出す。取り出せなければ null */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.normalize('NFKC').replace(/[−–—ー‐]/g, '-').replace(/[,\s枚回gG台]/g, '');
  if (s === '' || s === '-' || s === '--') return null;
  const m = s.match(/^([+-]?)(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const v = Number(m[2]);
  return m[1] === '-' ? -v : v;
}

/** 表の見出し行から 列番号 → 項目 の対応を作る。台番と差枚がなければ null */
function mapHeader(cells: string[]): Map<Field, number> | null {
  const map = new Map<Field, number>();
  cells.forEach((c, i) => {
    const f = headerField(c);
    if (f && !map.has(f)) map.set(f, i);
  });
  return map.has('unit') && map.has('diff') ? map : null;
}

interface Context {
  date: string;
  store: string;
}

function rowFromCells(cells: string[], map: Map<Field, number>, machineHint: string, ctx: Context): SlotRow | null {
  const get = (f: Field) => (map.has(f) ? cells[map.get(f)!] : undefined);
  const unit = parseNumber(get('unit'));
  const diff = parseNumber(get('diff'));
  if (unit == null || diff == null || !Number.isInteger(unit) || unit <= 0) return null;
  // 機種が分からない表でも台のデータは捨てない
  const machine = (get('machine') ?? machineHint).trim() || '機種不明';
  const date = normalizeDate(get('date') ?? '') ?? ctx.date;
  const store = (get('store') ?? '').trim() || ctx.store;
  return {
    date,
    store,
    machine: cleanMachine(machine),
    unit,
    games: parseNumber(get('games')),
    diff,
    bb: parseNumber(get('bb')),
    rb: parseNumber(get('rb')),
  };
}

function cleanMachine(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/[(（]\s*\d+\s*台\s*[)）]\s*$/, '') // 「(4台)」のような台数表記を落とす
    .trim();
}

// ---------------------------------------------------------------- 日付・店名

/** "2025/9/22" "2025-09-22" "2025年9月22日" → "2025-09-22" */
export function normalizeDate(s: string): string | null {
  const t = s.normalize('NFKC');
  const m = t.match(/(\d{4})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/**
 * ページタイトル等から日付と店名を推定する。
 * みんレポのタイトルは「2025/9/22(月) スペース666 | スロット差枚データ詳細 – みんレポ」の形。
 * 年が省略された「9/6(土) 店名」の場合は fallbackYear を補う。
 */
export function detectMeta(text: string, fallbackYear: number): {date: string | null; store: string | null} {
  const t = text.normalize('NFKC');
  const title = t.match(/<title>([^<]*)<\/title>/i)?.[1] ?? t.slice(0, 2000);
  const m = title.match(/(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})\s*\([月火水木金土日](?:・祝)?\)\s*([^|｜\n<]+?)\s*(?:[|｜]|データ|$)/m);
  if (m) {
    const year = m[1] ?? String(fallbackYear);
    return {
      date: `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      store: m[4].trim() || null,
    };
  }
  return {date: normalizeDate(title), store: null};
}

// ---------------------------------------------------------------- HTML

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * HTMLから表を取り出す（DOMに依存しないので Node でも動く）。
 * 表に機種列がない場合に備えて、各表の直前にある見出し(h1〜h6 / caption)の文字も返す。
 */
export function extractHtmlTables(html: string): {heading: string; rows: string[][]}[] {
  const src = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const tokenRe = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|<table[^>]*>([\s\S]*?)<\/table>/gi;
  const out: {heading: string; rows: string[][]}[] = [];
  let heading = '';
  for (const m of src.matchAll(tokenRe)) {
    if (m[1] != null) {
      heading = stripTags(m[1]);
      continue;
    }
    const body = m[2];
    const caption = body.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    const rows: string[][] = [];
    for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => stripTags(c[1]));
      if (cells.length) rows.push(cells);
    }
    out.push({heading: caption ? stripTags(caption[1]) : heading, rows});
  }
  return out;
}

function parseTables(tables: {heading: string; rows: string[][]}[], ctx: Context): SlotRow[] {
  const result: SlotRow[] = [];
  for (const t of tables) {
    let map: Map<Field, number> | null = null;
    // 表の中で機種名だけの行（見出し行）が挟まる形式にも対応する
    let machineHint = t.heading;
    for (const cells of t.rows) {
      const header = mapHeader(cells);
      if (header) {
        map = header;
        continue;
      }
      if (!map) continue;
      const row = rowFromCells(cells, map, machineHint, ctx);
      if (row) result.push(row);
      else if (cells.length === 1 || cells.filter((c) => c !== '').length === 1) {
        const name = cells.find((c) => c !== '')!;
        if (parseNumber(name) == null) machineHint = name;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------- テキスト / CSV

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  if (line.includes(',') && !/\d,\d{3}/.test(line)) return splitCsvLine(line);
  return line.trim().split(/\s{2,}|　+/).map((c) => c.trim());
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseText(text: string, ctx: Context): SlotRow[] {
  const lines = text.split(/\r?\n/);
  const isCsv = /^\s*date\s*,\s*store\s*,/i.test(lines[0] ?? '');
  const tableRows = lines
    .map((l) => (isCsv ? splitCsvLine(l) : splitLine(l)))
    .filter((cells) => cells.some((c) => c !== ''));
  return parseTables([{heading: '', rows: tableRows}], ctx);
}

// ---------------------------------------------------------------- 入口

export interface ParseResult {
  rows: SlotRow[];
  date: string | null;
  store: string | null;
}

/**
 * 貼り付け／読み込んだ内容を解析する。
 * 日付・店名はページタイトル等から読み取り、読み取れないときだけ opts.date / opts.store を使う
 * （入力欄に前回の日付が残っていても、別の日のページを取り違えないため）。CSVは行ごとの値を使う。
 */
export function parseInput(
  content: string,
  opts: {date?: string; store?: string; fallbackYear?: number} = {},
): ParseResult {
  const meta = detectMeta(content, opts.fallbackYear ?? new Date().getFullYear());
  const date = meta.date || opts.date || '';
  const store = meta.store || opts.store || '';
  const ctx = {date, store};
  const looksHtml = /<table[\s>]/i.test(content);
  const rows = looksHtml ? parseTables(extractHtmlTables(content), ctx) : parseText(content, ctx);
  return {rows: dedupe(rows), date: date || null, store: store || null};
}

/** 同じ日・同じ店・同じ台番が重複した場合は後に出てきたものを残す */
export function dedupe(rows: SlotRow[]): SlotRow[] {
  const map = new Map<string, SlotRow>();
  for (const r of rows) map.set(`${r.date}|${r.store}|${r.unit}`, r);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.unit - b.unit);
}

// ---------------------------------------------------------------- 書き出し

const CSV_HEADER = 'date,store,machine,unit,games,diff,bb,rb';

function csvCell(v: string | number | null): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: SlotRow[]): string {
  return [
    CSV_HEADER,
    ...rows.map((r) =>
      [r.date, r.store, r.machine, r.unit, r.games, r.diff, r.bb, r.rb].map(csvCell).join(','),
    ),
  ].join('\n');
}

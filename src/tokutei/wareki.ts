// 和暦（元号）の日付。申請書の生年月日（「明・大・昭」を丸で囲む・「昭和31年06月10日生」）と、申請日などの令和の日付に使う。
// 生年月日はいろいろな打ち方を読む（ユーザーの指示「入力できるところ…無駄を省けるようにする」：和暦でも西暦でも、区切りがなくても入れられる）。

export type EraName = '明治' | '大正' | '昭和' | '平成' | '令和';

/** 元号と、はじまりの日（この日から）。新しい順 */
const ERAS: {name: EraName; short: string; alpha: string; start: string}[] = [
  {name: '令和', short: '令', alpha: 'R', start: '2019-05-01'},
  {name: '平成', short: '平', alpha: 'H', start: '1989-01-08'},
  {name: '昭和', short: '昭', alpha: 'S', start: '1926-12-25'},
  {name: '大正', short: '大', alpha: 'T', start: '1912-07-30'},
  {name: '明治', short: '明', alpha: 'M', start: '1868-01-25'},
];

export type Wareki = {era: EraName; short: string; y: number; m: number; d: number};

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

/** 本当にある日か（2月30日などは null） */
function validIso(y: number, m: number, d: number): string | null {
  if (!(y >= 1868 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? isoOf(y, m, d) : null;
}

/** 'YYYY-MM-DD' → 和暦（その日の元号）。読めなければ null */
export function warekiOf(iso: string): Wareki | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const era = ERAS.find((e) => iso >= e.start);
  if (!era) return null;
  const y = Number(m[1]) - Number(era.start.slice(0, 4)) + 1;
  return {era: era.name, short: era.short, y, m: Number(m[2]), d: Number(m[3])};
}

/** 和暦の年（「元」は1年） → 'YYYY-MM-DD'。その元号の期間にない日なら null */
export function fromWareki(eraKey: string, y: number, m: number, d: number): string | null {
  const era = ERAS.find((e) => e.name === eraKey || e.short === eraKey || e.alpha === eraKey.toUpperCase());
  if (!era || y < 1) return null;
  const iso = validIso(Number(era.start.slice(0, 4)) + y - 1, m, d);
  if (!iso) return null;
  // 元号の期間（次の元号のはじまりの前日まで）の中か
  const next = ERAS[ERAS.indexOf(era) - 1];
  return iso >= era.start && (!next || iso < next.start) ? iso : null;
}

/**
 * 打った日付を 'YYYY-MM-DD' にする。読めなければ null。
 * 読める形：「S31.6.10」「昭31/6/10」「昭和31年6月10日」「昭和元年…」「1956/6/10」「1956-06-10」「1956年6月10日」「19560610」「S310610」（全角も）
 */
export function parseDateText(text: string): string | null {
  const t = (text || '').normalize('NFKC').replace(/\s+/g, '').replace(/元年/, '1年').replace(/生$/, '');
  if (!t) return null;
  // 和暦：元号（漢字・頭の1字・M/T/S/H/R）＋ 年 月 日
  const w = /^(明治|大正|昭和|平成|令和|[明大昭平令]|[MTSHRmtshr])(\d{1,2})[年./\-・](\d{1,2})[月./\-・](\d{1,2})日?$/.exec(t);
  if (w) return fromWareki(w[1], Number(w[2]), Number(w[3]), Number(w[4]));
  const w6 = /^(明治|大正|昭和|平成|令和|[明大昭平令]|[MTSHRmtshr])(\d{2})(\d{2})(\d{2})$/.exec(t);
  if (w6) return fromWareki(w6[1], Number(w6[2]), Number(w6[3]), Number(w6[4]));
  // 西暦
  const s = /^(\d{4})[年./\-](\d{1,2})[月./\-](\d{1,2})日?$/.exec(t);
  if (s) return validIso(Number(s[1]), Number(s[2]), Number(s[3]));
  const s8 = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (s8) return validIso(Number(s8[1]), Number(s8[2]), Number(s8[3]));
  return null;
}

/** 和暦の書き方：「昭和31年6月10日」（元年は「元年」） */
export function warekiLabel(iso: string): string {
  const w = warekiOf(iso);
  return w ? `${w.era}${w.y === 1 ? '元' : w.y}年${w.m}月${w.d}日` : '';
}

/** 満年齢（today の日に） */
export function ageOn(iso: string, today: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today || '');
  if (!b || !n) return null;
  let age = Number(n[1]) - Number(b[1]);
  if (`${n[2]}${n[3]}` < `${b[2]}${b[3]}`) age--;
  return age >= 0 ? age : null;
}

/** 年度（4月〜翌年3月）：2026-03-31 → 2025、2026-04-01 → 2026 */
export function fiscalYearOf(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso || '');
  if (!m) return null;
  return Number(m[2]) >= 4 ? Number(m[1]) : Number(m[1]) - 1;
}

// 小さな共通部品（ID・日付・金額の表示）

export function uid(prefix = ''): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
  } catch {
    /* file:// などで使えないときは下の方法で作る */
  }
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 3,800 のような桁区切り（マイナスは -1,000） */
export function yen(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('ja-JP');
}

/** 単価・数量の表示（小数があるときだけ小数を出す。digits は小数の桁数の上限） */
export function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? n.toLocaleString('ja-JP') : n.toLocaleString('ja-JP', {maximumFractionDigits: digits});
}

const pad = (n: number) => String(n).padStart(2, '0');

export function todayIso(): string {
  return isoDate(Date.now());
}

/** 時刻（ミリ秒）の日付 'YYYY-MM-DD'（この端末の時刻で） */
export function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function thisMonth(): string {
  return todayIso().slice(0, 7);
}

/** 'YYYY-MM' に月を足す */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 'YYYY-MM' → 2026年10月 */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return '';
  return `${y}年${m}月`;
}

/** 'YYYY-MM-DD' → 2026年10月5日 */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 'YYYY-MM-DD' → 10/5 */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** 月末日 'YYYY-MM-DD' */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 担当者の名字（「土居 翔太」→「土居」）。請求書・一覧など欄のせまいところに出す */
export function staffShort(name: string): string {
  return name.trim().split(/[\s　]+/)[0] ?? '';
}

/** 担当者のフルネーム（見積書に出す）。名字だけで入っている様邸でも、候補にその名字のフルネームがあればそれにする */
export function staffFull(name: string, list: string[]): string {
  const n = name.trim();
  if (!n || list.includes(n)) return n;
  return list.find((x) => staffShort(x) === n) ?? n;
}

/** 「手摺」「手摺り」は「手すり」と書く（ユーザーの指示「手摺ではなく、手すり」）。取り込む部材リストの商品名と、前に保存した名前に使う */
export function tesuri(s: string): string {
  return s.replace(/手摺り?/g, '手すり');
}

/** 検索用：全角半角・大文字小文字をそろえる */
export function searchKey(s: string): string {
  return (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 空白区切りのすべての語を含むか */
export function matchesAll(haystack: string, query: string): boolean {
  const terms = searchKey(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const h = searchKey(haystack);
  return terms.every((t) => h.includes(t));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

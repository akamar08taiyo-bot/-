// 小さな共通部品（ID・日付・金額の表示・検索）。住宅改修 見積書アプリ（src/sasaoka/util.ts）を手本に、このアプリで使うものだけを持つ

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

const pad = (n: number) => String(n).padStart(2, '0');

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 2026年10月5日 */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 'YYYY-MM-DD' → 令和8年10月5日（2019年5月1日から令和） */
export function reiwaLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const y = Number(m[1]);
  if (y < 2019) return dateLabel(iso);
  const r = y - 2018;
  return `令和${r === 1 ? '元' : r}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 担当者の名字（「土居 翔太」→「土居」）。販売受注簿の営業担当など、名字だけの欄に使う */
export function staffShort(name: string): string {
  return name.trim().split(/[\s　]+/)[0] ?? '';
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

/**
 * フリガナ：ひらがな・半角カタカナを全角カタカナにする（ユーザーの指示「特定福祉用具の申請書のフリガナは、ひらがなでうってもカタカナに自動変換」2026-10-26。
 * 住宅改修の src/sasaoka/util.ts の toKatakana と同じ）
 */
export function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096\u309d\u309e]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[\uff66-\uff9f]+/g, (h) => h.normalize('NFKC'));
}

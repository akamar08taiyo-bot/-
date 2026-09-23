/** 金額・金利の表示フォーマット（すべて日本円前提） */

const yenFormatter = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 0});

/** 12345678 → "12,345,678円" */
export function formatYen(value: number): string {
  return `${yenFormatter.format(Math.round(value))}円`;
}

/** 44030244 → "4,403万円"（小数第1位まで表示したい場合は digits を指定） */
export function formatMan(value: number, digits = 0): string {
  const man = value / 10000;
  return `${man.toLocaleString('ja-JP', {minimumFractionDigits: digits, maximumFractionDigits: digits})}万円`;
}

/** 差額を符号付きで表示 */
export function formatSignedMan(value: number, digits = 0): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${formatMan(Math.abs(value), digits)}`;
}

/** 1.25 → "1.25%" */
export function formatRate(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

/** 0.25 → "+0.25%" */
export function formatSignedRate(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** 区間ラベル（"1〜5年目"） */
export function formatPeriod(fromYear: number, toYear: number): string {
  const from = Math.round(fromYear);
  const to = Math.round(toYear);
  return from === to ? `${from}年目` : `${from}〜${to}年目`;
}

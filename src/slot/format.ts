const intFmt = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 0});

/** 1234 → "+1,234"、-50 → "−50" */
export function signed(v: number): string {
  const r = Math.round(v);
  if (r === 0) return '±0';
  return `${r > 0 ? '+' : '−'}${intFmt.format(Math.abs(r))}`;
}

export function int(v: number | null | undefined): string {
  return v == null ? '−' : intFmt.format(Math.round(v));
}

/** 0.534 → "53.4%" */
export function pct(v: number | null | undefined, digits = 1): string {
  return v == null ? '−' : `${(v * 100).toFixed(digits)}%`;
}

/** "2026-09-22" → "9/22(火)" */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const w = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${w})`;
}

/** 差枚の色（勝ち=青、負け=赤。色だけに頼らないよう符号も必ず出す） */
export function diffClass(v: number): string {
  return v > 0 ? 'text-sky-700' : v < 0 ? 'text-rose-700' : 'text-slate-500';
}

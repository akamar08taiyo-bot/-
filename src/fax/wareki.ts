/** input[type=date] と同じ 'YYYY-MM-DD' 形式で、端末のローカル日付の今日を返す */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 'YYYY-MM-DD' を「令和8年10月14日」の形にする。
 * new Date('YYYY-MM-DD') はUTC扱いで日付がずれることがあるため、数値に分解して扱う。
 */
export function formatWareki(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const md = `${m}月${d}日`;

  // 令和は2019年5月1日から
  if (y > 2019 || (y === 2019 && m >= 5)) {
    const n = y - 2018;
    return `令和${n === 1 ? '元' : n}年${md}`;
  }
  // 平成は1989年1月8日から（過去日付を入れた場合の保険）
  if (y > 1989 || (y === 1989 && (m > 1 || d >= 8))) {
    const n = y - 1988;
    return `平成${n === 1 ? '元' : n}年${md}`;
  }
  return `${y}年${md}`;
}

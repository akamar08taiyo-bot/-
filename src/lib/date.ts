export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateJa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

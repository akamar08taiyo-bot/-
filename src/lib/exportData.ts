// 設定画面の「データをエクスポート（JSON/CSV）」用ユーティリティ（10-6）。
// データは端末のlocalStorageにのみ保存されるため、消去・機種変更に備えた手動バックアップを可能にする。

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAsJson(collections: Record<string, unknown[]>) {
  const date = new Date().toISOString().slice(0, 10);
  download(
    `health-app-backup-${date}.json`,
    JSON.stringify(collections, null, 2),
    'application/json',
  );
}

export function exportCollectionAsCsv<T extends object>(name: string, rows: T[]) {
  if (rows.length === 0) return;
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const escape = (value: unknown) => {
    const s = value == null ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => escape((row as Record<string, unknown>)[h])).join(','),
    ),
  ];
  const date = new Date().toISOString().slice(0, 10);
  download(`${name}-${date}.csv`, lines.join('\n'), 'text/csv');
}

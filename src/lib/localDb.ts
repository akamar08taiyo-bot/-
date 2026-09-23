// この端末のブラウザ（localStorage）にのみデータを保存する。サーバー・アカウントは不要。
// 別の端末・ブラウザとはデータを共有しない。設定画面のエクスポート機能で定期バックアップを推奨。

const PREFIX = 'health-app:';

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function notify(path: string) {
  listeners.get(path)?.forEach((l) => l());
}

export function subscribe(path: string, listener: Listener): () => void {
  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path)!.add(listener);
  return () => listeners.get(path)?.delete(listener);
}

if (typeof window !== 'undefined') {
  // 別タブでの変更もこのタブに反映する。
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(PREFIX)) {
      notify(e.key.slice(PREFIX.length));
    }
  });
}

function readRaw<T>(path: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + path);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (err) {
    console.error(`localStorage読み込みに失敗しました: ${path}`, err);
    return fallback;
  }
}

function writeRaw(path: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + path, JSON.stringify(value));
  } catch (err) {
    console.error(`localStorage書き込みに失敗しました: ${path}`, err);
  }
  notify(path);
}

export function getCollection<T>(path: string): T[] {
  return readRaw<T[]>(path, []);
}

export function addItem<T extends object>(path: string, item: T): T & {id: string} {
  const withId = {...item, id: crypto.randomUUID()} as T & {id: string};
  const items = getCollection<T & {id: string}>(path);
  writeRaw(path, [...items, withId]);
  return withId;
}

// setDocの上書き相当。既存idがあれば更新、なければ新規追加（date等をidに使う場合向け）。
export function setItemWithId<T extends object>(path: string, id: string, patch: T) {
  const items = getCollection<T & {id: string}>(path);
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    const next = [...items];
    next[idx] = {...next[idx], ...patch, id};
    writeRaw(path, next);
  } else {
    writeRaw(path, [...items, {...patch, id} as T & {id: string}]);
  }
}

export function updateItem<T extends {id: string}>(path: string, id: string, patch: Partial<T>) {
  const items = getCollection<T>(path);
  writeRaw(
    path,
    items.map((i) => (i.id === id ? {...i, ...patch} : i)),
  );
}

export function removeItem(path: string, id: string) {
  const items = getCollection<{id: string}>(path);
  writeRaw(
    path,
    items.filter((i) => i.id !== id),
  );
}

export function getDocValue<T>(path: string, fallback: T): T {
  return readRaw<T>(path, fallback);
}

export function setDocValue<T>(path: string, value: T) {
  writeRaw(path, value);
}

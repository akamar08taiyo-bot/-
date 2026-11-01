// 常時同期（cloud/engine.ts）の端末の側：アプリの保存場所（IndexedDB）を、様邸・案件の1件ずつ・まとまりで読み書きする。
// 住宅改修（このアプリ。storage.ts）と特定福祉用具（tokutei/ のアプリ。🛁 のタブの中）は、どちらも「kv」の入れ物に項目ごと（jobs・materials…）と、
// 保存するたびに変える印（stamp:項目名）を持つ。クラウドから届いたものを書いたら印を変え、開いている画面に BroadcastChannel で知らせる
// （画面はその項目を読み直す。まだ保存していない変更があれば、保存するときに3つくらべでまとめる＝useStore.ts）。
// 同期の覚え（前にそろえた中身・どこまで読んだか・送った写真・鍵）は、この端末だけの別のデータベース（taiyo-jutaku-cloud）に持つ。

import {getPhotos, photoKeys, putPhotoAs} from '../photos.ts';
import type {Base, Coll, PhotoStore, Source, StateStore} from './engine.ts';

/** アプリの保存場所（名前・変更を知らせる BroadcastChannel の名前）。storage.ts・特定福祉用具の storage.ts と同じ */
export const JUTAKU_DB = {name: 'taiyo-sasaoka-shikiri', channel: 'taiyo-sasaoka-shikiri'};
export const TOKUTEI_DB = {name: 'taiyo-tokutei', channel: 'taiyo-tokutei'};
type Db = typeof JUTAKU_DB;
const STORE = 'kv';
const STAMP = 'stamp:';

const opened = new Map<string, Promise<IDBDatabase>>();

/** kv の入れ物のあるデータベースを開く（特定福祉用具をまだ開いたことのない端末では、ここで同じ形に作る） */
export function openKv(name: string, store = STORE): Promise<IDBDatabase> {
  let p = opened.get(name);
  if (!p) {
    p = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
      };
      req.onsuccess = () => {
        const db = req.result;
        // ほかのタブが新しい版で開こうとしたら閉じる（こちらがつかんだままにしない）
        db.onversionchange = () => {
          db.close();
          opened.delete(name);
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error(`${name} を開けません`));
      req.onblocked = () => reject(new Error(`${name} を開けません（ほかのタブ）`));
    });
    opened.set(name, p);
    p.catch(() => opened.delete(name));
  }
  return p;
}

async function readKey(db: Db, key: string): Promise<unknown> {
  const d = await openKv(db.name);
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
  });
}

const newStamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** 1つの項目を、読んで書きかえる（1つのトランザクション。間にアプリの保存は入らない）。印を変えて、開いている画面に知らせる */
async function updateKey(db: Db, key: string, fn: (cur: unknown) => unknown): Promise<void> {
  const d = await openKv(db.name);
  const stamp = newStamp();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const r = store.get(key);
    r.onsuccess = () => {
      store.put(fn(r.result), key);
      store.put(stamp, STAMP + key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('保存が中断されました'));
  });
  try {
    // 知らせる BroadcastChannel は開いたままにする（送ってすぐ閉じると、同じページの画面に届かないことがあった）
    let ch = channels.get(db.channel);
    if (!ch) channels.set(db.channel, (ch = new BroadcastChannel(db.channel)));
    ch.postMessage({from: CLOUD_FROM, key, stamp});
  } catch {
    /* 知らせられなくても、画面に戻ったときに印を見て読み直す */
  }
}
const channels = new Map<string, BroadcastChannel>();

/** 同期が書いたことを知らせるときの送り主（同期は自分の知らせでは動かない） */
export const CLOUD_FROM = 'cloud';

const idOf = (x: unknown): string | null => (x && typeof x === 'object' && typeof (x as {id?: unknown}).id === 'string' ? (x as {id: string}).id : null);

/** 並びの項目（様邸 jobs・特定福祉用具の案件 sales）を1件ずつ。並びの順はそのまま、新しいものはうしろに */
export function listSource(coll: Coll, db: Db, key: string): Source {
  return {
    coll,
    async read() {
      const v = await readKey(db, key);
      const out = new Map<string, unknown>();
      if (Array.isArray(v)) for (const x of v) if (idOf(x)) out.set(idOf(x)!, x);
      return out;
    },
    async write(changes) {
      await updateKey(db, key, (cur) => {
        const list = Array.isArray(cur) ? cur : [];
        const left = new Map(changes);
        const out: unknown[] = [];
        for (const x of list) {
          const id = idOf(x);
          if (id && left.has(id)) {
            const v = left.get(id);
            left.delete(id);
            if (v !== undefined) out.push(v);
          } else out.push(x);
        }
        for (const v of left.values()) if (v !== undefined) out.push(v);
        return out;
      });
    },
  };
}

/** まとまり（部材リスト・施工費・常用のセット・設定、特定福祉用具の商品・設定）。クラウドの id → 保存場所と項目 */
export const KEY_ITEMS: Record<string, {db: Db; key: string}> = {
  'j.materials': {db: JUTAKU_DB, key: 'materials'},
  'j.labor': {db: JUTAKU_DB, key: 'labor'},
  'j.kits': {db: JUTAKU_DB, key: 'kits'},
  'j.settings': {db: JUTAKU_DB, key: 'settings'},
  't.products': {db: TOKUTEI_DB, key: 'products'},
  't.settings': {db: TOKUTEI_DB, key: 'settings'},
};

export function keysSource(): Source {
  return {
    coll: 'keys',
    async read() {
      const out = new Map<string, unknown>();
      for (const [id, {db, key}] of Object.entries(KEY_ITEMS)) {
        const v = await readKey(db, key);
        if (v !== undefined) out.set(id, v);
      }
      return out;
    },
    async write(changes) {
      for (const [id, v] of changes) {
        const item = KEY_ITEMS[id];
        if (item && v !== undefined) await updateKey(item.db, item.key, () => v); // まとまりは消さない
      }
    },
  };
}

/** 同期する保存場所のすべて */
export const allSources = (): Source[] => [listSource('jobs', JUTAKU_DB, 'jobs'), listSource('sales', TOKUTEI_DB, 'sales'), keysSource()];

/** 写真（photos.ts の IndexedDB。番号のまま入れる） */
export const photoStore: PhotoStore = {
  ids: () => photoKeys(),
  async get(id) {
    const p = (await getPhotos([id])).get(id);
    return p ? {blob: p.blob, w: p.w, h: p.h} : null;
  },
  put: (id, blob, w, h) => putPhotoAs({id, blob, w, h}),
};

// ---------------------------------------------------------------- 同期の覚え（この端末だけ）

const STATE_DB = 'taiyo-jutaku-cloud';
const STATE_STORES = ['config', 'base', 'uploaded'] as const;

function openState(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STATE_DB, 1);
    req.onupgradeneeded = () => {
      for (const s of STATE_STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('同期の覚えを開けません'));
  });
}
let stateDb: Promise<IDBDatabase> | null = null;
const state = () => (stateDb ??= openState().catch((e) => ((stateDb = null), Promise.reject(e))));

function tx<T>(store: (typeof STATE_STORES)[number], mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return state().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        t.oncomplete = () => resolve(r ? r.result : undefined);
        t.onerror = () => reject(t.error);
      }),
  );
}

/** 同期の設定（鍵は取り出せない CryptoKey のまま入れる。合言葉は入れない） */
export type CloudConfig = {space: string; key: CryptoKey; since: Partial<Record<Coll, number>>; startedAt: number};

export const loadConfig = async (): Promise<CloudConfig | null> => ((await tx<CloudConfig>('config', 'readonly', (s) => s.get('config'))) as CloudConfig | undefined) ?? null;
export const saveConfig = (c: CloudConfig) => tx('config', 'readwrite', (s) => void s.put(c, 'config'));

/** この端末の同期をやめる（覚えをみな消す。アプリのデータ・クラウドのデータはそのまま） */
export async function clearCloudState(): Promise<void> {
  for (const s of STATE_STORES) await tx(s, 'readwrite', (st) => void st.clear());
}

export const idbState: StateStore = {
  async load() {
    const bases = new Map<string, Base>();
    const uploaded = new Set<string>();
    await tx('base', 'readonly', (s) => {
      const r = s.openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return;
        bases.set(String(c.key), c.value as Base);
        c.continue();
      };
    });
    await tx('uploaded', 'readonly', (s) => {
      const r = s.getAllKeys();
      r.onsuccess = () => r.result.forEach((k) => uploaded.add(String(k)));
    });
    const c = await loadConfig();
    return {bases, since: c?.since ?? {}, uploaded};
  },
  async setBase(key, base) {
    await tx('base', 'readwrite', (s) => void (base ? s.put(base, key) : s.delete(key)));
  },
  async setSince(coll, at) {
    const c = await loadConfig();
    if (c) await saveConfig({...c, since: {...c.since, [coll]: at}});
  },
  async addUploaded(id) {
    await tx('uploaded', 'readwrite', (s) => void s.put(true, id));
  },
};

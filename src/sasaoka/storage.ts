// 保存：この端末のブラウザの IndexedDB（使えないときは localStorage）だけに保存する。サーバーへは送らない。
// 太陽ポータルのアプリはすべて同じサイト（akamar08taiyo-bot.github.io）にあり、localStorage の容量を
// 分け合っているため、件数の多い部材リストは容量に余裕のある IndexedDB に入れる。
// 見積書作成アプリ（住宅改修 見積書作成）も同じ保存場所を使う（部材リスト・★お気に入り・様邸を一緒に使う）。
// どちらかが保存するたびに、その項目の「印」（stamp:項目名）を変える。前に読んだときと印が違えば、ほかのアプリ・タブが
// 保存したということなので、読み直す・まとめてから保存する（sync.ts）。

import {DEFAULT_LABOR, DEFAULT_PLACES, DEFAULT_STAFF, defaultSettings, OFFICES, SETTINGS_REV, STAFF_FULL_NAMES} from './defaults.ts';
import {guessPieceLengthM} from './priceImport.ts';
import type {AppData, EstimateForm, InvoiceTaxMode, Job, Kit, LaborItem, Material, NameSuffix, Place, Rounding, Row, Settings, TaxMode} from './types.ts';
import {uid} from './util.ts';

const DB_NAME = 'taiyo-sasaoka-shikiri';
const STORE = 'kv';
const LS_PREFIX = 'sasaoka-app:';

export type DataKey = keyof AppData;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB を使えません'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB を開けません'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** IndexedDB を使えなかったときは localStorage に保存する（ここで失敗したら呼び出し側で警告を出す） */
export function saveLocal(key: DataKey, value: unknown) {
  localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
}

// ---------------------------------------------------------------- ほかのアプリ・タブと一緒に使う（印を見て、読み直す・まとめる）

const STAMP = 'stamp:';
export const DATA_KEYS: DataKey[] = ['materials', 'labor', 'jobs', 'kits', 'settings'];
export type Stamps = Partial<Record<DataKey, string>>;

export const newStamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** 保存してある項目ごとの印（IndexedDB を使えないときは空。そのときは読み直し・まとめをしない） */
export async function loadStamps(): Promise<Stamps> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const out: Stamps = {};
      for (const k of DATA_KEYS) {
        const req = store.get(STAMP + k);
        req.onsuccess = () => {
          if (typeof req.result === 'string') out[k] = req.result;
        };
      }
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return {};
  }
}

/** 1つの項目を、その印と一緒に読む（読み直すとき） */
export async function loadKeyStamped(key: DataKey): Promise<{value: unknown; stamp: string | undefined}> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const v = store.get(key);
    const s = store.get(STAMP + key);
    tx.oncomplete = () =>
      resolve({
        value: v.result,
        stamp: typeof s.result === 'string' ? s.result : undefined,
      });
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 項目を保存する。known は前に読んだ（保存した）ときの印。そのあとでほかのアプリ・タブが同じ項目を保存していれば、
 * merge（向こうが保存したもの → まとめたもの）でまとめてから保存する。読むのと書くのは1つのトランザクションなので、間にほかの保存は入らない。
 * IndexedDB を使えないときは localStorage にそのまま保存する（まとめない）。
 */
export async function saveKeySynced<T>(
  key: DataKey,
  value: T,
  known: string | undefined,
  merge: (theirs: unknown) => T,
): Promise<{value: T; stamp: string | undefined; merged: boolean}> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    saveLocal(key, value);
    return {value, stamp: undefined, merged: false};
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const stamp = newStamp();
    let result = {value, stamp: stamp as string | undefined, merged: false};
    const write = (v: T) => {
      store.put(v, key);
      store.put(stamp, STAMP + key);
    };
    const cur = store.get(STAMP + key);
    cur.onsuccess = () => {
      const now = typeof cur.result === 'string' ? cur.result : undefined;
      if (now === known) {
        write(value);
        return;
      }
      const theirs = store.get(key);
      theirs.onsuccess = () => {
        let next = value;
        try {
          next = merge(theirs.result);
        } catch {
          /* まとめられなければ、こちらの今を保存する */
        }
        result = {value: next, stamp, merged: true};
        write(next);
      };
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('保存が中断されました'));
  });
}

/** localStorage に保存したもの（IndexedDB を使えなかったときの保存先） */
function lsGet(key: DataKey): unknown {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- 壊れたデータでも画面が真っ白にならないように整える

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const numv = (v: unknown, d = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

/** 数字なら数字、空・数字でなければ null */
const optNum = (v: unknown): number | null => {
  const n = numv(v, NaN);
  return Number.isFinite(n) ? n : null;
};

export function cleanMaterials(raw: unknown): Material[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((m) => ({
    id: str(m.id) || uid('m'),
    name: str(m.name),
    price: numv(m.price),
    listPrice: numv(m.listPrice),
    // 1本の長さを入れる前に保存した部材は、商品名（「4m」「2000mm」など）から入れる
    pieceLengthM: m.pieceLengthM === undefined ? guessPieceLengthM(str(m.name)) : Math.max(0, numv(m.pieceLengthM)),
    maker: str(m.maker),
    code: str(m.code),
    unit: str(m.unit),
    favorite: m.favorite === true,
    updatedAt: numv(m.updatedAt, Date.now()),
  }));
}

export function cleanLabor(raw: unknown): LaborItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LABOR.map((l) => ({...l}));
  return raw.filter(isObj).map((l) => ({
    id: str(l.id) || uid('l'),
    name: str(l.name),
    price: numv(l.price),
    note: str(l.note),
  }));
}

const cleanRow = (r: Record<string, unknown>): Row => ({
  id: str(r.id) || uid('r'),
  kind: r.kind === 'labor' ? 'labor' : 'material',
  refId: typeof r.refId === 'string' ? r.refId : null,
  name: str(r.name),
  code: str(r.code),
  maker: str(r.maker),
  unit: str(r.unit),
  price: numv(r.price),
  qty: numv(r.qty, 1),
  listPrice: numv(r.listPrice),
  lengthCm: Math.max(0, numv(r.lengthCm)),
  pieceLengthM:
    r.pieceLengthM === undefined ? (r.kind === 'labor' ? 0 : guessPieceLengthM(str(r.name))) : Math.max(0, numv(r.pieceLengthM)),
  estPrice: optNum(r.estPrice),
  excluded: r.excluded === true,
  estText: typeof r.estText === 'string' ? r.estText : null,
  estNote: typeof r.estNote === 'string' ? r.estNote : null,
  estAmount: optNum(r.estAmount),
});

const KINDS = [1, 2, 3, 4, 5, 6]; // 見積書の改修の種類（①〜⑥）
const FORMS: EstimateForm[] = ['yukuhashi', 'kouiki'];

const cleanPlace = (p: Record<string, unknown>): Place => ({
  id: str(p.id) || uid('p'),
  name: str(p.name),
  rows: Array.isArray(p.rows) ? p.rows.filter(isObj).map(cleanRow) : [],
  kind: KINDS.includes(numv(p.kind, 1)) ? numv(p.kind, 1) : 1,
  photo: Math.max(0, Math.floor(numv(p.photo))),
  // 前の版の「工事名称」（work）は読まない。見積書の改修内容・工事名称は改修の種類から
});

const SUFFIXES: NameSuffix[] = ['様邸', '様', ''];

export function cleanJobs(raw: unknown): Job[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((j) => ({
    id: str(j.id) || uid('j'),
    month: /^\d{4}-\d{2}$/.test(str(j.month)) ? str(j.month) : new Date().toISOString().slice(0, 7),
    customer: str(j.customer),
    suffix: SUFFIXES.includes(j.suffix as NameSuffix) ? (j.suffix as NameSuffix) : '様邸',
    staff: str(j.staff),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(j.date)) ? str(j.date) : '',
    address: str(j.address),
    note: str(j.note),
    insuredNo: str(j.insuredNo),
    form: FORMS.includes(j.form as EstimateForm) ? (j.form as EstimateForm) : '',
    overhead: optNum(j.overhead),
    overheadTarget: optNum(j.overheadTarget),
    shikiri: j.shikiri !== false, // 見積書作成アプリができる前の様邸は、どれも仕切り計算・請求書アプリで作ったもの
    places: Array.isArray(j.places) ? j.places.filter(isObj).map(cleanPlace) : [],
    createdAt: numv(j.createdAt, Date.now()),
    updatedAt: numv(j.updatedAt, Date.now()),
  }));
}

export function cleanKits(raw: unknown): Kit[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((k) => ({
    id: str(k.id) || uid('k'),
    name: str(k.name),
    rows: Array.isArray(k.rows) ? k.rows.filter(isObj).map(cleanRow) : [],
    updatedAt: numv(k.updatedAt, Date.now()),
  }));
}

/** 名前の候補の並び（空・重複を除く） */
export function cleanList(raw: unknown[]): string[] {
  return [...new Set(raw.map((x) => str(x).trim()).filter(Boolean))];
}

const TAX_MODES: TaxMode[] = ['original', 'floor', 'round', 'ceil'];
const INV_MODES: InvoiceTaxMode[] = ['perJob', 'monthly'];
const ROUNDINGS: Rounding[] = ['floor', 'round', 'ceil'];

export function cleanSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const s = {...d};
  for (const k of [
    'clientName',
    'company',
    'officeName',
    'manager',
    'postal',
    'address',
    'tel',
    'fax',
    'person',
    'regNo',
    'bank',
    'subject',
    'invoiceNote',
  ] as const) {
    if (typeof raw[k] === 'string') s[k] = raw[k] as string;
  }
  // 所長名を入れる前に保存した設定は、保存してある営業所の所長名にする
  if (typeof raw.manager !== 'string') s.manager = OFFICES.find((o) => o.name === s.officeName)?.manager ?? '';
  s.rate = numv(raw.rate, d.rate);
  s.taxRate = numv(raw.taxRate, d.taxRate);
  s.taxMode = TAX_MODES.includes(raw.taxMode as TaxMode) ? (raw.taxMode as TaxMode) : d.taxMode;
  s.invoiceTaxMode = INV_MODES.includes(raw.invoiceTaxMode as InvoiceTaxMode) ? (raw.invoiceTaxMode as InvoiceTaxMode) : d.invoiceTaxMode;
  s.totalTaxRounding = ROUNDINGS.includes(raw.totalTaxRounding as Rounding) ? (raw.totalTaxRounding as Rounding) : d.totalTaxRounding;
  s.placePresets = Array.isArray(raw.placePresets) ? cleanList(raw.placePresets) : DEFAULT_PLACES;
  s.staffList = Array.isArray(raw.staffList) ? cleanList(raw.staffList) : DEFAULT_STAFF;
  s.estimateRate = numv(raw.estimateRate, d.estimateRate);
  s.estimateOverheadRate = Math.max(0, numv(raw.estimateOverheadRate, d.estimateOverheadRate));
  s.estimateHourRate = Math.max(0, numv(raw.estimateHourRate, d.estimateHourRate));
  s.estimateForm = FORMS.includes(raw.estimateForm as EstimateForm) ? (raw.estimateForm as EstimateForm) : d.estimateForm;
  // 版2より前の設定：請求書の消費税は「すべての様邸の合計に最後に消費税率をかける」形に直す
  if (numv(raw.rev, 1) < 2) s.invoiceTaxMode = 'monthly';
  // 版4より前の設定：名字だけの担当者の候補をフルネームにする（見積書に出す）
  if (numv(raw.rev, 1) < 4) s.staffList = cleanList(s.staffList.map((n) => STAFF_FULL_NAMES.get(n) ?? n));
  s.rev = SETTINGS_REV;
  return s;
}

/** 保存してあったもの（ほかのアプリが保存したものも）を、この版の形に整える */
export function cleanKey<K extends DataKey>(key: K, raw: unknown): AppData[K] {
  const clean: {[P in DataKey]: (raw: unknown) => AppData[P]} = {
    materials: cleanMaterials,
    labor: (v) => (v === undefined ? DEFAULT_LABOR.map((l) => ({...l})) : cleanLabor(v)),
    jobs: cleanJobs,
    kits: cleanKits,
    settings: cleanSettings,
  };
  return clean[key](raw);
}

/** すべての項目と、その印を読む（1つのトランザクションで読むので、読んでいるあいだのほかの保存とまざらない） */
export async function loadAllStamped(): Promise<{
  data: AppData;
  stamps: Stamps;
}> {
  const raw: Partial<Record<DataKey, unknown>> = {};
  const stamps: Stamps = {};
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      for (const k of DATA_KEYS) {
        const v = store.get(k);
        v.onsuccess = () => {
          raw[k] = v.result;
        };
        const s = store.get(STAMP + k);
        s.onsuccess = () => {
          if (typeof s.result === 'string') stamps[k] = s.result;
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* localStorage を見る */
  }
  for (const k of DATA_KEYS) if (raw[k] === undefined) raw[k] = lsGet(k);
  return {
    data: {
      materials: cleanKey('materials', raw.materials),
      labor: cleanKey('labor', raw.labor),
      jobs: cleanKey('jobs', raw.jobs),
      kits: cleanKey('kits', raw.kits),
      settings: cleanKey('settings', raw.settings),
    },
    stamps,
  };
}

// ---------------------------------------------------------------- バックアップ（ファイルに書き出す・読み込む）

export const BACKUP_KIND = 'taiyo-sasaoka-shikiri-backup';

export function backupJson(data: AppData): string {
  return JSON.stringify(
    {
      kind: BACKUP_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      ...data,
    },
    null,
    1,
  );
}

/** 部材リスト・手間単価・一式だけ（ほかの人に渡す用。様邸・設定は入れない） */
export function masterJson(data: Pick<AppData, 'materials' | 'labor' | 'kits'>): string {
  return JSON.stringify(
    {
      kind: BACKUP_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      materials: data.materials,
      labor: data.labor,
      kits: data.kits,
    },
    null,
    1,
  );
}

export function parseBackup(text: string): Partial<AppData> {
  const raw = JSON.parse(text);
  if (!isObj(raw) || raw.kind !== BACKUP_KIND) throw new Error('このアプリのバックアップファイルではありません');
  const out: Partial<AppData> = {};
  if (Array.isArray(raw.materials)) out.materials = cleanMaterials(raw.materials);
  if (Array.isArray(raw.labor)) out.labor = cleanLabor(raw.labor);
  if (Array.isArray(raw.jobs)) out.jobs = cleanJobs(raw.jobs);
  if (Array.isArray(raw.kits)) out.kits = cleanKits(raw.kits);
  if (isObj(raw.settings)) out.settings = cleanSettings(raw.settings);
  return out;
}

/** 同じIDのものは読み込んだ方で上書きし、ないものは足す */
export function mergeById<T extends {id: string}>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) map.set(x.id, x);
  return [...map.values()];
}

// 保存：この端末のブラウザの IndexedDB（使えないときは localStorage）だけに保存する。サーバーへは送らない。
// 太陽ポータルのアプリはすべて同じサイト（akamar08taiyo-bot.github.io）にあり、localStorage の容量を
// 分け合っているため、件数の多い部材リストは容量に余裕のある IndexedDB に入れる。

import {DEFAULT_LABOR, DEFAULT_PLACES, DEFAULT_STAFF, defaultSettings, OFFICES, SETTINGS_REV} from './defaults.ts';
import type {AppData, InvoiceTaxMode, Job, Kit, LaborItem, Material, NameSuffix, Place, Rounding, Row, Settings, TaxMode} from './types.ts';
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

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('保存が中断されました'));
  });
}

export async function saveKey(key: DataKey, value: unknown): Promise<void> {
  try {
    await idbSet(key, value);
  } catch {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); // ここで失敗したら呼び出し側で警告を出す
  }
}

async function loadKey(key: DataKey): Promise<unknown> {
  try {
    const v = await idbGet(key);
    if (v !== undefined) return v;
  } catch {
    /* localStorage を見る */
  }
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
    maker: str(m.maker),
    code: str(m.code),
    unit: str(m.unit),
    favorite: m.favorite === true,
    updatedAt: numv(m.updatedAt, Date.now()),
  }));
}

export function cleanLabor(raw: unknown): LaborItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LABOR.map((l) => ({...l}));
  return raw.filter(isObj).map((l) => ({id: str(l.id) || uid('l'), name: str(l.name), price: numv(l.price), note: str(l.note)}));
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
  estPrice: optNum(r.estPrice),
});

const cleanPlace = (p: Record<string, unknown>): Place => ({
  id: str(p.id) || uid('p'),
  name: str(p.name),
  rows: Array.isArray(p.rows) ? p.rows.filter(isObj).map(cleanRow) : [],
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
    work: str(j.work),
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
    'estimateWork',
    'estimateValid',
    'estimateNote',
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
  // 版2より前の設定：請求書の消費税は「すべての様邸の合計に最後に消費税率をかける」形に直す
  if (numv(raw.rev, 1) < 2) s.invoiceTaxMode = 'monthly';
  s.rev = SETTINGS_REV;
  return s;
}

export async function loadAll(): Promise<AppData> {
  const [materials, labor, jobs, kits, settings] = await Promise.all([
    loadKey('materials'),
    loadKey('labor'),
    loadKey('jobs'),
    loadKey('kits'),
    loadKey('settings'),
  ]);
  return {
    materials: cleanMaterials(materials),
    labor: labor === undefined ? DEFAULT_LABOR.map((l) => ({...l})) : cleanLabor(labor),
    jobs: cleanJobs(jobs),
    kits: cleanKits(kits),
    settings: cleanSettings(settings),
  };
}

// ---------------------------------------------------------------- バックアップ（ファイルに書き出す・読み込む）

export const BACKUP_KIND = 'taiyo-sasaoka-shikiri-backup';

export function backupJson(data: AppData): string {
  return JSON.stringify({kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(), ...data}, null, 1);
}

/** 部材リスト・手間単価・一式だけ（ほかの人に渡す用。様邸・設定は入れない） */
export function masterJson(data: Pick<AppData, 'materials' | 'labor' | 'kits'>): string {
  return JSON.stringify(
    {kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(), materials: data.materials, labor: data.labor, kits: data.kits},
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

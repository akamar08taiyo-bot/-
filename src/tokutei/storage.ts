// 保存：この端末のブラウザの IndexedDB（使えないときは localStorage）だけに保存する。サーバーへは送らない。
// 太陽ポータルのアプリはすべて同じサイト（akamar08taiyo-bot.github.io）にあり、localStorage の容量を分け合っているため、
// 件数の多い商品マスタは容量に余裕のある IndexedDB に入れる。保存場所はこのアプリだけのもの（住宅改修アプリとは別）。
// 住宅改修 見積書アプリの src/sasaoka/storage.ts を手本にした。保存するたびにその項目の「印」（stamp:項目名）を変え、
// 前に読んだときと印が違えば、別のタブが保存したということなので、読み直す・まとめてから保存する（sync.ts）。

import {CARE_LEVELS, DEFAULT_STAFF, DEFAULT_SUPPLIERS, defaultSettings, SETTINGS_REV} from './defaults.ts';
import {cleanJutakuFields} from './jutaku.ts';
import type {AppData, BurdenRatio, CarePlan, Gender, PayMethod, Product, Sale, SaleItem, SaleStatus, Settings, TaxType} from './types.ts';
import {uid} from './util.ts';

const DB_NAME = 'taiyo-tokutei';
const STORE = 'kv';
const LS_PREFIX = 'tokutei-app:';

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

// ---------------------------------------------------------------- 別のタブと一緒に使う（印を見て、読み直す・まとめる）

const STAMP = 'stamp:';
export const DATA_KEYS: DataKey[] = ['products', 'sales', 'settings'];
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
 * 項目を保存する。known は前に読んだ（保存した）ときの印。そのあとで別のタブが同じ項目を保存していれば、
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
const tax = (v: unknown): TaxType => (v === '8%' || v === '非課税' ? v : '10%');
const list = (v: unknown, d: string[]) => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : d);

export function cleanProducts(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((p) => ({
    id: str(p.id) || uid('p'),
    name: str(p.name),
    maker: str(p.maker),
    code: str(p.code),
    tais: str(p.tais),
    jan: str(p.jan),
    category: str(p.category),
    sub: str(p.sub),
    categoryByHand: p.categoryByHand === true,
    listPrice: Math.max(0, numv(p.listPrice)),
    cost: Math.max(0, numv(p.cost)),
    taxType: tax(p.taxType),
    unit: str(p.unit),
    supplier: str(p.supplier),
    favorite: p.favorite === true,
    useCount: Math.max(0, Math.round(numv(p.useCount))),
    lastUsedAt: numv(p.lastUsedAt),
    source: str(p.source),
    updatedAt: numv(p.updatedAt),
  }));
}

function cleanItem(i: Record<string, unknown>): SaleItem {
  return {
    id: str(i.id) || uid('i'),
    productId: typeof i.productId === 'string' && i.productId ? i.productId : null,
    name: str(i.name),
    maker: str(i.maker),
    code: str(i.code),
    tais: str(i.tais),
    category: str(i.category),
    sub: str(i.sub),
    unit: str(i.unit),
    supplier: str(i.supplier),
    taxType: tax(i.taxType),
    listPrice: Math.max(0, numv(i.listPrice)),
    cost: Math.max(0, numv(i.cost)),
    qty: Math.max(0, numv(i.qty, 1)),
    discountRate: Math.min(100, Math.max(0, numv(i.discountRate, 20))),
    unitPrice: optNum(i.unitPrice),
    reason: str(i.reason),
    ...(typeof i.basisNote === 'string' ? {basisNote: i.basisNote} : {}),
  };
}

const STATUSES: SaleStatus[] = ['見積', '申請', '承認', '納品', '集金'];

export function cleanSales(raw: unknown): Sale[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((s) => {
    const ratio = numv(s.burdenRatio, 1);
    return {
      id: str(s.id) || uid('s'),
      customer: str(s.customer),
      kana: str(s.kana),
      insuredNo: str(s.insuredNo),
      birthDate: str(s.birthDate),
      gender: (s.gender === '男' || s.gender === '女' ? s.gender : '') as Gender,
      zip: str(s.zip),
      address: str(s.address),
      tel: str(s.tel),
      careLevel: CARE_LEVELS.includes(str(s.careLevel)) ? str(s.careLevel) : '',
      insurer: str(s.insurer),
      insurerName: str(s.insurerName),
      burdenRatio: (ratio === 2 || ratio === 3 ? ratio : 1) as BurdenRatio,
      payMethod: (s.payMethod === '償還払い' ? '償還払い' : '受領委任払い') as PayMethod,
      remaining: s.remaining === null || s.remaining === undefined || s.remaining === '' ? null : optNum(s.remaining),
      perItem: s.perItem === true,
      welfare: s.welfare === true,
      staff: str(s.staff),
      careOffice: str(s.careOffice),
      careManager: str(s.careManager),
      carePlan: (s.carePlan === '有' || s.carePlan === '無' ? s.carePlan : '') as CarePlan,
      quoteNo: str(s.quoteNo),
      estimateDate: str(s.estimateDate),
      applyDate: str(s.applyDate),
      approveDate: str(s.approveDate),
      deliveryDate: str(s.deliveryDate),
      claimDate: str(s.claimDate),
      collectDate: str(s.collectDate),
      status: STATUSES.includes(s.status as SaleStatus) ? (s.status as SaleStatus) : '見積',
      note: str(s.note),
      items: Array.isArray(s.items) ? s.items.filter(isObj).map(cleanItem) : [],
      createdAt: numv(s.createdAt),
      updatedAt: numv(s.updatedAt),
      // 住宅改修の様邸から開いた案件（jutaku.ts）
      ...(str(s.jutakuJob) ? {jutakuJob: str(s.jutakuJob), jutakuSync: isObj(s.jutakuSync) ? cleanJutakuFields(s.jutakuSync) : {}} : {}),
      ...(s.showSelfPay === true ? {showSelfPay: true} : {}),
      ...(numv(s.hacchuSentAt) > 0 ? {hacchuSentAt: numv(s.hacchuSentAt)} : {}),
    };
  });
}

export function cleanSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const text = (k: keyof Settings) => (typeof raw[k] === 'string' ? (raw[k] as string) : (d[k] as string));
  return {
    company: text('company'),
    officeName: text('officeName'),
    postal: text('postal'),
    address: text('address'),
    tel: text('tel'),
    fax: text('fax'),
    manager: text('manager'),
    regNo: text('regNo'),
    staffList: list(raw.staffList, DEFAULT_STAFF),
    suppliers: list(raw.suppliers, DEFAULT_SUPPLIERS),
    discountRate: Math.min(100, Math.max(0, numv(raw.discountRate, d.discountRate))),
    markupRate: Math.max(0, numv(raw.markupRate, d.markupRate)),
    limit: Math.max(0, numv(raw.limit, d.limit)),
    minProfitRate: Math.max(0, numv(raw.minProfitRate, d.minProfitRate)),
    validity: text('validity'),
    payment: text('payment'),
    delivery: text('delivery'),
    remarks: text('remarks'),
    rev: SETTINGS_REV,
  };
}

export function cleanKey<K extends DataKey>(key: K, raw: unknown): AppData[K] {
  const clean: {[P in DataKey]: (raw: unknown) => AppData[P]} = {
    products: cleanProducts,
    sales: cleanSales,
    settings: cleanSettings,
  };
  return clean[key](raw);
}

/** すべての項目と、その印を読む（1つのトランザクションで読むので、読んでいるあいだのほかの保存とまざらない） */
export async function loadAllStamped(): Promise<{data: AppData; stamps: Stamps}> {
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
      products: cleanKey('products', raw.products),
      sales: cleanKey('sales', raw.sales),
      settings: cleanKey('settings', raw.settings),
    },
    stamps,
  };
}

// ---------------------------------------------------------------- バックアップ（ファイルに書き出す・読み込む）

export const BACKUP_KIND = 'taiyo-tokutei-backup';

export function backupJson(data: AppData): string {
  return JSON.stringify({kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(), ...data}, null, 1);
}

/** 商品マスタだけ（ほかの人・ほかの端末に渡す用。案件・設定は入れない） */
export function productsJson(products: Product[]): string {
  return JSON.stringify({kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(), products}, null, 1);
}

export function parseBackup(text: string): Partial<AppData> {
  const raw = JSON.parse(text);
  if (!isObj(raw) || raw.kind !== BACKUP_KIND) throw new Error('このアプリのバックアップファイルではありません');
  const out: Partial<AppData> = {};
  if (Array.isArray(raw.products)) out.products = cleanProducts(raw.products);
  if (Array.isArray(raw.sales)) out.sales = cleanSales(raw.sales);
  if (isObj(raw.settings)) out.settings = cleanSettings(raw.settings);
  return out;
}

/** 同じIDのものは読み込んだ方で上書きし、ないものは足す */
export function mergeById<T extends {id: string}>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) map.set(x.id, x);
  return [...map.values()];
}

/** 商品マスタを CSV に（Excel で開けるように先頭に BOM。取り込み直すと同じ商品になる見出しにしてある） */
export function productsCsv(products: Product[]): string {
  const head = ['★', '種目', '細目', 'メーカー', '品番', '商品名', 'TAISコード', 'JANコード', '定価(税抜)', '仕切価格', '税区分', '単位', '仕入先'];
  const q = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = products.map((p) =>
    [p.favorite ? '★' : '', p.category, p.sub, p.maker, p.code, p.name, p.tais, p.jan, p.listPrice || '', p.cost || '', p.taxType === '10%' ? '課税' : p.taxType, p.unit, p.supplier].map(q).join(','),
  );
  return '﻿' + [head.join(','), ...rows].join('\r\n') + '\r\n';
}

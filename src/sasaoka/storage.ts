// 保存：この端末のブラウザの IndexedDB（使えないときは localStorage）だけに保存する。サーバーへは送らない。
// 太陽ポータルのアプリはすべて同じサイト（akamar08taiyo-bot.github.io）にあり、localStorage の容量を
// 分け合っているため、件数の多い部材リストは容量に余裕のある IndexedDB に入れる。
// 見積書作成アプリ（住宅改修 見積書作成）も同じ保存場所を使う（部材リスト・★お気に入り・様邸を一緒に使う）。
// どちらかが保存するたびに、その項目の「印」（stamp:項目名）を変える。前に読んだときと印が違えば、ほかのアプリ・タブが
// 保存したということなので、読み直す・まとめてから保存する（sync.ts）。

import {DEFAULT_LABOR, DEFAULT_PLACES, DEFAULT_STAFF, defaultSettings, OFFICES, OLD_DEFAULT_PLACES, SETTINGS_REV, STAFF_FULL_NAMES} from './defaults.ts';
import {guessPieceLengthM} from './priceImport.ts';
import {jobInsurer, MARK_INFO, MARK_KEYS, NO_SHINSEI} from './estimateForms.ts';
import {cleanEdit} from './photoEdit.ts';
import {cleanRiyu} from './riyu.ts';
import type {AppData, EstimateForm, Insurer, InvoiceTaxMode, Job, Kit, LaborItem, Material, NameSuffix, OrderEdits, OrderLine, Place, PlaceDims, PlacePhotoEdits, PlacePhotos, Rounding, Row, Settings, ShinseiInfo, TaxMode} from './types.ts';
import {todayIso, uid} from './util.ts';

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

/**
 * この版が知らない項目（新しい版が足した項目）は、消さずにそのまま持っておく。新しい版を開いたあとで、前の版を開いたままの
 * タブが保存しても、新しい版で入れたもの（とその写真の番号）を消さないように。clean が読まなかった項目＝この版が知らない項目。
 * 読んだ項目は clean の結果のとおり（直す・空なら持たない）。項目の一覧を持たないので、項目を足しても直さなくてよい。
 * old は前の版の項目（もう読まない。持っておかずに捨てる）
 */
function keepNewer<R, T extends object>(raw: R, clean: (r: R) => T, old: readonly string[] = []): T {
  if (!isObj(raw)) return clean(raw);
  const read = new Set<PropertyKey>(old);
  const seen = new Proxy(raw, {
    get: (t, k) => (read.add(k), Reflect.get(t, k)),
    has: (t, k) => (read.add(k), Reflect.has(t, k)),
  });
  const out = clean(seen);
  return {...Object.fromEntries(Object.entries(raw).filter(([k]) => !read.has(k))), ...out};
}

export function cleanMaterials(raw: unknown): Material[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((rec) => keepNewer(rec, (m) => ({
    id: str(m.id) || uid('m'),
    name: str(m.name),
    price: numv(m.price),
    listPrice: numv(m.listPrice),
    // 1本の長さを入れる前に保存した部材は、商品名（「4m」「2000mm」など）から入れる。前の版が商品名を読みちがえた長さは読み直す（`pieceLength`）
    pieceLengthM: pieceLength(m),
    maker: str(m.maker),
    code: str(m.code),
    unit: str(m.unit),
    favorite: m.favorite === true,
    updatedAt: numv(m.updatedAt, Date.now()),
  })));
}

/** 最初の単価表の見積の単価（見積の単価がなかった前の版の単価表に入れる） */
const DEFAULT_EST = new Map(DEFAULT_LABOR.map((l) => [l.id, l.estPrice]));

export function cleanLabor(raw: unknown): LaborItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LABOR.map((l) => ({...l}));
  return raw.filter(isObj).map((l) => {
    const id = str(l.id) || uid('l');
    // 前の版（見積の単価がない）は、最初の単価表の見積の単価にする（同じ項目＝同じID）
    const estPrice = l.estPrice === undefined ? (DEFAULT_EST.get(id) ?? null) : l.estPrice === null || l.estPrice === '' ? null : numv(l.estPrice);
    return {id, name: str(l.name), price: numv(l.price), estPrice, note: str(l.note)};
  });
}

/**
 * 前の版（2026-10-22 まで）が商品名から読んだ1本の長さ。最初の「○mm」を長さにしていたので、
 * 「木製ベースプレート 120mm幅 … 2m」を 0.12m と読んでいた。保存してある長さがこれと同じなら、読み直すために使う
 */
function oldPieceLengthM(name: string): number {
  const s = name.normalize('NFKC').replace(/[\s　]+/g, ' ').trim().toLowerCase();
  const mm = /(?:^|[^\d.])(\d+(?:\.\d+)?) ?mm(?![a-z])/.exec(s);
  if (mm) return Math.round(Number(mm[1])) / 1000;
  const m = /(?:^|[^\d.])(\d+(?:\.\d+)?) ?m(?![a-z])/.exec(s);
  if (m) return Number(m[1]);
  const l = /(?:^|[^a-z])l ?[=:]? ?(\d{3,5})(?!\d)/.exec(s);
  if (l) return Number(l[1]) / 1000;
  return 0;
}

/** 保存してある1本の長さ。ないときと、前の版が商品名を読みちがえたまま（手で直していない）のときは商品名から読む */
function pieceLength(x: Record<string, unknown>): number {
  const name = str(x.name);
  if (x.pieceLengthM === undefined) return x.kind === 'labor' ? 0 : guessPieceLengthM(name);
  const saved = Math.max(0, numv(x.pieceLengthM));
  return saved > 0 && saved === oldPieceLengthM(name) ? guessPieceLengthM(name) : saved;
}

/**
 * 見積書の行の使う長さ（cm）。前の版が1本の長さを読みちがえていた行は、見積書の本数（1.2本など）がそのままになるように直す
 * （0.12m の 1.2本＝144mm → 2m の 1.2本＝2400mm。打った数は本数なので）。読み直して長さで数えない部材になったら、前のまま
 */
function rowLength(r: Record<string, unknown>, piece: number): {lengthCm: number; pieceLengthM: number} {
  const lengthCm = Math.max(0, numv(r.lengthCm));
  const saved = Math.max(0, numv(r.pieceLengthM));
  if (r.pieceLengthM === undefined || !(lengthCm > 0) || !(saved > 0) || piece === saved) return {lengthCm, pieceLengthM: piece};
  if (!(piece > 0)) return {lengthCm, pieceLengthM: saved};
  return {lengthCm: Math.round(((lengthCm * piece) / saved) * 1000) / 1000, pieceLengthM: piece};
}

const cleanRow = (raw: Record<string, unknown>): Row => keepNewer(raw, (r) => ({
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
  ...rowLength(r, pieceLength(r)),
  estPrice: optNum(r.estPrice),
  excluded: r.excluded === true,
  estText: typeof r.estText === 'string' ? r.estText : null,
  estNote: typeof r.estNote === 'string' ? r.estNote : null,
  estAmount: optNum(r.estAmount),
}));

const KINDS = [1, 2, 3, 4, 5, 6]; // 見積書の改修の種類（①〜⑥）
const FORMS: EstimateForm[] = ['yukuhashi', 'kouiki'];
const INSURERS: Insurer[] = ['kanda', 'yukuhashi', 'miyako', 'kouiki'];

const cleanPlace = (raw: Record<string, unknown>): Place => keepNewer(raw, (p) => ({
  id: str(p.id) || uid('p'),
  name: str(p.name),
  rows: Array.isArray(p.rows) ? p.rows.filter(isObj).map(cleanRow) : [],
  kind: KINDS.includes(numv(p.kind, 1)) ? numv(p.kind, 1) : 1,
  photo: Math.max(0, Math.floor(numv(p.photo))),
  // 前の版の「工事名称」（work）は読まない。見積書の改修内容・工事名称は改修の種類から
  ...(str(p.shinseiText).trim() ? {shinseiText: str(p.shinseiText)} : {}),
  ...(typeof p.shinseiLine === 'string' ? {shinseiLine: p.shinseiLine} : {}), // 手で直した改修の内容（空にしたのも、そのまま）
  ...cleanDims(p.dims),
  ...cleanPhotos(p.photos),
  ...cleanPhotoDates(p.photoDates),
  ...(str(p.photoNote).trim() ? {photoNote: str(p.photoNote)} : {}), // 写真に書く内容の追加
  ...cleanPhotoEdits(p.photoEdits),
}), ['work']);

/** 改修の内容の寸法（打ったままの文字）。どれもなければ持たない */
function cleanDims(raw: unknown): {dims?: PlaceDims} {
  if (!isObj(raw)) return {};
  const dims: PlaceDims = {};
  for (const k of ['l', 'h', 'w', 'd'] as const) if (str(raw[k]).trim()) dims[k] = str(raw[k]);
  return Object.keys(dims).length ? {dims} : {};
}

/** 箇所の写真（改修前・改修後の写真の番号）。どちらもなければ持たない */
function cleanPhotos(raw: unknown): {photos?: PlacePhotos} {
  if (!isObj(raw)) return {};
  const photos: PlacePhotos = {};
  if (str(raw.before)) photos.before = str(raw.before);
  if (str(raw.after)) photos.after = str(raw.after);
  return photos.before || photos.after ? {photos} : {};
}

/** 写真の撮影日（日付の形 'YYYY-MM-DD' だけ）。どれもなければ持たない */
function cleanPhotoDates(raw: unknown): {photoDates?: PlacePhotos} {
  if (!isObj(raw)) return {};
  const dates: PlacePhotos = {};
  if (isoDate(raw.before)) dates.before = isoDate(raw.before);
  if (isoDate(raw.after)) dates.after = isoDate(raw.after);
  return dates.before || dates.after ? {photoDates: dates} : {};
}

/** 写真の向き・大きさ（そのまま＝0°・枠いっぱいのものは持たない） */
function cleanPhotoEdits(raw: unknown): {photoEdits?: PlacePhotoEdits} {
  if (!isObj(raw)) return {};
  const edits: PlacePhotoEdits = {};
  for (const slot of ['before', 'after'] as const) {
    const e = raw[slot];
    const clean = isObj(e) ? cleanEdit({rot: numv(e.rot), scale: numv(e.scale, 1), x: numv(e.x), y: numv(e.y)}) : undefined;
    if (clean) edits[slot] = clean;
  }
  return edits.before || edits.after ? {photoEdits: edits} : {};
}

const SUFFIXES: NameSuffix[] = ['様邸', '様', ''];

const cleanOrderLine = (l: Record<string, unknown>): OrderLine => ({
  key: str(l.key).startsWith('add:') ? str(l.key) : uid('add:'), // 持っておくのは発注書で足した行だけ
  refId: typeof l.refId === 'string' ? l.refId : null,
  maker: str(l.maker),
  code: str(l.code),
  name: str(l.name),
  unit: str(l.unit),
  qty: Math.max(0, numv(l.qty, 1)),
  calc: 0,
  lengthMm: Math.max(0, numv(l.lengthMm)),
  photos: [], // 発注書で足した行は、どこで使うか（写真番号）を持たない
  price: numv(l.price),
  listPrice: numv(l.listPrice),
  warn: str(l.warn),
});

/** 発注書で手で直したところ（なければ null ＝ 見積書から計算したまま） */
function cleanOrder(raw: unknown): OrderEdits | null {
  if (!isObj(raw)) return null;
  const qty: Record<string, number> = {};
  if (isObj(raw.qty)) {
    for (const [k, v] of Object.entries(raw.qty)) {
      const n = numv(v, NaN);
      if (Number.isFinite(n) && n >= 0) qty[k] = n;
    }
  }
  return {
    qty,
    removed: Array.isArray(raw.removed) ? raw.removed.filter((k): k is string => typeof k === 'string') : [],
    added: Array.isArray(raw.added) ? raw.added.filter(isObj).map(cleanOrderLine) : [],
    supplier: str(raw.supplier),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(raw.date)) ? str(raw.date) : '',
  };
}

const SHINSEI_TEXTS = ['kana', 'birthY', 'birthM', 'birthD', 'zip', 'phone', 'owner', 'relation', 'reasonOffice', 'reasonName'] as const;
const isoDate = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : '');

/** 申請書の項目。丸で囲む項目は選べる値のほかは空にする。前の版（丸だけを shinseiMarks に持っていた）も読む */
function cleanShinsei(raw: unknown, legacyMarks: unknown): ShinseiInfo {
  const src = isObj(raw) ? raw : isObj(legacyMarks) ? legacyMarks : {};
  const out: ShinseiInfo = {...NO_SHINSEI};
  for (const key of MARK_KEYS) {
    const v = str(src[key]);
    if ((MARK_INFO[key].options as string[]).includes(v)) (out as Record<string, unknown>)[key] = v;
  }
  for (const key of SHINSEI_TEXTS) out[key] = str(src[key]);
  out.start = isoDate(src.start);
  out.end = isoDate(src.end);
  out.cost = optNum(src.cost);
  // 介護保険証から入れた項目（2026-10-22。前の版のデータにはない＝空）
  out.careFrom = isoDate(src.careFrom);
  out.careTo = isoDate(src.careTo);
  out.insurerNo = str(src.insurerNo).normalize('NFKC').replace(/\D/g, '').slice(0, 8); // 全角の数字も（\D は半角の数字のほかを消す）
  out.burden = ['1', '2', '3'].includes(str(src.burden)) ? (str(src.burden) as ShinseiInfo['burden']) : '';
  if (src.welfare === true) out.welfare = true; // 生活保護（介護ソフトの画面から。2026-10-23）
  return out;
}

export function cleanJobs(raw: unknown): Job[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((rec) => keepNewer(rec, (j) => {
    const form: EstimateForm | '' = FORMS.includes(j.form as EstimateForm) ? (j.form as EstimateForm) : '';
    const address = str(j.address);
    return {
      id: str(j.id) || uid('j'),
      month: /^\d{4}-\d{2}$/.test(str(j.month)) ? str(j.month) : todayIso().slice(0, 7), // この端末の日付の月（toISOString は世界時なので、日本では1日の0時〜9時が前の月になる）
      customer: str(j.customer),
      suffix: SUFFIXES.includes(j.suffix as NameSuffix) ? (j.suffix as NameSuffix) : '様邸',
      staff: str(j.staff),
      date: /^\d{4}-\d{2}-\d{2}$/.test(str(j.date)) ? str(j.date) : '',
      estDate: /^\d{4}-\d{2}-\d{2}$/.test(str(j.estDate)) ? str(j.estDate) : '',
      address,
      note: str(j.note),
      insuredNo: str(j.insuredNo),
      // 保険者を選ぶ前に保存した見積書は、住所・書式から（苅田町・行橋市・みやこ町用で住所から分からなければ空。見積書の画面で選ぶ）
      insurer: INSURERS.includes(j.insurer as Insurer) ? (j.insurer as Insurer) : jobInsurer({insurer: '', form, address}),
      form,
      overhead: optNum(j.overhead),
      overheadTarget: optNum(j.overheadTarget),
      shikiri: j.shikiri !== false, // 見積書作成アプリができる前の様邸は、どれも仕切り計算・請求書アプリで作ったもの
      places: Array.isArray(j.places) ? j.places.filter(isObj).map(cleanPlace) : [],
      order: cleanOrder(j.order),
      shinsei: keepNewer(j.shinsei, (s) => cleanShinsei(s, j.shinseiMarks)),
      ...(isObj(j.riyu) ? {riyu: cleanRiyu(j.riyu)} : {}),
      // ゴミ箱に移した時刻（trash.ts）。時刻でなければ（元に戻した・前の版のデータ）持たない＝ゴミ箱に入っていない
      ...(numv(j.trashedAt) > 0 ? {trashedAt: numv(j.trashedAt)} : {}),
      ...(typeof j.planPhoto === 'string' && j.planPhoto ? {planPhoto: j.planPhoto} : {}), // 平面図の図（写真と同じ番号＝文字。2026-10-25）
      createdAt: numv(j.createdAt, Date.now()),
      updatedAt: numv(j.updatedAt, Date.now()),
    };
  }, ['work'])); // 前の版の工事名称（work）は様邸にもあった
}

export function cleanKits(raw: unknown): Kit[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((rec) => keepNewer(rec, (k) => ({
    id: str(k.id) || uid('k'),
    name: str(k.name),
    rows: Array.isArray(k.rows) ? k.rows.filter(isObj).map(cleanRow) : [],
    updatedAt: numv(k.updatedAt, Date.now()),
  })));
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
  s.estimateLaborRate = Math.max(0, numv(raw.estimateLaborRate, d.estimateLaborRate));
  s.estimateOverheadRate = Math.max(0, numv(raw.estimateOverheadRate, d.estimateOverheadRate));
  s.estimateHourRate = Math.max(0, numv(raw.estimateHourRate, d.estimateHourRate));
  s.estimateForm = FORMS.includes(raw.estimateForm as EstimateForm) ? (raw.estimateForm as EstimateForm) : d.estimateForm;
  s.kitExample = raw.kitExample === true;
  s.laborEst = raw.laborEst === true;
  s.laborRev = numv(raw.laborRev, 0); // 前の版で保存した設定は 0（取付手間の見積の単価を直す）
  s.tesuri = raw.tesuri === true;
  // 版2より前の設定：請求書の消費税は「すべての様邸の合計に最後に消費税率をかける」形に直す
  if (numv(raw.rev, 1) < 2) s.invoiceTaxMode = 'monthly';
  // 版4より前の設定：名字だけの担当者の候補をフルネームにする（見積書に出す）
  if (numv(raw.rev, 1) < 4) s.staffList = cleanList(s.staffList.map((n) => STAFF_FULL_NAMES.get(n) ?? n));
  // 版5より前の設定：箇所の候補が前の初期値のままなら、写真の用紙の改修箇所の名前にする（自分で直した候補はそのまま）
  if (numv(raw.rev, 1) < 5 && s.placePresets.join('\n') === OLD_DEFAULT_PLACES.join('\n')) s.placePresets = DEFAULT_PLACES;
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

/** 部材リスト・手間単価・部材＋施工費（常用）だけ（ほかの人に渡す用。様邸・設定は入れない） */
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

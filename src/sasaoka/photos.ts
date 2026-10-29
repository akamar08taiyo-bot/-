// 写真貼付用紙の写真（ユーザーの指示「撮ってきた画像を、ドラッグ＆ドロップで貼り付けたり、添付して貼り付けたり」）。
// 写真は長い辺を 1600画素までに縮めた JPEG にして、この端末の IndexedDB（様邸のデータとは別のデータベース）に入れる。
// 様邸の箇所には写真の番号（id）だけを持つ（Place.photos）。どの様邸からも使われなくなった写真は、開いたときに消す（prunePhotos）

import {useEffect, useState} from 'react';
import type {FramePic} from './photoImport.ts';
import type {Tiling} from './photoTile.ts';
import type {Box} from './shinsei.ts';
import {uid} from './util.ts';

const DB_NAME = 'taiyo-sasaoka-photos';
const STORE = 'photos';
/** 縮めたあとの長い辺（画素）。写真貼付用紙の枠（約 18cm）に 200dpi ほどで印刷できる */
const MAX_SIDE = 1600;

export type StoredPhoto = {id: string; blob: Blob; w: number; h: number; created: number};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, {keyPath: 'id'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('写真の保存場所を開けませんでした'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error ?? new Error('写真を保存できませんでした'));
        tx.onabort = () => reject(tx.error ?? new Error('写真を保存できませんでした'));
      }),
  );
}

/** 写真を入れて、番号を返す */
export async function putPhoto(p: {blob: Blob; w: number; h: number}): Promise<string> {
  const photo: StoredPhoto = {id: uid('ph'), blob: p.blob, w: p.w, h: p.h, created: Date.now()};
  await run('readwrite', (s) => s.put(photo));
  return photo.id;
}

/** 番号の写真（ないものは入らない） */
export async function getPhotos(ids: string[]): Promise<Map<string, StoredPhoto>> {
  const out = new Map<string, StoredPhoto>();
  if (ids.length === 0) return out;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    for (const id of new Set(ids)) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) out.set(id, req.result as StoredPhoto);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('写真を読めませんでした'));
  });
  return out;
}

/**
 * 様邸のどこかに書いてある文字すべて（使っている写真の番号）。箇所の写真（Place.photos）・平面図の図（Job.planPhoto）のほか、
 * この版の知らない項目（新しい版が足した項目）の写真も消さないように、項目の名前では選ばずに文字をみな数える
 */
export function photoIdsInUse(jobs: unknown): Set<string> {
  const keep = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') keep.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(jobs);
  return keep;
}

/** どの様邸からも使われていない写真を消す（keep にない、before より前に入れたもの。ほかのタブで入れたばかりの写真は消さない） */
export async function prunePhotos(keep: Set<string>, before: number): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).openCursor();
    let removed = 0;
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const p = cur.value as StoredPhoto;
      if (!keep.has(p.id) && p.created < before) {
        cur.delete();
        urlCache.delete(p.id);
        brightCache.delete(p.id);
        removed++;
      }
      cur.continue();
    };
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error ?? new Error('写真を整理できませんでした'));
  });
}

/** 画像のファイルを読む（スマホの写真の向き＝EXIF の向きのとおり）。createImageBitmap が使えないときは img で */
async function decode(file: Blob): Promise<{draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; done: () => void}> {
  try {
    const bmp = await createImageBitmap(file, {imageOrientation: 'from-image'});
    return {draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), width: bmp.width, height: bmp.height, done: () => bmp.close()};
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('写真を読めませんでした');
    }
    return {draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url)};
  }
}

/**
 * 写真の撮影日（'YYYY-MM-DD'）：スマホ・デジカメの写真（JPEG）に入っている撮影日時（Exif の DateTimeOriginal。なければ DateTimeDigitized・DateTime）。
 * 入っていなければ ''（ユーザーの指示「日付入り写真で添付するときは、自動で読み取って日付をいれる」、2026-10-21）。
 * 縮めた JPEG（preparePhoto）には残らないので、元のファイルから読む
 */
export async function photoTakenDate(file: Blob): Promise<string> {
  try {
    return exifDate(new DataView(await file.slice(0, 256 * 1024).arrayBuffer()));
  } catch {
    return '';
  }
}

/** JPEG の先頭（Exif の入った APP1 は画像のデータより前）から撮影日を読む */
export function exifDate(v: DataView): string {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return '';
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if (marker >> 8 !== 0xff || marker === 0xffda || marker === 0xffd9) return '';
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) {
      return tiffDate(v, off + 10, Math.min(v.byteLength, off + 2 + len)); // 「Exif\0\0」のうしろ
    }
    off += 2 + len;
  }
  return '';
}

function tiffDate(v: DataView, start: number, end: number): string {
  if (start + 8 > end) return '';
  const little = v.getUint16(start) === 0x4949; // II＝リトルエンディアン、MM＝ビッグエンディアン
  const u16 = (o: number) => v.getUint16(start + o, little);
  const u32 = (o: number) => v.getUint32(start + o, little);
  if (u16(2) !== 42) return '';
  // IFD の日時（文字 19けた「2026:10:21 09:30:00」）と、Exif の IFD の場所
  const read = (ifd: number) => {
    const dates = new Map<number, string>();
    let sub = 0;
    if (ifd <= 0 || start + ifd + 2 > end) return {dates, sub};
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (start + e + 12 > end) break;
      const tag = u16(e);
      if (tag === 0x8769) sub = u32(e + 8);
      else if ((tag === 0x9003 || tag === 0x9004 || tag === 0x0132) && u16(e + 2) === 2 && u32(e + 4) >= 19) {
        const at = start + u32(e + 8);
        if (at + 19 <= end) dates.set(tag, String.fromCharCode(...Array.from({length: 19}, (_, k) => v.getUint8(at + k))));
      }
    }
    return {dates, sub};
  };
  const top = read(u32(4));
  const exif = read(top.sub).dates;
  const raw = exif.get(0x9003) ?? exif.get(0x9004) ?? top.dates.get(0x0132) ?? '';
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(raw);
  if (!m || m[1] === '0000' || m[2] === '00' || m[3] === '00') return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** 撮ってきた写真を、長い辺 1600画素までの JPEG にする */
export async function preparePhoto(file: Blob): Promise<{blob: Blob; w: number; h: number}> {
  const src = await decode(file);
  try {
    const k = Math.min(1, MAX_SIDE / Math.max(src.width, src.height, 1));
    const w = Math.max(1, Math.round(src.width * k));
    const h = Math.max(1, Math.round(src.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('写真を読めませんでした');
    ctx.fillStyle = '#fff'; // 透明な部分（PNG）は白
    ctx.fillRect(0, 0, w, h);
    src.draw(ctx, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('写真を読めませんでした'))), 'image/jpeg', 0.85));
    return {blob, w, h};
  } finally {
    src.done();
  }
}

/**
 * 取り込んだ申請書（Excel）の枠の写真を1枚にまとめる（photoImport.ts の frameLayout の範囲 region。シートの画素）。写真ごとに切り抜き・左右上下の反転・回転をして、
 * Excel と同じ位置に描く（写真のない所は白）。大きさは写真のもとの細かさに合わせ、長い辺は MAX_SIDE まで（preparePhoto と同じ）。どの写真も読めなければ null
 */
export async function composeFrame(region: Box, pics: FramePic[]): Promise<{blob: Blob; w: number; h: number} | null> {
  const loaded: {pic: FramePic; bmp: ImageBitmap}[] = [];
  for (const pic of pics) {
    try {
      loaded.push({pic, bmp: await createImageBitmap(new Blob([pic.bytes as BlobPart], {type: pic.type}), {imageOrientation: 'from-image'})});
    } catch {
      // 読めない写真（壊れた画像など）は飛ばす
    }
  }
  if (loaded.length === 0) return null;
  try {
    const fine = Math.max(1, ...loaded.map(({pic, bmp}) => (bmp.width * (1 - pic.crop.l - pic.crop.r)) / Math.max(1, pic.box.w)));
    const k = Math.min(fine, MAX_SIDE / Math.max(region.w, region.h, 1));
    const [w, h] = [Math.max(1, Math.round(region.w * k)), Math.max(1, Math.round(region.h * k))];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    for (const {pic, bmp} of loaded) {
      const {l, t, r, b} = pic.crop;
      ctx.save();
      ctx.translate((pic.box.x + pic.box.w / 2 - region.x) * k, (pic.box.y + pic.box.h / 2 - region.y) * k);
      ctx.rotate((pic.rot * Math.PI) / 180);
      ctx.scale(pic.flipH ? -1 : 1, pic.flipV ? -1 : 1);
      ctx.drawImage(bmp, bmp.width * l, bmp.height * t, bmp.width * (1 - l - r), bmp.height * (1 - t - b), (-pic.box.w * k) / 2, (-pic.box.h * k) / 2, pic.box.w * k, pic.box.h * k);
      ctx.restore();
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((x) => (x ? resolve(x) : reject(new Error('写真を読めませんでした'))), 'image/jpeg', 0.85));
    return {blob, w, h};
  } finally {
    for (const {bmp} of loaded) bmp.close();
  }
}

/** 並べた写真の絵の長い辺（画素）。2枚並べても1枚が細かすぎないように、1枚の写真（MAX_SIDE）より少し大きく */
const TILE_MAX_SIDE = 2000;

/**
 * 1つの枠に何枚かの写真を並べた絵を作る（photoTile.ts の並べ方。ユーザーの指示「追加で写真を追加できる機能もつける」2026-10-29）。
 * 写真ごとに rot（右回りの度）だけ回して、並べ方の場所（回したあとの外側の四角）に描く。あいだ・余りは白
 */
export async function composeTiles(items: {blob: Blob; w: number; h: number; rot: number}[], tiling: Tiling): Promise<{blob: Blob; w: number; h: number}> {
  const bmps = await Promise.all(items.map((x) => createImageBitmap(x.blob, {imageOrientation: 'from-image'})));
  try {
    const bounds = items.map(({w, h, rot}) => {
      const t = (rot * Math.PI) / 180;
      const [c, s] = [Math.abs(Math.cos(t)), Math.abs(Math.sin(t))];
      return {bw: w * c + h * s, bh: w * s + h * c};
    });
    // もとの写真の細かさに合わせ（いちばん細かい写真が縮まない大きさ）、長い辺は TILE_MAX_SIDE まで
    const fine = Math.max(1, ...bounds.map((b, i) => b.bw / Math.max(1e-6, tiling.rects[i].w * tiling.w)));
    const k = Math.min(fine, TILE_MAX_SIDE / Math.max(tiling.w, tiling.h));
    const [W, H] = [Math.max(1, Math.round(tiling.w * k)), Math.max(1, Math.round(tiling.h * k))];
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('写真を並べられませんでした');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    items.forEach((x, i) => {
      const r = tiling.rects[i];
      const s = (r.w * W) / Math.max(1e-6, bounds[i].bw); // 写真の画素 → 並べた絵の画素
      ctx.save();
      ctx.translate((r.x + r.w / 2) * W, (r.y + r.h / 2) * H);
      ctx.rotate((x.rot * Math.PI) / 180);
      ctx.drawImage(bmps[i], (-x.w * s) / 2, (-x.h * s) / 2, x.w * s, x.h * s);
      ctx.restore();
    });
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('写真を並べられませんでした'))), 'image/jpeg', 0.85));
    return {blob, w: W, h: H};
  } finally {
    for (const b of bmps) b.close();
  }
}

// ---------------------------------------------------------------- 明るさの補正

/** 明るさの補正のめやす：平均の明るさ（0〜255）をここまで上げる。これより明るい写真は直さない */
const BRIGHT_TARGET = 145;
/** いちばん強く明るくするとき（ガンマ）。これより強くすると暗い所のざらつきが目立つ */
const BRIGHT_MAX_GAMMA = 1.8;

/**
 * 暗い写真を明るくする表（0〜255 → 0〜255）。直さなくてよい写真は null。
 * ユーザーの指示（2026-10-22）「画像は少し暗いので、適宜明るさの調整をおこない、エクセルにおとす」：
 * 平均の明るさ（Y＝0.299R＋0.587G＋0.114B を step 画素おきに）が BRIGHT_TARGET より暗ければ、平均がおよそ BRIGHT_TARGET になるガンマで
 * 暗い所・中ほどを持ち上げる（真っ白・真っ黒はそのまま＝窓や白い壁・日付の文字を白く飛ばさない）。data は RGBA の並び
 */
export function brightLut(data: Uint8ClampedArray | number[], step = 4): number[] | null {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += 4 * step) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  const mean = n ? sum / n : 255;
  if (mean <= 1 || mean >= BRIGHT_TARGET) return null;
  const gamma = Math.min(BRIGHT_MAX_GAMMA, Math.log(mean / 255) / Math.log(BRIGHT_TARGET / 255));
  if (gamma < 1.05) return null;
  return Array.from({length: 256}, (_, v) => Math.round(255 * (v / 255) ** (1 / gamma)));
}

/** 明るさを補正した写真（番号ごとに一度だけ作る）。直さなくてよい写真・読めない写真はそのまま */
const brightCache = new Map<string, Promise<Blob>>();

export function brightPhoto(id: string, blob: Blob): Promise<Blob> {
  let p = brightCache.get(id);
  if (!p) {
    p = brighten(blob).catch(() => blob);
    brightCache.set(id, p);
  }
  return p;
}

async function brighten(blob: Blob): Promise<Blob> {
  const src = await decode(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return blob;
    src.draw(ctx, src.width, src.height);
    const img = ctx.getImageData(0, 0, src.width, src.height);
    const lut = brightLut(img.data);
    if (!lut) return blob;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
    ctx.putImageData(img, 0, 0);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.9));
  } finally {
    src.done();
  }
}

/**
 * 写真を画面に出す URL（一度作ったものは覚えておく）。この端末にない写真（ほかの端末で入れた・バックアップから戻した様邸）は null。
 * 画面（写真の欄・プレビュー）も Excel と同じく、暗い写真は明るさを補正したもの（`brightPhoto`）
 */
const urlCache = new Map<string, PhotoUrl | null>();

export type PhotoUrl = {url: string; w: number; h: number};

/** 写真の URL と大きさ（番号 → URL。この端末にない写真は null）。読み込むまでは入らない */
export function usePhotoUrls(ids: string[]): Record<string, PhotoUrl | null> {
  const key = [...new Set(ids.filter(Boolean))].sort().join(',');
  const [, setTick] = useState(0);
  useEffect(() => {
    const missing = key ? key.split(',').filter((id) => !urlCache.has(id)) : [];
    if (missing.length === 0) return;
    let alive = true;
    void getPhotos(missing)
      .then(async (found) => {
        const shown = await Promise.all(missing.map(async (id) => [id, found.get(id), found.has(id) ? await brightPhoto(id, found.get(id)!.blob) : null] as const));
        for (const [id, p, blob] of shown) {
          if (!urlCache.has(id)) urlCache.set(id, p && blob ? {url: URL.createObjectURL(blob), w: p.w, h: p.h} : null);
        }
        if (alive) setTick((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  const out: Record<string, PhotoUrl | null> = {};
  for (const id of key ? key.split(',') : []) {
    const u = urlCache.get(id);
    if (u !== undefined) out[id] = u;
  }
  return out;
}

/** 入れたばかりの写真を、読み直さずに出せるように覚えておく（明るさを補正してから） */
export function rememberPhotoUrl(id: string, blob: Blob, w: number, h: number): void {
  void brightPhoto(id, blob).then((b) => {
    if (!urlCache.has(id)) urlCache.set(id, {url: URL.createObjectURL(b), w, h});
  });
}

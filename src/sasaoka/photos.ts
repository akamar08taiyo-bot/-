// 写真貼付用紙の写真（ユーザーの指示「撮ってきた画像を、ドラッグ＆ドロップで貼り付けたり、添付して貼り付けたり」）。
// 写真は長い辺を 1600画素までに縮めた JPEG にして、この端末の IndexedDB（様邸のデータとは別のデータベース）に入れる。
// 様邸の箇所には写真の番号（id）だけを持つ（Place.photos）。どの様邸からも使われなくなった写真は、開いたときに消す（prunePhotos）

import {useEffect, useState} from 'react';
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

/** 写真を画面に出す URL（一度作ったものは覚えておく）。この端末にない写真（ほかの端末で入れた・バックアップから戻した様邸）は null */
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
    void getPhotos(missing).then(
      (found) => {
        for (const id of missing) {
          const p = found.get(id);
          if (!urlCache.has(id)) urlCache.set(id, p ? {url: URL.createObjectURL(p.blob), w: p.w, h: p.h} : null);
        }
        if (alive) setTick((n) => n + 1);
      },
      () => undefined,
    );
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

/** 入れたばかりの写真を、読み直さずに出せるように覚えておく */
export function rememberPhotoUrl(id: string, blob: Blob, w: number, h: number): void {
  if (!urlCache.has(id)) urlCache.set(id, {url: URL.createObjectURL(blob), w, h});
}

// 様邸のデータ（携帯で作ったものをパソコンへ送る。ユーザーの指示「携帯で作成したものを、パソコンに送った場合、パソコンで同様のアプリが入っているため
// そのまま（申請書、見積もりなど全て）、共有したい。データをあずけるのは一旦保留にしているため、リンクでもいいので共有したい。開くとパソコンの中のアプリで同期させる」2026-10-30）。
// サーバーにデータを置かないので、1つの様邸のすべて（申請書・見積書・理由書の内容＝様邸、写真・平面図の図、特定福祉用具の案件）を1つのファイル（.json）にして、
// 「📗 Excelで保存」「✉ メールで送付」で一緒に送る（DocsDialog.tsx）。リンクには写真が入りきらない（数MB）ので、ファイルにした。
// パソコンでは「📥 取り込む」にそのファイルをドロップすると、同じ様邸（同じ番号）は送ったデータで置きかえ、なければ足す（DocImport.tsx）。写真は同じ番号で入れる
import {cleanJobs} from './storage.ts';
import type {Job} from './types.ts';
import {customerFilePart} from './util.ts';

export const JOB_SHARE_KIND = 'taiyo-jutaku-job';
export const JOB_SHARE_TYPE = 'application/json';

export type SharedPhoto = {id: string; w: number; h: number; type: string; bytes: Uint8Array};
export type JobPackage = {exportedAt: string; job: Job; photos: SharedPhoto[]; tokutei: unknown};

/** ファイルの名前（「見本六郎様_様邸データ.json」） */
export const jobPackageName = (job: Pick<Job, 'customer'>) => `${customerFilePart(job.customer)}_様邸データ.json`;

/** バイト列 → base64（大きな写真でも引数の数の上限にかからないよう、少しずつ） */
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 様邸のデータのファイルの中身（JSON の文字） */
export function jobPackageJson(job: Job, photos: SharedPhoto[], tokutei: unknown, now = new Date()): string {
  return JSON.stringify({
    kind: JOB_SHARE_KIND,
    version: 1,
    exportedAt: now.toISOString(),
    job,
    photos: photos.map((p) => ({id: p.id, w: p.w, h: p.h, type: p.type, data: toBase64(p.bytes)})),
    tokutei: tokutei ?? null,
  });
}

/** このアプリの様邸のデータのファイルか（取り込みで、申請書などの Excel と分ける） */
export function isJobPackage(text: string): boolean {
  return text.trimStart().startsWith('{') && text.includes(`"${JOB_SHARE_KIND}"`);
}

/** 様邸のデータのファイルを読む（様邸はこのアプリの読み込みと同じ直し方＝cleanJobs。写真は番号・大きさ・中身のあるものだけ） */
export function parseJobPackage(text: string): JobPackage {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || raw.kind !== JOB_SHARE_KIND) throw new Error('様邸のデータのファイルではありません');
  const [job] = cleanJobs([raw.job]);
  if (!job) throw new Error('様邸が入っていません');
  const photos: SharedPhoto[] = [];
  for (const p of Array.isArray(raw.photos) ? raw.photos : []) {
    if (!p || typeof p !== 'object') continue;
    const {id, w, h, type, data} = p as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof data !== 'string' || !(Number(w) > 0) || !(Number(h) > 0)) continue;
    photos.push({id, w: Number(w), h: Number(h), type: typeof type === 'string' && type ? type : 'image/jpeg', bytes: fromBase64(data)});
  }
  return {exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', job, photos, tokutei: raw.tokutei && typeof raw.tokutei === 'object' ? raw.tokutei : null};
}

/** 取り込む前に見せる中身（改修の箇所・見積書の行・写真・特定福祉用具の商品の数） */
export function jobPackageSummary(p: JobPackage): {places: number; rows: number; photos: number; tokuteiItems: number | null} {
  const items = p.tokutei && Array.isArray((p.tokutei as {items?: unknown}).items) ? (p.tokutei as {items: unknown[]}).items.length : null;
  return {
    places: p.job.places.length,
    rows: p.job.places.reduce((n, pl) => n + pl.rows.length, 0),
    photos: p.photos.length,
    tokuteiItems: items,
  };
}

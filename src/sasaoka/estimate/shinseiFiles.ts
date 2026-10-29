// 申請書の原本（アプリの中に入れておく）。いただいた原本から、前の申請の名残り（被保険者の氏名・番号・電話・工事内容・写真・平面図・
// 性別などの丸）だけを消したもの（シート・様式・会社の情報はそのまま）。原本を替えるときは src/sasaoka/shinsei/ のファイルを置きかえる（転記する欄は shinsei.ts の SHINSEI）

import {unzipSync} from 'fflate';
import {useEffect, useState} from 'react';
import {downloadBlob} from '../util.ts';
import {XLSX_TYPE} from '../estimateXlsx.ts';
import {photoNumbers} from '../estimateForms.ts';
import {brightPhoto, getPhotos} from '../photos.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {fillShinseiFiles, SHINSEI, shinseiFileName, shinseiValues} from '../shinsei.ts';
import type {Files, PhotoImage, PhotoImages} from '../shinsei.ts';
import type {Insurer, Job, Settings} from '../types.ts';
import fukuoka from '../shinsei/fukuoka.xltx?inline';
import kitakyushu from '../shinsei/kitakyushu.xltx?inline';
import kanda from '../shinsei/kanda.xltx?inline';
import kouiki from '../shinsei/kouiki.xltx?inline';
import miyako from '../shinsei/miyako.xltx?inline';
import yukuhashi from '../shinsei/yukuhashi.xltx?inline';
import riyu from '../shinsei/riyu.xltx?inline';
import {RIYU_MAP, riyuFileName, riyuValues} from '../riyu.ts';

/** 原本：保険者ごとの申請書と、住宅改修が必要な理由書（国の様式。どの保険者も同じ） */
export type TemplateKey = Insurer | 'riyu';
const TEMPLATES: Partial<Record<TemplateKey, string>> = {kanda, yukuhashi, miyako, kouiki, fukuoka, kitakyushu, riyu};

/** この保険者の申請書を作れるか（原本をいただいた保険者だけ） */
export const canMakeShinsei = (insurer: Insurer | '') => !!insurer && !!TEMPLATES[insurer] && !!SHINSEI[insurer];

const opened = new Map<TemplateKey, Promise<Files>>();

/** 原本を開いたもの（はじめの1回だけ開いて覚えておく。プレビューで打つたびに開き直さない） */
export function openTemplate(insurer: TemplateKey): Promise<Files> {
  const url = TEMPLATES[insurer];
  if (!url) return Promise.reject(new Error('この保険者の申請書の原本がありません'));
  let p = opened.get(insurer);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => unzipSync(new Uint8Array(b)));
    p.catch(() => opened.delete(insurer)); // 開けなかったら次にもう一度
    opened.set(insurer, p);
  }
  return p;
}

/** 原本を開いたもの（開くまでは null） */
export function useTemplate(insurer: TemplateKey | ''): Files | null {
  const [got, setGot] = useState<{insurer: TemplateKey; files: Files} | null>(null);
  useEffect(() => {
    if (!insurer || !TEMPLATES[insurer]) return;
    let alive = true;
    openTemplate(insurer).then(
      (files) => alive && setGot({insurer, files}),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [insurer]);
  return got && got.insurer === insurer ? got.files : null;
}

/**
 * 写真貼付用紙に貼る写真（写真番号 → 改修前・改修後）。写真はこの端末に入れたもの（photos.ts）。
 * missing：様邸に写真はあるのに、この端末にない枚数（ほかの端末で入れた写真）。
 * unreadable：この端末にあるのに読めなかった枚数（写真の入れ物を開けない・ファイルが読めない。前は黙って写真なしで保存し「保存しました」だけ出ていた）
 */
async function photoImagesOf(job: Job, s: Settings): Promise<{images: Record<number, PhotoImages>; missing: number; unreadable: number}> {
  const nos = photoNumbers(job, s);
  const places = job.places.filter((p) => nos.has(p.id) && p.photos);
  const ids = places.flatMap((p) => [p.photos?.before ?? '', p.photos?.after ?? '']).filter(Boolean);
  const images: Record<number, PhotoImages> = {};
  if (ids.length === 0) return {images, missing: 0, unreadable: 0};
  const found = await getPhotos(ids).catch(() => null);
  if (!found) return {images, missing: 0, unreadable: ids.length};
  let missing = 0;
  let unreadable = 0;
  for (const p of places) {
    const n = nos.get(p.id) ?? 0;
    for (const slot of ['before', 'after'] as const) {
      const id = p.photos?.[slot];
      if (!id) continue;
      const photo = found.get(id);
      if (!photo) {
        missing++;
        continue;
      }
      // 同じ写真番号の箇所が2つ（写真番号を手で同じにした）なら、先の箇所の写真
      if (images[n]?.[slot]) continue;
      // 暗い写真は明るさを補正して貼る（画面と同じ。`brightPhoto`）
      try {
        const blob = await brightPhoto(id, photo.blob);
        images[n] = {...images[n], [slot]: {bytes: new Uint8Array(await blob.arrayBuffer()), w: photo.w, h: photo.h, edit: p.photoEdits?.[slot], marks: p.photoMarks?.[slot]}};
      } catch {
        unreadable++;
      }
    }
  }
  return {images, missing, unreadable};
}

/**
 * 平面図の図（Job.planPhoto。写真と同じくこの端末に入れたもの）。画面と同じく、暗い図は明るさを補正したもの。
 * 図のない様邸は image なし。missing＝この端末にない（ほかの端末で入れた）、unreadable＝この端末にあるのに読めなかった
 */
async function planImageOf(job: Job): Promise<{image?: PhotoImage; missing: boolean; unreadable: boolean}> {
  const id = job.planPhoto;
  if (!id) return {missing: false, unreadable: false};
  const found = await getPhotos([id]).catch(() => null);
  const photo = found?.get(id);
  if (!found || !photo) return {missing: !!found, unreadable: !found};
  try {
    const blob = await brightPhoto(id, photo.blob);
    return {image: {bytes: new Uint8Array(await blob.arrayBuffer()), w: photo.w, h: photo.h, ...(job.planMarks?.length ? {marks: job.planMarks} : {})}, missing: false, unreadable: false};
  } catch {
    return {missing: false, unreadable: true};
  }
}

/**
 * 見積書の内容を転記した申請書（Excel）を保存する（ダウンロード）。保存したファイル名と、この端末になくて貼れなかった写真・読めなくて貼れなかった写真の枚数、
 * 平面図の図を貼れなかったか（この端末にない・読めない）を返す
 */
export async function saveShinsei(job: Job, insurer: Insurer, s: Settings): Promise<{fileName: string; missingPhotos: number; unreadablePhotos: number; planMissing: boolean}> {
  const {bytes, ...rest} = await shinseiBook(job, insurer, s);
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), rest.fileName);
  return rest;
}

/** 申請書（Excel）を作る（保存はしない。「まとめて保存」でも使う）。中身と、貼れなかった写真・平面図 */
export async function shinseiBook(job: Job, insurer: Insurer, s: Settings): Promise<{bytes: Uint8Array; fileName: string; missingPhotos: number; unreadablePhotos: number; planMissing: boolean}> {
  const map = SHINSEI[insurer];
  if (!map) throw new Error('この保険者の申請書の原本がありません');
  const photos = await photoImagesOf(job, s);
  const plan = await planImageOf(job);
  const bytes = fillShinseiFiles({...(await openTemplate(insurer))}, map, {...shinseiValues(job, s), photoImages: photos.images, planImage: plan.image});
  return {bytes, fileName: shinseiFileName(map, job, estimateDateOf(job)), missingPhotos: photos.missing, unreadablePhotos: photos.unreadable, planMissing: plan.missing || plan.unreadable};
}

/** 住宅改修が必要な理由書（Excel）を保存する（ダウンロード）。保存したファイル名を返す（「山田花子様住宅改修理由書.xlsx」） */
export async function saveRiyu(job: Job, s: Settings): Promise<string> {
  const bytes = fillShinseiFiles({...(await openTemplate('riyu'))}, RIYU_MAP, riyuValues(job, s));
  const fileName = riyuFileName(job);
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), fileName);
  return fileName;
}

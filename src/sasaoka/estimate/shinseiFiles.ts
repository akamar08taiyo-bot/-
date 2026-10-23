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
import type {Files, PhotoImages} from '../shinsei.ts';
import type {Insurer, Job, Settings} from '../types.ts';
import kanda from '../shinsei/kanda.xltx?inline';
import kouiki from '../shinsei/kouiki.xltx?inline';
import miyako from '../shinsei/miyako.xltx?inline';
import yukuhashi from '../shinsei/yukuhashi.xltx?inline';
import riyu from '../shinsei/riyu.xltx?inline';
import {RIYU_MAP, riyuFileName, riyuValues} from '../riyu.ts';

/** 原本：保険者ごとの申請書と、住宅改修が必要な理由書（国の様式。どの保険者も同じ） */
export type TemplateKey = Insurer | 'riyu';
const TEMPLATES: Partial<Record<TemplateKey, string>> = {kanda, yukuhashi, miyako, kouiki, riyu};

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
        images[n] = {...images[n], [slot]: {bytes: new Uint8Array(await blob.arrayBuffer()), w: photo.w, h: photo.h, edit: p.photoEdits?.[slot]}};
      } catch {
        unreadable++;
      }
    }
  }
  return {images, missing, unreadable};
}

/** 見積書の内容を転記した申請書（Excel）を保存する（ダウンロード）。保存したファイル名と、この端末になくて貼れなかった写真・読めなくて貼れなかった写真の枚数を返す */
export async function saveShinsei(job: Job, insurer: Insurer, s: Settings): Promise<{fileName: string; missingPhotos: number; unreadablePhotos: number}> {
  const map = SHINSEI[insurer];
  if (!map) throw new Error('この保険者の申請書の原本がありません');
  const photos = await photoImagesOf(job, s);
  const bytes = fillShinseiFiles({...(await openTemplate(insurer))}, map, {...shinseiValues(job, s), photoImages: photos.images});
  const fileName = shinseiFileName(map, job, estimateDateOf(job));
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), fileName);
  return {fileName, missingPhotos: photos.missing, unreadablePhotos: photos.unreadable};
}

/** 住宅改修が必要な理由書（Excel）を保存する（ダウンロード）。保存したファイル名を返す（「山田花子様住宅改修理由書.xlsx」） */
export async function saveRiyu(job: Job, s: Settings): Promise<string> {
  const bytes = fillShinseiFiles({...(await openTemplate('riyu'))}, RIYU_MAP, riyuValues(job, s));
  const fileName = riyuFileName(job);
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), fileName);
  return fileName;
}

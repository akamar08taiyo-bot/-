// 申請書の平面図の枠に出す平面図の図（ユーザーの指示「平面図は、申請書でもつくれるし、平面図専用からもつくれる。相互転記させる」2026-11-10）。
// 申請書の枠と平面図のタブは同じ図（Job.madori）。申請書の画面・印刷はこの SVG を、申請書の Excel はこの JPEG を、そのときの平面図から作る
// （前は「申請書の平面図に入れる」を押したときの絵を写真として入れていて、あとで平面図を直しても申請書は前のままだった）

import {useEffect, useState} from 'react';
import {brightPhoto, getPhotos} from '../photos.ts';
import type {Job, Settings} from '../types.ts';
import type {Madori} from './model.ts';
import {placeLookup, planLinked, planSvg, printedUnderlay, sheetFloors, svgToPng} from './sheet.ts';

const dataUrl = (b: Blob) =>
  new Promise<string>((ok, ng) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ng(r.error);
    r.readAsDataURL(b);
  });

/** 図に入れる下絵の写真（data: の URL。画像にした SVG の中でも写るように。暗い図は写真と同じく明るさを補正）。この端末にない・読めない写真は入れない */
export async function underlayImages(m: Madori): Promise<Record<string, string>> {
  const ids = [...new Set(m.floors.map((f) => printedUnderlay(f)?.photo).filter((x): x is string => !!x))];
  if (!ids.length) return {};
  const found = await getPhotos(ids).catch(() => null);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const p = found?.get(id);
    if (!p) continue;
    try {
      out[id] = await dataUrl(await brightPhoto(id, p.blob));
    } catch {
      /* 読めない写真は描かない（部品だけの図にする） */
    }
  }
  return out;
}

/** 申請書の平面図の枠の図（SVG。幅・高さは mm＝縦横の比だけ使う） */
export async function madoriPlanSvg(job: Job, s: Settings): Promise<{svg: string; w: number; h: number} | null> {
  if (!planLinked(job) || !job.madori) return null;
  const m = job.madori;
  return planSvg(m, sheetFloors(m), placeLookup(job, s).no, 'sp', await underlayImages(m));
}

/** 申請書の Excel に貼る平面図の図（JPEG。長い辺 2400 画素） */
export async function madoriPlanJpeg(job: Job, s: Settings): Promise<{bytes: Uint8Array; w: number; h: number} | null> {
  const p = await madoriPlanSvg(job, s);
  if (!p) return null;
  const {blob, w, h} = await svgToPng(p.svg, p.w, p.h, 2400, 'image/jpeg');
  return {bytes: new Uint8Array(await blob.arrayBuffer()), w, h};
}

/**
 * 申請書の画面・印刷の平面図の枠に出す図（つながっていないときは null）。平面図が変わるたびに作り直す（少し待ってから。打っているあいだは作らない）
 */
export function useMadoriPlan(job: Job, s: Settings): {url: string; w: number; h: number} | null {
  const [img, setImg] = useState<{url: string; w: number; h: number} | null>(null);
  const linked = planLinked(job);
  useEffect(() => {
    if (!linked) {
      setImg(null);
      return;
    }
    let off = false;
    let url = '';
    const t = window.setTimeout(() => {
      void madoriPlanSvg(job, s).then((p) => {
        if (off || !p) return;
        url = URL.createObjectURL(new Blob([p.svg], {type: 'image/svg+xml'}));
        setImg({url, w: p.w, h: p.h});
      });
    }, 120);
    return () => {
      off = true;
      window.clearTimeout(t);
      // 前の図の URL は、次の図に替わったあとで捨てる（画面が白くならないように少し待つ）
      if (url) window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
  }, [linked, job.madori, job.places, s]); // eslint-disable-line react-hooks/exhaustive-deps
  return linked ? img : null;
}

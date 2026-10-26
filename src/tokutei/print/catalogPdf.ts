// カタログの PDF（1ページ）を読んで、印刷用の絵（JPEG）と品番の一覧（catalog.ts の pageCodes）にする。
// PDF をそのまま開いて印刷するとブラウザ・端末ごとに出方がちがうので（iPad は印刷のボタンが出ないことがある）、
// 絵にして見積書・申請書と同じ印刷の画面（A4縦）で出す。
import {pageCodes} from '../catalog.ts';
import {openPdf} from '../import/pdfText.ts';

/** 印刷の細かさ（A4 で 200dpi ＝ 1654×2339 ほど） */
const DPI = 200;

export type CatalogImage = {url: string; codes: Set<string>; text: string}; // text：ページの文字（カタログから検索に使う）

/** catalog/ の PDF の場所（住宅改修のタブの中の枠でも、このアプリの index.html の隣） */
export const catalogUrl = (file: string) => new URL(`catalog/${file}`, document.baseURI).href;

export async function loadCatalogPage(file: string): Promise<CatalogImage> {
  const res = await fetch(catalogUrl(file));
  if (!res.ok) throw new Error(`${res.status}`);
  const task = await openPdf(new Uint8Array(await res.arrayBuffer()));
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
    const viewport = page.getViewport({scale: DPI / 72});
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({canvas, canvasContext: ctx, viewport}).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) throw new Error('image');
    return {url: URL.createObjectURL(blob), codes: pageCodes(text), text};
  } finally {
    await task.destroy();
  }
}

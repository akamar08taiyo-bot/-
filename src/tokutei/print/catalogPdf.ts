// カタログの PDF（1ページ）を読んで、印刷用の絵（JPEG）と品番の一覧（catalog.ts の pageCodes）にする。
// PDF をそのまま開いて印刷するとブラウザ・端末ごとに出方がちがうので（iPad は印刷のボタンが出ないことがある）、
// 絵にして見積書・申請書と同じ印刷の画面（A4縦）で出す。
import {CATALOG, pageCodes} from '../catalog.ts';
import {parseCatalogPage} from '../catalogItems.ts';
import type {CatalogProduct, PdfText} from '../catalogItems.ts';
import {openPdf} from '../import/pdfText.ts';

/** 印刷の細かさ（A4 で 200dpi ＝ 1654×2339 ほど） */
const DPI = 200;

export type CatalogImage = {url: string; codes: Set<string>; text: string}; // text：ページの文字（カタログから検索に使う）

/** catalog/ の PDF の場所（住宅改修のタブの中の枠でも、このアプリの index.html の隣） */
export const catalogUrl = (file: string) => new URL(`catalog/${file}`, document.baseURI).href;

/** PDF（1ページ目）を開いて fn に渡す（終わったら閉じる） */
async function withPage<T>(file: string, fn: (page: PdfPage) => Promise<T>): Promise<T> {
  const res = await fetch(catalogUrl(file));
  if (!res.ok) throw new Error(`${res.status}`);
  const task = await openPdf(new Uint8Array(await res.arrayBuffer()));
  try {
    const doc = await task.promise;
    return await fn(await doc.getPage(1));
  } finally {
    await task.destroy();
  }
}
type PdfPage = Awaited<ReturnType<Awaited<Awaited<ReturnType<typeof openPdf>>['promise']>['getPage']>>;

const textOf = async (page: PdfPage) => (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');

/**
 * ページの文字だけ（カタログから検索に使う）。絵にしないので軽い。
 * カタログの窓は、前は開くと全部のページ（14ページ）を一度に絵にしていて、iPhone では開けなかった（ユーザーの話「携帯で特定福祉用具カタログを開こうとした場合に開けない」2026-10-30）
 */
export function loadCatalogText(file: string): Promise<string> {
  return withPage(file, textOf);
}

export async function loadCatalogPage(file: string): Promise<CatalogImage> {
  return withPage(file, async (page) => {
    const text = await textOf(page);
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
    // 絵にした画用紙（1654×2339 ほど）はすぐ空にする（iPhone の Safari は画用紙に使える大きさに上限があり、残しておくと次のページが描けない）
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error('image');
    return {url: URL.createObjectURL(blob), codes: pageCodes(text), text};
  });
}

/** ページの文字と位置（左上から pt。catalogItems.ts で商品の一覧にする） */
export function loadCatalogItems(file: string): Promise<PdfText[]> {
  return withPage(file, async (page) => {
    const vp = page.getViewport({scale: 1});
    const tc = await page.getTextContent();
    return tc.items.flatMap((i) => ('str' in i ? [{s: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: Math.abs(i.transform[3])}] : []));
  });
}

/**
 * カタログの全部のページの商品（ユーザーの指示「カタログに載っている商品、すべて取り込んでもらいたい」2026-10-30）。
 * はじめて使うときに1ページずつ読んで（文字だけ。絵にしない）、この画面を開いているあいだ覚えておく。読めなかったときは次にまた読む
 */
let products: Promise<CatalogProduct[]> | null = null;
export function loadCatalogProducts(): Promise<CatalogProduct[]> {
  if (!products) {
    products = (async () => {
      const out: CatalogProduct[] = [];
      for (const p of CATALOG) {
        try {
          out.push(...parseCatalogPage(await loadCatalogItems(p.file), p));
        } catch {
          // 読めなかったページはとばす
        }
      }
      if (!out.length) products = null;
      return out;
    })();
  }
  return products;
}

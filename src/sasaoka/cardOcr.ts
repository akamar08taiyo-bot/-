// 介護保険証（被保険者証・負担割合証）の画像・PDF を、この端末の中で読む（ブラウザ）。
// 読み方は cardRead.ts、取り出し方は hokensho.ts。画像・読んだ文字は保存せず、どこにも送らない（確かめる画面で見せるだけ）

import type {Worker} from 'tesseract.js';
import {grayOf} from './cardImage.ts';
import type {Gray} from './cardImage.ts';
import {OCR_MODES, readCardImage} from './cardRead.ts';
import type {OcrMode} from './cardRead.ts';
import {parseCard} from './hokensho.ts';
import type {CardRead, OcrPage} from './hokensho.ts';
import {withOcr} from './ocrEngine.ts';

/** 読める画像・PDF か */
export const isCardFile = (f: File) => /^image\//.test(f.type) || f.type === 'application/pdf' || /\.(pdf|jpe?g|png|heic|webp|gif|bmp|tiff?)$/i.test(f.name);

/** 1枚の画像の画素（長い辺 2400 画素まで） */
async function grayOfBlob(b: Blob): Promise<Gray> {
  const bmp = await createImageBitmap(b);
  try {
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height, 1));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', {willReadFrequently: true}) as CanvasRenderingContext2D;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return grayOf(ctx.getImageData(0, 0, w, h).data, w, h);
  } finally {
    bmp.close();
  }
}

/**
 * ファイルの画像（PDF はページごと。裏の白いページは読まない）。開けないファイル（Chrome の HEIC・パスワードのある PDF・こわれたファイル）は
 * 飛ばして名前を返し、ほかのファイルは読む（1つのために全部を読めなくしない）
 */
async function imagesOf(files: File[]): Promise<{images: Gray[]; skipped: string[]}> {
  const images: Gray[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    try {
      const got: Gray[] = [];
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        const {pdfToImages} = await import('./pdfText.ts');
        for (const page of await pdfToImages(new Uint8Array(await f.arrayBuffer()), 2400, 8)) {
          const g = await grayOfBlob(page);
          if (!blank(g)) got.push(g);
        }
      } else got.push(await grayOfBlob(f));
      images.push(...got);
    } catch {
      skipped.push(f.name || '貼り付けた画像');
    }
  }
  return {images, skipped};
}

/** ほとんど白いページ（スキャンした裏の面） */
function blank(img: Gray): boolean {
  let dark = 0;
  for (let i = 0; i < img.g.length; i += 7) if (img.g[i] < 128) dark++;
  return dark / (img.g.length / 7) < 0.004;
}

/** 濃さの画像 → canvas（tesseract.js に渡す） */
function canvasOf(img: Gray): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.w;
  c.height = img.h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const d = ctx.createImageData(img.w, img.h);
  for (let i = 0; i < img.g.length; i++) {
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = img.g[i];
    d.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/** 確かめる画面に出す小さな画像（回したあと。JPEG） */
function thumbOf(img: Gray): string {
  const k = Math.min(1, 1400 / Math.max(img.w, img.h));
  const c = canvasOf(img);
  if (k === 1) return c.toDataURL('image/jpeg', 0.8);
  const s = document.createElement('canvas');
  s.width = Math.round(img.w * k);
  s.height = Math.round(img.h * k);
  (s.getContext('2d') as CanvasRenderingContext2D).drawImage(c, 0, 0, s.width, s.height);
  return s.toDataURL('image/jpeg', 0.8);
}

async function recognizeWith(worker: Worker, img: Gray, mode: OcrMode): Promise<OcrPage> {
  await worker.setParameters({tessedit_pageseg_mode: OCR_MODES[mode].psm as never, tessedit_char_whitelist: OCR_MODES[mode].whitelist, textord_tabfind_vertical_text: '0'});
  const {data} = await worker.recognize(canvasOf(img), {}, {blocks: true});
  const lines = (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) =>
      p.lines.map((l) => ({
        words: l.words.map((w) => ({text: w.text, conf: w.confidence, ...w.bbox, chars: w.symbols.map((s) => ({text: s.text, ...s.bbox}))})),
      })),
    ),
  );
  return {lines, conf: data.confidence};
}

export type CardProgress = {step: string; page: number; pages: number};

/** やめるを押したか（押していたら、次の読み取りの前で止める） */
const stopIf = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('介護保険証を読むのをやめました', 'AbortError');
};

/**
 * 介護保険証のファイル（画像・PDF。何枚でも＝被保険者証と負担割合証、表と裏）を読む。
 * 返すのは、取り出した項目と、確かめる画面に出す画像（向きを直したもの）と、開けなかったファイルの名前。
 * signal：やめる（読み取りの部品は写真の日付と1つずつ使い回すので、途中でやめたら次の読み取りの前で止めて、ほかを待たせない）
 */
export async function readCards(files: File[], onProgress: (p: CardProgress) => void = () => undefined, signal?: AbortSignal): Promise<{read: CardRead; thumbs: string[]; skipped: string[]}> {
  onProgress({step: 'ファイルを開いています', page: 0, pages: 0});
  const {images, skipped} = await imagesOf(files);
  const pages: OcrPage[] = [];
  const thumbs: string[] = [];
  for (let i = 0; i < images.length; i++) {
    stopIf(signal);
    const res = await withOcr((worker) =>
      readCardImage(
        images[i],
        async (img, mode) => {
          stopIf(signal);
          return recognizeWith(worker, img, mode);
        },
        (step) => onProgress({step, page: i + 1, pages: images.length}),
      ),
    );
    pages.push(...res.pages);
    thumbs.push(thumbOf(res.image));
  }
  return {read: parseCard(pages), thumbs, skipped};
}

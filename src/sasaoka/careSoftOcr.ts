// 介護ソフトの画面のスクリーンショットを、この端末の中で読む（ブラウザ）。介護保険証の入口（CardReader.tsx の CardDrop）に入れた画像が、
// 介護ソフトの画面か介護保険証かもここで決める：画面らしい平らな地の画像1枚だけ、まず介護ソフトの画面として読み、
// 介護ソフトのラベル（認定情報・保険者情報・給付情報・委託先居宅 など）が見つからなければ、介護保険証として読む（cardOcr.ts）。
// 画面の小さな字は大きくしてから読み、数字の欄は切り出して数字だけにしぼって、フリガナ（小さな半角カタカナ）は横に引きのばして読み直す。
// 1回で読めない所があっても、画面を1行ずつ切り出して大きくして読み直し、まだ足りなければ下ごしらえを変えてもう1回読む（ユーザーの指示
// 「読み取れない場合でも何度も繰り返し考える」2026-10-23）。色の付いた所（名前の右のボタン・タスクの緑の帯・カレンダーの赤や青の字）は白くしてから読む。
// 取り出し方は careSoft.ts。tesseract.js の worker は ocrEngine.ts の withOcr で介護保険証・写真の日付と使い回す。画像・読んだ文字は保存せず、どこにも送らない

import type {Worker} from 'tesseract.js';
import {softRead} from './cardApply.ts';
import type {ReadResult} from './cardApply.ts';
import {readCards} from './cardOcr.ts';
import type {CardProgress} from './cardOcr.ts';
import {blankSplit, inkLines, kanaOfWords, kanaRect, mergeSoft, parseSoft, parseSoftPage, screenLike} from './careSoft.ts';
import type {SoftKey, SoftRead, SoftSpot} from './careSoft.ts';
import type {OcrPage} from './hokensho.ts';
import {withOcr} from './ocrEngine.ts';
import {todayIso} from './util.ts';

type Box = {x0: number; y0: number; x1: number; y1: number};

const KATAKANA = Array.from({length: 0x30f6 - 0x30a1 + 1}, (_, i) => String.fromCharCode(0x30a1 + i)).join('') + 'ー' + Array.from({length: 0xff9f - 0xff66 + 1}, (_, i) => String.fromCharCode(0xff66 + i)).join('');
/** 数字の欄を読み直すときの字（しぼると読み違いが減る） */
const SPOT_CHARS: Record<SoftSpot, string> = {
  birth: '0123456789明治大正昭和平成元年月日生歳',
  zip: '0123456789-',
  phone: '0123456789-',
  officeTel: '0123456789-',
  insuredNo: '0123456789',
  careTerm: '0123456789令和平成元年月日~-',
};

/** 色の付いた画素（赤・青・緑・紫・だいだい。字の黒・灰色・白はちがう） */
const colorful = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b) > 60;

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
/** やめるを押したか（押していたら、次の読み取りの前で止める。cardOcr.ts と同じ） */
const stopIf = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('介護ソフトの画面を読むのをやめました', 'AbortError');
};

/** 画像のファイル → canvas（長い辺 3200 画素まで） */
async function canvasOfFile(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  try {
    const k = Math.min(1, 3200 / Math.max(bmp.width, bmp.height, 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext('2d', {willReadFrequently: true}) as CanvasRenderingContext2D;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  } finally {
    bmp.close();
  }
}

/**
 * 読む画像を作る：rect の所（なければ全体）を、灰色にして scale 倍（横は sx 倍も）に大きくし、まわりに白い余白（pad）。
 * 色の付いた所（ボタン・帯の地と白い字）は白くする（字は黒・灰色だけ）。gamma：薄い灰色の小さなラベルを濃く、binary：白黒の2色に
 */
function prepared(src: HTMLCanvasElement, rect: Box | null, scale: number, opt: {gamma?: boolean; sx?: number; pad?: number; binary?: boolean} = {}): {canvas: HTMLCanvasElement; map: (x: number, y: number) => [number, number]} {
  const r = rect ?? {x0: 0, y0: 0, x1: src.width, y1: src.height};
  const x0 = Math.max(0, Math.floor(r.x0));
  const y0 = Math.max(0, Math.floor(r.y0));
  const w = Math.max(1, Math.min(src.width, Math.ceil(r.x1)) - x0);
  const h = Math.max(1, Math.min(src.height, Math.ceil(r.y1)) - y0);
  const sx = opt.sx ?? 1;
  const pad = opt.pad ?? 0;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale * sx) + pad * 2;
  c.height = Math.round(h * scale) + pad * 2;
  const ctx = c.getContext('2d', {willReadFrequently: true}) as CanvasRenderingContext2D;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x0, y0, w, h, pad, pad, c.width - pad * 2, c.height - pad * 2);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    let y = colorful(d.data[i], d.data[i + 1], d.data[i + 2]) ? 255 : 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    if (opt.gamma) y = 255 * Math.pow(Math.min(1, y / 235), 2.2);
    if (opt.binary) y = y < 175 ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = y;
  }
  ctx.putImageData(d, 0, 0);
  // 読んだ位置（大きくした画像）→ もとの画像の位置
  return {canvas: c, map: (x, y) => [(x - pad) / (scale * sx) + x0, (y - pad) / scale + y0]};
}

/** 読む（ページの分け方 psm・読む字 whitelist）。語・字の位置は、もとの画像の位置にして返す */
async function recognize(worker: Worker, img: ReturnType<typeof prepared>, psm: string, whitelist = ''): Promise<OcrPage & {text: string}> {
  await worker.setParameters({tessedit_pageseg_mode: psm as never, tessedit_char_whitelist: whitelist, textord_tabfind_vertical_text: '0'});
  const {data} = await worker.recognize(img.canvas, {}, {blocks: true});
  const box = (b: {x0: number; y0: number; x1: number; y1: number}) => {
    const [x0, y0] = img.map(b.x0, b.y0);
    const [x1, y1] = img.map(b.x1, b.y1);
    return {x0, y0, x1, y1};
  };
  const lines = (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.map((l) => ({words: l.words.map((w) => ({text: w.text, conf: w.confidence, ...box(w.bbox), chars: w.symbols.map((s) => ({text: s.text, ...box(s.bbox)}))}))}))),
  );
  return {lines, conf: data.confidence, text: lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n')};
}

/** 確かめる画面に出す画像（もとの色のまま。大きければ縮める） */
function thumbOf(src: HTMLCanvasElement): string {
  const k = Math.min(1, 1400 / Math.max(src.width, src.height));
  if (k === 1) return src.toDataURL('image/png');
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

/** 画像の明るさ（1画素1つ。色の付いた所は白） */
function lumOf(src: HTMLCanvasElement): Uint8Array {
  const g = prepared(src, null, 1);
  const px = (g.canvas.getContext('2d', {willReadFrequently: true}) as CanvasRenderingContext2D).getImageData(0, 0, g.canvas.width, g.canvas.height).data;
  const lum = new Uint8Array(px.length / 4);
  for (let i = 0; i < lum.length; i++) lum[i] = px[i * 4];
  return lum;
}

/** 足りない（読めない・たしかでない）と、もう1回読み直す項目 */
const NEED: SoftKey[] = ['name', 'kana', 'era', 'birthY', 'zip', 'address', 'phone', 'office', 'manager', 'officeTel', 'care', 'careFrom', 'careTo', 'insurer', 'insuredNo', 'burden'];
const lacking = (r: SoftRead) => NEED.filter((k) => !r.info[k] || r.unsure.includes(k));

/**
 * 画面を1行ずつ切り出して（画素の濃さで探した字の行）、大きくして読む。行の字の高さを h 画素ほどにする。読んだ語の位置はもとの画像の位置
 */
async function readLines(worker: Worker, src: HTMLCanvasElement, h: number, opt: {gamma?: boolean; binary?: boolean}, signal?: AbortSignal): Promise<OcrPage> {
  const lum = lumOf(src);
  const lines: OcrPage['lines'] = [];
  const found = inkLines(lum, src.width, src.height);
  for (const [i, l] of found.entries()) {
    stopIf(signal);
    const lh = l.y1 - l.y0;
    const pad = Math.max(2, lh * 0.35);
    // 上下の余白は、となりの行との間のまん中まで（となりの行の字の端が入ると、その字も読んでまざる）
    const y0 = Math.max(l.y0 - pad, i ? (found[i - 1].y1 + l.y0) / 2 : 0);
    const y1 = Math.min(l.y1 + pad, i + 1 < found.length ? (l.y1 + found[i + 1].y0) / 2 : src.height);
    const r = await recognize(worker, prepared(src, {x0: 0, y0, x1: src.width, y1}, Math.min(6, Math.max(1, h / lh)), {...opt, pad: 12}), '7');
    lines.push(...r.lines);
  }
  return {lines};
}

/**
 * 画面の画像を、足りない所がなくなるまで（多くて5回）読む：全体を2回（ページの分け方を変えて）→ 1行ずつ大きくして → 数字の欄・フリガナを切り出して →
 * まだ足りなければ、1行ずつを下ごしらえを変えて（濃さそのまま・白黒）もう2回まで。何回か読んだ結果は、項目ごとに同じ読みの多い方・たしかな方にまとめる（mergeSoft）。
 * 介護ソフトのラベルが見つからないときは null（介護保険証として読む）
 */
export async function readSoftCanvas(worker: Worker, src: HTMLCanvasElement, today: string, onProgress: (p: CardProgress) => void = () => undefined, signal?: AbortSignal): Promise<{read: SoftRead; pages: OcrPage[]} | null> {
  // 画面の字（9〜16px）は小さいので大きくして読む（長い辺 2400 画素・3倍まで。大きな画像＝保険証のスキャンなどは大きくしない）
  const scale = Math.min(3, Math.max(1, 2400 / Math.max(src.width, src.height)));
  stopIf(signal);
  onProgress({step: '介護ソフトの画面か調べています', page: 1, pages: 1});
  const a = await recognize(worker, prepared(src, null, scale, {gamma: true}), '6');
  const first = parseSoftPage(a, today);
  if (first.score < 2) return null;
  stopIf(signal);
  onProgress({step: '介護ソフトの画面を読んでいます', page: 1, pages: 1});
  const pages: OcrPage[] = [a, await recognize(worker, prepared(src, null, scale), '4')];
  onProgress({step: '1行ずつ読み直しています', page: 1, pages: 1});
  pages.push(await readLines(worker, src, 44, {gamma: true}, signal));
  // 数字の欄（生年月日・郵便番号・電話・番号・認定期間）を切り出して、数字だけにしぼって読み直す
  const spots = mergeSoft(pages.map((p) => parseSoftPage(p, today))).spots ?? {};
  const rereads: {spot: SoftSpot; text: string}[] = [];
  for (const [spot, s] of Object.entries(spots) as [SoftSpot, Box][]) {
    stopIf(signal);
    const h = s.y1 - s.y0;
    const rect = {x0: s.x0 - h * 0.5, y0: s.y0 - h * 0.3, x1: s.x1 + h * 0.5, y1: s.y1 + h * 0.3};
    const r = await recognize(worker, prepared(src, rect, Math.min(6, Math.max(2, 48 / (rect.y1 - rect.y0))), {pad: 16}), '7', SPOT_CHARS[spot]);
    rereads.push({spot, text: r.text});
  }
  // フリガナ（小さな半角カタカナ）：横に引きのばすと全角の字の形に近くなって読める。引きのばし方・大きさ・濃さを変えて何回か読み、一番多い読みを選ぶ（pickKana）
  const kana: {text: string; conf: number}[] = [];
  const kr = pages.map((p) => kanaRect(p)).find((x) => x);
  // 姓と名の間は、画素で見た字のない所（読み取りの字の位置より確か）
  const lum = kr ? lumOf(src) : null;
  const splitX = kr && lum ? blankSplit(lum, src.width, kr) : null;
  const readKana = async (ways: {sx: number; h: number; gamma?: boolean; any?: boolean}[]) => {
    if (!kr) return;
    const rect = {...kr, y0: kr.y0 - 2, y1: kr.y1 + 2};
    for (const w of ways) {
      stopIf(signal);
      const r = await recognize(worker, prepared(src, rect, Math.min(8, Math.max(2, w.h / (rect.y1 - rect.y0))), {sx: w.sx, pad: 20, gamma: w.gamma}), '7', w.any ? '' : KATAKANA);
      kana.push({text: kanaOfWords(r.lines.flatMap((l) => l.words), splitX), conf: r.conf ?? 0});
    }
  };
  await readKana([{sx: 1.6, h: 44}, {sx: 1.6, h: 56}, {sx: 1.6, h: 72}, {sx: 2, h: 96, gamma: true}, {sx: 1.45, h: 56}, {sx: 1.6, h: 56, any: true}]);
  let read = parseSoft(pages, today, {kana, rereads});
  // 足りない所があれば、下ごしらえを変えてもう1回（2回まで）。フリガナもほかの大きさで
  const more: {h: number; opt: {gamma?: boolean; binary?: boolean}}[] = [
    {h: 60, opt: {}},
    {h: 36, opt: {binary: true}},
  ];
  for (const [i, m] of more.entries()) {
    if (lacking(read).length === 0) break;
    stopIf(signal);
    onProgress({step: `読めなかった所をもう一度読んでいます（${i + 2}回目）`, page: 1, pages: 1});
    pages.push(await readLines(worker, src, m.h, m.opt, signal));
    if (read.unsure.includes('kana') || !read.info.kana) await readKana(i === 0 ? [{sx: 1.8, h: 72}, {sx: 2, h: 56, gamma: true}] : [{sx: 1.6, h: 96}, {sx: 1.3, h: 64}]);
    read = parseSoft(pages, today, {kana, rereads});
  }
  return {read, pages};
}

/**
 * 介護ソフトの画面のスクリーンショット1枚を読む。画面らしくない（写真など）・介護ソフトのラベルが見つからないときは null（介護保険証として読む）。
 * signal：やめる（次の読み取りの前で止める）
 */
export async function readSoftScreen(file: File, onProgress: (p: CardProgress) => void = () => undefined, signal?: AbortSignal): Promise<{read: ReadResult; thumbs: string[]} | null> {
  const src = await canvasOfFile(file);
  const ctx = src.getContext('2d', {willReadFrequently: true}) as CanvasRenderingContext2D;
  if (!screenLike(ctx.getImageData(0, 0, src.width, src.height).data)) return null;
  const today = todayIso();
  return withOcr(async (worker) => {
    const r = await readSoftCanvas(worker, src, today, onProgress, signal);
    return r ? {read: softRead(r.read), thumbs: [thumbOf(src)]} : null;
  });
}

/**
 * 介護保険証の入口に入れたファイルを読む：画像1枚で介護ソフトの画面らしければ介護ソフトの画面として、ほかは介護保険証として（被保険者証・負担割合証、PDF も）。
 * 返す形は readCards と同じ（skipped：開けなかったファイルの名前）。signal：やめる
 */
export async function readCardOrScreen(files: File[], onProgress: (p: CardProgress) => void = () => undefined, signal?: AbortSignal): Promise<{read: ReadResult; thumbs: string[]; skipped: string[]}> {
  if (files.length === 1 && !isPdf(files[0])) {
    // 介護ソフトの画面として読めなかったとき（開けない画像・読み取りの部品の取り寄せの失敗も）は、介護保険証として読む（失敗ならそこで知らせる）。やめたときはやめる
    const soft = await readSoftScreen(files[0], onProgress, signal).catch((e: unknown) => {
      if (signal?.aborted) throw e;
      return null;
    });
    if (soft) return {...soft, skipped: []};
  }
  return readCards(files, onProgress, signal);
}

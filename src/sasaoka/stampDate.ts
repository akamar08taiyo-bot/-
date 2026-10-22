// 日付入り写真（右下などに「2026年9月17日木曜日」と写し込まれた日付）から、撮影日を読む
// （ユーザーの指示「日付入り写真を添付した場合は、その日付に合わせて自動入力」2026-10-22。どの保険者の申請書も、写真は日付の入ったものが決まり）。
// スマホの写真の撮影日時（Exif。photos.ts の photoTakenDate）がないとき（LINE で送られてきた写真・PDF の写真など）に使う。
// 写真の下と上の帯から、日付の字の色（白、だいだい・黄）の点だけを白黒にして、明るい壁などの大きなかたまりを消し、字の行を切り出して読む（tesseract.js・日本語）。
// 文字を読む部品（読み取りの本体と日本語のデータ、あわせて約5MB）は、初めて使うときにネット（jsDelivr）から取ってきてブラウザに覚えさせる。
// 写真はどこにも送らない（読むのはこの端末の中）。ネットにつながらない・日付が読めないときは ''（撮影日は入れない）

import type {Worker} from 'tesseract.js';

/** 切り出した字の行（白黒：0＝字、255＝地） */
export type StampCrop = {g: Uint8Array; w: number; h: number};

/**
 * 読んだ文字から日付（'YYYY-MM-DD'）を取り出す。「2026年9月17日」「令和8年9月17日」「2026/09/17 14:23」「2026.9.17」「26.09.17」「R8.9.17」など。
 * 今日より先の日付・ない日付（9月31日など）は取らない。読めなければ ''
 */
export function parseStampDate(raw: string, today = new Date()): string {
  const t = raw
    .normalize('NFKC')
    .replace(/[Oo〇]/g, '0') // 数字の読み違い（O→0、l・I・|→1）
    .replace(/[lI|!]/g, '1')
    .replace(/\s+/g, ' ')
    .replace(/\s*([年月日\/.\-:'’])\s*/g, '$1') // 「2026 年 9 月 17 日」「令 和」→ 間をつめる
    .replace(/(?<=[^\x20-\x7e]) | (?=[^\x20-\x7e])/g, '');
  const found: [number, number, number][] = [];
  const add = (y: number, m: number, d: number) => found.push([y, m, d]);
  for (const r of t.matchAll(/(?<!\d)(20\d{2})年(\d{1,2})月(\d{1,2})(?!\d)/g)) add(+r[1], +r[2], +r[3]);
  for (const r of t.matchAll(/令和(\d{1,2}|元)年(\d{1,2})月(\d{1,2})(?!\d)/g)) add(2018 + (r[1] === '元' ? 1 : +r[1]), +r[2], +r[3]);
  for (const r of t.matchAll(/(?<!\d)(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/g)) add(+r[1], +r[2], +r[3]);
  for (const r of t.matchAll(/R(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/g)) add(2018 + +r[1], +r[2], +r[3]);
  for (const r of t.matchAll(/(?<![\d年])['’]?(\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/g)) add(2000 + +r[1], +r[2], +r[3]);
  // 「月」が読めなかったとき（「2026年9_17」）：年のうしろの月と日を、間の1〜2字の何かで分ける
  for (const r of t.matchAll(/(?<!\d)(20\d{2})年 ?(\d{1,2})[^\d ]{1,2} ?(\d{1,2})(?!\d)/g)) add(+r[1], +r[2], +r[3]);
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  for (const [y, m, d] of found) {
    const at = new Date(y, m - 1, d);
    if (y < 2000 || at.getMonth() !== m - 1 || at.getDate() !== d || at > limit) continue;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

type Mask = {m: Uint8Array; w: number; h: number};

/** 帯（y0〜y1 の行）の中の、字の色の点を 1 にする：白（明るく色のない点）か、だいだい・黄（昔のカメラの日付） */
function colorMask(rgba: ArrayLike<number>, w: number, y0: number, y1: number, kind: 'white' | 'orange', white: number): Mask {
  const h = y1 - y0;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * w + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const lo = Math.min(r, g, b);
      const on = kind === 'white' ? lo >= white && Math.max(r, g, b) - lo < 60 : r >= 180 && g >= 70 && g <= 215 && b <= 130 && r - b >= 90;
      if (on) m[y * w + x] = 1;
    }
  }
  return {m, w, h};
}

/** つながった点のかたまりのうち、字より大きいもの（明るい壁・タオル・窓など）と、小さすぎるもの（ごみ）を消す */
function keepGlyphs({m, w, h}: Mask, maxH: number): Mask {
  const seen = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  const pts: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s]) continue;
    stack.push(s);
    seen[s] = 1;
    pts.length = 0;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    while (stack.length) {
      const p = stack.pop() as number;
      pts.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of near) {
        if (q >= 0 && m[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (y1 - y0 + 1 > maxH || x1 - x0 + 1 > maxH * 2.5 || pts.length < 6) continue;
    for (const p of pts) out[p] = 1;
  }
  return {m: out, w, h};
}

/** 字の行（点の多い横の帯）を、点の多い順に3つまで。行ごとに左右も字のある所だけにして、まわりに余白をつけて切り出す */
function lineCrops({m, w, h}: Mask): StampCrop[] {
  const rows = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows[y] += m[y * w + x];
  const th = Math.max(2, w * 0.002);
  const bands: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && rows[y] >= th;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start >= 6) bands.push([start, y]);
      start = -1;
    }
  }
  return bands
    .map(([a, b]) => {
      let x0 = w;
      let x1 = -1;
      let n = 0;
      for (let y = a; y < b; y++) {
        for (let x = 0; x < w; x++) {
          if (!m[y * w + x]) continue;
          n++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
      }
      return {a, b, x0, x1, n};
    })
    .filter((l) => l.x1 - l.x0 > (l.b - l.a) * 2) // 横に長い（字が並んでいる）
    .sort((p, q) => q.n - p.n)
    .slice(0, 3)
    .map(({a, b, x0, x1}) => {
      const pad = Math.max(6, Math.round((b - a) / 3));
      const cx0 = Math.max(0, x0 - pad);
      const cy0 = Math.max(0, a - pad);
      const cw = Math.min(w, x1 + 1 + pad) - cx0;
      const ch = Math.min(h, b + pad) - cy0;
      const g = new Uint8Array(cw * ch).fill(255);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (m[(cy0 + y) * w + cx0 + x]) g[y * cw + x] = 0;
      return {g, w: cw, h: ch};
    });
}

/**
 * 写真（RGBA の画素）から、日付の字の行らしい所を切り出す。下の帯（下 16%）→ 上の帯（上 14%）、それぞれ白い字 → だいだい・黄の字の順。
 * white は白とみなす明るさ（225 で読めなければ 200 でも試す）
 */
export function stampCrops(rgba: ArrayLike<number>, w: number, h: number, white = 225): StampCrop[] {
  const out: StampCrop[] = [];
  for (const [y0, y1] of [
    [Math.floor(h * 0.84), h],
    [0, Math.ceil(h * 0.14)],
  ]) {
    for (const kind of ['white', 'orange'] as const) {
      out.push(...lineCrops(keepGlyphs(colorMask(rgba, w, y0, y1, kind, white), Math.max(12, (y1 - y0) * 0.45))));
    }
  }
  return out;
}

// ---------------------------------------------------------------- 文字を読む（ブラウザ）

/** 読み取りの部品（tesseract.js の worker）。1つを使い回し、しばらく使わなければ片付ける（メモリを空ける） */
let engine: Promise<Worker> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

async function getEngine(): Promise<Worker> {
  if (!engine) {
    engine = (async () => {
      const {createWorker, OEM, PSM} = await import('tesseract.js');
      // 読み取りの本体・日本語のデータの取り寄せ先は、tesseract.js の既定（jsDelivr。入れた版に合わせた URL）。日本語のデータはブラウザに覚えさせる
      const worker = await createWorker('jpn', OEM.LSTM_ONLY, {errorHandler: () => undefined});
      await worker.setParameters({tessedit_pageseg_mode: PSM.SINGLE_LINE});
      return worker;
    })();
    engine.catch(() => {
      engine = null; // ネットにつながらなかったときは、次の写真でまた試す
    });
  }
  return engine;
}

function release() {
  clearTimeout(idle);
  idle = setTimeout(() => {
    const e = engine;
    engine = null;
    void e?.then((w) => w.terminate()).catch(() => undefined);
  }, 60_000);
}

/** 白黒の行を、読みやすい大きさ（字の高さ 30画素くらいより小さければ2倍）の canvas にする */
function cropCanvas({g, w, h}: StampCrop): HTMLCanvasElement {
  const k = h < 48 ? 2 : 1;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const ctx = src.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (k === 1) return src;
  const big = document.createElement('canvas');
  big.width = w * k;
  big.height = h * k;
  (big.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0, w * k, h * k);
  return big;
}

/** 写真の画素（長い辺 1600画素まで） */
async function pixels(image: Blob): Promise<{data: Uint8ClampedArray; w: number; h: number}> {
  const bmp = await createImageBitmap(image);
  try {
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height, 1));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', {willReadFrequently: true}) as CanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0, w, h);
    return {data: ctx.getImageData(0, 0, w, h).data, w, h};
  } finally {
    bmp.close();
  }
}

/** 日付入り写真の日付（'YYYY-MM-DD'）。読めなければ ''。写真を何枚も入れたときは1枚ずつ順に読む */
export function readStampDate(image: Blob, today = new Date()): Promise<string> {
  const job = queue.then(async () => {
    try {
      const {data, w, h} = await pixels(image);
      for (const white of [225, 200]) {
        const crops = stampCrops(data, w, h, white);
        if (crops.length === 0) continue;
        const worker = await getEngine();
        for (const crop of crops) {
          const {data: r} = await worker.recognize(cropCanvas(crop));
          const day = parseStampDate(r.text, today);
          if (day) return day;
        }
      }
      return '';
    } catch {
      return '';
    } finally {
      release();
    }
  });
  queue = job;
  return job;
}

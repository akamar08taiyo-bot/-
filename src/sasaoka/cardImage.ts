// 介護保険証の画像の下ごしらえ（画素だけを扱う。ブラウザでもテストでも動く）：
// 白黒にする・90°ずつ回す・表の罫線を消す（読み取りの邪魔になる）・ラベルの右の欄（値を書くます）の範囲を罫線から決める。
// 読み取りの流れは cardOcr.ts

/** 濃さの画像（0＝黒〜255＝白） */
export type Gray = {g: Uint8Array; w: number; h: number};
export type Rect = {x0: number; y0: number; x1: number; y1: number};

/** RGBA → 濃さ */
export function grayOf(rgba: ArrayLike<number>, w: number, h: number): Gray {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  return {g, w, h};
}

/** 白黒のしきい値（大津の方法）。字と地の濃さの間 */
export function otsu({g}: Gray): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of g) hist[v]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let at = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      at = t;
    }
  }
  return at;
}

/** 字の所を 1 にした画像（しきい値より暗い点） */
export function inkOf(img: Gray, threshold = otsu(img)): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.g[i] <= threshold ? 1 : 0;
  return m;
}

/**
 * 字の所を 1 にした画像（まわりの明るさに合わせたしきい値。スマホで撮った写真の影・明るさのむらでも字だけ黒くなる）：
 * 近く（短い辺の 1/24 の四角）の平均より 15% 以上暗く、全体のしきい値（大津）より少し明るい所までの点。白黒のスキャンは全体のしきい値と同じ
 */
export function inkAdaptive(img: Gray): Uint8Array {
  const {g, w, h} = img;
  const t = otsu(img);
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 48));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / ((y1 - y0) * (x1 - x0));
      const v = g[y * w + x];
      m[y * w + x] = v < mean * 0.85 && v <= Math.min(255, t + 40) ? 1 : 0;
    }
  }
  return m;
}

/**
 * 字の行が横か縦か（画像の向きのあたりをつける。読み取りより速い）：横書きの字は、横にたどると字と字の間で字の量が大きく変わる。
 * 罫線を消した白黒の画像（ink）で、列ごと・行ごとの字の量の変わり方を比べる。true なら字の行は縦（90°か270°回す）
 */
export function textIsVertical(ink: Uint8Array, w: number, h: number): boolean {
  const rows = new Float64Array(h);
  const cols = new Float64Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) {
    rows[y]++;
    cols[x]++;
  }
  const edge = (a: Float64Array) => {
    let s = 0;
    let t = 0;
    for (let i = 1; i < a.length; i++) {
      s += Math.abs(a[i] - a[i - 1]);
      t += a[i];
    }
    return s / Math.max(1, t);
  };
  return edge(rows) > edge(cols);
}

/** 右回りに 0・90・180・270° 回す */
export function rotateGray(img: Gray, deg: 0 | 90 | 180 | 270): Gray {
  if (deg === 0) return img;
  const {g, w, h} = img;
  const W = deg === 180 ? w : h;
  const H = deg === 180 ? h : w;
  const out = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x];
      let X: number;
      let Y: number;
      if (deg === 90) {
        X = h - 1 - y;
        Y = x;
      } else if (deg === 180) {
        X = w - 1 - x;
        Y = h - 1 - y;
      } else {
        X = y;
        Y = w - 1 - x;
      }
      out[Y * W + X] = v;
    }
  }
  return {g: out, w: W, h: H};
}

/** 大きさを変える（縮めるときは平均、広げるときはなめらかに） */
export function scaleGray(img: Gray, k: number): Gray {
  if (k === 1) return img;
  const W = Math.max(1, Math.round(img.w * k));
  const H = Math.max(1, Math.round(img.h * k));
  const out = new Uint8Array(W * H);
  if (k < 1) {
    const step = 1 / k;
    for (let Y = 0; Y < H; Y++) {
      const y0 = Math.floor(Y * step);
      const y1 = Math.min(img.h, Math.max(y0 + 1, Math.floor((Y + 1) * step)));
      for (let X = 0; X < W; X++) {
        const x0 = Math.floor(X * step);
        const x1 = Math.min(img.w, Math.max(x0 + 1, Math.floor((X + 1) * step)));
        let s = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += img.g[y * img.w + x];
        out[Y * W + X] = Math.round(s / ((y1 - y0) * (x1 - x0)));
      }
    }
  } else {
    // 広げるときは間をなめらかに（白黒の字のふちがぎざぎざのままより読みやすい）
    for (let Y = 0; Y < H; Y++) {
      const fy = Math.min(img.h - 1, Math.max(0, (Y + 0.5) / k - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(img.h - 1, y0 + 1);
      const ty = fy - y0;
      for (let X = 0; X < W; X++) {
        const fx = Math.min(img.w - 1, Math.max(0, (X + 0.5) / k - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(img.w - 1, x0 + 1);
        const tx = fx - x0;
        const a = img.g[y0 * img.w + x0] * (1 - tx) + img.g[y0 * img.w + x1] * tx;
        const b = img.g[y1 * img.w + x0] * (1 - tx) + img.g[y1 * img.w + x1] * tx;
        out[Y * W + X] = Math.round(a * (1 - ty) + b * ty);
      }
    }
  }
  return {g: out, w: W, h: H};
}

/** 一部を切り出す（はみ出した所は白） */
export function cropGray(img: Gray, r: Rect): Gray {
  const x0 = Math.round(r.x0);
  const y0 = Math.round(r.y0);
  const W = Math.max(1, Math.round(r.x1) - x0);
  const H = Math.max(1, Math.round(r.y1) - y0);
  const out = new Uint8Array(W * H).fill(255);
  for (let y = 0; y < H; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= img.h) continue;
    for (let x = 0; x < W; x++) {
      const sx = x0 + x;
      if (sx >= 0 && sx < img.w) out[y * W + x] = img.g[sy * img.w + sx];
    }
  }
  return {g: out, w: W, h: H};
}

/**
 * 表の罫線を消した画像（白黒）：字より長い横・縦の線（minLen 画素以上、1〜2画素の切れ目はつなぐ）の点を白にする。
 * 罫線にさわっている字が読めなくなるのを防ぐ（罫線のすぐそばの1画素も消す）
 */
export function removeLines(img: Gray, ink: Uint8Array, minLen = Math.max(30, Math.round(Math.min(img.w, img.h) * 0.04))): Gray {
  const {w, h} = img;
  const line = new Uint8Array(w * h);
  const mark = (get: (i: number) => number, set: (i: number) => void, n: number) => {
    let start = -1;
    let gap = 0;
    let last = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && get(i) === 1;
      if (on) {
        if (start < 0) start = i;
        last = i;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap > 2 || i === n) {
          if (last - start + 1 >= minLen) for (let k = start; k <= last; k++) set(k);
          start = -1;
          gap = 0;
        }
      }
    }
  };
  for (let y = 0; y < h; y++) mark((x) => ink[y * w + x], (x) => (line[y * w + x] = 1), w);
  for (let x = 0; x < w; x++) mark((y) => ink[y * w + x], (y) => (line[y * w + x] = 1), h);
  const keep = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const near = line[i] || (x > 0 && line[i - 1]) || (x < w - 1 && line[i + 1]) || (y > 0 && line[i - w]) || (y < h - 1 && line[i + w]);
      keep[i] = ink[i] && !near ? 1 : 0;
    }
  }
  return despeckle(keep, w, h);
}

/** スキャンのざらつき（まわりに字の点が1つもない・1つだけの点）を消した白黒の画像 */
export function despeckle(ink: Uint8Array, w: number, h: number): Gray {
  const g = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!ink[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if ((dx || dy) && xx >= 0 && xx < w && ink[yy * w + xx]) n++;
        }
      }
      if (n >= 2) g[i] = 0;
    }
  }
  return {g, w, h};
}

/**
 * 縦の罫線の x（横の帯 y0〜y1 の高さの 80% 以上が字の色の列。となり合う列は1本にまとめて、その中ほど）。
 * ラベルのますの右の線・値のますの右の線を見つけるのに使う
 */
export function verticalLines(ink: Uint8Array, w: number, h: number, y0: number, y1: number): number[] {
  const a = Math.max(0, Math.floor(y0));
  const b = Math.min(h, Math.ceil(y1));
  if (b - a < 4) return [];
  const xs: number[] = [];
  let run: number[] = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = a; y < b; y++) {
      // 線が少し傾いていても：となりの列の点も数える
      if (ink[y * w + x] || (x > 0 && ink[y * w + x - 1]) || (x < w - 1 && ink[y * w + x + 1])) n++;
    }
    if (n >= (b - a) * 0.8) run.push(x);
    else if (run.length) {
      xs.push(run[Math.floor(run.length / 2)]);
      run = [];
    }
  }
  if (run.length) xs.push(run[Math.floor(run.length / 2)]);
  return xs;
}

/**
 * ラベルの右の値のます：ラベルの右の縦線（なければラベルのすぐ右）から、次の縦線（なければ maxW）まで。
 * skip：値のますをいくつ右にずらすか（生年月日の右の性別のますは 1）
 */
export function valueRect(ink: Uint8Array, w: number, h: number, label: Rect, band: {y0: number; y1: number}, skip = 0, maxW = (label.y1 - label.y0) * 22): Rect {
  const lh = label.y1 - label.y0;
  // 縦線は、ラベルの字の高さより少し上下に広い所で探す（字の縦の画は、字の高さより長くないので線にしない。ますの上下の横線にはかからない）
  void band;
  const lines = verticalLines(ink, w, h, label.y0 - lh * 0.3, label.y1 + lh * 0.3).filter((x) => x > label.x1 - 2);
  const minCell = lh * 1.2;
  let left = lines.find((x) => x - label.x1 < lh * 6) ?? label.x1 + lh * 0.3;
  for (let k = 0; k < skip; k++) {
    const next = lines.find((x) => x > left + minCell);
    if (next === undefined) break;
    left = next;
  }
  const right = lines.find((x) => x > left + minCell) ?? Math.min(w, left + maxW);
  return {x0: left + 2, y0: band.y0, x1: Math.min(right - 2, left + maxW), y1: band.y1};
}

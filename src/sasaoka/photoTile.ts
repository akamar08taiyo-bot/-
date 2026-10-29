// 1つの写真の枠に、何枚かの写真を並べる（ユーザーの指示「追加で写真を追加できる機能もつける」2026-10-29。
// 北九州市の完了報告書の改修後の枠に縦の写真を1枚入れると、左右が大きく空いていた）。
// 並べた絵を1枚の写真にして枠に入れる（photos.ts の composeTiles）。並べ方は、横に並べる・縦に並べる・2×2 のうち、
// 枠の中で写真がいちばん大きく見えるもの（枠の形・写真に書く内容の所は呼ぶ側の fit で測る）。

/** 並べた絵の中の1枚の場所（並べた絵の幅・高さに対する割合 0〜1） */
export type TileRect = {x: number; y: number; w: number; h: number};
/** 並べ方：w・h＝並べた絵の幅と高さ（比。1枚目の写真の高さを1とした大きさ）、rects＝写真ごとの場所（並べた順） */
export type Tiling = {w: number; h: number; rects: TileRect[]};

/** 1つの枠に並べる写真の数のいちばん多いとき（それより多いと1枚ずつが小さくなりすぎる） */
export const MAX_TILES = 4;
/** 写真と写真のあいだ（写真の高さに対する割合） */
const GAP = 0.03;

/** 横に1列（高さをそろえる） */
function row(aspects: number[]): Tiling {
  const w = aspects.reduce((s, a) => s + a, 0) + GAP * (aspects.length - 1);
  let x = 0;
  const rects = aspects.map((a) => {
    const r = {x: x / w, y: 0, w: a / w, h: 1};
    x += a + GAP;
    return r;
  });
  return {w, h: 1, rects};
}

/** 縦に1列（幅をそろえる） */
function column(aspects: number[]): Tiling {
  const hs = aspects.map((a) => 1 / a);
  const h = hs.reduce((s, x) => s + x, 0) + GAP * (aspects.length - 1);
  let y = 0;
  const rects = hs.map((ph) => {
    const r = {x: 0, y: y / h, w: 1, h: ph / h};
    y += ph + GAP;
    return r;
  });
  return {w: 1, h, rects};
}

/** 2×2（3枚なら下の段は1枚をまん中に）。升の形は写真の形のまん中（幾何平均）、写真は升の中に収めてまん中に */
function grid(aspects: number[]): Tiling {
  const c = Math.exp(aspects.reduce((s, a) => s + Math.log(a), 0) / aspects.length);
  const [w, h] = [2 * c + GAP, 2 + GAP];
  const rects = aspects.map((a, i) => {
    const [col, line] = [i % 2, Math.floor(i / 2)];
    const lone = aspects.length === 3 && i === 2; // 3枚目は下の段のまん中
    const [cx, cy] = [lone ? c / 2 + GAP / 2 : col * (c + GAP), line * (1 + GAP)];
    const [pw, ph] = a >= c ? [c, c / a] : [a, 1];
    return {x: (cx + (c - pw) / 2) / w, y: (cy + (1 - ph) / 2) / h, w: pw / w, h: ph / h};
  });
  return {w, h, rects};
}

/** 並べ方の候補（写真の形＝幅÷高さ） */
export function tilings(aspects: number[]): Tiling[] {
  const a = aspects.map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  if (a.length <= 1) return [{w: a[0] ?? 1, h: 1, rects: [{x: 0, y: 0, w: 1, h: 1}]}];
  return a.length >= 3 ? [row(a), column(a), grid(a)] : [row(a), column(a)];
}

/**
 * いちばんよい並べ方：fit(w, h)＝その縦横の比の絵を枠に入れたときの倍率（絵の幅 w を何画素に見せるか÷w）。
 * 写真の見える面積の合計がいちばん大きいもの（同じなら小さい写真がより大きいもの）
 */
export function bestTiling(aspects: number[], fit: (w: number, h: number) => number): Tiling {
  let best: Tiling | null = null;
  let score = -1;
  let least = -1;
  for (const t of tilings(aspects)) {
    const k = Math.max(0, fit(t.w, t.h));
    const areas = t.rects.map((r) => r.w * t.w * k * r.h * t.h * k);
    const sum = areas.reduce((s, x) => s + x, 0);
    const min = Math.min(...areas);
    if (sum > score * 1.0001 || (Math.abs(sum - score) <= score * 0.0001 && min > least)) [best, score, least] = [t, sum, min];
  }
  return best ?? tilings(aspects)[0];
}

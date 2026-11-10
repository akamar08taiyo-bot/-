// 1つの写真の枠に、何枚かの写真を並べる（ユーザーの指示「追加で写真を追加できる機能もつける」2026-10-29。
// 北九州市の完了報告書の改修後の枠に縦の写真を1枚入れると、左右が大きく空いていた）。
// 並べた絵を1枚の写真にして枠に入れる（photos.ts の composeTiles）。並べ方は、1枚目（メイン）を大きく、ほかを下か右に小さく並べるもののうち、
// 枠の中でメインがいちばん大きく見えるもの（枠の形・写真に書く内容の所は呼ぶ側の fit で測る。2026-11-10 から。mainWith）。

/** 並べた絵の中の1枚の場所（並べた絵の幅・高さに対する割合 0〜1） */
export type TileRect = {x: number; y: number; w: number; h: number};
/** 並べ方：w・h＝並べた絵の幅と高さ（比。1枚目の写真の高さを1とした大きさ）、rects＝写真ごとの場所（並べた順） */
export type Tiling = {w: number; h: number; rects: TileRect[]};

/** 1つの枠に並べる写真の数のいちばん多いとき（それより多いと1枚ずつが小さくなりすぎる） */
export const MAX_TILES = 4;
/** 写真と写真のあいだ（写真の高さに対する割合） */
const GAP = 0.03;

/** 升の形（写真の形のまん中＝幾何平均）。升の中に写真を収めてまん中に置く（縦の写真と横の写真がまざっても、どれかがとても小さくならない） */
const cellOf = (aspects: number[]) => Math.exp(aspects.reduce((s, a) => s + Math.log(a), 0) / aspects.length);
const inCell = (a: number, c: number): [number, number] => (a >= c ? [c, c / a] : [a, 1]);

/** 横に1列の升 */
function row(aspects: number[]): Tiling {
  const c = cellOf(aspects);
  const n = aspects.length;
  const [w, h] = [n * c + GAP * (n - 1), 1];
  const rects = aspects.map((a, i) => {
    const [pw, ph] = inCell(a, c);
    return {x: (i * (c + GAP) + (c - pw) / 2) / w, y: (1 - ph) / 2 / h, w: pw / w, h: ph / h};
  });
  return {w, h, rects};
}

/** 縦に1列の升 */
function column(aspects: number[]): Tiling {
  const c = cellOf(aspects);
  const n = aspects.length;
  const [w, h] = [c, n + GAP * (n - 1)];
  const rects = aspects.map((a, i) => {
    const [pw, ph] = inCell(a, c);
    return {x: (c - pw) / 2 / w, y: (i * (1 + GAP) + (1 - ph) / 2) / h, w: pw / w, h: ph / h};
  });
  return {w, h, rects};
}

/** 2×2（3枚なら下の段は1枚をまん中に）。升の形は写真の形のまん中（幾何平均）、写真は升の中に収めてまん中に */
function grid(aspects: number[]): Tiling {
  const c = cellOf(aspects);
  const [w, h] = [2 * c + GAP, 2 + GAP];
  const rects = aspects.map((a, i) => {
    const [col, line] = [i % 2, Math.floor(i / 2)];
    const lone = aspects.length === 3 && i === 2; // 3枚目は下の段のまん中
    const [cx, cy] = [lone ? c / 2 + GAP / 2 : col * (c + GAP), line * (1 + GAP)];
    const [pw, ph] = inCell(a, c);
    return {x: (cx + (c - pw) / 2) / w, y: (cy + (1 - ph) / 2) / h, w: pw / w, h: ph / h};
  });
  return {w, h, rects};
}

/**
 * メインの写真（1枚目＝はじめに枠に入れた写真）を大きく、ほかの写真を小さく並べる（ユーザーの指示「写真が2枚以上になったとき、2枚の場合縦に並べる（臨機応変に）、
 * 3枚の場合、縦1枚と横に2枚並べる（臨機応変）。前提としてメインの写真は1枚必ず、その他は小さくても良い」2026-11-10。前は横1列・縦1列・2×2 で、どの写真も同じ大きさ）。
 * side 'bottom'＝メインの下に、ほかの写真の並べ方 sub（升の横1列・縦1列・2×2）をメインの幅いっぱいに。'right'＝メインの右に、メインの高さいっぱいに。
 * ほかの写真はどれもメインより大きくしない（面積がメイン以下になるまで縮める）。余った所はまん中に寄せる
 */
function mainWith(a0: number, sub: Tiling, side: 'bottom' | 'right'): Tiling {
  let k = side === 'bottom' ? a0 / sub.w : 1 / sub.h;
  for (const r of sub.rects) {
    const area = r.w * sub.w * r.h * sub.h;
    if (area > 0) k = Math.min(k, Math.sqrt(a0 / area));
  }
  const [sw, sh] = [sub.w * k, sub.h * k];
  const [w, h] = side === 'bottom' ? [Math.max(a0, sw), 1 + GAP + sh] : [a0 + GAP + sw, Math.max(1, sh)];
  const main = side === 'bottom' ? {x: (w - a0) / 2, y: 0} : {x: 0, y: (h - 1) / 2};
  const at = side === 'bottom' ? {x: (w - sw) / 2, y: 1 + GAP} : {x: a0 + GAP, y: (h - sh) / 2};
  return {
    w,
    h,
    rects: [
      {x: main.x / w, y: main.y / h, w: a0 / w, h: 1 / h},
      ...sub.rects.map((r) => ({x: (at.x + r.x * sw) / w, y: (at.y + r.y * sh) / h, w: (r.w * sw) / w, h: (r.h * sh) / h})),
    ],
  };
}

/** ほかの写真の並べ方の候補（1枚なら1つ。2枚は横・縦、3枚からは 2×2 も） */
const subs = (rest: number[]): Tiling[] => (rest.length === 1 ? [row(rest)] : rest.length === 2 ? [row(rest), column(rest)] : [row(rest), column(rest), grid(rest)]);

/** 並べ方の候補（写真の形＝幅÷高さ。1枚目がメイン）：メインの下に並べるもの（先）と、メインの右に並べるもの */
export function tilings(aspects: number[]): Tiling[] {
  const a = aspects.map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  if (a.length <= 1) return [{w: a[0] ?? 1, h: 1, rects: [{x: 0, y: 0, w: 1, h: 1}]}];
  const [a0, ...rest] = a;
  const ss = subs(rest);
  return [...ss.map((t) => mainWith(a0, t, 'bottom')), ...ss.map((t) => mainWith(a0, t, 'right'))];
}

/**
 * いちばんよい並べ方：fit(w, h)＝その縦横の比の絵を枠に入れたときの倍率（絵の幅 w を何画素に見せるか÷w）。
 * メインの写真の見える面積を重く（ほかの写真は半分の重さ）。2枚のときは縦に並べる（下に置く）のを先にし、
 * 右に並べた方が 1.25倍より大きく見えるとき（横に長い枠に縦の写真など）だけ横に並べる＝臨機応変
 */
export function bestTiling(aspects: number[], fit: (w: number, h: number) => number): Tiling {
  const all = tilings(aspects);
  if (all.length === 1) return all[0];
  const score = (t: Tiling) => {
    const k = Math.max(0, fit(t.w, t.h));
    const areas = t.rects.map((r) => r.w * t.w * k * r.h * t.h * k);
    return areas[0] + 0.5 * areas.slice(1).reduce((x, y) => x + y, 0);
  };
  const best = (list: Tiling[]) => list.reduce((b, t) => (score(t) > score(b) * 1.0001 ? t : b));
  const half = all.length / 2;
  const [bottom, right] = [best(all.slice(0, half)), best(all.slice(half))];
  // 2枚は縦（下に置く）を先に。右に並べた方が 1.25倍より大きく見えるときだけ横
  return score(right) > score(bottom) * (aspects.length === 2 ? 1.25 : 1.0001) ? right : bottom;
}

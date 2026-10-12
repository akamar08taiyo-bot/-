// 射影変換（四隅の対応）。画面の中の紙・板に、文字を傾きごと貼りつけるために使う
// 行列は 3×3 を行優先で並べた 9 個の数（最後は 1）

// 幅 w・高さ h の箱の四隅 (0,0),(w,0),(w,h),(0,h) を、q の四隅（左上→右上→右下→左下の x,y）に写す
export const boxToQuad = (w: number, h: number, q: number[]): number[] => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, k = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    k = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3, f = y0;
  return [a / w, b / h, c, d / w, e / h, f, g / w, k / h, 1];
};

// CSS の matrix3d（transform-origin は 0 0 にする）
export const cssMatrix = (m: number[]) =>
  `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,${m[8]})`;

// カメラ全体の追跡（相似変換 [a, b, tx, ty]）で点を動かす
export const applySim = (m: [number, number, number, number], x: number, y: number): [number, number] => [
  m[0] * x - m[1] * y + m[2],
  m[1] * x + m[0] * y + m[3],
];

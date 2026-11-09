// カタログのページの横の罫線（細い横長の線・四角）。品番の表の金額のまとまりは、表の幅いっぱいの罫線で区切られている
// （まとまりの中の行の間は品番の列だけの短い線）。catalogItems.ts の金額の割り当てに使う（2026-11-09 の点検。字の位置だけで
// 推し量っていて、p.136 の「SAV・SAVS 各¥…／SAVH・SAVA 各¥…」の SAVH を SAV・SAVS の金額にしていた）。
// ビルドで catalog/rules.json に出し（vite.tokutei.config.ts）、ないときは端末の中で PDF から読む（print/catalogPdf.ts）

/** 横の罫線（左上から pt）：左の端・高さ（線のまん中）・長さ */
export type CatalogRule = {x: number; y: number; w: number};

/** pdf.js のページ（getOperatorList と getViewport があれば足りる） */
type RulePage = {
  getViewport(o: {scale: number}): {height: number};
  getOperatorList(): Promise<{fnArray: number[]; argsArray: unknown[][]}>;
};
type Ops = {save: number; restore: number; transform: number; constructPath: number};
type Matrix = [number, number, number, number, number, number];

const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** ページの横の罫線（長さ 25pt 以上・太さ 1.6pt まで）。図形の外形（minMax）をページの座標にして見る */
export async function pageRules(page: RulePage, OPS: Ops): Promise<CatalogRule[]> {
  const H = page.getViewport({scale: 1}).height;
  const list = await page.getOperatorList();
  const out: CatalogRule[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const at = (x: number, y: number) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix);
    else if (fn === OPS.constructPath) {
      const mm = args?.[2] as ArrayLike<number> | null | undefined;
      if (!mm || mm.length < 4) continue;
      const [x0, y0] = at(mm[0], mm[1]);
      const [x1, y1] = at(mm[2], mm[3]);
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      if (w >= 25 && h <= 1.6) out.push({x: round(Math.min(x0, x1)), y: round(H - (y0 + y1) / 2), w: round(w)});
    }
  }
  return out;
}
const round = (n: number) => Math.round(n * 100) / 100;

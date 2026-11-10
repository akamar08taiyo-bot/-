// 見取図の Excel（.xlsx）：印刷（MadoriPrint.tsx）と同じ A4 の1枚（縦が基本、横に広い図は横。階をみな1枚に）を1つのシートにする。
// 一覧（①　玄関　手すりの取り付け　L=600mm…赤い字）はマスの文字（Excel で打ち直せる）、平面図は画像（PNG）。
// 列の幅・行の高さは sheet.ts の sheetLayout の mm のまま（印刷と同じ位置）

import type {Job, Settings} from '../types.ts';
import {writeXlsx} from '../xlsxWrite.ts';
import type {XImage, XSheet} from '../xlsxWrite.ts';
import {SheetBuilder} from '../xlsxWrite.ts';
import type {Madori} from './model.ts';
import {A4, placeLookup, planSvg, sheetFloors, sheetLayout, sheetLegend, sheetText} from './sheet.ts';
import type {SheetLayout} from './sheet.ts';

const PT_PER_MM = 72 / 25.4;
const RED = 'E01B24';

/** 見取図のシート。png は平面図の画像（なければ図なし） */
export function madoriSheet(o: {lay: SheetLayout; legend: string[]; name: string; png?: Uint8Array}): XSheet {
  const {lay} = o;
  const b = new SheetBuilder();
  const font = 'ＭＳ Ｐゴシック';
  const L = lay.legend;
  // 列は紙の幅を4つに分ける（1つの広い列だと、字体のちがう PC（LibreOffice で確かめた）で列が広くなって「1ページに合わせる」でも右がはみ出した）。
  // 一覧の1列は4つの列を結合したマス、2列なら2つずつ
  const N = 4;
  const cols = Array.from({length: N}, () => (lay.w - A4.margin * 2) / N);
  // 平面図の段（絵はこの上に重ねて貼る）。Excel の行の高さは 409pt（144mm）までなので、高い段は同じ高さの行に分ける
  const parts = Math.ceil(lay.area.h / 140);
  for (let i = 0; i < parts; i++) b.row(lay.area.h / parts);
  if (L) {
    b.row(L.y - lay.area.y - lay.area.h); // 平面図と一覧のすき間
    const lineH = L.fs * 1.55;
    const style = {font, size: Math.round(L.fs * PT_PER_MM * 2) / 2, color: RED, v: 'center' as const, shrink: true};
    const span = N / L.cols;
    const groups = Array.from({length: L.cols}, (_, g) => g * span);
    // 枠の線：上の段に上の線・下の段に下の線、左の列に左の線・右の列に右の線
    const side = (g: number) => ({...(g === 0 ? {l: 'thin' as const} : {}), ...(g === groups.length - 1 ? {r: 'thin' as const} : {})});
    const top = b.row(3);
    groups.forEach((c, g) => b.put(top, c, null, {}, {t: 'thin', ...side(g)}, 1, span));
    for (let r = 0; r < L.rows; r++) {
      const row = b.row(lineH);
      groups.forEach((c, g) => {
        const text = o.legend[g * L.rows + r];
        b.put(row, c, text ? `  ${text}` : null, style, side(g), 1, span);
      });
    }
    const last = b.row(Math.max(3, L.h - 3 - lineH * L.rows));
    groups.forEach((c, g) => b.put(last, c, null, {}, {b: 'thin', ...side(g)}, 1, span));
  }
  const images: XImage[] = [];
  if (o.png && lay.plan) images.push({png: o.png, x: lay.plan.x - A4.margin, y: lay.plan.y - A4.margin, w: lay.plan.w, h: lay.plan.h, name: '平面図'});
  return {
    ...b.sheet({
      name: o.name,
      cols,
      landscape: lay.landscape,
      // 字体のちがう PC では列の幅が広くなり、2枚目に出ることがある（LibreOffice で確かめた）ので「1ページに合わせる」（改ページのない1枚なので、これでよい）
      fitPage: true,
      margins: {l: A4.margin, r: A4.margin, t: A4.margin, b: A4.margin, header: 0, footer: 0},
      font: {name: font, size: 11},
    }),
    images,
  };
}

/** 平面図の画像（PNG のバイト）。ブラウザで描く（svgToPng）。テストでは差しかえられるように引数にする */
export type PlanPng = (svg: string, w: number, h: number) => Promise<Uint8Array>;

/** 様邸の見取図の Excel（1シート）。ファイル名は「山田花子様住宅改修見取図.xlsx」 */
export async function madoriXlsx(job: Job, s: Settings, m: Madori, png: PlanPng, images: Record<string, string> = {}): Promise<{bytes: Uint8Array; fileName: string}> {
  const t = sheetText(job);
  const look = placeLookup(job, s);
  const floors = sheetFloors(m);
  const legend = sheetLegend(m, floors, look.no, look.line, look.byNo);
  const lay = sheetLayout(floors, legend);
  let img: Uint8Array | undefined;
  if (lay.plan) {
    const p = planSvg(m, floors, look.no, 'x0', images, lay.dir);
    img = await png(p.svg, p.w, p.h);
  }
  return {bytes: writeXlsx([madoriSheet({lay, legend, name: '見取図', png: img})]), fileName: `${t.fileName}.xlsx`};
}

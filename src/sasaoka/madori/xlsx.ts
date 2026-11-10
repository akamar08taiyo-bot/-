// 見取図の Excel（.xlsx）：印刷（MadoriPrint.tsx）と同じ A4横の1枚を、階ごとに1つのシートにする。
// 題名・日付・一覧（①　L＝600mm…赤い字）・会社と担当者はマスの文字（Excel で打ち直せる）、平面図は画像（PNG）。
// 列の幅・行の高さは sheet.ts の LAYOUT の mm のまま（印刷と同じ位置）

import type {Job, Settings} from '../types.ts';
import {writeXlsx} from '../xlsxWrite.ts';
import type {XImage, XSheet} from '../xlsxWrite.ts';
import {SheetBuilder} from '../xlsxWrite.ts';
import type {Madori, MFloor} from './model.ts';
import {floorBounds} from './model.ts';
import {floorLegend, LAYOUT, PAGE, pageTitle, placeLookup, planFit, planSvg, planView, printedUnderlay, sheetFloors, sheetText, legendFont} from './sheet.ts';

const PT_PER_MM = 72 / 25.4;
const RED = 'E01B24';

/** 1つの階のシート。png は平面図の画像（なければ図なし） */
export function madoriSheet(o: {title: string; date: string; footer: string; legend: string[]; name: string; png?: {bytes: Uint8Array; view: {w: number; h: number}}}): XSheet {
  const L = LAYOUT;
  const b = new SheetBuilder();
  const font = 'ＭＳ Ｐゴシック';
  const r0 = b.row(L.titleH);
  b.put(r0, 0, o.title, {font, size: 20, v: 'center', shrink: true}, {}, 1, 2);
  b.put(r0, 2, o.date, {font, size: 15, h: 'right', v: 'center'});
  b.row(L.gap);
  // 一覧の枠：上の余白・1行ずつ・残り（枠の高さ bodyH にそろえる）
  const fs = legendFont(o.legend.length);
  const lineH = fs * 1.55;
  const legendStyle = {font, size: Math.round(fs * PT_PER_MM * 2) / 2, color: RED, v: 'center' as const, shrink: true};
  const bodyTop = b.row(4);
  b.put(bodyTop, 2, null, {}, {t: 'thin', l: 'thin', r: 'thin'});
  for (const line of o.legend) {
    const r = b.row(lineH);
    b.put(r, 2, `  ${line}`, legendStyle, {l: 'thin', r: 'thin'});
  }
  const rest = Math.max(4, L.bodyH - 4 - lineH * o.legend.length);
  const rLast = b.row(rest);
  b.put(rLast, 2, null, {}, {b: 'thin', l: 'thin', r: 'thin'});
  b.row(L.gap);
  const rFoot = b.row(L.footH);
  b.put(rFoot, 0, o.footer, {font, size: 15, h: 'right', v: 'center'}, {}, 1, 3);
  const images: XImage[] = [];
  if (o.png) {
    const fit = planFit(o.png.view);
    images.push({png: o.png.bytes, x: fit.x, y: L.titleH + L.gap + fit.y, w: fit.w, h: fit.h, name: '平面図'});
  }
  return {
    ...b.sheet({
      name: o.name,
      cols: [L.planW, L.sepW, L.legendW],
      landscape: true,
      // 列の幅は印刷と同じ mm（合計 277mm＝A4横の余白の内側いっぱい）。字体のちがう PC では列の幅が広くなり、一覧の枠が2枚目に出た
      // （LibreOffice で確かめた。95% でも出た）ので「1ページに合わせる」（改ページのない1枚なので、これでよい）
      fitPage: true,
      margins: {l: PAGE.margin, r: PAGE.margin, t: PAGE.margin, b: PAGE.margin, header: 0, footer: 0},
      font: {name: font, size: 11},
    }),
    images,
  };
}

/** 平面図の画像（PNG のバイト）。ブラウザで描く（svgToPng）。テストでは差しかえられるように引数にする */
export type PlanPng = (svg: string, w: number, h: number) => Promise<Uint8Array>;

/** 様邸の見取図の Excel（階ごとに1シート）。ファイル名は「山田花子様住宅改修見取図.xlsx」 */
export async function madoriXlsx(job: Job, s: Settings, m: Madori, png: PlanPng, images: Record<string, string> = {}): Promise<{bytes: Uint8Array; fileName: string}> {
  const t = sheetText(job, s, m);
  const look = placeLookup(job, s);
  const floors: MFloor[] = sheetFloors(m);
  const many = floors.length > 1;
  const sheets: XSheet[] = [];
  for (const [i, f] of floors.entries()) {
    const legend = floorLegend(m, f, look.no, look.line, i === 0, look.byNo);
    let img: {bytes: Uint8Array; view: {w: number; h: number}} | undefined;
    if (floorBounds(f.items) || printedUnderlay(f)) {
      const p = planSvg(m, [f], look.no, `x${i}`, images);
      img = {bytes: await png(p.svg, p.w, p.h), view: planView(f)};
    }
    sheets.push(madoriSheet({title: pageTitle(t, many ? f.name : ''), date: t.date, footer: t.footer, legend, name: f.name || `${i + 1}階`, png: img}));
  }
  return {bytes: writeXlsx(sheets), fileName: `${t.fileName}.xlsx`};
}

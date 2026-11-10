// 見取図の紙（A4横）：いただいた Excel の「住宅改修工事　見取図」のテンプレートと同じ並び。
// 上に「○○市　○○様邸　住宅改修工事　見取図」と日付、左に平面図、右に枠で囲んだ一覧（①　L＝600mm…赤い字）、下に会社・営業所・担当者。
// 印刷（MadoriPrint.tsx）・Excel（xlsx.ts）・申請書の平面図の枠の画像（planPng）で同じ寸法・同じ文を使う。長さは mm

import {workItems} from '../shinsei.ts';
import type {Job, Settings} from '../types.ts';
import {customerFilePart, dateLabel, isoDate, staffFull} from '../util.ts';
import {floorBounds, legendLines, numberItems} from './model.ts';
import type {Madori, MFloor} from './model.ts';
import {floorSvg, patternDefs, RED, viewOf} from './render.ts';

/** 紙（A4横）と余白・枠の位置（mm）。Excel の列の幅・行の高さもこの数 */
export const PAGE = {w: 297, h: 210, margin: 10};
export const LAYOUT = {
  titleH: 14, // 題名の段
  gap: 4,
  bodyH: 150, // 平面図と一覧の段
  footH: 12, // 会社・担当者の段
  planW: 182, // 平面図の幅
  sepW: 5,
  legendW: 90, // 一覧の枠の幅
};

const escText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 住所の市区町村（「福岡県行橋市大字…」→ 行橋市、「福岡市博多区…」→ 博多区、「京都郡苅田町…」→ 苅田町）。見本の題名の頭の「○○区」 */
export function areaOf(address: string): string {
  const a = address.replace(/\s+/g, '').replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}?県)/, '');
  const city = /^(.+?市)(.+?区)?/.exec(a);
  if (city) return city[2] ?? city[1];
  const town = /^(?:.+?郡)?(.+?[町村])/.exec(a);
  return town?.[1] ?? '';
}

/** 申請書の箇所（Place.id）→ 写真番号・改修の内容（申請書と同じ文） */
export function placeLookup(job: Job, s: Settings): {no: (id: string) => number | undefined; line: (id: string) => string | undefined; list: {id: string; photo: number; name: string; line: string}[]} {
  const items = workItems(job, s);
  const map = new Map(items.map((w) => [w.id, w]));
  return {no: (id) => map.get(id)?.photo, line: (id) => map.get(id)?.line, list: items.map((w) => ({id: w.id, photo: w.photo, name: w.name, line: w.line}))};
}

export type SheetText = {title: string; date: string; footer: string; fileName: string};

/** 題名・日付・下の段の文（見本の「○○区　○○様邸　住宅改修工事　見取図」「株式会社　○○サービス　担当者：…」） */
export function sheetText(job: Job, s: Settings, m: Madori): SheetText {
  const area = areaOf(job.address);
  const who = job.customer.trim() ? `${job.customer.trim()}${job.suffix === '様' ? '様' : '様邸'}` : '';
  const title = [area, who, '住宅改修工事　見取図'].filter(Boolean).join('　');
  const staff = staffFull(job.staff, s.staffList);
  const footer = [s.company || '太陽シルバーサービス株式会社', s.officeName, staff ? `担当者：${staff}` : ''].filter(Boolean).join('　');
  return {title, date: dateLabel(isoDate(m.updatedAt)), footer, fileName: `${customerFilePart(job.customer)}住宅改修見取図`};
}

/** 印刷・Excel に出す階（何か描いてある階。どれも白紙なら1階だけ） */
export function sheetFloors(m: Madori): MFloor[] {
  const drawn = m.floors.filter((f) => f.items.length > 0);
  return drawn.length ? drawn : m.floors.slice(0, 1);
}

/** その階の一覧の行（階をまたいだ通し番号。その階にある番号だけ。手で直した一覧があれば、1枚目にそれを出す） */
export function floorLegend(m: Madori, floor: MFloor, no: (id: string) => number | undefined, line: (id: string) => string | undefined, first: boolean): string[] {
  if (m.legend?.trim()) return first ? legendLines(m, no, line) : [];
  const nums = numberItems(m.floors, no);
  const here = new Set(floor.items.map((it) => nums.get(it.id)).filter((n): n is number => !!n));
  const all = legendLines({floors: m.floors}, no, line);
  return all.filter((row) => {
    const c = row.codePointAt(0) ?? 0;
    const n = c >= 0x2460 && c <= 0x2473 ? c - 0x2460 + 1 : Number(/^\((\d+)\)/.exec(row)?.[1]);
    return here.has(n);
  });
}

/** 平面図の範囲（階の部品を囲む四角に寸法線・番号の分の余白） */
export const planView = (floor: MFloor) => viewOf(floor.items, 900);

/**
 * 平面図だけの SVG（背景は白。申請書の平面図の枠・Excel の画像）。階が2つ以上なら横に並べ、上に「1階」「2階」
 */
export function planSvg(m: Madori, floors: MFloor[], no: (id: string) => number | undefined, pid = 'pl'): {svg: string; w: number; h: number} {
  const nums = numberItems(m.floors, no);
  const views = floors.map(planView);
  const label = floors.length > 1 ? 500 : 0;
  const gap = 600;
  const w = views.reduce((a, v) => a + v.w, 0) + gap * (views.length - 1);
  const h = Math.max(...views.map((v) => v.h)) + label;
  let x = 0;
  const parts = floors.map((f, i) => {
    const v = views[i];
    const g =
      `<g transform="translate(${x - v.x} ${label - v.y})">${floorSvg(f.items, {module: m.module, showArea: m.showArea, showDims: m.showDims, nums, pid})}</g>` +
      (label ? `<text x="${x + v.w / 2}" y="${label * 0.75}" font-size="${label * 0.7}" text-anchor="middle" fill="#1f2937" font-family="'BIZ UDPGothic','Meiryo',sans-serif">${escText(f.name)}</text>` : '');
    x += v.w + gap;
    return g;
  });
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.round(w / 10)}" height="${Math.round(h / 10)}"><defs>${patternDefs(pid)}</defs><rect width="${w}" height="${h}" fill="#ffffff"/>${parts.join('')}</svg>`,
    w,
    h,
  };
}

/** SVG の文字を PNG（申請書の平面図の枠は JPEG。申請書の Excel は図を jpeg で入れる＝shinsei.ts）にする（画面の外のキャンバスで描く）。px は長い辺の画素 */
export async function svgToPng(svg: string, w: number, h: number, px = 2400, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<{blob: Blob; w: number; h: number}> {
  const scale = px / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const sized = svg.replace(/width="[^"]*" height="[^"]*"/, `width="${cw}" height="${ch}"`);
  const url = URL.createObjectURL(new Blob([sized], {type: 'image/svg+xml'}));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((ok, ng) => {
      img.onload = () => ok();
      img.onerror = () => ng(new Error('平面図を絵にできませんでした'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('平面図を絵にできませんでした');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, 0.92));
    if (!blob) throw new Error('平面図を絵にできませんでした');
    return {blob, w: cw, h: ch};
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 一覧の枠の中の字の大きさ（mm）：行が多ければ小さく（枠の高さに入るように） */
export function legendFont(lines: number): number {
  const inner = LAYOUT.bodyH - 8;
  return Math.max(2.6, Math.min(4.2, inner / Math.max(1, lines) / 1.55));
}

/** 題名（階が2つ以上なら「（1階）」を付ける） */
export const pageTitle = (t: SheetText, floorName: string) => (floorName ? `${t.title}（${floorName}）` : t.title);

/** 平面図を枠（幅 planW・高さ bodyH）に入る大きさに縮めた位置（枠の左上からの mm）と倍率 */
export function planFit(v: {w: number; h: number}): {x: number; y: number; w: number; h: number; k: number} {
  const k = Math.min(LAYOUT.planW / v.w, LAYOUT.bodyH / v.h);
  const w = v.w * k;
  const h = v.h * k;
  return {x: (LAYOUT.planW - w) / 2, y: (LAYOUT.bodyH - h) / 2, w, h, k};
}

/** 印刷の1枚（A4横）の SVG（mm）。平面図は枠に入る大きさに縮めてまん中 */
export function pageSvg(t: SheetText, m: Madori, floor: MFloor, legend: string[], no: (id: string) => number | undefined, floorName: string, pid: string): string {
  const {margin} = PAGE;
  const L = LAYOUT;
  const top = margin;
  const bodyY = top + L.titleH + L.gap;
  const nums = numberItems(m.floors, no);
  const v = planView(floor);
  const fit = planFit(v);
  const lx = margin + L.planW + L.sepW;
  const fs = legendFont(legend.length);
  const font = `font-family="'BIZ UDPGothic','Meiryo','Hiragino Sans','Noto Sans JP',sans-serif"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.w} ${PAGE.h}" width="${PAGE.w}mm" height="${PAGE.h}mm" ${font}>` +
    `<defs>${patternDefs(pid)}</defs><rect width="${PAGE.w}" height="${PAGE.h}" fill="#ffffff"/>` +
    `<text x="${margin + 2}" y="${top + 10}" font-size="8" fill="#111827">${escText(pageTitle(t, floorName))}</text>` +
    `<text x="${PAGE.w - margin}" y="${top + 10}" font-size="6" text-anchor="end" fill="#111827">${escText(t.date)}</text>` +
    (floorBounds(floor.items)
      ? `<g transform="translate(${margin + fit.x} ${bodyY + fit.y}) scale(${fit.k}) translate(${-v.x} ${-v.y})">${floorSvg(floor.items, {module: m.module, showArea: m.showArea, showDims: m.showDims, nums, pid})}</g>`
      : '') +
    `<rect x="${lx}" y="${bodyY}" width="${L.legendW}" height="${L.bodyH}" fill="none" stroke="#7f7f7f" stroke-width="0.9"/>` +
    legend.map((row, i) => `<text x="${lx + 4}" y="${bodyY + 4 + fs * 1.55 * (i + 0.8)}" font-size="${fs}" fill="${RED}">${escText(row)}</text>`).join('') +
    `<text x="${PAGE.w - margin}" y="${bodyY + L.bodyH + L.gap + 8}" font-size="5.5" text-anchor="end" fill="#111827">${escText(t.footer)}</text>` +
    `</svg>`
  );
}

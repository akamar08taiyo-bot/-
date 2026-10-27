// 写真貼付用紙の写真への書き込み（ユーザーの指示「申請書の写真に書き込んで、手すりの位置や踏み台の位置など、書き込めるようにしたい。入力方法は、とにかくExcelに近づける。
// 文字の書き込み機能や、写真に棒をひく。色や長さをかえる、線の細さを調整するなど、徹底的にExcelに似せてください。」2026-10-27）。
// 図形は Excel の「挿入 → 図形」と同じ：直線・矢印・双方向矢印・四角形・楕円・テキストボックス。図形の枠線（色・太さ pt・実線／点線・矢印）・図形の塗りつぶし・
// 文字の大きさ（pt）と色は、Excel の「図形の書式」と同じ選び方（色はテーマの色 60色と標準の色 10色、太さは 0.25〜6pt）。
// 位置は写真の見えている四角（向き・大きさ・位置を直したあとの写真の外側の四角）の中の割合（0〜1）で持つ：写真を縮める・動かす・写真に書く内容で写真の所が変わっても、
// 写真の同じ所に付いていく。線の太さ・文字の大きさは紙の上の pt。画面のプレビュー・印刷（MarkLayer.tsx）と Excel の図形（shinsei.ts の markShapesXml）で同じ位置・同じ見た目にする

import type {PhotoMark, PhotoMarkDash} from './types.ts';
import {uid} from './util.ts';

export type MarkBox = {x: number; y: number; w: number; h: number};

/** 1pt は紙の上の 4/3 画素（96dpi。Excel の図形の位置と同じ画素） */
export const PT_PX = 4 / 3;
/** 紙の画素 ⇔ cm（Excel の「サイズ」の高さ・幅の欄と同じ単位） */
export const pxToCm = (px: number) => (px / 96) * 2.54;
export const cmToPx = (cm: number) => (cm / 2.54) * 96;

/** テーマの色（Excel の Office のテーマ）：10色 × 濃淡 6段（上が基本の色） */
export const THEME_COLORS: string[][] = [
  ['FFFFFF', 'F2F2F2', 'D9D9D9', 'BFBFBF', 'A6A6A6', '808080'],
  ['000000', '7F7F7F', '595959', '404040', '262626', '0D0D0D'],
  ['E7E6E6', 'D0CECE', 'AEAAAA', '757171', '3A3838', '161616'],
  ['44546A', 'D6DCE4', 'ADB9CA', '8497B0', '333F4F', '222B35'],
  ['4472C4', 'D9E1F2', 'B4C6E7', '8EA9DB', '305496', '203764'],
  ['ED7D31', 'FCE4D6', 'F8CBAD', 'F4B084', 'C65911', '833C0C'],
  ['A5A5A5', 'EDEDED', 'DBDBDB', 'C9C9C9', '7B7B7B', '525252'],
  ['FFC000', 'FFF2CC', 'FFE699', 'FFD966', 'BF8F00', '806000'],
  ['5B9BD5', 'DDEBF7', 'BDD7EE', '9BC2E6', '2F75B5', '1F4E78'],
  ['70AD47', 'E2EFDA', 'C6E0B4', 'A9D08E', '548235', '375623'],
];
const THEME_NAMES = ['白、背景 1', '黒、テキスト 1', '灰色、背景 2', '青灰色、テキスト 2', '青、アクセント 1', 'オレンジ、アクセント 2', '灰色、アクセント 3', 'ゴールド、アクセント 4', '青、アクセント 5', '緑、アクセント 6'];
const TINTS = ['白 + 基本色 80%', '白 + 基本色 60%', '白 + 基本色 40%', '黒 + 基本色 25%', '黒 + 基本色 50%'];
const TINT_OF: Record<number, string[]> = {
  0: ['黒 + 基本色 5%', '黒 + 基本色 15%', '黒 + 基本色 25%', '黒 + 基本色 35%', '黒 + 基本色 50%'],
  1: ['白 + 基本色 50%', '白 + 基本色 35%', '白 + 基本色 25%', '白 + 基本色 15%', '白 + 基本色 5%'],
  2: ['黒 + 基本色 10%', '黒 + 基本色 25%', '黒 + 基本色 50%', '黒 + 基本色 75%', '黒 + 基本色 90%'],
};
/** 標準の色（Excel と同じ並び） */
export const STANDARD_COLORS: [string, string][] = [
  ['C00000', '濃い赤'],
  ['FF0000', '赤'],
  ['FFC000', 'オレンジ'],
  ['FFFF00', '黄'],
  ['92D050', '薄い緑'],
  ['00B050', '緑'],
  ['00B0F0', '薄い青'],
  ['0070C0', '青'],
  ['002060', '濃い青'],
  ['7030A0', '紫'],
];
/** 色の名前（Excel の色の上に出る名前と同じ。ボタンの名前にも使う） */
export function colorName(hex: string): string {
  const std = STANDARD_COLORS.find(([c]) => c === hex);
  if (std) return std[1];
  for (const [col, shades] of THEME_COLORS.entries()) {
    const row = shades.indexOf(hex);
    if (row === 0) return THEME_NAMES[col];
    if (row > 0) return `${THEME_NAMES[col]}、${(TINT_OF[col] ?? TINTS)[row - 1]}`;
  }
  return `#${hex}`;
}

/** 線の太さ（pt。Excel の「図形の枠線 → 太さ」と同じ） */
export const LINE_WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
/** 線の種類（Excel の「図形の枠線 → 実線／点線」と同じ並び・名前）。pattern は線の太さの何倍か（線・すき間） */
export const DASHES: {key: PhotoMarkDash; label: string; pattern: number[]}[] = [
  {key: 'solid', label: '実線', pattern: []},
  {key: 'sysDot', label: '丸点線', pattern: [1, 1]},
  {key: 'sysDash', label: '角点線', pattern: [3, 1]},
  {key: 'dash', label: '破線', pattern: [4, 3]},
  {key: 'dashDot', label: '一点鎖線', pattern: [4, 3, 1, 3]},
  {key: 'lgDash', label: '長破線', pattern: [8, 3]},
  {key: 'lgDashDot', label: '長一点鎖線', pattern: [8, 3, 1, 3]},
  {key: 'lgDashDotDot', label: '長二点鎖線', pattern: [8, 3, 1, 3, 1, 3]},
];
/** 文字の大きさ（pt。Excel の「フォント サイズ」と同じ） */
export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
/** 図形の中の文字のまわりの余白（画素。Excel の既定：左右 0.25cm・上下 0.13cm） */
export const MARK_INSET = {x: 9.6, y: 4.8};
/** 図形の中の文字の行の高さ（文字の大きさの何倍か） */
export const MARK_LINE_K = 1.2;

export type MarkStyle = Pick<PhotoMark, 'line' | 'width' | 'dash' | 'fill' | 'color' | 'size'> & {bold?: boolean};
/** 新しい図形の書式（直線・矢印・四角形・楕円）：写真の上で見えるように赤の 2.25pt・塗りつぶしなし */
export const SHAPE_STYLE: MarkStyle = {line: 'FF0000', width: 2.25, dash: 'solid', fill: '', color: 'FF0000', size: 11};
/** 新しいテキストボックスの書式：白地に赤の 11pt・枠線なし（写真の上でも読めるように） */
export const TEXT_STYLE: MarkStyle = {line: '', width: 0.75, dash: 'solid', fill: 'FFFFFF', color: 'FF0000', size: 11};

export const isBoxKind = (k: PhotoMark['kind']) => k !== 'line';

const DASH_KEYS = new Set(DASHES.map((d) => d.key));
const KINDS = new Set(['line', 'rect', 'ellipse', 'text']);
const HEX = /^[0-9A-F]{6}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const unit = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(clamp(Number(v), 0, 1) * 10000) / 10000 : 0);
const hexOf = (v: unknown) => {
  const s = String(v ?? '').replace(/^#/, '').toUpperCase();
  return HEX.test(s) ? s : '';
};

/** 書き込みの番号 */
export const markId = () => uid('k');

/**
 * 書き込みをそろえる（保存したもの・前の版のもの）：位置は 0〜1、四角形などは左上・右下の順、色は 'RRGGBB'、太さは 0.25〜24pt、文字は 1〜400pt。
 * 長さのない直線・大きさのない四角形・文字のないテキストボックスは持たない
 */
export function cleanMarks(raw: unknown): PhotoMark[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const out: PhotoMark[] = [];
  for (const m of raw) {
    if (!isObj(m) || !KINDS.has(String(m.kind))) continue;
    const kind = m.kind as PhotoMark['kind'];
    let [x1, y1, x2, y2] = [unit(m.x1), unit(m.y1), unit(m.x2), unit(m.y2)];
    if (kind !== 'line') [x1, x2, y1, y2] = [Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2)];
    if (kind === 'line' ? Math.hypot(x2 - x1, y2 - y1) < 0.0005 : x2 - x1 < 0.0005 || y2 - y1 < 0.0005) continue;
    const text = typeof m.text === 'string' ? m.text.slice(0, 2000) : '';
    if (kind === 'text' && !text.trim()) continue;
    let id = typeof m.id === 'string' && m.id ? m.id : markId();
    if (ids.has(id)) id = markId();
    ids.add(id);
    const rot = kind !== 'line' && Number.isFinite(Number(m.rot)) ? Math.round((((Number(m.rot) % 360) + 360) % 360) * 10) / 10 : 0;
    const width = Number(m.width);
    const size = Number(m.size);
    out.push({
      id,
      kind,
      x1,
      y1,
      x2,
      y2,
      ...(rot && rot < 360 ? {rot} : {}),
      line: hexOf(m.line),
      width: Number.isFinite(width) && width > 0 ? Math.round(clamp(width, 0.25, 24) * 100) / 100 : SHAPE_STYLE.width,
      dash: DASH_KEYS.has(m.dash as PhotoMarkDash) ? (m.dash as PhotoMarkDash) : 'solid',
      ...(kind === 'line' && m.start === true ? {start: true} : {}),
      ...(kind === 'line' && m.end === true ? {end: true} : {}),
      fill: kind === 'line' ? '' : hexOf(m.fill),
      ...(kind !== 'line' && text ? {text} : {}),
      size: Number.isFinite(size) && size > 0 ? Math.round(clamp(size, 1, 400) * 10) / 10 : SHAPE_STYLE.size,
      color: hexOf(m.color) || '000000',
      ...(m.bold === true ? {bold: true} : {}),
    });
  }
  return out;
}

/** 回した四角（rot＝右回りの度。まん中で回る）の外側の四角 */
export function rotatedBounds(b: MarkBox, rot = 0): MarkBox {
  const t = (rot * Math.PI) / 180;
  const [c, s] = [Math.abs(Math.cos(t)), Math.abs(Math.sin(t))];
  const [w, h] = [b.w * c + b.h * s, b.w * s + b.h * c];
  return {x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h};
}

/** 写真の見えている四角（写真の図形の回す前の四角 box と角度 rot から）：書き込みの位置の基準 */
export const photoBounds = (box: MarkBox & {rot: number}): MarkBox => rotatedBounds(box, box.rot);

/** 直線の紙の上の始点・終点（vb＝写真の見えている四角） */
export function lineEnds(m: PhotoMark, vb: MarkBox): {x1: number; y1: number; x2: number; y2: number} {
  return {x1: vb.x + m.x1 * vb.w, y1: vb.y + m.y1 * vb.h, x2: vb.x + m.x2 * vb.w, y2: vb.y + m.y2 * vb.h};
}

/** 四角形・楕円・テキストボックスの紙の上の回す前の四角と角度 */
export function shapeBox(m: PhotoMark, vb: MarkBox): MarkBox & {rot: number} {
  const [x1, x2] = [Math.min(m.x1, m.x2), Math.max(m.x1, m.x2)];
  const [y1, y2] = [Math.min(m.y1, m.y2), Math.max(m.y1, m.y2)];
  return {x: vb.x + x1 * vb.w, y: vb.y + y1 * vb.h, w: (x2 - x1) * vb.w, h: (y2 - y1) * vb.h, rot: m.rot ?? 0};
}

/** 書き込みの外側の四角（紙の上。線の太さは入れない） */
export function markBounds(m: PhotoMark, vb: MarkBox): MarkBox {
  if (m.kind === 'line') {
    const e = lineEnds(m, vb);
    return {x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1)};
  }
  const b = shapeBox(m, vb);
  return rotatedBounds(b, b.rot);
}

/** 線の点線の形（SVG の stroke-dasharray。線の太さ w 画素）。丸点線は丸い端の点（すき間は太さと同じ） */
export function dashArray(dash: PhotoMarkDash, w: number): {array?: string; cap: 'butt' | 'round'} {
  if (dash === 'sysDot') return {array: `${Math.max(0.01, w * 0.001)} ${w * 2}`, cap: 'round'};
  const p = DASHES.find((d) => d.key === dash)?.pattern ?? [];
  return p.length ? {array: p.map((k) => k * w).join(' '), cap: 'butt'} : {cap: 'butt'};
}

/**
 * 矢印の先（Excel の「矢印」＝三角・中くらい）：長さ・幅は線の太さの 3倍（細い線でも 1pt の 3倍）。直線の長さより大きくしない。
 * tip＝矢印の先（線の端）、from＝線のもう一方の端。返すのは三角の3点と、線を三角の根元までにした端
 */
export function arrowHead(tip: {x: number; y: number}, from: {x: number; y: number}, w: number, both = false): {points: [number, number][]; base: {x: number; y: number}} {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const size = Math.min(3 * Math.max(w, PT_PX), len / (both ? 2 : 1));
  const [ux, uy] = [(tip.x - from.x) / len, (tip.y - from.y) / len];
  const base = {x: tip.x - ux * size, y: tip.y - uy * size};
  const [nx, ny] = [-uy * (size / 2), ux * (size / 2)];
  return {
    points: [
      [tip.x, tip.y],
      [base.x + nx, base.y + ny],
      [base.x - nx, base.y - ny],
    ],
    base,
  };
}

/** 写真の見えている四角の縦横の比（写真の画素で。幅÷高さ） */
function boundsAspect(photo: {w: number; h: number}, rot: number): number {
  const b = rotatedBounds({x: 0, y: 0, w: Math.max(photo.w, 1), h: Math.max(photo.h, 1)}, rot);
  return b.w / (b.h || 1);
}

/**
 * 写真を 90°・180°・270° 回したとき（↻ ↺・つまみで 90°）、書き込みも写真と一緒に回す（写真の同じ所に付いていく）。
 * 直線は端を回し、四角形・楕円は縦と横を入れかえ（90°回したのと同じ形）、テキストボックスは文字が横書きのまま読めるように大きさはそのままで動かす。
 * 90°の倍数でない回し方（斜め）は、そのまま（写真の見えている四角の中の割合のまま）
 */
export function turnMarks(marks: PhotoMark[], photo: {w: number; h: number}, fromRot: number, toRot: number): PhotoMark[] {
  const d = ((((toRot - fromRot) % 360) + 360) % 360);
  const q = Math.round(d / 90) % 4;
  if (q === 0 || Math.abs(d - Math.round(d / 90) * 90) > 0.5) return marks;
  let rot = fromRot;
  let out = marks;
  for (let i = 0; i < q; i++) {
    const a = boundsAspect(photo, rot); // 回す前の 幅÷高さ
    out = out.map((m) => {
      if (m.kind === 'line') return {...m, x1: unit(1 - m.y1), y1: unit(m.x1), x2: unit(1 - m.y2), y2: unit(m.x2)};
      const [cx, cy] = [(m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2];
      const [w, h] = [Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1)];
      const [nw, nh] = m.kind === 'text' ? [Math.min(1, w * a), Math.min(1, h / a)] : [h, w];
      const [ncx, ncy] = [clamp(1 - cy, nw / 2, 1 - nw / 2), clamp(cx, nh / 2, 1 - nh / 2)];
      return {...m, x1: unit(ncx - nw / 2), y1: unit(ncy - nh / 2), x2: unit(ncx + nw / 2), y2: unit(ncy + nh / 2)};
    });
    rot += 90;
  }
  return out;
}

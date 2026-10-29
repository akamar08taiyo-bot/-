// 写真に書き込む画面（ユーザーの指示「申請書の写真に書き込んで、手すりの位置や踏み台の位置など、書き込めるようにしたい。入力方法は、とにかくExcelに近づける。
// 文字の書き込み機能や、写真に棒をひく。色や長さをかえる、線の細さを調整するなど、徹底的にExcelに似せてください。」2026-10-27）。
// 写真の欄・プレビューの写真の「✏️ 書き込み」で開く。上は Excel の「図形の書式」のリボンと同じ並び：
//   図形の挿入（直線・矢印・双方向矢印・四角形・楕円・テキスト ボックス）／図形のスタイル（図形の塗りつぶし・図形の枠線＝色・太さ・実線／点線・矢印）／
//   フォント（サイズ・拡大・縮小・太字・文字の色）／配置（前面へ移動・背面へ移動・回転・削除）／クリップボード（貼り付け・切り取り・コピー）／サイズ（高さ・幅 cm）。
// 操作も Excel と同じ：図形を選んでドラッグで描く（Shift で 15°ずつ・正方形／正円、Ctrl でまん中から）、押して選ぶ（Shift・Ctrl で足す）、ドラッグで動かす
// （Shift で縦・横だけ、Ctrl で複製）、まわりの○で大きさ（角は Shift で縦横の比のまま）、上の↻で回す（Shift で 15°ずつ）、直線は端の○で長さ・向き、
// ダブルクリック（Enter・F2・そのまま打つ）で文字、Delete で削除、矢印キーで少し動かす（Shift＋矢印で大きさ・Alt＋←→で 15°回す）、
// Ctrl+Z／Y・Ctrl+C／X／V・Ctrl+D（複製）・Ctrl+A（すべて選ぶ）・Tab（次の図形）・Esc、右クリックのメニュー。
// 直したらすぐ様邸に入れる（自動保存）。位置・大きさ・線の太さ・文字の大きさは紙の上の大きさ（photoMarks.ts）で、プレビュー・Excel と同じ

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode} from 'react';
import {
  BOARD_PTS,
  BOARD_STYLE,
  cleanMarks,
  cmToPx,
  colorName,
  DASHES,
  FONT_SIZES,
  hasPts,
  hasText,
  isScribble,
  LINE_WIDTHS,
  lineEnds,
  MARK_FONT_DEFAULT,
  MARK_FONTS,
  markFontCss,
  MARK_INSET,
  MARK_LINE_K,
  markBounds,
  markId,
  markPts,
  nextNumberText,
  NUM_STYLE,
  PEN_STYLE,
  PT_PX,
  pxToCm,
  rotatedBounds,
  SHAPE_STYLE,
  shapeBox,
  simplifyStroke,
  STANDARD_COLORS,
  TEXT_STYLE,
  THEME_COLORS,
} from '../photoMarks.ts';
import type {MarkBox, MarkStyle} from '../photoMarks.ts';
import type {PhotoMark, PhotoMarkDash} from '../types.ts';
import {MarkLayer, markTextCss} from './MarkLayer.tsx';

type Pt = {x: number; y: number};
type Tool = 'pen' | 'poly' | 'line' | 'arrow' | 'arrow2' | 'rect' | 'ellipse' | 'text' | 'board' | 'num';
/**
 * 書式を覚える種類（新しい図形に使う）：shape＝直線・矢印・楕円（黄色）、rect＝枠囲み（正方形/長方形）・補強板（茶色）、pen＝手書き・折れ線（黄色）、
 * text＝テキストボックス、num＝番号
 */
type StyleKey = 'shape' | 'rect' | 'pen' | 'text' | 'num';
type Styles = Record<StyleKey, MarkStyle>;
const styleKeyOf = (k: PhotoMark['kind']): StyleKey => (k === 'text' ? 'text' : k === 'pen' ? 'pen' : k === 'board' || k === 'rect' ? 'rect' : 'shape');
const toolStyleKey = (t: Tool): StyleKey => (t === 'text' ? 'text' : t === 'num' ? 'num' : t === 'pen' || t === 'poly' ? 'pen' : t === 'rect' || t === 'board' ? 'rect' : 'shape');
type RBox = MarkBox & {rot: number};
type Drag =
  | {type: 'create'; tool: Tool; p0: Pt; id: string; ctrl: boolean}
  | {type: 'move'; p0: Pt; base: PhotoMark[]; ids: string[]; moved: boolean; copy: boolean; toggle: string | null}
  | {type: 'resize'; id: string; hx: number; hy: number; base: PhotoMark}
  | {type: 'rotate'; id: string; base: PhotoMark; a0: number}
  | {type: 'end'; id: string; which: 1 | 2; base: PhotoMark}
  // 手書き：pts＝描いた点（紙の画素）。straight＝長押しでまっすぐにした（そのあとは終わりの点を動かす）
  | {type: 'pen'; id: string; pts: Pt[]; straight: boolean}
  // 直線をまん中のまわりに回す（直線の ↻ のつまみ）
  | {type: 'rotline'; id: string; base: PhotoMark; a0: number; c: Pt};
type Menu = {name: 'fill' | 'line' | 'color' | 'size' | 'font' | 'front' | 'back' | 'rotate'; x: number; y: number} | {name: 'context'; x: number; y: number; on: boolean};

/** 図形の挿入のボタン（Excel の「図形」の線・四角形・基本図形の並び） */
// 手書きのペン・補強板・番号（ユーザーの指示「写真に、手書きなので、線を引ける機能…ベースプレート、木の補強板…四角の斜め」「平面図の中に、①②のように番号を」2026-10-29）
const TOOLS: {key: Tool; label: string}[] = [
  {key: 'pen', label: 'ペン（手書き。長押しでまっすぐ・ぐしゃぐしゃで消す）'},
  {key: 'poly', label: '折れ線（押すたびに角。ダブルクリック・Enter で終わる）'},
  {key: 'line', label: '直線'},
  {key: 'arrow', label: '矢印'},
  {key: 'arrow2', label: '双方向矢印'},
  {key: 'rect', label: '正方形/長方形'},
  {key: 'ellipse', label: '楕円'},
  {key: 'board', label: '補強板（四角と斜めの線）'},
  {key: 'text', label: 'テキスト ボックス'},
  {key: 'num', label: '番号（①②…。押すたびに次の番号）'},
];
/**
 * 描いたあとも道具をそのままにするもの（続けて描く・番号を続けて置く。ユーザーの指示「連続で線を引くことができない」2026-10-29）。
 * やめるときは「選択」・同じ道具をもう一度・Esc
 */
const KEEP_TOOL = new Set<Tool>(['pen', 'poly', 'line', 'arrow', 'arrow2', 'rect', 'ellipse', 'board', 'num']);
const TOOL_KEY = 'taiyo-sasaoka-mark-tool-v1'; // この端末で最後に使った描く道具（開いたときにその道具。初めは直線）
/** 開いたときの道具：前に使った描く道具（続けて描く道具だけ）。初めは直線（ユーザーの指示「デフォルトは棒線にする」2026-10-29） */
function loadTool(): Tool {
  try {
    const t = localStorage.getItem(TOOL_KEY) as Tool | null;
    return t && KEEP_TOOL.has(t) ? t : 'line';
  } catch {
    return 'line';
  }
}
const LONG_PRESS = 550; // 手書きの線を、止めてからまっすぐにするまでの時間（ミリ秒。iPhone のメモと同じぐらい）

/** 書式の欄の色（よく使う色。黄＝線・ペン、茶＝枠囲み・補強板の初めの色） */
const PANEL_COLORS: [string, string][] = [
  ['FFFF00', '黄'],
  ['996633', '茶'],
  ['FF0000', '赤'],
  ['FFC000', 'オレンジ'],
  ['92D050', '薄い緑'],
  ['00B050', '緑'],
  ['00B0F0', '薄い青'],
  ['0070C0', '青'],
  ['7030A0', '紫'],
  ['FFFFFF', '白'],
  ['808080', '灰色'],
  ['000000', '黒'],
];

/** 書式の欄のひとまとまり（見出しと中身） */
function PanelSection({label, children}: {label: string; children: ReactNode}) {
  return (
    <div role="group" aria-label={label} className="shrink-0">
      <div className="pb-1 text-[13px] text-slate-500">{label}</div>
      <div className="flex gap-1 md:flex-wrap">{children}</div>
    </div>
  );
}

const MIN = 2; // 図形のいちばん小さい大きさ（紙の画素）
const STYLE_KEY = 'taiyo-sasaoka-mark-style-v2'; // v2：線は黄色・枠囲みは茶色を初めの色に（2026-10-29。前の版で覚えた赤を引き継がない） // この端末で最後に選んだ書式（新しい図形に使う。Excel の「既定の図形に設定」のかわり）
const r5 = (v: number) => Math.round(v * 100000) / 100000;
const normDeg = (d: number) => (Math.round((((d % 360) + 360) % 360) * 10) / 10) % 360;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rotP = (p: Pt, c: Pt, deg: number): Pt => {
  const t = (deg * Math.PI) / 180;
  const [cs, sn] = [Math.cos(t), Math.sin(t)];
  const [dx, dy] = [p.x - c.x, p.y - c.y];
  return {x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs};
};
const center = (b: MarkBox): Pt => ({x: b.x + b.w / 2, y: b.y + b.h / 2});
/** Shift：始点からの向きを 15°ずつに（Excel と同じ） */
const snap15 = (p0: Pt, p: Pt): Pt => {
  const len = Math.hypot(p.x - p0.x, p.y - p0.y);
  const a = Math.round(Math.atan2(p.y - p0.y, p.x - p0.x) / (Math.PI / 12)) * (Math.PI / 12);
  return {x: p0.x + len * Math.cos(a), y: p0.y + len * Math.sin(a)};
};
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const [vx, vy] = [b.x - a.x, b.y - a.y];
  const t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
};

/** この端末で最後に選んだ書式（新しい図形・テキストボックス・ペン・補強板・番号）。読めなければ最初の書式 */
function loadStyles(): Styles {
  const pick = (raw: unknown, base: MarkStyle, kind: PhotoMark['kind']): MarkStyle => {
    const m = cleanMarks([{kind, x1: 0, y1: 0, x2: 1, y2: 1, text: 'a', ...base, ...(raw && typeof raw === 'object' ? raw : {})}])[0];
    return m ? {line: m.line, width: m.width, dash: m.dash, fill: m.fill, color: m.color, size: m.size, bold: !!m.bold, ...(m.font ? {font: m.font} : {})} : base;
  };
  const base: Styles = {shape: SHAPE_STYLE, rect: BOARD_STYLE, pen: PEN_STYLE, text: TEXT_STYLE, num: NUM_STYLE};
  try {
    const raw = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as Partial<Record<StyleKey, unknown>> | null;
    return {
      shape: pick(raw?.shape, SHAPE_STYLE, 'rect'),
      rect: pick(raw?.rect, BOARD_STYLE, 'rect'),
      pen: pick(raw?.pen, PEN_STYLE, 'rect'),
      text: pick(raw?.text, TEXT_STYLE, 'text'),
      num: pick(raw?.num, NUM_STYLE, 'text'),
    };
  } catch {
    return base;
  }
}

/** 文字の高さ（紙の画素）：テキストボックスの「テキストに合わせて図形のサイズを調整する」 */
let measureBox: HTMLDivElement | null = null;
function textHeight(m: PhotoMark, w: number): number {
  if (!measureBox) {
    measureBox = document.createElement('div');
    Object.assign(measureBox.style, {position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden', boxSizing: 'border-box'});
    document.body.appendChild(measureBox);
  }
  Object.assign(measureBox.style, markTextCss(m, 1) as Record<string, string>, {width: `${w}px`});
  measureBox.style.fontSize = `${m.size * PT_PX}px`;
  measureBox.style.padding = `${MARK_INSET.y}px ${MARK_INSET.x}px`;
  measureBox.textContent = (m.text ?? '') + ((m.text ?? '').endsWith('\n') || !m.text ? '\u200b' : '');
  return Math.max(measureBox.scrollHeight, m.size * PT_PX * MARK_LINE_K + 2 * MARK_INSET.y);
}

/** 直線の端を入れる（紙の画素 → 割合） */
const withLine = (m: PhotoMark, W: number, H: number, a: Pt, b: Pt): PhotoMark => ({...m, x1: r5(a.x / W), y1: r5(a.y / H), x2: r5(b.x / W), y2: r5(b.y / H)});
/** 四角形・楕円・テキストボックスの回す前の四角と角度を入れる */
function withBox(m: PhotoMark, W: number, H: number, b: RBox): PhotoMark {
  const {rot: _rot, ...rest} = m;
  const rot = normDeg(b.rot);
  return {...rest, x1: r5(b.x / W), y1: r5(b.y / H), x2: r5((b.x + b.w) / W), y2: r5((b.y + b.h) / H), ...(rot ? {rot} : {})};
}
/** 写真の中に収まっているか（回す前の四角・直線の端。少しのはみ出しは丸める） */
function inside(m: PhotoMark, W: number, H: number): boolean {
  const V = {x: 0, y: 0, w: W, h: H};
  const b = m.kind === 'line' ? markBounds(m, V) : shapeBox(m, V);
  return b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5;
}
/** 動かせる量（どの図形も写真から出ない範囲） */
function moveBy(list: PhotoMark[], W: number, H: number, dx: number, dy: number): PhotoMark[] {
  const V = {x: 0, y: 0, w: W, h: H};
  let [lx, hx, ly, hy] = [-Infinity, Infinity, -Infinity, Infinity];
  for (const m of list) {
    const b = m.kind === 'line' ? markBounds(m, V) : shapeBox(m, V);
    [lx, hx, ly, hy] = [Math.max(lx, -b.x), Math.min(hx, W - b.x - b.w), Math.max(ly, -b.y), Math.min(hy, H - b.y - b.h)];
  }
  const [ux, uy] = [lx > hx ? 0 : clamp(dx, lx, hx) / W, ly > hy ? 0 : clamp(dy, ly, hy) / H];
  return list.map((m) => ({...m, x1: r5(m.x1 + ux), x2: r5(m.x2 + ux), y1: r5(m.y1 + uy), y2: r5(m.y2 + uy)}));
}
/** 押した所の図形：2＝線・枠・塗り・文字の上、1＝塗りのない図形の中、0＝外 */
function hitMark(m: PhotoMark, p: Pt, W: number, H: number, tol: number): 0 | 1 | 2 {
  const V = {x: 0, y: 0, w: W, h: H};
  const sw = m.line ? (m.width * PT_PX) / 2 : 0;
  if (m.kind === 'line') {
    const e = lineEnds(m, V);
    return segDist(p, {x: e.x1, y: e.y1}, {x: e.x2, y: e.y2}) <= tol + sw ? 2 : 0;
  }
  const b = shapeBox(m, V);
  const c = center(b);
  const q = rotP(p, c, -b.rot);
  // 手書きの線・折れ線・補強板の斜めの線：点をつないだ線の上（手書きの線はそれだけ。補強板は下の四角も）
  if (hasPts(m.kind)) {
    const pts = markPts(m, V);
    for (let i = 1; i < pts.length; i++) if (segDist(q, pts[i - 1], pts[i]) <= tol + sw) return 2;
    if (m.kind === 'pen') return 0;
  }
  const [lx, ly, hw, hh] = [q.x - c.x, q.y - c.y, b.w / 2, b.h / 2];
  const edge = tol + sw;
  const solid = m.kind === 'text' || !!m.fill || !!m.text;
  if (m.kind === 'ellipse') {
    const r = Math.hypot(lx / (hw || 1), ly / (hh || 1));
    if (Math.abs(r - 1) * Math.min(hw, hh) <= edge) return 2;
    return r < 1 ? (solid ? 2 : 1) : 0;
  }
  if (Math.abs(lx) > hw + edge || Math.abs(ly) > hh + edge) return 0;
  if (Math.abs(Math.abs(lx) - hw) <= edge || Math.abs(Math.abs(ly) - hh) <= edge) return 2;
  return solid ? 2 : 1;
}
/** 押した所のいちばん前の図形（線・枠を先に。塗りのない図形の中は、ほかに当たらないときだけ） */
function topHit(marks: PhotoMark[], p: Pt, W: number, H: number, tol: number): PhotoMark | null {
  let weak: PhotoMark | null = null;
  for (let i = marks.length - 1; i >= 0; i--) {
    const h = hitMark(marks[i], p, W, H, tol);
    if (h === 2) return marks[i];
    if (h === 1 && !weak) weak = marks[i];
  }
  return weak;
}
/** 回した四角のつまみ（hx・hy は −1・0・1）と、回すつまみの位置（紙の画素） */
function boxHandles(b: RBox, rotGap: number): {hx: number; hy: number; p: Pt}[] {
  const c = center(b);
  const out: {hx: number; hy: number; p: Pt}[] = [];
  for (const hy of [-1, 0, 1])
    for (const hx of [-1, 0, 1]) if (hx || hy) out.push({hx, hy, p: rotP({x: c.x + (hx * b.w) / 2, y: c.y + (hy * b.h) / 2}, c, b.rot)});
  out.push({hx: 0, hy: -2, p: rotP({x: c.x, y: c.y - b.h / 2 - rotGap}, c, b.rot)}); // 回す（hy＝−2）
  return out;
}
/** つまみで大きさを変える（反対の角・辺は動かない。Shift で縦横の比のまま、Ctrl でまん中から） */
function resizeBox(b: RBox, hx: number, hy: number, p: Pt, keep: boolean, fromCenter: boolean): RBox {
  const c = center(b);
  const q = rotP(p, c, -b.rot);
  const [lx, ly] = [q.x - c.x, q.y - c.y];
  let [w, h] = [b.w, b.h];
  if (fromCenter) {
    if (hx) w = Math.max(MIN, 2 * hx * lx);
    if (hy) h = Math.max(MIN, 2 * hy * ly);
  } else {
    if (hx) w = Math.max(MIN, hx * (lx + (hx * b.w) / 2));
    if (hy) h = Math.max(MIN, hy * (ly + (hy * b.h) / 2));
  }
  if (keep && hx && hy) {
    const s = Math.max(w / b.w, h / b.h);
    [w, h] = [b.w * s, b.h * s];
  }
  const [cx, cy] = fromCenter ? [0, 0] : [hx ? (-hx * b.w) / 2 + (hx * w) / 2 : 0, hy ? (-hy * b.h) / 2 + (hy * h) / 2 : 0];
  const nc = rotP({x: c.x + cx, y: c.y + cy}, c, b.rot);
  return {x: nc.x - w / 2, y: nc.y - h / 2, w, h, rot: b.rot};
}

/** 書き込みの道具の小さな絵（Excel のリボンの絵に近い形） */
function Icon({name, color}: {name: string; color?: string}) {
  const s = {width: 24, height: 24, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true} as const;
  // 矢印の先（x・y が先、dx・dy は線の向き）
  const arrow = (x: number, y: number, dx: number, dy: number) => {
    const a = Math.atan2(dy, dx);
    const p = (t: number) => `${x - 5 * Math.cos(a + t)},${y - 5 * Math.sin(a + t)}`;
    return <polygon points={`${x},${y} ${p(0.45)} ${p(-0.45)}`} fill="currentColor" stroke="none" />;
  };
  switch (name) {
    case 'select':
      return <svg {...s}><path d="M5 2.5 V15.5 L8.3 12.4 L10.6 17.5 L12.6 16.6 L10.3 11.6 H14.8 Z" fill="white" strokeLinejoin="round" /></svg>;
    case 'pen':
      return <svg {...s}><path d="M2.5 15 C5 9 7.5 16 10 11 S14.5 6 17.5 4.5" strokeLinecap="round" /></svg>;
    case 'poly':
      return <svg {...s}><path d="M3 16.5 L3 7 L11 7 L11 13 L17.5 13" strokeLinejoin="round" /><circle cx="3" cy="7" r="1.3" fill="currentColor" /><circle cx="11" cy="7" r="1.3" fill="currentColor" /><circle cx="11" cy="13" r="1.3" fill="currentColor" /></svg>;
    case 'board':
      return <svg {...s}><rect x="2.5" y="4.5" width="15" height="11" stroke="#996633" /><path d="M2.5 15.5 L17.5 4.5" stroke="#996633" /></svg>;
    case 'num':
      return <svg {...s}><circle cx="10" cy="10" r="7.5" /><path d="M8.3 7.3 L10.3 6 V14.3 M8.2 14.3 H12.3" strokeLinecap="round" /></svg>;
    case 'line':
      return <svg {...s}><line x1="3" y1="17" x2="17" y2="3" /></svg>;
    case 'arrow':
      return <svg {...s}><line x1="3" y1="17" x2="15" y2="5" />{arrow(17, 3, 14, -14)}</svg>;
    case 'arrow2':
      return <svg {...s}><line x1="5" y1="15" x2="15" y2="5" />{arrow(17, 3, 14, -14)}{arrow(3, 17, -14, 14)}</svg>;
    case 'rect':
      return <svg {...s}><rect x="2.5" y="4.5" width="15" height="11" /></svg>;
    case 'ellipse':
      return <svg {...s}><ellipse cx="10" cy="10" rx="7.5" ry="5.5" /></svg>;
    case 'text':
      return <svg {...s}><rect x="2.5" y="3.5" width="15" height="13" strokeWidth="1.2" /><path d="M6.5 13.5 L10 6 L13.5 13.5 M7.8 11 H12.2" /></svg>;
    case 'fill':
      return <svg {...s}><path d="M4 9 L9 4 L15 10 L10 15 Z" /><path d="M15.5 12 q1.5 2 0 3 q-1.5 -1 0 -3" fill="currentColor" /><rect x="2" y="17" width="16" height="3" fill={color || 'transparent'} stroke={color ? 'none' : '#94a3b8'} strokeWidth="0.8" /></svg>;
    case 'outline':
      return <svg {...s}><path d="M5 13 L13 5 L15 7 L7 15 L4.5 15.5 Z" /><rect x="2" y="17" width="16" height="3" fill={color || 'transparent'} stroke={color ? 'none' : '#94a3b8'} strokeWidth="0.8" /></svg>;
    case 'fontColor':
      return <svg {...s}><path d="M5.5 14 L10 3 L14.5 14 M7.2 10 H12.8" /><rect x="2" y="16.5" width="16" height="3.5" fill={color} stroke="none" /></svg>;
    case 'front':
      return <svg {...s}><rect x="2.5" y="2.5" width="9" height="9" strokeDasharray="2 1.5" /><rect x="7.5" y="7.5" width="10" height="10" fill="#e2e8f0" /></svg>;
    case 'back':
      return <svg {...s}><rect x="7.5" y="7.5" width="10" height="10" strokeDasharray="2 1.5" /><rect x="2.5" y="2.5" width="9" height="9" fill="#e2e8f0" /></svg>;
    case 'rotate':
      return <svg {...s}><path d="M15 6 A6.5 6.5 0 1 0 16.5 11" /><path d="M15.5 2.5 L15.3 6.3 L11.6 5.6" /></svg>;
    case 'delete':
      return <svg {...s}><path d="M4 6 H16 M8 6 V4 H12 V6 M6 6 L7 17 H13 L14 6" /></svg>;
    case 'cut':
      return <svg {...s}><circle cx="6" cy="15" r="2.5" /><circle cx="14" cy="15" r="2.5" /><path d="M7.5 13 L14 3 M12.5 13 L6 3" /></svg>;
    case 'copy':
      return <svg {...s}><rect x="7" y="6" width="9" height="11" /><path d="M4 13 V3 H12" /></svg>;
    case 'paste':
      return <svg {...s}><rect x="4" y="4" width="11" height="14" /><rect x="7" y="2.5" width="5" height="3" fill="white" /><rect x="9" y="9" width="8" height="9" fill="white" /></svg>;
    default:
      return null;
  }
}

/** リボンのひとまとまり（Excel と同じく、下に小さな名前） */
function Group({label, children}: {label: string; children: ReactNode}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 flex-col border-r border-slate-200 px-2 pt-1 last:border-r-0">
      <div className="flex flex-1 items-start gap-0.5">{children}</div>
      <div className="whitespace-nowrap pb-1 pt-0.5 text-center text-[13px] text-slate-500">{label}</div>
    </div>
  );
}

const RB = 'flex h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center gap-1 rounded px-2 text-[15px] text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-35';

/** 色を選ぶ（Excel の色のメニュー：テーマの色 10×6・標準の色・なし・その他の色） */
function ColorPicker({value, none, onPick}: {value: string; none?: string; onPick: (hex: string) => void}) {
  const sw = (hex: string, name: string) => (
    <button
      key={hex + name}
      type="button"
      role="menuitemradio"
      aria-checked={value === hex}
      aria-label={name}
      title={name}
      onClick={() => onPick(hex)}
      className={`h-[18px] w-[18px] border border-slate-300 hover:outline hover:outline-2 hover:outline-amber-500 ${value === hex ? 'outline outline-2 outline-amber-600' : ''}`}
      style={{background: `#${hex}`}}
    />
  );
  return (
    <div className="w-[236px] text-[12px] text-slate-700">
      <div className="px-1 pb-1 font-medium text-slate-600">テーマの色</div>
      <div className="flex gap-[4px] px-1">
        {THEME_COLORS.map((col, i) => (
          <div key={i} className="flex flex-col">
            {sw(col[0], colorName(col[0]))}
            <div className="mt-1 flex flex-col">{col.slice(1).map((hex) => sw(hex, colorName(hex)))}</div>
          </div>
        ))}
      </div>
      <div className="px-1 pb-1 pt-2 font-medium text-slate-600">標準の色</div>
      <div className="flex gap-[4px] px-1">{STANDARD_COLORS.map(([hex, name]) => sw(hex, name))}</div>
      {none && (
        <button type="button" role="menuitem" onClick={() => onPick('')} className={`mt-2 flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-100 ${value === '' ? 'bg-slate-100' : ''}`}>
          <span className="h-4 w-4 border border-slate-400 bg-white" />
          {none}
        </button>
      )}
      <label className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-100">
        <span className="h-4 w-4 rounded-full" style={{background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)'}} />
        その他の色…
        <input type="color" className="sr-only" aria-label="その他の色" value={`#${value || '000000'}`} onChange={(e) => onPick(e.target.value.slice(1).toUpperCase())} />
      </label>
    </div>
  );
}

export function PhotoMarkEditor({
  title,
  photo,
  size,
  marks: initial,
  onChange,
  onClose,
  onRotate,
  what = '写真',
}: {
  title: string;
  photo: {url: string; w: number; h: number; rot: number};
  size: {w: number; h: number}; // 写真の見えている四角の紙の上の大きさ（画素）
  marks: PhotoMark[];
  onChange: (marks: PhotoMark[]) => void;
  onClose: () => void;
  onRotate?: (dir: 1 | -1) => void; // 写真を 90°回す（書き込みも一緒に回して、marks・photo.rot・size を渡し直してもらう）
  what?: string; // 何に書き込むか（画面の名前「…の写真に書き込む」。平面図は「図」）
}) {
  const W = Math.max(1, size.w);
  const H = Math.max(1, size.h);
  const V = {x: 0, y: 0, w: W, h: H};
  const [marks, setMarks] = useState<PhotoMark[]>(initial);
  const [draft, setDraft] = useState<PhotoMark[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool | null>(loadTool);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sub, setSub] = useState<'width' | 'dash' | 'arrow' | null>(null);
  const [styles, setStyles] = useState<Styles>(loadStyles);
  const [armKey, setArmKey] = useState(0); // 文字を打つ所を作り直す（元に戻したときなど、打つ所の文字を今の文字にそろえる）
  const [fontText, setFontText] = useState<string | null>(null); // フォント サイズの欄に打っている途中の文字
  const [sizeText, setSizeText] = useState<{h?: string; w?: string}>({});
  // 塗りつぶし・枠線・文字の色のボタンの下の色（最後に選んだ色。ボタンを押すとその色に。Excel と同じ）
  const [recent, setRecent] = useState(() => ({fill: styles.shape.fill || 'FFFFFF', line: styles[toolStyleKey(loadTool())].line || SHAPE_STYLE.line, color: styles.text.color}));
  const shown = draft ?? marks;
  const latest = useRef({marks, editing});
  latest.current = {marks, editing};
  const past = useRef<PhotoMark[][]>([]);
  const future = useRef<PhotoMark[][]>([]);
  const editStart = useRef<PhotoMark[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const poly = useRef<{id: string; pts: Pt[]} | null>(null); // 折れ線を描いている途中（押した角の点。紙の画素）
  const press = useRef<{timer: number; at: Pt} | null>(null); // 手書きの線の長押し（止めた所）
  const lastTap = useRef<{id: string; t: number; x: number; y: number} | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const proxyRef = useRef<HTMLTextAreaElement>(null);
  const fine = useRef(typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches);
  const [area, setArea] = useState({w: 0, h: 0});
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({w: el.clientWidth, h: el.clientHeight});
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const margin = 28; // 写真のまわりの余白（端のつまみ・回すつまみを押せるように）
  const k = area.w > 0 ? Math.max(0.05, Math.min((area.w - 2 * margin) / W, (area.h - 2 * margin) / H)) : 0;
  const ox = Math.max(margin, (area.w - W * k) / 2);
  const oy = Math.max(margin, (area.h - H * k) / 2);

  // 画面の後ろのスクロールを止める
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 写真を回したら、回した書き込み（親が写真と一緒に回したもの）を読み直す。元に戻すは、回す前の書き込みに戻せないので空にする
  const rotSeen = useRef(photo.rot);
  useEffect(() => {
    if (rotSeen.current === photo.rot) return;
    rotSeen.current = photo.rot;
    setMarks(initial);
    latest.current.marks = initial;
    past.current = [];
    future.current = [];
    setSel([]);
    setDraft(null);
  }, [photo.rot, initial]);

  const byId = (id: string, list = shown) => list.find((m) => m.id === id);
  const selected = shown.filter((m) => sel.includes(m.id));
  const single = selected.length === 1 ? selected[0] : null;

  /** 直したものを入れる（元に戻せるように、前の形を覚える） */
  const commit = (next: PhotoMark[], before: PhotoMark[] = latest.current.marks) => {
    past.current = [...past.current.slice(-99), before];
    future.current = [];
    setMarks(next);
    latest.current.marks = next;
    onChange(next);
  };
  /** 書式を直す（選んだ図形と、これから描く図形に） */
  const restyle = (patch: Partial<MarkStyle>, target: StyleKey | 'auto' = 'auto') => {
    const ids = new Set(sel);
    if (ids.size) {
      const next = marks.map((m) => {
        if (!ids.has(m.id)) return m;
        const {fill: _fill, ...forLine} = patch; // 直線・手書きの線に塗りつぶしはない
        const n = {...m, ...(m.kind === 'line' || m.kind === 'pen' ? forLine : patch)} as PhotoMark;
        return n.kind === 'text' && (patch.size !== undefined || patch.bold !== undefined || patch.font !== undefined) ? fitText(n) : n;
      });
      commit(next);
    }
    // 覚える書式：選んだ図形の種類の書式。選んでいなければ、描いている道具の書式（ペンなら黄色のペンの色・太さが変わる）
    const kinds: Set<StyleKey> = ids.size
      ? new Set(selected.map((m) => styleKeyOf(m.kind)))
      : new Set([target === 'text' ? (tool === 'num' ? 'num' : 'text') : tool ? toolStyleKey(tool) : target === 'auto' ? 'shape' : target]);
    // 塗りつぶしは、選んだ図形を塗ったときは覚えない（次の枠囲みまで塗りつぶされて写真が隠れないように）。何も選ばずに選んだときだけ、次に描く図形に
    const {fill: _f, ...keep} = patch;
    const remember = ids.size ? keep : patch;
    setStyles((s) => {
      const out = Object.fromEntries((Object.keys(s) as StyleKey[]).map((key) => [key, kinds.has(key) ? {...s[key], ...remember} : s[key]])) as Styles;
      try {
        localStorage.setItem(STYLE_KEY, JSON.stringify(out));
      } catch {
        /* 覚えられなくても、この画面ではそのまま使える */
      }
      return out;
    });
  };
  /** テキストボックスの高さを文字に合わせる（Excel の「テキストに合わせて図形のサイズを調整する」） */
  const fitText = (m: PhotoMark): PhotoMark => {
    if (m.kind !== 'text') return m;
    const b = shapeBox(m, V);
    const h = Math.min(H, textHeight(m, b.w));
    const y = clamp(b.y, 0, H - h);
    return withBox(m, W, H, {...b, y, h});
  };

  // ---------------------------------------------------------------- 文字を打つ
  const startEdit = (id: string) => {
    const m = byId(id, marks);
    if (!m || !hasText(m.kind)) return;
    editStart.current = marks;
    setSel([id]);
    setEditing(id);
    setTool(null);
  };
  /** 文字を打ち終わる：変わっていれば入れる（元に戻せる）。文字のないテキストボックスは消す */
  const endEdit = () => {
    const {editing: id, marks: cur} = latest.current;
    if (!id) return;
    setEditing(null);
    const before = editStart.current ?? cur;
    editStart.current = null;
    const m = cur.find((x) => x.id === id);
    let next = cur;
    if (m && m.kind === 'text' && !m.text?.trim()) {
      next = cur.filter((x) => x.id !== id);
      setSel([]);
    } else if (m && m.text !== undefined && !m.text) {
      const {text: _t, ...rest} = m;
      next = cur.map((x) => (x.id === id ? rest : x));
    }
    if (JSON.stringify(next) !== JSON.stringify(before)) commit(next, before);
    else setMarks(next);
    setArmKey((n) => n + 1);
  };
  const onText = (text: string) => {
    const id = latest.current.editing ?? (sel.length === 1 ? sel[0] : null);
    if (!id) return;
    if (!latest.current.editing) {
      editStart.current = marks;
      setEditing(id);
    }
    const next = latest.current.marks.map((m) => (m.id === id ? fitText({...m, text}) : m));
    latest.current.marks = next;
    setMarks(next);
  };
  /**
   * 文字を打つ所にカーソル（文字の終わり）。打つ所にもうカーソルがあるときは動かさない（選んだだけで待っていて、打ち始めた＝日本語の変換の途中に動かすと、変換が切れる）。
   * 指（iPad・スマホ）では、選んだだけでは打つ所に入らない（キーボードが出てしまうので。ダブルタップで打つ）
   */
  const arm = () => {
    const el = editRef.current;
    if (!el || (!latest.current.editing && !fine.current) || document.activeElement === el) return;
    el.focus({preventScroll: true});
    el.setSelectionRange(el.value.length, el.value.length);
  };
  useEffect(arm, [editing, armKey, single?.id]);
  // 閉じるときに打っている文字を入れる
  useEffect(
    () => () => {
      if (latest.current.editing) {
        const {marks: cur, editing: id} = latest.current;
        const m = cur.find((x) => x.id === id);
        onChange(m && m.kind === 'text' && !m.text?.trim() ? cur.filter((x) => x.id !== id) : cur);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------------------------------------------------------------- 元に戻す・コピー・貼り付けなど
  const undo = () => {
    endEdit();
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current.marks);
    setMarks(prev);
    latest.current.marks = prev;
    onChange(prev);
    setSel((s) => s.filter((id) => prev.some((m) => m.id === id)));
    setArmKey((n) => n + 1);
  };
  const redo = () => {
    endEdit();
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current.marks);
    setMarks(next);
    latest.current.marks = next;
    onChange(next);
    setSel((s) => s.filter((id) => next.some((m) => m.id === id)));
    setArmKey((n) => n + 1);
  };
  const remove = () => {
    if (!sel.length) return;
    commit(marks.filter((m) => !sel.includes(m.id)));
    setSel([]);
  };
  const copy = () => {
    if (!selected.length) return;
    clip.items = selected.map((m) => ({...m}));
    clip.times = 0;
  };
  const cut = () => {
    copy();
    remove();
  };
  /** 貼り付け・複製：少しずらして（Excel と同じく、くり返すと少しずつずれる） */
  const pasteList = (items: PhotoMark[], times: number) => {
    if (!items.length) return;
    const d = 8 * times;
    let list = items.map((m) => ({...m, id: markId()}));
    const moved = moveBy(list, W, H, d, d);
    list = moved.every((m) => inside(m, W, H)) ? moved : list;
    list = list.filter((m) => inside(m, W, H));
    if (!list.length) return;
    commit([...marks, ...list]);
    setSel(list.map((m) => m.id));
  };
  const paste = () => {
    clip.times++;
    pasteList(clip.items, clip.times);
  };
  const duplicate = () => pasteList(selected, 1);
  /** 重なりの順：前面へ（1つ）・最前面へ・背面へ（1つ）・最背面へ */
  const order = (how: 'front' | 'top' | 'back' | 'bottom') => {
    if (!sel.length) return;
    const ids = new Set(sel);
    let next = [...marks];
    if (how === 'top') next = [...next.filter((m) => !ids.has(m.id)), ...next.filter((m) => ids.has(m.id))];
    else if (how === 'bottom') next = [...next.filter((m) => ids.has(m.id)), ...next.filter((m) => !ids.has(m.id))];
    else if (how === 'front') {
      for (let i = next.length - 2; i >= 0; i--) if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
    } else for (let i = 1; i < next.length; i++) if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
    commit(next);
  };
  /** 回転（右へ 90°・左へ 90°・上下反転・左右反転）。写真からはみ出すものは回さない */
  const turn = (how: 'right' | 'left' | 'flipV' | 'flipH') => {
    if (!sel.length) return;
    const next = marks.map((m) => {
      if (!sel.includes(m.id)) return m;
      let n: PhotoMark;
      if (m.kind === 'line') {
        const e = lineEnds(m, V);
        const c = {x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2};
        const f = (p: Pt): Pt => (how === 'right' ? rotP(p, c, 90) : how === 'left' ? rotP(p, c, -90) : how === 'flipH' ? {x: 2 * c.x - p.x, y: p.y} : {x: p.x, y: 2 * c.y - p.y});
        n = withLine(m, W, H, f({x: e.x1, y: e.y1}), f({x: e.x2, y: e.y2}));
      } else if (hasPts(m.kind) && (how === 'flipH' || how === 'flipV')) {
        // 手書きの線・補強板の反転：中の点を鏡に（角度は逆向き）
        const b = shapeBox(m, V);
        n = withBox({...m, pts: (m.pts ?? BOARD_PTS).map(([x, y]) => (how === 'flipH' ? [r5(1 - x), y] : [x, r5(1 - y)]) as [number, number])}, W, H, {...b, rot: -b.rot});
      } else {
        const b = shapeBox(m, V);
        const rot = how === 'right' ? b.rot + 90 : how === 'left' ? b.rot - 90 : how === 'flipH' ? -b.rot : 180 - b.rot;
        n = withBox(m, W, H, {...b, rot: m.kind === 'text' && (how === 'flipH' || how === 'flipV') ? b.rot : rot});
      }
      return inside(n, W, H) ? n : m;
    });
    commit(next);
  };
  /** サイズ（高さ・幅 cm）：Excel と同じく、左上（回していればまん中）は動かさない。直線は始点から */
  const resizeTo = (dim: 'h' | 'w', cm: number) => {
    if (!sel.length || !(cm >= 0)) return;
    const px = cmToPx(cm);
    const next = marks.map((m) => {
      if (!sel.includes(m.id)) return m;
      if (m.kind === 'line') {
        const e = lineEnds(m, V);
        const [dx, dy] = [e.x2 - e.x1, e.y2 - e.y1];
        const b = dim === 'w' ? {x: e.x1 + (dx < 0 ? -1 : 1) * px, y: e.y2} : {x: e.x2, y: e.y1 + (dy < 0 ? -1 : 1) * px};
        return withLine(m, W, H, {x: e.x1, y: e.y1}, {x: clamp(b.x, 0, W), y: clamp(b.y, 0, H)});
      }
      const b = shapeBox(m, V);
      const nb = {...b, [dim]: Math.max(MIN, px)} as RBox;
      if (b.rot) [nb.x, nb.y] = [b.x + b.w / 2 - nb.w / 2, b.y + b.h / 2 - nb.h / 2];
      nb.w = Math.min(nb.w, W);
      nb.h = Math.min(nb.h, H);
      nb.x = clamp(nb.x, 0, W - nb.w);
      nb.y = clamp(nb.y, 0, H - nb.h);
      const n = withBox(m, W, H, nb);
      return m.kind === 'text' && dim === 'w' ? fitText(n) : n;
    });
    commit(next);
  };

  // ---------------------------------------------------------------- キーボード（Excel と同じ）
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    const typing = t && t !== editRef.current && t.closest('input, textarea:not([data-proxy]), select');
    const onButton = t && t !== editRef.current && t.closest('button, [role="menu"], [role="toolbar"]');
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.key === 'Escape' || (e.key === 'Enter' && poly.current)) {
      e.preventDefault();
      // 折れ線の途中：そこまでの線で終える（Excel のフリーフォームと同じ）。もう一度 Esc で道具をやめる
      if (poly.current) finishPoly();
      else if (editing) endEdit();
      else if (menu) setMenu(null);
      else if (tool) {
        setTool(null);
        setSel([]);
      } else if (sel.length) setSel([]);
      else onClose();
      return;
    }
    if (typing) return;
    if (editing) {
      // 文字を打っているあいだは、ふつうの文字の操作（Ctrl+Z も文字の中の元に戻す）
      return;
    }
    const armed = t === editRef.current;
    if (ctrl && !e.altKey) {
      const act: Record<string, () => void> = {z: e.shiftKey ? redo : undo, y: redo, c: copy, x: cut, v: paste, d: duplicate, a: () => setSel(marks.map((m) => m.id)), b: () => restyle({bold: !bold}, 'text')};
      if (act[key]) {
        e.preventDefault();
        act[key]();
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
      e.preventDefault();
      remove();
      return;
    }
    // リボンのボタンにいるときの Enter・空白・Tab は、ボタンの操作のまま
    if (onButton && (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab')) return;
    if (e.key === 'Tab' && marks.length) {
      e.preventDefault();
      const i = marks.findIndex((m) => m.id === sel[sel.length - 1]);
      const n = i < 0 ? (e.shiftKey ? marks.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + marks.length) % marks.length;
      setSel([marks[n].id]);
      return;
    }
    if ((e.key === 'Enter' || e.key === 'F2') && single && hasText(single.kind)) {
      e.preventDefault();
      startEdit(single.id);
      return;
    }
    const arrows: Record<string, Pt> = {ArrowLeft: {x: -1, y: 0}, ArrowRight: {x: 1, y: 0}, ArrowUp: {x: 0, y: -1}, ArrowDown: {x: 0, y: 1}};
    const d = arrows[e.key];
    if (d && sel.length) {
      e.preventDefault();
      if (e.altKey && (d.x || !e.shiftKey)) {
        // Alt＋←→：15°ずつ回す（四角形など）
        if (!d.x) return;
        commit(
          marks.map((m) => {
            if (!sel.includes(m.id) || m.kind === 'line') return m;
            const b = shapeBox(m, V);
            const n = withBox(m, W, H, {...b, rot: b.rot + 15 * d.x});
            return inside(n, W, H) ? n : m;
          }),
        );
      } else if (e.shiftKey) {
        // Shift＋矢印：大きさ（直線は終点）を 1画素ずつ
        commit(
          marks.map((m) => {
            if (!sel.includes(m.id)) return m;
            if (m.kind === 'line') {
              const en = lineEnds(m, V);
              const n = withLine(m, W, H, {x: en.x1, y: en.y1}, {x: en.x2 + d.x, y: en.y2 + d.y});
              return inside(n, W, H) ? n : m;
            }
            const b = shapeBox(m, V);
            const n = withBox(m, W, H, {...b, w: Math.max(MIN, b.w + d.x), h: Math.max(MIN, b.h + d.y)});
            return inside(n, W, H) ? n : m;
          }),
        );
      } else {
        const step = ctrl ? 0.5 : 1;
        const moving = marks.filter((m) => sel.includes(m.id));
        const movedList = moveBy(moving, W, H, d.x * step, d.y * step);
        commit(marks.map((m) => movedList.find((x) => x.id === m.id) ?? m));
      }
      return;
    }
    // 図形を選んで、そのまま文字を打つと、その図形の文字に（打つ所に入る＝armed のとき。日本語の入力もそのまま）
    if (!armed && single && hasText(single.kind) && e.key.length === 1 && !e.altKey) {
      startEdit(single.id);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, []);

  // ---------------------------------------------------------------- マウス・指
  const toPaper = (e: {clientX: number; clientY: number}): Pt => {
    const r = stageRef.current?.getBoundingClientRect();
    return r && k ? {x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k} : {x: 0, y: 0};
  };
  const tolOf = (e: {pointerType?: string}) => (e.pointerType === 'touch' || e.pointerType === 'pen' ? 14 : 6) / (k || 1);
  const handleTol = (e: {pointerType?: string}) => (e.pointerType === 'touch' || e.pointerType === 'pen' ? 22 : 9) / (k || 1);
  const rotGap = 26 / (k || 1);

  const newMark = (t: Tool, a: Pt, b: Pt): PhotoMark => {
    const kind: PhotoMark['kind'] = t === 'line' || t === 'arrow' || t === 'arrow2' ? 'line' : t === 'num' ? 'text' : t === 'poly' ? 'pen' : t;
    const st = styles[toolStyleKey(t)];
    const base: PhotoMark = {
      id: markId(),
      kind,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      line: st.line,
      width: st.width,
      dash: st.dash,
      fill: kind === 'line' || kind === 'pen' ? '' : st.fill,
      size: st.size,
      color: st.color,
      ...(st.bold ? {bold: true} : {}),
      ...(hasText(kind) && st.font ? {font: st.font} : {}),
      ...(t === 'arrow' || t === 'arrow2' ? {end: true} : {}),
      ...(t === 'arrow2' ? {start: true} : {}),
      ...(kind === 'board' ? {pts: BOARD_PTS} : {}),
    };
    // 線は線の色が「なし」だと見えないので、なしのときは最初の色
    if (kind === 'line' && !base.line) base.line = SHAPE_STYLE.line;
    return kind === 'line' ? withLine(base, W, H, a, b) : withBox(base, W, H, {x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), rot: 0});
  };
  /** 描いている図形の形（Shift で 15°・正方形、Ctrl でまん中から） */
  const shapeFrom = (t: Tool, p0: Pt, raw: Pt, shift: boolean, ctrl: boolean): [Pt, Pt] => {
    let p = {x: clamp(raw.x, 0, W), y: clamp(raw.y, 0, H)};
    const isLine = t === 'line' || t === 'arrow' || t === 'arrow2';
    if (isLine) {
      if (shift) p = snap15(p0, p);
      let [dx, dy] = [p.x - p0.x, p.y - p0.y];
      if (ctrl) {
        // まん中から：両側が写真に収まるまで縮める
        const s = Math.min(1, ...[p0.x + dx, p0.x - dx].map((x) => (x < 0 ? p0.x / Math.abs(dx || 1) : x > W ? (W - p0.x) / Math.abs(dx || 1) : 1)), ...[p0.y + dy, p0.y - dy].map((y) => (y < 0 ? p0.y / Math.abs(dy || 1) : y > H ? (H - p0.y) / Math.abs(dy || 1) : 1)));
        [dx, dy] = [dx * s, dy * s];
        return [{x: p0.x - dx, y: p0.y - dy}, {x: p0.x + dx, y: p0.y + dy}];
      }
      const s = Math.min(1, ...(p.x < 0 || p.x > W || p.y < 0 || p.y > H ? [0.999] : [1]));
      return [p0, {x: clamp(p0.x + dx * s, 0, W), y: clamp(p0.y + dy * s, 0, H)}];
    }
    let [dx, dy] = [p.x - p0.x, p.y - p0.y];
    if (shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      [dx, dy] = [Math.sign(dx || 1) * m, Math.sign(dy || 1) * m];
    }
    if (ctrl) {
      const [mx, my] = [Math.min(Math.abs(dx), p0.x, W - p0.x), Math.min(Math.abs(dy), p0.y, H - p0.y)];
      const [ax, ay] = shift ? [Math.min(mx, my), Math.min(mx, my)] : [mx, my];
      return [{x: p0.x - ax, y: p0.y - ay}, {x: p0.x + ax, y: p0.y + ay}];
    }
    // 写真の外に出る分は縮める（Shift の正方形は正方形のまま）
    const fx = dx < 0 ? Math.min(1, p0.x / -dx) : dx > 0 ? Math.min(1, (W - p0.x) / dx) : 1;
    const fy = dy < 0 ? Math.min(1, p0.y / -dy) : dy > 0 ? Math.min(1, (H - p0.y) / dy) : 1;
    const [sx, sy] = shift ? [Math.min(fx, fy), Math.min(fx, fy)] : [fx, fy];
    return [p0, {x: p0.x + dx * sx, y: p0.y + dy * sy}];
  };

  const clampP = (p: Pt): Pt => ({x: clamp(p.x, 0, W), y: clamp(p.y, 0, H)});
  /**
   * 線の端に吸い付く（画面で 10画素まで）：直線・矢印・折れ線・手書きの線の端につなげて描ける（L字・続けて描く線。
   * ユーザーの指示「L字に曲げることができない」「連続で線を引くことができない」2026-10-29）。吸い付かなければ p のまま
   */
  const snapEnd = (p: Pt, except?: string): Pt => {
    let [best, bd] = [p, 10 / (k || 1)];
    for (const m of latest.current.marks) {
      if (m.id === except) continue;
      let ends: Pt[] = [];
      if (m.kind === 'line') {
        const e = lineEnds(m, V);
        ends = [
          {x: e.x1, y: e.y1},
          {x: e.x2, y: e.y2},
        ];
      } else if (m.kind === 'pen') {
        const b = shapeBox(m, V);
        const pts = markPts(m, V);
        ends = [pts[0], pts[pts.length - 1]].filter(Boolean).map((q) => rotP(q, center(b), b.rot));
      }
      for (const q of ends) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) [best, bd] = [q, d];
      }
    }
    return best;
  };
  /** 線の向き：Shift で 15°ずつ。押さなくても、横・縦から 4°までは横・縦にそろえる（まっすぐな L字を指でも描けるように） */
  const aim = (p0: Pt, p: Pt, shift: boolean): Pt => {
    if (shift) return clampP(snap15(p0, p));
    const [dx, dy] = [p.x - p0.x, p.y - p0.y];
    const len = Math.hypot(dx, dy);
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    const near = Math.round(a / 90) * 90;
    if (Math.abs(a - near) > 4 || len * k < 12) return p;
    const r = (near * Math.PI) / 180;
    return clampP({x: p0.x + len * Math.cos(r), y: p0.y + len * Math.sin(r)});
  };
  /** 線の終わりの点：ほかの線の端に吸い付く。吸い付かなければ向きをそろえる */
  const endOf = (p0: Pt, p: Pt, shift: boolean, except?: string): Pt => {
    const s = snapEnd(p, except);
    return s !== p ? s : aim(p0, p, shift);
  };
  /** 手書きの線・折れ線の点（紙の画素）から図形を作る：点を囲む四角（細い線でも MIN の幅）と、その中の割合の点。点が1つなら null */
  const penMark = (raw: Pt[], id: string): PhotoMark | null => {
    const pts = simplifyStroke(
      raw.filter((q, i) => i === 0 || Math.hypot(q.x - raw[i - 1].x, q.y - raw[i - 1].y) > 0.01),
      0.6 / (k || 1),
    );
    if (pts.length < 2) return null;
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (x1 - x0 < MIN) [x0, x1] = [Math.max(0, (x0 + x1) / 2 - MIN / 2), Math.min(W, (x0 + x1) / 2 + MIN / 2)];
    if (y1 - y0 < MIN) [y0, y1] = [Math.max(0, (y0 + y1) / 2 - MIN / 2), Math.min(H, (y0 + y1) / 2 + MIN / 2)];
    const st = styles.pen;
    return {
      id,
      kind: 'pen',
      x1: r5(x0 / W),
      y1: r5(y0 / H),
      x2: r5(x1 / W),
      y2: r5(y1 / H),
      line: st.line || PEN_STYLE.line,
      width: st.width,
      dash: st.dash,
      fill: '',
      size: st.size,
      color: st.color,
      pts: pts.map((q) => [r5((q.x - x0) / (x1 - x0 || 1)), r5((q.y - y0) / (y1 - y0 || 1))] as [number, number]),
    };
  };
  /** 手書きの線を長押しでまっすぐにした直線（ペンの色・太さのまま） */
  const straightLine = (id: string, a: Pt, b: Pt): PhotoMark => ({...newMark('line', a, b), id, line: styles.pen.line || PEN_STYLE.line, width: styles.pen.width, dash: styles.pen.dash});
  // 長押し：描いている手書きの線を止めて LONG_PRESS たつと、始めの点から今の点までの直線にする（そのあとは終わりの点を動かせる）
  const stopPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const armPress = (at: Pt) => {
    stopPress();
    press.current = {
      at,
      timer: window.setTimeout(() => {
        const d = drag.current;
        if (!d || d.type !== 'pen' || d.straight || d.pts.length < 2) return;
        const [a, b] = [d.pts[0], d.pts[d.pts.length - 1]];
        if (Math.hypot(b.x - a.x, b.y - a.y) * k < 16) return; // 短すぎる線はまっすぐにしない
        d.straight = true;
        d.pts = [a, aim(a, b, false)];
        setDraft([...latest.current.marks, straightLine(d.id, a, d.pts[1])]);
      }, LONG_PRESS),
    };
  };
  useEffect(() => stopPress, []);
  // 折れ線（押すたびに角の点。最後の点をもう一度押す・ダブルクリック・Enter・Esc で終わる）
  const [polyOn, setPolyOn] = useState(false);
  const showPoly = (hover?: Pt) => {
    const cur = poly.current;
    if (!cur) return;
    const m = penMark(hover ? [...cur.pts, hover] : cur.pts, cur.id);
    setDraft(m ? [...latest.current.marks, m] : null);
  };
  const finishPoly = () => {
    const cur = poly.current;
    poly.current = null;
    setPolyOn(false);
    setDraft(null);
    const m = cur ? penMark(cur.pts, cur.id) : null;
    if (m) {
      commit([...latest.current.marks, m]);
      setSel([m.id]);
    }
  };
  const addPolyPoint = (raw: Pt, shift: boolean) => {
    const cur = poly.current;
    if (!cur) {
      poly.current = {id: markId(), pts: [snapEnd(raw)]};
      setPolyOn(true);
      setSel([]);
      return;
    }
    const last = cur.pts[cur.pts.length - 1];
    const q = endOf(last, raw, shift);
    if (Math.hypot(q.x - last.x, q.y - last.y) * k < 8) {
      finishPoly();
      return;
    }
    cur.pts.push(q);
    showPoly();
  };
  /** 番号（①②…）を押した所に置く：次の番号の文字だけのテキストボックス（道具はそのまま。続けて押すと次の番号） */
  const placeNumber = (p: Pt) => {
    const st = styles.num;
    const text = nextNumberText(marks);
    const em = st.size * PT_PX;
    const w = Math.min(W, em * (text.length > 1 ? 0.6 * text.length + 0.4 : 1.15) + 2 * MARK_INSET.x);
    const h = Math.min(H, em * MARK_LINE_K + 2 * MARK_INSET.y);
    const base: PhotoMark = {id: markId(), kind: 'text', x1: 0, y1: 0, x2: 0, y2: 0, line: st.line, width: st.width, dash: st.dash, fill: st.fill, size: st.size, color: st.color, text, ...(st.bold ? {bold: true} : {}), ...(st.font ? {font: st.font} : {})};
    const m = fitText(withBox(base, W, H, {x: clamp(p.x - w / 2, 0, W - w), y: clamp(p.y - h / 2, 0, H - h), w, h, rot: 0}));
    commit([...marks, m]);
    setSel([m.id]);
  };
  /** 直線の ↻ のつまみ（直線のまん中から、線と直角に上へ） */
  const lineRotHandle = (m: PhotoMark): {c: Pt; p: Pt} | null => {
    const e = lineEnds(m, V);
    const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
    if (len * k < 30) return null; // 短い線はつまみが端のつまみに重なるので出さない
    let [nx, ny] = [-(e.y2 - e.y1) / len, (e.x2 - e.x1) / len];
    if (ny > 0) [nx, ny] = [-nx, -ny];
    const c = {x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2};
    return {c, p: {x: c.x + nx * rotGap, y: c.y + ny * rotGap}};
  };
  /** 選んでいる図形のつまみを押したか（大きさ・回す・直線の端・直線を回す） */
  const handleDrag = (p: Pt, e: {pointerType?: string}): Drag | null => {
    if (!single) return null;
    const ht = handleTol(e);
    if (single.kind === 'line') {
      const en = lineEnds(single, V);
      const which = Math.hypot(p.x - en.x2, p.y - en.y2) <= ht ? 2 : Math.hypot(p.x - en.x1, p.y - en.y1) <= ht ? 1 : 0;
      if (which) return {type: 'end', id: single.id, which, base: single};
      const r = lineRotHandle(single);
      if (r && Math.hypot(p.x - r.p.x, p.y - r.p.y) <= ht) return {type: 'rotline', id: single.id, base: single, a0: Math.atan2(p.y - r.c.y, p.x - r.c.x), c: r.c};
      return null;
    }
    const b = shapeBox(single, V);
    const h = boxHandles(b, rotGap).find((x) => Math.hypot(p.x - x.p.x, p.y - x.p.y) <= ht);
    if (!h) return null;
    const c = center(b);
    return h.hy === -2 ? {type: 'rotate', id: single.id, base: single, a0: Math.atan2(p.y - c.y, p.x - c.x)} : {type: 'resize', id: single.id, hx: h.hx, hy: h.hy, base: single};
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest('[data-edit-text]') && editing) return; // 打っている文字の中（カーソルを動かす・文字を選ぶ）
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!k) return;
    setMenu(null);
    if (editing) endEdit();
    const p = toPaper(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    // リボンのボタンから写真へ（Enter などがボタンに行かないように）。図形を選んでいれば、離したあとに打つ所へ（arm）
    if (document.activeElement !== editRef.current) e.currentTarget.focus({preventScroll: true});
    if (tool) {
      // 描く道具のあいだは、押すといつも描く（描いたばかりの線の端から続けて描ける＝L字。直すときは「選択」。Excel の「描画モードのロック」と同じ）
      const raw = clampP(p);
      if (tool === 'pen') {
        drag.current = {type: 'pen', id: markId(), pts: [raw], straight: false};
        armPress(raw);
        setSel([]);
        return;
      }
      if (tool === 'poly') {
        addPolyPoint(raw, e.shiftKey);
        return;
      }
      if (tool === 'num') {
        placeNumber(raw);
        return;
      }
      const p0 = tool === 'line' || tool === 'arrow' || tool === 'arrow2' ? snapEnd(raw) : raw;
      const m = newMark(tool, p0, p0);
      drag.current = {type: 'create', tool, p0, id: m.id, ctrl: e.ctrlKey || e.metaKey};
      setDraft([...marks, m]);
      setSel([m.id]);
      return;
    }
    // 選んでいる図形のつまみ
    const hd = handleDrag(p, e);
    if (hd) {
      drag.current = hd;
      return;
    }
    const hit = topHit(marks, p, W, H, tolOf(e));
    if (!hit) {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setSel([]);
      drag.current = null;
      return;
    }
    // 指で2回たたくと文字を打つ（マウスはダブルクリック＝onDoubleClick）
    const now = performance.now();
    const tap = lastTap.current;
    lastTap.current = e.pointerType === 'mouse' ? null : {id: hit.id, t: now, x: e.clientX, y: e.clientY};
    if (e.pointerType !== 'mouse' && tap && tap.id === hit.id && now - tap.t < 400 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 && hasText(hit.kind)) {
      proxyRef.current?.focus({preventScroll: true}); // iPad：押したその場でキーボードを出す（あとで打つ所に移す）
      lastTap.current = null;
      drag.current = null;
      startEdit(hit.id);
      return;
    }
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    const inSel = sel.includes(hit.id);
    const ids = inSel ? sel : add ? [...sel, hit.id] : [hit.id];
    if (!inSel) setSel(ids);
    drag.current = {type: 'move', p0: p, base: marks.filter((m) => ids.includes(m.id)), ids, moved: false, copy: e.ctrlKey || e.metaKey, toggle: add && inSel ? hit.id : null};
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    // 折れ線の途中：次の角までの線を、マウスの所まで見せる
    if (!d && poly.current && k) {
      const cur = poly.current;
      showPoly(endOf(cur.pts[cur.pts.length - 1], clampP(toPaper(e)), e.shiftKey));
      return;
    }
    if (!d) return;
    const p = toPaper(e);
    if (d.type === 'pen') {
      const q = clampP(p);
      if (d.straight) {
        d.pts = [d.pts[0], endOf(d.pts[0], q, e.shiftKey)];
        setDraft([...marks, straightLine(d.id, d.pts[0], d.pts[1])]);
        return;
      }
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(q.x - last.x, q.y - last.y) * k < 1) return;
      d.pts.push(q);
      // 止めている間（画面で 3画素より動かない）は長押しの時計を進める。動いたら測り直す
      const at = press.current?.at;
      if (!at || Math.hypot(q.x - at.x, q.y - at.y) * k > 3) armPress(q);
      const m = penMark(d.pts, d.id);
      setDraft(m ? [...marks, m] : null);
      return;
    }
    if (d.type === 'rotline') {
      const en = lineEnds(d.base, V);
      let deg = ((Math.atan2(p.y - d.c.y, p.x - d.c.x) - d.a0) * 180) / Math.PI;
      const cur = (Math.atan2(en.y2 - en.y1, en.x2 - en.x1) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round((cur + deg) / 15) * 15 - cur;
      else {
        const near = Math.round((cur + deg) / 90) * 90;
        if (Math.abs(cur + deg - near) <= 3) deg = near - cur;
      }
      const n = withLine(d.base, W, H, rotP({x: en.x1, y: en.y1}, d.c, deg), rotP({x: en.x2, y: en.y2}, d.c, deg));
      if (inside(n, W, H)) setDraft(marks.map((m) => (m.id === d.id ? n : m)));
      return;
    }
    if (d.type === 'create') {
      let [a, b] = shapeFrom(d.tool, d.p0, p, e.shiftKey, d.ctrl || e.ctrlKey || e.metaKey);
      // 直線・矢印：ほかの線の端に吸い付く・横と縦にそろえる（Ctrl のまん中からは、そのまま）
      if ((d.tool === 'line' || d.tool === 'arrow' || d.tool === 'arrow2') && !(d.ctrl || e.ctrlKey || e.metaKey)) b = endOf(a, b, e.shiftKey);
      const m = byId(d.id, draft ?? []) ?? newMark(d.tool, a, b);
      setDraft([...marks, m.kind === 'line' ? withLine(m, W, H, a, b) : withBox(m, W, H, {x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), rot: 0})]);
      return;
    }
    if (d.type === 'move') {
      let [dx, dy] = [p.x - d.p0.x, p.y - d.p0.y];
      if (!d.moved && Math.hypot(dx * k, dy * k) < 4) return;
      d.moved = true;
      if (e.shiftKey) [dx, dy] = Math.abs(dx) >= Math.abs(dy) ? [dx, 0] : [0, dy];
      const movedList = moveBy(d.base, W, H, dx, dy);
      if (d.copy) {
        // Ctrl を押したまま動かす：複製（もとはそのまま）
        const copies = movedList.map((m) => ({...m, id: `copy-${m.id}`}));
        setDraft([...marks, ...copies]);
      } else setDraft(marks.map((m) => movedList.find((x) => x.id === m.id) ?? m));
      return;
    }
    if (d.type === 'end') {
      const en = lineEnds(d.base, V);
      const fixed = d.which === 1 ? {x: en.x2, y: en.y2} : {x: en.x1, y: en.y1};
      let q = {x: clamp(p.x, 0, W), y: clamp(p.y, 0, H)};
      if (e.shiftKey) {
        q = snap15(fixed, q);
        q = {x: clamp(q.x, 0, W), y: clamp(q.y, 0, H)};
      }
      const n = d.which === 1 ? withLine(d.base, W, H, q, fixed) : withLine(d.base, W, H, fixed, q);
      setDraft(marks.map((m) => (m.id === d.id ? n : m)));
      return;
    }
    const b = shapeBox(d.base, V);
    let n: PhotoMark;
    if (d.type === 'rotate') {
      const c = center(b);
      let rot = b.rot + ((Math.atan2(p.y - c.y, p.x - c.x) - d.a0) * 180) / Math.PI;
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      else {
        const q = Math.round(rot / 90) * 90;
        if (Math.abs(rot - q) <= 3) rot = q;
      }
      n = withBox(d.base, W, H, {...b, rot});
    } else {
      // テキストボックスの角：斜めに引くと、縦横の比のまま文字も一緒に大きく・小さく（ユーザーの指示「斜めにも縮小、拡大できるようにする」2026-10-29。
      // テキストボックスの高さは文字に合わせるので、比のままにしないと幅しか変わらなかった）
      const scaleText = d.base.kind === 'text' && d.hx !== 0 && d.hy !== 0;
      n = withBox(d.base, W, H, resizeBox(b, d.hx, d.hy, {x: clamp(p.x, 0, W), y: clamp(p.y, 0, H)}, e.shiftKey || scaleText, e.ctrlKey || e.metaKey));
      if (scaleText) n = {...n, size: clamp(Math.round(((d.base.size * shapeBox(n, V).w) / (b.w || 1)) * 2) / 2, 1, 400)};
      if (n.kind === 'text') n = fitText(n);
    }
    if (inside(n, W, H)) setDraft(marks.map((m) => (m.id === d.id ? n : m)));
  };

  /** 描く道具のまま押しただけ：押した所の図形を選ぶ（なければ選ぶのをやめる）。指で2回たたくと文字を打つ */
  const tapSelect = (p: Pt, e: {pointerType?: string; clientX: number; clientY: number}) => {
    const hit = topHit(marks, p, W, H, tolOf(e));
    setSel(hit ? [hit.id] : []);
    const now = performance.now();
    const tap = lastTap.current;
    lastTap.current = hit && e.pointerType !== 'mouse' ? {id: hit.id, t: now, x: e.clientX, y: e.clientY} : null;
    if (hit && tap && tap.id === hit.id && now - tap.t < 400 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 && hasText(hit.kind)) {
      lastTap.current = null;
      startEdit(hit.id);
    }
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    requestAnimationFrame(arm);
    if (!d) return;
    const next = draft;
    setDraft(null);
    if (d.type === 'pen') {
      stopPress();
      if (d.straight) {
        const [a, b] = d.pts;
        if (Math.hypot(b.x - a.x, b.y - a.y) * k >= 4) {
          const m = straightLine(d.id, a, b);
          commit([...marks, m]);
          setSel([m.id]);
        }
        return;
      }
      // ぐしゃぐしゃに描いた：その線が上を通った線・図形を消す（iPhone のメモと同じ。上を通った図形がなければ、ふつうの線）
      if (isScribble(d.pts)) {
        const tol = 5 / k;
        // 描いた点のあいだも見る（速く描くと点がまばらで、線をまたいでも点が線の上に来ない）
        const dense = d.pts.flatMap((q, i) => {
          const o = d.pts[i - 1];
          if (!o) return [q];
          const n = Math.max(1, Math.ceil((Math.hypot(q.x - o.x, q.y - o.y) * k) / 3));
          return Array.from({length: n}, (_, j) => ({x: o.x + ((q.x - o.x) * (j + 1)) / n, y: o.y + ((q.y - o.y) * (j + 1)) / n}));
        });
        const ids = new Set(marks.filter((m) => dense.some((q) => hitMark(m, q, W, H, tol) === 2)).map((m) => m.id));
        if (ids.size) {
          commit(marks.filter((m) => !ids.has(m.id)));
          setSel([]);
          return;
        }
      }
      const m = penMark(d.pts, d.id);
      const b = m ? markBounds(m, V) : null;
      if (m && b && Math.max(b.w, b.h) * k >= 3) {
        commit([...marks, m]);
        setSel([m.id]);
      } else tapSelect(d.pts[0], e);
      return;
    }
    if (d.type === 'create') {
      let m = next ? byId(d.id, next) : undefined;
      if (!m) return;
      const b = markBounds(m, V);
      // 続けて描く道具で押しただけ：何も置かない（押した所の図形を選ぶ。色・太さを直せる）
      if (Math.max(b.w, b.h) * k < 4 && KEEP_TOOL.has(d.tool)) {
        tapSelect(d.p0, e);
        return;
      }
      // 押しただけ（ほとんど動かしていない）：Excel と同じく決まった大きさで置く
      if (Math.max(b.w, b.h) * k < 4) {
        const p0 = d.p0;
        if (m.kind === 'line') {
          const len = Math.min(W * 0.3, cmToPx(2.54));
          const x2 = Math.min(W, p0.x + len);
          m = withLine(m, W, H, {x: Math.max(0, x2 - len), y: p0.y}, {x: x2, y: p0.y});
        } else {
          const [w, h] = m.kind === 'text' ? [Math.min(W, Math.max(cmToPx(3), W * 0.35)), Math.min(H, m.size * PT_PX * MARK_LINE_K + 2 * MARK_INSET.y)] : [Math.min(W, H, cmToPx(2.54)), Math.min(W, H, cmToPx(2.54))];
          m = withBox(m, W, H, {x: clamp(p0.x, 0, W - w), y: clamp(p0.y, 0, H - h), w, h, rot: 0});
        }
      }
      if (m.kind === 'text') m = fitText(m);
      commit([...marks, m]);
      setSel([m.id]);
      if (!KEEP_TOOL.has(d.tool)) setTool(null);
      if (m.kind === 'text') {
        proxyRef.current?.focus({preventScroll: true}); // iPad：押したその場でキーボードを出す
        editStart.current = [...marks, m];
        setEditing(m.id);
      }
      return;
    }
    if (d.type === 'move') {
      if (!d.moved) {
        if (d.toggle) setSel((s) => s.filter((id) => id !== d.toggle));
        else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
          const hit = topHit(marks, toPaper(e), W, H, tolOf(e));
          if (hit) setSel([hit.id]);
        }
        return;
      }
      if (!next) return;
      if (d.copy) {
        const copies = next.filter((m) => m.id.startsWith('copy-')).map((m) => ({...m, id: markId()}));
        commit([...marks, ...copies]);
        setSel(copies.map((m) => m.id));
      } else commit(next);
      return;
    }
    if (next && JSON.stringify(next) !== JSON.stringify(marks)) commit(next);
  };

  const context = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!k) return;
    const hit = topHit(marks, toPaper(e), W, H, 6 / k);
    if (hit && !sel.includes(hit.id)) setSel([hit.id]);
    if (!hit) setSel([]);
    setMenu({name: 'context', x: e.clientX, y: e.clientY, on: !!hit});
  };

  // ---------------------------------------------------------------- リボンの値
  const first = selected[0];
  const toolStyle = styles[tool ? toolStyleKey(tool) : 'shape'];
  const fontStyle = styles[tool === 'num' ? 'num' : 'text'];
  const lineStyle = first ?? {...toolStyle};
  const fillValue = first ? first.fill : toolStyle.fill;
  const lineValue = first ? first.line : toolStyle.line;
  const widthValue = first ? first.width : toolStyle.width;
  const dashValue: PhotoMarkDash = first ? first.dash : toolStyle.dash;
  const fontFirst = selected.find((m) => hasText(m.kind));
  const fontSize = fontFirst ? fontFirst.size : fontStyle.size;
  const fontColor = fontFirst ? fontFirst.color : fontStyle.color;
  const bold = fontFirst ? !!fontFirst.bold : !!fontStyle.bold;
  // フォントのない書き込み（前の版）は、前の版の見た目（游ゴシックに近い）
  const fontName = fontFirst ? (fontFirst.font ?? '游ゴシック') : (fontStyle.font ?? MARK_FONT_DEFAULT);
  const sizeOf = (m: PhotoMark | undefined) => {
    if (!m) return null;
    if (m.kind === 'line') {
      const b = markBounds(m, V);
      return {w: b.w, h: b.h};
    }
    const b = shapeBox(m, V);
    return {w: b.w, h: b.h};
  };
  const dims = sizeOf(first);
  const growFont = (dir: 1 | -1) => {
    const i = dir > 0 ? FONT_SIZES.findIndex((s) => s > fontSize) : FONT_SIZES.length - 1 - [...FONT_SIZES].reverse().findIndex((s) => s < fontSize);
    const v = FONT_SIZES[i];
    if (v && i >= 0 && i < FONT_SIZES.length) restyle({size: v}, 'text');
  };
  const openMenu = (name: Exclude<Menu['name'], 'context'>, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setSub(null);
    setMenu((cur) => (cur?.name === name ? null : {name, x: r.left, y: r.bottom + 2}));
  };
  const arrowsOf = (m: Pick<PhotoMark, 'start' | 'end'>) => (m.start && m.end ? 'both' : m.end ? 'end' : m.start ? 'start' : 'none');
  const setArrows = (v: 'none' | 'end' | 'start' | 'both') => {
    const next = marks.map((m) => (sel.includes(m.id) && m.kind === 'line' ? (({start: _s, end: _e, ...rest}) => ({...rest, ...(v === 'start' || v === 'both' ? {start: true} : {}), ...(v === 'end' || v === 'both' ? {end: true} : {})}))(m) : m));
    commit(next);
  };
  const lineSel = selected.some((m) => m.kind === 'line');
  /** 色のメニューで選んだ：選んだ図形とこれから描く図形に。ボタンの下の色もその色に（なしは除く） */
  const pickColor = (what: 'fill' | 'line' | 'color', c: string) => {
    restyle({[what]: c}, what === 'color' ? 'text' : 'shape');
    if (c) setRecent((r) => ({...r, [what]: c}));
    setMenu(null);
  };

  // メニュー（ドロップダウン・右クリック）
  const menuBox = (children: ReactNode, label: string, wide = false) => {
    if (!menu) return null;
    const x = Math.max(4, Math.min(menu.x, window.innerWidth - (wide ? 260 : 200) - 4));
    return (
      <>
        <div className="fixed inset-0 z-[61]" onPointerDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()} />
        <div role="menu" aria-label={label} className="fixed z-[62] max-h-[calc(100vh-16px)] overflow-y-auto rounded-md border border-slate-300 bg-white p-1.5 shadow-xl" style={{left: x, top: Math.min(menu.y, window.innerHeight - 80)}}>
          {children}
        </div>
      </>
    );
  };
  const item = (label: string, onClick: () => void, opts: {disabled?: boolean; checked?: boolean; keys?: string; icon?: ReactNode; sample?: ReactNode; style?: CSSProperties} = {}) => (
    <button
      key={label}
      type="button"
      role={opts.checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={opts.checked}
      disabled={opts.disabled}
      onClick={() => {
        onClick();
        setMenu(null);
      }}
      className={`flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 disabled:opacity-40 ${opts.checked ? 'bg-slate-100' : ''}`}
    >
      <span className="flex w-6 justify-center">{opts.icon ?? (opts.checked ? '✓' : '')}</span>
      <span className="flex-1" style={opts.style}>
        {label}
      </span>
      {opts.sample}
      {opts.keys && <span className="pl-4 text-[11px] text-slate-400">{opts.keys}</span>}
    </button>
  );
  const subItem = (key: 'width' | 'dash' | 'arrow', label: string) => (
    <button
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={sub === key}
      onClick={() => setSub(key)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setSub(key)}
      disabled={key === 'arrow' && !lineSel}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 disabled:opacity-40 ${sub === key ? 'bg-slate-100' : ''}`}
    >
      <span className="w-6" />
      <span className="flex-1">{label}</span>
      <span className="text-slate-400">▸</span>
    </button>
  );
  const lineSample = (w: number, dash: PhotoMarkDash, arrows?: 'none' | 'end' | 'start' | 'both') => {
    const sw = Math.max(0.6, w * PT_PX);
    const pat = DASHES.find((d) => d.key === dash)?.pattern ?? [];
    const head = (x: number, dir: 1 | -1) => <polygon points={`${x},8 ${x - dir * 7},4.5 ${x - dir * 7},11.5`} fill="currentColor" />;
    return (
      <svg width="90" height="16" aria-hidden>
        <line x1={arrows === 'start' || arrows === 'both' ? 9 : 2} y1="8" x2={arrows === 'end' || arrows === 'both' ? 81 : 88} y2="8" stroke="currentColor" strokeWidth={sw} strokeDasharray={pat.length ? pat.map((p) => p * sw).join(' ') : undefined} />
        {(arrows === 'end' || arrows === 'both') && head(88, 1)}
        {(arrows === 'start' || arrows === 'both') && head(2, -1)}
      </svg>
    );
  };

  const fontSizeInput = (
    <div className="flex h-11 items-center">
      <input
        aria-label="フォント サイズ"
        title="フォント サイズ"
        value={fontText ?? String(fontSize)}
        inputMode="decimal"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setFontText(e.target.value)}
        onBlur={() => {
          const v = Number((fontText ?? '').normalize('NFKC'));
          if (fontText !== null && v >= 1 && v <= 400) restyle({size: Math.round(v * 2) / 2}, 'text');
          setFontText(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-9 w-14 rounded-l border border-slate-300 px-2 text-[15px]"
      />
      <button type="button" aria-label="フォント サイズの一覧" title="フォント サイズ" onClick={(e) => openMenu('size', e.currentTarget)} className="h-9 rounded-r border border-l-0 border-slate-300 px-1.5 text-[12px] text-slate-600 hover:bg-slate-100">
        ▼
      </button>
    </div>
  );
  const sizeInput = (dim: 'h' | 'w', label: string) => {
    const v = dims ? pxToCm(dims[dim]) : null;
    const text = sizeText[dim] ?? (v === null ? '' : v.toFixed(2));
    const apply = (cm: number) => {
      setSizeText((s) => ({...s, [dim]: undefined}));
      resizeTo(dim, Math.max(0, Math.round(cm * 100) / 100));
    };
    return (
      <label className="flex h-11 items-center gap-1 text-[14px] text-slate-600">
        <span className="w-8 text-right">{label}</span>
        <input
          aria-label={label}
          title={`図形の${label}（cm）`}
          disabled={!dims}
          value={text}
          inputMode="decimal"
          onFocus={(e) => e.target.select()}
          onChange={(e) => setSizeText((s) => ({...s, [dim]: e.target.value}))}
          onBlur={() => {
            const t = sizeText[dim];
            if (t !== undefined) {
              const cm = Number(t.normalize('NFKC').replace(/cm$/i, '').trim());
              if (Number.isFinite(cm)) apply(cm);
              else setSizeText((s) => ({...s, [dim]: undefined}));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && v !== null) {
              e.preventDefault();
              e.stopPropagation();
              apply(v + (e.key === 'ArrowUp' ? 0.1 : -0.1));
            }
          }}
          className="h-9 w-[4.5rem] rounded border border-slate-300 px-2 text-right text-[15px] disabled:bg-slate-50"
        />
        <span>cm</span>
        <span className="flex flex-col">
          <button type="button" aria-label={`${label}を大きく`} disabled={v === null} onClick={() => v !== null && apply(v + 0.1)} className="h-[18px] px-1.5 text-[10px] leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            ▲
          </button>
          <button type="button" aria-label={`${label}を小さく`} disabled={v === null} onClick={() => v !== null && apply(Math.max(0, v - 0.1))} className="h-[18px] px-1.5 text-[10px] leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            ▼
          </button>
        </span>
      </label>
    );
  };
  // labelCls：名前を隠す画面の幅（狭い画面は絵だけ。前面へ・背面へは 1536px より狭いと絵だけ＝リボンを 1366px の画面に収める）
  const split = (name: Exclude<Menu['name'], 'context'>, label: string, icon: ReactNode, apply: () => void, disabled = false, labelCls = 'max-sm:hidden') => (
    <div className="flex h-11 shrink-0 items-stretch rounded hover:ring-1 hover:ring-slate-200">
      <button type="button" className={`${RB} rounded-r-none pr-1`} title={label} aria-label={label} onClick={apply} disabled={disabled}>
        {icon}
        <span className={labelCls}>{label}</span>
      </button>
      <button type="button" className="rounded-r px-1.5 text-[12px] text-slate-600 hover:bg-slate-100 disabled:opacity-35" aria-label={`${label}の一覧`} title={label} aria-haspopup="menu" aria-expanded={menu?.name === name} disabled={disabled} onClick={(e) => openMenu(name, e.currentTarget)}>
        ▼
      </button>
    </div>
  );

  // ---------------------------------------------------------------- 写真と図形
  const pb = rotatedBounds({x: 0, y: 0, w: Math.max(photo.w, 1), h: Math.max(photo.h, 1)}, photo.rot);
  const ps = W / (pb.w || 1); // 写真の画素 → 紙の画素
  const [iw, ih] = [Math.max(photo.w, 1) * ps, Math.max(photo.h, 1) * ps];
  const editMark = editing ? byId(editing) : single && hasText(single.kind) && !draft ? single : null;
  const editBox = editMark ? shapeBox(editMark, V) : null;
  const strokeSel = '#64748b';

  const selectionSvg = (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={W * k} height={H * k} aria-hidden>
      {shown
        .filter((m) => sel.includes(m.id))
        .map((m) => {
          if (m.kind === 'line') {
            const e = lineEnds(m, V);
            const r = selected.length === 1 && !draft && !tool ? lineRotHandle(m) : null;
            return (
              <g key={m.id} data-sel={m.id}>
                {[
                  [e.x1, e.y1],
                  [e.x2, e.y2],
                ].map(([x, y], i) => (
                  <circle key={i} cx={x * k} cy={y * k} r={tool ? 3 : 5.5} fill={tool ? strokeSel : 'white'} stroke={strokeSel} strokeWidth={1.2} />
                ))}
                {r && (
                  // 直線を回すつまみ（まん中のまわりに回す。Shift で 15°ずつ）
                  <g data-line-rot transform={`translate(${r.p.x * k} ${r.p.y * k})`}>
                    <line x1={0} y1={0} x2={(r.c.x - r.p.x) * k} y2={(r.c.y - r.p.y) * k} stroke={strokeSel} strokeWidth={1} strokeDasharray="2 2" />
                    <circle r={8} fill="white" stroke={strokeSel} strokeWidth={1.2} />
                    <path d="M3.5 -2.5 A4.2 4.2 0 1 0 4.2 1.5" fill="none" stroke={strokeSel} strokeWidth={1.3} />
                    <path d="M4.5 -5.2 L3.8 -2.2 L1 -3" fill="none" stroke={strokeSel} strokeWidth={1.3} />
                  </g>
                )}
              </g>
            );
          }
          const b = shapeBox(m, V);
          const c = center(b);
          const pts = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([hx, hy]) => rotP({x: c.x + (hx * b.w) / 2, y: c.y + (hy * b.h) / 2}, c, b.rot));
          const hs = selected.length === 1 && !draft && !tool ? boxHandles(b, rotGap) : [];
          return (
            <g key={m.id} data-sel={m.id}>
              <polygon points={pts.map((q) => `${q.x * k},${q.y * k}`).join(' ')} fill="none" stroke={strokeSel} strokeWidth={1} strokeDasharray={editing === m.id ? '4 3' : undefined} />
              {hs.map((h, i) =>
                h.hy === -2 ? (
                  <g key={i} transform={`translate(${h.p.x * k} ${h.p.y * k})`}>
                    <circle r={8} fill="white" stroke={strokeSel} strokeWidth={1.2} />
                    <path d="M3.5 -2.5 A4.2 4.2 0 1 0 4.2 1.5" fill="none" stroke={strokeSel} strokeWidth={1.3} />
                    <path d="M4.5 -5.2 L3.8 -2.2 L1 -3" fill="none" stroke={strokeSel} strokeWidth={1.3} />
                  </g>
                ) : (
                  <circle key={i} cx={h.p.x * k} cy={h.p.y * k} r={5} fill="white" stroke={strokeSel} strokeWidth={1.2} />
                ),
              )}
            </g>
          );
        })}
    </svg>
  );

  const canvasCursor = tool ? 'crosshair' : 'default';
  /** 道具を選ぶ（null＝選択）。折れ線の途中ならそこまでで終える。描く道具は覚えて、次に開いたときもその道具 */
  const pickTool = (t: Tool | null) => {
    if (editing) endEdit();
    if (poly.current) finishPoly();
    setTool(t);
    setSel([]);
    setMenu(null);
    if (t && KEEP_TOOL.has(t))
      try {
        localStorage.setItem(TOOL_KEY, t);
      } catch {
        /* 覚えられなくても、この画面ではそのまま使える */
      }
  };
  /** 写真を 90°回す（書き込みも一緒に。打っている文字・折れ線は入れてから） */
  const rotatePhoto = (dir: 1 | -1) => {
    if (!onRotate) return;
    if (editing) endEdit();
    if (poly.current) finishPoly();
    setMenu(null);
    onRotate(dir);
  };
  /** 閉じる（折れ線の途中ならそこまでの線を入れてから） */
  const close = () => {
    if (poly.current) finishPoly();
    onClose();
  };
  const textCss: CSSProperties | undefined = editMark ? markTextCss(editMark, k) : undefined;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title}の${what}に書き込む`} className="fixed inset-0 z-[60] flex flex-col bg-slate-100 text-slate-800">
      {/* 上の帯：元に戻す・やり直し（Excel のクイック アクセス ツール バー）・題名・閉じる（まん中。ユーザーの指示「閉じるボタンは中央にもってくる」2026-10-29） */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-slate-200 bg-white px-2 py-1">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" className={RB} title="元に戻す (Ctrl+Z)" aria-label="元に戻す" disabled={!past.current.length && !editing} onClick={undo}>
            ↶
          </button>
          <button type="button" className={RB} title="やり直し (Ctrl+Y)" aria-label="やり直し" disabled={!future.current.length} onClick={redo}>
            ↷
          </button>
          <div className="min-w-0 truncate px-2 text-base text-slate-700">✏️ {title}</div>
        </div>
        <button type="button" onClick={close} className="h-11 rounded-md border border-slate-300 bg-white px-8 text-base text-slate-700 hover:bg-slate-50">
          閉じる
        </button>
        <div />
      </div>
      {/* リボン（Excel の「図形の書式」と同じ並び） */}
      <div className="border-b border-slate-200 bg-white">
        <div className="flex justify-center gap-4 px-3 pt-1 text-[15px]">
          <span className="border-b-2 border-emerald-600 px-1 pb-0.5 text-emerald-800">図形の書式</span>
        </div>
        <div role="toolbar" aria-label="図形の書式" className="overflow-x-auto pb-0.5">
          <div className="mx-auto flex w-max items-stretch px-1">
            <Group label="図形の挿入">
              <div className="grid grid-cols-6 gap-0.5">
                {[{key: null, label: '選択（図形を選ぶ・動かす）'} as const, ...TOOLS].map((t) => (
                  <button
                    key={t.key ?? 'select'}
                    type="button"
                    aria-label={t.key ? t.label : '選択'}
                    title={t.label}
                    aria-pressed={tool === t.key}
                    onClick={() => pickTool(t.key)}
                    className={`${RB} px-1 ${tool === t.key ? 'bg-emerald-100 ring-1 ring-emerald-500' : ''}`}
                  >
                    <Icon name={t.key ?? 'select'} />
                  </button>
                ))}
              </div>
            </Group>
            <Group label="図形のスタイル">
              <div className="flex flex-col">
                {split('fill', '図形の塗りつぶし', <Icon name="fill" color={recent.fill ? `#${recent.fill}` : ''} />, () => restyle({fill: recent.fill}, 'shape'), selected.length > 0 && selected.every((m) => m.kind === 'line'))}
                {split('line', '図形の枠線', <Icon name="outline" color={recent.line ? `#${recent.line}` : ''} />, () => restyle({line: recent.line}, 'shape'))}
              </div>
            </Group>
            <Group label="フォント">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="フォント"
                    title="フォント"
                    aria-haspopup="menu"
                    aria-expanded={menu?.name === 'font'}
                    onClick={(e) => openMenu('font', e.currentTarget)}
                    className="flex h-9 w-44 items-center justify-between gap-1 rounded border border-slate-300 px-2 text-left text-[15px] text-slate-700 hover:bg-slate-50"
                  >
                    <span className="truncate" style={{fontFamily: markFontCss(fontName) ?? undefined}}>
                      {fontName}
                    </span>
                    <span className="text-[12px] text-slate-600">▼</span>
                  </button>
                  {fontSizeInput}
                </div>
                <div className="flex items-center gap-0.5">
                  <button type="button" className={RB} title="フォント サイズの拡大" aria-label="フォント サイズの拡大" onClick={() => growFont(1)}>
                    A<sup>▲</sup>
                  </button>
                  <button type="button" className={RB} title="フォント サイズの縮小" aria-label="フォント サイズの縮小" onClick={() => growFont(-1)}>
                    A<sup>▼</sup>
                  </button>
                  <button type="button" className={`${RB} ${bold ? 'bg-slate-200' : ''}`} title="太字 (Ctrl+B)" aria-label="太字" aria-pressed={bold} onClick={() => restyle({bold: !bold}, 'text')}>
                    <b>B</b>
                  </button>
                  {split('color', '文字の色', <Icon name="fontColor" color={`#${recent.color}`} />, () => restyle({color: recent.color}, 'text'))}
                </div>
              </div>
            </Group>
            <Group label="配置">
              <div className="flex flex-col">
                <div className="flex">
                  {split('front', '前面へ移動', <Icon name="front" />, () => order('front'), !sel.length, 'max-2xl:hidden')}
                  {split('back', '背面へ移動', <Icon name="back" />, () => order('back'), !sel.length, 'max-2xl:hidden')}
                </div>
                <div className="flex">
                  <button type="button" className={RB} title="回転" aria-label="回転" disabled={!sel.length} onClick={(e) => openMenu('rotate', e.currentTarget)}>
                    <Icon name="rotate" />
                    <span className="max-sm:hidden">回転</span>
                    <span className="text-[10px]">▼</span>
                  </button>
                  <button type="button" className={RB} title="削除 (Delete)" aria-label="削除" disabled={!sel.length} onClick={remove}>
                    <Icon name="delete" />
                    <span className="max-sm:hidden">削除</span>
                  </button>
                </div>
              </div>
            </Group>
            <Group label="クリップボード">
              <button type="button" className={`${RB} h-[5.5rem] flex-col`} title="貼り付け (Ctrl+V)" aria-label="貼り付け" disabled={!clip.items.length} onClick={paste}>
                <Icon name="paste" />
                <span className="text-[14px]">貼り付け</span>
              </button>
              <div className="flex flex-col">
                <button type="button" className={RB} title="切り取り (Ctrl+X)" aria-label="切り取り" disabled={!sel.length} onClick={cut}>
                  <Icon name="cut" />
                </button>
                <button type="button" className={RB} title="コピー (Ctrl+C)" aria-label="コピー" disabled={!sel.length} onClick={copy}>
                  <Icon name="copy" />
                </button>
              </div>
            </Group>
            <Group label="サイズ">
              <div className="flex flex-col gap-0.5">
                {sizeInput('h', '高さ')}
                {sizeInput('w', '幅')}
              </div>
            </Group>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        {/* 書式の欄：線の色・太さ・線の種類・塗りつぶし・文字の色をいつも見せる（写真の横の空いた所。ユーザーの指示「線の太さや色などは空いたスペースに常時表示する」
            2026-10-29）。選んだ図形があればその図形の、なければ今の道具の書式。狭い画面は写真の上に横に並べる（横に動かせる） */}
        <aside aria-label="書式" className="flex shrink-0 gap-x-5 gap-y-4 overflow-auto border-slate-200 bg-white px-3 py-2 text-slate-700 max-md:border-b md:w-64 md:flex-col md:border-r">
          {onRotate && (
            <PanelSection label="写真の向き">
              <button type="button" onClick={() => rotatePhoto(-1)} aria-label="写真を左に回す" className="flex h-10 shrink-0 touch-manipulation items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[15px] hover:bg-slate-50">
                ↺ 左へ
              </button>
              <button type="button" onClick={() => rotatePhoto(1)} aria-label="写真を右に回す" className="flex h-10 shrink-0 touch-manipulation items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[15px] hover:bg-slate-50">
                ↻ 右へ
              </button>
            </PanelSection>
          )}
          <PanelSection label="線の色">
            {PANEL_COLORS.map(([hex, name]) => (
              <button
                key={hex}
                type="button"
                aria-label={`線の色 ${name}`}
                title={name}
                aria-pressed={lineValue === hex}
                onClick={() => {
                  restyle({line: hex}, 'shape');
                  setRecent((r) => ({...r, line: hex}));
                }}
                className={`h-8 w-8 shrink-0 touch-manipulation rounded border border-slate-300 ${lineValue === hex ? 'outline outline-2 outline-offset-1 outline-emerald-600' : ''}`}
                style={{background: `#${hex}`}}
              />
            ))}
          </PanelSection>
          <PanelSection label="線の太さ">
            {LINE_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`線の太さ ${w} pt`}
                title={`${w} pt`}
                aria-pressed={widthValue === w}
                onClick={() => restyle({width: w}, 'shape')}
                className={`flex h-9 w-[4.6rem] shrink-0 touch-manipulation items-center gap-1 rounded border px-1 text-[12px] ${widthValue === w ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
              >
                <svg width="34" height="14" aria-hidden>
                  <line x1="2" y1="7" x2="32" y2="7" stroke={`#${lineValue && lineValue !== 'FFFFFF' && lineValue !== 'FFFF00' ? lineValue : '334155'}`} strokeWidth={Math.max(0.6, w * PT_PX)} />
                </svg>
                {w}
              </button>
            ))}
          </PanelSection>
          <PanelSection label="線の種類">
            {DASHES.map((d) => {
              const sw = 2;
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-label={`線の種類 ${d.label}`}
                  title={d.label}
                  aria-pressed={dashValue === d.key}
                  onClick={() => restyle({dash: d.key}, 'shape')}
                  className={`flex h-9 w-[4.6rem] shrink-0 touch-manipulation items-center justify-center rounded border ${dashValue === d.key ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                >
                  <svg width="56" height="10" aria-hidden>
                    <line x1="1" y1="5" x2="55" y2="5" stroke="#334155" strokeWidth={sw} strokeDasharray={d.pattern.length ? d.pattern.map((v) => v * sw).join(' ') : undefined} />
                  </svg>
                </button>
              );
            })}
          </PanelSection>
          <PanelSection label="塗りつぶし">
            {[['', 'なし'] as [string, string], ...PANEL_COLORS].map(([hex, name]) => (
              <button
                key={hex || 'none'}
                type="button"
                aria-label={`塗りつぶし ${name}`}
                title={name}
                aria-pressed={fillValue === hex}
                disabled={selected.length > 0 && selected.every((m) => m.kind === 'line' || m.kind === 'pen')}
                onClick={() => {
                  restyle({fill: hex}, 'shape');
                  if (hex) setRecent((r) => ({...r, fill: hex}));
                }}
                className={`relative h-8 w-8 shrink-0 touch-manipulation overflow-hidden rounded border border-slate-300 disabled:opacity-35 ${fillValue === hex ? 'outline outline-2 outline-offset-1 outline-emerald-600' : ''}`}
                style={{background: hex ? `#${hex}` : 'white'}}
              >
                {!hex && <span className="absolute left-1/2 top-[-4px] h-10 w-0.5 -translate-x-1/2 rotate-45 bg-red-500" />}
              </button>
            ))}
          </PanelSection>
          <PanelSection label="文字の色">
            {PANEL_COLORS.map(([hex, name]) => (
              <button
                key={hex}
                type="button"
                aria-label={`文字の色 ${name}`}
                title={name}
                aria-pressed={fontColor === hex}
                onClick={() => {
                  restyle({color: hex}, 'text');
                  setRecent((r) => ({...r, color: hex}));
                }}
                className={`flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded border border-slate-300 bg-white text-[17px] leading-none ${fontColor === hex ? 'outline outline-2 outline-offset-1 outline-emerald-600' : ''}`}
                style={{color: `#${hex}`, background: hex === 'FFFFFF' || hex === 'FFFF00' ? '#475569' : 'white'}}
              >
                あ
              </button>
            ))}
          </PanelSection>
        </aside>
        {/* 写真（まわりは灰色。写真の外で押すと選ぶのをやめる） */}
        <div
          ref={areaRef}
          role="application"
          aria-label="写真の書き込み"
          className="relative min-h-0 min-w-0 flex-1 touch-none select-none overflow-hidden outline-none"
          style={{cursor: canvasCursor}}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={context}
          onDoubleClick={(e) => {
            if (tool === 'poly') {
              finishPoly();
              return;
            }
            if (tool === 'num' || tool === 'text' || editing || !k) return;
            const hit = topHit(marks, toPaper(e), W, H, 6 / k);
            if (hit && hasText(hit.kind)) startEdit(hit.id);
          }}
          tabIndex={-1}
        >
          {k > 0 && (
            <div ref={stageRef} data-photo-stage className="absolute" style={{left: ox, top: oy, width: W * k, height: H * k}}>
              <div className="absolute inset-0 overflow-hidden bg-white shadow-md">
                <img src={photo.url} alt="" draggable={false} className="absolute max-w-none select-none" style={{left: ((W - iw) / 2) * k, top: ((H - ih) / 2) * k, width: iw * k, height: ih * k, transform: photo.rot ? `rotate(${photo.rot}deg)` : undefined}} />
              </div>
              <MarkLayer marks={shown} w={W} h={H} k={k} hide={editing} style={{left: 0, top: 0}} />
              {selectionSvg}
              {editMark && editBox && (
                // 文字を打つ所（図形の上に重ねる。選んだだけのときは見えないまま待っていて、打つと見える＝Excel と同じく選んでそのまま打てる）
                <div
                  data-edit-text
                  className="absolute flex flex-col"
                  style={{
                    left: editBox.x * k,
                    top: editBox.y * k,
                    width: editBox.w * k,
                    height: editBox.h * k,
                    transform: editBox.rot ? `rotate(${editBox.rot}deg)` : undefined,
                    justifyContent: editMark.kind === 'text' ? 'flex-start' : 'center',
                    opacity: editing ? 1 : 0,
                    pointerEvents: editing ? 'auto' : 'none',
                    cursor: 'text',
                  }}
                >
                  <textarea
                    key={`${editMark.id}:${armKey}`}
                    ref={editRef}
                    aria-label="図形の文字"
                    value={editMark.text ?? ''}
                    spellCheck={false}
                    onBeforeInput={() => {
                      if (!latest.current.editing && editMark) {
                        editStart.current = latest.current.marks;
                        setEditing(editMark.id);
                      }
                    }}
                    onCompositionStart={() => {
                      if (!latest.current.editing && editMark) {
                        editStart.current = latest.current.marks;
                        setEditing(editMark.id);
                      }
                    }}
                    onChange={(e) => onText(e.target.value)}
                    className="block w-full resize-none overflow-hidden border-0 bg-transparent outline-none"
                    style={{...textCss, height: textHeight(editMark, editBox.w) * k, caretColor: editing ? undefined : 'transparent'}}
                  />
                </div>
              )}
            </div>
          )}
          {polyOn && (
            <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={finishPoly} className="absolute bottom-3 left-1/2 h-11 -translate-x-1/2 rounded-md border border-slate-300 bg-white px-5 text-base text-slate-700 shadow-md hover:bg-slate-50">
              ✓ 折れ線を終える
            </button>
          )}
          {/* iPad：押したその場でキーボードを出すための見えない入力欄 */}
          <textarea ref={proxyRef} data-proxy aria-hidden tabIndex={-1} className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
        </div>
      </div>
      {/* メニュー */}
      {menu?.name === 'fill' &&
        menuBox(<ColorPicker value={fillValue} none="塗りつぶしなし" onPick={(c) => pickColor('fill', c)} />, '図形の塗りつぶし', true)}
      {menu?.name === 'color' && menuBox(<ColorPicker value={fontColor} onPick={(c) => pickColor('color', c)} />, '文字の色', true)}
      {menu?.name === 'line' &&
        menuBox(
          <div className="relative">
            <ColorPicker value={lineValue} none="枠線なし" onPick={(c) => pickColor('line', c)} />
            <div className="mt-1 border-t border-slate-200 pt-1">
              {subItem('width', '太さ')}
              {subItem('dash', '実線/点線')}
              {subItem('arrow', '矢印')}
            </div>
            {sub && (
              <div role="menu" aria-label={sub === 'width' ? '太さ' : sub === 'dash' ? '実線/点線' : '矢印'} className="mt-1 rounded border border-slate-200 bg-slate-50 p-1">
                {sub === 'width' && LINE_WIDTHS.map((w) => item(`${w} pt`, () => restyle({width: w}, 'shape'), {checked: widthValue === w, sample: lineSample(w, 'solid')}))}
                {sub === 'dash' && DASHES.map((d) => item(d.label, () => restyle({dash: d.key}, 'shape'), {checked: dashValue === d.key, sample: lineSample(Math.max(1.5, widthValue), d.key)}))}
                {sub === 'arrow' &&
                  (
                    [
                      ['none', '矢印なし'],
                      ['end', '終点矢印'],
                      ['start', '始点矢印'],
                      ['both', '両端矢印'],
                    ] as const
                  ).map(([v, label]) => item(label, () => setArrows(v), {checked: first?.kind === 'line' && arrowsOf(first) === v, sample: lineSample(Math.max(1.5, lineStyle.width), 'solid', v)}))}
              </div>
            )}
          </div>,
          '図形の枠線',
          true,
        )}
      {menu?.name === 'font' &&
        menuBox(
          MARK_FONTS.map((f) => item(f.name, () => restyle({font: f.name}, 'text'), {checked: fontName === f.name, style: {fontFamily: markFontCss(f.name) ?? undefined, fontSize: 15}})),
          'フォント',
          true,
        )}
      {menu?.name === 'size' && menuBox(FONT_SIZES.map((s) => item(String(s), () => restyle({size: s}, 'text'), {checked: fontSize === s})), 'フォント サイズ')}
      {menu?.name === 'front' && menuBox([item('前面へ移動', () => order('front')), item('最前面へ移動', () => order('top'))], '前面へ移動')}
      {menu?.name === 'back' && menuBox([item('背面へ移動', () => order('back')), item('最背面へ移動', () => order('bottom'))], '背面へ移動')}
      {menu?.name === 'rotate' &&
        menuBox([item('右へ 90 度回転', () => turn('right')), item('左へ 90 度回転', () => turn('left')), item('上下反転', () => turn('flipV')), item('左右反転', () => turn('flipH'))], '回転')}
      {menu?.name === 'context' &&
        menuBox(
          [
            item('切り取り', cut, {disabled: !menu.on, keys: 'Ctrl+X'}),
            item('コピー', copy, {disabled: !menu.on, keys: 'Ctrl+C'}),
            item('貼り付け', paste, {disabled: !clip.items.length, keys: 'Ctrl+V'}),
            ...(menu.on && single && hasText(single.kind) ? [item('テキストの編集', () => startEdit(single.id), {keys: 'F2'})] : []),
            ...(menu.on ? [item('最前面へ移動', () => order('top')), item('最背面へ移動', () => order('bottom')), item('削除', remove, {keys: 'Delete'})] : [item('すべて選択', () => setSel(marks.map((m) => m.id)), {keys: 'Ctrl+A', disabled: !marks.length})]),
          ],
          '右クリックのメニュー',
        )}
    </div>
  );
}

/** コピーした図形（ほかの写真にも貼り付けられるように、画面を閉じても覚えておく） */
const clip: {items: PhotoMark[]; times: number} = {items: [], times: 0};

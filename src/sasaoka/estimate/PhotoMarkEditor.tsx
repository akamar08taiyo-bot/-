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
  cleanMarks,
  cmToPx,
  colorName,
  DASHES,
  FONT_SIZES,
  isBoxKind,
  LINE_WIDTHS,
  lineEnds,
  MARK_INSET,
  MARK_LINE_K,
  markBounds,
  markId,
  PT_PX,
  pxToCm,
  rotatedBounds,
  SHAPE_STYLE,
  shapeBox,
  STANDARD_COLORS,
  TEXT_STYLE,
  THEME_COLORS,
} from '../photoMarks.ts';
import type {MarkBox, MarkStyle} from '../photoMarks.ts';
import type {PhotoMark, PhotoMarkDash} from '../types.ts';
import {MarkLayer, markTextCss} from './MarkLayer.tsx';

type Pt = {x: number; y: number};
type Tool = 'line' | 'arrow' | 'arrow2' | 'rect' | 'ellipse' | 'text';
type RBox = MarkBox & {rot: number};
type Drag =
  | {type: 'create'; tool: Tool; p0: Pt; id: string; ctrl: boolean}
  | {type: 'move'; p0: Pt; base: PhotoMark[]; ids: string[]; moved: boolean; copy: boolean; toggle: string | null}
  | {type: 'resize'; id: string; hx: number; hy: number; base: PhotoMark}
  | {type: 'rotate'; id: string; base: PhotoMark; a0: number}
  | {type: 'end'; id: string; which: 1 | 2; base: PhotoMark};
type Menu = {name: 'fill' | 'line' | 'color' | 'size' | 'front' | 'back' | 'rotate'; x: number; y: number} | {name: 'context'; x: number; y: number; on: boolean};

/** 図形の挿入のボタン（Excel の「図形」の線・四角形・基本図形の並び） */
const TOOLS: {key: Tool; label: string}[] = [
  {key: 'line', label: '直線'},
  {key: 'arrow', label: '矢印'},
  {key: 'arrow2', label: '双方向矢印'},
  {key: 'rect', label: '正方形/長方形'},
  {key: 'ellipse', label: '楕円'},
  {key: 'text', label: 'テキスト ボックス'},
];

const MIN = 2; // 図形のいちばん小さい大きさ（紙の画素）
const STYLE_KEY = 'taiyo-sasaoka-mark-style'; // この端末で最後に選んだ書式（新しい図形に使う。Excel の「既定の図形に設定」のかわり）
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

/** この端末で最後に選んだ書式（新しい図形・テキストボックス）。読めなければ最初の書式 */
function loadStyles(): {shape: MarkStyle; text: MarkStyle} {
  const pick = (raw: unknown, base: MarkStyle, kind: PhotoMark['kind']): MarkStyle => {
    const m = cleanMarks([{kind, x1: 0, y1: 0, x2: 1, y2: 1, text: 'a', ...base, ...(raw && typeof raw === 'object' ? raw : {})}])[0];
    return m ? {line: m.line, width: m.width, dash: m.dash, fill: m.fill, color: m.color, size: m.size, bold: !!m.bold} : base;
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as {shape?: unknown; text?: unknown} | null;
    return {shape: pick(raw?.shape, SHAPE_STYLE, 'rect'), text: pick(raw?.text, TEXT_STYLE, 'text')};
  } catch {
    return {shape: SHAPE_STYLE, text: TEXT_STYLE};
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
  const s = {width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true} as const;
  // 矢印の先（x・y が先、dx・dy は線の向き）
  const arrow = (x: number, y: number, dx: number, dy: number) => {
    const a = Math.atan2(dy, dx);
    const p = (t: number) => `${x - 5 * Math.cos(a + t)},${y - 5 * Math.sin(a + t)}`;
    return <polygon points={`${x},${y} ${p(0.45)} ${p(-0.45)}`} fill="currentColor" stroke="none" />;
  };
  switch (name) {
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
    <div role="group" aria-label={label} className="flex shrink-0 flex-col border-r border-slate-200 px-1.5 pt-1">
      <div className="flex flex-1 items-start gap-0.5">{children}</div>
      <div className="whitespace-nowrap pb-0.5 pt-0.5 text-center text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

const RB = 'flex h-9 min-w-9 shrink-0 touch-manipulation items-center justify-center gap-1 rounded px-1.5 text-[13px] text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-35';

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
}: {
  title: string;
  photo: {url: string; w: number; h: number; rot: number};
  size: {w: number; h: number}; // 写真の見えている四角の紙の上の大きさ（画素）
  marks: PhotoMark[];
  onChange: (marks: PhotoMark[]) => void;
  onClose: () => void;
}) {
  const W = Math.max(1, size.w);
  const H = Math.max(1, size.h);
  const V = {x: 0, y: 0, w: W, h: H};
  const [marks, setMarks] = useState<PhotoMark[]>(initial);
  const [draft, setDraft] = useState<PhotoMark[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sub, setSub] = useState<'width' | 'dash' | 'arrow' | null>(null);
  const [styles, setStyles] = useState(loadStyles);
  const [armKey, setArmKey] = useState(0); // 文字を打つ所を作り直す（元に戻したときなど、打つ所の文字を今の文字にそろえる）
  const [fontText, setFontText] = useState<string | null>(null); // フォント サイズの欄に打っている途中の文字
  const [sizeText, setSizeText] = useState<{h?: string; w?: string}>({});
  // 塗りつぶし・枠線・文字の色のボタンの下の色（最後に選んだ色。ボタンを押すとその色に。Excel と同じ）
  const [recent, setRecent] = useState(() => ({fill: styles.shape.fill || 'FFFFFF', line: styles.shape.line || 'FF0000', color: styles.text.color}));
  const shown = draft ?? marks;
  const latest = useRef({marks, editing});
  latest.current = {marks, editing};
  const past = useRef<PhotoMark[][]>([]);
  const future = useRef<PhotoMark[][]>([]);
  const editStart = useRef<PhotoMark[] | null>(null);
  const drag = useRef<Drag | null>(null);
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
  const restyle = (patch: Partial<MarkStyle>, target: 'shape' | 'text' | 'auto' = 'auto') => {
    const ids = new Set(sel);
    if (ids.size) {
      const next = marks.map((m) => {
        if (!ids.has(m.id)) return m;
        const {fill: _fill, ...forLine} = patch; // 直線に塗りつぶしはない
        const n = {...m, ...(m.kind === 'line' ? forLine : patch)} as PhotoMark;
        return n.kind === 'text' && (patch.size !== undefined || patch.bold !== undefined) ? fitText(n) : n;
      });
      commit(next);
    }
    const kinds = ids.size ? new Set(selected.map((m) => (m.kind === 'text' ? 'text' : 'shape'))) : new Set([target === 'auto' ? 'shape' : target]);
    setStyles((s) => {
      const out = {shape: kinds.has('shape') ? {...s.shape, ...patch} : s.shape, text: kinds.has('text') ? {...s.text, ...patch} : s.text};
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
    if (!m || !isBoxKind(m.kind)) return;
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
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) endEdit();
      else if (menu) setMenu(null);
      else if (tool) setTool(null);
      else if (sel.length) setSel([]);
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
    if ((e.key === 'Enter' || e.key === 'F2') && single && isBoxKind(single.kind)) {
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
    if (!armed && single && isBoxKind(single.kind) && e.key.length === 1 && !e.altKey) {
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
    const kind: PhotoMark['kind'] = t === 'line' || t === 'arrow' || t === 'arrow2' ? 'line' : t;
    const st = kind === 'text' ? styles.text : styles.shape;
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
      fill: kind === 'line' ? '' : st.fill,
      size: st.size,
      color: st.color,
      ...(st.bold ? {bold: true} : {}),
      ...(t === 'arrow' || t === 'arrow2' ? {end: true} : {}),
      ...(t === 'arrow2' ? {start: true} : {}),
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
      const p0 = {x: clamp(p.x, 0, W), y: clamp(p.y, 0, H)};
      const m = newMark(tool, p0, p0);
      drag.current = {type: 'create', tool, p0, id: m.id, ctrl: e.ctrlKey || e.metaKey};
      setDraft([...marks, m]);
      setSel([m.id]);
      return;
    }
    // 選んでいる図形のつまみ
    if (single) {
      const ht = handleTol(e);
      if (single.kind === 'line') {
        const en = lineEnds(single, V);
        const which = Math.hypot(p.x - en.x2, p.y - en.y2) <= ht ? 2 : Math.hypot(p.x - en.x1, p.y - en.y1) <= ht ? 1 : 0;
        if (which) {
          drag.current = {type: 'end', id: single.id, which, base: single};
          return;
        }
      } else {
        const b = shapeBox(single, V);
        const h = boxHandles(b, rotGap).find((x) => Math.hypot(p.x - x.p.x, p.y - x.p.y) <= ht);
        if (h) {
          const c = center(b);
          drag.current = h.hy === -2 ? {type: 'rotate', id: single.id, base: single, a0: Math.atan2(p.y - c.y, p.x - c.x)} : {type: 'resize', id: single.id, hx: h.hx, hy: h.hy, base: single};
          return;
        }
      }
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
    if (e.pointerType !== 'mouse' && tap && tap.id === hit.id && now - tap.t < 400 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 && isBoxKind(hit.kind)) {
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
    if (!d) return;
    const p = toPaper(e);
    if (d.type === 'create') {
      const [a, b] = shapeFrom(d.tool, d.p0, p, e.shiftKey, d.ctrl || e.ctrlKey || e.metaKey);
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
      n = withBox(d.base, W, H, resizeBox(b, d.hx, d.hy, {x: clamp(p.x, 0, W), y: clamp(p.y, 0, H)}, e.shiftKey, e.ctrlKey || e.metaKey));
      if (n.kind === 'text') n = fitText(n);
    }
    if (inside(n, W, H)) setDraft(marks.map((m) => (m.id === d.id ? n : m)));
  };

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    requestAnimationFrame(arm);
    if (!d) return;
    const next = draft;
    setDraft(null);
    if (d.type === 'create') {
      let m = next ? byId(d.id, next) : undefined;
      if (!m) return;
      const b = markBounds(m, V);
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
      setTool(null);
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
  const lineStyle = first ?? {...styles.shape};
  const fillValue = first ? first.fill : styles.shape.fill;
  const lineValue = first ? first.line : styles.shape.line;
  const widthValue = first ? first.width : styles.shape.width;
  const dashValue: PhotoMarkDash = first ? first.dash : styles.shape.dash;
  const fontFirst = selected.find((m) => isBoxKind(m.kind));
  const fontSize = fontFirst ? fontFirst.size : styles.text.size;
  const fontColor = fontFirst ? fontFirst.color : styles.text.color;
  const bold = fontFirst ? !!fontFirst.bold : !!styles.text.bold;
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
  const item = (label: string, onClick: () => void, opts: {disabled?: boolean; checked?: boolean; keys?: string; icon?: ReactNode; sample?: ReactNode} = {}) => (
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
      <span className="flex-1">{label}</span>
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
    <div className="flex h-9 items-center">
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
        className="h-7 w-12 rounded-l border border-slate-300 px-1.5 text-[13px]"
      />
      <button type="button" aria-label="フォント サイズの一覧" title="フォント サイズ" onClick={(e) => openMenu('size', e.currentTarget)} className="h-7 rounded-r border border-l-0 border-slate-300 px-1 text-[10px] text-slate-600 hover:bg-slate-100">
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
      <label className="flex h-8 items-center gap-1 text-[12px] text-slate-600">
        <span className="w-6 text-right">{label}</span>
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
          className="h-7 w-16 rounded border border-slate-300 px-1.5 text-right text-[13px] disabled:bg-slate-50"
        />
        <span>cm</span>
        <span className="flex flex-col">
          <button type="button" aria-label={`${label}を大きく`} disabled={v === null} onClick={() => v !== null && apply(v + 0.1)} className="h-3.5 px-1 text-[8px] leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            ▲
          </button>
          <button type="button" aria-label={`${label}を小さく`} disabled={v === null} onClick={() => v !== null && apply(Math.max(0, v - 0.1))} className="h-3.5 px-1 text-[8px] leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            ▼
          </button>
        </span>
      </label>
    );
  };
  const split = (name: Exclude<Menu['name'], 'context'>, label: string, icon: ReactNode, apply: () => void, disabled = false) => (
    <div className="flex h-9 shrink-0 items-stretch rounded hover:ring-1 hover:ring-slate-200">
      <button type="button" className={`${RB} rounded-r-none pr-1`} title={label} aria-label={label} onClick={apply} disabled={disabled}>
        {icon}
        <span className="max-sm:hidden">{label}</span>
      </button>
      <button type="button" className="rounded-r px-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-35" aria-label={`${label}の一覧`} title={label} aria-haspopup="menu" aria-expanded={menu?.name === name} disabled={disabled} onClick={(e) => openMenu(name, e.currentTarget)}>
        ▼
      </button>
    </div>
  );

  // ---------------------------------------------------------------- 写真と図形
  const pb = rotatedBounds({x: 0, y: 0, w: Math.max(photo.w, 1), h: Math.max(photo.h, 1)}, photo.rot);
  const ps = W / (pb.w || 1); // 写真の画素 → 紙の画素
  const [iw, ih] = [Math.max(photo.w, 1) * ps, Math.max(photo.h, 1) * ps];
  const editMark = editing ? byId(editing) : single && isBoxKind(single.kind) && !draft ? single : null;
  const editBox = editMark ? shapeBox(editMark, V) : null;
  const strokeSel = '#64748b';

  const selectionSvg = (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={W * k} height={H * k} aria-hidden>
      {shown
        .filter((m) => sel.includes(m.id))
        .map((m) => {
          if (m.kind === 'line') {
            const e = lineEnds(m, V);
            return (
              <g key={m.id} data-sel={m.id}>
                {[
                  [e.x1, e.y1],
                  [e.x2, e.y2],
                ].map(([x, y], i) => (
                  <circle key={i} cx={x * k} cy={y * k} r={5.5} fill="white" stroke={strokeSel} strokeWidth={1.2} />
                ))}
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
          const hs = selected.length === 1 && !draft ? boxHandles(b, rotGap) : [];
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
  const textCss: CSSProperties | undefined = editMark ? markTextCss(editMark, k) : undefined;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title}の写真に書き込む`} className="fixed inset-0 z-[60] flex flex-col bg-slate-100 text-slate-800">
      {/* 上の帯：元に戻す・やり直し（Excel のクイック アクセス ツール バー）・題名・閉じる */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1">
        <button type="button" className={RB} title="元に戻す (Ctrl+Z)" aria-label="元に戻す" disabled={!past.current.length && !editing} onClick={undo}>
          ↶
        </button>
        <button type="button" className={RB} title="やり直し (Ctrl+Y)" aria-label="やり直し" disabled={!future.current.length} onClick={redo}>
          ↷
        </button>
        <div className="min-w-0 flex-1 truncate px-2 text-sm text-slate-700">✏️ {title}</div>
        <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50">
          閉じる
        </button>
      </div>
      {/* リボン（Excel の「図形の書式」と同じ並び） */}
      <div className="border-b border-slate-200 bg-white">
        <div className="flex gap-4 px-3 pt-1 text-[13px]">
          <span className="border-b-2 border-emerald-600 px-1 pb-0.5 text-emerald-800">図形の書式</span>
        </div>
        <div role="toolbar" aria-label="図形の書式" className="flex items-stretch overflow-x-auto px-1 pb-0.5">
          <Group label="図形の挿入">
            <div className="grid grid-cols-3 gap-0.5">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-label={t.label}
                  title={t.label}
                  aria-pressed={tool === t.key}
                  onClick={() => {
                    if (editing) endEdit();
                    setTool((cur) => (cur === t.key ? null : t.key));
                    setSel([]);
                  }}
                  className={`${RB} h-8 min-w-8 px-1 ${tool === t.key ? 'bg-slate-200 ring-1 ring-slate-400' : ''}`}
                >
                  <Icon name={t.key} />
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
              <div className="flex items-center gap-0.5">
                {fontSizeInput}
                <button type="button" className={RB} title="フォント サイズの拡大" aria-label="フォント サイズの拡大" onClick={() => growFont(1)}>
                  A<sup>▲</sup>
                </button>
                <button type="button" className={RB} title="フォント サイズの縮小" aria-label="フォント サイズの縮小" onClick={() => growFont(-1)}>
                  A<sup>▼</sup>
                </button>
              </div>
              <div className="flex items-center gap-0.5">
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
                {split('front', '前面へ移動', <Icon name="front" />, () => order('front'), !sel.length)}
                {split('back', '背面へ移動', <Icon name="back" />, () => order('back'), !sel.length)}
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
            <button type="button" className={`${RB} h-[4.5rem] flex-col`} title="貼り付け (Ctrl+V)" aria-label="貼り付け" disabled={!clip.items.length} onClick={paste}>
              <Icon name="paste" />
              <span className="text-[12px]">貼り付け</span>
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
      {/* 写真（まわりは灰色。写真の外で押すと選ぶのをやめる） */}
      <div
        ref={areaRef}
        role="application"
        aria-label="写真の書き込み"
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden outline-none"
        style={{cursor: canvasCursor}}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={context}
        onDoubleClick={(e) => {
          if (tool || editing || !k) return;
          const hit = topHit(marks, toPaper(e), W, H, 6 / k);
          if (hit && isBoxKind(hit.kind)) startEdit(hit.id);
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
        {/* iPad：押したその場でキーボードを出すための見えない入力欄 */}
        <textarea ref={proxyRef} data-proxy aria-hidden tabIndex={-1} className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
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
            ...(menu.on && single && isBoxKind(single.kind) ? [item('テキストの編集', () => startEdit(single.id), {keys: 'F2'})] : []),
            ...(menu.on ? [item('最前面へ移動', () => order('top')), item('最背面へ移動', () => order('bottom')), item('削除', remove, {keys: 'Delete'})] : [item('すべて選択', () => setSel(marks.map((m) => m.id)), {keys: 'Ctrl+A', disabled: !marks.length})]),
          ],
          '右クリックのメニュー',
        )}
    </div>
  );
}

/** コピーした図形（ほかの写真にも貼り付けられるように、画面を閉じても覚えておく） */
const clip: {items: PhotoMark[]; times: number} = {items: [], times: 0};

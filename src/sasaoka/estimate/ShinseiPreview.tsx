// 申請書のプレビュー：原本の様式のまま描く（材料は shinseiPreview.ts。Excel に保存するときと同じ書き込みをしたもの）。
// 申請書のタブで、一覧で入れながら横で見る（ユーザーの指示「一覧から入力をメインとする。プレビューをみながら入力」）。
// 一覧で入れている項目の欄は囲んで、見える所まで動かす。欄を押すと一覧のその項目へ。丸で囲む値（男・女など）は押すと丸がつく（もう一度押すと外れる）。
// まだ入っていない欄は薄い黄色。写真貼付用紙は、改修前・改修後の枠に写真を重ねて出す（枠に写真のファイルをドロップ、押して選ぶ）。
// 写真を押すと、向き・大きさを直せる（ユーザーの指示「写真の方向転換」「画像の角っこを持ち上げて縮小・拡大」「iPad でもくるっと回転」）：
// 角のつまみで大きさ（枠より大きくはしない）、上の丸いつまみでくるくる回す（90°の近くはそろう）、↺ ↻ で 90°ずつ、2本の指でひねる・つまむ（iPad）
// 写真への書き込み（直線・矢印・四角形・楕円・テキストボックス）は写真の上に重ねて描き、写真を押したときの道具の「✏️ 書き込み」（写真をダブルクリックでも）で書き込みの画面へ
// 平面図は、表題と工事内容のあいだに平面図の図を入れる枠（ドロップ・Ctrl+V・押して選ぶ。PlanSlotView）
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, RefObject} from 'react';
import type {PvFont, PvHeader, PvPage, PvPhotoSlot, PvShape, PvText, Rect, ShinseiField} from '../shinseiPreview.ts';
import {Btn, DropArea, DropOverlay, pastedFiles, useFileDragging} from '../components/ui.tsx';
import {circled} from '../estimateForms.ts';
import {clampOff, clampScale, normRot, ROT_SNAP, turn} from '../photoEdit.ts';
import {photoBounds} from '../photoMarks.ts';
import {NOTE_INSET, photoNoteLayout, photoNotePt, photoPlacement, photoSlack, planPlacement} from '../shinsei.ts';
import {familyOf} from '../shinseiPreview.ts';
import type {PhotoEdit, PhotoMark, ShinseiMarks} from '../types.ts';
import {MarkLayer} from './MarkLayer.tsx';
import {isPhotoFile} from './PhotoBoard.tsx';

const PAD = 18; // 紙の余白（画素）
const MAX_SCALE = 1.3; // 広い画面では少し大きく

/** 要素の幅（画面の幅が変わったら測り直す） */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** 文字の幅（画素。画面の字体で測る。縮小して全体を表示する欄） */
function textWidth(text: string, f: PvFont): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * f.size;
  measureCtx.font = `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${f.size}px ${f.family}`;
  return measureCtx.measureText(text).width;
}

const fontCss = (f: PvFont, k = 1): CSSProperties => ({
  fontFamily: f.family,
  fontSize: f.size * k,
  fontWeight: f.bold ? 700 : 400,
  fontStyle: f.italic ? 'italic' : undefined,
  textDecoration: [f.underline && 'underline', f.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
  color: f.color,
});

/** 縦書きの1文字の高さ（文字の大きさの何倍か。行の高さと同じ） */
const V_LINE = 1.2;

/**
 * 縦書きの欄（写真貼付用紙の改修の種別①〜⑥など）：Excel の縦書きと同じく、1文字ずつ下へ積む（文字の向きは横書きのまま。Excel も「ー」などを回さない）。
 * 縮小して全体を表示する欄は、縦の長さが入るように縮める（ユーザーの指示「縦で入力できるようにする」、2026-10-21。前は横書きで描いていて、狭い欄からはみ出していた）
 */
function VerticalText({t}: {t: PvText}) {
  const chars = t.runs.flatMap((r) => [...r.text].map((ch) => ({ch, font: r.font})));
  let k = 1;
  if (t.shrink) {
    const need = chars.reduce((n, c) => n + c.font.size * V_LINE, 0);
    const avail = t.h - 4;
    if (need > avail && need > 0) k = Math.max(0.3, avail / need);
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: t.x,
        top: t.y,
        width: t.w,
        height: t.h,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: t.valign === 'top' ? 'flex-start' : t.valign === 'bottom' ? 'flex-end' : 'center',
        padding: '2px 0',
        overflow: 'hidden',
        textAlign: t.align === 'left' || t.align === 'right' ? t.align : 'center',
        lineHeight: V_LINE,
      }}
    >
      <span className="sr-only">{t.runs.map((r) => r.text).join('')}</span>
      {chars.map((c, i) => (
        <div key={i} aria-hidden="true" style={{...fontCss(c.font, k), whiteSpace: 'pre'}}>
          {c.ch}
        </div>
      ))}
    </div>
  );
}

/**
 * 欄の文字を欄の中に全部見せる大きさ（倍率）。1行の欄は幅に入るまで（縮小して全体を表示する欄と同じ）、折り返しの欄は高さに入る行の数になるまで縮める。
 * 転記した文字は Excel でも欄に収めてある（shinsei.ts の fitTexts）が、原本の字体のない端末（スマホ・タブレットなど）は字の幅が違うので、
 * Excel では入っている原本の文字（理由書の「（Ｐ１）」など）も欄の端で切れていた（ユーザーの指示「途中で横が切れていたり…しっかり見てください」2026-10-23）
 */
// 測った幅に足す余裕：Windows の ＭＳ 明朝・ＭＳ ゴシックは小さい字で、画面に出る字の幅が測った幅より少し広いことがあり、
// ぎりぎりに縮めた見出しの終わりが欄の線で切れた（特定福祉用具の「記載者 事業所・氏名」2026-10-26）
const FIT_MARGIN = 1.05;

function fitScale(t: PvText): number {
  const avail = t.w - 4 - t.indent;
  if (avail <= 0 || t.runs.length === 0) return 1;
  if (!t.wrap) {
    const need = t.runs.reduce((n, r) => n + textWidth(r.text, r.font), 0) * FIT_MARGIN;
    return need > avail && need > 0 ? Math.max(0.3, avail / need) : 1;
  }
  // 折り返し：行ごとの幅（改行で分ける）から、折り返した行の数を数える（1文字ずつ折り返すので、1行に1文字分の余りを見る）
  const size = Math.max(...t.runs.map((r) => r.font.size));
  const widths = [0];
  for (const r of t.runs) {
    r.text.split(/\r?\n/).forEach((part, i) => {
      if (i > 0) widths.push(0);
      widths[widths.length - 1] += textWidth(part, r.font) * FIT_MARGIN;
    });
  }
  for (let k = 1; k > 0.3; k -= 0.05) {
    const rows = widths.reduce((n, w) => n + Math.max(1, Math.ceil((w * k) / Math.max(1, avail - size * k))), 0);
    if (rows * size * k * 1.2 <= t.h) return k;
  }
  return 0.3;
}

function TextView({t}: {t: PvText}) {
  if (t.vertical) return <VerticalText t={t} />;
  if (t.marked) {
    // 丸で囲む欄：1文字ずつ、丸と同じ計算の位置に置く
    const font = t.runs[0]?.font;
    return (
      <div style={{position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, overflow: 'hidden'}}>
        <span className="sr-only">{t.runs.map((r) => r.text).join('')}</span>
        {t.marked.chars.map((c, i) =>
          c.ch.trim() ? (
            <span
              key={i}
              aria-hidden="true"
              style={{position: 'absolute', left: c.x - t.x, top: t.marked!.cy - t.y, width: c.w, textAlign: 'center', transform: 'translateY(-50%)', lineHeight: 1, whiteSpace: 'pre', ...(font ? fontCss(font) : {}), fontSize: t.marked!.em}}
            >
              {c.ch}
            </span>
          ) : null,
        )}
      </div>
    );
  }
  const k = fitScale(t);
  const distributed = t.align === 'distributed';
  return (
    <div
      style={{
        position: 'absolute',
        left: t.x,
        top: t.y,
        width: t.w,
        height: t.h,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: t.valign === 'top' ? 'flex-start' : t.valign === 'bottom' ? 'flex-end' : 'center',
        padding: '0 2px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          textAlign: distributed ? 'justify' : (t.align as 'left' | 'center' | 'right'),
          textAlignLast: distributed ? 'justify' : undefined,
          whiteSpace: t.wrap ? (distributed ? 'normal' : 'pre-wrap') : 'pre',
          wordBreak: 'break-all',
          lineHeight: 1.2,
          // 行の高さは、この箱の文字の大きさ（ないと画面の 16px）の 1.2 倍より低くならないので、欄の文字の大きさにそろえる
          //（そろえないと、小さくした文字でも行の間が広いままで、改修の内容が6箇所をこえると欄からはみ出していた）
          fontSize: t.runs.length ? Math.max(...t.runs.map((r) => r.font.size)) * k : undefined,
          paddingLeft: t.align === 'left' || distributed ? t.indent : 0,
          paddingRight: t.align === 'right' || distributed ? t.indent : 0,
        }}
      >
        {t.runs.map((r, i) => (
          <span key={i} style={fontCss(r.font, k)}>
            {r.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShapeView({s}: {s: PvShape}) {
  const stroke = s.stroke || 'none';
  const fill = s.fill || 'none';
  const w = s.stroke ? s.width : 0;
  if (s.kind === 'ellipse') return <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={Math.abs(s.w) / 2} ry={Math.abs(s.h) / 2} fill={fill} stroke={stroke} strokeWidth={w} />;
  if (s.kind === 'rect' || s.kind === 'roundRect') {
    const r = s.kind === 'roundRect' ? Math.min(s.w, s.h) * 0.1667 : 0;
    return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={r} fill={fill} stroke={stroke} strokeWidth={w} />;
  }
  if (s.kind === 'bracketPair') {
    // （ ）の形：角の丸みは短い辺の 1/6
    const r = Math.min(s.w, s.h) * 0.1667;
    const {x, y} = s;
    const [x2, y2] = [s.x + s.w, s.y + s.h];
    return (
      <path
        d={`M${x + r},${y} Q${x},${y} ${x},${y + r} L${x},${y2 - r} Q${x},${y2} ${x + r},${y2} M${x2 - r},${y} Q${x2},${y} ${x2},${y + r} L${x2},${y2 - r} Q${x2},${y2} ${x2 - r},${y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={w}
      />
    );
  }
  const [x1, x2] = s.flipH ? [s.x + s.w, s.x] : [s.x, s.x + s.w];
  const [y1, y2] = s.flipV ? [s.y + s.h, s.y] : [s.y, s.y + s.h];
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={w} />;
}

/** 図形の中の文字（平面図の工事内容の文字の枠など）：段落ごとに改行し、左右・上下の配置と文字のまわりの余白は原本のとおり */
function ShapeText({s}: {s: PvShape}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: s.x,
        top: s.y,
        width: s.w,
        height: s.h,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: s.valign === 'top' ? 'flex-start' : s.valign === 'bottom' ? 'flex-end' : 'center',
        padding: `${s.inset.t}px ${s.inset.r}px ${s.inset.b}px ${s.inset.l}px`,
        textAlign: s.align,
        whiteSpace: s.wrap ? 'pre-wrap' : 'pre',
        wordBreak: 'break-all',
        lineHeight: 1.2,
        ...fontCss(s.font!),
      }}
    >
      {s.text}
    </div>
  );
}

/** 写真貼付用紙の写真（画面の URL・大きさ・向きと大きさ）と、枠にドロップ・写真を選ぶ・向きと大きさを直したとき */
export type PreviewPhotos = {
  of: (no: number, slot: PvPhotoSlot['slot']) => {url: string; w: number; h: number; edit?: PhotoEdit; marks?: PhotoMark[]} | null;
  onDrop: (no: number, slot: PvPhotoSlot['slot'], e: DragEvent) => void;
  onPick: (no: number, slot: PvPhotoSlot['slot']) => void;
  onEdit: (no: number, slot: PvPhotoSlot['slot'], edit: PhotoEdit | undefined) => void;
  onMark?: (no: number, slot: PvPhotoSlot['slot']) => void; // 写真に書き込む（PhotoMarkEditor.tsx）
  onRemove?: (no: number, slot: PvPhotoSlot['slot']) => void; // 写真を削除する（選んで Backspace・Delete・道具の「削除」）
  note?: (no: number) => string[]; // 改修前の写真の横（上）に書く内容（自動の文と手で足した行。photoNoteLines）
};

/** 打つ欄・ほかの画面にいるときのキーは、写真・平面図の図の操作にしない */
const typingTarget = (t: EventTarget | null) =>
  (t instanceof Element && !!t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) || !!document.querySelector('[role="dialog"]');

const SLOT_NAME = {before: '改修前', after: '改修後'} as const;

/** 角のつまみ（左上・右上・右下・左下）。写真の四角の中の位置（0〜1） */
const CORNERS = [
  ['左上', 0, 0],
  ['右上', 1, 0],
  ['右下', 1, 1],
  ['左下', 0, 1],
] as const;
const HANDLE = 22; // つまみの大きさ（画面の画素。紙を縮めて見せていても同じ大きさ）
const HIT = 44; // つまみの押せる所の大きさ（指で押しやすいように、見た目より広く）

/**
 * 写真貼付用紙の改修前・改修後の枠：写真は Excel に貼るのと同じ大きさ・位置・向き（photoPlacement）。ないときは「＋ 改修前」。
 * 写真を押すと選んで、つまみ・道具（↺ ↻・元に戻す・差し替え・完了）を出す。動かしている間は下書き（draft）だけ変え、指を離したら保存する
 */
function PhotoSlotView({
  slot,
  no,
  photos,
  selected,
  onSelect,
  zoom,
}: {
  slot: PvPhotoSlot;
  no: number;
  photos: PreviewPhotos;
  selected: boolean;
  onSelect: (on: boolean) => void;
  zoom: number; // 紙を縮めている割合（つまみ・道具は画面で同じ大きさにする）
}) {
  const [over, setOver] = useState(false);
  const photo = photos.of(no, slot.slot);
  const [draft, setDraft] = useState<PhotoEdit | null>(null);
  const draftRef = useRef<PhotoEdit | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const picRef = useRef<HTMLDivElement>(null); // 回す前の写真の四角（まん中で回る）
  const touches = useRef(new Map<number, {x: number; y: number}>());
  const pinch = useRef<{d0: number; a0: number; base: PhotoEdit} | null>(null);
  const move = useRef<{x0: number; y0: number; base: PhotoEdit; moved: boolean} | null>(null); // 選んだ写真をつかんで動かしているとき
  const edit: PhotoEdit = draft ?? photo?.edit ?? {rot: 0, scale: 1};
  // 改修前の枠だけ、書く内容があれば写真を左（横の写真は上）に寄せて空いた所に書く（Excel と同じ photoNoteLayout。改修後の写真は枠いっぱい）。
  // 回している間（draft）は回す前の向きで分けたまま（縦・横が変わるたびに写真のまん中が動くと回しにくい）。離すと分け直す
  const lines = slot.slot === 'before' && !slot.memo ? (photos.note?.(no) ?? []) : []; // メモの欄のある用紙（福岡市）は枠に書かない
  const parts = photoNoteLayout({x: 0, y: 0, w: slot.w, h: slot.h}, photo ? {w: photo.w, h: photo.h, rot: photo.edit?.rot ?? 0} : null, lines);
  const box = photo ? photoPlacement(parts.photo, photo.w, photo.h, edit) : null;
  const name = `写真貼付用紙${circled(no)}の${SLOT_NAME[slot.slot]}`;
  const z = 1 / Math.max(zoom, 0.05);

  // 写真を削除（確かめてから。平面図の図と同じ）
  const removeRef = useRef<() => void>(() => {});
  removeRef.current = () => {
    if (!photos.onRemove || !window.confirm(`${name}の写真を削除しますか？`)) return;
    onSelect(false);
    photos.onRemove(no, slot.slot);
  };
  // ほかの所を押す・Esc で選ぶのをやめる。Backspace・Delete で削除（ユーザーの指示「キーボードのbackボタンで写真を削除できるようにする」2026-10-29）
  useEffect(() => {
    if (!selected) return;
    const outside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onSelect(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSelect(false);
      else if ((e.key === 'Backspace' || e.key === 'Delete') && !typingTarget(e.target)) {
        e.preventDefault();
        removeRef.current();
      }
    };
    // iPad の Safari：2本の指でひねる・つまむとき、画面ごと拡大しないように
    const el = rootRef.current;
    const still = (e: Event) => e.preventDefault();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc, true); // 写真の欄（PhotoBoard）で写真を選んでいても、プレビューの写真を先に消す
    el?.addEventListener('gesturestart', still);
    el?.addEventListener('gesturechange', still);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', esc, true);
      el?.removeEventListener('gesturestart', still);
      el?.removeEventListener('gesturechange', still);
    };
  }, [selected, onSelect]);

  const preview = (e: PhotoEdit) => {
    draftRef.current = e;
    setDraft(e);
  };
  const commit = () => {
    const e = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (e) photos.onEdit(no, slot.slot, e);
  };
  const center = () => {
    const r = picRef.current?.getBoundingClientRect();
    return r ? {x: r.left + r.width / 2, y: r.top + r.height / 2} : {x: 0, y: 0};
  };
  const deg = (rad: number) => (rad * 180) / Math.PI;

  /** つまみをドラッグ：角＝写真のまん中からの距離の割合で大きさ、上の丸＝まん中のまわりの角度で向き（マウスでも指でも） */
  const dragHandle = (e: ReactPointerEvent<HTMLElement>, kind: 'scale' | 'rotate') => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const c = center();
    const base = edit;
    const d0 = Math.hypot(e.clientX - c.x, e.clientY - c.y) || 1;
    const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    const move = (ev: PointerEvent) => {
      if (kind === 'scale') preview({...base, scale: clampScale((base.scale * Math.hypot(ev.clientX - c.x, ev.clientY - c.y)) / d0)});
      else preview({...base, rot: normRot(base.rot + deg(Math.atan2(ev.clientY - c.y, ev.clientX - c.x) - a0), ROT_SNAP)});
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      commit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /**
   * 選んだ写真をつかんで動かす（ユーザーの指示「写真の位置の調整をおこなえるようにする」2026-10-22。マウスでも指でも）：
   * 動かした画素を、写真の所の空き（`photoSlack`）に対する位置（−1〜1）にする。空きのない向きには動かない（枠からはみ出さない）
   */
  const moved = (base: PhotoEdit, dx: number, dy: number): PhotoEdit => {
    if (!photo) return base;
    const {sx, sy} = photoSlack(parts.photo, photo.w, photo.h, base);
    const off = (v: number | undefined, d: number, slack: number) => (slack > 0.5 ? clampOff((v ?? 0) + (2 * d) / slack) : (v ?? 0));
    return {...base, x: off(base.x, dx, sx), y: off(base.y, dy, sy)};
  };

  /** 2本の指（iPad）：ひねると回り、つまむ・広げると大きさが変わる。1本の指（とマウス）は写真を動かす */
  const twoFingers = () => {
    const [p, q] = [...touches.current.values()];
    return {d: Math.hypot(q.x - p.x, q.y - p.y) || 1, a: Math.atan2(q.y - p.y, q.x - p.x)};
  };
  const touchDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!selected || (e.pointerType === 'mouse' && e.button !== 0)) return;
    touches.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
    e.currentTarget.setPointerCapture(e.pointerId);
    if (touches.current.size === 2) {
      const {d, a} = twoFingers();
      pinch.current = {d0: d, a0: a, base: draftRef.current ?? edit};
      move.current = null;
    } else if (touches.current.size === 1) {
      move.current = {x0: e.clientX, y0: e.clientY, base: edit, moved: false};
    }
  };
  const touchMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const g = pinch.current;
    if (g && touches.current.size >= 2) {
      const {d, a} = twoFingers();
      preview({...g.base, rot: normRot(g.base.rot + deg(a - g.a0), ROT_SNAP), scale: clampScale((g.base.scale * d) / g.d0)});
      return;
    }
    const m = move.current;
    if (!m || touches.current.size !== 1) return;
    // 紙を縮めて見せているので、画面の画素を紙の画素に（z＝1÷縮めた割合）。少し動かしただけ（押しただけ）では動かさない
    const [dx, dy] = [(e.clientX - m.x0) * z, (e.clientY - m.y0) * z];
    if (!m.moved && Math.hypot(e.clientX - m.x0, e.clientY - m.y0) < 4) return;
    m.moved = true;
    preview(moved(m.base, dx, dy));
  };
  const touchUp = (e: ReactPointerEvent<HTMLElement>) => {
    touches.current.delete(e.pointerId);
    if (pinch.current && touches.current.size < 2) {
      pinch.current = null;
      move.current = null;
      commit();
      return;
    }
    const m = move.current;
    if (m && touches.current.size === 0) {
      move.current = null;
      if (m.moved) commit();
    }
  };

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      setOver(false);
      photos.onDrop(no, slot.slot, e);
    },
  };
  const rotated = (b: {x: number; y: number; w: number; h: number; rot: number}): CSSProperties => ({
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
    transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
  });
  const tool =
    'flex h-9 min-w-9 touch-manipulation items-center justify-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800';

  return (
    // 選んでいるときは、つまみ・道具がほかの欄・下の枠より上に出るように
    <div ref={rootRef} className="absolute" style={{left: slot.x, top: slot.y, width: slot.w, height: slot.h, zIndex: selected ? 20 : undefined}} {...dropProps}>
      {photo && box ? (
        <>
          <button
            type="button"
            aria-label={name}
            aria-pressed={selected}
            title={selected ? 'ドラッグで位置' : `${SLOT_NAME[slot.slot]}の写真（押すと向き・大きさ・位置）`}
            onClick={() => onSelect(true)}
            onDoubleClick={() => photos.onMark?.(no, slot.slot)}
            onPointerDown={touchDown}
            onPointerMove={touchMove}
            onPointerUp={touchUp}
            onPointerCancel={touchUp}
            className={`absolute inset-0 ${selected ? 'cursor-move' : 'cursor-pointer'} ${over ? 'bg-emerald-400/15 outline outline-4 outline-emerald-600' : selected ? '' : 'hover:outline hover:outline-2 hover:outline-emerald-600'}`}
            style={{touchAction: selected ? 'none' : undefined}}
          >
            <div ref={picRef} className="absolute" style={rotated(box)}>
              <img src={photo.url} alt="" draggable={false} className="block h-full w-full max-w-none select-none" style={{WebkitTouchCallout: 'none'}} />
            </div>
          </button>
          {photo.marks?.length ? <SlotMarks marks={photo.marks} box={box} /> : null}
          {selected && (
            <>
              {/* つまみ（写真と一緒に回る） */}
              <div className="pointer-events-none absolute outline outline-2 outline-sky-600" style={{...rotated(box), outlineWidth: 2 * z}}>
                {CORNERS.map(([label, fx, fy]) => (
                  <div
                    key={label}
                    role="button"
                    aria-label={`${name}の大きさ（${label}の角）`}
                    title="ドラッグで大きさ"
                    onPointerDown={(e) => dragHandle(e, 'scale')}
                    className="pointer-events-auto absolute flex touch-none items-center justify-center"
                    style={{left: `${fx * 100}%`, top: `${fy * 100}%`, width: HIT * z, height: HIT * z, transform: 'translate(-50%, -50%)', cursor: fx === fy ? 'nwse-resize' : 'nesw-resize'}}
                  >
                    <span className="block rounded-sm border-sky-700 bg-white shadow" style={{width: HANDLE * z, height: HANDLE * z, borderWidth: 2 * z}} />
                  </div>
                ))}
                <div className="absolute left-1/2 bg-sky-600" style={{top: -26 * z, width: 2 * z, height: 26 * z, transform: 'translateX(-50%)'}} />
                <div
                  role="button"
                  aria-label={`${name}の向き（回す）`}
                  title="ドラッグで回す"
                  onPointerDown={(e) => dragHandle(e, 'rotate')}
                  className="pointer-events-auto absolute left-1/2 flex touch-none items-center justify-center"
                  style={{top: -(26 + (HANDLE + 6) / 2) * z, width: HIT * z, height: HIT * z, transform: 'translate(-50%, -50%)', cursor: 'grab'}}
                >
                  <span
                    className="flex items-center justify-center rounded-full border-sky-700 bg-white text-sky-800 shadow"
                    style={{width: (HANDLE + 6) * z, height: (HANDLE + 6) * z, borderWidth: 2 * z, fontSize: 17 * z, lineHeight: 1}}
                  >
                    ↻
                  </span>
                </div>
              </div>
              {/* 道具（紙を縮めていても同じ大きさ）。写真にかぶらないように枠のすぐ下 */}
              <div
                role="toolbar"
                aria-label={`${name}の向き・大きさ`}
                className="absolute left-1/2 top-full flex w-max gap-1 whitespace-nowrap rounded-lg bg-white/95 p-1 shadow-lg ring-1 ring-slate-300"
                style={{transform: `translate(-50%, ${6 * z}px) scale(${z})`, transformOrigin: 'top center'}}
              >
                <button type="button" className={tool} title="左に回す" aria-label="左に回す" onClick={() => photos.onEdit(no, slot.slot, turn(edit, -1))}>
                  ↺
                </button>
                <button type="button" className={tool} title="右に回す" aria-label="右に回す" onClick={() => photos.onEdit(no, slot.slot, turn(edit, 1))}>
                  ↻
                </button>
                <button type="button" className={tool} title="向き・大きさ・位置を元に戻す" onClick={() => photos.onEdit(no, slot.slot, undefined)}>
                  元に戻す
                </button>
                <button type="button" className={tool} onClick={() => photos.onPick(no, slot.slot)}>
                  差し替え
                </button>
                {photos.onMark && (
                  <button type="button" className={tool} title="写真に書き込む" onClick={() => photos.onMark?.(no, slot.slot)}>
                    ✏️ 書き込み
                  </button>
                )}
                {photos.onRemove && (
                  <button type="button" className={tool} title="写真を削除（Backspace・Delete）" onClick={() => removeRef.current()}>
                    削除
                  </button>
                )}
                <button type="button" className={`${tool} border-sky-600 text-sky-800`} onClick={() => onSelect(false)}>
                  完了
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <button
          type="button"
          aria-label={name}
          title={`${SLOT_NAME[slot.slot]}の写真を入れる`}
          onClick={() => photos.onPick(no, slot.slot)}
          className={`absolute inset-0 cursor-pointer ${over ? 'bg-emerald-400/15 outline outline-4 outline-emerald-600' : 'hover:bg-emerald-400/10'}`}
        >
          {/* 写真を入れる所（書く内容があれば、その横・下の写真の所だけ） */}
          <span
            className="absolute flex items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-base text-slate-400"
            style={{left: parts.photo.x + 12, top: parts.photo.y + 12, width: Math.max(0, parts.photo.w - 24), height: Math.max(0, parts.photo.h - 24)}}
          >
            ＋ {SLOT_NAME[slot.slot]}
          </span>
        </button>
      )}
      {parts.note && (
        // 写真の横（下）に書く内容（押しても写真の枠のボタンに届くように、押せない文字）
        <div
          className="pointer-events-none absolute overflow-hidden"
          style={{left: parts.note.x, top: parts.note.y, width: parts.note.w, height: parts.note.h, padding: `${NOTE_INSET.y}px ${NOTE_INSET.x}px`, fontFamily: familyOf(''), fontSize: (photoNotePt(parts.note, lines) * 4) / 3, lineHeight: 1.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#000', textAlign: parts.align}}
        >
          {lines.join('\n')}
        </div>
      )}
    </div>
  );
}

/** 写真への書き込み（写真の見えている四角に重ねる。紙の画素のまま＝プレビューの紙と一緒に縮む） */
function SlotMarks({marks, box}: {marks: PhotoMark[]; box: {x: number; y: number; w: number; h: number; rot: number}}) {
  const vb = photoBounds(box);
  return <MarkLayer marks={marks} w={vb.w} h={vb.h} style={{left: vb.x, top: vb.y}} />;
}

/** 印刷の画面の写真貼付用紙の写真（PhotoSlotView と同じ位置・向き・大きさ・書く内容。押せる所・つまみ・空いた枠の「＋ 改修前」は出さない） */
function PhotoPrintView({slot, no, photos}: {slot: PvPhotoSlot; no: number; photos: PreviewPhotos}) {
  const photo = photos.of(no, slot.slot);
  const lines = slot.slot === 'before' && !slot.memo ? (photos.note?.(no) ?? []) : []; // メモの欄のある用紙（福岡市）は枠に書かない
  const parts = photoNoteLayout({x: 0, y: 0, w: slot.w, h: slot.h}, photo ? {w: photo.w, h: photo.h, rot: photo.edit?.rot ?? 0} : null, lines);
  const box = photo ? photoPlacement(parts.photo, photo.w, photo.h, photo.edit ?? {rot: 0, scale: 1}) : null;
  return (
    <div className="absolute overflow-hidden" style={{left: slot.x, top: slot.y, width: slot.w, height: slot.h}}>
      {photo && box && (
        <div className="absolute" style={{left: box.x, top: box.y, width: box.w, height: box.h, transform: box.rot ? `rotate(${box.rot}deg)` : undefined}}>
          <img src={photo.url} alt="" className="block h-full w-full max-w-none" />
        </div>
      )}
      {photo?.marks?.length && box ? <SlotMarks marks={photo.marks} box={box} /> : null}
      {parts.note && (
        <div
          className="absolute overflow-hidden"
          style={{left: parts.note.x, top: parts.note.y, width: parts.note.w, height: parts.note.h, padding: `${NOTE_INSET.y}px ${NOTE_INSET.x}px`, fontFamily: familyOf(''), fontSize: (photoNotePt(parts.note, lines) * 4) / 3, lineHeight: 1.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#000', textAlign: parts.align}}
        >
          {lines.join('\n')}
        </div>
      )}
    </div>
  );
}

/** 印刷の画面の平面図の図（PlanSlotView と同じ位置・大きさ。枠・道具は出さない） */
function PlanPrintView({slot, scale, left, top, image}: {slot: Rect; scale: number; left: number; top: number; image: {url: string; w: number; h: number}}) {
  const box = planPlacement({x: 0, y: 0, w: slot.w, h: slot.h}, image.w, image.h);
  return (
    <div className="absolute" style={{left: left + slot.x * scale, top: top + slot.y * scale, width: slot.w * scale, height: slot.h * scale}}>
      <img src={image.url} alt="" className="absolute block max-w-none" style={{left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale}} />
    </div>
  );
}

/** 平面図の図（画面の URL と大きさ。図がなければ undefined、読み込むまで・この端末にない図は null）と、図を入れる（差し替える）・ファイルを選ぶ・消す */
export type PreviewPlan = {
  image: {url: string; w: number; h: number} | null | undefined;
  missing: boolean; // この端末にない図（ほかの端末で入れた・バックアップから戻した様邸）
  busy: boolean; // 図を入れているところ（PDF を図にしているなど）
  onFiles: (files: File[]) => void;
  onPick: () => void;
  onRemove: () => void;
};

/**
 * 平面図の図を入れる枠（ユーザーの指示「平面図に画像をドロップ・貼り付け」2026-10-25）：平面図の表題と工事内容のあいだの空いた所（Excel で図を貼る範囲と同じ）。
 * 写真の枠と同じく、空いた枠は点線に「ドロップ・Ctrl+V」、ファイルを画面に持ってくると薄い緑、重ねると「ここに離す」。押すとファイルを選ぶ。
 * 図は Excel と同じ位置・大きさ（planPlacement。縦横の比はそのまま、枠より大きくしない）。図を押すと選んで、差し替え・削除（確かめてから）・完了。
 * 枠を押した（選んだ・Tab で移った）あとの Ctrl+V は、この枠に貼る（写真の欄・介護保険証の読み取りより先に受ける）。
 * 字が小さくならないように、紙を縮めて見せていても枠は画面の大きさで描く（slot は紙の画素、scale は縮めた割合、left・top は画面での紙の左上）
 */
function PlanSlotView({slot, scale, left, top, plan}: {slot: Rect; scale: number; left: number; top: number; plan: PreviewPlan}) {
  const [selected, setSelected] = useState(false);
  const [over, setOver] = useState(false);
  const dragging = useFileDragging();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(false);
  selectedRef.current = selected;
  const onFiles = useRef(plan.onFiles);
  onFiles.current = plan.onFiles;
  useEffect(() => {
    if (!dragging) setOver(false); // 枠の外で離した・やめたとき
  }, [dragging]);
  // ほかの所を押す・Esc で選ぶのをやめる
  useEffect(() => {
    if (!selected) return;
    const outside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setSelected(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', esc);
    };
  }, [selected]);
  // Ctrl+V：この枠を選んでいる・フォーカスがあるときは、貼り付けた画像・PDF を平面図に（字を打つ欄・ほかの画面が開いているときは、ふつうの貼り付け）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!selectedRef.current && !(rootRef.current && rootRef.current.contains(document.activeElement))) return;
      const files = pastedFiles(e.clipboardData, isPhotoFile);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setSelected(false);
      onFiles.current(files);
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, []);
  const remove = () => {
    if (!window.confirm('平面図の図を削除しますか？')) return;
    setSelected(false);
    plan.onRemove();
  };
  const frame: CSSProperties = {left: left + slot.x * scale, top: top + slot.y * scale, width: slot.w * scale, height: slot.h * scale};
  const image = plan.image;
  if (image === undefined)
    return (
      <div ref={rootRef} className="absolute" style={frame}>
        <DropArea
          name="平面図"
          label={plan.busy ? '平面図を入れています…' : '＋ 平面図'}
          hint="ドロップ・Ctrl+V"
          data-plan-slot
          onPointerDown={(e) => e.currentTarget.focus()} // Safari は押してもフォーカスしないので（押したあとの Ctrl+V をこの枠に）
          onPick={plan.onPick}
          onFiles={(files) => plan.onFiles(files)}
          className="flex h-full w-full flex-col items-center justify-center"
        />
      </div>
    );
  // 図の位置（紙の画素で Excel と同じ計算をして、画面の大きさに）
  const box = image ? planPlacement({x: 0, y: 0, w: slot.w, h: slot.h}, image.w, image.h) : null;
  const onDragOver = (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setOver(true);
  };
  return (
    <div ref={rootRef} className="absolute" style={{...frame, zIndex: selected ? 20 : undefined}}>
      <button
        type="button"
        aria-label="平面図"
        aria-pressed={selected}
        title={selected ? '平面図の図' : '平面図の図（押すと差し替え・削除）'}
        data-plan-slot
        data-drop={over ? 'over' : dragging ? 'ready' : undefined}
        onPointerDown={(e) => e.currentTarget.focus()}
        onClick={() => setSelected(true)}
        onKeyDown={(e) => {
          if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
            e.preventDefault();
            remove();
          }
        }}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          setSelected(false);
          const files = [...e.dataTransfer.files];
          if (files.length) plan.onFiles(files);
        }}
        className={`absolute inset-0 cursor-pointer rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
          selected
            ? 'ring-4 ring-sky-500'
            : over
              ? 'ring-4 ring-emerald-500'
              : dragging
                ? 'bg-emerald-50/60 ring-2 ring-emerald-400'
                : image
                  ? 'hover:ring-2 hover:ring-emerald-500'
                  : 'border-2 border-dashed border-slate-400 hover:border-emerald-500'
        }`}
      >
        {image && box ? (
          <img src={image.url} alt="" draggable={false} className="absolute block max-w-none select-none" style={{left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale}} />
        ) : (
          plan.missing && <span className="absolute inset-0 flex items-center justify-center px-2 text-sm text-amber-800">この端末にない平面図</span>
        )}
        {plan.busy && <span className="absolute inset-x-0 top-1 text-center text-xs font-bold text-slate-600">平面図を入れています…</span>}
        {over && <DropOverlay text="ここに離す（差し替え）" />}
      </button>
      {selected && (
        // 道具は図にかぶらないように枠の下の端
        <div role="toolbar" aria-label="平面図の図" className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg bg-white/95 p-1 shadow-lg ring-1 ring-slate-300">
          <Btn small color="white" onClick={plan.onPick}>
            差し替え
          </Btn>
          <Btn small color="white" onClick={remove}>
            削除
          </Btn>
          <Btn small color="white" onClick={() => setSelected(false)}>
            完了
          </Btn>
        </div>
      )}
    </div>
  );
}

function HeaderView({h, top, width, height}: {h: PvHeader; top: number; width: number; height: number}) {
  const part = (runs: PvHeader['left'], align: 'left' | 'center' | 'right') => (
    <div style={{flex: 1, textAlign: align, whiteSpace: 'pre'}}>
      {runs.map((r, i) => (
        <span key={i} style={fontCss(r.font)}>
          {r.text}
        </span>
      ))}
    </div>
  );
  return (
    <div style={{position: 'absolute', left: PAD, top, width, height, display: 'flex', alignItems: 'center', gap: 8}}>
      {part(h.left, 'left')}
      {part(h.center, 'center')}
      {part(h.right, 'right')}
    </div>
  );
}

const bandHeight = (h: PvHeader | null) => (h ? Math.max(...[...h.left, ...h.center, ...h.right].map((r) => r.font.size), 12) * 1.5 + 8 : 0);

/** 1枚の大きさ（紙。画素）。印刷の画面（ShinseiPrint.tsx）も、この大きさで A4 に入る倍率を決める */
export function paper(page: PvPage) {
  const head = bandHeight(page.header);
  const foot = bandHeight(page.footer);
  return {width: page.width + PAD * 2, height: page.height + head + foot + PAD * 2, head, foot};
}

export function ShinseiPages({
  pages,
  missing,
  active,
  marks,
  label,
  onOpen,
  onToggle,
  photos,
  plan,
  scrollBox,
  title = '申請書のプレビュー',
  print = false,
  fixedScale,
}: {
  pages: PvPage[];
  missing: Partial<Record<ShinseiField, boolean>>;
  active: ShinseiField | null; // 一覧で入れている項目（その欄を囲む）
  marks: ShinseiMarks; // 今の丸
  label: (f: ShinseiField) => string;
  onOpen: (f: ShinseiField) => void; // 欄を押したとき（一覧のその項目へ）
  onToggle: (key: keyof ShinseiMarks, option: string) => void;
  photos?: PreviewPhotos; // 写真貼付用紙の写真（ないときは枠を出さない）
  plan?: PreviewPlan; // 平面図の図（ないときは枠を出さない）
  scrollBox?: RefObject<HTMLElement | null>; // プレビューを入れた枠（一覧の横に並べて、枠の中で動くとき）
  title?: string; // プレビューの名前（理由書は「理由書のプレビュー」）
  print?: boolean; // 印刷の画面（ShinseiPrint.tsx）：押せる所・黄色・写真のつまみを出さず、写真と平面図の図は印刷のとおりに描くだけ
  fixedScale?: number; // 印刷の画面の大きさ（A4 の紙の余白の内側に入る大きさ。なければ枠の幅に合わせる）
}) {
  const [wrapRef, wrapWidth] = useWidth<HTMLDivElement>();
  const widest = Math.max(...pages.map((p) => paper(p).width), 1);
  const scale = fixedScale ?? (wrapWidth ? Math.min(MAX_SCALE, wrapWidth / widest) : 1);
  // 向き・大きさを直している写真（写真番号:改修前／改修後）
  const [editing, setEditing] = useState('');

  // 一覧で入れている項目の欄（同じ項目が2枚目にもあるとき＝式で同じ値を出している欄は、最初に出てくる欄）が見えるように、プレビューの枠の中を動かす。
  // 縦に並べた狭い画面（枠が動かない）では、画面ごと動かさない（入れている欄が見えなくなるので）
  const firstRef = useRef<HTMLDivElement>(null);
  const firstKey = active ? `${active}:${pages.findIndex((p) => p.fields.some((f) => f.field === active))}` : '';
  useEffect(() => {
    const box = scrollBox?.current;
    const el = firstRef.current;
    if (!box || !el || box.scrollHeight <= box.clientHeight + 1) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return;
    box.scrollTo({top: box.scrollTop + r.top - b.top - b.height / 3, behavior: 'smooth'});
  }, [firstKey]);
  let firstDone = false;

  return (
    <div ref={wrapRef} className="space-y-4" aria-label={title}>
      {pages.map((page) => {
        const pp = paper(page);
        return (
          <div key={page.sheet} className="relative mx-auto" style={{width: pp.width * scale, height: pp.height * scale}}>
            <div
              className={`absolute left-0 top-0 origin-top-left bg-white ${print ? '' : 'shadow-[0_1px_4px_rgba(0,0,0,0.25)]'}`}
              style={{width: pp.width, height: pp.height, transform: `scale(${scale})`}}
              role="group"
              aria-label={page.sheet}
            >
              {page.header && <HeaderView h={page.header} top={6} width={page.width} height={pp.head} />}
              {page.footer && <HeaderView h={page.footer} top={pp.height - pp.foot - 6} width={page.width} height={pp.foot} />}
              <div className="absolute" style={{left: PAD, top: PAD + pp.head, width: page.width, height: page.height}}>
                {page.fills.map((f, i) => (
                  <div key={i} style={{position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, background: f.color}} />
                ))}
                {page.texts.map((t) => (
                  <TextView key={t.ref} t={t} />
                ))}
                {page.shapes
                  .filter((s) => s.text && s.font)
                  .map((s, i) => (
                    <ShapeText key={`st${i}`} s={s} />
                  ))}
                <svg width={page.width} height={page.height} className="pointer-events-none absolute left-0 top-0 overflow-visible">
                  {page.lines.map((l, i) =>
                    l.double ? (
                      <g key={i} stroke={l.color} strokeWidth={1} shapeRendering="crispEdges">
                        {l.y1 === l.y2 ? (
                          <>
                            <line x1={l.x1} y1={l.y1 - 1} x2={l.x2} y2={l.y2 - 1} />
                            <line x1={l.x1} y1={l.y1 + 1} x2={l.x2} y2={l.y2 + 1} />
                          </>
                        ) : (
                          <>
                            <line x1={l.x1 - 1} y1={l.y1} x2={l.x2 - 1} y2={l.y2} />
                            <line x1={l.x1 + 1} y1={l.y1} x2={l.x2 + 1} y2={l.y2} />
                          </>
                        )}
                      </g>
                    ) : (
                      <line
                        key={i}
                        x1={l.x1}
                        y1={l.y1}
                        x2={l.x2}
                        y2={l.y2}
                        stroke={l.color}
                        strokeWidth={l.width}
                        strokeDasharray={l.dash || undefined}
                        strokeLinecap={l.dash ? 'butt' : 'square'}
                        shapeRendering="crispEdges"
                      />
                    ),
                  )}
                  {page.shapes.map((s, i) => (
                    <ShapeView key={i} s={s} />
                  ))}
                </svg>
                {/* 押すと一覧のその項目へ（まだ入っていない欄は薄い黄色、入れている項目は囲む）。印刷の画面には出さない */}
                {!print && page.fields.map((f, i) => {
                  const on = active === f.field;
                  const first = on && !firstDone;
                  if (first) firstDone = true;
                  return (
                    <div
                      key={`f${i}`}
                      ref={first ? firstRef : undefined}
                      role="button"
                      tabIndex={-1}
                      aria-label={label(f.field)}
                      title={label(f.field)}
                      onClick={() => onOpen(f.field)}
                      className={`absolute cursor-pointer rounded-[2px] transition-colors ${
                        on ? 'bg-sky-400/15 outline outline-2 outline-sky-600' : missing[f.field] ? 'bg-amber-300/35 hover:outline hover:outline-2 hover:outline-emerald-600' : 'hover:bg-emerald-400/10 hover:outline hover:outline-2 hover:outline-emerald-600'
                      }`}
                      style={{left: f.x, top: f.y, width: f.w, height: f.h}}
                    />
                  );
                })}
                {/* 写真貼付用紙の写真の枠 */}
                {photos &&
                  print &&
                  page.photoSlots.map((slot) => <PhotoPrintView key={`${slot.photo}:${slot.slot}`} slot={slot} no={slot.photo} photos={photos} />)}
                {photos &&
                  !print &&
                  page.photoSlots.map((slot) => {
                    const key = `${slot.photo}:${slot.slot}`;
                    return (
                      <PhotoSlotView
                        key={key}
                        slot={slot}
                        no={slot.photo}
                        photos={photos}
                        selected={editing === key}
                        onSelect={(on) => setEditing((cur) => (on ? key : cur === key ? '' : cur))}
                        zoom={scale}
                      />
                    );
                  })}
                {/* 押すと丸がつく値 */}
                {!print && page.options.map((o, i) => (
                  <button
                    key={`o${i}`}
                    type="button"
                    aria-label={`${o.option}に丸をつける`}
                    aria-pressed={marks[o.key] === o.option}
                    title={marks[o.key] === o.option ? `${o.option}の丸を外す` : `${o.option}に丸をつける`}
                    onClick={() => onToggle(o.key, o.option)}
                    className="absolute cursor-pointer rounded-full hover:bg-emerald-500/20 hover:outline hover:outline-1 hover:outline-emerald-700"
                    style={{left: o.x, top: o.y, width: o.w, height: o.h}}
                  />
                ))}
              </div>
            </div>
            {/* 平面図の図を入れる枠（紙の上に、画面の大きさで） */}
            {plan && page.planSlot && !print && <PlanSlotView slot={page.planSlot} scale={scale} left={PAD * scale} top={(PAD + pp.head) * scale} plan={plan} />}
            {plan?.image && page.planSlot && print && <PlanPrintView slot={page.planSlot} scale={scale} left={PAD * scale} top={(PAD + pp.head) * scale} image={plan.image} />}
          </div>
        );
      })}
    </div>
  );
}

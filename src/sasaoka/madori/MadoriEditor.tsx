// 様邸の画面の「📐 平面図」のタブ（ユーザーの指示「平面図をつくれるような機能を追加する。まどりっちの機能やマイホームクラウドの機能もつけくわえる」2026-11-09）。
// 左に道具（マイホームクラウドと同じ部屋の一覧・建具・設備・階段・改修・作図）、まん中に方眼（910mm など）、右に選んだ部品の欄と一覧（凡例）。
// 部屋はドラッグで方眼に、ドアと窓は壁に、トイレ・浴槽などは壁ぎわに、手すりは壁ぞいに吸い付く（edit.ts）。
// 絵は印刷・Excel と同じ render.ts。手すり・段差の解消は申請書の箇所につなぐと、番号（写真番号）と一覧の文が申請書と同じになる

import {useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState} from 'react';
import type {PointerEvent as RPointerEvent, ReactNode} from 'react';
import {jobName} from '../calc.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import type {JobDocs} from '../components/DocsDialog.tsx';
import {INSURER_INFO, jobInsurer, KINDS} from '../estimateForms.ts';
import {JobHeader, JobTitle, RemoveJobButton} from '../estimate/JobHeader.tsx';
import {preparePhoto, putPhoto, rememberPhotoUrl, usePhotoUrls} from '../photos.ts';
import type {AppData, Job} from '../types.ts';
import type {Update} from '../useStore.ts';
import {DOOR_TYPES, FIX_TYPES, FINISH, ROOM_ROWS, ROOM_SHORT, ROOM_TYPES, roomFinish, STAIR_TYPES, STEP_TYPES, WINDOW_TYPES} from './catalog.ts';
import {isScribble} from '../photoMarks.ts';
import {copied, DRAG_TOOLS, floorArea, handlesOf, hitTest, isCornerHandle, makeItem, moved, railFrom, resized, scribbleHits, SHAPE_COLORS, turnedItem} from './edit.ts';
import {closed, orthoNext, shapeOf, snapPt} from './poly.ts';
import {shapeDef, shapeIcon, SHAPES_SHOWN} from './shapes.ts';
import type {Handle, P, Tool} from './edit.ts';
import {MadoriPrint} from './MadoriPrint.tsx';
import {bounds, circled, emptyMadori, hasMadori, joLabel, legendLines, legendText, lineLength, mid, MODULES, numberItems, railPts, railSegs, roomAreaOf, snapStep, withFloor} from './model.ts';
import type {Madori, MFloor, MItem, Module} from './model.ts';
import {floorSvg, patternDefs, thumbSvg, viewOf} from './render.ts';
import {placeLookup, planSvg, sheetFloors, svgToPng} from './sheet.ts';

type Cat = 'room' | 'stair' | 'door' | 'fix' | 'furn' | 'kaishu' | 'draw';
// 道具の種類（マイホームクラウドと同じく 部屋・階段・間口・住設・家具。ユーザーの指示 2026-11-10。前は 部屋・建具・窓・設備・階段）
const CATS: [Cat, string][] = [
  ['room', '部屋'],
  ['stair', '階段'],
  ['door', '間口'],
  ['fix', '住設'],
  ['furn', '家具'],
  ['kaishu', '改修'],
  ['draw', '作図'],
];

/** 絵のボタン（階段・間口・住設・家具。マイホームクラウドの一覧と同じく、絵の下に名前） */
function PicBtn({on, onClick, svg, label}: {on: boolean; onClick: () => void; svg: string; label: string}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex min-w-0 flex-col items-stretch rounded-md border bg-white p-1 text-[11px] leading-tight transition ${on ? 'border-emerald-700 ring-2 ring-emerald-500' : 'border-slate-300 hover:bg-slate-50'}`}
    >
      <span className="block h-14 [&>svg]:h-full [&>svg]:w-full" aria-hidden dangerouslySetInnerHTML={{__html: svg}} />
      <span className="mt-0.5 truncate rounded bg-slate-100 px-0.5 py-0.5 text-center text-slate-700">{label}</span>
    </button>
  );
}

type View = {x: number; y: number; k: number}; // 左上（mm）と倍率（1mm が何 px）
/** 画面の上でなぞった点（px）と時刻（ぐしゃぐしゃに書いたかを見る） */
type SP = {x: number; y: number; t: number};
type Drag =
  | {mode: 'create'; a: P; sx: number; sy: number; path: P[]; sp: SP[]} // path：なぞった道（手すりの一筆の L 字・曲げた棒）
  | {mode: 'move'; orig: MItem; a: P; sx: number; sy: number; before: Madori; moved: boolean; sp: SP[]}
  | {mode: 'resize'; orig: MItem; h: Handle; before: Madori}
  | {mode: 'pan'; sx: number; sy: number; v0: View; sp?: SP[]}
  | {mode: 'erase'; sp: SP[]; v0: View} // ぐしゃぐしゃに書いて消している（v0＝書き始めたときの見え方）
  | {mode: 'under'; a: P; before: Madori; u0: {x: number; y: number}}
  | {mode: 'pinch'; d0: number; c0: {x: number; y: number}; v0: View};

/** 最近使った図形（この端末の localStorage） */
const RECENT_SHAPES = 'taiyo-madori-recent-shapes';

/** 番号の道具で置ける番号（ユーザーの指示「番号1番から自動で2.3.4.5、15まで」2026-11-10） */
const NUM_MAX = 15;

/** 白紙の平面図・新しい階で、初めに選んでおく道具（いちばん描くことの多い部屋） */
const FIRST_ROOM: Tool = {t: 'room', type: '洋室'};
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const KIND_LABEL: Record<MItem['kind'], string> = {
  room: '部屋',
  door: '建具',
  window: '窓',
  fix: '設備・家具',
  stair: '階段',
  rail: '手すり',
  vrail: '縦手すり',
  step: '段差の解消',
  num: '番号',
  text: '文字',
  line: '線',
  dim: '寸法線',
  shape: '図形',
};

/** 道具のボタン（選んでいる道具は濃い枠） */
function ToolBtn({on, onClick, children, className = '', title}: {on: boolean; onClick: () => void; children: ReactNode; className?: string; title?: string}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 rounded-md border px-1.5 py-1 text-center text-[13px] leading-tight whitespace-pre-line transition ${on ? 'border-emerald-700 ring-2 ring-emerald-500' : 'hover:brightness-95'} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * 方眼の下と右のスクロールバー（ユーザーの指示「下のスクロールで位置を移動できるようにする」2026-11-10）：描いたものと、そのまわり 3m ほどの範囲を
 * 動かせる。つまみをドラッグで動かす・バーの空いた所を押すと1画面ぶん動く
 */
function ScrollBars({view, vw, vh, range, onMove}: {view: View; vw: number; vh: number; range: {x: number; y: number; w: number; h: number}; onMove: (x: number, y: number) => void}) {
  const bar = (horiz: boolean) => {
    const total = horiz ? range.w : range.h;
    const size = horiz ? vw : vh;
    const at = horiz ? view.x - range.x : view.y - range.y;
    const start = Math.max(0, Math.min(1, at / total));
    const len = Math.max(0.06, Math.min(1, size / total));
    const go = (mm: number) => (horiz ? onMove(mm, view.y) : onMove(view.x, mm));
    return (
      <div
        role="scrollbar"
        aria-orientation={horiz ? 'horizontal' : 'vertical'}
        aria-label={horiz ? '横に動かす' : '縦に動かす'}
        aria-valuenow={Math.round(start * 100)}
        className={`absolute z-[5] rounded-full bg-slate-100/80 ${horiz ? 'bottom-0.5 left-2 right-5 h-3' : 'bottom-5 right-0.5 top-2 w-3'}`}
        onPointerDown={(e) => {
          // 空いた所を押したら、そちらへ1画面ぶん
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          const pos = horiz ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
          go((horiz ? view.x : view.y) + (pos < start ? -size : size));
        }}
      >
        <div
          data-scroll-thumb={horiz ? 'x' : 'y'}
          className="absolute rounded-full bg-slate-400 hover:bg-slate-500"
          style={horiz ? {left: `${start * 100}%`, width: `${len * 100}%`, top: 0, bottom: 0} : {top: `${start * 100}%`, height: `${len * 100}%`, left: 0, right: 0}}
          onPointerDown={(e) => {
            e.stopPropagation();
            const el = e.currentTarget;
            el.setPointerCapture(e.pointerId);
            const track = el.parentElement!.getBoundingClientRect();
            const px0 = horiz ? e.clientX : e.clientY;
            const mm0 = horiz ? view.x : view.y;
            const per = total / (horiz ? track.width : track.height); // 1px が何 mm
            const move = (ev: PointerEvent) => go(mm0 + ((horiz ? ev.clientX : ev.clientY) - px0) * per);
            const up = () => {
              el.removeEventListener('pointermove', move);
              el.removeEventListener('pointerup', up);
              el.removeEventListener('pointercancel', up);
            };
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerup', up);
            el.addEventListener('pointercancel', up);
          }}
        />
      </div>
    );
  };
  return (
    <>
      {bar(true)}
      {bar(false)}
    </>
  );
}

/** mm の数の欄（打ち終わって Enter・欄を離れたときに入れる） */
function MmInput({value, onChange, label, min = 10}: {value: number; onChange: (v: number) => void; label: string; min?: number}) {
  const [text, setText] = useState(String(Math.round(value)));
  useEffect(() => setText(String(Math.round(value))), [value]);
  const commit = () => {
    const v = Number(text.normalize('NFKC').replace(/[^\d.]/g, ''));
    if (Number.isFinite(v) && v >= min) onChange(Math.round(v));
    else setText(String(Math.round(value)));
  };
  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="w-14 shrink-0 text-slate-600">{label}</span>
      <input
        inputMode="numeric"
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="h-9 w-24 rounded-md border border-slate-300 bg-white px-2 text-right outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      <span className="text-slate-500">mm</span>
    </label>
  );
}

/**
 * embed：住宅改修申請書の平面図の枠から開いたとき（ShinseiEditor.tsx。ユーザーの指示「平面図はここで作成できるようにする」2026-11-10）。
 * 上の段は「✓ 申請書の平面図に入れる」「✕ 閉じる」だけ。描いたものは平面図のタブと同じ様邸の平面図（Job.madori）に残る
 */
export function MadoriEditor({job, data, update, onBack, docs, embed}: {job: Job; data: AppData; update: Update; onBack: () => void; docs?: JobDocs; embed?: {onDone: () => void}}) {
  const s = data.settings;
  const toast = useToast();
  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const blank = useMemo(() => emptyMadori(), [job.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = job.madori ?? blank;
  const [draft, setDraft] = useState<Madori | null>(null);
  const m = draft ?? base;
  const [floorId, setFloorId] = useState(m.floors[0].id);
  const floor = m.floors.find((f) => f.id === floorId) ?? m.floors[0];
  const items = floor.items;
  const step = snapStep(m);
  // 白紙の平面図は、開いたときから部屋（洋室）を選んでおく。前は「選ぶ・動かす」だったので、方眼をなぞっても図が動くだけで
  // 何も描けないように見えた（ユーザーの話「平面図はかけるようになっていますか？なっていないようにみえます」2026-11-10）
  const [tool, setTool] = useState<Tool>(() => (m.floors[0].items.length ? {t: 'select'} : FIRST_ROOM));
  const [cat, setCat] = useState<Cat>('room');
  const [sel, setSel] = useState<string | null>(null);
  const selItem = items.find((it) => it.id === sel) ?? null;
  const [preview, setPreview] = useState<MItem | null>(null); // 作っている途中・置く前の部品
  const [trail, setTrail] = useState<{pts: P[]; erase: boolean} | null>(null); // なぞっている道（手すり）・ぐしゃぐしゃに書いている道
  const [printing, setPrinting] = useState(false);
  // 携帯・狭い画面（道具の一覧が方眼の上に来る幅）では、タブを開いたら道具と方眼が見える所までスクロールする。
  // 前は上のタブ・ボタンで画面がうまり、方眼が2画面ぶん下に隠れていた（2026-11-10）
  const paletteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia?.('(max-width: 1023.98px)').matches) return;
    // 道具の一覧の上から見せて、方眼（とすぐ上の描く道具の段）が画面の下にはみ出すなら、方眼の下の端まで見える所へ
    const id = window.requestAnimationFrame(() => {
      paletteRef.current?.scrollIntoView({block: 'start'});
      const box = boxRef.current;
      if (box && box.getBoundingClientRect().bottom > window.innerHeight) box.scrollIntoView({block: 'end'});
    });
    return () => window.cancelAnimationFrame(id);
  }, []);
  const [busy, setBusy] = useState(false);
  const [underMove, setUnderMove] = useState(false); // 下絵を動かす
  const look = useMemo(() => placeLookup(job, s), [job, s]);
  const nums = useMemo(() => numberItems(m.floors, look.no), [m.floors, look]);
  // 番号の道具で次に置く番号（この階の終わりに足したときの番号。階をまたいで通し番号なので、数えて決める）
  const nextNo = useMemo(() => {
    const probe: MItem = {id: '__next', kind: 'num', x: 0, y: 0, w: 0, h: 0};
    return numberItems(m.floors.map((f) => (f.id === floor.id ? {...f, items: [...f.items, probe]} : f)), look.no).get('__next') ?? 1;
  }, [m.floors, floor.id, look]);

  // 元に戻す・やり直す（Ctrl+Z・Ctrl+Y。この画面を開いているあいだ）
  const hist = useRef<{past: Madori[]; future: Madori[]}>({past: [], future: []});
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const save = (next: Madori, before: Madori = base) => {
    hist.current.past.push(before);
    if (hist.current.past.length > 100) hist.current.past.shift();
    hist.current.future = [];
    setJob((j) => ({...j, madori: {...next, updatedAt: Date.now()}}));
    bump();
  };
  const change = (fn: (mm: Madori) => Madori) => save(fn(base));
  const editItems = (fn: (list: MItem[]) => MItem[]) => change((mm) => withFloor(mm, floor.id, fn));
  const setItem = (id: string, patch: Partial<MItem> | ((it: MItem) => MItem)) => editItems((list) => list.map((it) => (it.id === id ? (typeof patch === 'function' ? patch(it) : {...it, ...patch}) : it)));
  const undo = () => {
    const prev = hist.current.past.pop();
    if (!prev) return;
    hist.current.future.push(base);
    setJob((j) => ({...j, madori: prev}));
    bump();
  };
  const redo = () => {
    const next = hist.current.future.pop();
    if (!next) return;
    hist.current.past.push(base);
    setJob((j) => ({...j, madori: next}));
    bump();
  };
  const remove = (id: string) => {
    editItems((list) => list.filter((it) => it.id !== id));
    setSel(null);
  };

  // ---------------------------------------------------------------- 方眼の大きさと表示の範囲
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({w: 900, h: 600});
  const [view, setView] = useState<View | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight)}));
    ro.observe(el);
    setSize({w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight)});
    return () => ro.disconnect();
  }, []);
  const fitTo = (list: MItem[], sz = size) => {
    const v = list.length ? viewOf(list, 900) : {x: -m.module, y: -m.module, w: m.module * 14, h: m.module * 10};
    const k = Math.min(sz.w / v.w, sz.h / v.h);
    setView({k, x: v.x - (sz.w / k - v.w) / 2, y: v.y - (sz.h / k - v.h) / 2});
  };
  // 開いたとき・階を替えたとき・画面の大きさが変わったとき（スマホを横にした・窓を広げた）は、描いてあるもの全体が見えるように
  useEffect(() => {
    fitTo(items);
  }, [floor.id, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = view ?? {x: 0, y: 0, k: 0.08};
  const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2) =>
    setView((cur) => {
      const c = cur ?? v;
      const k = Math.min(1.5, Math.max(0.01, c.k * factor));
      const mx = c.x + cx / c.k;
      const my = c.y + cy / c.k;
      return {k, x: mx - cx / k, y: my - cy / k};
    });

  // ホイール：拡大・縮小（下へ回すと方眼が小さく＝遠く、上へ回すと大きく＝近く。マウスのある所を中心に。マイホームクラウドと同じ。
  // ユーザーの指示「スクロールしたら、方眼紙を細かくして、一つ一つを小さくする。とおくする」2026-11-10。前は動かすだった）。
  // Shift＋ホイール・トラックパッドの横へのすべらせは横に動かす。動かすのは、何もない所をドラッグ・2本の指。ページはスクロールしない
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // 行・ページ単位で来るマウスもある
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.shiftKey || (!e.ctrlKey && !e.metaKey && Math.abs(dx) > Math.abs(dy))) {
        const d = e.shiftKey && !dx ? dy : dx;
        setView((cur) => (cur ? {...cur, x: cur.x + d / cur.k} : cur));
        return;
      }
      zoomAt(Math.exp(-dy * (e.ctrlKey || e.metaKey ? 0.0025 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---------------------------------------------------------------- 図の上でそのまま文字を打つ（Excel のテキストボックス・セルと同じ。ユーザーの指示
  // 「EXCELみたいに、文字をそのまま書き込めるようにする」2026-11-10）：「文字」の道具で押した所・ダブルクリック・F2・Enter で、その所に入力欄を開く。
  // 部屋・文字を選んだまま打ち始めると、その字から書きかえる（日本語入力の1字目も入るように、入力欄は選んでいるあいだずっと置いておき、打ったときにすぐ移る）。
  // Enter で決める（Shift＋Enter・Alt＋Enter は改行。部屋の名前は1行）、Esc でやめる、ほかを押しても決まる
  const [editing, setEditingState] = useState<{id: string; value: string; fresh?: MItem} | null>(null);
  // いま打っている内容（Enter で決めたすぐあとの「入力欄から離れた」で、もう一度決めないように。前は文字が2つ重なった）
  const editingRef = useRef(editing);
  const setEditing = (next: typeof editing | ((cur: typeof editing) => typeof editing)) => {
    const v2 = typeof next === 'function' ? next(editingRef.current) : next;
    editingRef.current = v2;
    setEditingState(v2);
  };
  const editRef = useRef<HTMLTextAreaElement>(null);
  const editItem = editing ? (editing.fresh ?? items.find((it) => it.id === editing.id) ?? null) : null;
  const canType = (it: MItem | null): it is MItem => !!it && (it.kind === 'text' || it.kind === 'room');
  const startEdit = (it: MItem, value?: string, fresh?: MItem) => {
    setSel(fresh ? null : it.id);
    setEditing({id: it.id, value: value ?? (it.kind === 'room' ? it.label?.trim() || it.type || '' : (it.label ?? '')), fresh});
    editRef.current?.focus(); // 打ったキーの字（日本語入力も）がこの入力欄に入るように、その場で移る
  };
  const commitEdit = () => {
    const e = editingRef.current;
    if (!e) return;
    setEditing(null);
    const text = e.value.replace(/[ \t\n\r\u3000]+$/, '');
    if (e.fresh) {
      if (!text.trim()) return; // 何も打たなければ置かない
      editItems((list) => [...list, {...e.fresh!, label: text}]);
      setSel(e.fresh.id);
      return;
    }
    const it = items.find((o) => o.id === e.id);
    if (!it) return;
    if (it.kind === 'room') {
      const name = text.trim();
      const label = !name || name === it.type ? undefined : name;
      if (label !== it.label) setItem(it.id, {label});
    } else if (!text.trim()) remove(it.id);
    else if (text !== it.label) setItem(it.id, {label: text});
  };
  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 回すつまみ（Excel の図形と同じく、選んだ図形の上のまん中の ↻。押すと 90°回る。ユーザーの指示「図形は回転できるようにする」2026-11-10）
  const canTurn = (it: MItem | null): it is MItem => !!it && it.kind !== 'num' && it.kind !== 'text' && it.kind !== 'vrail';
  const turnHandle = (it: MItem) => {
    const b = bounds(it);
    return {x: b.x + b.w / 2, y: b.y - 28 / v.k};
  };

  // ---------------------------------------------------------------- 部屋を頂点で描く（マイホームクラウドの「部屋入力」と同じ。ドラッグは四角＝枠囲み）：
  // 部屋の種類を選んで、角を順に押す（辺は横・縦にそろう）。はじめの点を押す・ダブルクリック・Enter で閉じる、Backspace で1つ戻す、Esc でやめる
  const [poly, setPoly] = useState<P[] | null>(null);
  const [polyHover, setPolyHover] = useState<P | null>(null);
  const finishPoly = (pts: P[] | null = poly) => {
    setPoly(null);
    setPolyHover(null);
    if (!pts || pts.length < 3 || tool.t !== 'room') return;
    const sh = shapeOf(closed(pts));
    if (sh.w < step || sh.h < step) return;
    const it: MItem = {id: mid(), kind: 'room', type: tool.type, ...sh};
    editItems((list) => [...list, it]);
    setSel(it.id);
    setTool({t: 'select'});
  };
  const polyClick = (p: P) => {
    const q = snapPt(p, step);
    if (!poly) {
      setPoly([q]);
      return;
    }
    const last = poly[poly.length - 1];
    const r = orthoNext(last, q);
    // はじめの点（のそば）を押したら閉じる
    if (poly.length >= 3 && Math.hypot(q.x - poly[0].x, q.y - poly[0].y) <= Math.max(step, 12 / v.k)) {
      finishPoly(poly);
      return;
    }
    if (r.x === last.x && r.y === last.y) return;
    setPoly([...poly, r]);
  };

  // ---------------------------------------------------------------- 押す・ドラッグ
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, {x: number; y: number}>());
  const toMm = (cx: number, cy: number): P => {
    const r = svgRef.current!.getBoundingClientRect();
    return {x: v.x + (cx - r.left) / v.k, y: v.y + (cy - r.top) / v.k};
  };
  const toMmAt = (cx: number, cy: number, vv: View): P => {
    const r = svgRef.current!.getBoundingClientRect();
    return {x: vv.x + (cx - r.left) / vv.k, y: vv.y + (cy - r.top) / vv.k};
  };
  const ctx = {items, module: m.module, step, tol: 12 / v.k}; // tol：なぞった道を間引く幅（画面の 12px）
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pointers.current.size === 2) {
      // 2本の指：つまんで拡大・縮小、ずらして動かす（作りかけ・動かしかけはやめる）
      const [a, b] = [...pointers.current.values()];
      setDraft(null);
      setPreview(null);
      drag.current = {mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), c0: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, v0: v};
      return;
    }
    const p = toMm(e.clientX, e.clientY);
    if (e.button === 1) {
      drag.current = {mode: 'pan', sx: e.clientX, sy: e.clientY, v0: v};
      return;
    }
    const sp: SP[] = [{x: e.clientX, y: e.clientY, t: e.timeStamp}];
    if (tool.t !== 'select') {
      drag.current = {mode: 'create', a: p, sx: e.clientX, sy: e.clientY, path: [p], sp};
      if (!(tool.t === 'room' && poly)) setPreview(makeItem(tool, p, p, true, ctx));
      return;
    }
    const tol = 10 / v.k;
    if (canTurn(selItem)) {
      const th = turnHandle(selItem);
      if (Math.hypot(th.x - p.x, th.y - p.y) <= tol * 1.4) {
        setItem(selItem.id, (it) => turnedItem(it, step));
        return;
      }
    }
    if (selItem) {
      const hd = handlesOf(selItem).find((hh) => Math.hypot(hh.x - p.x, hh.y - p.y) <= tol);
      if (hd) {
        drag.current = {mode: 'resize', orig: selItem, h: hd.h, before: base};
        return;
      }
    }
    const hit = hitTest(items, p, tol);
    if (hit) {
      setSel(hit.id);
      drag.current = {mode: 'move', orig: hit, a: p, sx: e.clientX, sy: e.clientY, before: base, moved: false, sp};
      return;
    }
    setSel(null);
    if (underMove && floor.underlay) drag.current = {mode: 'under', a: p, before: base, u0: {x: floor.underlay.x, y: floor.underlay.y}};
    else drag.current = {mode: 'pan', sx: e.clientX, sy: e.clientY, v0: v, sp};
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const d = drag.current;
    if (d?.mode === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const r = svgRef.current!.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const c = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      const k = Math.min(1.5, Math.max(0.01, d.v0.k * (dist / (d.d0 || 1))));
      const mx = d.v0.x + (d.c0.x - r.left) / d.v0.k;
      const my = d.v0.y + (d.c0.y - r.top) / d.v0.k;
      setView({k, x: mx - (c.x - r.left) / k, y: my - (c.y - r.top) / k});
      return;
    }
    // ぐしゃぐしゃに書いた（線・図形を消すしぐさ。写真の書き込みのペンと同じ）：描く道具では書き始めから、選ぶ・動かすでは
    // 動かしているあいだの直近 1.5 秒（ゆっくり位置を直すのを消すしぐさとまちがえないように）。作りかけ・動かしかけ・ずらした図はやめて、消す道を見せる
    if (d?.mode === 'erase') {
      d.sp.push({x: e.clientX, y: e.clientY, t: e.timeStamp});
      setTrail({pts: d.sp.map((q) => toMmAt(q.x, q.y, d.v0)), erase: true});
      return;
    }
    if (d && (d.mode === 'create' || d.mode === 'move' || (d.mode === 'pan' && d.sp))) {
      const sp = d.sp!;
      sp.push({x: e.clientX, y: e.clientY, t: e.timeStamp});
      if (isScribble(d.mode === 'create' ? sp : sp.filter((q) => q.t >= e.timeStamp - 1500))) {
        const v0 = d.mode === 'pan' ? d.v0 : v;
        if (d.mode === 'pan') setView(d.v0);
        setDraft(null);
        setPreview(null);
        drag.current = {mode: 'erase', sp, v0};
        setTrail({pts: sp.map((q) => toMmAt(q.x, q.y, v0)), erase: true});
        return;
      }
    }
    const p = toMm(e.clientX, e.clientY);
    if (!d && poly) {
      setPolyHover(orthoNext(poly[poly.length - 1], snapPt(p, step)));
      return;
    }
    if (d?.mode === 'create' && tool.t === 'room' && poly) return;
    if (!d) {
      // 押す前：置く道具は、置く所（壁に吸い付いた所）を薄く見せる
      if (tool.t !== 'select' && !DRAG_TOOLS.includes(tool.t) && e.pointerType === 'mouse') setPreview(makeItem(tool, p, p, true, ctx));
      return;
    }
    if (d.mode === 'create') {
      const click = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6;
      d.path.push(p);
      setPreview(makeItem(tool, d.a, p, DRAG_TOOLS.includes(tool.t) ? click : true, {...ctx, path: d.path}));
      if (tool.t === 'rail' && !click) setTrail({pts: [...d.path], erase: false}); // なぞった道を薄く（曲げた所が分かるように）
    } else if (d.mode === 'move') {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.moved = true;
      const next = moved(d.orig, {x: p.x - d.a.x, y: p.y - d.a.y}, items, step);
      setDraft(withFloor(d.before, floor.id, (list) => list.map((it) => (it.id === d.orig.id ? next : it))));
    } else if (d.mode === 'resize') {
      const next = resized(d.orig, d.h, p, step);
      setDraft(withFloor(d.before, floor.id, (list) => list.map((it) => (it.id === d.orig.id ? next : it))));
    } else if (d.mode === 'pan') {
      setView({...d.v0, x: d.v0.x - (e.clientX - d.sx) / d.v0.k, y: d.v0.y - (e.clientY - d.sy) / d.v0.k});
    } else if (d.mode === 'under' && floor.underlay) {
      const u = floor.underlay;
      const x = Math.round(d.u0.x + p.x - d.a.x);
      const y = Math.round(d.u0.y + p.y - d.a.y);
      setDraft({...d.before, floors: d.before.floors.map((f) => (f.id === floor.id ? {...f, underlay: {...u, x, y}} : f))});
    }
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.mode === 'pinch') {
      if (pointers.current.size === 0) drag.current = null;
      return;
    }
    drag.current = null;
    setTrail(null);
    if (!d) return;
    if (d.mode === 'erase') {
      // 上を通った線・図形・手すり・番号・文字を消す（部屋・建具・設備は消さない。戻すで元に戻る）
      const ids = new Set(scribbleHits(items, d.sp.map((q) => toMmAt(q.x, q.y, d.v0)), 12 / d.v0.k));
      if (ids.size) {
        editItems((list) => list.filter((it) => !ids.has(it.id)));
        setSel(null);
        toast(`${ids.size}つ消しました`);
      }
      return;
    }
    if (d.mode === 'create') {
      const p = toMm(e.clientX, e.clientY);
      const click = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6;
      if (tool.t === 'room' && (click || poly)) {
        // 部屋の道具で押しただけ（ドラッグでない）は、角を1つ置く（頂点で描く）
        setPreview(null);
        polyClick(poly ? p : d.a);
        return;
      }
      const it = makeItem(tool, d.a, p, DRAG_TOOLS.includes(tool.t) ? click : true, {...ctx, path: [...d.path, p]});
      setPreview(null);
      if (!it) {
        if (tool.t === 'door' || tool.t === 'window') toast('部屋の壁の近くを押してください', 'error');
        return;
      }
      if (it.kind === 'num' && !it.place) {
        // 番号は続けて置ける（①のあと②③…。⑮まで）。⑮を置いたら選ぶ・動かすに戻る
        if (nextNo > NUM_MAX) {
          toast(`番号は${circled(NUM_MAX)}までです`, 'error');
          setTool({t: 'select'});
          return;
        }
        if (nextNo >= NUM_MAX) setTool({t: 'select'});
        editItems((list) => [...list, it]);
        setSel(it.id);
        return;
      }
      setTool({t: 'select'});
      if (it.kind === 'text') {
        startEdit(it, '', it); // 押した所にすぐ打つ（打ち終わってから図に置く）
        return;
      }
      editItems((list) => [...list, it]);
      setSel(it.id);
    } else if ((d.mode === 'move' || d.mode === 'resize' || d.mode === 'under') && draft) {
      save(draft, d.before);
      setDraft(null);
    }
  };

  // ---------------------------------------------------------------- キー（Excel・マイホームクラウドと同じ）
  const clip = useRef<MItem | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || printing) return;
      if (document.querySelector('[role="dialog"]')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (poly) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishPoly();
        } else if (e.key === 'Escape') {
          setPoly(null);
          setPolyHover(null);
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          setPoly(poly.length > 1 ? poly.slice(0, -1) : null);
        }
        return;
      }
      if (ctrl && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (ctrl && key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setTool({t: 'select'});
        setPreview(null);
        setSel(null);
      } else if (!selItem) {
        return;
      } else if (canType(selItem) && !ctrl && !e.altKey && (e.key === 'F2' || e.key === 'Enter')) {
        e.preventDefault();
        startEdit(selItem);
      } else if (canType(selItem) && !ctrl && !e.altKey && ((e.key.length === 1 && e.key !== ' ') || e.key === 'Process')) {
        // 打ち始め：その字から書きかえる（Excel のセルと同じ）。日本語入力（Process）は入力欄で変換が始まるので、字は入れない
        if (e.key !== 'Process') e.preventDefault();
        startEdit(selItem, e.key === 'Process' ? '' : e.key);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(selItem.id);
      } else if (ctrl && key === 'c') {
        clip.current = selItem;
      } else if (ctrl && (key === 'v' || key === 'd')) {
        e.preventDefault();
        const src = key === 'd' ? selItem : clip.current;
        if (!src) return;
        const c = copied(src, step);
        editItems((list) => [...list, c]);
        setSel(c.id);
      } else if (key === 'r' && !ctrl) {
        setItem(selItem.id, (it) => turnedItem(it, step));
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const a = e.shiftKey ? 10 : step;
        const dx = e.key === 'ArrowLeft' ? -a : e.key === 'ArrowRight' ? a : 0;
        const dy = e.key === 'ArrowUp' ? -a : e.key === 'ArrowDown' ? a : 0;
        setItem(selItem.id, (it) => ({...it, x: it.x + dx, y: it.y + dy}));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- 階
  const addFloor = () => {
    const f: MFloor = {id: mid(), name: `${m.floors.length + 1}階`, items: []};
    change((mm) => ({...mm, floors: [...mm.floors, f], updatedAt: Date.now()}));
    setFloorId(f.id);
    setSel(null);
    setTool(FIRST_ROOM); // 新しい階も、すぐ部屋を描ける
    setCat('room');
  };
  const removeFloor = () => {
    if (m.floors.length < 2) return;
    if (floor.items.length && !window.confirm(`${floor.name}を消しますか？（描いた部屋・手すりも消えます）`)) return;
    const rest = m.floors.filter((f) => f.id !== floor.id);
    change((mm) => ({...mm, floors: rest, updatedAt: Date.now()}));
    setFloorId(rest[0].id);
  };
  const lower = m.floors[m.floors.findIndex((f) => f.id === floor.id) - 1]; // 下の階（2階を描くとき、うすく見せる）

  // ---------------------------------------------------------------- 下絵
  const underUrls = usePhotoUrls(floor.underlay ? [floor.underlay.photo] : []);
  const underUrl = floor.underlay ? underUrls[floor.underlay.photo]?.url : undefined;
  const fileRef = useRef<HTMLInputElement>(null);
  const putUnderlay = async (file: File) => {
    setBusy(true);
    try {
      let src: Blob = file;
      if (isPdf(file)) {
        const {pdfToImages} = await import('../pdfText.ts');
        const [first] = await pdfToImages(new Uint8Array(await file.arrayBuffer()), 1600, 1);
        if (!first) throw new Error('no page');
        src = first;
      }
      const {blob, w, h} = await preparePhoto(src);
      const id = await putPhoto({blob, w, h});
      rememberPhotoUrl(id, blob, w, h);
      const width = m.module * 12;
      change((mm) => ({...mm, floors: mm.floors.map((f) => (f.id === floor.id ? {...f, underlay: {photo: id, x: 0, y: 0, w: width, h: Math.round((width * h) / w), opacity: 0.4}} : f)), updatedAt: Date.now()}));
      setUnderMove(true);
      fitTo([...items, {id: 'u', kind: 'room', x: 0, y: 0, w: width, h: (width * h) / w}]);
    } catch {
      toast(`「${file.name}」を読めませんでした`, 'error');
    } finally {
      setBusy(false);
    }
  };
  const setUnderlay = (patch: Partial<NonNullable<MFloor['underlay']>> | null) =>
    change((mm) => ({
      ...mm,
      floors: mm.floors.map((f) => {
        if (f.id !== floor.id) return f;
        if (!patch) {
          const {underlay: _u, ...rest} = f;
          return rest;
        }
        return f.underlay ? {...f, underlay: {...f.underlay, ...patch}} : f;
      }),
      updatedAt: Date.now(),
    }));

  // ---------------------------------------------------------------- 申請書の平面図の枠に入れる
  const usePlan = async () => {
    if (!hasMadori(m)) return;
    // 申請書の枠から開いたときは、入れるために開いたので、消える書き込みがあるときだけ確かめる
    const ask = embed ? !!job.planMarks?.length : !!job.planPhoto;
    if (ask && !window.confirm('申請書の平面図を、この平面図に差し替えますか？（前の図への書き込みは消えます）')) return;
    setBusy(true);
    try {
      const p = planSvg(m, sheetFloors(m), look.no, 'ap');
      const {blob, w, h} = await svgToPng(p.svg, p.w, p.h, 2400, 'image/jpeg');
      const id = await putPhoto({blob, w, h});
      rememberPhotoUrl(id, blob, w, h);
      setJob(({planMarks: _marks, ...j}) => ({...j, planPhoto: id}));
      toast('申請書の平面図に入れました');
      embed?.onDone();
    } catch {
      toast('平面図を絵にできませんでした', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- 絵
  const shown = preview && drag.current?.mode !== 'move' ? [...items, preview] : items;
  const art = useMemo(() => floorSvg(shown, {module: m.module, showArea: m.showArea, showDims: m.showDims, nums, pid: 'ed'}), [shown, m.module, m.showArea, m.showDims, nums]);
  const lowerArt = useMemo(() => (lower ? floorSvg(lower.items, {module: m.module, showArea: false, showDims: false, nums: new Map(), pid: 'ed'}) : ''), [lower, m.module]);
  const vw = size.w / v.k;
  const vh = size.h / v.k;
  const minor = step * v.k >= 7 ? step : m.module;
  const px = 1 / v.k; // 1px の mm
  const gridDefs =
    `<pattern id="ed-g1" width="${minor}" height="${minor}" patternUnits="userSpaceOnUse"><path d="M${minor} 0H0V${minor}" fill="none" stroke="#e6ebf2" stroke-width="${px}"/></pattern>` +
    `<pattern id="ed-g2" width="${m.module}" height="${m.module}" patternUnits="userSpaceOnUse"><path d="M${m.module} 0H0V${m.module}" fill="none" stroke="#c3cedb" stroke-width="${px * 1.2}"/></pattern>`;
  const legend = legendLines({floors: m.floors}, look.no, look.line);
  const area = floorArea(items);
  const total = m.floors.reduce((a, f) => a + floorArea(f.items), 0);
  const insurer = jobInsurer(job);
  const placed = new Set(m.floors.flatMap((f) => f.items.map((it) => it.place).filter(Boolean)));

  // ---------------------------------------------------------------- 左の道具
  const pick = (t: Tool) => {
    setTool(t); // 同じ道具をもう一度押しても外さない（前は外れて「選ぶ・動かす」になり、なぞっても描けなかった）
    setSel(null);
    setPreview(null);
    if (t.t !== 'room') setPoly(null); // 部屋の種類を替えるだけなら、描いている頂点はそのまま
  };
  const isTool = (t: Tool) => JSON.stringify(tool) === JSON.stringify(t);
  // 図形の一覧（Excel の「図形 ▼」）と、最近使った図形（この端末に覚える。読めなくても動く）
  const [shapeOpen, setShapeOpen] = useState(false);
  const shapeBarRef = useRef<HTMLDivElement>(null);
  const [recentShapes, setRecentShapes] = useState<string[]>(() => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(RECENT_SHAPES) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!shapeDef(x) && !shapeDef(x)?.hidden).slice(0, 10) : [];
    } catch {
      return [];
    }
  });
  const pickShape = (name: string) => {
    pick({t: 'shape', type: name});
    setShapeOpen(false);
    const next = [name, ...recentShapes.filter((x) => x !== name)].slice(0, 10);
    setRecentShapes(next);
    try {
      localStorage.setItem(RECENT_SHAPES, JSON.stringify(next));
    } catch {
      /* 覚えられなくても図形は使える */
    }
  };
  useEffect(() => {
    if (!shapeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!shapeBarRef.current?.contains(e.target as Node)) setShapeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShapeOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [shapeOpen]);
  // 一覧の絵（部品ごとの SVG。一度だけ作る）
  const thumbs = useMemo(() => {
    const by = <T extends {name: string}>(list: T[], f: (x: T) => string) => Object.fromEntries(list.map((x) => [x.name, f(x)])) as Record<string, string>;
    return {
      door: by(DOOR_TYPES, (d) => thumbSvg('door', d.name, d.w, 0)),
      window: by(WINDOW_TYPES, (d) => thumbSvg('window', d.name, d.w, 0)),
      fix: by(FIX_TYPES, (f) => thumbSvg('fix', f.name, f.w, f.h)),
      stair: by(STAIR_TYPES, (d) => thumbSvg('stair', d.name, d.size[0] * 910, d.size[1] * 910)),
    };
  }, []);
  const palette = (
    <div className="flex min-h-0 flex-col gap-2">
      <ToolBtn on={tool.t === 'select'} onClick={() => setTool({t: 'select'})} className="bg-white text-sm font-bold">
        ↖ 選ぶ・動かす
      </ToolBtn>
      <div role="tablist" aria-label="道具の種類" className="grid grid-cols-3 gap-1">
        {CATS.map(([c, label]) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`rounded-md px-1 py-1.5 text-xs font-bold ${cat === c ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>
      {/* スマホ・タブレットは方眼の上に出すので、低い箱の中でスクロール（部屋の一覧が長く、方眼が下に行きすぎた） */}
      <div className="min-h-0 overflow-y-auto pr-0.5 max-lg:max-h-40 lg:max-h-[calc(100vh-17rem)]">
        {cat === 'room' &&
          ROOM_ROWS.map((row, ri) => (
          <div key={ri} className="mb-1.5 grid grid-cols-3 gap-1 max-lg:grid-cols-4">
            {row.map((r) => (
              <ToolBtn
                key={r.name}
                on={isTool({t: 'room', type: r.name})}
                onClick={() => pick({t: 'room', type: r.name})}
                // 1行が5字をこえる名前（ウォークイン・クローゼット）は字を小さく（ボタンの中で折れて3行になった）
                className={`${r.tone.cls} ${Math.max(...(ROOM_SHORT[r.name] ?? r.name).split('\n').map((l) => l.length)) > 4 ? '!px-0.5 !text-[11px]' : ''}`}
                title={r.name}
              >
                {ROOM_SHORT[r.name] ?? r.name}
              </ToolBtn>
            ))}
          </div>
          ))}
        {cat === 'door' && (
          <div className="grid grid-cols-2 gap-1 max-lg:grid-cols-4">
            {DOOR_TYPES.map((d) => (
              <PicBtn key={d.name} on={isTool({t: 'door', type: d.name})} onClick={() => pick({t: 'door', type: d.name})} svg={thumbs.door[d.name]} label={d.name} />
            ))}
            {WINDOW_TYPES.map((d) => (
              <PicBtn key={d.name} on={isTool({t: 'window', type: d.name})} onClick={() => pick({t: 'window', type: d.name})} svg={thumbs.window[d.name]} label={d.name} />
            ))}
          </div>
        )}
        {(cat === 'fix' || cat === 'furn') &&
          (cat === 'fix' ? (['住設'] as const) : (['家具', '福祉'] as const)).map((g) => (
            <div key={g} className="mb-2">
              {g === '福祉' && <div className="mb-1 text-xs font-bold text-slate-500">福祉用具</div>}
              <div className="grid grid-cols-2 gap-1 max-lg:grid-cols-4">
                {FIX_TYPES.filter((f) => f.group === g && !f.hidden).map((f) => (
                  <PicBtn key={f.name} on={isTool({t: 'fix', type: f.name})} onClick={() => pick({t: 'fix', type: f.name})} svg={thumbs.fix[f.name]} label={f.name} />
                ))}
              </div>
            </div>
          ))}
        {cat === 'stair' && (
          <div className="grid grid-cols-2 gap-1 max-lg:grid-cols-4">
            {STAIR_TYPES.map((d) => (
              <PicBtn key={d.name} on={isTool({t: 'stair', type: d.name})} onClick={() => pick({t: 'stair', type: d.name})} svg={thumbs.stair[d.name]} label={d.name} />
            ))}
          </div>
        )}
        {cat === 'kaishu' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1">
              <ToolBtn on={isTool({t: 'rail'})} onClick={() => pick({t: 'rail'})} className="bg-rose-50 text-rose-800">
                横手すり
              </ToolBtn>
              <ToolBtn on={isTool({t: 'rail', lshape: true})} onClick={() => pick({t: 'rail', lshape: true})} className="bg-rose-50 text-rose-800">
                L型手すり
              </ToolBtn>
              <ToolBtn on={isTool({t: 'vrail'})} onClick={() => pick({t: 'vrail'})} className="bg-rose-50 text-rose-800">
                縦手すり
              </ToolBtn>
              <ToolBtn on={isTool({t: 'num'})} onClick={() => pick({t: 'num'})} className="bg-rose-50 text-rose-800">
                ①②番号
              </ToolBtn>
              {STEP_TYPES.map((d) => (
                <ToolBtn key={d.name} on={isTool({t: 'step', type: d.name})} onClick={() => pick({t: 'step', type: d.name})} className="bg-blue-50 text-blue-900">
                  {d.name}
                </ToolBtn>
              ))}
            </div>
            {look.list.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-bold text-slate-500">申請書の箇所</div>
                <div className="grid gap-1">
                  {look.list.map((w) => {
                    const p = job.places.find((pl) => pl.id === w.id);
                    const kind = p?.kind ?? 1;
                    const len = Number(String(p?.dims?.l ?? '').replace(/[^\d]/g, '')) || undefined;
                    const t: Tool = kind === 1 ? {t: 'rail', place: w.id, ...(len ? {len} : {})} : kind === 2 ? {t: 'step', type: '踏み台', place: w.id} : {t: 'num', place: w.id};
                    return (
                      <ToolBtn key={w.id} on={isTool(t)} onClick={() => pick(t)} className={`!text-left ${placed.has(w.id) ? 'bg-emerald-50' : 'bg-white'}`} title={w.line}>
                        {circled(w.photo)} {w.name || KINDS[kind - 1]}
                        <span className="text-[11px] text-slate-500"> {KINDS[kind - 1]}</span>
                        {placed.has(w.id) && <span className="text-emerald-700"> ✓</span>}
                      </ToolBtn>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {cat === 'draw' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1">
              <ToolBtn on={isTool({t: 'text'})} onClick={() => pick({t: 'text'})} className="bg-white">
                文字
              </ToolBtn>
              <ToolBtn on={isTool({t: 'dim'})} onClick={() => pick({t: 'dim'})} className="bg-white">
                寸法線
              </ToolBtn>
              <ToolBtn on={isTool({t: 'line', type: '壁'})} onClick={() => pick({t: 'line', type: '壁'})} className="bg-white">
                壁の線
              </ToolBtn>
              <ToolBtn on={isTool({t: 'line', type: '細線'})} onClick={() => pick({t: 'line', type: '細線'})} className="bg-white">
                細い線
              </ToolBtn>
            </div>
            <div className="rounded-md border border-slate-200 p-2">
              <div className="mb-1 text-xs font-bold text-slate-500">下絵</div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void putUnderlay(f);
                }}
              />
              <Btn color="white" small className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
                🖼 {floor.underlay ? '下絵を替える' : '下絵を入れる'}
              </Btn>
              {floor.underlay && (
                <div className="mt-2 space-y-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={underMove} onChange={(e) => setUnderMove(e.target.checked)} className="h-4 w-4" />
                    下絵を動かす
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!floor.underlay.hidden} onChange={(e) => setUnderlay({hidden: !e.target.checked})} className="h-4 w-4" />
                    見せる
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="shrink-0 text-slate-600">濃さ</span>
                    <input type="range" min={0.1} max={0.9} step={0.05} value={floor.underlay.opacity} onChange={(e) => setUnderlay({opacity: Number(e.target.value)})} className="w-full" aria-label="下絵の濃さ" />
                  </label>
                  <MmInput label="幅" value={floor.underlay.w} onChange={(w) => setUnderlay({w, h: Math.round((floor.underlay!.h * w) / floor.underlay!.w)})} min={500} />
                  <Btn color="white" small className="w-full" onClick={() => setUnderlay(null)}>
                    下絵を外す
                  </Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ---------------------------------------------------------------- 右の欄
  const it = selItem;
  const nOf = it ? nums.get(it.id) : undefined;
  const placeSelect = it && (it.kind === 'rail' || it.kind === 'vrail' || it.kind === 'step' || it.kind === 'num') && (
    <>
      <label className="block text-sm">
        <span className="text-slate-600">申請書の箇所</span>
        <select
          value={it.place ?? ''}
          onChange={(e) => setItem(it.id, (o) => {
            const {place: _p, ...rest} = o;
            return e.target.value ? {...rest, place: e.target.value} : rest;
          })}
          className="mt-0.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2"
          aria-label="申請書の箇所"
        >
          <option value="">つながない</option>
          {look.list.map((w) => (
            <option key={w.id} value={w.id}>
              {circled(w.photo)} {w.name}　{KINDS[(job.places.find((p) => p.id === w.id)?.kind ?? 1) - 1]}
            </option>
          ))}
        </select>
      </label>
      {!it.place && (
        <label className="flex items-center gap-1 text-sm">
          <span className="w-14 shrink-0 text-slate-600">番号</span>
          <select value={it.n ?? 0} onChange={(e) => setItem(it.id, {n: Number(e.target.value) || undefined})} className="h-9 rounded-md border border-slate-300 bg-white px-2" aria-label="番号">
            <option value={0}>自動（{nOf ? circled(nOf) : ''}）</option>
            {Array.from({length: 20}, (_, i) => (
              <option key={i} value={i + 1}>
                {circled(i + 1)}
              </option>
            ))}
          </select>
        </label>
      )}
      {it.kind !== 'num' && (
        <label className="block text-sm">
          <span className="text-slate-600">一覧に書く文</span>
          <TextInput value={it.note ?? ''} onChange={(note) => setItem(it.id, {note: note || undefined})} placeholder={legendText({...it, note: ''}, look.line)} className="mt-0.5 w-full" aria-label="一覧に書く文" />
        </label>
      )}
    </>
  );
  const props = it ? (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-slate-700">
          {KIND_LABEL[it.kind]}
          {nOf ? <span className="ml-1 text-rose-600">{circled(nOf)}</span> : null}
        </div>
        <button type="button" onClick={() => setSel(null)} className="rounded px-2 text-slate-400 hover:bg-slate-100" aria-label="選ぶのをやめる">
          ✕
        </button>
      </div>
      {it.kind === 'room' && (
        <>
          <label className="block text-sm">
            <span className="text-slate-600">種類</span>
            <select value={it.type ?? ''} onChange={(e) => setItem(it.id, {type: e.target.value})} className="mt-0.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2" aria-label="部屋の種類">
              {ROOM_TYPES.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}（{FINISH[r.finish].name}）
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">名前</span>
            <TextInput value={it.label ?? ''} onChange={(label) => setItem(it.id, {label: label || undefined})} placeholder={it.type} className="mt-0.5 w-full" aria-label="部屋の名前" />
          </label>
          <MmInput label="幅" value={it.w} onChange={(w) => setItem(it.id, {w})} />
          <MmInput label="奥行" value={it.h} onChange={(h) => setItem(it.id, {h})} />
          <div className="text-sm text-slate-600">
            {(() => {
              const a = roomAreaOf(it, m.module);
              return `${joLabel(a.jo)}・${a.m2}㎡・${a.tsubo}坪`;
            })()}
            {roomFinish(it.type) && <span className="ml-1 text-xs text-slate-400">{FINISH[roomFinish(it.type)].name}</span>}
          </div>
        </>
      )}
      {(it.kind === 'door' || it.kind === 'window') && (
        <>
          <label className="block text-sm">
            <span className="text-slate-600">種類</span>
            <select
              value={it.type ?? ''}
              onChange={(e) => {
                const def = [...DOOR_TYPES, ...WINDOW_TYPES].find((d) => d.name === e.target.value);
                setItem(it.id, {type: e.target.value, kind: WINDOW_TYPES.some((w) => w.name === e.target.value) ? 'window' : 'door', ...(def ? {w: def.w} : {})});
              }}
              className="mt-0.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2"
              aria-label="建具・窓の種類"
            >
              {[...DOOR_TYPES, ...WINDOW_TYPES].map((d) => (
                <option key={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <MmInput label="幅" value={it.w} onChange={(w) => setItem(it.id, {w})} />
          <div className="flex flex-wrap gap-1.5">
            <Btn color="white" small onClick={() => setItem(it.id, {flip: !it.flip})}>
              ⇅ 開く側
            </Btn>
            {it.kind === 'door' && (
              <Btn color="white" small onClick={() => setItem(it.id, {hinge: !it.hinge})}>
                ⇆ 吊り元
              </Btn>
            )}
          </div>
        </>
      )}
      {(it.kind === 'fix' || it.kind === 'stair' || it.kind === 'step') && (
        <>
          <label className="block text-sm">
            <span className="text-slate-600">種類</span>
            <select
              value={it.type ?? ''}
              onChange={(e) => {
                const t = e.target.value;
                const def = it.kind === 'fix' ? FIX_TYPES.find((f) => f.name === t) : it.kind === 'step' ? STEP_TYPES.find((f) => f.name === t) : undefined;
                setItem(it.id, {type: t, ...(def ? {w: def.w, h: def.h} : {})});
              }}
              className="mt-0.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2"
              aria-label="種類"
            >
              {(it.kind === 'fix' ? FIX_TYPES : it.kind === 'stair' ? STAIR_TYPES : STEP_TYPES).map((d) => (
                <option key={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <MmInput label="幅" value={it.w} onChange={(w) => setItem(it.id, {w})} />
          <MmInput label="奥行" value={it.h} onChange={(h) => setItem(it.id, {h})} />
        </>
      )}
      {it.kind === 'rail' && it.pts && (
        <>
          {/* 曲げた棒：区間ごとの長さ（直すと、その先がそのままずれる）。角は ■ を動かす・区間のまん中の □ をつまむとそこで曲がる */}
          {railSegs(it).map((len, i) => (
            <MmInput
              key={i}
              label={`${i + 1}本目`}
              value={len}
              onChange={(next) =>
                setItem(it.id, (o) => {
                  const pts = railPts(o).map((q) => ({...q}));
                  const [a, b] = [pts[i], pts[i + 1]];
                  const cur = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                  const dx = Math.round(((b.x - a.x) / cur) * (next - cur));
                  const dy = Math.round(((b.y - a.y) / cur) * (next - cur));
                  for (let k = i + 1; k < pts.length; k++) pts[k] = {x: pts[k].x + dx, y: pts[k].y + dy};
                  return railFrom(o, pts);
                })
              }
              min={50}
            />
          ))}
          <div className="text-sm text-slate-600">合計 {railSegs(it).reduce((a, b) => a + b, 0).toLocaleString('ja-JP')}mm</div>
          <Btn color="white" small onClick={() => setItem(it.id, (o) => railFrom(o, railPts(o).slice(0, 2)))}>
            まっすぐに戻す
          </Btn>
        </>
      )}
      {it.kind === 'rail' && !it.pts && (
        <>
          <MmInput
            label="長さ"
            value={lineLength(it)}
            onChange={(len) =>
              setItem(it.id, (o) => {
                const cur = lineLength(o) || 1;
                return {...o, w: Math.round((o.w / cur) * len), h: Math.round((o.h / cur) * len)};
              })
            }
            min={50}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!it.len} onChange={(e) => setItem(it.id, e.target.checked ? {len: 600, turn: 1} : {len: undefined, turn: undefined})} className="h-4 w-4" />
            L型（曲がった先の長さ）
          </label>
          {!!it.len && (
            <>
              <MmInput label="曲がった先" value={it.len} onChange={(len) => setItem(it.id, {len, turn: it.turn ?? 1})} />
              <Btn color="white" small onClick={() => setItem(it.id, {turn: it.turn === -1 ? 1 : -1})}>
                ⇅ 曲がる向きを反対に
              </Btn>
            </>
          )}
        </>
      )}
      {it.kind === 'vrail' && <MmInput label="長さ" value={it.len ?? 800} onChange={(len) => setItem(it.id, {len})} />}
      {it.kind === 'text' && (
        <>
          <label className="block text-sm">
            <span className="text-slate-600">文字</span>
            <textarea
              value={it.label ?? ''}
              onChange={(e) => setItem(it.id, {label: e.target.value})}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              aria-label="文字"
            />
          </label>
          <MmInput label="大きさ" value={it.size ?? 220} onChange={(size) => setItem(it.id, {size})} min={60} />
        </>
      )}
      {it.kind === 'num' && <MmInput label="大きさ" value={it.size ?? 260} onChange={(size) => setItem(it.id, {size})} min={60} />}
      {it.kind === 'shape' && !shapeDef(it.type)?.line && !shapeDef(it.type)?.open && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!it.fill} onChange={(e) => setItem(it.id, {fill: e.target.checked || undefined})} className="h-4 w-4" />
          薄く塗る
        </label>
      )}
      {it.kind === 'shape' && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="図形の色">
          <span className="text-slate-600">色</span>
          {SHAPE_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-pressed={(it.color ?? SHAPE_COLORS[0].hex) === c.hex}
              onClick={() => setItem(it.id, {color: c.hex === SHAPE_COLORS[0].hex ? undefined : c.hex})}
              className={`flex h-8 items-center gap-1 rounded-md border px-2 ${(it.color ?? SHAPE_COLORS[0].hex) === c.hex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-300'}`}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{background: c.hex}} />
              {c.name}
            </button>
          ))}
        </div>
      )}
      {(it.kind === 'line' || it.kind === 'dim') && <div className="text-sm text-slate-600">長さ {lineLength(it).toLocaleString('ja-JP')}mm</div>}
      {placeSelect}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {it.kind !== 'num' && it.kind !== 'text' && it.kind !== 'vrail' && (
          <Btn color="white" small onClick={() => setItem(it.id, (o) => turnedItem(o, step))} title="R">
            ↻ 回す
          </Btn>
        )}
        <Btn
          color="white"
          small
          onClick={() => {
            const c = copied(it, step);
            editItems((list) => [...list, c]);
            setSel(c.id);
          }}
          title="Ctrl+D"
        >
          ⧉ 複製
        </Btn>
        <Btn color="white" small onClick={() => remove(it.id)} title="Delete">
          🗑 削除
        </Btn>
      </div>
    </div>
  ) : (
    <div className="space-y-2">
      <div className="text-sm font-bold text-slate-700">一覧（右の枠）</div>
      {legend.length ? (
        <ul className="space-y-0.5 text-sm text-rose-600">
          {legend.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">手すり・段差の解消を置くと出ます</p>
      )}
      <details open={!!m.legend}>
        <summary className="cursor-pointer text-xs text-slate-500">一覧を手で直す</summary>
        <textarea
          value={m.legend ?? legend.join('\n')}
          onChange={(e) => change((mm) => ({...mm, legend: e.target.value, updatedAt: Date.now()}))}
          rows={Math.max(3, legend.length + 1)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          aria-label="一覧を手で直す"
        />
        {m.legend && (
          <Btn
            color="white"
            small
            onClick={() =>
              change((mm) => {
                const {legend: _l, ...rest} = mm;
                return {...rest, updatedAt: Date.now()};
              })
            }
          >
            自動に戻す
          </Btn>
        )}
      </details>
      <div className="border-t border-slate-200 pt-2 text-sm text-slate-600">
        {floor.name}の床面積 {area}㎡（{Math.round((area / 3.30579) * 100) / 100}坪）
        {m.floors.length > 1 && (
          <div>
            延べ床面積 {Math.round(total * 100) / 100}㎡（{Math.round((total / 3.30579) * 100) / 100}坪）
          </div>
        )}
      </div>
    </div>
  );

  const cursor = tool.t !== 'select' ? 'crosshair' : drag.current?.mode === 'pan' ? 'grabbing' : 'default';
  const handles = it && !draft ? handlesOf(it) : it ? handlesOf(m.floors.find((f) => f.id === floor.id)!.items.find((o) => o.id === it.id) ?? it) : [];
  const selBox = it ? bounds((draft ? m.floors.find((f) => f.id === floor.id)!.items.find((o) => o.id === it.id) : it) ?? it) : null;
  const hs = 9 / v.k;
  // スクロールバーの範囲（描いたもの＋まわり 3m・いま見えている所）。つまみをドラッグしているあいだも同じ範囲を使うように、見えている所はドラッグの前のもの
  const content = items.length ? viewOf(items, 3000) : {x: -3000, y: -3000, w: 15000, h: 12000};
  const scrollRange = (() => {
    const x0 = Math.min(content.x, v.x);
    const y0 = Math.min(content.y, v.y);
    return {x: x0, y: y0, w: Math.max(content.x + content.w, v.x + vw) - x0, h: Math.max(content.y + content.h, v.y + vh) - y0};
  })();
  // 描く道具の段（方眼のすぐ上のまん中。ユーザーの指示「以下のボタンと図形ボタンは中央にもってくる」2026-11-10。前は上の段の右の端）：
  // 図形（Excel の「挿入 → 図形」と同じ。「図形 ▼」で一覧＝最近使用した図形・基本図形・線・矢印、横に最近使った図形）と、
  // 横棒・L字（手すり。なぞると曲がり角で曲がる棒）・丸（縦手すり。塗りつぶし）・文字・番号（①から順に⑮まで）
  const shapeBtn = (name: string, withLabel: boolean, onClick: () => void, extra = '') => (
    <button
      key={name}
      type="button"
      aria-pressed={isTool({t: 'shape', type: name})}
      aria-label={name}
      title={name}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md border text-sm ${withLabel ? 'h-9 px-2' : 'h-9 w-10 justify-center'} ${isTool({t: 'shape', type: name}) ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-300 bg-white hover:bg-slate-50'} ${extra}`}
    >
      <span className="block h-5 w-6 [&>svg]:h-full [&>svg]:w-full" aria-hidden dangerouslySetInnerHTML={{__html: shapeIcon(name)}} />
      {withLabel && <span className="whitespace-nowrap">{name}</span>}
    </button>
  );
  const quick = [...new Set([...recentShapes, '直線', '矢印', '四角', '丸'])].slice(0, 4); // 最近使った図形から、足りなければ初めの4つ
  const barBtn = (on: boolean) => `flex h-9 items-center gap-1 rounded-md border px-2.5 text-sm ${on ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-300 bg-white hover:bg-slate-50'}`;
  const numFull = nextNo > NUM_MAX;
  const shapeBar = (
    <div ref={shapeBarRef} role="toolbar" aria-label="描く道具" className="relative mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
      <button
        type="button"
        aria-expanded={shapeOpen}
        onClick={() => setShapeOpen((o) => !o)}
        className={`flex h-9 items-center gap-1 rounded-md border px-2.5 text-sm ${shapeOpen ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
      >
        図形 ▼
      </button>
      {/* スマホは1行に収める（最近の図形は2つ・字は隠して絵だけ） */}
      {quick.map((n, i) => shapeBtn(n, false, () => pickShape(n), i >= 2 ? 'max-sm:hidden' : ''))}
      <span className="mx-0.5 h-6 w-px bg-slate-200" aria-hidden />
      <button type="button" aria-pressed={isTool({t: 'rail'})} onClick={() => pick({t: 'rail'})} className={barBtn(isTool({t: 'rail'}))} aria-label="横棒・L字" title="横棒・L字（手すり）：なぞって描く。曲げたい所で曲げると、まっすぐの線のまま曲がる">
        <svg viewBox="0 0 24 20" className="h-5 w-6" aria-hidden>
          <path d="M3 5H15V16H21" fill="none" stroke="#e01b24" strokeWidth="2.6" strokeLinejoin="round" />
          <circle cx="3" cy="5" r="2.2" fill="#e01b24" />
          <circle cx="21" cy="16" r="2.2" fill="#e01b24" />
        </svg>
        <span className="max-sm:hidden">横棒・L字</span>
      </button>
      <button type="button" aria-pressed={isTool({t: 'vrail'})} onClick={() => pick({t: 'vrail'})} className={barBtn(isTool({t: 'vrail'}))} aria-label="丸（縦手すり）" title="丸（縦手すり）：押した所に置く">
        <span className="block h-4 w-4 rounded-full bg-[#0070c0]" aria-hidden />
        <span className="max-sm:hidden">縦手すり</span>
      </button>
      <button type="button" aria-pressed={isTool({t: 'text'})} onClick={() => pick({t: 'text'})} className={barBtn(isTool({t: 'text'}))} aria-label="文字">
        <span className="text-base font-bold leading-none">A</span>
        <span className="max-sm:hidden">文字</span>
      </button>
      <button
        type="button"
        aria-pressed={isTool({t: 'num'})}
        onClick={() => (numFull ? toast(`番号は${circled(NUM_MAX)}までです`, 'error') : pick({t: 'num'}))}
        className={`${barBtn(isTool({t: 'num'}))} ${numFull ? 'opacity-50' : ''}`}
        aria-label={`${circled(Math.min(nextNo, NUM_MAX))} 番号`}
        title={`番号：押すたびに次の番号（${circled(1)}から${circled(NUM_MAX)}まで）`}
      >
        <span className="text-base leading-none text-rose-600">{circled(Math.min(nextNo, NUM_MAX))}</span>
        <span className="max-sm:hidden">番号</span>
      </button>
      {shapeOpen && (
        <div aria-label="図形の一覧" className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-[19.5rem] overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 shadow-xl">
          {[
            ...(recentShapes.length ? [['最近使用した図形', recentShapes] as const] : []),
            ...(['基本図形', '線', '矢印'] as const).map((g) => [g, SHAPES_SHOWN.filter((x) => x.group === g).map((x) => x.name)] as const),
          ].map(([title, names]) => (
            <div key={title} className="mb-2">
              <div className="mb-1 border-b border-slate-200 pb-0.5 text-sm font-bold text-slate-700">{title}</div>
              <div className="flex flex-wrap gap-1">{names.map((n) => shapeBtn(n, false, () => pickShape(n)))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {embed ? (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <h2 className="mr-auto text-lg font-bold text-[#14532d] max-sm:w-full max-sm:text-center">📐 申請書の平面図を描く</h2>
          <Btn color="softBlue" onClick={() => void usePlan()} disabled={!hasMadori(m) || busy}>
            {busy ? '入れています…' : '✓ 申請書の平面図に入れる'}
          </Btn>
          <Btn color="white" onClick={onBack}>
            ✕ 閉じる
          </Btn>
        </div>
      ) : (
      <JobHeader
        onBack={onBack}
        title={<JobTitle name={job.customer.trim() ? jobName(job) : '新しい平面図'} badge={insurer ? INSURER_INFO[insurer].name : undefined} />}
        primary={
          <>
            {docs?.excel}
            <Btn color="softSky" onClick={() => setPrinting(true)} disabled={!hasMadori(m)}>
              🖨 見取図を印刷
            </Btn>
          </>
        }
        remove={(className) => <RemoveJobButton job={job} settings={s} update={update} onBack={onBack} className={className} />}
        // タブごとの機能は「その他 ▼」の中（ユーザーの指示「ごちゃごちゃしているので、プルダウンにする」2026-11-03。上の段に出すと iPad の横で段が下がった）
        secondary={
          <>
            {docs?.mail}
            <Btn color="white" onClick={() => void usePlan()} disabled={!hasMadori(m) || busy}>
              📝 申請書の平面図に入れる
            </Btn>
          </>
        }
      />
      )}
      {printing && <MadoriPrint job={job} settings={s} madori={m} onClose={() => setPrinting(false)} />}

      {/* 上の段：階・方眼・表示・元に戻す・拡大 */}
      {/* 左（階・方眼・表示）・まん中（戻す・進む）・右（拡大）の3つ。広い画面は3列で、戻す・進むを段のちょうどまん中に */}
      <div role="toolbar" aria-label="平面図の設定" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm xl:grid xl:grid-cols-[minmax(max-content,1fr)_auto_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="tablist" aria-label="階" className="flex flex-wrap items-center gap-1">
          {m.floors.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === floor.id}
              onClick={() => {
                setFloorId(f.id);
                setSel(null);
              }}
              className={`rounded-md px-3 py-1.5 font-bold ${f.id === floor.id ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {f.name}
            </button>
          ))}
          <button type="button" onClick={addFloor} className="rounded-md border border-dashed border-slate-400 px-2 py-1.5 text-slate-600 hover:bg-slate-50" title="階を足す">
            ＋ 階
          </button>
          {m.floors.length > 1 && (
            <button type="button" onClick={removeFloor} className="rounded-md px-2 py-1.5 text-slate-500 hover:bg-slate-100" title={`${floor.name}を消す`}>
              ✕
            </button>
          )}
        </div>
        <label className="flex items-center gap-1">
          方眼
          <select
            value={m.module}
            onChange={(e) => change((mm) => ({...mm, module: Number(e.target.value) as Module, updatedAt: Date.now()}))}
            className="h-8 rounded-md border border-slate-300 bg-white px-1"
            aria-label="方眼の1マス"
          >
            {MODULES.map((x) => (
              <option key={x} value={x}>
                {x}mm{x === 910 ? '（尺）' : x === 1000 ? '（メーター）' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          そろえる
          <select value={m.snap} onChange={(e) => change((mm) => ({...mm, snap: Number(e.target.value) as 1 | 2 | 4, updatedAt: Date.now()}))} className="h-8 rounded-md border border-slate-300 bg-white px-1" aria-label="そろえる幅">
            <option value={1}>1マス</option>
            <option value={2}>1/2マス</option>
            <option value={4}>1/4マス</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={m.showDims} onChange={(e) => change((mm) => ({...mm, showDims: e.target.checked, updatedAt: Date.now()}))} className="h-4 w-4" />
          寸法
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={m.showArea} onChange={(e) => change((mm) => ({...mm, showArea: e.target.checked, updatedAt: Date.now()}))} className="h-4 w-4" />
          広さ（帖）
        </label>
        </div>
        {/* 戻す・進むは上の段のまん中（ユーザーの指示「戻るボタンの位置は中央にもってくる」2026-11-10） */}
        <div className="flex items-center gap-1 lg:ml-auto xl:ml-0 xl:justify-self-center">
          <Btn color="white" small onClick={undo} disabled={!hist.current.past.length} title="Ctrl+Z">
            ↶ 戻す
          </Btn>
          <Btn color="white" small onClick={redo} disabled={!hist.current.future.length} title="Ctrl+Y">
            ↷ 進む
          </Btn>
        </div>
        <div className="flex items-center gap-1 lg:ml-auto xl:ml-0 xl:justify-self-end">
          <Btn color="white" small onClick={() => zoomAt(1 / 1.25)} aria-label="縮小">
            −
          </Btn>
          <Btn color="white" small onClick={() => zoomAt(1.25)} aria-label="拡大">
            ＋
          </Btn>
          <Btn color="white" small onClick={() => fitTo(items)}>
            全体
          </Btn>
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_17rem]">
        <div ref={paletteRef} className="scroll-mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm max-lg:order-1" data-madori-palette>
          {palette}
        </div>
        <div className="min-w-0 space-y-2 max-lg:order-2">
        {shapeBar}
        <div ref={boxRef} className="relative h-[min(calc(72vh-3rem),712px)] min-h-[340px] overflow-hidden max-lg:h-[min(58vh,560px)] max-lg:min-h-[320px] scroll-mb-2 rounded-lg border-2 border-slate-300 bg-white shadow-sm" data-madori-canvas>
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            viewBox={`${v.x} ${v.y} ${vw} ${vh}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => {
              if (!drag.current) setPreview(null);
            }}
            onDoubleClick={(e) => {
              if (poly) {
                finishPoly();
                return;
              }
              const hit = hitTest(items, toMm(e.clientX, e.clientY), 10 / v.k);
              if (canType(hit)) startEdit(hit);
            }}
            style={{touchAction: 'none', cursor}}
            className="block select-none"
            aria-label="平面図"
            role="img"
          >
            <defs dangerouslySetInnerHTML={{__html: patternDefs('ed') + gridDefs}} />
            <rect x={v.x} y={v.y} width={vw} height={vh} fill="url(#ed-g1)" />
            <rect x={v.x} y={v.y} width={vw} height={vh} fill="url(#ed-g2)" />
            {floor.underlay && !floor.underlay.hidden && underUrl && (
              <image href={underUrl} x={floor.underlay.x} y={floor.underlay.y} width={floor.underlay.w} height={floor.underlay.h} opacity={floor.underlay.opacity} preserveAspectRatio="none" />
            )}
            {lowerArt && <g opacity={0.15} dangerouslySetInnerHTML={{__html: lowerArt}} />}
            <g dangerouslySetInnerHTML={{__html: art}} />
            {poly && (
              <g pointerEvents="none" data-poly-draft>
                <polyline
                  points={[...poly, ...(polyHover ? [polyHover] : [])].map((q) => `${q.x},${q.y}`).join(' ')}
                  fill="none"
                  stroke="#059669"
                  strokeWidth={2.5 / v.k}
                  strokeDasharray={`${6 / v.k} ${4 / v.k}`}
                />
                {poly.map((q, i) => (
                  <rect key={i} x={q.x - hs / 2} y={q.y - hs / 2} width={hs} height={hs} fill={i === 0 ? '#059669' : '#fff'} stroke="#059669" strokeWidth={1.5 / v.k} />
                ))}
              </g>
            )}
            {trail && (
              <polyline
                points={trail.pts.map((q) => `${q.x},${q.y}`).join(' ')}
                fill="none"
                stroke={trail.erase ? '#ef4444' : '#64748b'}
                strokeOpacity={trail.erase ? 0.55 : 0.35}
                strokeWidth={(trail.erase ? 8 : 4) / v.k}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
                data-trail={trail.erase ? 'erase' : 'draw'}
              />
            )}
            {preview && preview.kind === 'rail' ? (
              <polyline points={railPts(preview).map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#059669" strokeWidth={3 / v.k} strokeDasharray={`${6 / v.k} ${4 / v.k}`} strokeLinejoin="round" pointerEvents="none" data-rail-preview />
            ) : (
              preview && <rect {...bounds(preview)} fill="#10b98114" stroke="#059669" strokeWidth={1.5 / v.k} strokeDasharray={`${6 / v.k} ${4 / v.k}`} pointerEvents="none" />
            )}
            {selBox && (
              <g pointerEvents="none">
                <rect x={selBox.x} y={selBox.y} width={Math.max(selBox.w, 1)} height={Math.max(selBox.h, 1)} fill="none" stroke="#2563eb" strokeWidth={2 / v.k} strokeDasharray={`${6 / v.k} ${4 / v.k}`} />
                {handles.map((hd) => (
                  // 頂点・角は塗った ■、辺のまん中は □（マイホームクラウドと同じ）
                  <rect key={hd.h} x={hd.x - hs / 2} y={hd.y - hs / 2} width={hs} height={hs} fill={isCornerHandle(hd.h) ? '#2b8de0' : '#fff'} stroke="#2563eb" strokeWidth={1.5 / v.k} data-handle={hd.h} />
                ))}
                {canTurn(it) && !editing && (
                  <g data-turn-handle>
                    <line x1={selBox.x + selBox.w / 2} y1={selBox.y} x2={selBox.x + selBox.w / 2} y2={selBox.y - 20 / v.k} stroke="#2563eb" strokeWidth={1.5 / v.k} />
                    <circle cx={selBox.x + selBox.w / 2} cy={selBox.y - 28 / v.k} r={10 / v.k} fill="#fff" stroke="#2563eb" strokeWidth={1.5 / v.k} />
                    <text x={selBox.x + selBox.w / 2} y={selBox.y - 28 / v.k + 5 / v.k} fontSize={14 / v.k} textAnchor="middle" fill="#2563eb">
                      ↻
                    </text>
                  </g>
                )}
              </g>
            )}
          </svg>
          <ScrollBars view={v} vw={vw} vh={vh} range={scrollRange} onMove={(x, y) => setView({...v, x, y})} />
          {(editing || canType(selItem)) && (() => {
            // 図の上の入力欄（選んでいるあいだは見えないまま置いておき、打ち始めたらすぐ移る）
            const target = editItem ?? selItem;
            if (!target) return null;
            const room = target.kind === 'room';
            const size = room ? 260 : (target.size ?? 220);
            const fs = Math.max(14, size * v.k);
            const value = editing ? editing.value : '';
            const lines = value.split('\n');
            const longest = Math.max(1, ...lines.map((l) => [...l].reduce((a, c) => a + (c.charCodeAt(0) < 0x2000 ? 0.6 : 1), 0)));
            const width = room ? Math.max(120, target.w * v.k) : Math.max(140, (longest + 2) * fs);
            const left = room ? (target.x - v.x) * v.k : (target.x - v.x) * v.k - 4;
            const top = room ? (target.y + target.h / 2 - v.y) * v.k - fs * 0.8 : (target.y - v.y) * v.k - 4;
            return (
              <textarea
                ref={editRef}
                value={value}
                rows={room ? 1 : Math.max(1, lines.length)}
                tabIndex={editing ? 0 : -1}
                aria-label="図に打つ文字"
                aria-hidden={!editing}
                onChange={(e) => {
                  const v2 = room ? e.target.value.replace(/\n/g, '') : e.target.value;
                  setEditing((cur) => (cur ? {...cur, value: v2} : target ? {id: target.id, value: v2} : cur));
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditing(null);
                    e.currentTarget.blur();
                  } else if (e.key === 'Enter' && !e.shiftKey && !(e.altKey && !room)) {
                    e.preventDefault();
                    commitEdit();
                    e.currentTarget.blur();
                  } else if (e.key === 'Enter' && e.altKey && !room) {
                    e.preventDefault();
                    const el = e.currentTarget;
                    el.setRangeText('\n', el.selectionStart, el.selectionEnd, 'end');
                    setEditing((cur) => (cur ? {...cur, value: el.value} : cur));
                  }
                }}
                onBlur={() => commitEdit()}
                style={{left, top, width, fontSize: fs, lineHeight: 1.1, textAlign: room ? 'center' : 'left'}}
                className={`absolute z-10 resize-none overflow-hidden rounded border-2 border-blue-500 bg-white/95 px-1 text-slate-900 shadow outline-none ${editing ? '' : 'pointer-events-none opacity-0'}`}
              />
            );
          })()}
          {!items.length && !preview && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-slate-400">
              {tool.t === 'select' ? '部屋を選んで、方眼の上をドラッグ' : '方眼の上をドラッグ（指でなぞる）'}
            </div>
          )}
          {tool.t !== 'select' && (
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-emerald-700/90 px-2 py-1 text-xs text-white">
              {tool.t === 'room' || tool.t === 'stair' || tool.t === 'fix' || tool.t === 'door' || tool.t === 'window' || tool.t === 'step' ? tool.type : tool.t === 'rail' ? (tool.lshape ? 'L型手すり' : '手すり（横棒・L字）') : tool.t === 'vrail' ? '縦手すり' : tool.t === 'num' ? '番号' : tool.t === 'text' ? '文字' : tool.t === 'line' || tool.t === 'shape' ? tool.type : '寸法線'}
              {tool.t === 'room' ? (poly ? '：角を押していく（はじめの点で閉じる・Enter）' : '：ドラッグで四角／角を順に押す') : tool.t === 'rail' && !tool.lshape ? '：なぞる（曲げたい所で曲げる）' : tool.t === 'num' ? `：押すたびに${circled(Math.min(nextNo, NUM_MAX))}から順に` : DRAG_TOOLS.includes(tool.t) ? '：ドラッグ' : '：押して置く'}
            </div>
          )}
        </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm max-lg:order-3">{props}</div>
      </div>
    </div>
  );
}

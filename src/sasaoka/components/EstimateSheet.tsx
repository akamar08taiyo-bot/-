// 見積書に直接入力する（Excel のように欄を選んで打ち込む）。見積書と同じ形のまま、打ち込んだ値は様邸の行（部材・取付手間）に入り、
// 仕切り計算表・請求書も同じ行から作る。操作は Excel と同じ：
//   欄を選んで打ち込むと書き換え／Enter で下・Tab で右・矢印で移動／F2 かダブルクリックで書き直す／Delete で消す／Esc でやめる／Ctrl+Z で元に戻す
// 内容（品名）は部材リストから選べる（★お気に入りが先）。備考（算出根拠）に定価を入れると、単価は 定価×0.8。
// いちばん下の空いた行に打ち込むと行が増え、改修場所を打ち込むと箇所が増える。
// 日本語入力（IME）がそのまま使えるように、選んだ欄の上にいつも見えない入力欄を置いておき、打ち始めたら見えるようにする。

import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent} from 'react';
import {circled, formLines, KINDS, materialText} from '../estimateForms.ts';
import {useDocMeta} from '../print/docMeta.ts';
import {KouikiForm, YukuhashiForm} from '../print/EstimateForms.tsx';
import {applySheet, deleteLine, insertBlankAfter, moveLine, parseDate, sheetTarget, sheetValue, toggleExcluded} from '../sheetEdit.ts';
import type {EstimateForm, Job, Material, Settings} from '../types.ts';
import {matchesAll, todayIso, yen} from '../util.ts';
import {useToast} from './ui.tsx';

/** A4横の幅（297mm）を画面の px に */
const PAGE_W = (297 / 25.4) * 96;
const PAD = 12;

type Sel = {key: string; occ: number};
type Edit = {mode: 'enter' | 'edit'; value: string};
type Dir = 'up' | 'down' | 'left' | 'right' | 'next' | 'prev';
type Box = {x: number; y: number; w: number; h: number; font: string; family: string; align: string};

const FIELD_NAMES: Record<string, string> = {
  text: '内容（品名）',
  qty: '数量',
  unit: '単位',
  price: '単価',
  note: '備考（定価）',
  name: '改修場所（箇所名）',
  work: '改修の種類',
  kind: '改修の種類',
  photo: '写真番号',
  mark: '材／手',
  customer: 'お客様名',
  insuredNo: '介護保険被保険者番号',
  address: '工事場所（住所）',
};

export function EstimateSheet({
  job,
  settings: s,
  form,
  materials,
  setJob,
  onPickMaterial,
  onPickLabor,
  onPickKit,
  onPrint,
}: {
  job: Job;
  settings: Settings;
  form: EstimateForm;
  materials: Material[];
  setJob: (fn: (j: Job) => Job) => void;
  onPickMaterial: (placeId: string | null) => void; // null：新しい箇所に
  onPickLabor: (placeId: string | null, rowId: string | null) => void; // rowId：その部材の同上施工費。null：箇所の施工費
  onPickKit: (placeId: string | null) => void;
  onPrint: () => void;
}) {
  const [meta, setMeta] = useDocMeta(`est:${job.id}`, todayIso);
  const toast = useToast();
  // お客様名がまだなければ、見積書のお客様名の欄を選んでおく（苅田町・行橋市・みやこ町用。すぐ打ち込める）
  const [sel, setSel] = useState<Sel | null>(() => (form === 'yukuhashi' && !job.customer.trim() ? {key: 'job:customer', occ: 0} : null));
  const [edit, setEdit] = useState<Edit | null>(null);
  const [hl, setHl] = useState(-1); // 候補の中で選んでいるもの
  const [mark, setMark] = useState<'材' | '手'>('材');
  const [scale, setScale] = useState(1);
  const [innerH, setInnerH] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sugRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<Job[]>([]);
  const redoStack = useRef<Job[]>([]);
  const pendingMove = useRef<Dir | null>(null);
  const pendingPos = useRef<{page: number; tr: number; td: number} | null>(null);
  const jobRef = useRef(job);
  jobRef.current = job;
  const ctx = {settings: s, form};

  // ---------------------------------------------------------------- 大きさ（画面の幅に合わせる。小さすぎるときは横に動かす）
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    const measure = () => {
      const fit = (el.clientWidth - PAD * 2) / PAGE_W;
      setScale(Math.min(1.25, Math.max(0.8, Math.floor(fit * 100) / 100)));
      setInnerH(inner.offsetHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------- 欄を探す
  const cells = () => Array.from(innerRef.current?.querySelectorAll<HTMLElement>('[data-edit]') ?? []);
  const findCell = (x: Sel | null) => {
    if (!x) return null;
    const same = cells().filter((c) => c.dataset.edit === x.key);
    return same[Math.min(x.occ, same.length - 1)] ?? null;
  };
  const selOf = (el: HTMLElement): Sel => {
    const key = el.dataset.edit ?? '';
    return {key, occ: cells().filter((c) => c.dataset.edit === key).indexOf(el)};
  };
  const posOf = (el: HTMLElement) => {
    const td = el.closest('td') ?? el;
    const tr = td.closest('tr');
    const page = td.closest('.form-page');
    const pages = Array.from(innerRef.current?.querySelectorAll('.form-page') ?? []);
    return {page: page ? pages.indexOf(page) : -1, tr: tr ? Array.from(tr.parentElement?.children ?? []).indexOf(tr) : -1, td: tr ? Array.from(tr.children).indexOf(td) : -1};
  };
  const atPos = (p: {page: number; tr: number; td: number}): HTMLElement | null => {
    const page = innerRef.current?.querySelectorAll('.form-page')[p.page];
    const tr = page?.querySelector('tbody')?.children[p.tr] as HTMLElement | undefined;
    if (!tr) return null;
    const td = tr.children[p.td] as HTMLElement | undefined;
    if (td?.dataset.edit) return td;
    return (tr.querySelector('[data-edit]') as HTMLElement | null) ?? null;
  };

  /** 空いた行を押したときは、打ち込める行（data-new）の同じ列 */
  const newRowCell = (td: HTMLElement | null): HTMLElement | null => {
    const row = innerRef.current?.querySelector<HTMLElement>('tr[data-new]');
    if (!row) return null;
    const editable = Array.from(row.querySelectorAll<HTMLElement>('[data-edit]'));
    if (!td) return editable[0] ?? null;
    const r = td.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    return editable.find((c) => {
      const b = c.getBoundingClientRect();
      return b.left <= cx && cx <= b.right;
    }) ?? editable[0] ?? null;
  };

  // 選んでいる欄の枠・入力欄の位置（ページの中の位置。拡大・縮小しても付いていく）。移動の予約があれば動かす
  useLayoutEffect(() => {
    if (pendingPos.current) {
      const el = atPos(pendingPos.current);
      pendingPos.current = null;
      if (el) {
        setSel(selOf(el));
        return;
      }
    }
    if (pendingMove.current) {
      const dir = pendingMove.current;
      pendingMove.current = null;
      move(dir);
      return;
    }
    const el = findCell(sel);
    const inner = innerRef.current;
    if (!el || !inner) {
      if (box) setBox(null);
      if (sel && !el) setSel(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const b = inner.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const next: Box = {
      x: (r.left - b.left) / scale,
      y: (r.top - b.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
      font: cs.fontSize,
      family: cs.fontFamily,
      align: cs.textAlign,
    };
    if (!box || Object.keys(next).some((k) => next[k as keyof Box] !== box[k as keyof Box])) setBox(next);
  });

  // 選んだ欄を見えるところに出し、入力欄に文字が入るようにする（見積書の外の入力欄で打っているときは、そちらのまま）
  useEffect(() => {
    const el = findCell(sel);
    if (!el) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== inputRef.current && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    el.scrollIntoView({block: 'nearest', inline: 'nearest'});
    inputRef.current?.focus({preventScroll: true});
  }, [sel?.key, sel?.occ]);

  const select = (el: HTMLElement) => {
    setSel(selOf(el));
    setEdit(null);
    setHl(-1);
  };

  const move = (dir: Dir) => {
    const cur = findCell(sel);
    if (!cur) return;
    const all = cells();
    const rows: HTMLElement[][] = [];
    let last: Element | null = null;
    for (const c of all) {
      const row = c.closest('tr') ?? c.parentElement;
      if (row !== last) {
        rows.push([]);
        last = row;
      }
      rows[rows.length - 1].push(c);
    }
    const ri = rows.findIndex((r) => r.includes(cur));
    const ci = rows[ri]?.indexOf(cur) ?? -1;
    if (ri < 0) return;
    let target: HTMLElement | null | undefined = null;
    if (dir === 'left' || dir === 'prev') target = rows[ri][ci - 1] ?? (dir === 'prev' ? rows[ri - 1]?.[rows[ri - 1].length - 1] : null);
    else if (dir === 'right' || dir === 'next') target = rows[ri][ci + 1] ?? (dir === 'next' ? rows[ri + 1]?.[0] : null);
    else {
      const rc = cur.getBoundingClientRect();
      const cx = (rc.left + rc.right) / 2;
      const step = dir === 'down' ? 1 : -1;
      for (let k = ri + step; k >= 0 && k < rows.length && !target; k += step) {
        target = rows[k].find((c) => {
          const r = c.getBoundingClientRect();
          return r.left - 1 <= cx && cx <= r.right + 1;
        });
      }
    }
    if (target) select(target);
  };

  // ---------------------------------------------------------------- 入れる・元に戻す
  const change = (next: Job) => {
    const prev = jobRef.current;
    if (next === prev) return;
    undoStack.current.push(prev);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    jobRef.current = next;
    setJob(() => next);
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(jobRef.current);
    jobRef.current = prev;
    setJob(() => prev);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(jobRef.current);
    jobRef.current = next;
    setJob(() => next);
  };

  /** 打ち込んだ値を入れる。then：入れたあとに動く向き。keepSel：選んでいる欄を変えない（見積書の外を押したとき。そちらに文字が入るように） */
  const commit = (value: string, pick: Material | null, then: Dir | null, keepSel = false) => {
    if (!sel) return;
    const key = sel.key;
    if (key === 'date') {
      const d = parseDate(value);
      if (d !== null) setMeta({...meta, date: d});
    } else if (key === 'new:mark') {
      if (/手/.test(value)) setMark('手');
      else if (/材/.test(value)) setMark('材');
    } else if (!key.startsWith('excl:')) {
      const res = applySheet(jobRef.current, key, value, {...ctx, pick, labor: key.startsWith('new:') && mark === '手'});
      change(res.job);
      if (res.key && res.key !== key && !keepSel) setSel({key: res.key, occ: 0});
    }
    setEdit(null);
    setHl(-1);
    pendingMove.current = then;
  };

  const toggle = () => {
    if (!sel) return;
    if (sel.key.startsWith('excl:')) change(toggleExcluded(jobRef.current, sel.key.slice(5)));
    else if (sel.key === 'new:mark') setMark((m) => (m === '材' ? '手' : '材'));
  };
  const isToggle = (k: string | undefined) => !!k && (k.startsWith('excl:') || k === 'new:mark');

  const startEdit = (mode: Edit['mode']) => {
    if (!sel) return;
    if (isToggle(sel.key)) {
      toggle();
      return;
    }
    setEdit({mode, value: mode === 'edit' ? (sel.key === 'date' ? meta.date : sheetValue(jobRef.current, sel.key, ctx, meta.date)) : ''});
    setHl(-1);
  };

  // ---------------------------------------------------------------- 候補（内容は部材リスト・★お気に入り、改修の種類は①〜⑥）
  const field = sel?.key.split(':').pop() ?? '';
  const target = sel ? sheetTarget(job, sel.key) : {place: null, row: null};
  const textCell = !!sel && field === 'text' && (sel.key.startsWith('new:') ? mark === '材' : target.row?.kind === 'material');
  const kindCell = !!sel && (field === 'work' || field === 'kind');
  const suggestions = useMemo(() => {
    if (!edit) return [] as {label: string; sub: string; value: string; pick: Material | null}[];
    const q = edit.value.trim();
    if (textCell) {
      const base = q ? materials.filter((m) => matchesAll(`${m.name} ${m.code} ${m.maker}`, q)) : materials.filter((m) => m.favorite);
      return base
        .slice()
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'ja'))
        .slice(0, 8)
        .map((m) => ({
          label: `${m.favorite ? '★ ' : ''}${m.name}`,
          sub: [m.maker, m.code, m.listPrice > 0 ? `定価 ${yen(m.listPrice)}` : '', m.price > 0 ? `仕切 ${yen(m.price)}` : '仕切なし'].filter(Boolean).join('　'),
          value: materialText({...m, kind: 'material', id: '', refId: m.id, qty: 1, lengthCm: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null}),
          pick: m,
        }));
    }
    if (kindCell) {
      return KINDS.map((k, i) => ({label: `${circled(i + 1)}${k}`, sub: '', value: String(i + 1), pick: null})).filter(
        (k) => !q || k.label.includes(q) || k.value === q.normalize('NFKC'),
      );
    }
    return [];
  }, [edit, textCell, kindCell, materials]);

  // ---------------------------------------------------------------- キーボード（Excel と同じ）
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 日本語の変換中
    const ctrl = e.ctrlKey || e.metaKey;
    if (!edit) {
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (ctrl) return; // コピー・貼り付けなどはそのまま
      const arrows: Record<string, Dir> = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'};
      if (arrows[e.key]) {
        e.preventDefault();
        move(arrows[e.key]);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        move(e.shiftKey ? 'prev' : 'next');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isToggle(sel?.key)) toggle();
        else move(e.shiftKey ? 'up' : 'down');
      } else if (e.key === 'F2') {
        e.preventDefault();
        startEdit('edit');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (sel && !isToggle(sel.key)) commit('', null, null);
      } else if (e.key === ' ' && isToggle(sel?.key)) {
        e.preventDefault();
        toggle();
      }
      return;
    }
    // 打ち込んでいるとき
    if (suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setHl((h) => (e.key === 'ArrowDown' ? Math.min(suggestions.length - 1, h + 1) : Math.max(-1, h - 1)));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEdit(null);
      setHl(-1);
      return;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const at = el.selectionStart ?? edit.value.length;
      const v = edit.value.slice(0, at) + '\n' + edit.value.slice(el.selectionEnd ?? at);
      setEdit({...edit, value: v});
      requestAnimationFrame(() => el.setSelectionRange(at + 1, at + 1));
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const dir: Dir = e.key === 'Tab' ? (e.shiftKey ? 'prev' : 'next') : e.shiftKey ? 'up' : 'down';
      const chosen = hl >= 0 ? suggestions[hl] : null;
      commit(chosen ? chosen.value : edit.value, chosen?.pick ?? null, dir);
      return;
    }
    if (edit.mode === 'enter') {
      const arrows: Record<string, Dir> = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'};
      if (arrows[e.key]) {
        e.preventDefault();
        commit(edit.value, null, arrows[e.key]);
      }
    }
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (!sel) return;
    if (!edit) {
      if (sel.key === 'new:mark') {
        if (/[手てt]/i.test(v)) setMark('手');
        else if (/[材ざz]/i.test(v)) setMark('材');
        e.target.value = '';
        return;
      }
      if (isToggle(sel.key)) {
        e.target.value = '';
        return;
      }
      setEdit({mode: 'enter', value: v});
    } else setEdit({...edit, value: v});
    setHl(-1);
  };

  const onCopy = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (edit || !sel) return;
    const el = findCell(sel);
    e.preventDefault();
    e.clipboardData.setData('text/plain', sheetValue(jobRef.current, sel.key, ctx, meta.date) || el?.innerText || '');
  };

  // ---------------------------------------------------------------- マウス
  const onMouseDown = (e: ReactMouseEvent) => {
    let t = e.target as HTMLElement;
    if (sugRef.current?.contains(t)) return;
    if (t.closest('[data-del], [data-ins]')) {
      e.preventDefault(); // 行の左の「＋」「✕」：欄は選ばない（押し終わったら onClick で入れる・消す）
      return;
    }
    if (t === inputRef.current) {
      const cur = findCell(sel)?.getBoundingClientRect();
      const inside = cur && e.clientX >= cur.left && e.clientX <= cur.right && e.clientY >= cur.top && e.clientY <= cur.bottom;
      if (inside) {
        if (edit) return; // 打ち込んでいる欄の中（文字の位置を変える）
      } else {
        // 打ち込んでいる欄が隣の欄に重なっているときは、その下の欄を押したことにする
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x !== inputRef.current && innerRef.current?.contains(x) && x.closest('[data-edit], tr[data-blank]'));
        if (under) t = under as HTMLElement;
      }
    }
    let el = t === inputRef.current ? findCell(sel) : t.closest<HTMLElement>('[data-edit]');
    if (!el && t.closest('tr[data-blank]')) el = newRowCell(t.closest('td'));
    if (!el || !innerRef.current?.contains(el)) return;
    e.preventDefault(); // 入力欄から文字が消えないように（入力欄に入れたままにする）
    if (edit && sel) {
      // 打ち込んでいた値を入れてから、押した欄（ページの中の同じ位置）を選ぶ
      pendingPos.current = posOf(el);
      commit(edit.value, null, null);
      return;
    }
    select(el);
    inputRef.current?.focus({preventScroll: true});
  };
  // 行の左の「＋」：その行の下に空白の行を入れて、内容の欄を選ぶ（そのまま打ち込める）。
  // 「✕」：その行（部材は同上施工費ごと）を消す。箇所の行がなくなれば箇所も消す（その行が空白になる）
  const onClick = (e: ReactMouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ins], [data-del]');
    if (!btn) return;
    if (edit && sel) commit(edit.value, null, null, true); // 打ち込んでいた値を入れてから
    if (btn.dataset.ins) {
      const res = insertBlankAfter(jobRef.current, btn.dataset.ins);
      change(res.job);
      if (res.rowId) setSel({key: `line:${res.rowId}:text`, occ: 0});
      inputRef.current?.focus({preventScroll: true});
    } else if (btn.dataset.del) {
      change(deleteLine(jobRef.current, btn.dataset.del));
      setSel(null);
      toast('行を消しました（「↶ 元に戻す」で戻せます）');
    }
  };
  const onDoubleClick = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (sugRef.current?.contains(t) || edit) return;
    if (t === inputRef.current || t.closest('[data-edit]')) {
      e.preventDefault();
      startEdit('edit');
    }
  };

  // ---------------------------------------------------------------- ツールバー（選んだ行の操作）
  const row = target.row;
  const place = target.place;
  const lineRowId = row?.id ?? null;
  // 施工費を入れる先の部材：選んでいる部材か、選んでいる施工費（同上施工費）の上の部材
  const workOwner = (() => {
    if (!row || !place) return null;
    let k = place.rows.findIndex((r) => r.id === row.id);
    while (k >= 0 && place.rows[k].kind === 'labor') k--;
    return k >= 0 ? place.rows[k] : null;
  })();
  // 介護保険の対象外は、見積書の1行ごと（部材のすぐ下の施工費は部材に合わせる）
  const lines = useMemo(() => formLines(job, s, form, {all: true}), [job, s, form]);
  const line = row ? lines.find((l) => l.rowId === row.id || l.excludeId === row.id) : undefined;
  const act = (fn: (j: Job) => Job) => change(fn(jobRef.current));
  const insertBelow = () => {
    if (!lineRowId) return;
    const res = insertBlankAfter(jobRef.current, lineRowId);
    change(res.job);
    if (res.rowId) setSel({key: `line:${res.rowId}:text`, occ: 0});
  };

  // 打ち込む欄の位置・文字の大きさ（見積書の欄と同じ）
  const editing = edit !== null;
  const taWidth = box ? (editing ? Math.max(box.w, field === 'text' || field === 'note' || field === 'address' || field === 'customer' ? 260 : 90) : box.w) : 10;
  const taStyle = box
    ? {
        left: Math.max(0, Math.min(box.x, PAGE_W - taWidth - 4)),
        top: box.y,
        minWidth: box.w,
        width: taWidth,
        height: editing ? undefined : box.h,
        minHeight: box.h,
        fontSize: box.font,
        fontFamily: box.family,
        textAlign: (editing && box.align === 'right' ? 'right' : editing ? 'left' : box.align) as 'left' | 'right' | 'center',
      }
    : {left: -9999, top: 0, width: 10, height: 10};
  const rows = editing ? Math.max(1, edit.value.split('\n').length) : 1;

  // 候補の場所（画面の上に、ふつうの大きさで出す）。画面を動かしたら付いていく
  const [, setTick] = useState(0);
  const showSug = suggestions.length > 0;
  useEffect(() => {
    if (!showSug) return;
    const onMove = () => setTick((t) => t + 1);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [showSug]);
  const anchor = findCell(sel);
  const sugPos = (() => {
    if (!anchor || suggestions.length === 0) return null;
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + 4 + 320 <= window.innerHeight || r.top < 340;
    return {left: Math.max(8, Math.min(r.left, window.innerWidth - 448)), top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - Math.min(320, suggestions.length * 44 + 40))};
  })();

  const selName = sel ? FIELD_NAMES[field] ?? (sel.key.startsWith('excl:') ? '介護保険の対象／対象外' : sel.key.startsWith('overhead:') ? '諸経費' : sel.key === 'date' ? '作成日' : '') : '';
  const bar = editing ? edit.value : sel ? (sel.key === 'date' ? meta.date : sel.key === 'new:mark' ? mark : sheetValue(job, sel.key, ctx, meta.date)) : '';

  return (
    <section className="rounded-xl border-2 border-emerald-800 bg-white shadow-sm" aria-label="見積書に直接入力">
      <div className="flex flex-wrap items-center gap-2 border-b border-emerald-200 bg-emerald-800 px-3 py-1.5 text-white">
        <div className="text-sm font-bold">
          見積書に直接入力
          <span className="ml-1 text-xs font-normal text-emerald-100">（Excel と同じように欄を選んで打ち込みます）</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          <button type="button" onClick={undo} disabled={undoStack.current.length === 0} className="sheet-btn" title="元に戻す（Ctrl+Z）">
            ↶ 元に戻す
          </button>
          <button type="button" onClick={redo} disabled={redoStack.current.length === 0} className="sheet-btn" title="やり直す（Ctrl+Y）">
            ↷ やり直す
          </button>
          <button type="button" onClick={onPrint} className="rounded bg-sky-500 px-2 py-1 text-xs font-bold hover:bg-sky-400">
            🖨 印刷
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <button type="button" className="sheet-tool" onClick={() => onPickMaterial(place?.id ?? null)} title="選んでいる行の箇所に入れます（いちばん下の行なら最後の箇所）">
          📋 部材リスト・★お気に入りから入れる
        </button>
        <button
          type="button"
          className="sheet-tool"
          onClick={() => onPickLabor(place?.id ?? null, workOwner?.id ?? null)}
          title="笹岡工務店の取付手間（木・タイルなど）を数えて施工費にします。部材を選んでいれば、その部材の「同上施工費」になります"
        >
          🔧 施工費（笹岡工務店の手間）から入れる
        </button>
        <button type="button" className="sheet-tool" onClick={() => onPickKit(place?.id ?? null)}>
          ＋ 部材＋施工費（常用）から入れる
        </button>
        <span className="mx-1 h-6 w-px bg-slate-300" />
        <button type="button" className="sheet-tool" disabled={!lineRowId} onClick={insertBelow} title="この行のすぐ下に空いた行を入れる">
          ↓ 下に1行入れる
        </button>
        <button type="button" className="sheet-tool" disabled={!lineRowId} onClick={() => lineRowId && act((j) => moveLine(j, lineRowId, -1))} title="この行を上へ（同じ箇所の中）">
          ▲ 上へ
        </button>
        <button type="button" className="sheet-tool" disabled={!lineRowId} onClick={() => lineRowId && act((j) => moveLine(j, lineRowId, 1))} title="この行を下へ（同じ箇所の中）">
          ▼ 下へ
        </button>
        <button
          type="button"
          className="sheet-tool text-rose-700"
          disabled={!lineRowId}
          onClick={() => {
            if (!lineRowId) return;
            act((j) => deleteLine(j, lineRowId));
            setSel(null);
          }}
        >
          {row?.kind === 'material' ? 'この部材（と同上施工費）を消す' : 'この行を消す'}
        </button>
        <span className="mx-1 h-6 w-px bg-slate-300" />
        <label className={`sheet-tool inline-flex items-center gap-1.5 ${line ? '' : 'opacity-50'}`}>
          <input
            type="checkbox"
            disabled={!line}
            checked={line?.excluded ?? false}
            onChange={() => line && act((j) => toggleExcluded(j, line.excludeId))}
            className="h-4 w-4"
          />
          介護保険の対象外
        </label>
      </div>
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1 text-xs">
        <span className="w-28 shrink-0 truncate font-bold text-emerald-800" title={selName}>
          {selName || '欄を選んでください'}
        </span>
        <span className="font-mono text-slate-400">fx</span>
        <span className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-800" aria-label="選んでいる欄の値">
          {bar.replace(/\n/g, ' ／ ') || '　'}
        </span>
      </div>
      <p className="px-3 py-1 text-[11px] leading-4 text-slate-600">
        欄を選んで打ち込みます（<b>Enter で下へ・Tab で右へ</b>・矢印で移動・ダブルクリックか F2 で書き直す・Delete で消す・Esc でやめる・Ctrl+Z で元に戻す）。
        内容に品名を打つと部材リストの候補が出ます（★お気に入りが先。空のまま F2 で★だけ）。<b>備考に定価を入れると単価は 定価×{s.estimateRate}</b>。
        数量に 0.15 や 60cm と入れると切って使う長さ。いちばん下の緑の行に打つと行が増え、改修場所を打つと箇所が増えます。
        {form === 'kouiki' ? '「材／手」の欄で「手」にすると施工費の行（数量は時間）。' : '内容に「同上施工費」と打つと施工費の行（単価に金額）。'}
        介護保険の対象外は、その欄でスペースかダブルクリック。<b>行の左の「＋」でその下に1行入れる・「✕」でその行を消す</b>（何も打たなければ空白の行のまま）。
      </p>
      <div
        ref={scrollRef}
        className="est-sheet relative overflow-auto bg-slate-500"
        style={{padding: PAD}}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div style={{width: PAGE_W * scale, height: innerH * scale}}>
          <div ref={innerRef} className="relative" style={{width: PAGE_W, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
            {form === 'kouiki' ? (
              <KouikiForm job={job} settings={s} sheet={{mark}} />
            ) : (
              <YukuhashiForm job={job} settings={s} date={meta.date} sheet={{mark}} />
            )}
            {box && <div className="sheet-sel" style={{left: box.x, top: box.y, width: box.w, height: box.h}} />}
            <textarea
              ref={inputRef}
              className={`sheet-input ${editing ? 'editing' : ''}`}
              style={taStyle}
              rows={rows}
              value={editing ? edit.value : ''}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onCopy={onCopy}
              onBlur={(e) => {
                // 見積書の外（ボタンなど）を押したら、打ち込んでいた値を入れる（Excel と同じ）
                if (edit && !scrollRef.current?.contains(e.relatedTarget as Node | null) && !sugRef.current?.contains(e.relatedTarget as Node | null)) {
                  commit(edit.value, null, null, true);
                }
              }}
              onCompositionStart={() => {
                if (!edit && sel && !isToggle(sel.key)) setEdit({mode: 'enter', value: ''});
              }}
              aria-label={selName || '見積書の欄'}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      </div>
      {sugPos && (
        <div
          ref={sugRef}
          className="fixed z-50 w-[440px] max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-emerald-300 bg-white text-sm shadow-2xl"
          style={{left: sugPos.left, top: sugPos.top}}
          onMouseDown={(e) => e.preventDefault()}
          role="listbox"
          aria-label="候補"
        >
          <div className="max-h-[300px] overflow-y-auto">
            {suggestions.map((x, i) => (
              <button
                key={`${x.value}-${i}`}
                type="button"
                role="option"
                aria-selected={i === hl}
                onMouseEnter={() => setHl(i)}
                onClick={() => commit(x.value, x.pick, null)}
                className={`block w-full px-3 py-1.5 text-left ${i === hl ? 'bg-emerald-100' : 'hover:bg-emerald-50'}`}
              >
                <div className="truncate font-bold text-slate-800">{x.label}</div>
                {x.sub && <div className="truncate text-[11px] text-slate-500">{x.sub}</div>}
              </button>
            ))}
          </div>
          {textCell && (
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-500">↑↓で選んで Enter（選ばずに Enter なら打った文字のまま）</div>
          )}
        </div>
      )}
    </section>
  );
}

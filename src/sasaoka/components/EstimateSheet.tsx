// 見積書に直接入力する（Excel のように欄を選んで打ち込む）。見積書と同じ形のまま、打ち込んだ値は様邸の行（部材・取付手間）に入り、
// 仕切り計算表・請求書も同じ行から作る。操作は Excel と同じ：
//   欄を選んで打ち込むと書き換え／Enter で下・Tab で右・矢印で移動／F2 かダブルクリックで書き直す／Delete で消す／Esc でやめる／Ctrl+Z で元に戻す・Ctrl+Y でやり直す
//   （元に戻す・やり直すのボタンや、画面の説明は置かない。ユーザーの指示）
//   行：左の「挿入」で下に1行・「✕」で消す・「コピー」→ 貼り付けたい行の「貼付」（Ctrl+C／Ctrl+X → 行を選んで Ctrl+V も同じ。Esc でコピーをやめる）
//   Ctrl+Shift+＋ で下に1行・Ctrl+－ で行を消す・Alt+↓ で候補（改修場所・改修の種類）・Ctrl+P で印刷
// 内容（品名）は部材リストから選べる（★お気に入りが先）。備考（算出根拠）に定価を入れると、単価は 定価×0.8。
// いちばん下の空いた行に打ち込むと行が増え、改修場所を打ち込むと箇所が増える。
// 日本語入力（IME）がそのまま使えるように、選んだ欄の上にいつも見えない入力欄を置いておき、打ち始めたら見えるようにする。

import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent} from 'react';
import {circled, KINDS, materialText} from '../estimateForms.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {KouikiForm, YukuhashiForm} from '../print/EstimateForms.tsx';
import {applySheet, deleteLine, insertBlankAfter, lineRows, parseDate, parsePlace, pasteLines, sheetTarget, sheetValue, toggleExcluded} from '../sheetEdit.ts';
import {getClip, setClip, useClip} from '../sheetClip.ts';
import type {EstimateForm, Job, Material, Settings} from '../types.ts';
import {matchesAll, todayIso, yen} from '../util.ts';
import {useToast} from './ui.tsx';

/** 入力の画面の用紙の幅を px に（A4横 297mm に、行の左の「挿入」「✕」「コピー」の分 3mm を足す。sasaoka.css の .est-sheet .form-page と同じ） */
const PAGE_W = (300 / 25.4) * 96;
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
  note: '備考（定価等）',
  name: '改修場所（箇所名）',
  work: '改修の種類',
  kind: '改修の種類',
  photo: '写真番号',
  mark: '材／手',
  customer: 'お客様名',
  insuredNo: '介護保険被保険者番号',
  address: '工事場所（住所）',
};

/** 保存のときに付く updatedAt のほかは同じ見積書か */
const sameJob = (a: Job, b: Job) => a === b || JSON.stringify({...a, updatedAt: 0}) === JSON.stringify({...b, updatedAt: 0});

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
  onPickMaterial: (placeId: string | null, rowId: string | null) => void; // null：新しい箇所に。rowId：選んでいる行（そこに入れる）
  onPickLabor: (placeId: string | null, rowId: string | null) => void; // rowId：選んでいる行（部材ならその同上施工費・空白の行ならその行に。`laborSpot`）。null：箇所の施工費
  onPickKit: (placeId: string | null, rowId: string | null) => void;
  onPrint: () => void;
}) {
  const estDate = estimateDateOf(job); // 見積もり作成日（右上の作成日）
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
  const jobRef = useRef(job); // いちばん新しい見積書（入れたらすぐ書きかえる）
  const seen = useRef(job); // 最後に画面に出した見積書
  const own = useRef<Job | null>(null); // この見積書の欄で入れた変更（保存のときに updatedAt だけが付いて戻ってくる）
  const lastOutside = useRef(0);
  // 見積書の外（部材リストから入れる・保険者・担当・請求書に入れる など）で変わったときも、Ctrl+Z でその前に戻せるようにする
  //（戻すのは見積書の全体なので、記録しないと Ctrl+Z でそちらの変更まで消えてしまう）。続けて変わったもの（打ち込みなど）は1回にまとめる
  useLayoutEffect(() => {
    if (job === seen.current) return;
    const prev = seen.current;
    seen.current = job;
    const mine = own.current !== null && sameJob(job, own.current);
    own.current = null;
    jobRef.current = job;
    if (mine || sameJob(job, prev)) return;
    const now = Date.now();
    if (now - lastOutside.current > 1000) pushUndo(prev);
    lastOutside.current = now;
    redoStack.current = [];
  }, [job]);
  const ctx = {settings: s, form, materials};
  const clip = useClip();

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
      if (sel && !el) {
        // 選んでいた欄がなくなった（白紙に戻したときなど）。お客様名が空ならお客様名の欄を選ぶ（すぐ打ち込める）
        const customer: Sel = {key: 'job:customer', occ: 0};
        setSel(form === 'yukuhashi' && !jobRef.current.customer.trim() && findCell(customer) ? customer : null);
      }
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

  // ---------------------------------------------------------------- 入れる・元に戻す（Ctrl+Z）・やり直す（Ctrl+Y）
  function pushUndo(prev: Job) {
    undoStack.current.push(prev);
    if (undoStack.current.length > 100) undoStack.current.shift();
  }
  const put = (next: Job) => {
    jobRef.current = next;
    own.current = next;
    setJob(() => next);
  };
  const change = (next: Job) => {
    const prev = jobRef.current;
    if (next === prev) return;
    pushUndo(prev);
    redoStack.current = [];
    put(next);
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(jobRef.current);
    put(prev);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    pushUndo(jobRef.current);
    put(next);
  };
  // 見積書の欄を選んでいないとき（ボタンを押したあと・部材を選ぶ画面を閉じたあとなど）も Ctrl+Z／Ctrl+Y が効くように。
  // 文字を打つ欄（お客様名など）の中ではブラウザの元に戻す（その欄の文字）、部材を選ぶ画面などが開いているときは何もしない
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="month"]):not([type="date"])')) return;
      if (document.querySelector('[role="dialog"], .print-overlay')) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redoRef.current();
      else undoRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** 打ち込んだ値を入れる。then：入れたあとに動く向き。keepSel：選んでいる欄を変えない（見積書の外を押したとき。そちらに文字が入るように） */
  const commit = (value: string, pick: Material | null, then: Dir | null, keepSel = false) => {
    if (!sel) return;
    const key = sel.key;
    if (key === 'date') {
      const d = parseDate(value);
      if (d !== null) change({...jobRef.current, estDate: d || todayIso()}); // 消したら当日
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
    setEdit({mode, value: mode === 'edit' ? sheetValue(jobRef.current, sel.key, ctx, estDate) : ''});
    setHl(-1);
  };

  /** 候補を全部出す（改修場所・改修の種類の欄の ▼ と Alt+↓） */
  const openList = () => {
    if (!sel) return;
    setEdit({mode: 'enter', value: ''});
    setHl(-1);
    inputRef.current?.focus({preventScroll: true});
  };

  // ---------------------------------------------------------------- 候補（内容は部材リスト・★お気に入り、改修の種類は①〜⑥、改修場所は箇所の名前）
  const field = sel?.key.split(':').pop() ?? '';
  const target = sel ? sheetTarget(job, sel.key) : {place: null, row: null};
  const textCell = !!sel && field === 'text' && (sel.key.startsWith('new:') ? mark === '材' : target.row?.kind === 'material');
  const kindCell = !!sel && (field === 'work' || field === 'kind');
  // 改修場所（箇所名）：設定の「箇所の名前」から選べる（手で打ってもよい）
  const placeCell = !!sel && field === 'name' && (sel.key.startsWith('place:') || sel.key === 'new:name');
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
    if (placeCell) {
      // 写真番号（①）を付けて打っていても、名前の部分で探す
      const name = parsePlace(q).name;
      return s.placePresets
        .filter((p) => !name || matchesAll(p, name))
        .map((p) => ({label: p, sub: '', value: p, pick: null}));
    }
    return [];
  }, [edit, textCell, kindCell, placeCell, materials, s.placePresets]);

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
      // Ctrl+Shift+＋（テンキーの＋）：選んでいる行の下に1行入れる／Ctrl+－：選んでいる行を消す（Excel と同じ）
      if (ctrl && (e.key === '+' || e.code === 'NumpadAdd')) {
        e.preventDefault();
        const id = lineIdOf(sel);
        if (id) insertRow(id);
        return;
      }
      if (ctrl && (e.key === '-' || e.code === 'NumpadSubtract')) {
        e.preventDefault();
        const id = lineIdOf(sel);
        if (id) deleteRow(id);
        return;
      }
      if (ctrl && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); // Ctrl+P：見積書を印刷（入力の画面ではなく）
        onPrint();
        return;
      }
      if (ctrl) return; // コピー・切り取り・貼り付けは onCopy・onCut・onPaste
      if (e.key === 'Escape' && getClip()) {
        e.preventDefault(); // コピーをやめる（Excel と同じ）
        setClip(null);
        return;
      }
      if (e.altKey && e.key === 'ArrowDown' && (placeCell || kindCell)) {
        e.preventDefault(); // Alt+↓：候補を開く（Excel のリストと同じ）
        openList();
        return;
      }
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

  /** 欄の文字（Ctrl+C で OS の貼り付けに入れる） */
  const cellText = () => (sel ? sheetValue(jobRef.current, sel.key, ctx, estDate) || findCell(sel)?.innerText || '' : '');
  /** 明細の行の欄（line:・excl:）か。行の欄の Ctrl+C／Ctrl+X は行をコピー・切り取り */
  const rowCell = (x: Sel | null) => !!x && /^(line|excl):/.test(x.key);

  // Ctrl+C：明細の行の欄なら、その行（部材は同上施工費ごと）をコピー。OS の貼り付けにも欄の文字を入れる（ほかのアプリに貼れる）。
  // ほかの欄（お客様名・改修場所など）は欄の文字だけ
  const onCopy = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (edit || !sel) return;
    e.preventDefault();
    const text = cellText();
    e.clipboardData.setData('text/plain', text);
    const id = rowCell(sel) ? lineIdOf(sel) : null;
    if (!id || !copyRow(id, false, text)) setClip(null);
  };
  // Ctrl+X：明細の行なら切り取り（貼り付けたときに移す）。ほかの欄は文字を切り取る（欄を空にする）
  const onCut = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (edit || !sel) return;
    e.preventDefault();
    const text = cellText();
    e.clipboardData.setData('text/plain', text);
    const id = rowCell(sel) ? lineIdOf(sel) : null;
    if (id && copyRow(id, true, text)) return;
    setClip(null);
    if (!isToggle(sel.key)) commit('', null, null);
  };
  // Ctrl+V：コピーした行があり、OS の貼り付けがそのとき入れた文字のままなら、選んでいる行の下に行を貼り付ける。
  // ほかの所で文字をコピーしたあと（文字が違う）なら、ふつうに欄に文字を貼り付ける（打ち込んだのと同じ）
  const onPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (edit || !sel) return;
    const c = getClip();
    if (!c) return;
    if (c.text !== null && e.clipboardData.getData('text/plain') !== c.text) {
      setClip(null);
      return;
    }
    e.preventDefault();
    pasteAt(pasteTarget());
  };

  // ---------------------------------------------------------------- 行のコピー・切り取り・貼り付け・入れる・消す
  /** 選んでいる欄の明細の1行（その行の最初の入力の行）。いちばん下の空いた行・明細でない欄は null */
  const lineIdOf = (x: Sel | null) => findCell(x)?.closest('tr')?.getAttribute('data-rows')?.split(' ')[0] ?? null;

  /** 行をコピー（cut：切り取り）。text：OS の貼り付けに入れた文字（Ctrl+C／Ctrl+X のとき） */
  const copyRow = (rowId: string, cut: boolean, text: string | null) => {
    const rows = lineRows(jobRef.current, rowId);
    if (!rows) return false;
    const head = rows[0];
    const label = head.kind === 'labor' ? (head.estText ?? (rows.length > 1 || head.refId ? '施工費' : head.name || '施工費')) : head.estText ?? materialText(head);
    setClip({rows: rows.map((r) => ({...r})), label, sourceIds: rows.map((r) => r.id), jobId: jobRef.current.id, cut, text});
    // ボタンで押したときも、ほかのアプリに貼り付けられるよう品名を入れておく（入れられたら、Ctrl+V で行を貼り付ける目印にする）
    if (text === null) {
      void navigator.clipboard
        ?.writeText(label)
        .then(() => {
          const c = getClip();
          if (c && c.sourceIds[0] === head.id) setClip({...c, text: label});
        })
        .catch(() => undefined);
    }
    toast(`${cut ? '切り取りました' : 'コピーしました'}：「${label}」`);
    return true;
  };

  /** コピーした行を貼り付ける（欄のキーの行のすぐ下。空白の行ならその行に） */
  const pasteAt = (key: string) => {
    const c = getClip();
    if (!c) return;
    const res = pasteLines(jobRef.current, key, c.rows, c.cut && c.jobId === jobRef.current.id ? c.sourceIds : []);
    if (!res.rowId) {
      toast('貼り付ける行を選んでください', 'error');
      return;
    }
    change(res.job);
    setSel({key: `line:${res.rowId}:text`, occ: 0});
    setEdit(null);
    if (c.cut) setClip(null);
    toast(c.cut ? `「${c.label}」を移しました` : `「${c.label}」を貼り付けました`);
    inputRef.current?.focus({preventScroll: true});
  };
  const pasteTarget = () => {
    const id = lineIdOf(sel);
    return id ? `line:${id}:text` : (sel?.key ?? '');
  };

  const insertRow = (rowId: string) => {
    const res = insertBlankAfter(jobRef.current, rowId);
    change(res.job);
    if (res.rowId) setSel({key: `line:${res.rowId}:text`, occ: 0});
    inputRef.current?.focus({preventScroll: true});
  };
  const deleteRow = (rowId: string) => {
    change(deleteLine(jobRef.current, rowId));
    setSel(null);
    toast('行を消しました');
  };

  // ---------------------------------------------------------------- マウス
  const onMouseDown = (e: ReactMouseEvent) => {
    let t = e.target as HTMLElement;
    if (sugRef.current?.contains(t)) return;
    if (t.closest('[data-del], [data-ins], [data-copy], [data-paste], [data-drop]')) {
      e.preventDefault(); // 行の左の「挿入」「✕」「コピー」「貼付」、欄の「▼」：欄は選ばない（押し終わったら onClick で入れる・消す・コピー・貼り付け・候補を出す）
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
  // 行の左の「挿入」：その行の下に空白の行を入れて、内容の欄を選ぶ（そのまま打ち込める）。
  // 「✕」：その行（部材は同上施工費ごと）を消す。箇所の行がなくなれば箇所も消す（その行が空白になる）。
  // 「コピー」：部材は同上施工費ごと、施工費はそのまとまりをコピーする。コピーしているあいだは「貼付」：その行の下に貼り付ける
  const onClick = (e: ReactMouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ins], [data-copy], [data-paste], [data-del]');
    if (!btn) return;
    if (edit && sel) commit(edit.value, null, null, true); // 打ち込んでいた値を入れてから
    if (btn.dataset.ins) insertRow(btn.dataset.ins);
    else if (btn.dataset.copy) {
      copyRow(btn.dataset.copy, false, null);
      inputRef.current?.focus({preventScroll: true});
    } else if (btn.dataset.paste) pasteAt(btn.dataset.paste === 'new' ? 'new:text' : `line:${btn.dataset.paste}:text`); // new：いちばん下に
    else if (btn.dataset.del) deleteRow(btn.dataset.del);
  };
  const onDoubleClick = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (sugRef.current?.contains(t) || edit) return;
    if (t === inputRef.current || t.closest('[data-edit]')) {
      e.preventDefault();
      startEdit('edit');
    }
  };

  // ---------------------------------------------------------------- ツールバー（部材・施工費を入れる。行を入れる・消すは行の左の「挿入」「✕」）
  const row = target.row;
  const place = target.place;

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

  // コピーした行の印・行の左の「貼付」（コピーした行があるあいだ）
  const sheetOpts = {mark, copied: clip && clip.jobId === job.id ? clip.sourceIds : [], pasting: clip !== null};

  const selName = sel ? FIELD_NAMES[field] ?? (sel.key.startsWith('excl:') ? '介護保険の対象／対象外' : sel.key.startsWith('overhead:') ? '諸経費' : sel.key === 'date' ? '作成日' : '') : '';
  const bar = editing ? edit.value : sel ? (sel.key === 'new:mark' ? mark : sheetValue(job, sel.key, ctx, estDate)) : '';

  return (
    <section className="overflow-hidden rounded-xl border-2 border-emerald-800 bg-white shadow-sm" aria-label="見積書">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-base">
        <button type="button" className="sheet-tool tool-material" onClick={() => onPickMaterial(place?.id ?? null, row?.id ?? null)}>
          📋 部材リストから入れる
        </button>
        <button type="button" className="sheet-tool tool-labor" onClick={() => onPickLabor(place?.id ?? null, row?.id ?? null)}>
          🔧 施工費から入れる
        </button>
        <button type="button" className="sheet-tool tool-kit" onClick={() => onPickKit(place?.id ?? null, row?.id ?? null)}>
          ＋ 部材＋施工費（常用）から入れる
        </button>
      </div>
      {clip && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" role="status">
          <span className="font-bold">
            {clip.cut ? '✂ 切り取り中' : '📋 コピー中'}：「{clip.label}」
          </span>
          <button
            type="button"
            className="ml-auto rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-amber-900 hover:bg-amber-100"
            onClick={() => setClip(null)}
          >
            やめる
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1 text-xs">
        <span className="w-28 shrink-0 truncate font-bold text-emerald-800" title={selName}>
          {selName}
        </span>
        <span className="font-mono text-slate-400">fx</span>
        <span className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-800" aria-label="選んでいる欄の値">
          {bar.replace(/\n/g, ' ／ ') || '　'}
        </span>
      </div>
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
            {form === 'kouiki' ? <KouikiForm job={job} settings={s} sheet={sheetOpts} /> : <YukuhashiForm job={job} settings={s} date={estDate} sheet={sheetOpts} />}
            {box && <div className="sheet-sel" style={{left: box.x, top: box.y, width: box.w, height: box.h}} />}
            {/* 改修場所・改修の種類の欄の「▼」：候補から選ぶ（Excel のリストと同じ。Alt+↓ でも開く） */}
            {box && !editing && (placeCell || kindCell) && (
              <button
                type="button"
                className="sheet-drop"
                data-drop=""
                style={{left: box.x + box.w - 15, top: box.y + Math.max(0, (box.h - 14) / 2)}}
                onClick={openList}
                aria-label={`${selName}を候補から選ぶ`}
              >
                ▼
              </button>
            )}
            <textarea
              ref={inputRef}
              className={`sheet-input ${editing ? 'editing' : ''}`}
              style={taStyle}
              rows={rows}
              value={editing ? edit.value : ''}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onCopy={onCopy}
              onCut={onCut}
              onPaste={onPaste}
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
        </div>
      )}
    </section>
  );
}

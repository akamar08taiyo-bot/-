// 見積書に直接入力する（Excel のように欄を選んで打ち込む）。見積書と同じ形のまま、打ち込んだ値は様邸の行（部材・取付手間）に入り、
// 仕切り計算表・請求書も同じ行から作る。操作は Excel と同じ：
//   欄を選んで打ち込むと書き換え／Enter で下・Tab で右・矢印で移動／F2 かダブルクリックで書き直す／Delete で消す／Esc でやめる／Ctrl+Z で元に戻す・Ctrl+Y でやり直す
//   （元に戻す・やり直すのボタンや、画面の説明は置かない。ユーザーの指示）
//   部材・施工費・部材＋施工費（常用）は、空いた行の内容の欄の左に薄く出す「部材｜施工費｜常用」を押して入れる（ユーザーの指示「枠内に薄っすら、部材、施工費どちらか
//   選べるよう、押せるようにする。施工費を押したら、プルダウンでリストを出す。部材を押したら、検索画面が出る。直接品番を入力しても検索がかかるのが、わかるようにもする」
//   「内容の中に、部材・施工費・常用の３つをおくが、内容の中の枠内の左によせる。マウスを乗せたら、光るなどわかるようにする」2026-11-03）。部材＝部材を選ぶ画面、
//   施工費＝施工費のリスト（`addLaborAt`）、常用＝部材＋施工費（常用）の画面。空いた欄を選ぶと右に「品番を打つと検索」、打つと部材リストの候補（見出しつき）。
//   行の「挿入」（下に1行）・「削除」・「コピー」→ 貼り付けたい行を選んで「貼付」は、選んでいる行の改修内容の左（見積書の余白）に小さく
//   （ユーザーの指示「改修内容の横に、挿入、削除、コピー、貼り付けボタンを小さくもってくる（工事費見積書の枠内）」「右の空いたスペースにのせたら、そのセルを選択している
//   ことが認識でき、削除やコピーなどをおこなえるようにする」2026-11-03。選んでいる行は薄い緑。Ctrl+C／Ctrl+X → 行を選んで Ctrl+V も同じ。Esc でコピーをやめる）。
//   見積書の左（前の「部材リストから入れる」などの所）は「Excelで保存」「見積書を印刷」（ユーザーの指示「現在の部材リスト、施工費から入れると書いてある場所には、
//   印刷とExcel保存のボタンを設置」2026-11-03）
//   Ctrl+Shift+＋ で下に1行・Ctrl+－ で行を消す・Alt+↓ で候補（改修場所・改修の種類）・Ctrl+P で印刷
// 内容（品名）は部材リストから選べる（★お気に入りが先）。備考（算出根拠）に定価を入れると、単価は 定価×0.8。
// いちばん下の空いた行に打ち込むと行が増え、改修場所を打ち込むと箇所が増える。
// 日本語入力（IME）がそのまま使えるように、選んだ欄の上にいつも見えない入力欄を置いておき、打ち始めたら見えるようにする。

import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, ClipboardEvent as ReactClipboardEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode} from 'react';
import {isBlankRow, rounddown, startEstimate} from '../calc.ts';
import {circled, KINDS, materialText, offEstimate, photoNumbers} from '../estimateForms.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {KouikiForm, YukuhashiForm} from '../print/EstimateForms.tsx';
import {applySheet, bindShinseiPlace, deleteLine, describeKey, dropEmptyPlaces, FIELD_NAMES, insertBeforeId, insertBlankBefore, isPlaceHeadKey, laborCountAt, lineRows, parseDate, parseMark, parsePlace, pasteLines, placeOfKey, removePlaceFromEstimate, SHINSEI_PLACE, sheetTarget, sheetValue, stepLaborAt, toggleExcluded, toolPlace} from '../sheetEdit.ts';
import {getClip, setClip, useClip} from '../sheetClip.ts';
import type {EstimateForm, Job, LaborItem, Material, Settings} from '../types.ts';
import {matchesAll, noHyphen, searchKey, todayIso, yen} from '../util.ts';
import {Btn, useToast} from './ui.tsx';
import {BOOKS, type BookId} from '../makerCatalogs.ts';

/** 広域連合用の「材／手」の欄（いちばん下の行 new:mark・明細の行 line:…:mark・空いた行 gap:…:mark） */
const isMarkKey = (k: string) => k.endsWith(':mark');

/** 入力の画面の用紙の幅を px に（A4横 297mm に、行の左の「挿入」「✕」「コピー」の分 3mm を足す。sasaoka.css の .est-sheet .form-page と同じ） */
const PAGE_W = (300 / 25.4) * 96;
const PAD = 12;

type Sel = {key: string; occ: number};
/** 打ち込んでいる欄。initial：F2・ダブルクリックで開いたときの欄の値（そのまま確定したら入れない） */
type Edit = {mode: 'enter' | 'edit'; value: string; initial?: string};
type Dir = 'up' | 'down' | 'left' | 'right' | 'next' | 'prev';
/** pickL：空いた行の内容の欄（「部材｜施工費｜常用」のある欄）なら、「部材」の左の端（打ち込む所は欄の左の端からここまで） */
/** end：欄の字の末尾（最後の字の右の端と、その行の上下。字のない欄は null）。点滅するカーソルをそこに出す */
type Box = {x: number; y: number; w: number; h: number; font: string; family: string; align: string; pickL: number | null; endX: number | null; endY: number | null; endH: number | null};

/** 右寄せの欄（数量・単価・金額など数字の欄）。カーソルと打つ字は右端に（ユーザーの指示「左側でちかちかさせるのではなく、一番右に置く」2026-11-12） */
const rightCell = (b: Box) => b.align === 'right' || b.align === 'end';

/** 点滅するカーソルの高さ：欄の字の大きさほど（欄より少し低く） */
const caretH = (b: Box) => Math.max(8, Math.min(b.h - 4, parseFloat(b.font) * 1.2));

/**
 * 欄に見えている字の、最後の1字の四角（画面の上の位置）。「部材｜施工費｜常用」などのボタンの字は数えない。字がなければ null。
 * 点滅するカーソルを字の末尾に出すため（ユーザーの指示「チカチカする編集マークは末尾につける」2026-11-12）
 */
function textEndRect(el: HTMLElement): DOMRect | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('.sheet-pick, button, [data-pick]') ? NodeFilter.FILTER_REJECT : (n.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  let last: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n as Text;
  if (!last) return null;
  const text = last.textContent ?? '';
  let end = text.trimEnd().length;
  let start = end - 1;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) start -= 1; // 2つで1字の字（絵文字など）
  const range = document.createRange();
  range.setStart(last, Math.max(0, start));
  range.setEnd(last, end);
  const rects = range.getClientRects();
  const r = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  return r.width || r.height ? r : null;
}

/** 点滅するカーソルの位置：字があれば最後の字のすぐ右（欄の中に収める）、字がなければ欄の左の端（右寄せの数字の欄は右の端） */
function caretStyle(b: Box) {
  if (b.endX !== null && b.endY !== null && b.endH !== null) {
    const h = Math.max(8, Math.min(b.h - 4, b.endH));
    const mid = b.endY + b.endH / 2;
    return {left: Math.max(b.x + 2, Math.min(b.x + b.w - 4, b.endX + 1)), top: Math.max(b.y + 1, Math.min(b.y + b.h - h - 1, mid - h / 2)), height: h};
  }
  return {left: rightCell(b) ? b.x + b.w - 7 : b.x + 4, top: b.y + (b.h - caretH(b)) / 2, height: caretH(b)};
}

/** 打った字の幅（見積書の中の大きさ。いちばん長い行） */
let measureCtx: CanvasRenderingContext2D | null = null;
const textWidth = (text: string, b: Box): number => {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = `${b.font} ${b.family}`;
  return Math.max(0, ...text.split('\n').map((l) => measureCtx!.measureText(l).width));
};

/** 保存のときに付く updatedAt のほかは同じ見積書か */
const sameJob = (a: Job, b: Job) => a === b || JSON.stringify({...a, updatedAt: 0}) === JSON.stringify({...b, updatedAt: 0});

export function EstimateSheet({
  job,
  settings: s,
  form,
  materials,
  labor,
  setJob,
  onPickMaterial,
  onPickKit,
  onToggleFavorite,
  onPrint,
  excel,
  between,
  focusRow,
}: {
  job: Job;
  settings: Settings;
  form: EstimateForm;
  materials: Material[];
  labor: LaborItem[]; // 空いた行の「施工費」のリスト（📦 部材・施工費マスタの施工費）
  setJob: (fn: (j: Job) => Job) => void;
  // null：箇所がまだない（新しい箇所に）。rowId：選んでいる行（そこに入れる）。book：初めからそのカタログのページを出す（見積書の左の「📖 マツ六」など）
  onPickMaterial: (placeId: string | null, rowId: string | null, book?: BookId) => void;
  onPickKit: (placeId: string | null, rowId: string | null) => void;
  onToggleFavorite: (materialId: string) => void; // 品番・品名を打ったときの候補の ☆（部材リストの★お気に入りに入れる・外す）
  onPrint: () => void;
  excel?: ReactNode; // 見積書の左の「📗 Excelで保存」（上の段と同じ。App.tsx の DocsButton）
  // 「部材リストから入れる」などの行のすぐ下に出すもの（工事見積書の保険者・担当・作成日・請求書の行。EstimateEditor.tsx）
  between?: ReactNode;
  // この行を選ぶ（部材を選ぶ画面で最後に入れた行。n が変わるたびに）。続けて「施工費」を押すと、その部材の同上施工費になる。
  // id が null はいちばん下の空いた行。labor：部材を選ぶ画面の「🔧 施工費に進む」（その行の施工費のリストも開く）
  focusRow?: {id: string | null; n: number; labor?: boolean} | null;
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
  const [focused, setFocused] = useState(false); // 見積書の入力欄に打てる（点滅するカーソルを出す）
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
  const lastPlace = useRef<string | null>(null); // 最後に選んだ欄の箇所（ツールバーから入れる箇所。`toolPlace`）
  useEffect(() => {
    if (!focusRow) return;
    if (focusRow.id !== null && !job.places.some((p) => p.rows.some((r) => r.id === focusRow.id))) return;
    const at = {key: focusRow.id === null ? 'new:text' : `line:${focusRow.id}:text`, occ: 0};
    setEdit(null);
    setSel(at);
    if (focusRow.labor) {
      setLaborMenu(at);
      setLaborHl(0);
    }
  }, [focusRow?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // 見積書の外（部材リストから入れる・保険者・担当・請求書に入れる など）で変わったときも、Ctrl+Z でその前に戻せるようにする
  //（戻すのは見積書の全体なので、記録しないと Ctrl+Z でそちらの変更まで消えてしまう）。続けて変わったもの（打ち込みなど）は1回にまとめる
  useLayoutEffect(() => {
    if (job === seen.current) return;
    const prev = seen.current;
    seen.current = job;
    // 見積書を書きはじめた1行目は、見積もり作成日などが付いて戻ってくる（EstimateEditor の setJob の startEstimate）。それもこの欄の変更
    //（前は外の変更とみて、Ctrl+Z を2回押さないと戻らなかった）
    const mine = own.current !== null && (sameJob(job, own.current) || sameJob(job, startEstimate(prev, own.current)));
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

  /**
   * 空いた行の打たない欄（金額など）を押したときは、その行のいちばん近い打てる欄（打ち込める行の下の空いた行は、その行に打てる。
   * ほかのページの空いた行など、打てる欄のない行は打ち込める行（data-new）の同じ列）
   */
  const newRowCell = (td: HTMLElement | null): HTMLElement | null => {
    const own = td?.closest('tr');
    const row = own?.querySelector('[data-edit]') ? own : innerRef.current?.querySelector<HTMLElement>('tr[data-new]');
    if (!row) return null;
    const editable = Array.from(row.querySelectorAll<HTMLElement>('[data-edit]'));
    if (!td) return editable[0] ?? null;
    const r = td.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const dist = (c: HTMLElement) => {
      const b = c.getBoundingClientRect();
      return b.left <= cx && cx <= b.right ? 0 : Math.min(Math.abs(b.left - cx), Math.abs(b.right - cx));
    };
    return editable.reduce<HTMLElement | null>((best, c) => (!best || dist(c) < dist(best) ? c : best), null);
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
    const pick = el.querySelector<HTMLElement>(':scope > .sheet-pick');
    const end = textEndRect(el);
    const next: Box = {
      x: (r.left - b.left) / scale,
      y: (r.top - b.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
      font: cs.fontSize,
      family: cs.fontFamily,
      align: cs.textAlign,
      pickL: pick ? Math.round(((pick.firstElementChild ?? pick).getBoundingClientRect().left - b.left) / scale * 10) / 10 - 2 : null,
      endX: end ? Math.round(((end.right - b.left) / scale) * 10) / 10 : null,
      endY: end ? Math.round(((end.top - b.top) / scale) * 10) / 10 : null,
      endH: end ? Math.round((end.height / scale) * 10) / 10 : null,
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
      // 見出しの欄（お客様名・被保険者番号・工事場所。1行に1つ）から上下へは、真下（真上）になくても次の見出しの欄へ。
      // 被保険者番号は（　）の中だけが打つ所なので、お客様名の真下にない（2026-11-04。前は Enter で被保険者番号をとばして明細の行へ行った）
      const head = (c: HTMLElement) => c.dataset.edit?.startsWith('job:');
      for (let k = ri + step; k >= 0 && k < rows.length && !target; k += step) {
        target =
          rows[k].find((c) => {
            const r = c.getBoundingClientRect();
            return r.left - 1 <= cx && cx <= r.right + 1;
          }) ?? (head(cur) ? rows[k].find(head) : undefined);
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

  // 開いたときに、何も入っていない箇所を外す（前の版の「🔧 施工費から入れる」などが残した空の箇所。いちばん下の行がその箇所になり、
  // そこに打った施工費が②になった。`dropEmptyPlaces`）。開いただけの直しなので、Ctrl+Z の対象にしない（put）
  useEffect(() => {
    const next = dropEmptyPlaces(jobRef.current);
    if (next !== jobRef.current) put(next);
  }, []);

  /** 打ち込んだ値を入れる。then：入れたあとに動く向き。keepSel：選んでいる欄を変えない（見積書の外を押したとき。そちらに文字が入るように） */
  const commit = (value: string, pick: Material | null, then: Dir | null, keepSel = false) => {
    if (!sel) return;
    const key = sel.key;
    // F2・ダブルクリックで開いて何も変えずに確定したとき（Enter・Tab・ほかの欄を押す・💾保存）は入れない。入れると、諸経費が手で入れた金額になって
    // 行を足しても変わらない・切って使う手すり（600mm×2本）が丸めた数量の長さ（1200mm×1本）になる、などが起きていた
    const unchanged = edit?.mode === 'edit' && !pick && value === edit.initial;
    if (unchanged) {
      // 何もしない（下で欄を閉じて、動く向きだけ入れる）
    } else if (key === 'date') {
      const d = parseDate(value);
      if (d !== null) change({...jobRef.current, estDate: d || todayIso()}); // 消したら当日
    } else if (isMarkKey(key)) {
      const m = parseMark(value);
      if (m !== undefined) setMarkAt(key, m);
    } else if (value.startsWith(SHINSEI_PLACE)) {
      // 改修場所の候補の「申請書の箇所」：その箇所の申請書の内容を読んで、この欄の行をその箇所に（bindShinseiPlace）
      const res = bindShinseiPlace(jobRef.current, key, value.slice(SHINSEI_PLACE.length), ctx);
      change(res.job);
      if (res.key && res.key !== key && !keepSel) setSel({key: res.key, occ: 0});
    } else if (!key.startsWith('excl:')) {
      // 改修場所：番号（③）を変えずに名前だけ直したときは、自動の番号のまま（手で決めた番号にしない。番号を変えたらその番号）
      let v = value;
      if (edit?.mode === 'edit' && edit.initial !== undefined && key.endsWith(':name')) {
        const now = parsePlace(value);
        if (now.photo !== null && now.photo === parsePlace(edit.initial).photo) v = now.name;
      }
      const res = applySheet(jobRef.current, key, v, {...ctx, pick, labor: key.startsWith('new:') && mark === '手'});
      change(res.job);
      if (res.key && res.key !== key && !keepSel) setSel({key: res.key, occ: 0});
    }
    setEdit(null);
    setHl(-1);
    pendingMove.current = then;
  };

  /** 材／手の欄（いちばん下の行は次に打つ行の印、ほかの行はその行の字。ユーザーの指摘「材の部分が選択できない」2026-11-05） */
  const setMarkAt = (key: string, value: '材' | '手' | null) => {
    if (key === 'new:mark') {
      if (value) setMark(value);
      return;
    }
    const res = applySheet(jobRef.current, key, value ?? '', ctx);
    if (res.job !== jobRef.current) change(res.job);
    if (res.key !== key) setSel({key: res.key, occ: 0});
  };
  const toggle = () => {
    if (!sel) return;
    if (sel.key.startsWith('excl:')) change(toggleExcluded(jobRef.current, sel.key.slice(5)));
    else if (sel.key === 'new:mark') setMark((m) => (m === '材' ? '手' : '材'));
    else if (isMarkKey(sel.key)) setMarkAt(sel.key, sheetValue(jobRef.current, sel.key, ctx) === '手' ? '材' : '手'); // 空白の行は初め「手」
  };
  const isToggle = (k: string | undefined) => !!k && (k.startsWith('excl:') || isMarkKey(k));

  const startEdit = (mode: Edit['mode']) => {
    if (!sel) return;
    if (isToggle(sel.key)) {
      toggle();
      return;
    }
    const value = mode === 'edit' ? sheetValue(jobRef.current, sel.key, ctx, estDate) : '';
    setEdit(mode === 'edit' ? {mode, value, initial: value} : {mode, value});
    setHl(-1);
    caretToEnd();
  };
  /** 打つ欄のカーソルを字の末尾に（F2・ダブルクリック・Backspace で打ち直すとき。Excel と同じ） */
  const caretToEnd = () =>
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  /** 選んでいる欄の末尾の1字を消して、打つ状態にする（字のない欄は何もしない） */
  const backspaceOne = () => {
    if (!sel) return;
    const initial = sheetValue(jobRef.current, sel.key, ctx, estDate);
    if (!initial) return;
    setEdit({mode: 'edit', value: Array.from(initial).slice(0, -1).join(''), initial});
    setHl(-1);
    caretToEnd();
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
  const textCell = !!sel && field === 'text' && (sel.key.startsWith('new:') ? mark === '材' : sel.key.startsWith('gap:') || (target.row?.kind === 'material' && target.row.estMark !== '手'));
  const kindCell = !!sel && (field === 'work' || field === 'kind');
  // 改修場所（箇所名）：設定の「箇所の名前」から選べる（手で打ってもよい）
  // 箇所の2行目からの改修場所の欄（split:）も（打つとその行から別の箇所。`splitPlaceAt`）
  const placeCell = !!sel && field === 'name' && (sel.key.startsWith('place:') || sel.key.startsWith('split:') || sel.key.startsWith('gap:') || sel.key === 'new:name');
  const suggestions = useMemo((): {label: string; sub: string; value: string; pick: Material | null; group?: 'shinsei' | 'preset'}[] => {
    if (!edit) return [];
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
      // 上は申請書の箇所（申請書と同じ番号・名前。選ぶと申請書の内容を読む＝bindShinseiPlace）、下は今までの箇所の名前の一覧
      // （ユーザーの指示「リストの中も上部は、申請書に合わせる。その下には、現在と同じ一覧。差別化してわかるようにする」2026-11-12）。
      // 選んでいる欄の箇所そのものは出さない
      const nums = photoNumbers(job, s);
      const own = sel?.key.startsWith('place:') ? sel.key.split(':')[1] : null;
      const shinsei = job.places
        .filter((p) => p.name.trim() && p.id !== own && (!name || matchesAll(p.name, name)))
        .map((p) => {
          const n = nums.get(p.id) ?? 0;
          const inEstimate = !offEstimate(p) && p.rows.some((r) => !isBlankRow(r));
          return {label: `${n > 0 ? circled(n) : ''}${p.name}`, sub: [KINDS[p.kind - 1] ?? '', inEstimate ? '見積書に入っています' : ''].filter(Boolean).join('　'), value: `${SHINSEI_PLACE}${p.id}`, pick: null, group: 'shinsei' as const};
        });
      const presets = s.placePresets.filter((p) => !name || matchesAll(p, name)).map((p) => ({label: p, sub: '', value: p, pick: null, group: 'preset' as const}));
      return [...shinsei, ...presets];
    }
    return [];
  }, [edit, textCell, kindCell, placeCell, materials, s.placePresets, job, sel?.key]);
  // 打った品番（「-」・大文字小文字・全角半角は見ない）か品名とぴったり同じ部材が1つだけなら、↓で選ばなくても Enter・Tab でその部材を入れる
  // （ユーザーの見積書で「BD132」と打って Enter を押したら、部材リストの BD-132 ではなく「BD132」という0円の行になっていた。2026-11-03）
  const exactHl = (() => {
    if (!textCell || !edit) return -1;
    const q = noHyphen(searchKey(edit.value));
    if (!q) return -1;
    const same = suggestions.map((x, i) => (x.pick && (noHyphen(searchKey(x.pick.code)) === q || searchKey(x.pick.name) === searchKey(edit.value)) ? i : -1)).filter((i) => i >= 0);
    return same.length === 1 ? same[0] : -1;
  })();
  const curHl = hl >= 0 ? hl : exactHl;

  // ---------------------------------------------------------------- キーボード（Excel と同じ）
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 日本語の変換中
    const ctrl = e.ctrlKey || e.metaKey;
    // 施工費のリストを開いているとき：↑↓で選ぶ・Enter で入れる・Esc で閉じる
    if (laborMenu && !edit) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setLaborHl((h) => (e.key === 'ArrowDown' ? Math.min(labor.length - 1, h + 1) : Math.max(0, h - 1)));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (labor[laborHl]) chooseLabor(labor[laborHl]);
        return;
      }
      // ＋・→ で1つ増やす、−・← で1つ減らす（リストは開いたまま）
      if (e.key === '+' || e.key === 'ArrowRight' || e.key === '-' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (labor[laborHl]) stepLabor(labor[laborHl], e.key === '+' || e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setLaborMenu(null);
        return;
      }
      setLaborMenu(null);
    }
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
      // Ctrl+Shift+＋（テンキーの＋）：選んでいる行の上に1行入れる／Ctrl+－：選んでいる行を消す（Excel と同じ）
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
      } else if (e.key === 'Backspace' && sel && !isMarkKey(sel.key) && !isToggle(sel.key)) {
        // Backspace は末尾の1字を消して、そのまま打つ状態にする（F2 で打ち直して Backspace を押したときと同じ。続けて押すと1字ずつ消える。
        // ユーザーの指示「文字も一文字ずつでも消せるようにする。EXCELに近づける」2026-11-12。前は欄をまるごと消していた）。欄をまるごと消すのは Delete
        e.preventDefault();
        backspaceOne();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (sel && isMarkKey(sel.key)) setMarkAt(sel.key, null); // 材／手は自動の字に戻す（空白の行は空）
        else if (sel && isPlaceHeadKey(sel.key) && placeOfKey(jobRef.current, sel.key)) deletePlaceAll(); // 改修内容・改修場所：箇所をまるごと
        else if (sel && !isToggle(sel.key)) commit('', null, null);
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
      const chosen = curHl >= 0 ? suggestions[curHl] : null;
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
      if (isMarkKey(sel.key)) {
        const m = parseMark(v);
        if (m) setMarkAt(sel.key, m);
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
  const cellText = () => (sel ? sheetValue(jobRef.current, sel.key, ctx, estDate) || (findCell(sel)?.innerText ?? '').replace(/\u200b/g, '') : ''); // \u200b＝空の被保険者番号の高さだけの字（EstimateForms.tsx）
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
    // お知らせは出さない（上の「📋 コピー中」と行の印で分かる。ユーザーの指示「行を消しましたという文言は不要」2026-10-26。行の操作はみな同じ）
    return true;
  };

  /** コピーした行を貼り付ける（欄のキーの行のすぐ下。空白の行ならその行に） */
  const pasteAt = (key: string) => {
    const c = getClip();
    if (!c) return;
    // ほかの見積書で切り取った行は、もとの見積書から消せないので貼り付けるだけ（前は「移しました」と出て、もとの見積書にも行が残り、請求書に2回入った）
    const move = c.cut && c.jobId === jobRef.current.id;
    // 切り取ったあとに元の行を直していたら、直したあとの行を移す（前は切り取ったときの写しを貼り付けて、あとの直し＝数量など が消えた。2026-11-08 のデバッグ）
    const all = jobRef.current.places.flatMap((p) => p.rows);
    const now = move ? c.sourceIds.map((id) => all.find((r) => r.id === id)) : [];
    const rows = move && now.every(Boolean) ? (now as typeof c.rows).map((r) => ({...r})) : c.rows;
    const res = pasteLines(jobRef.current, key, rows, move ? c.sourceIds : [], s);
    if (!res.rowId) {
      toast('貼り付ける行を選んでください', 'error');
      return;
    }
    change(res.job);
    setSel({key: `line:${res.rowId}:text`, occ: 0});
    setEdit(null);
    if (c.cut) setClip(null);
    inputRef.current?.focus({preventScroll: true});
  };
  const pasteTarget = () => {
    const id = lineIdOf(sel);
    return id ? `line:${id}:text` : (sel?.key ?? '');
  };

  const insertRow = (rowId: string) => {
    const res = insertBlankBefore(jobRef.current, rowId);
    change(res.job);
    setInsertMark(null);
    if (res.rowId) {
      setSel({key: `line:${res.rowId}:text`, occ: 0});
      setFlash(res.rowId);
    }
    inputRef.current?.focus({preventScroll: true});
  };
  // 「＋ 挿入」で行が入る所の線（ボタンにマウスを乗せている・キーボードで選んでいるあいだ）と、入れたばかりの行を少しのあいだ薄い緑に
  // （ユーザーの指示「挿入でいれる場合、どこにスペースが入り挿入できるかが、ややわかりずらいので、わかるようにする」2026-11-03。
  // 部材の行を選んで挿入すると、すぐ下の同上施工費のさらに下に入るので、どこに入るか分かりにくかった）
  const [insertMark, setInsertMark] = useState<{top: number; left: number; width: number} | null>(null);
  // 入る所は選んでいる行（部材は同上施工費ごと）の上の境目（Excel の行の挿入と同じ。ユーザーの指示「挿入の場合、この間に挿入が差し込めるようにする」2026-11-03）
  const showInsertMark = () => {
    const id = lineIdOf(sel);
    const head = id ? insertBeforeId(jobRef.current, id) : null;
    const inner = innerRef.current;
    const tr = head && inner ? inner.querySelector<HTMLElement>(`tr[data-rows~="${CSS.escape(head)}"]`) : null;
    if (!tr || !inner) {
      setInsertMark(null);
      return;
    }
    const a = inner.getBoundingClientRect();
    const b = tr.getBoundingClientRect();
    setInsertMark({top: (b.top - a.top) / scale, left: (b.left - a.left) / scale, width: b.width / scale});
  };
  const [flash, setFlash] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!flash) return;
    const tr = innerRef.current?.querySelector<HTMLElement>(`tr[data-rows~="${CSS.escape(flash)}"]`);
    tr?.setAttribute('data-flash', '');
    const t = window.setTimeout(() => {
      tr?.removeAttribute('data-flash');
      setFlash(null);
    }, 1500);
    return () => {
      window.clearTimeout(t);
      tr?.removeAttribute('data-flash');
    };
  }, [flash]);
  // 行を消す。申請書に入れた箇所の最後の行を消しても、申請書の箇所はそのまま（見積書から外すだけ。`deleteLine`）。
  // 前は「申請書からも削除してよいですか？」と聞いていた（ユーザーの指示「申請書も連動して消す機能はやめる」2026-11-11）
  const deleteRow = (rowId: string) => {
    const next = deleteLine(jobRef.current, rowId);
    if (next === jobRef.current) return;
    change(next);
    setSel(null);
  };
  // 箇所をまるごと消す（「全て削除」・改修内容／改修場所の欄で Delete。ユーザーの指示「全て削除ボタンをつくる」「Deleteで全て削除できるようにする。
  // 申請書の内容と連動しなくて良い」2026-11-12）。行があるときは確かめてから（Ctrl+Z でも戻せる）。申請書の箇所はそのまま
  const deletePlaceAll = () => {
    if (!sel) return;
    const place = placeOfKey(jobRef.current, sel.key);
    if (!place) return;
    const label = sheetValue(jobRef.current, `place:${place.id}:name`, ctx) || place.name || 'この箇所';
    if (place.rows.some((r) => !isBlankRow(r)) && !window.confirm(`${label}の行をすべて消しますか？`)) return;
    change(removePlaceFromEstimate(jobRef.current, place.id));
    setSel(null);
  };

  // ---------------------------------------------------------------- マウス
  const onMouseDown = (e: ReactMouseEvent) => {
    let t = e.target as HTMLElement;
    if (sugRef.current?.contains(t)) return;
    if (t.closest('[data-drop]')) {
      e.preventDefault(); // 欄の「▼」：欄は選ばない（押し終わったら候補を出す）
      return;
    }
    // 空いた行の「部材｜施工費｜常用」。選んでいる欄の上には見えない入力欄が重なっているので、その下も見る
    const pickEl =
      t.closest<HTMLElement>('[data-pick]') ??
      (t === inputRef.current && !edit ? ((document.elementsFromPoint(e.clientX, e.clientY).find((x) => x instanceof HTMLElement && x.dataset.pick) as HTMLElement | undefined) ?? null) : null);
    if (pickEl && innerRef.current?.contains(pickEl)) {
      e.preventDefault();
      const td = pickEl.closest<HTMLElement>('[data-edit]');
      if (td) runPick(pickEl.dataset.pick ?? '', td);
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
    if (edit && sel && el === findCell(sel)) {
      // 打ち込んでいる欄の、入力欄の外の所（空いた行の「部材｜施工費｜常用」の左など）：打ち込んだまま
      inputRef.current?.focus({preventScroll: true});
      return;
    }
    if (edit && sel) {
      // 打ち込んでいた値を入れてから、押した欄（ページの中の同じ位置）を選ぶ
      pendingPos.current = posOf(el);
      commit(edit.value, null, null);
      return;
    }
    if (sel && isToggle(sel.key) && el === findCell(sel)) {
      // 選んでいる材／手・対象外の欄をもう一度押したら切り替える（スマホで押すだけで 材⇔手。ダブルクリックでも1回だけ）
      toggle();
      inputRef.current?.focus({preventScroll: true});
      return;
    }
    select(el);
    inputRef.current?.focus({preventScroll: true});
  };
  const onDoubleClick = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (sugRef.current?.contains(t) || edit) return;
    if (t.closest('[data-pick]')) return; // 「部材｜施工費｜常用」は1回目で開いている
    if (isToggle(sel?.key)) return; // 材／手・対象外は2回目の押した所で切り替えている
    if (t === inputRef.current || t.closest('[data-edit]')) {
      e.preventDefault();
      startEdit('edit');
    }
  };

  // 見積書の左のボタンは、明細の1行目（「手すりの取り付け　①廊下」）と同じ高さ（ユーザーの指示「部材リストや施工リストは、手すり取り付け①廊下や
  // ②台所と同じ高さにもってくる」2026-11-03。前は見積書の上の端からで、表題・宛名の横にあった）。広い画面（ボタンが見積書の左に並ぶとき）だけ。
  // 見えているページの表の1行目の横に出す（ユーザーの指示「２ページ目にいっても、TOTO,マツ六などのカタログは２ページ目にいってもみれるようにする」2026-11-04。
  // 前は画面の上に付いてくるだけで、2ページ目の表を見ていても、ボタンは画面のいちばん上の離れた所にあった）。どのページの1行目も見えない（表の途中を見ている）
  // ときは、今までどおり画面の上に付いてくる。スクロールのたびに見積書ぜんぶを描き直さないよう、位置は DOM に直接書く
  const sideRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const side = sideRef.current;
    const col = side?.parentElement;
    if (!side || !col) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      if (!side.offsetParent) return; // 狭い画面（ボタンは上の段）
      const colTop = col.getBoundingClientRect().top;
      const h = side.offsetHeight;
      const heads = [...(innerRef.current?.querySelectorAll<HTMLElement>('.form-page') ?? [])]
        .map((pg) => pg.querySelector<HTMLElement>('tr[data-rows], tr[data-new], tr[data-blank]'))
        .filter((r): r is HTMLElement => !!r)
        .map((r) => r.getBoundingClientRect().top - colTop - 8);
      if (!heads.length) return;
      const viewTop = 8 - colTop; // 画面の上の端（列の中の位置）
      const viewBottom = window.innerHeight - 8 - colTop;
      const shown = heads.find((y) => y >= viewTop && y + h <= viewBottom);
      const top = shown ?? Math.max(heads[0], viewTop);
      side.style.top = `${Math.round(Math.max(0, Math.min(top, col.clientHeight - h)))}px`;
    };
    const ask = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('scroll', ask, true);
    window.addEventListener('resize', ask);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(ask);
    if (innerRef.current) ro?.observe(innerRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', ask, true);
      window.removeEventListener('resize', ask);
      ro?.disconnect();
    };
  }, []);

  // ---------------------------------------------------------------- 見積書の左のボタン（部材・施工費を入れる・選んでいる行の挿入・削除・コピー・貼付）
  // 押しても見積書の欄の選択を外さない（打ち込んでいる欄・選んでいる行のまま）
  const keepSel = (e: ReactMouseEvent) => e.preventDefault();
  // 選んでいる欄が明細の行か（いちばん下の空いた行・お客様名などの欄では、挿入・削除・コピーは押せない）
  const onLine = !!sel && /^(line|place|excl|split):/.test(sel.key);
  const rowOp = (op: 'insert' | 'delete' | 'copy' | 'paste') => {
    if (edit && sel) commit(edit.value, null, null, true); // 打ち込んでいた値を入れてから
    if (op === 'paste') {
      pasteAt(pasteTarget());
      return;
    }
    const id = lineIdOf(sel);
    if (!id) {
      toast('行を選んでください', 'error');
      return;
    }
    if (op === 'insert') insertRow(id);
    else if (op === 'delete') deleteRow(id);
    else {
      copyRow(id, false, null);
      inputRef.current?.focus({preventScroll: true});
    }
  };
  useEffect(() => {
    if (target.place) lastPlace.current = target.place.id;
  }, [target.place?.id]);

  // ---------------------------------------------------------------- 空いた行の「部材｜施工費｜常用」
  // 押した欄を選んでから：部材＝部材を選ぶ画面（申請書から作った空きの行は検索の言葉つき）、常用＝部材＋施工費（常用）の画面、施工費＝施工費のリスト。
  // 入れる箇所は、空白の行ならその行の箇所（その行に入る）、いちばん下の空いた行なら最後の箇所の最後（なければ新しい箇所。`toolPlace`）
  const [laborMenu, setLaborMenu] = useState<Sel | null>(null);
  const [laborHl, setLaborHl] = useState(0);
  // 見積書の左の「📖 マツ六」など：選んでいる欄の行の箇所（いちばん下の空いた行・お客様名などなら最後の箇所。なければ新しい箇所。`toolPlace`）に、そのカタログから入れる
  const openCatalog = (book: BookId) => {
    if (edit && sel) commit(edit.value, null, null, true);
    const j = jobRef.current;
    const key = sel?.key ?? null;
    const rowId = key?.startsWith('line:') ? key.split(':')[1] : null;
    const place = rowId ? (j.places.find((p) => p.rows.some((r) => r.id === rowId)) ?? null) : toolPlace(j, key, lastPlace.current);
    onPickMaterial(place?.id ?? null, rowId, book);
  };
  const runPick = (kind: string, td: HTMLElement) => {
    if (edit && sel) commit(edit.value, null, null, true);
    const key = td.dataset.edit ?? '';
    if (!key) return;
    select(td);
    inputRef.current?.focus({preventScroll: true});
    const j = jobRef.current;
    const rowId = key.startsWith('line:') ? key.split(':')[1] : null;
    const place = rowId ? (j.places.find((p) => p.rows.some((r) => r.id === rowId)) ?? null) : toolPlace(j, key, null);
    if (kind === 'material') onPickMaterial(place?.id ?? null, rowId);
    else if (kind === 'kit') onPickKit(place?.id ?? null, rowId);
    else if (kind === 'labor') {
      setLaborMenu(selOf(td));
      setLaborHl(0);
    }
  };
  const chooseLabor = (item: LaborItem) => {
    const m = laborMenu;
    setLaborMenu(null);
    if (!m) return;
    const res = stepLaborAt(jobRef.current, m.key, item, 1);
    if (res.job !== jobRef.current) {
      change(res.job);
      if (res.rowId) {
        setSel({key: `line:${res.rowId}:text`, occ: 0});
        setFlash(res.rowId);
      }
    }
    inputRef.current?.focus({preventScroll: true});
  };
  // 施工費のリストの −／＋：リストを開いたまま、そのまとまりの数（箇所数）を変える（ユーザーの指示「施工費は一覧とともに、数量をふやせるようにする」2026-11-03）。
  // 入れた行を選び、続けて押す所もその行にする（空いた行は入れるとなくなるので）
  const stepLabor = (item: LaborItem, delta: number) => {
    const m = laborMenu;
    if (!m) return;
    const res = stepLaborAt(jobRef.current, m.key, item, delta);
    if (res.job !== jobRef.current) change(res.job);
    if (!res.key) {
      setLaborMenu(null);
      setSel(null);
    } else if (res.key !== m.key) {
      const next = {key: res.key, occ: 0};
      setLaborMenu(next);
      setSel(next);
    }
    if (res.rowId && delta > 0) setFlash(res.rowId);
    inputRef.current?.focus({preventScroll: true});
  };
  const laborN = (item: LaborItem) => (laborMenu ? laborCountAt(job, laborMenu.key, item.id) : 0);
  // ほかの欄を選んだら・見積書の外を押したら閉じる
  useEffect(() => {
    if (laborMenu && sel?.key !== laborMenu.key) setLaborMenu(null);
  }, [sel?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const laborRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!laborMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (laborRef.current?.contains(t) || t.closest?.('[data-pick="labor"]') || t === inputRef.current) return;
      setLaborMenu(null);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [laborMenu]);
  const laborPrice = (item: LaborItem) => item.estPrice ?? rounddown(item.price * s.estimateLaborRate);

  // ---------------------------------------------------------------- 行の 挿入・削除・コピー・貼付（選んでいる行の改修内容の左。見積書の余白）
  // 明細の行を選んでいないときは、表の見出し（改修内容）の左（押せるのは貼付だけ）。選んでいる行は薄い緑（tr[data-current]）
  const [opsAt, setOpsAt] = useState<{left: number; top: number} | null>(null);
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const cur = onLine ? findCell(sel) : null;
    const tr = cur?.closest<HTMLElement>('tr') ?? null;
    for (const x of inner.querySelectorAll('tr[data-current]')) if (x !== tr) x.removeAttribute('data-current');
    if (tr && !tr.hasAttribute('data-current')) tr.setAttribute('data-current', '');
    const anchor = tr?.querySelector<HTMLElement>('td') ?? inner.querySelector<HTMLElement>('.form-page th');
    if (!anchor) {
      if (opsAt) setOpsAt(null);
      return;
    }
    const a = inner.getBoundingClientRect();
    const b = anchor.getBoundingClientRect();
    const next = {left: Math.round((b.left - a.left) / scale), top: Math.round((b.top - a.top) / scale)};
    if (!opsAt || next.left !== opsAt.left || next.top !== opsAt.top) setOpsAt(next);
  });

  // 打ち込む欄の位置・文字の大きさ（見積書の欄と同じ）
  const editing = edit !== null;
  // 打つ字は欄の左の端から（Excel で打つときと同じ。数字の欄も、打っているあいだは左から。点滅するカーソルも左の端。
  // ユーザーの指示「チカチカは左端にする」2026-11-04）。空いた行の内容の欄は「部材｜施工費｜常用」の左の空いた所から打ち、
  // 打った字がそこに入りきらなくなったら右へのびる（ボタンは打ち始めても見えて押せる。ユーザーの指示「常に入力のセル上で、部材・施工費・常用をおく」2026-11-03）
  const pickL = box?.pickL ?? null;
  const pickRoom = box && pickL !== null ? Math.max(8, pickL - box.x) : null;
  const taMin = box ? (pickRoom ?? Math.max(8, box.w)) : 10;
  const taWidth = box
    ? editing
      ? pickRoom !== null
        ? Math.max(pickRoom, textWidth(edit.value, box) + 10)
        : Math.max(taMin, field === 'text' || field === 'note' || field === 'address' || field === 'customer' ? 260 : 90)
      : taMin
    : 10;
  const taStyle = box
    ? {
        // 数字の欄は右の端をそろえて右から打つ（欄より広い入力欄は左にのばす）
        left: Math.max(0, Math.min(rightCell(box) ? box.x + box.w - taWidth : box.x, PAGE_W - taWidth - 4)),
        top: box.y,
        minWidth: taMin,
        width: taWidth,
        height: editing ? undefined : box.h,
        minHeight: box.h,
        fontSize: box.font,
        fontFamily: box.family,
        textAlign: rightCell(box) ? ('right' as const) : ('left' as const),
      }
    : {left: -9999, top: 0, width: 10, height: 10};
  const rows = editing ? Math.max(1, edit.value.split('\n').length) : 1;
  // 内容の欄に打っているあいだは、部材リストの候補を見出しつきで出す（合うものがなくても「ありません」と出す。品番を打っても探していることが分かるように）
  const searching = editing && textCell;

  // 候補の場所（画面の上に、ふつうの大きさで出す）。画面を動かしたら付いていく
  const [, setTick] = useState(0);
  const showSug = suggestions.length > 0 || searching || laborMenu !== null;
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
    if (!anchor || (suggestions.length === 0 && !searching)) return null;
    const r = anchor.getBoundingClientRect();
    // 上に出すときの高さ：見出し（内容の欄）＋候補（なければ「ありません」の1行）。前は候補のないときを低く見て、入力の欄にかぶった
    const h = Math.min(330, (textCell ? 30 : 0) + (suggestions.length ? suggestions.length * 44 : 36) + 4);
    const below = r.bottom + 4 + 320 <= window.innerHeight || r.top < h + 12;
    return {left: Math.max(8, Math.min(r.left, window.innerWidth - 448)), top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h)};
  })();

  // 施工費のリスト（空いた行の「施工費」を押したとき）の場所：その欄の下（入らなければ上）
  const laborCell = laborMenu ? findCell(laborMenu) : null;
  const laborPos = (() => {
    if (!laborCell) return null;
    const r = laborCell.getBoundingClientRect();
    const h = Math.min(360, labor.length * 40 + 48);
    const below = r.bottom + 4 + h <= window.innerHeight || r.top < h + 8;
    return {left: Math.max(8, Math.min(r.left, window.innerWidth - 408)), top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h)};
  })();

  // コピーした行の印・行の左の「貼付」（コピーした行があるあいだ）
  const sheetOpts = {mark, copied: clip && clip.jobId === job.id ? clip.sourceIds : [], pasting: clip !== null};

  const selName = sel ? FIELD_NAMES[field] ?? (sel.key.startsWith('excl:') ? '介護保険の対象／対象外' : sel.key.startsWith('overhead:') ? '諸経費' : sel.key === 'date' ? '作成日' : '') : '';
  const bar = editing ? edit.value : sel ? (sel.key === 'new:mark' ? mark : sheetValue(job, sel.key, ctx, estDate)) : '';
  // どこの欄か（「①階段 ／ 同上施工費（木） ／ 金額」）。上の段の左と、欄にマウスを乗せたときに出す（ユーザーの指示「どこのセルの修正をしているか…マウスを乗せたら分かるように」2026-11-02）
  const selDesc = sel ? describeKey(job, sel.key, s) || selName : '';
  const selParts = selDesc.split(' ／ ');
  const onMouseOver = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (t === inputRef.current) return; // 選んでいる欄の上の入力欄は title={selDesc}
    const el = t.closest<HTMLElement>('[data-edit]');
    if (el && innerRef.current?.contains(el)) {
      el.title = describeKey(jobRef.current, el.dataset.edit ?? '', s);
      return;
    }
    const blank = t.closest<HTMLElement>('tr[data-blank]');
    if (blank && innerRef.current?.contains(blank) && !blank.title) blank.title = 'いちばん下の空いた行';
  };

  return (
    <>
    <section className="overflow-clip rounded-xl border-2 border-emerald-800 bg-white shadow-sm" aria-label="見積書">
      {between}
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
        {/* 箇所と欄の名前はいつも見せ、長い品名だけを「…」で詰める（スマホの幅でも「金額」「単価」が分かるように） */}
        <span className="flex min-w-0 max-w-[60%] shrink-0 whitespace-nowrap font-bold text-emerald-800" title={selDesc} aria-label="選んでいる欄">
          {selParts.length === 3 ? (
            <>
              <span className="shrink-0 whitespace-pre">{`${selParts[0]} ／ `}</span>
              <span className="min-w-0 truncate">{selParts[1]}</span>
              <span className="shrink-0 whitespace-pre">{` ／ ${selParts[2]}`}</span>
            </>
          ) : (
            <span className="min-w-0 truncate">{selDesc}</span>
          )}
        </span>
        <span className="font-mono text-slate-400">fx</span>
        <span className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-800" aria-label="選んでいる欄の値">
          {bar.replace(/\n/g, ' ／ ') || '　'}
        </span>
      </div>
      <div className="flex flex-col lg:flex-row">
      {/* 見積書の左のボタン：Excelで保存・見積書を印刷（前は部材・施工費・常用を入れるボタンと行の操作。部材などは空いた行の内容の欄に、行の操作は選んでいる行の左に移した。
          ユーザーの指示「現在の部材リスト、施工費から入れると書いてある場所には、印刷とExcel保存のボタンを設置」2026-11-03）。
          広い画面だけ（狭い画面は上の段と同じなので出さない）。見積書を下へ動かしてもついてくる（見えているページの表の横。上の sideRef） */}
      <div className="relative hidden shrink-0 lg:block lg:w-60">
      <div
        ref={sideRef}
        className="sheet-side absolute inset-x-0 top-0 flex flex-col gap-2 border-r border-slate-200 bg-slate-50 p-2 [&>*]:w-full [&>*]:!justify-start [&>*]:!text-[15px]"
        role="toolbar"
        aria-label="見積書の左のボタン"
      >
        {excel}
        <Btn color="softSky" onClick={onPrint}>
          🖨 見積書を印刷
        </Btn>
        {/* メーカーのカタログ（マツ六・TOTO・矢崎化工。いただいた PDF のカタログをアプリの中で開き、ページの品番を押すと選んでいる行の箇所に入る）。
            ユーザーの「マツ六、TOTO 、矢崎です」2026-11-04（前は外のサイトのリンク マツ六・TOTO・介援隊。押した商品はアプリに入らなかった） */}
        <div role="group" aria-label="メーカーのカタログ" className="mt-2 grid gap-2 border-t border-slate-200 pt-2 [&>*]:w-full [&>*]:!justify-start [&>*]:!text-[15px]">
          {BOOKS.map((b) => (
            <Btn key={b.id} color="white" onMouseDown={keepSel} onClick={() => openCatalog(b.id)} aria-label={`${b.maker}のカタログから選ぶ`}>
              📖 {b.maker}
            </Btn>
          ))}
        </div>
      </div>
      </div>
      <div
        ref={scrollRef}
        className="est-sheet relative min-w-0 flex-1 overflow-auto bg-slate-500"
        style={{padding: PAD}}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseOver={onMouseOver}
      >
        <div style={{width: PAGE_W * scale, height: innerH * scale}}>
          <div ref={innerRef} className="relative" style={{width: PAGE_W, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
            {form === 'kouiki' ? <KouikiForm job={job} settings={s} sheet={sheetOpts} /> : <YukuhashiForm job={job} settings={s} date={estDate} sheet={sheetOpts} />}
            {box && <div className="sheet-sel" style={{left: box.x, top: box.y, width: box.w, height: box.h}} />}
            {/* 欄を1回押したら、Excel で打つときのようにカーソルを欄の左の端（数量・単価・金額など右寄せの数字の欄は右の端。2026-11-12）で点滅させる（打てる欄だと分かるように。ユーザーの指示「セルの上で1回クリックしたら、
                EXCELと同じ様に、チカチカさせて入力できますよってわかるようにする」「チカチカは左端にする」2026-11-04。前のブラウザの細いカーソルは、数字の欄で右の線に重なって見えなかった）。
                欄を移るたびに初めから（key）。打ち始めたら入力欄のカーソルになる。介護保険の対象／対象外・材／手の欄は打たないので出さない */}
            {box && sel && !editing && focused && !isToggle(sel.key) && (
              <div
                key={`${sel.key}:${sel.occ}`}
                className="sheet-caret"
                style={caretStyle(box)}
                aria-hidden="true"
              />
            )}
            {insertMark && (
              <div className="sheet-insert-mark" style={{top: insertMark.top - 1.5, left: insertMark.left, width: insertMark.width}} aria-hidden="true">
                <span>ここに1行入ります</span>
              </div>
            )}
            {/* 行の 挿入・削除・コピー・貼付：選んでいる行の改修内容の左（余白）に小さく */}
            {opsAt && (
              <div className="sheet-ops" style={{left: opsAt.left - 4, top: opsAt.top, fontSize: `${Math.round((15 / scale) * 100) / 100}px`}} role="toolbar" aria-label="行の操作">
                <button
                  type="button"
                  onMouseDown={keepSel}
                  onClick={() => rowOp('insert')}
                  onMouseEnter={showInsertMark}
                  onMouseLeave={() => setInsertMark(null)}
                  onFocus={showInsertMark}
                  onBlur={() => setInsertMark(null)}
                  disabled={!onLine}
                  aria-label="＋ 挿入"
                  title="選んでいる行の上に1行入れる（Ctrl+Shift+＋）。入る所に緑の線が出ます"
                >
                  ＋挿入
                </button>
                <button type="button" onMouseDown={keepSel} onClick={() => rowOp('delete')} disabled={!onLine} aria-label="✕ 削除" title="選んでいる行を消す（部材は同上施工費ごと。Ctrl+－）">
                  ✕削除
                </button>
                <button type="button" onMouseDown={keepSel} onClick={() => rowOp('copy')} disabled={!onLine} aria-label="⧉ コピー" title="選んでいる行をコピー（部材は同上施工費ごと。Ctrl+C）">
                  ⧉コピー
                </button>
                <button type="button" onMouseDown={keepSel} onClick={() => rowOp('paste')} disabled={!clip || !sel} aria-label="📋 貼付" title="コピーした行を、選んでいる行の下に貼り付ける（Ctrl+V）">
                  📋貼付
                </button>
                <button
                  type="button"
                  onMouseDown={keepSel}
                  onClick={deletePlaceAll}
                  disabled={!sel || !placeOfKey(job, sel.key)}
                  aria-label="✕ 全て削除"
                  title="選んでいる箇所（改修場所）の行をすべて消す（改修内容・改修場所の欄で Delete でも）"
                >
                  ✕全て削除
                </button>
              </div>
            )}
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
              onFocus={() => setFocused(true)}
              onBlur={(e) => {
                setFocused(false);
                // 見積書の外（ボタンなど）を押したら、打ち込んでいた値を入れる（Excel と同じ）
                if (edit && !scrollRef.current?.contains(e.relatedTarget as Node | null) && !sugRef.current?.contains(e.relatedTarget as Node | null)) {
                  commit(edit.value, null, null, true);
                }
              }}
              onCompositionStart={() => {
                if (!edit && sel && !isToggle(sel.key)) setEdit({mode: 'enter', value: ''});
              }}
              aria-label={selName || '見積書の欄'}
              title={selDesc || undefined}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
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
          {textCell && (
            <div className="border-b border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-900">
              {edit?.value.trim() ? `📋 部材リストから検索（品番・品名）：「${edit.value.trim()}」` : '★ お気に入り（品番・品名を打つと部材リストから検索）'}
            </div>
          )}
          {searching && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">{edit?.value.trim() ? '部材リストにありません（Enter でこのまま入れます）' : 'お気に入りはまだありません（品番を打って ☆ で追加）'}</div>
          )}
          <div className="max-h-[300px] overflow-y-auto">
            {suggestions.map((x, i) => (
              <div key={`${x.value}-${i}`} className="contents">
              {/* 改修場所の候補の見出し：申請書の箇所（薄い黄色。申請書の入れる所と同じ色）と、そのほかの箇所の名前 */}
              {placeCell && x.group !== suggestions[i - 1]?.group && (
                <div className={`border-b px-3 py-1 text-xs font-bold ${x.group === 'shinsei' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`} aria-hidden="true">
                  {x.group === 'shinsei' ? '📝 申請書の箇所（選ぶと申請書の内容を読み込みます）' : '箇所の名前'}
                </div>
              )}
              <div className={`flex items-stretch ${i === curHl ? 'bg-emerald-100' : x.group === 'shinsei' ? 'bg-amber-50/40 hover:bg-emerald-50' : 'hover:bg-emerald-50'}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === curHl}
                  onMouseEnter={() => setHl(i)}
                  onClick={() => commit(x.value, x.pick, null)}
                  className="block min-w-0 flex-1 px-3 py-1.5 text-left"
                >
                  <div className="truncate font-bold text-slate-800">{x.label}</div>
                  {x.sub && <div className="truncate text-[11px] text-slate-500">{x.sub}</div>}
                </button>
                {/* 品番を打った候補から、そのまま★お気に入りに入れる・外す（ユーザーの指示「品番入力の一部でお気に入りを作成できるようにする」2026-11-03） */}
                {x.pick && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onToggleFavorite(x.pick!.id)}
                    className={`shrink-0 px-3 text-lg leading-none ${x.pick.favorite ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-500'}`}
                    aria-label={x.pick.favorite ? `${x.pick.name}をお気に入りから外す` : `${x.pick.name}をお気に入りに入れる`}
                    aria-pressed={x.pick.favorite}
                    title={x.pick.favorite ? 'お気に入りから外す' : 'お気に入りに入れる'}
                  >
                    {x.pick.favorite ? '★' : '☆'}
                  </button>
                )}
              </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {laborMenu && laborPos && (
        <div
          ref={laborRef}
          className="fixed z-50 w-[400px] max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-sky-300 bg-white text-sm shadow-2xl"
          style={{left: laborPos.left, top: laborPos.top}}
          onMouseDown={(e) => e.preventDefault()}
          role="listbox"
          aria-label="施工費のリスト"
        >
          <div className="flex items-center justify-between border-b border-sky-100 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-900">
            <span>🔧 施工費を選ぶ</span>
            <span className="font-normal text-sky-800">数量</span>
          </div>
          <div className="max-h-[312px] overflow-y-auto">
            {labor.map((item, i) => {
              const n = laborN(item);
              return (
                <div key={item.id} className={`flex items-center gap-2 pr-2 ${i === laborHl ? 'bg-sky-100' : 'hover:bg-sky-50'}`} onMouseEnter={() => setLaborHl(i)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === laborHl}
                    onClick={() => chooseLabor(item)}
                    className="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-2 pl-3 text-left"
                  >
                    <span className="min-w-0 truncate font-bold text-slate-800">{item.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{yen(laborPrice(item))}円</span>
                  </button>
                  {/* 数量：そのまとまりに入っている数。−／＋ でリストを開いたまま変える */}
                  <span className="flex shrink-0 items-center" role="group" aria-label={`${item.name}の数量`}>
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={n === 0}
                      onClick={() => stepLabor(item, -1)}
                      className="h-7 w-7 rounded-l border border-slate-300 bg-white text-base leading-none text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      aria-label={`${item.name}を1つ減らす`}
                    >
                      −
                    </button>
                    <span className="h-7 min-w-[2rem] border-y border-slate-300 bg-white px-1 text-center text-sm leading-7 tabular-nums text-slate-800" aria-label={`${item.name}の数`}>
                      {n}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => stepLabor(item, 1)}
                      className="h-7 w-7 rounded-r border border-slate-300 bg-white text-base leading-none text-slate-700 hover:bg-slate-100"
                      aria-label={`${item.name}を1つ増やす`}
                    >
                      ＋
                    </button>
                  </span>
                </div>
              );
            })}
            {labor.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">施工費がありません（📦 部材・施工費マスタで入れます）</div>}
          </div>
        </div>
      )}
    </section>
    </>
  );
}

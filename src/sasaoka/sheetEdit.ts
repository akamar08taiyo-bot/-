// 見積書に直接入力するとき（Excel のように欄を選んで打ち込む）の、欄の値の読み書き。
// 欄のキー（見積書の data-edit と同じ）：
//   line:行ID:text|qty|unit|price|note … 明細の1行（行ID は部材の行。施工費のまとまりは、その最初の手間の行）
//   place:箇所ID:name|work|kind|photo … 箇所の欄（箇所の最初の行に出る）
//   excl:行ID … 介護保険の対象／対象外（切り替え）
//   new:name|work|kind|photo|text|qty|unit|price|note … いちばん下の空いた行（打ち込むと行が増える）
//   job:customer|insuredNo|address、overhead:all|target
// 打ち込んだ値は、仕切り計算表・請求書と同じ行（部材・取付手間）に入る（見積書と請求書はいつも同じ入力から作る）。

import {cutToLength, estimatePlaceLines, estimateQty, estimateUnitPrice, overheadAuto, estimateTotals, rounddown} from './calc.ts';
import {KINDS, materialText} from './estimateForms.ts';
import {guessPieceLengthM} from './priceImport.ts';
import {manualRow, materialRow, newPlace} from './rows.ts';
import type {EstimateForm, Job, Material, Place, Row, Settings} from './types.ts';

export type SheetSettings = Pick<Settings, 'estimateRate' | 'estimateHourRate' | 'estimateOverheadRate' | 'taxRate'>;

export type SheetCtx = {
  settings: SheetSettings;
  form: EstimateForm;
  /** 内容の欄で部材リストから選んだ部材 */
  pick?: Material | null;
  /** いちばん下の行を施工費（手）として入れる */
  labor?: boolean;
};

/** 打ち込んだあとの様邸と、その値が入った欄（いちばん下の行に入れたら、増えた行の欄） */
export type SheetResult = {job: Job; key: string | null};

/** みやこ町・広域連合用の「改修箇所毎工事名称」の短い名前（改修の種類と同じ順） */
const KIND_SHORT = ['手すり', '段差', '床', '扉', '便器', '付帯'];
/** 施工費として入れる内容 */
const LABOR_TEXT = /施工費|手間|工賃|取付費/;
const ADJUST_NAME = '施工費（調整）';

// ---------------------------------------------------------------- 打ち込んだ文字を読む

/** 数字（3,800・￥3800・3800円・全角も） */
export function parseNum(input: string): number | null {
  const s = input.normalize('NFKC').replace(/[,\s円￥¥]/g, '').replace(/^定価[:：]?/, '');
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 長さ（60cm・600mm・0.6m）を cm に。長さでなければ null */
export function parseLengthCm(input: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/i.exec(input.normalize('NFKC').trim());
  if (!m) return null;
  const n = Number(m[1]);
  const cm = m[2].toLowerCase() === 'mm' ? n / 10 : m[2].toLowerCase() === 'm' ? n * 100 : n;
  return Math.round(cm * 1000) / 1000;
}

/**
 * 備考（算出根拠）に入れた定価：「8000」「8,000円」「定価8,000円（税抜）×0.8」「定価20,000円（4m）」など。
 * かっこの中が長さなら1本の長さ。定価でなければ null（ふつうの備考として入れる）
 */
export function parseListNote(input: string): {list: number; pieceM: number | null} | null {
  const s = input.normalize('NFKC').replace(/\s+/g, '');
  const m = /^(?:定価[:：]?)?[￥¥]?(\d[\d,]*(?:\.\d+)?)円?(?:\((?:税抜|税込|税別|(\d+(?:\.\d+)?)m)\))?(?:×\d+(?:\.\d+)?)?$/.exec(s);
  if (!m) return null;
  const list = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(list)) return null;
  return {list, pieceM: m[2] ? Number(m[2]) : null};
}

/** 改修の種類：1〜6・①〜⑥・「手すり」「段差」など。分からなければ null */
export function parseKind(input: string): number | null {
  const s = input.normalize('NFKC').trim();
  if (/^[1-6]$/.test(s)) return Number(s);
  const lead = /^([1-6])\D/.exec(s);
  if (lead) return Number(lead[1]);
  if (s === '') return null;
  const i = KINDS.findIndex((k, j) => k.startsWith(s) || s.startsWith(k) || s.includes(KIND_SHORT[j]));
  if (i >= 0) return i + 1;
  if (/その他/.test(s)) return 6;
  return null;
}

/** 箇所名：「浴室」「浴室③」「浴室(3)」（後ろの番号は写真番号） */
export function parsePlace(input: string): {name: string; photo: number | null} {
  const s = input.trim();
  const circledNo = /^(.*?)\s*([①-⑳])$/.exec(s);
  if (circledNo) return {name: circledNo[1].trim(), photo: circledNo[2].charCodeAt(0) - 0x2460 + 1};
  const paren = /^(.*?)\s*[（(](\d+)[）)]$/.exec(s.normalize('NFKC'));
  if (paren && paren[1].trim() !== '') return {name: paren[1].trim(), photo: Number(paren[2])};
  return {name: s, photo: null};
}

/** 施工費として入れる内容か */
export const isLaborText = (s: string) => LABOR_TEXT.test(s.trim());

// ---------------------------------------------------------------- 行・箇所を探す

type Found = {pi: number; ri: number; place: Place; row: Row};

function findRow(job: Job, rowId: string): Found | null {
  for (let pi = 0; pi < job.places.length; pi++) {
    const ri = job.places[pi].rows.findIndex((r) => r.id === rowId);
    if (ri >= 0) return {pi, ri, place: job.places[pi], row: job.places[pi].rows[ri]};
  }
  return null;
}

/** 施工費のまとまり（ri から続く手間の行）の範囲 [ri, end) */
function workEnd(rows: Row[], ri: number): number {
  let end = ri;
  while (end < rows.length && rows[end].kind === 'labor') end++;
  return end;
}

/** 行 ri を含む施工費のまとまりの最初の行 */
function workHead(rows: Row[], ri: number): number {
  let k = ri;
  while (k > 0 && rows[k - 1].kind === 'labor') k--;
  return k;
}

const setPlaceRows = (job: Job, pi: number, rows: Row[]): Job => ({...job, places: job.places.map((p, i) => (i === pi ? {...p, rows} : p))});
const patchRow = (job: Job, f: Found, patch: Partial<Row>): Job => setPlaceRows(job, f.pi, f.place.rows.map((r, i) => (i === f.ri ? {...r, ...patch} : r)));
const patchPlace = (job: Job, pi: number, patch: Partial<Place>): Job => ({...job, places: job.places.map((p, i) => (i === pi ? {...p, ...patch} : p))});

/** 部材リストの部材を行に書き写す */
function materialFields(m: Material): Partial<Row> {
  return {
    refId: m.id,
    name: m.name,
    code: m.code,
    maker: m.maker,
    unit: m.unit,
    price: m.price,
    listPrice: m.listPrice,
    pieceLengthM: m.pieceLengthM || guessPieceLengthM(m.name),
  };
}

/**
 * 施工費のまとまりの金額を amount にする。手入力の1行だけならその金額を直す。
 * 取付手間を数えた行（木 2箇所など）は残し、差を「施工費（調整）」の行で足し引きする（仕切り計算表の取付手間も同じ金額になる）
 */
export function setWorkAmount(rows: Row[], headIndex: number, amount: number): Row[] {
  const end = workEnd(rows, headIndex);
  const group = rows.slice(headIndex, end);
  const head = group[0];
  if (!head) return rows;
  if (group.length === 1 && head.refId === null) {
    return rows.map((r, i) => (i === headIndex ? {...r, price: amount, qty: 1, estAmount: null} : r));
  }
  const adj = group.find((r) => r.refId === null && r.name === ADJUST_NAME && r !== head);
  const others = group.filter((r) => r !== adj).map((r, i) => (i === 0 ? {...r, estAmount: null} : r));
  const sum = others.reduce((n, r) => n + r.price * r.qty, 0);
  const diff = amount - sum;
  const next = diff === 0 ? others : [...others, adj ? {...adj, price: diff, qty: 1} : manualRow('labor', {name: ADJUST_NAME, price: diff, qty: 1, excluded: head.excluded})];
  return [...rows.slice(0, headIndex), ...next, ...rows.slice(end)];
}

/** 施工費のまとまりの今の金額（手で直した見積の金額があればそれ） */
function workAmount(place: Place, headId: string, rate: number): number {
  const w = estimatePlaceLines(place, rate).find((l) => l.kind === 'work' && l.rows[0].id === headId);
  return w?.kind === 'work' ? w.amount : 0;
}

// ---------------------------------------------------------------- いま入っている値（書き直すときの最初の文字）

export function sheetValue(job: Job, key: string, ctx: SheetCtx, date = ''): string {
  const [kind, id, field] = key.split(':');
  const rate = ctx.settings.estimateRate;
  if (kind === 'job') return String(job[id as 'customer' | 'insuredNo' | 'address'] ?? '');
  if (kind === 'date') return date;
  if (kind === 'overhead') {
    const t = estimateTotals(job, ctx.settings);
    return String(id === 'target' ? t.target.overhead : t.all.overhead);
  }
  if (kind === 'place' || (kind === 'new' && ['name', 'work', 'kind', 'photo'].includes(id))) {
    const place = kind === 'place' ? job.places.find((p) => p.id === id) : pendingPlace(job);
    const f = kind === 'place' ? field : id;
    if (!place) return '';
    if (f === 'name') return place.name;
    if (f === 'work' || f === 'kind') return KINDS[place.kind - 1] ?? '';
    if (f === 'photo') return place.photo > 0 ? String(place.photo) : '';
    return '';
  }
  if (kind !== 'line') return '';
  const found = findRow(job, id);
  if (!found) return '';
  const r = found.row;
  if (r.kind === 'labor') {
    const amount = workAmount(found.place, r.id, rate);
    if (field === 'text') return r.estText ?? '';
    if (field === 'qty') return ctx.settings.estimateHourRate > 0 ? String(Math.round((amount / ctx.settings.estimateHourRate) * 100) / 100) : '1';
    if (field === 'price') return String(amount);
    if (field === 'note') return r.estNote ?? '';
    return '';
  }
  if (field === 'text') return r.estText ?? materialText(r);
  if (field === 'qty') return String(cutToLength(r) ? Math.round(estimateQty(r) * 1000) / 1000 : r.qty);
  if (field === 'unit') return r.unit;
  if (field === 'price') return String(estimateUnitPrice(r, rate));
  if (field === 'note') return r.estNote ?? (r.listPrice > 0 ? String(r.listPrice) : '');
  return '';
}

/** いちばん下の空いた行が入る箇所：最後の箇所に行がなければその箇所（なければ null。打ち込むと新しく作る） */
export function pendingPlace(job: Pick<Job, 'places'>): Place | null {
  const last = job.places[job.places.length - 1];
  return last && last.rows.length === 0 ? last : null;
}

// ---------------------------------------------------------------- 打ち込んだ値を入れる

export function applySheet(job: Job, key: string, input: string, ctx: SheetCtx): SheetResult {
  const [kind, id, field] = key.split(':');
  const text = input.replace(/\r/g, '');
  const trimmed = text.trim();
  const rate = ctx.settings.estimateRate;

  if (kind === 'job') {
    const name = id as 'customer' | 'insuredNo' | 'address';
    return {job: {...job, [name]: trimmed}, key};
  }
  if (kind === 'overhead') {
    const n = parseNum(trimmed);
    if (trimmed !== '' && n === null) return {job, key};
    return {job: {...job, [id === 'target' ? 'overheadTarget' : 'overhead']: n === null ? null : Math.round(n)}, key};
  }
  if (kind === 'place') {
    const pi = job.places.findIndex((p) => p.id === id);
    if (pi < 0) return {job, key};
    return {job: patchPlace(job, pi, placePatch(field, text)), key};
  }
  if (kind === 'new') return applyNew(job, id, text, ctx);
  if (kind !== 'line') return {job, key};

  const found = findRow(job, id);
  if (!found) return {job, key};
  const r = found.row;

  if (r.kind === 'labor') {
    const head = workHead(found.place.rows, found.ri);
    const headRow = found.place.rows[head];
    if (field === 'text') {
      const single = workEnd(found.place.rows, head) - head === 1 && headRow.refId === null;
      const estText = trimmed === '' || trimmed === '同上施工費' || trimmed === '施工費' ? null : trimmed;
      return {job: patchRow(job, {...found, ri: head, row: headRow}, {estText, ...(single && trimmed !== '' ? {name: trimmed} : {})}), key};
    }
    if (field === 'qty' || field === 'price') {
      let amount: number;
      if (field === 'qty') {
        const hours = parseNum(trimmed);
        if (hours === null && trimmed !== '') return {job, key};
        amount = rounddown((hours ?? 0) * ctx.settings.estimateHourRate);
      } else {
        const n = parseNum(trimmed);
        if (n === null && trimmed !== '') return {job, key};
        amount = Math.round(n ?? 0);
      }
      return {job: setPlaceRows(job, found.pi, setWorkAmount(found.place.rows, head, amount)), key};
    }
    if (field === 'note') return {job: patchRow(job, {...found, ri: head, row: headRow}, {estNote: trimmed === '' ? null : text}), key};
    return {job, key};
  }

  // 部材の行
  if (field === 'text') {
    if (ctx.pick) return {job: patchRow(job, found, {...materialFields(ctx.pick), estText: null, estNote: null, estPrice: null}), key};
    if (trimmed === (r.estText ?? materialText(r))) return {job, key};
    if (trimmed === '') return {job: patchRow(job, found, {name: '', maker: '', code: '', estText: null}), key};
    return {job: patchRow(job, found, {name: trimmed, maker: '', code: '', estText: null, pieceLengthM: r.pieceLengthM || guessPieceLengthM(trimmed)}), key};
  }
  if (field === 'qty') return {job: patchRow(job, found, qtyPatch(r, trimmed)), key};
  if (field === 'unit') return {job: patchRow(job, found, {unit: trimmed}), key};
  if (field === 'price') {
    if (trimmed === '') return {job: patchRow(job, found, {estPrice: null}), key};
    const n = parseNum(trimmed);
    if (n === null) return {job, key};
    const auto = estimateUnitPrice({...r, estPrice: null}, rate);
    return {job: patchRow(job, found, {estPrice: n === auto ? null : n}), key};
  }
  if (field === 'note') return {job: patchRow(job, found, notePatch(text)), key};
  return {job, key};
}

/** 介護保険の対象／対象外を切り替える（箇所の最初の施工費のまとまりは、まとまりの行すべて） */
export function toggleExcluded(job: Job, rowId: string): Job {
  const found = findRow(job, rowId);
  if (!found) return job;
  const ids = new Set([rowId]);
  if (found.row.kind === 'labor') for (let k = found.ri + 1; k < found.place.rows.length && found.place.rows[k].kind === 'labor'; k++) ids.add(found.place.rows[k].id);
  const excluded = !found.row.excluded;
  return setPlaceRows(job, found.pi, found.place.rows.map((r) => (ids.has(r.id) ? {...r, excluded} : r)));
}

function placePatch(field: string, text: string): Partial<Place> {
  const trimmed = text.trim();
  if (field === 'name') {
    const p = parsePlace(trimmed);
    return {name: p.name, ...(p.photo !== null ? {photo: p.photo} : {})};
  }
  if (field === 'work' || field === 'kind') {
    const k = parseKind(trimmed);
    return k === null ? {} : {kind: k};
  }
  if (field === 'photo') {
    if (trimmed === '') return {photo: 0};
    const n = parseNum(trimmed);
    return n === null ? {} : {photo: Math.max(0, Math.round(n))};
  }
  return {};
}

/** 数量：数字・長さ（60cm など）。1本の長さが分かる部材に小数を入れたら、切って使う長さにする（0.15 → 4m の 60cm） */
function qtyPatch(r: Row, trimmed: string): Partial<Row> {
  if (trimmed === '') return {qty: 0, lengthCm: 0};
  const len = parseLengthCm(trimmed);
  if (len !== null) return {lengthCm: len, qty: r.qty > 0 ? r.qty : 1, pieceLengthM: r.pieceLengthM || guessPieceLengthM(r.name)};
  const n = parseNum(trimmed);
  if (n === null) return {};
  if (r.pieceLengthM > 0 && !Number.isInteger(n) && n > 0) return {lengthCm: Math.round(n * r.pieceLengthM * 100 * 1000) / 1000, qty: 1};
  return {qty: n, lengthCm: 0};
}

/** 備考（算出根拠）：定価を入れたら単価は 定価×0.8（手で入れた単価はやめる）。定価でない文字はそのまま備考に */
function notePatch(text: string): Partial<Row> {
  const trimmed = text.trim();
  if (trimmed === '') return {listPrice: 0, estNote: null};
  const p = parseListNote(trimmed);
  if (p) return {listPrice: p.list, estNote: null, estPrice: null, ...(p.pieceM ? {pieceLengthM: p.pieceM} : {})};
  return {estNote: text.replace(/\s+$/, '')};
}

/** いちばん下の空いた行に打ち込んだとき */
function applyNew(job: Job, field: string, text: string, ctx: SheetCtx): SheetResult {
  const trimmed = text.trim();
  if (trimmed === '' && !(field === 'text' && ctx.pick)) return {job, key: `new:${field}`};
  // 箇所の欄：最後の箇所に行がなければその箇所に、あれば新しい箇所を作って入れる
  if (field === 'name' || field === 'work' || field === 'kind' || field === 'photo') {
    let j = job;
    if (!pendingPlace(j)) j = {...j, places: [...j.places, {...newPlace(''), kind: j.places[j.places.length - 1]?.kind ?? 1}]};
    const pi = j.places.length - 1;
    return {job: patchPlace(j, pi, placePatch(field, text)), key: `new:${field}`};
  }
  // 明細の欄：最後の箇所（なければ作る）の最後に行を足して、そこに入れる
  let j = job;
  if (j.places.length === 0) j = {...j, places: [newPlace('')]};
  const pi = j.places.length - 1;
  const place = j.places[pi];
  const labor = ctx.labor === true || (field === 'text' && !ctx.pick && isLaborText(trimmed));
  let row: Row;
  if (labor) row = manualRow('labor', {name: field === 'text' ? trimmed : '施工費', price: 0, qty: 1});
  else if (field === 'text' && ctx.pick) row = materialRow(ctx.pick);
  else row = manualRow('material', {qty: 1, name: field === 'text' ? trimmed : '', pieceLengthM: field === 'text' ? guessPieceLengthM(trimmed) : 0});
  if (row.kind === 'material' && row.pieceLengthM === 0 && row.name) row.pieceLengthM = guessPieceLengthM(row.name);
  const rows = [...place.rows, row];
  j = setPlaceRows(j, pi, rows);
  // 施工費は、上の手間とつながっていれば同じまとまり（見積書では1行）
  const lineId = row.kind === 'labor' ? rows[workHead(rows, rows.length - 1)].id : row.id;
  if (field === 'text') {
    if (labor && trimmed !== '同上施工費' && trimmed !== '施工費' && trimmed !== '' && lineId === row.id) {
      j = setPlaceRows(j, pi, rows.map((r) => (r.id === row.id ? {...r, estText: trimmed} : r)));
    }
    return {job: j, key: `line:${lineId}:text`};
  }
  const res = applySheet(j, `line:${lineId}:${field}`, text, {...ctx, pick: null});
  return {job: res.job, key: `line:${lineId}:${field}`};
}

/** 見積書の諸経費（手で入れていなければ 小計×率） */
export function overheadValue(job: Job, s: SheetSettings, target: boolean): number {
  const t = estimateTotals(job, s);
  return target ? (job.overheadTarget ?? overheadAuto(t.target.subtotal, s)) : (job.overhead ?? overheadAuto(t.all.subtotal, s));
}

// ---------------------------------------------------------------- 行の並べ替え・削除・挿入（見積書の1行ずつ）

/**
 * 見積書の1行のもとになる行の範囲：部材ならその部材と、すぐ下の施工費（同上施工費）。施工費ならそのまとまり
 */
function unitRange(rows: Row[], ri: number): [number, number] {
  if (rows[ri].kind === 'material') return [ri, workEnd(rows, ri + 1)];
  const head = workHead(rows, ri);
  return [head, workEnd(rows, head)];
}

/** 見積書の1行（部材と同上施工費、または施工費）を、同じ箇所の中で上下に動かす */
export function moveLine(job: Job, rowId: string, delta: -1 | 1): Job {
  const found = findRow(job, rowId);
  if (!found) return job;
  const rows = found.place.rows;
  const units: Row[][] = [];
  for (let i = 0; i < rows.length; ) {
    const [a, b] = unitRange(rows, i);
    units.push(rows.slice(a, b));
    i = b;
  }
  const at = units.findIndex((u) => u.some((r) => r.id === rowId));
  const to = at + delta;
  if (at < 0 || to < 0 || to >= units.length) return job;
  [units[at], units[to]] = [units[to], units[at]];
  return setPlaceRows(job, found.pi, units.flat());
}

/**
 * 見積書の1行を消す：部材の行はその部材と同上施工費、施工費の行はそのまとまり。
 * 箇所の行がなくなったら箇所も消す（最後の箇所は残し、いちばん下の空いた行に名前を出す）
 */
export function deleteLine(job: Job, rowId: string): Job {
  const found = findRow(job, rowId);
  if (!found) return job;
  const [a, b] = unitRange(found.place.rows, found.ri);
  const rows = [...found.place.rows.slice(0, a), ...found.place.rows.slice(b)];
  if (rows.length === 0 && found.pi < job.places.length - 1) return {...job, places: job.places.filter((_, i) => i !== found.pi)};
  return setPlaceRows(job, found.pi, rows);
}

/** 見積書の1行のすぐ下に、空の部材の行を入れる（その行の欄に打ち込む） */
export function insertBlankAfter(job: Job, rowId: string): {job: Job; rowId: string | null} {
  const found = findRow(job, rowId);
  if (!found) return {job, rowId: null};
  const [, b] = unitRange(found.place.rows, found.ri);
  const blank = manualRow('material', {qty: 1});
  const rows = [...found.place.rows.slice(0, b), blank, ...found.place.rows.slice(b)];
  return {job: setPlaceRows(job, found.pi, rows), rowId: blank.id};
}

/** 欄のキーから、その行・箇所（ツールバーのボタンに使う） */
export function sheetTarget(job: Job, key: string): {place: Place | null; row: Row | null} {
  const [kind, id] = key.split(':');
  if (kind === 'line' || kind === 'excl') {
    const f = findRow(job, id);
    return {place: f?.place ?? null, row: f?.row ?? null};
  }
  if (kind === 'place') return {place: job.places.find((p) => p.id === id) ?? null, row: null};
  if (kind === 'new') return {place: job.places[job.places.length - 1] ?? null, row: null};
  return {place: null, row: null};
}

/** 作成日：2026-10-19・2026/10/19・10/19・10月19日・令和8年10月19日。読めなければ null（空なら ''） */
export function parseDate(input: string, today = new Date()): string | null {
  const s = input.normalize('NFKC').trim();
  if (s === '') return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const ok = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(s);
  if (m) return ok(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(?:令和|R)(\d{1,2})[年.](\d{1,2})[月.](\d{1,2})日?$/i.exec(s);
  if (m) return ok(2018 + Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/月.](\d{1,2})日?$/.exec(s);
  if (m) return ok(today.getFullYear(), Number(m[1]), Number(m[2]));
  return null;
}

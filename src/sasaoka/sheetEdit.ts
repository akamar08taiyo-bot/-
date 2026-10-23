// 見積書に直接入力するとき（Excel のように欄を選んで打ち込む）の、欄の値の読み書き。
// 欄のキー（見積書の data-edit と同じ）：
//   line:行ID:text|qty|unit|price|note … 明細の1行（行ID は部材の行。施工費のまとまりは、その最初の手間の行）
//   place:箇所ID:name|work|kind|photo … 箇所の欄（箇所の最初の行に出る）
//   excl:行ID … 介護保険の対象／対象外（切り替え）
//   new:name|work|kind|photo|text|qty|unit|price|note … いちばん下の空いた行（打ち込むと行が増える）
//   job:customer|insuredNo|address、overhead:all|target
// 打ち込んだ値は、仕切り計算表・請求書と同じ行（部材・取付手間）に入る（見積書と請求書はいつも同じ入力から作る）。

import {cutToLength, estimateAmount, estimatePlaceLines, estimateQty, estimateUnitPrice, isBlankRow, listPriceOf, overheadAuto, estimateTotals, rounddown} from './calc.ts';
import type {EstimateRates} from './calc.ts';
import {KINDS, autoNote, formLines, jobForm, jobInsurer, lineNote, materialText, NO_SHINSEI, noteText, rowUnit} from './estimateForms.ts';
import {fillAdded, placeAfterQty, withBrackets} from './cutLink.ts';
import {guessPieceLengthM} from './priceImport.ts';
import {copyRows, manualRow, materialRow, newPlace} from './rows.ts';
import {padInsuredNo} from './shinsei.ts';
import type {EstimateForm, Job, Material, Place, Row, Settings} from './types.ts';

export type SheetSettings = Pick<Settings, 'estimateRate' | 'estimateLaborRate' | 'estimateHourRate' | 'estimateOverheadRate' | 'taxRate'>;

export type SheetCtx = {
  settings: SheetSettings;
  form: EstimateForm;
  /** 内容の欄で部材リストから選んだ部材 */
  pick?: Material | null;
  /** いちばん下の行を施工費（手）として入れる */
  labor?: boolean;
  /** 部材リスト（中間のブラケットの行を入れるとき。`withBrackets`） */
  materials?: Material[];
};

/** 打ち込んだあとの様邸と、その値が入った欄（いちばん下の行に入れたら、増えた行の欄） */
export type SheetResult = {job: Job; key: string | null};

/** 広域連合用の「改修箇所毎工事名称」の短い名前（改修の種類と同じ順） */
const KIND_SHORT = ['手すり', '段差', '床', '扉', '便器', '付帯'];
/** 施工費として入れる内容 */
const LABOR_TEXT = /施工費|手間|工賃|取付費/;
const ADJUST_NAME = '施工費（調整）'; // 前の版で、見積書で直した施工費の差を仕切り計算表に入れていた行（直し直すときに外す）

// ---------------------------------------------------------------- 打ち込んだ文字を読む

/**
 * 数字（3,800・￥3800・3800円・全角も。−500・ー500 も負の数）。
 * Excel の2つのセル（「1,500⇥1,200」）・2行（「1↵2」）を貼り付けた文字は読まない（前は 15001200・12 とつなげて読んでいた）
 */
export function parseNum(input: string): number | null {
  if (/\d[\t\r\n]+\S/.test(input.trim())) return null;
  const s = input.normalize('NFKC').replace(/[,\s円￥¥]/g, '').replace(/^定価[:：]?/, '').replace(/^[−ー]/, '-');
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

/** 箇所名：「浴室」「①勝手口」「浴室③」「浴室(3)」（前か後ろの丸数字・後ろのかっこの番号は写真番号） */
export function parsePlace(input: string): {name: string; photo: number | null} {
  const s = input.trim();
  const lead = /^([①-⑳])\s*(.*)$/.exec(s);
  if (lead) return {name: lead[2].trim(), photo: lead[1].charCodeAt(0) - 0x2460 + 1};
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
const withPlace = (job: Job, pi: number, fn: (p: Place) => Place): Job => ({...job, places: job.places.map((p, i) => (i === pi ? fn(p) : p))});

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
 * 施工費のまとまりの見積の金額を amount にする（見積書の金額・広域連合用の時間の欄で打ったとき。null なら自動＝見積の単価×箇所数に戻す）。
 * 仕切り（笹岡工務店の金額）は見積とは別なので変えない（見積の金額だけを直す＝estAmount）。
 * ただし、見積書で打ち込んで作った手入力の1行で、まだ仕切りの金額がない（0）ときは、仕切りも同じ金額にする（仕切り計算表に入る。あとで直せる）。
 * 前の版で、見積書で直した差を仕切り計算表に入れていた「施工費（調整）」の行は外す
 */
export function setWorkAmount(rows: Row[], headIndex: number, amount: number | null, rates: EstimateRates): Row[] {
  const end = workEnd(rows, headIndex);
  const group = rows.slice(headIndex, end).filter((r, i) => i === 0 || !(r.refId === null && r.name === ADJUST_NAME));
  const head = group[0];
  if (!head) return rows;
  if (group.length === 1 && head.refId === null && head.price === 0 && amount !== null) {
    return [...rows.slice(0, headIndex), {...head, price: amount, qty: 1, estPrice: amount, estAmount: null}, ...rows.slice(end)];
  }
  const auto = group.reduce((n, r) => n + estimateAmount(r, rates), 0);
  const next = group.map((r, i) => (i === 0 ? {...r, estAmount: amount === null || amount === auto ? null : amount} : r));
  return [...rows.slice(0, headIndex), ...next, ...rows.slice(end)];
}

/** 施工費のまとまりの今の金額（手で直した見積の金額があればそれ） */
function workAmount(place: Place, headId: string, rates: EstimateRates): number {
  const w = estimatePlaceLines(place, rates).find((l) => l.kind === 'work' && l.rows[0].id === headId);
  return w?.kind === 'work' ? w.amount : 0;
}

// ---------------------------------------------------------------- いま入っている値（書き直すときの最初の文字）

export function sheetValue(job: Job, key: string, ctx: SheetCtx, date = ''): string {
  const [kind, id, field] = key.split(':');
  const rates = ctx.settings;
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
    const amount = workAmount(found.place, r.id, rates);
    if (field === 'text') return r.estText ?? '';
    if (field === 'qty') return String(shownHours(amount, ctx.settings.estimateHourRate));
    if (field === 'price') return String(amount);
    if (field === 'note') return noteOf(job, r.id, ctx)?.shown ?? r.estNote ?? '';
    return '';
  }
  // 何も入っていない行（挿入した行など）は見積書では空白なので、書き直すときも空から（前は内容の欄に「材料費」と出た。ユーザーの指摘、2026-10-21）
  if (isBlankRow(r)) return '';
  if (field === 'text') return r.estText ?? materialText(r);
  if (field === 'qty') return String(shownQty(r));
  if (field === 'unit') return rowUnit(r);
  if (field === 'price') return String(estimateUnitPrice(r, rates));
  if (field === 'note') return noteOf(job, r.id, ctx)?.shown ?? r.estNote ?? '';
  return '';
}

/** 見積書の数量の欄に出す数量（切って使う部材は 使う長さ÷1本の長さ。小数3けた） */
const shownQty = (r: Row) => (cutToLength(r) ? Math.round(estimateQty(r) * 1000) / 1000 : r.qty);

/** 広域連合用の時間の欄に出す時間（施工費のまとまりの金額÷1時間の単価。小数2けた） */
const shownHours = (amount: number, hourRate: number) => (hourRate > 0 ? Math.round((amount / hourRate) * 100) / 100 : 1);

/** 申請書のタブで入れた内容（寸法・写真・写真に書く内容・申請書の文）がある箇所 */
const hasShinseiData = (p: Place) =>
  !!(p.shinseiText?.trim() || p.shinseiLine?.trim() || p.photoNote?.trim() || p.photos?.before || p.photos?.after || Object.values(p.dims ?? {}).some((v) => v?.trim()));

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
  const rates = ctx.settings;

  if (kind === 'job') {
    const name = id as 'customer' | 'insuredNo' | 'address';
    // 被保険者番号は、確定したら右に詰めて空いた左を 0 で10けたに（ユーザーの指示）
    return {job: {...job, [name]: name === 'insuredNo' ? padInsuredNo(trimmed) : trimmed}, key};
  }
  if (kind === 'overhead') {
    const n = parseNum(trimmed);
    if (trimmed !== '' && n === null) return {job, key};
    // 自動の諸経費（小計×率の端数調整）と同じ金額なら、手で入れたことにしない（行を足しても諸経費が前の金額のままになっていた）
    const t = estimateTotals(job, rates);
    const target = id === 'target';
    const auto = overheadAuto(target ? t.target.subtotal : t.all.subtotal, rates);
    return {job: {...job, [target ? 'overheadTarget' : 'overhead']: n === null || Math.round(n) === auto ? null : Math.round(n)}, key};
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
      // 広域連合用の時間の欄は 時間×1時間の単価、金額の欄はその金額。空にしたら自動（笹岡工務店の手間×施工費の率）に戻す
      const n = parseNum(trimmed);
      if (n === null && trimmed !== '') return {job, key};
      // 出ている時間のまま確定したら何もしない（時間は小数2けたに丸めて出すので、入れ直すと金額が変わってしまう）
      if (field === 'qty' && n !== null && n === shownHours(workAmount(found.place, headRow.id, rates), ctx.settings.estimateHourRate)) return {job, key};
      const amount = n === null ? null : field === 'qty' ? rounddown(n * ctx.settings.estimateHourRate) : Math.round(n);
      return {job: setPlaceRows(job, found.pi, setWorkAmount(found.place.rows, head, amount, ctx.settings)), key};
    }
    if (field === 'note') {
      const same = sameNote(text, noteOf(job, headRow.id, ctx)?.auto ?? '');
      return {job: patchRow(job, {...found, ri: head, row: headRow}, {estNote: trimmed === '' || same ? null : text}), key};
    }
    return {job, key};
  }

  // 部材の行
  if (field === 'text') {
    if (ctx.pick) {
      const fields = materialFields(ctx.pick);
      // 1本の長さのない部材（ブラケットなど）に選び直したら、前の部材の使う長さは消す（「（長さ60cm）」と出ていた）
      const picked = patchRow(job, found, {...fields, estText: null, estNote: null, estPrice: null, ...(fields.pieceLengthM ? {} : {lengthCm: 0})});
      return {job: withPlace(picked, found.pi, (p) => withBrackets(found.place, fillAdded(p, new Set([r.id])), ctx.materials ?? [])), key};
    }
    if (trimmed === (isBlankRow(r) ? '' : (r.estText ?? materialText(r)))) return {job, key};
    // 挿入した空白の行に「同上施工費」などと打ったら、施工費の行にする（いちばん下の行と同じ。前は部材の行になり、仕切りの取付手間に入らなかった）
    if (isBlankRow(r) && isLaborText(trimmed)) return laborFromBlank(job, found, trimmed);
    if (trimmed === '') return {job: patchRow(job, found, {name: '', maker: '', code: '', estText: null}), key};
    return {job: patchRow(job, found, {name: trimmed, maker: '', code: '', estText: null, pieceLengthM: r.pieceLengthM || guessPieceLengthM(trimmed)}), key};
  }
  // 切って使う手すり・ベースプレートは、同じ箇所のもう一方と申請書の長さにもつなぐ。手すりの長さが変わったら中間のブラケットの数も（`cutLink.ts`）
  if (field === 'qty') {
    // 出ている数量のまま確定したら何もしない（0.3 と出ている 600mm×2本 が 1200mm×1本に、申請書の L=1250 が 0.313本＝1252mm に、
    // 4000mm の「1」が切らない1本に書き直されていた）。小数を入れて切って使う長さにする行（まだ長さがない）はのぞく
    const n = parseNum(trimmed);
    const cuts = r.pieceLengthM > 0 && !(r.lengthCm > 0) && n !== null && !Number.isInteger(n);
    if (n !== null && n === shownQty(r) && !cuts) return {job, key};
    const typed = patchRow(job, found, qtyPatch(r, trimmed));
    return {job: withPlace(typed, found.pi, (p) => withBrackets(found.place, placeAfterQty(found.place, p, r.id), ctx.materials ?? [])), key};
  }
  if (field === 'unit') return {job: patchRow(job, found, {unit: trimmed}), key};
  if (field === 'price') {
    if (trimmed === '') return {job: patchRow(job, found, {estPrice: null}), key};
    const n = parseNum(trimmed);
    if (n === null) return {job, key};
    const auto = estimateUnitPrice({...r, estPrice: null}, rates);
    return {job: patchRow(job, found, {estPrice: n === auto ? null : n}), key};
  }
  if (field === 'note') {
    // 1本の長さ（定価○円（4m））を入れて使う長さが決まったときも、中間のブラケットの数を入れ直す
    const noted = patchRow(job, found, notePatch(r, text, noteOf(job, r.id, ctx)?.auto ?? ''));
    return {job: withPlace(noted, found.pi, (p) => withBrackets(found.place, p, ctx.materials ?? [])), key};
  }
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

/** 備考（算出根拠）：定価を入れたら単価は 定価×0.8（手で入れた単価はやめる）。定価でない文字はそのまま備考に。
 *  1本の長さ（4m）も入れたら、先に入れてあった小数の数量（0.15）は切って使う長さにする（数量の欄と同じ）。
 *  欄には備考の全文（「定価12,000円（2m）×0.8」と「2400mm÷2000mm＝1.2」の2行）が出るので、そのまま確定したら自動の文のまま。
 *  1行目の定価・1本の長さだけ直して2行目（長さの計算）がそのままなら、定価を直したとみなす（計算の行は自動で書き直す） */
function notePatch(r: Row, text: string, auto: string): Partial<Row> {
  const trimmed = text.trim();
  if (trimmed === '') return {listPrice: 0, estNote: null};
  if (sameNote(trimmed, auto)) return {estNote: null};
  const [first, ...rest] = trimmed.split('\n');
  const p = parseListNote(first.trim());
  if (!p || (rest.length > 0 && !sameNote(rest.join('\n'), auto.split('\n').slice(1).join('\n')))) return {estNote: text.replace(/\s+$/, '')};
  const patch: Partial<Row> = {listPrice: p.list, estNote: null, estPrice: null};
  if (!p.pieceM) return patch;
  const cut = !(r.lengthCm > 0) && r.qty > 0 && !Number.isInteger(r.qty);
  return {...patch, pieceLengthM: p.pieceM, ...(cut ? {lengthCm: Math.round(r.qty * p.pieceM * 100 * 1000) / 1000, qty: 1} : {})};
}

/** 見積書に出ている備考・算出根拠（shown。手で直していればその文）と自動の文（auto）。改行で行を分ける */
function noteOf(job: Job, rowId: string, ctx: SheetCtx): {shown: string; auto: string} | null {
  const l = formLines(job, ctx.settings, ctx.form, {all: true}).find((x) => x.rowId === rowId);
  if (!l) return null;
  const hourRate = ctx.settings.estimateHourRate;
  return {shown: noteText(lineNote(l, ctx.form, hourRate)), auto: noteText(autoNote(l, ctx.form, hourRate))};
}

/** 備考の文が同じか（全角・半角、行の前後の空白、空の行は見ない） */
function sameNote(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFKC').split('\n').map((x) => x.trim()).filter(Boolean).join('\n');
  return norm(a) === norm(b);
}

/**
 * 空白の行（挿入した行など）を、打ち込んだ内容（「同上施工費」など）の施工費の行にする。いちばん下の行に打ったときと同じく、
 * 上の部材の同上施工費（上に施工費があればそのまとまり）になる。返す欄は、そのまとまりの内容の欄
 */
function laborFromBlank(job: Job, found: Found, text: string): SheetResult {
  const rows = found.place.rows.map((x, i) => (i === found.ri ? {...x, kind: 'labor' as const, name: text, price: 0, qty: 1} : x));
  const head = rows[workHead(rows, found.ri)];
  const own = head.id === found.row.id && text !== '同上施工費' && text !== '施工費';
  return {job: setPlaceRows(job, found.pi, own ? rows.map((x) => (x.id === head.id ? {...x, estText: text} : x)) : rows), key: `line:${head.id}:text`};
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
  if (ctx.pick) j = withPlace(j, pi, (p) => withBrackets(place, fillAdded(p, new Set([row.id])), ctx.materials ?? []));
  // 施工費は、上の手間とつながっていれば同じまとまり（見積書では1行）
  const lineId = row.kind === 'labor' ? rows[workHead(rows, rows.length - 1)].id : row.id;
  if (field === 'text') {
    if (labor && trimmed !== '同上施工費' && trimmed !== '施工費' && trimmed !== '' && lineId === row.id) {
      j = setPlaceRows(j, pi, rows.map((r) => (r.id === row.id ? {...r, estText: trimmed} : r)));
    }
    return {job: j, key: `line:${lineId}:text`};
  }
  if (labor && (field === 'qty' || field === 'price')) {
    // 施工費の時間・金額：打った金額は増えた行だけに入れる（仕切りも同じ金額。あとで直せる）。上の同上施工費のまとまりに入っても、
    // まとまりの金額を打った金額に置きかえない（前は上の施工費 3,000円が 2,000円になっていた）。まとまりの金額を手で直してあれば、その金額に足す
    const n = parseNum(trimmed);
    if (n === null) return {job: j, key: `line:${lineId}:${field}`};
    const amount = field === 'qty' ? rounddown(n * ctx.settings.estimateHourRate) : Math.round(n);
    const head = rows.find((r) => r.id === lineId);
    const bump = lineId !== row.id && head?.estAmount != null ? head.estAmount + amount : null;
    const next = rows.map((r) => (r.id === row.id ? {...r, price: amount, qty: 1, estPrice: amount} : bump !== null && r.id === lineId ? {...r, estAmount: bump} : r));
    return {job: setPlaceRows(j, pi, next), key: `line:${lineId}:${field}`};
  }
  const res = applySheet(j, `line:${lineId}:${field}`, text, {...ctx, pick: null});
  return {job: res.job, key: `line:${lineId}:${field}`};
}

/**
 * 「📄 白紙に戻す」の様邸：見積書に打ち込んだ内容（お客様名・被保険者番号・工事場所・明細・諸経費）と発注書で直したところ、
 * お客様のこと（申請書の項目・理由書）を消す（前は理由書が残り、前のお客様の身体状況などが次の方の理由書に出た）。
 * 保険者（書式）・担当・請求書に入れるかは残す
 */
export function clearedSheet(job: Job, s: Pick<Settings, 'estimateForm'>): Job {
  return {
    ...job,
    insurer: jobInsurer(job),
    form: jobForm(job, s),
    customer: '',
    insuredNo: '',
    address: '',
    places: [],
    overhead: null,
    overheadTarget: null,
    order: null,
    shinsei: {...NO_SHINSEI},
    riyu: undefined,
  };
}

/** 見積書の諸経費（手で入れていなければ 小計×率） */
export function overheadValue(job: Job, s: SheetSettings, target: boolean): number {
  const t = estimateTotals(job, s);
  return target ? (job.overheadTarget ?? overheadAuto(t.target.subtotal, s)) : (job.overhead ?? overheadAuto(t.all.subtotal, s));
}

// ---------------------------------------------------------------- 行の削除・挿入・コピー・貼り付け（見積書の1行ずつ）

/**
 * 見積書の1行のもとになる行の範囲：部材ならその部材と、すぐ下の施工費（同上施工費）。施工費ならそのまとまり
 */
function unitRange(rows: Row[], ri: number): [number, number] {
  if (rows[ri].kind === 'material') return [ri, workEnd(rows, ri + 1)];
  const head = workHead(rows, ri);
  return [head, workEnd(rows, head)];
}

/**
 * 見積書の1行を消す：部材の行はその部材と同上施工費、施工費の行はそのまとまり。
 * 箇所の行がなくなったら箇所も消す（改修内容・改修場所も消えて、その行が空白になる）。
 * ただし申請書のタブで寸法・写真などを入れた箇所は残して空白の行にする（前は申請書の寸法・写真まで消えていた。箇所は申請書のタブの ✕ で消す）。
 * その空白の行を消そうとしたときは何もしない（同じ job を返す）
 */
export function deleteLine(job: Job, rowId: string): Job {
  const found = findRow(job, rowId);
  if (!found) return job;
  const [a, b] = unitRange(found.place.rows, found.ri);
  const rows = [...found.place.rows.slice(0, a), ...found.place.rows.slice(b)];
  if (rows.length > 0) return setPlaceRows(job, found.pi, rows);
  if (!hasShinseiData(found.place)) return {...job, places: job.places.filter((_, i) => i !== found.pi)};
  return b - a === 1 && isBlankRow(found.row) ? job : setPlaceRows(job, found.pi, [manualRow('material', {qty: 1})]);
}

/**
 * 見積書の1行のもとになる行（コピー・切り取りに使う）：部材の行はその部材と同上施工費、施工費の行はそのまとまり。
 * 何も入っていない部材の行（空白の行）は null
 */
export function lineRows(job: Job, rowId: string): Row[] | null {
  const found = findRow(job, rowId);
  if (!found) return null;
  const [a, b] = unitRange(found.place.rows, found.ri);
  const rows = found.place.rows.slice(a, b);
  return rows.length === 1 && isBlankRow(rows[0]) ? null : rows;
}

/**
 * コピー・切り取りした行を貼り付ける。貼り付ける場所は選んでいる欄のキーから：
 *   明細の行（line:・excl:）→ その行のすぐ下（部材なら同上施工費のうしろ）。空白の行なら、その行に入れる
 *   箇所の欄（place:）→ その箇所の最初の行のすぐ下（行のない箇所ならその箇所に）
 *   いちばん下の空いた行（new:）→ 最後の箇所のうしろ（箇所がなければ作る）
 * 施工費は、すぐ上に施工費があればそのまとまりに入る（見積書では1行の同上施工費になる）。
 * removeIds：切り取ったもとの行（貼り付けたあとに消す。箇所の行がなくなれば箇所も消す）。
 * 返す rowId は、貼り付けた見積書の1行（選ぶ欄に使う）。貼り付ける場所がなければ null
 */
export function pasteLines(job: Job, key: string, rows: Row[], removeIds: string[] = []): {job: Job; rowId: string | null} {
  if (rows.length === 0) return {job, rowId: null};
  const [kind, id] = key.split(':');
  const copies = copyRows(rows);
  let j = job;
  let pi = -1;
  if (kind === 'line' || kind === 'excl') {
    const found = findRow(job, id);
    if (!found) return {job, rowId: null};
    pi = found.pi;
    const [a, b] = unitRange(found.place.rows, found.ri);
    const blank = b - a === 1 && isBlankRow(found.place.rows[a]);
    j = setPlaceRows(j, pi, [...found.place.rows.slice(0, blank ? a : b), ...copies, ...found.place.rows.slice(b)]);
  } else if (kind === 'place') {
    pi = job.places.findIndex((p) => p.id === id);
    if (pi < 0) return {job, rowId: null};
    const pr = job.places[pi].rows;
    const b = pr.length === 0 ? 0 : unitRange(pr, 0)[1];
    j = setPlaceRows(j, pi, [...pr.slice(0, b), ...copies, ...pr.slice(b)]);
  } else if (kind === 'new') {
    if (j.places.length === 0) j = {...j, places: [newPlace('')]};
    pi = j.places.length - 1;
    j = setPlaceRows(j, pi, [...j.places[pi].rows, ...copies]);
  } else return {job, rowId: null};

  const targetId = j.places[pi].id;
  if (removeIds.length > 0) {
    const gone = new Set(removeIds);
    // 行がなくなった箇所は消す。申請書の寸法・写真などを入れた箇所は空白の行にして残す（`deleteLine` と同じ）
    const left = j.places.map((p) => ({...p, rows: p.rows.filter((r) => !gone.has(r.id))}));
    j = {...j, places: left.flatMap((p) => (p.rows.length > 0 || p.id === targetId ? [p] : hasShinseiData(p) ? [{...p, rows: [manualRow('material', {qty: 1})]}] : []))};
  }
  // 貼り付けた最初の行の見積書の1行（施工費は、まとまりの最初の手間の行）
  const place = j.places.find((p) => p.id === targetId);
  const at = place ? place.rows.findIndex((r) => r.id === copies[0].id) : -1;
  if (!place || at < 0) return {job: j, rowId: null};
  return {job: j, rowId: place.rows[place.rows[at].kind === 'labor' ? workHead(place.rows, at) : at].id};
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

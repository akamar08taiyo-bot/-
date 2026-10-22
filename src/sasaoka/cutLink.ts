// 申請書の寸法（手すりの長さ L=）と、見積書の切って使う部材（手すり・ベースプレート）の使う長さをつなぐ。
// ユーザーの指示（2026-10-22）「どちらか一方を入力した際に、自動的に例1.2の部分が自動的に入力されるようにしてください」：
// 見積書で、申請書の寸法 L=600×1800mm（2400mm）に対して手すりが 2600mm（1.3本）、ベースプレートが 2400mm（1.2本）と食い違っていた。
//   ・申請書の長さを入れたら、その箇所の手すりとベースプレートの使う長さにする（2400mm ÷ 2000mm＝1.2本）
//   ・見積書で手すり（かベースプレート）の数量を入れたら、もう一方も同じ長さにする（前から同じ長さだったか、まだ入れていないとき）。
//     申請書の長さを入れてあり、前は見積書と同じ長さだったなら、申請書の長さは空けて見積書の長さを出す（`estimateLength`）
//   ・長さの分かっている箇所に、部材リストから手すり・ベースプレートを入れたら、その長さにする

import {isBlankRow} from './calc.ts';
import type {Place, Row} from './types.ts';

/** ベースプレート・補強板（手すりの長さに数えない。手すりと同じ長さを使う） */
export const BASE_PLATE = /ベースプレート|補強板|取付板/;

const isPlate = (r: Row) => BASE_PLATE.test(`${r.estText ?? ''} ${r.name}`);

/** 申請書の長さ（「600×1800」「600, 1800」「600+1800」「2400mm」）を mm の数に。「1,600」のような3けた区切りは1つの数。読めなければ [] */
export function dimsLengths(l: string | undefined): number[] {
  const t = (l ?? '')
    .normalize('NFKC')
    .replace(/mm/gi, '')
    .replace(/(^|\D)(\d{1,2}),(\d{3})(?!\d)/g, '$1$2$3');
  return t
    .split(/[,、xX*×+\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * 長さで数える部材の行（切って使う手すり・ベースプレート）：1本の長さが分かり、使う長さを入れてあるか、
 * 1.5m 以上の材（2m・4m）でまだ 1本以下（入れたばかり・本数は空けてある）。2本以上の本数で入れた行（切らずに使う）・短い既製品の手すりはのぞく
 */
export function cutRow(r: Row): boolean {
  return r.kind === 'material' && !isBlankRow(r) && r.pieceLengthM > 0 && (r.lengthCm > 0 || (r.pieceLengthM >= 1.5 && r.qty <= 1));
}

/** その行の使う長さ（mm。本数ぶん） */
const usedMm = (r: Row) => (r.lengthCm > 0 ? Math.round(r.lengthCm * 10 * Math.max(1, r.qty)) : 0);
const sumMm = (rows: Row[]) => rows.reduce((n, r) => n + usedMm(r), 0);

/** 使う長さを mm にする（1本ぶん）。同じなら同じ行 */
function withMm(r: Row, mm: number): Row {
  return usedMm(r) === Math.round(mm) && (r.qty === 1 || r.lengthCm > 0) ? r : {...r, lengthCm: Math.round(mm * 1000) / 10000, qty: 1};
}

/** 申請書の長さを見積書の行に：手すりの行が長さの数と同じだけあれば順に、1行なら合計。ベースプレートは1行なら合計 */
export function lengthsToRows(rows: Row[], mms: number[]): Row[] {
  if (mms.length === 0) return rows;
  const total = mms.reduce((a, b) => a + b, 0);
  const rails = rows.filter((r) => cutRow(r) && !isPlate(r));
  const plates = rows.filter((r) => cutRow(r) && isPlate(r));
  const want = new Map<string, number>();
  if (rails.length === 1) want.set(rails[0].id, total);
  else if (rails.length > 1 && rails.length === mms.length) rails.forEach((r, i) => want.set(r.id, mms[i]));
  if (plates.length === 1) want.set(plates[0].id, total);
  if (want.size === 0) return rows;
  const out = rows.map((r) => (want.has(r.id) ? withMm(r, want.get(r.id)!) : r));
  return out.every((r, i) => r === rows[i]) ? rows : out;
}

/** 申請書で箇所の長さを入れたとき（手すりの取り付けの箇所だけ）。空にしたときは見積書を変えない */
export function placeFromDims(p: Place): Place {
  if (p.kind !== 1) return p;
  const rows = lengthsToRows(p.rows, dimsLengths(p.dims?.l));
  return rows === p.rows ? p : {...p, rows};
}

/**
 * 見積書で行の数量を直したとき（before → after）：同じ箇所のもう一方（手すり⇔ベースプレート）が1行で、
 * 前は直した側と同じ長さだったか、まだ長さを入れていなければ、同じ長さ（直した側の合計）にする。
 * 申請書の長さが前は見積書の手すりと同じだったなら、空けて見積書の長さを出す（違う長さを書いてあったときはそのまま）
 */
export function placeAfterQty(before: Place, after: Place, rowId: string): Place {
  const changed = after.rows.find((r) => r.id === rowId);
  if (!changed || !cutRow(changed)) return after;
  const plate = isPlate(changed);
  const group = (rows: Row[]) => rows.filter((r) => cutRow(r) && isPlate(r) === plate);
  const prev = sumMm(group(before.rows));
  const next = sumMm(group(after.rows));
  if (next === prev || next === 0) return after;
  let rows = after.rows;
  const others = after.rows.filter((r) => cutRow(r) && isPlate(r) !== plate);
  if (others.length === 1 && (usedMm(others[0]) === 0 || usedMm(others[0]) === prev)) {
    rows = rows.map((r) => (r === others[0] ? withMm(r, next) : r));
  }
  let out: Place = rows === after.rows ? after : {...after, rows};
  const dims = dimsLengths(after.dims?.l);
  const railsBefore = sumMm(before.rows.filter((r) => cutRow(r) && !isPlate(r)));
  const railsAfter = sumMm(out.rows.filter((r) => cutRow(r) && !isPlate(r)));
  if (after.kind === 1 && dims.length > 0 && railsAfter !== railsBefore && dims.reduce((a, b) => a + b, 0) === railsBefore) {
    const {l: _old, ...rest} = after.dims ?? {};
    const {dims: _d, ...place} = out;
    out = Object.keys(rest).length ? {...place, dims: rest} : place;
  }
  return out;
}

/**
 * 部材リストから入れた行（ids）が切って使う部材で、まだ長さがなければ、その箇所の長さにする：
 * 申請書の長さ（手すりの取り付けの箇所）、なければ同じ箇所のもう一方（手すり⇔ベースプレート）の長さ
 */
export function fillAdded(p: Place, ids: Set<string>): Place {
  const dims = p.kind === 1 ? dimsLengths(p.dims?.l) : [];
  const dimsTotal = dims.reduce((a, b) => a + b, 0);
  let changed = false;
  const rows = p.rows.map((r) => {
    if (!ids.has(r.id) || !cutRow(r) || r.lengthCm > 0) return r;
    const other = sumMm(p.rows.filter((x) => !ids.has(x.id) && cutRow(x) && isPlate(x) !== isPlate(r)));
    const mm = dimsTotal || other;
    if (!mm) return r;
    changed = true;
    return withMm(r, mm);
  });
  return changed ? {...p, rows} : p;
}

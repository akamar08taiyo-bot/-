// 申請書の寸法（手すりの長さ L=）と、見積書の切って使う部材（手すり・ベースプレート）の使う長さをつなぐ。
// ユーザーの指示（2026-10-22）「どちらか一方を入力した際に、自動的に例1.2の部分が自動的に入力されるようにしてください」：
// 見積書で、申請書の寸法 L=600×1800mm（2400mm）に対して手すりが 2600mm（1.3本）、ベースプレートが 2400mm（1.2本）と食い違っていた。
//   ・申請書の長さを入れたら、その箇所の手すりとベースプレートの使う長さにする（2400mm ÷ 2000mm＝1.2本）
//   ・見積書で手すり（かベースプレート）の数量を入れたら、もう一方も同じ長さにする（前から同じ長さだったか、まだ入れていないとき）。
//     申請書の長さを入れてあり、前は見積書と同じ長さだったなら、申請書の長さは空けて見積書の長さを出す（`estimateLength`）
//   ・長さの分かっている箇所に、部材リストから手すり・ベースプレートを入れたら、その長さにする
// 手すりの長さが変わったら、中間のブラケット（BD-01G）の数も入れ直す（`withBrackets`）

import {isBlankRow} from './calc.ts';
import {codeKey, insertRowsAt, manualRow, materialRow} from './rows.ts';
import type {Material, Place, Row} from './types.ts';

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

// ---------------------------------------------------------------- 中間のブラケット
// ユーザーの指示（2026-10-22「見積書で、中間のブラケット（BD-01G）の数も出しますか？」→「おねがいします」）。お客様の見積書で BD-01G が足りなかった。
// マツ六 BAUHAUS の 35 の丸棒（BD-1xx）は、ブラケットの間を 900mm 以内にする（メーカーの決まり）。両端はエンドブラケット（BD-08G など。今までどおり手で入れる）で、
// そのあいだに 35ブラケット横型（BD-01G）を、手すり1本（申請書の長さの区切りごと。L字は2本）に ceil(長さ÷900mm)−1 個。
//   ・手すりの長さが変わったら（申請書の長さ・見積書の数量・部材リストから入れた）、その箇所の BD-01G の数をそれにする。手で別の数にしてあればそのまま
//   ・BD-01G の行がなければ、手すりのすぐ下（手すりの同上施工費があればその下）に部材リストから入れる（色は端のブラケットに合わせる。部材リストになければ品番だけの行）
//   ・900mm までの手すりにしたら、入れた BD-01G の行は外す

/** 35 の丸棒（品番 BD-1［色］［長さ］）・35ブラケット横型（中間）・35エンドブラケット（両端）。品番は `codeKey` の形 */
const RAIL_35 = /^bd1\d\d$/;
const MID_BRACKET = /^bd01(g|s|b|bk)?$/;
const END_BRACKET = /^bd08(g|s|b|bk)$/;
/** ブラケットの間（この mm 以内） */
export const BRACKET_SPAN_MM = 900;
const COLOR_NAMES: Record<string, string> = {g: 'ゴールド', s: 'シルバー', b: 'ブラウン', bk: 'ブラック'};

/** 行の品番（比べる形）。品番の欄が空なら品名の中の「BD-132」など（見積書に手で打ち込んだ行） */
function rowCode(r: Row): string {
  if (r.code.trim()) return codeKey(r.code);
  const m = /(^|[^A-Z0-9])(BD[-‐－]?\d{2,3}(?:BK|[GSB])?)(?![0-9A-Z])/i.exec(r.name.normalize('NFKC'));
  return m ? codeKey(m[2]) : '';
}
const isMazroc = (r: Row) => !r.maker.trim() || /マツ六|mazroc/i.test(r.maker.normalize('NFKC'));
const isPart = (re: RegExp) => (r: Row) => r.kind === 'material' && !isBlankRow(r) && isMazroc(r) && re.test(rowCode(r));
const isRail35 = isPart(RAIL_35);
const isMid = isPart(MID_BRACKET);
const isEnd = isPart(END_BRACKET);

/** 箇所の 35 の丸棒の1本ずつの長さ（mm）。申請書の長さの区切り（L=600×1800）の合計が手すりの長さと同じなら、区切りごと */
function railRuns(p: Place): number[] {
  const runs: number[] = [];
  for (const r of p.rows) {
    if (!isRail35(r)) continue;
    if (r.lengthCm > 0) for (let i = 0; i < Math.max(1, Math.round(r.qty)); i++) runs.push(r.lengthCm * 10);
    else if (r.pieceLengthM > 0 && r.qty > 0) {
      // 切らずに使う（1本・2本）。本数が小数なら、その長さを1本
      if (Number.isInteger(r.qty)) for (let i = 0; i < r.qty; i++) runs.push(r.pieceLengthM * 1000);
      else runs.push(r.qty * r.pieceLengthM * 1000);
    }
  }
  const total = runs.reduce((a, b) => a + b, 0);
  const dims = p.kind === 1 ? dimsLengths(p.dims?.l) : [];
  return dims.length > 0 && Math.abs(dims.reduce((a, b) => a + b, 0) - total) < 1 ? dims : runs;
}

/** 中間のブラケットの数：手すり1本ごとに ceil(長さ÷900mm)−1（900mm までは0。1800mm は1、2400mm は2、4000mm は4） */
export function midBrackets(runsMm: number[]): number {
  return runsMm.reduce((n, mm) => n + Math.max(0, Math.ceil(mm / BRACKET_SPAN_MM - 1e-6) - 1), 0);
}

const sameRuns = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 0.5);

/** 入れる中間のブラケットの行。色は端のブラケット（BD-08S なら BD-01S）、なければゴールド */
function midRow(p: Place, materials: Material[], qty: number): Row {
  const end = p.rows.find(isEnd);
  const color = end ? (END_BRACKET.exec(rowCode(end))?.[1] ?? 'g') : 'g';
  const code = `BD-01${color.toUpperCase()}`;
  const m = materials.find((x) => codeKey(x.code) === codeKey(code));
  return m ? materialRow(m, qty) : manualRow('material', {name: `35ブラケット横型カバー付 ${COLOR_NAMES[color]}`, code, maker: 'マツ六', unit: '個', qty});
}

/**
 * 箇所の行を直したあと（before → after）、手すり（35 の丸棒）の長さが変わっていたら、中間のブラケット（BD-01G など）の数を入れ直す。
 * BD-01G の行が前は前の長さの数（か 0・前は長さが分からなかった・いま入れた行）なら新しい数に。手で別の数にしてあれば・2行以上に分けてあればそのまま。
 * 長さが変わらなくても、部材リストから入れたばかりの BD-01G は中間の数にする
 */
export function withBrackets(before: Place | undefined, after: Place, materials: Material[]): Place {
  const runs = railRuns(after);
  if (runs.length === 0) return after;
  const prevRuns = before ? railRuns(before) : [];
  const want = midBrackets(runs);
  const mids = after.rows.filter(isMid);
  if (mids.length > 1) return after;
  const mid = mids[0];
  const was = mid && before?.rows.find((r) => r.id === mid.id);
  const setQty = (qty: number): Place => ({...after, rows: after.rows.map((r) => (r === mid ? {...r, qty} : r))});
  if (sameRuns(runs, prevRuns)) return mid && !was && want > 0 && mid.qty !== want ? setQty(want) : after;
  if (mid) {
    const follow = !was || was.qty === 0 || prevRuns.length === 0 || was.qty === midBrackets(prevRuns);
    if (!follow) return after;
    if (want > 0) return mid.qty === want ? after : setQty(want);
    // 要らなくなった（900mm までの手すり）：入れたままの行（単価・内容・備考を直していない）は外す
    const plain = mid.estPrice === null && mid.estText === null && mid.estNote === null && !mid.excluded;
    if (plain) return {...after, rows: after.rows.filter((r) => r !== mid)};
    return mid.qty === 0 ? after : setQty(0);
  }
  if (want === 0) return after;
  let last: string | null = null;
  for (const r of after.rows) if (isRail35(r)) last = r.id;
  return {...after, rows: insertRowsAt(after.rows, [midRow(after, materials, want)], last)};
}

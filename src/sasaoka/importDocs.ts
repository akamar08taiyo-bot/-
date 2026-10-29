// 申請書・見積書・理由書（Excel）の取り込み（見積書の一覧の「📥 取り込む」。ユーザーの指示「申請書や見積もり・理由書の取り込みをできるようにする。
// 前提条件として、名字が同じ人の場合は同一人物とみなし、〇〇様に合算できるようにする。それ以外は、そのまま取り込んで、申請書や見積書（合計）金額を認識し、
// 売上見込みや受注残などに計上するようにする」2026-10-27）。
// 読めるもの（.xlsx。.xls は Excel で .xlsx に保存し直してもらう）：
//   申請書：4つの保険者の原本の形（このアプリで作った申請書と同じ様式。readShinseiBook）。氏名・住所・番号・改修の箇所・申請書の項目・改修費用
//   理由書：国の様式（このアプリの原本 riyu.xltx の形。readRiyuBook）
//   見積書：このアプリの2つの書式（苅田町・行橋市・みやこ町用／広域連合用）は、明細を様邸の行にする（読んだ行の合計が見積書の合計と同じときだけ）。
//           ほかの形（ほかの工務店の見積書など）と、合計が合わない見積書は、お客様名・住所と合計の金額だけを読む
// 売上見込み・受注残の金額は salesPlan.ts の jutakuSales（見積書の行 → 取り込んだ見積書の合計 → 申請書の改修費用）。工務店の請求書には入れない（shikiri: false）

import {estimateTotals, hasEstimateRows, isBlankRow, overheadAuto} from './calc.ts';
import {CARE_LINE} from './careLines.ts';
import type {EstimateSettings} from './calc.ts';
import {jobInsurer, KINDS, NO_SHINSEI} from './estimateForms.ts';
import {readRiyuBook, NO_RIYU} from './riyu.ts';
import {manualRow, newPlace} from './rows.ts';
import {isLaborText, parseKind, parseListNote, parsePlace} from './sheetEdit.ts';
import {readShinseiPhotos} from './photoImport.ts';
import type {FramePhotos} from './photoImport.ts';
import {padInsuredNo, readShinseiBook} from './shinsei.ts';
import type {ShinseiPlace} from './shinsei.ts';
import type {ImportedDoc, Insurer, Job, Place, PlaceDims, RiyuInfo, Row, ShinseiInfo, TokuteiImportItem} from './types.ts';
import {isoDate, todayIso, uid} from './util.ts';
import {isXlsx, readXlsx} from './xlsx.ts';
import type {Sheet} from './xlsx.ts';

export type DocKind = ImportedDoc['kind'];
export const DOC_LABEL: Record<DocKind, string> = {shinsei: '申請書', estimate: '見積書', riyu: '理由書', tokutei: '特定福祉用具申請書'};

/** 読んだ書類1つ */
export type ReadDoc = {
  file: string;
  hash: string;
  kind: DocKind;
  name: string; // お客様名（被保険者氏名。「様」「様邸」は除く）
  address: string;
  insuredNo: string;
  insurer: Insurer | '';
  date: string; // 書類の日付 'YYYY-MM-DD'（見積書の作成日・申請書の完了予定日か着工予定日・理由書の作成日）。なければ ''
  places: Place[]; // 申請書の改修の箇所（行なし）か、見積書の明細（行あり＝rows）
  rows: boolean;
  overhead: number | null; // 見積書の明細を行にしたときの、見積書の諸経費（全体・介護保険の対象）
  overheadTarget: number | null;
  info: Partial<ShinseiInfo>;
  riyu: Partial<RiyuInfo> | null;
  total: number | null; // 見積書の合計（税込）／申請書の改修費用
  tax: number | null; // 見積書の消費税（分かれば）
  photos: FramePhotos[]; // 申請書の写真貼付用紙・平面図の写真と書き込み（photoImport.ts。date は 'YYYY-MM-DD'）。様邸に入れるのは DocImport.tsx（写真は端末の中だけ）
  tokutei: TokuteiImportItem[]; // 特定福祉用具の申請書の福祉用具（readTokutei。ほかの書類は空）
};

// ---------------------------------------------------------------- 文字・数

/** 比べるときの名前（すき間を除く。全角の英数字は半角に） */
export const compactName = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');
/** お客様名の「様」「様邸」「殿」と前後のすき間を除く */
export const cleanName = (s: string) =>
  s
    .trim()
    .replace(/[\s　]*(様邸|様|殿)$/, '')
    .replace(/[\s　]+/g, (gap) => (gap.includes('　') ? '　' : ' '))
    .trim();

/** 数の欄（「12,345」「￥12,345」「12,345円」）。数でなければ null */
function numOf(v: string | undefined): number | null {
  const t = (v ?? '').normalize('NFKC').replace(/[,円￥¥\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const money = (v: string | undefined) => {
  const n = numOf(v);
  return n === null ? null : Math.round(n);
};
/** 丸数字（①〜⑳）→ 番号。なければ 0 */
const circledNo = (v: string | undefined) => {
  const m = /[①-⑳]/.exec(v ?? '');
  return m ? m[0].charCodeAt(0) - 0x2460 + 1 : 0;
};

/** 日付の文字（令和8年10月21日・R8.10.21・2026/10/21・2026年10月21日・Excel の日付の数）→ 'YYYY-MM-DD'。読めなければ '' */
export function dateOf(text: string): string {
  const t = text.normalize('NFKC').replace(/\s/g, '');
  const pad = (n: string | number) => String(n).padStart(2, '0');
  const ok = (y: number, m: number, d: number) => (y > 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '');
  const w = /(令和|R)(元|\d+)[年.\-/](\d+)[月.\-/](\d+)日?/.exec(t);
  if (w) return ok(2018 + (w[2] === '元' ? 1 : Number(w[2])), Number(w[3]), Number(w[4]));
  const g = /(\d{4})[年.\-/](\d{1,2})[月.\-/](\d{1,2})日?/.exec(t);
  if (g) return ok(Number(g[1]), Number(g[2]), Number(g[3]));
  if (/^\d{5}$/.test(t)) {
    // Excel の日付の数（1900年1月1日＝1。うるう年のまちがいの分で 1899-12-30 から数える）
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return '';
}

/** ファイルの中身の目印（同じファイルを2回取り込まない。FNV-1a） */
export function hashOf(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${bytes.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------- 申請書・理由書

/**
 * 申請書の改修の内容の1行（「①玄関　手すりの取り付け　L=600mm H=800mm」を readShinseiBook が分けたもの）を箇所にする：
 * 改修の種類の名前のうしろの寸法は申請書のタブの寸法の欄（dims）、残りは「そのほか」（shinseiText）
 */
export function placeFromShinsei(sp: ShinseiPlace): Place {
  const kindName = KINDS[sp.kind - 1] ?? '';
  let rest = sp.text.trim();
  if (kindName && rest.startsWith(kindName)) rest = rest.slice(kindName.length);
  const dims: PlaceDims = {};
  // 寸法「L=600mm」「W600mm」（全角の文字でも）。そのほかの文の全角のすき間はそのまま残す（NFKC で半角にしない）。
  // 手すりの長さは2本以上もある（「L=700mm×1100mm×2000mm」「L=600×850mm」）：× でつないだ数を全部長さにする。前は「L=700mm」だけを読み、
  // 残りの「×1100mm×2000mm」を「そのほか」にしたので、申請書の改修の内容が2段になった（ユーザーの指摘「長さが２段になっている。横一列で入っていない」2026-10-28）
  const take = (letter: string, eq: boolean, key: keyof PlaceDims, many = false) => {
    const num = '[0-9０-９]+(?:[.．][0-9０-９]+)?';
    const seq = many ? `((?:${num}[\\s　]*(?:mm|ｍｍ|㎜)?[\\s　]*[×xX*＊ｘＸ][\\s　]*)*${num})` : `(${num})`;
    const re = new RegExp(`(^|[\\s　])[${letter}${String.fromCharCode(letter.charCodeAt(0) + 0xfee0)}][\\s　]*[=＝]${eq ? '' : '?'}[\\s　]*${seq}[\\s　]*(mm|ｍｍ|㎜)`, 'i');
    const m = re.exec(rest);
    if (!m) return;
    dims[key] = m[2].normalize('NFKC').replace(/\s*mm\s*/gi, '').replace(/\s*[×xX*]\s*/g, '×');
    rest = rest.replace(m[0], m[1]);
  };
  if (sp.kind === 1) {
    take('L', true, 'l', true);
    take('H', true, 'h');
  }
  if (sp.kind === 2) {
    take('W', false, 'w');
    take('D', false, 'd');
    take('H', false, 'h');
  }
  const other = rest.replace(/^[\s　]+|[\s　]+$/g, '').replace(/[\s　]{2,}/g, '　');
  // 空白の行を1つ（申請書のタブで足した箇所と同じ。ShinseiEditor.tsx。行のない箇所は申請書・見積書に出ない）
  return {...newPlace(sp.name, [manualRow('material')]), kind: sp.kind || 1, photo: sp.photo, ...(Object.keys(dims).length ? {dims} : {}), ...(other ? {shinseiText: other} : {})};
}

const base = (file: string, hash: string, kind: DocKind): ReadDoc => ({
  file,
  hash,
  kind,
  name: '',
  address: '',
  insuredNo: '',
  insurer: '',
  date: '',
  places: [],
  rows: false,
  overhead: null,
  overheadTarget: null,
  info: {},
  riyu: null,
  total: null,
  tax: null,
  photos: [],
  tokutei: [],
});

/** 申請書の項目のうち、読んだもの（空でない文字の項目） */
const filledInfo = (info: Partial<ShinseiInfo>): Partial<ShinseiInfo> => Object.fromEntries(Object.entries(info).filter(([, v]) => (typeof v === 'string' ? v.trim() !== '' : v != null))) as Partial<ShinseiInfo>;

// ---------------------------------------------------------------- 見積書

type Grid = string[][];
const cell = (r: string[] | undefined, c: number) => (r?.[c] ?? '').trim();
const TOTAL_LABELS = ['小計', '諸経費', '消費税', '合計'] as const;
type TotalLabel = (typeof TOTAL_LABELS)[number];
type Totals = Partial<Record<TotalLabel, {all: number | null; target: number | null}>>;

/** 見積書の明細の1行を、様邸の行（部材か施工費）にする。金額は見積書の金額になるように（単価・数量・備考の定価と切って使う長さ） */
function lineRow(text: string, qtyText: string, unit: string, priceText: string, amountText: string, note: string, excluded: boolean, labor: boolean): Row | null {
  const name = text.replace(/\s*\n\s*/g, ' ').trim();
  const amount = money(amountText);
  const price = numOf(priceText);
  const qty = numOf(qtyText);
  const notes = note
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!name && amount === null && price === null && qty === null && notes.length === 0) return null;
  if (labor) {
    // 施工費のまとまり：見積書の金額を見積の単価×1（見積書で打ち込んだ施工費と同じ。sheetEdit.ts の setWorkAmount）。自動の名前（施工費・同上施工費）は持たない
    const auto = name === '' || name === '施工費' || name === '同上施工費';
    const hours = /^1時間[\d,]+円×[\d.]+時間$/.test(notes.join('').normalize('NFKC')); // 広域連合用の自動の算出根拠
    const value = amount ?? 0;
    return manualRow('labor', {name: auto ? '施工費' : name, qty: 1, price: value, estPrice: value, estText: auto ? null : name, estNote: notes.length && !hours ? notes.join('\n') : null, excluded});
  }
  // 部材：備考の1行目が定価（「定価20,000円（4m）×0.8」）、2行目が切って使う長さ（「600mm÷4000mm＝0.15」「600mm÷4000mm×2＝0.3」）
  const list = parseListNote(notes[0] ?? '');
  const cut = /^(\d+(?:\.\d+)?)mm÷(\d+(?:\.\d+)?)mm(?:×(\d+(?:\.\d+)?))?＝/.exec((notes[1] ?? '').normalize('NFKC').replace(/=/g, '＝'));
  const row = manualRow('material', {
    name,
    unit: unit.trim(),
    qty: qty ?? 0,
    listPrice: list?.list ?? 0,
    estPrice: price,
    estNote: list ? (notes.length > (cut ? 2 : 1) ? notes.join('\n') : null) : notes.length ? notes.join('\n') : null,
    excluded,
  });
  if (cut) {
    row.lengthCm = Number(cut[1]) / 10;
    row.pieceLengthM = Number(cut[2]) / 1000;
    row.qty = cut[3] ? Number(cut[3]) : 1;
  } else if (list?.pieceM) row.pieceLengthM = list.pieceM;
  return row;
}

/** 合計の欄の行（小計・諸経費・消費税・合計）の金額 */
function putTotal(totals: Totals, label: string, all: string, target: string): boolean {
  const l = label.replace(/[\s　]/g, '') as TotalLabel;
  if (!TOTAL_LABELS.includes(l)) return false;
  totals[l] = {all: money(all), target: money(target)};
  return true;
}

/** 苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」（estimateXlsx.ts の yukuhashiSheet と同じ列） */
function parseYukuhashi(rows: Grid): {places: Place[]; totals: Totals} | null {
  const isHead = (r: string[]) => cell(r, 0).startsWith('改修内容') && cell(r, 3) === '数量' && cell(r, 6) === '金額';
  if (!rows.some(isHead)) return null;
  const places: Place[] = [];
  const totals: Totals = {};
  let open = false;
  let place: Place | null = null;
  for (const r of rows) {
    if (isHead(r)) {
      open = true;
      continue;
    }
    if (!open) continue;
    if (cell(r, 7) === '数量' && cell(r, 9) === '単価') continue; // 見出しの2段目
    if (/工事費見積書/.test(cell(r, 0))) {
      open = false; // 次のページの題名
      continue;
    }
    if (putTotal(totals, cell(r, 2), cell(r, 6), cell(r, 10))) continue;
    if (CARE_LINE.test(cell(r, 0))) continue; // 明細の下の介護保険の内訳（careLines.ts）
    const [work, where] = [cell(r, 0), cell(r, 1)];
    if (work || where) {
      const p = parsePlace(where);
      place = {...newPlace(p.name), kind: parseKind(work) ?? 1, photo: p.photo ?? 0};
      places.push(place);
    }
    const excluded = cell(r, 11) !== '' && cell(r, 10) === '';
    const text = cell(r, 2);
    const labor = isLaborText(text) || ['式', '時間'].includes(cell(r, 4));
    const row = lineRow(text, cell(r, 3), cell(r, 4), cell(r, 5), cell(r, 6), r[12] ?? '', excluded, labor);
    if (!row) continue;
    if (!place) places.push((place = newPlace('')));
    place.rows.push(row);
  }
  return {places, totals};
}

/** 広域連合用「住宅改修内訳明細書」（estimateXlsx.ts の kouikiSheet と同じ列） */
function parseKouiki(rows: Grid): {places: Place[]; totals: Totals} | null {
  const isHead = (r: string[]) => cell(r, 0).startsWith('改修箇所') && cell(r, 5) === '数量' && cell(r, 8) === '金額';
  if (!rows.some(isHead)) return null;
  const places: Place[] = [];
  const totals: Totals = {};
  let open = false;
  let place: Place | null = null;
  for (const r of rows) {
    if (isHead(r)) {
      open = true;
      continue;
    }
    if (!open) continue;
    if (cell(r, 0) === '内訳書　様式' || cell(r, 1).startsWith('※')) {
      open = false; // 下の注意書き・次のページ
      continue;
    }
    if (putTotal(totals, cell(r, 3), cell(r, 8), cell(r, 15))) continue;
    if (CARE_LINE.test(cell(r, 0))) continue; // 明細の下の介護保険の内訳（careLines.ts）
    const [where, work, photo, kind] = [cell(r, 0), cell(r, 1), cell(r, 10), cell(r, 11)];
    if (where || work || photo || kind) {
      place = {...newPlace(where), kind: circledNo(kind) || parseKind(work) || 1, photo: circledNo(photo)};
      places.push(place);
    }
    const excluded = cell(r, 8) !== '' && cell(r, 15) === '';
    const labor = cell(r, 2) === '手' || isLaborText(cell(r, 3));
    const row = lineRow(r[3] ?? '', cell(r, 5), cell(r, 6), cell(r, 7), cell(r, 8), r[16] ?? '', excluded, labor);
    if (!row) continue;
    if (!place) places.push((place = newPlace('')));
    place.rows.push(row);
  }
  return {places, totals};
}

/** 会社・事業所の名前（お客様名ではない） */
const COMPANY = /株式会社|有限会社|㈱|㈲|\(株\)|（株）|営業所|工務店|事業所|御中/;

/** 表の中の、ラベルの右（なければ下）の値 */
function rightOf(rows: Grid, test: (label: string) => boolean, accept: (v: string) => boolean): string {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (let c = 0; c < r.length; c++) {
      if (!test(compactName(cell(r, c)))) continue;
      for (let k = c + 1; k < r.length; k++) if (cell(r, k) && accept(cell(r, k))) return cell(r, k);
      if (accept(cell(rows[i + 1], c))) return cell(rows[i + 1], c);
    }
  }
  return '';
}

/** ラベルの行の、右にある数のいちばん大きいもの（合計・消費税）。なければ下の欄の数 */
function amountsOf(rows: Grid, test: (label: string) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (let c = 0; c < r.length; c++) {
      if (!test(compactName(cell(r, c)))) continue;
      const nums = r.slice(c + 1).map((v) => money(v)).filter((n): n is number => n !== null && n > 0);
      const below = money(cell(rows[i + 1], c));
      if (nums.length) out.push(Math.max(...nums));
      else if (below !== null && below > 0) out.push(below);
    }
  }
  return out.filter((n) => n < 1e8);
}

/** ほかの形の見積書・申請書：お客様名（被保険者氏名・お客様名の右、「〇〇 様」の欄）。会社の名前は除く */
function nameIn(rows: Grid): string {
  const label = rightOf(rows, (l) => /^(被保険者)?(氏名|お名前)$|^お客様名$|^施主(名|様)?$|^ご?依頼者(名)?$/.test(l), (v) => !COMPANY.test(v) && !/^\d/.test(v));
  if (label) return cleanName(label);
  for (const r of rows)
    for (let c = 0; c < r.length; c++) {
      const v = cell(r, c);
      if (COMPANY.test(v)) continue;
      const m = /^(.+?)[\s　]*(様邸|様)([\s　]|$)/.exec(v);
      if (m && m[1].length <= 20) return cleanName(m[1]);
      // 「様邸　住宅改修」「様」だけの欄：左の欄が名前（このアプリの見積書の書き方）
      if (/^(様邸|様)/.test(v)) {
        const left = r
          .slice(0, c)
          .map((x) => x.trim())
          .filter(Boolean)
          .pop();
        if (left && !COMPANY.test(left) && left.length <= 20) return cleanName(left);
      }
    }
  return '';
}

/**
 * 見積書（Excel）を読む。このアプリの2つの書式なら明細も（読んだ行の合計が見積書の合計と同じときだけ行にする）。
 * ほかの形はお客様名・住所・番号・日付・合計・消費税だけ。合計の金額のない表は見積書としない（null）
 */
function readEstimate(sheets: Sheet[], file: string, hash: string, s: EstimateSettings): ReadDoc | null {
  const doc = base(file, hash, 'estimate');
  const rows = sheets.flatMap((sh) => sh.rows);
  for (const sh of sheets) {
    const own = parseYukuhashi(sh.rows) ?? parseKouiki(sh.rows);
    if (!own) continue;
    const kouiki = !parseYukuhashi(sh.rows);
    const t = own.totals;
    doc.total = t.合計?.all ?? null;
    doc.tax = t.消費税?.all ?? null;
    if (kouiki) doc.insurer = 'kouiki';
    // 行にした明細で見積書の合計になるか（諸経費は見積書の金額。対象外の行があれば介護保険の対象の諸経費も）
    const places = own.places.filter((p) => p.name || p.rows.some((r) => !isBlankRow(r)));
    const trial = {places, overhead: t.諸経費?.all ?? null, overheadTarget: t.諸経費?.target ?? null};
    const got = estimateTotals(trial, s);
    if (doc.total !== null && got.all.total === doc.total && got.all.subtotal === (t.小計?.all ?? got.all.subtotal) && (got.excluded === 0 || t.合計?.target == null || got.target.total === t.合計.target)) {
      doc.places = places;
      doc.rows = places.some((p) => p.rows.length > 0);
      doc.overhead = trial.overhead;
      doc.overheadTarget = got.excluded > 0 ? trial.overheadTarget : null;
    }
    break;
  }
  // お客様名：このアプリの見積書は「〇〇　様邸　住宅改修」の欄・シートの名前（「〇〇様」。広域連合用は表に名前の欄がない）、ほかの形はラベル・「様」の欄
  const sheetName = sheets.map((sh) => /^(.+?)様$/.exec(sh.name.trim())?.[1] ?? '').find((n) => n && !/^(見積書|Sheet\d*)$/.test(n)) ?? '';
  doc.name = nameIn(rows) || cleanName(sheetName) || cleanName(/^(.+?)様/.exec(file.replace(/\.[^.]+$/, ''))?.[1] ?? '');
  const insured = rows.flat().map((v) => /被保険者番号[^0-9０-９]*([0-9０-９]{6,10})/.exec(v)?.[1]).find(Boolean);
  doc.insuredNo = insured ? padInsuredNo(insured.normalize('NFKC')) : '';
  doc.address = rightOf(rows, (l) => /^(工事場所(\(住所\))?|工事場所（住所）|工事住所|施工場所|現場住所|住所)$/.test(l), (v) => !COMPANY.test(v) && /[都道府県市区町村郡]/.test(v));
  const head = sheets.map((sh) => sh.header ?? '').find((h) => /作成日|見積日|日付/.test(h)) ?? '';
  doc.date = dateOf(head.replace(/^.*?(作成日|見積日|日付)/, '')) || dateOf(rightOf(rows, (l) => /^(見積|作成|発行)(年月)?日$|^日付$|^見積もり作成日$/.test(l), (v) => dateOf(v) !== ''));
  if (doc.total === null) {
    const totals = amountsOf(rows, (l) => /^(御?見積)?(総?合計|合計金額|総額|見積金額)(\(税込\)|（税込）)?$|^税込合計$|^御見積金額$/.test(l));
    doc.total = totals.length ? Math.max(...totals) : null;
    const taxes = amountsOf(rows, (l) => /^消費税(額|等)?(\(\d+%\)|（\d+％）)?$/.test(l));
    doc.tax = taxes.length && doc.total !== null ? Math.max(...taxes.filter((n) => n < doc.total!), 0) || null : null;
  }
  if (doc.total === null) return null;
  return doc;
}

/** ほかの形の申請書（題名に「申請書」があり、改修費用の欄がある）：お客様名・住所・費用だけ */
function readOtherShinsei(sheets: Sheet[], file: string, hash: string): ReadDoc | null {
  const rows = sheets.flatMap((sh) => sh.rows);
  const top = rows.slice(0, 6).flat().join(' ');
  if (!/申請書/.test(top) || /見積/.test(top)) return null;
  const doc = base(file, hash, 'shinsei');
  const costs = amountsOf(rows, (l) => /^(住宅)?改修(予定)?費用|^工事(予定)?費用?$|^改修に要した費用/.test(l));
  doc.total = costs.length ? Math.max(...costs) : null;
  doc.name = nameIn(rows);
  if (!doc.name) return null;
  doc.address = rightOf(rows, (l) => /^住所$/.test(l), (v) => /[都道府県市区町村郡]/.test(v) && !COMPANY.test(v));
  if (doc.total) doc.info = {cost: doc.total};
  return doc;
}

/**
 * Excel のファイルを読む（申請書・理由書・見積書のどれか）。読めなければ null（.xls・表でないファイル・どの書類でもない表）。
 * modified はファイルの更新時刻（見積書の作成日がないとき、書類の日付に使う）
 */
export function readDoc(bytes: Uint8Array, file: string, s: EstimateSettings, modified = 0): ReadDoc | null {
  if (!isXlsx(bytes)) return null;
  const hash = hashOf(bytes);
  const fileDate = modified > 0 ? isoDate(modified) : '';
  const sh = readShinseiBook(bytes);
  if (sh) {
    const doc = base(file, hash, 'shinsei');
    const info = filledInfo(sh.info);
    if (sh.cost) info.cost = sh.cost;
    return {
      ...doc,
      name: cleanName(sh.name),
      address: sh.address,
      insuredNo: /[1-9]/.test(sh.insuredNo) ? sh.insuredNo : '',
      insurer: sh.insurer,
      date: sh.info.end || sh.info.start || fileDate,
      places: sh.places.filter((p) => p.name || p.text).map(placeFromShinsei),
      info,
      total: sh.cost,
      // 写真貼付用紙・平面図の写真も一緒に（ユーザーの指示「申請書などを取り込んだときに、一括で写真などもと取り込めるようにする」2026-10-28）
      photos: readShinseiPhotos(bytes, sh.insurer).map((f) => ({...f, date: dateOf(f.date)})),
    };
  }
  const ry = readRiyuBook(bytes);
  if (ry) {
    const doc = base(file, hash, 'riyu');
    return {...doc, name: cleanName(ry.name), address: ry.address, insuredNo: /[1-9]/.test(ry.insuredNo) ? ry.insuredNo : '', date: ry.riyu.madeDate || fileDate, info: filledInfo(ry.info), riyu: ry.riyu};
  }
  let sheets: Sheet[];
  try {
    sheets = readXlsx(bytes);
  } catch {
    return null;
  }
  const doc = readTokutei(sheets, file, hash) ?? readEstimate(sheets, file, hash, s) ?? readOtherShinsei(sheets, file, hash);
  if (doc && !doc.date) doc.date = fileDate;
  return doc;
}

// ---------------------------------------------------------------- 特定福祉用具の申請書

// 特定福祉用具（福祉用具購入費）の申請書（ユーザーの報告「申請書を読み込めないことがある」2026-10-29：行橋市の福祉用具購入の受領委任払の申請書が読めなかった）。
// 6つの保険者の様式（特定福祉用具のアプリと同じ様式）とも、ラベルの近くの値を読む：お客様（氏名・フリガナ・被保険者番号・住所・郵便番号・電話番号・生年月日）と、
// 福祉用具（種目・商品名・製造事業者・金額）。福祉用具は 🛁 特定福祉用具申請書のタブで、特定福祉用具の案件に入れる（tokuteiLink.ts）。
// 住宅改修の売上見込み・受注残には入れない（特定福祉用具の案件の金額で入る）

/** 特定福祉用具の種目（福岡市の申請書の種目の番号の順：１．腰掛便座 … ９．歩行補助つえ） */
const TK_KINDS = ['腰掛便座', '自動排泄処理装置の交換可能部品', '入浴補助用具', '簡易浴槽', '移動用リフトのつり具の部分', '排泄予測支援機器', '固定用スロープ', '歩行器', '歩行補助つえ'];
const tkKind = (v: string) => {
  const t = compactName(v).replace(/^スロープ$/, '固定用スロープ');
  return TK_KINDS.find((k) => t === k || t === compactName(k)) ?? '';
};
/** 特定福祉用具の申請書のシート（題名・文の言い回し。住宅改修の申請書の委任状の「福祉用具購入費及び住宅改修費」は除く） */
const TK_SHEET = /福祉用具購入費?(の)?(支給)?(事前)?(承認)?申請|福祉用具購入費受領委任払い?の申請|福祉用具購入費の支給を申請|福祉用具購入の承認を申請|福祉用具名|特定福祉用具概要書/;
/** ラベルらしい文字（値として読まない） */
const LABELISH = /(番号|記載日|年月日|購入月|フリガナ|氏名|住所|電話|性別|区分|円|様|長|殿|申請|日)$|^[年月日]$|^[(（※]/;
type At = {r: number; c: number};

/** ラベルの欄（すき間を除いた文字で。「住」「所」のように1字ずつの欄に分かれたラベルも） */
function findLabel(rows: Grid, test: RegExp): At | null {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const v = compactName(cell(row, c));
      if (!v) continue;
      if (test.test(v)) return {r, c};
      if (v.length !== 1) continue;
      let joined = v;
      for (let k = c + 1; k < row.length && joined.length < 6; k++) {
        const w = compactName(cell(row, k));
        if (!w) continue;
        if (w.length !== 1) break;
        joined += w;
        if (test.test(joined)) return {r, c};
      }
    }
  }
  return null;
}
/** ラベルの近くの値：同じ行の右 → 上と下の行（近い順・ラベルの列から右）。北九州市の様式は値がラベルの上の行にある */
function nearValue(rows: Grid, at: At | null, accept: (v: string) => boolean, span = 3): string {
  if (!at) return '';
  const row = rows[at.r] ?? [];
  for (let c = at.c + 1; c < row.length; c++) if (cell(row, c) && accept(cell(row, c))) return cell(row, c);
  for (let d = 1; d <= span; d++)
    for (const r of [at.r - d, at.r + d]) {
      const rr = rows[r];
      if (!rr) continue;
      for (let c = at.c; c < rr.length; c++) if (cell(rr, c) && accept(cell(rr, c))) return cell(rr, c);
    }
  return '';
}
const isNameLike = (v: string) => v.length <= 25 && !/[0-9０-９〒]/.test(v) && !COMPANY.test(v) && !LABELISH.test(compactName(v)) && !/.{2,}[都道府県市区町村郡].{2,}/.test(v);
const isKana = (v: string) => /^[ァ-ヶーｦ-ﾟぁ-ゖ\s　・]+$/.test(v) && /[ァ-ヶｦ-ﾟぁ-ゖ]/.test(v);
const isAddress = (v: string) => /[都道府県市区町村郡]/.test(v) && /[0-9０-９]|丁目|番地|大字/.test(v) && !COMPANY.test(v) && !/^〒/.test(v.trim());
const isTel = (v: string) => /^[0-9０-９()（）\-－ー‐\s]{10,}$/.test(v.trim());

/** ラベルの行の、ラベルの右の数字の欄（1字ずつのマスも）をつなぐ（被保険者番号） */
function digitsRight(rows: Grid, at: At | null): string {
  if (!at) return '';
  const row = rows[at.r] ?? [];
  let out = '';
  for (let c = at.c + 1; c < row.length; c++) {
    const v = cell(row, c).normalize('NFKC');
    if (!v) continue;
    if (!/^\d+$/.test(v)) {
      if (out) break;
      continue;
    }
    out += v;
  }
  return out;
}

/** 生年月日（「昭和15年3月15日生」）。元号が1つに決まらない（「明・大・昭」の丸は図形）ときは読まない */
function birthOf(rows: Grid, at: At | null): Partial<ShinseiInfo> {
  if (!at) return {};
  const row = rows[at.r] ?? [];
  const parts: string[] = [];
  for (let c = at.c + 1; c < row.length; c++) {
    const v = cell(row, c);
    if (!v) continue;
    if (/性別/.test(compactName(v))) break;
    parts.push(v);
  }
  const t = parts.join('').normalize('NFKC').replace(/\s/g, '');
  const m = /(\d{1,2})年(\d{1,2})月(\d{1,2})日/.exec(t);
  if (!m) return {};
  const full = (['明治', '大正', '昭和'] as const).filter((e) => t.includes(e));
  const short = (['明', '大', '昭'] as const).filter((e) => t.includes(e));
  const era = full.length === 1 ? full[0] : full.length === 0 && short.length === 1 ? ({明: '明治', 大: '大正', 昭: '昭和'} as const)[short[0]] : '';
  return era ? {era, birthY: String(Number(m[1])), birthM: String(Number(m[2])), birthD: String(Number(m[3]))} : {};
}

/** 福祉用具の行：見出し（福祉用具名・商品名・品目 と 金額）の下の行。種目・商品名・品番・製造事業者・金額 */
function tokuteiItems(rows: Grid, taxIn: boolean): TokuteiImportItem[] {
  const head = rows.findIndex((r) => r.some((v) => /福祉用具名|^商品名$|品目/.test(compactName(v))) && (r.some((v) => /金額$/.test(compactName(v))) || /金額/.test(r.map(compactName).join(''))));
  if (head < 0) return [];
  const hr = rows[head];
  const colOf = (test: RegExp) => hr.findIndex((v) => test.test(compactName(v)));
  const nameCol = colOf(/福祉用具名|^商品名$|品目/);
  let amountCol = colOf(/金額$/);
  if (amountCol < 0) amountCol = hr.findIndex((v, c) => compactName(v) === '金' && hr.slice(c + 1).some((w) => compactName(w) === '額'));
  let kindCol = colOf(/^種目※?$/);
  if (kindCol < 0) kindCol = hr.findIndex((v, c) => compactName(v) === '種' && hr.slice(c + 1).some((w) => compactName(w) === '目'));
  const makerCol = colOf(/製造事業者/);
  const inRange = (r: string[], from: number, to: number) => r.slice(Math.max(0, from), Math.max(0, to)).map((v) => v.trim());
  const out: TokuteiImportItem[] = [];
  for (let i = head + 1; i < Math.min(rows.length, head + 16); i++) {
    const r = rows[i];
    const first = r.map((v) => compactName(v)).find(Boolean) ?? '';
    if (/合計|理由|上記|^※|消費税/.test(first)) break;
    const amounts = inRange(r, amountCol - 4, amountCol + 5)
      .map(money)
      .filter((n): n is number => n !== null && n > 0);
    const text = inRange(r, nameCol - 3, nameCol + 3).find((v) => v && money(v) === null) ?? '';
    if (!amounts.length || !text) continue;
    let lines = text.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
    let category = tkKind(lines[0] ?? '');
    if (category) lines = lines.slice(1);
    if (!category && kindCol >= 0) {
      const k = inRange(r, kindCol - 4, kindCol + 2).find(Boolean) ?? '';
      const no = Number(k.normalize('NFKC'));
      category = no >= 1 && no <= 9 && /^\d$/.test(k.normalize('NFKC')) ? TK_KINDS[no - 1] : tkKind(k);
    }
    const code = lines.length > 1 && /^[A-Za-z0-9０-９Ａ-Ｚａ-ｚ\-‐－_/]+$/.test(lines[lines.length - 1]) ? lines.pop()! : '';
    const maker = makerCol >= 0 ? (inRange(r, makerCol - 1, makerCol + 3).find((v) => v && money(v) === null) ?? '').split(/\r?\n/)[0].trim() : '';
    out.push({category, name: lines.join(' '), code, maker: COMPANY.test(maker) ? '' : maker, amount: amounts[0], taxIn});
  }
  return out;
}

/** 申請書のあて先（「行橋市長　様」「福岡県介護保険広域連合長」など）から保険者 */
function tokuteiInsurer(text: string): Insurer | '' {
  // あて先で見分ける（福岡市の様式の注意書きに「福岡県又は福岡市・北九州市…の指定」とあるので、市の名前だけでは見分けない）
  if (/北九州市長/.test(text)) return 'kitakyushu';
  if (/福岡市.{0,4}区長|福岡市長/.test(text)) return 'fukuoka';
  if (/広域連合/.test(text)) return 'kouiki';
  if (/行橋市長/.test(text)) return 'yukuhashi';
  if (/苅田町長/.test(text)) return 'kanda';
  if (/みやこ町長/.test(text)) return 'miyako';
  return '';
}

/** 特定福祉用具の申請書を読む（読めなければ null：特定福祉用具の申請書でない・お客様の名前がない） */
function readTokutei(sheets: Sheet[], file: string, hash: string): ReadDoc | null {
  const textOf = (sh: Sheet) => compactName(sh.rows.flat().join(''));
  const main = sheets.find((sh) => TK_SHEET.test(textOf(sh)) && !/様式集|収録様式|説明用/.test(textOf(sh).slice(0, 80)) && isNameLike(nearValue(sh.rows, findLabel(sh.rows, /^(被保険者)?氏名$/), isNameLike)));
  if (!main) return null;
  const rows = main.rows;
  const doc = base(file, hash, 'tokutei');
  doc.name = cleanName(nearValue(rows, findLabel(rows, /^(被保険者)?氏名$/), isNameLike));
  const addressAt = findLabel(rows, /^住所$/);
  doc.address = nearValue(rows, addressAt, isAddress);
  const zip = nearValue(rows, addressAt, (v) => /^〒?[\s　]*\d{3}-?\d{4}$/.test(v.normalize('NFKC').trim()), 1).normalize('NFKC').replace(/[^\d]/g, '');
  const insured = digitsRight(rows, findLabel(rows, /^被保険者番号$/));
  doc.insuredNo = /[1-9]/.test(insured) && insured.length <= 10 ? padInsuredNo(insured) : '';
  doc.insurer = tokuteiInsurer(sheets.map(textOf).join(''));
  const kana = nearValue(rows, findLabel(rows, /^フリガナ$|^ふりがな$/), isKana);
  const phone = nearValue(rows, findLabel(rows, /^電話番号$/), isTel);
  doc.info = filledInfo({kana: kana.normalize('NFKC').replace(/\s+/g, ' ').trim(), zip: zip.length === 7 ? `${zip.slice(0, 3)}-${zip.slice(3)}` : '', phone: phone.trim(), ...birthOf(rows, findLabel(rows, /^生年月日$/))});
  // 福祉用具：申請書の表（消費税込みの金額）。北九州市は概要書（税抜の金額）
  const gaiyo = sheets.find((sh) => sh !== main && /特定福祉用具概要書/.test(compactName(sh.rows.slice(0, 6).flat().join(''))));
  const items = tokuteiItems(rows, true);
  doc.tokutei = items.length ? items : gaiyo ? tokuteiItems(gaiyo.rows, false) : [];
  const sum = doc.tokutei.reduce((n, it) => n + (it.taxIn ? it.amount : Math.floor(it.amount * 1.1)), 0);
  doc.total = sum > 0 ? sum : null;
  return doc;
}

// ---------------------------------------------------------------- 名字でまとめる

/**
 * 名字：すき間のある名前は最初の語（「見本 花子」→「見本」）。すき間のない名前は、ほかの書類・様邸の名字（known）で始まればその名字、
 * なければ最初の2字（「見本花子」→「見本」。3字より短い名前はそのまま）
 */
export function surnameOf(name: string, known: Iterable<string> = []): string {
  const n = cleanName(name);
  const parts = n.split(/[\s　]+/).filter(Boolean);
  if (parts.length > 1) return parts[0];
  let best = '';
  for (const k of known) if (k && n.startsWith(k) && k.length < n.length && k.length > best.length) best = k;
  if (best) return best;
  return n.length >= 3 ? n.slice(0, 2) : n;
}

/** 取り込みの1まとまり（同じ名字の書類）。target＝足す様邸の id（空なら新しく作る）、done＝前に取り込んだ書類（入れない） */
export type ImportGroup = {key: string; surname: string; name: string; docs: ReadDoc[]; done: {doc: ReadDoc; jobId: string}[]; target: string; candidates: string[]; month: string};

const knownSurnames = (names: string[]) =>
  new Set(
    names
      .map((n) => cleanName(n).split(/[\s　]+/).filter(Boolean))
      .filter((p) => p.length > 1)
      .map((p) => p[0]),
  );

/**
 * 読んだ書類を名字でまとめ、足す様邸を決める（ユーザーの指示「名字が同じ人の場合は同一人物とみなし、〇〇様に合算できるようにする」）。
 * まとめた書類の名前がみな同じならその名前、ちがえば名字だけ（「山田様」）。同じ名字の様邸（ゴミ箱を除く）があれば、そこに足す（同じ名前の様邸があればそれ、
 * なければいちばん新しく直した様邸）。名前の読めない書類は1つずつ。前に取り込んだ書類（同じファイル）は done（もう一度は入れない）
 */
export function planImport(docs: ReadDoc[], jobs: Job[], today = todayIso()): ImportGroup[] {
  const live = jobs.filter((j) => !j.trashedAt);
  const known = knownSurnames([...docs.map((d) => d.name), ...live.map((j) => j.customer)]);
  const seen = new Map<string, string>();
  for (const j of live) for (const d of j.imported ?? []) seen.set(d.hash, j.id);
  const groups = new Map<string, ImportGroup>();
  const once = new Set<string>();
  for (const d of docs) {
    if (once.has(d.hash)) continue; // 同じファイルを2つ選んだ
    once.add(d.hash);
    const surname = d.name ? surnameOf(d.name, known) : '';
    const key = surname ? `name:${surname}` : `file:${d.hash}`;
    const g = groups.get(key) ?? {key, surname, name: '', docs: [], done: [], target: '', candidates: [], month: ''};
    const at = seen.get(d.hash);
    if (at) g.done.push({doc: d, jobId: at});
    else g.docs.push(d);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const all = [...g.docs, ...g.done.map((x) => x.doc)];
    const names = [...new Map(all.filter((d) => d.name).map((d) => [compactName(d.name), d.name])).values()];
    const spaced = (n: string) => /[\s　]/.test(n);
    g.name = names.length === 1 ? names[0] : names.length > 1 ? g.surname : '';
    if (names.length === 1) g.name = all.map((d) => d.name).find((n) => compactName(n) === compactName(names[0]) && spaced(n)) ?? names[0];
    const same = g.surname ? live.filter((j) => j.customer.trim() && surnameOf(j.customer, known) === g.surname).sort((a, b) => b.updatedAt - a.updatedAt) : [];
    g.candidates = same.map((j) => j.id);
    const exact = same.find((j) => compactName(cleanName(j.customer)) === compactName(g.name));
    g.target = g.done[0]?.jobId ?? exact?.id ?? same[0]?.id ?? '';
    const dated = [...g.docs.filter((d) => d.kind === 'estimate'), ...g.docs].find((d) => d.date);
    g.month = (dated?.date ?? today).slice(0, 7);
    return g;
  });
}

// ---------------------------------------------------------------- 様邸に入れる

/** 取り込みで作る様邸（工務店の請求書には入れない。入れるときは見積書の上の「請求書に入れる」） */
function blankJob(month: string, now: number): Job {
  return {
    id: uid('j'),
    month,
    customer: '',
    suffix: '様邸',
    staff: '',
    date: '',
    address: '',
    note: '',
    insuredNo: '',
    form: '',
    overhead: null,
    overheadTarget: null,
    shikiri: false,
    places: [],
    createdAt: now,
    updatedAt: now,
  };
}

const samePlace = (a: Place, b: Place) => compactName(a.name) === compactName(b.name) && (a.photo === 0 || b.photo === 0 || a.photo === b.photo);
const hasRows = (p: Place) => p.rows.some((r) => !isBlankRow(r));

/** 空いている項目だけを埋める（入っている項目は変えない） */
function fill<T extends object>(cur: T, add: Partial<T>): T {
  const out = {...cur};
  for (const [k, v] of Object.entries(add) as [keyof T, T[keyof T]][]) {
    const now = out[k];
    const empty = now === undefined || now === null || (typeof now === 'string' && now.trim() === '');
    if (empty && v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) out[k] = v;
  }
  return out;
}

/**
 * 書類を様邸に入れる（base がなければ新しい様邸。name はお客様名＝planImport の名前）。入っている項目は変えず、空いた項目だけ埋める。
 * 見積書の明細（行にした見積書）は箇所ごと足す（同じ名前の行のない箇所＝申請書の箇所があれば、そこに入れる）。2つ目からの見積書は合算（諸経費も足す）。
 * 申請書の箇所は、同じ名前の箇所に寸法・そのほかを入れ、なければ足す。申請書の改修費用は、見積書の行がないときだけ（2つ目の申請書は足す）。
 * 取り込んだ書類は imported に（目印・金額）
 */
export function applyImport(baseJob: Job | null, docs: ReadDoc[], name: string, month: string, s: EstimateSettings, now = Date.now()): Job {
  let job: Job = baseJob ? {...baseJob, places: [...baseJob.places]} : {...blankJob(month, now), customer: name};
  if (!job.customer.trim()) job.customer = name;
  const before = baseJob ? estimateTotals(baseJob, s) : null;
  const hadRows = baseJob ? hasEstimateRows(baseJob) : false;
  let overhead = hadRows && before ? before.all.overhead : 0;
  let overheadTarget = hadRows && before ? before.target.overhead : 0;
  let addedRows = false;
  let costs = 0;
  const order: DocKind[] = ['estimate', 'shinsei', 'riyu', 'tokutei'];
  const sorted = [...docs].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const d of sorted) {
    job = fill(job, {address: d.address, insuredNo: d.insuredNo, insurer: d.insurer || undefined, estDate: d.kind === 'estimate' ? d.date : undefined});
    if (d.rows) {
      for (const p of d.places) {
        const i = job.places.findIndex((q) => !hasRows(q) && samePlace(q, p));
        if (i >= 0) job.places[i] = {...job.places[i], rows: p.rows, kind: p.kind, photo: job.places[i].photo || p.photo};
        else job.places.push(p);
      }
      overhead += d.overhead ?? 0;
      overheadTarget += d.overheadTarget ?? d.overhead ?? 0;
      addedRows = true;
    } else if (d.kind === 'shinsei') {
      for (const p of d.places) {
        const i = job.places.findIndex((q) => samePlace(q, p));
        if (i < 0) job.places.push(p);
        else job.places[i] = fill(job.places[i], {dims: p.dims, shinseiText: p.shinseiText, photo: job.places[i].photo ? undefined : p.photo});
      }
      if (d.total) costs += d.total;
    }
    // 特定福祉用具の申請書の福祉用具：🛁 特定福祉用具申請書のタブで特定福祉用具の案件に入れる（あとから取り込んだ申請書のもの）
    if (d.kind === 'tokutei' && d.tokutei.length) job.tokuteiImport = {items: d.tokutei, key: d.hash};
    const {cost: _cost, ...info} = d.info;
    job.shinsei = fill({...NO_SHINSEI, ...job.shinsei}, info);
    if (d.riyu) {
      const cur = job.riyu ?? NO_RIYU;
      const acts = {...cur.acts};
      for (const [k, v] of Object.entries(d.riyu.acts ?? {})) {
        const key = k as keyof RiyuInfo['acts'];
        acts[key] = fill(acts[key], {trouble: v.trouble, policy: v.policy});
      }
      const {acts: _acts, ...rest} = d.riyu;
      job.riyu = {...fill(cur, rest), acts};
    }
  }
  if (addedRows) {
    // 諸経費：取り込んだ見積書の諸経費の合計（前からの行の諸経費も足す）。自動の諸経費（端数調整）と同じなら手で入れたことにしない
    const t = estimateTotals({...job, overhead: null, overheadTarget: null}, s);
    job.overhead = overhead === overheadAuto(t.all.subtotal, s) ? null : overhead;
    job.overheadTarget = t.excluded === 0 || overheadTarget === overheadAuto(t.target.subtotal, s) ? null : overheadTarget;
  }
  if (costs > 0 && !hasEstimateRows(job)) job.shinsei = {...NO_SHINSEI, ...job.shinsei, cost: (job.shinsei?.cost ?? 0) + costs};
  if (!job.insurer) job.insurer = jobInsurer({insurer: '', form: '', address: job.address}) || '';
  job.imported = [...(job.imported ?? []), ...sorted.map((d): ImportedDoc => ({kind: d.kind, file: d.file, hash: d.hash, total: d.kind === 'estimate' || d.kind === 'shinsei' || d.kind === 'tokutei' ? d.total : null, tax: d.kind === 'estimate' ? d.tax : null, rows: d.rows, at: now}))];
  job.updatedAt = now;
  return job;
}

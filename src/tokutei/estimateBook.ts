// 販売見積書：いただいた会社の見積書の原本（TSS の Excel。src/tokutei/print/mitsumori.xltx）に案件を書き込む
// （ユーザーの指示「見積書の原本はこのような形にする。プレビューを見ながら入力できるようにする」2026-10-23）。
// 書く欄：宛名（A6）・見積番号（I4）・見積日（I5）・営業所（H9。所長・〒・住所・TEL は原本の式＝マスタのシートから）・件名（B14）・
// 明細（23〜42行：品名 A・数量 F・単位 G・単価（税抜）H・金額 I＝式・税率 J）・備考（60〜62行：介護保険の内訳と見積書の備考に足す文）。
// 合計・税率ごとの内訳・消費税は原本の式のまま（開いたときに Excel が計算する）。画面のプレビュー・スマホのために、式の答えも同じ計算で入れておく。
// 原本は所長の印影の画像だけ消した（アプリは誰でも開けるページなので。印の枠は残す）

import {strFromU8, strToU8} from 'fflate';
import {saleTotals} from './calc.ts';
import type {Totals} from './calc.ts';
import {OFFICES} from './defaults.ts';
import {customerLabel} from './sales.ts';
import {sheetPreview} from './shinseiPreview.ts';
import type {PvPage} from './shinseiPreview.ts';
import type {Sale, Settings, TaxType} from './types.ts';
import {yen} from './util.ts';
import {excelDate} from './shinsei.ts';
import {cellRe, dropCalcChain, esc, finishWorkbook, setCell, setStyle, sheetPath} from './xlsxEdit.ts';
import type {CellValue, Files} from './xlsxEdit.ts';

export const ESTIMATE_SHEET = '見積書';
/** 明細の行（原本は20行） */
export const ESTIMATE_ROWS = Array.from({length: 20}, (_, i) => 23 + i);
/** 備考の行（59行目の「備　　考」の下の3行。A〜J を1つにした欄） */
const NOTE_ROWS = [60, 61, 62];
/** 件名（原本は空欄） */
export const ESTIMATE_SUBJECT = '特定福祉用具の購入';

/** 見積書のプレビューで押すと案件の画面のその入れる所へ行く欄 */
export type EstimateField = 'customer' | 'quoteNo' | 'estimateDate' | 'items' | 'note';
export const ESTIMATE_LABEL: Record<EstimateField, string> = {
  customer: 'お客様名',
  quoteNo: '見積番号',
  estimateDate: '見積日',
  items: '商品',
  note: '見積書の備考に足す文',
};
/** 押せる欄（明細は入っている行と、次に入る1行） */
const links = (items: number): [EstimateField, string[]][] => [
  ['customer', ['A6']],
  ['quoteNo', ['I4']],
  ['estimateDate', ['I5']],
  ['items', ESTIMATE_ROWS.slice(0, items + 1).flatMap((r) => ['A', 'F', 'G', 'H', 'I', 'J'].map((c) => `${c}${r}`))],
  ['note', NOTE_ROWS.map((r) => `A${r}`)],
];

/** 税率の欄の値（原本の下の合計の欄が、この値で税率ごとに分ける。A53〜A57 と同じ値） */
const RATE: Record<TaxType, CellValue> = {'10%': 0.1, '8%': '軽減税率8%', 非課税: '非課税'};

/** 備考の行：介護保険の内訳（見積書の金額から）と、見積書の備考に足す文（原本の3行まで） */
export const estimateNotes = (sale: Sale, t: Totals): string[] => noteLines(sale, t).slice(0, NOTE_ROWS.length);

function noteLines(sale: Sale, t: Totals): string[] {
  const out: string[] = [];
  if (t.covered > 0) {
    const parts = [`介護保険（${sale.payMethod}）：介護保険の対象 ${yen(t.covered)}円`, `利用者負担（${t.ratio}割）${yen(t.userBurden)}円`];
    if (t.aid > 0) parts.push(`介護扶助（${t.ratio}割）${yen(t.aid)}円`);
    parts.push(`保険者負担（${10 - t.ratio}割）${yen(t.insurerBurden)}円`);
    if (t.excess > 0) parts.push(`限度額を超えた分 ${yen(t.excess)}円`);
    out.push(parts.join('　'));
    out.push(sale.payMethod === '償還払い' ? `いったんお支払いいただく金額 ${yen(t.total)}円（あとで保険者から ${yen(t.insurerBurden)}円が払い戻されます）` : `お支払いいただく金額 ${yen(t.userPay)}円`);
  }
  for (const line of sale.note.split(/\r?\n/)) if (line.trim()) out.push(line.trim());
  return out;
}

/** 式の欄の保存しておく答え（式はそのまま。答えの文字は t="str"） */
function setCached(xml: string, ref: string, value: CellValue): string {
  const m = cellRe(ref).exec(xml);
  if (!m || !/<f\b/.test(m[2] ?? '')) return xml;
  const f = /<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/.exec(m[2] ?? '')?.[0] ?? '';
  const attrs = m[1].replace(/\st="[^"]*"/, '');
  const cell = typeof value === 'number' ? `<c r="${ref}"${attrs}>${f}<v>${value}</v></c>` : `<c r="${ref}"${attrs} t="str">${f}<v>${esc(value)}</v></c>`;
  return xml.slice(0, m.index) + cell + xml.slice(m.index + m[0].length);
}

/** 式の欄にする（原本で式のない明細の行の金額の欄。書式は今の欄のまま、なければ style） */
function setFormula(xml: string, ref: string, formula: string, value: CellValue, style: string | undefined): string {
  if (!cellRe(ref).test(xml)) xml = setCell(xml, ref, '', style);
  const m = cellRe(ref).exec(xml)!;
  const s = /\ss="\d+"/.exec(m[1])?.[0] ?? (style !== undefined ? ` s="${style}"` : '');
  const v = typeof value === 'number' ? `<v>${value}</v>` : `<v>${esc(value)}</v>`;
  const cell = `<c r="${ref}"${s}${typeof value === 'number' ? '' : ' t="str"'}><f>${esc(formula)}</f>${v}</c>`;
  return xml.slice(0, m.index) + cell + xml.slice(m.index + m[0].length);
}

/** 原本（開いたもの）の写しに案件を書く。書いたブック（files をそのまま書きかえる） */
export function fillEstimateFiles(files: Files, sale: Sale, s: Settings): void {
  const t = saleTotals(sale, s);
  const path = sheetPath(files, ESTIMATE_SHEET);
  let xml = strFromU8(files[path]);
  const put = (ref: string, v: CellValue) => {
    xml = setCell(xml, ref, v);
  };
  put('A6', `${customerLabel(sale).replace(/\s*様$/, '')}　様`);
  put('I4', `№　${sale.quoteNo.trim()}`);
  const serial = excelDate(sale.estimateDate);
  if (serial) put('I5', serial);
  const office = OFFICES.find((o) => o.name === s.officeName.trim());
  if (s.officeName.trim()) put('H9', s.officeName.trim());
  if (s.company.trim()) put('H8', s.company.trim());
  put('B14', ESTIMATE_SUBJECT);
  // 明細の品名の欄の書式は、どの行も1行目と同じにする（原本は2行目が10pt・3行目が赤の太字14pt＝書いた例の名残り。いちばん下の行は下の罫線がちがうのでそのまま）
  for (const c of ['A', 'B', 'C', 'D', 'E']) {
    const st = /\ss="(\d+)"/.exec(cellRe(`${c}${ESTIMATE_ROWS[0]}`).exec(xml)?.[1] ?? '')?.[1];
    if (st) for (const r of ESTIMATE_ROWS.slice(1, -1)) xml = setStyle(xml, `${c}${r}`, st);
  }
  // 明細：前から20行まで（金額は 数量×単価 の式。原本で式のない行にも同じ式を入れる。単価のない品目（手で入れて値段がまだ）は単価を空に）
  const amountStyle = /\ss="(\d+)"/.exec(cellRe('I26').exec(xml)?.[1] ?? '')?.[1];
  const sums: Record<string, number> = {};
  t.lines.slice(0, ESTIMATE_ROWS.length).forEach((l, k) => {
    const r = ESTIMATE_ROWS[k];
    const i = l.item;
    put(`A${r}`, [i.name.trim(), i.code.trim()].filter(Boolean).join('　'));
    put(`F${r}`, Math.round(i.qty * 100) / 100);
    put(`G${r}`, i.unit || '個');
    put(`H${r}`, l.unitPrice || '');
    put(`J${r}`, RATE[i.taxType]);
    const amount = l.amount;
    xml = setFormula(xml, `I${r}`, `IF(F${r}*H${r},F${r}*H${r},"")`, amount || '', amountStyle);
    const key = String(RATE[i.taxType]);
    sums[key] = (sums[key] ?? 0) + amount;
  });
  // 備考
  const notes = estimateNotes(sale, t);
  NOTE_ROWS.forEach((r, k) => put(`A${r}`, notes[k] ?? ''));
  // 式の答え（原本の式と同じ計算：税率ごとの合計・切り捨ての消費税・御見積合計。営業所の欄はマスタのシートの値）
  const c47 = sums['0.1'] ?? 0;
  const c48 = 0; // 8%（軽減でない）の商品はこのアプリにない
  const c49 = sums['軽減税率8%'] ?? 0;
  const c50 = sums['非課税'] ?? 0;
  const e47 = Math.floor(c47 * 0.1);
  const e48 = Math.floor(c48 * 0.08);
  const e49 = Math.floor(c49 * 0.08);
  const c46 = c47 + c48 + c49 + c50;
  const e46 = e47 + e48 + e49;
  for (const [ref, v] of [
    ['C47', c47],
    ['C48', c48],
    ['C49', c49],
    ['C50', c50],
    ['C51', 0],
    ['E47', e47],
    ['E48', e48],
    ['E49', e49],
    ['C46', c46],
    ['E46', e46],
    ['E21', c46 + e46],
  ] as [string, number][])
    xml = setCached(xml, ref, v);
  if (office) {
    xml = setCached(xml, 'I9', `所長　${office.manager.replace(/\s+/, '　')}`);
    xml = setCached(xml, 'H11', `〒${office.postal}`);
    xml = setCached(xml, 'H12', office.address);
    xml = setCached(xml, 'H13', `TEL：${office.tel}　FAX：${office.fax}`);
  }
  files[path] = strToU8(xml);
  dropCalcChain(files);
}

/** 販売見積書の Excel（.xlsx のバイト列） */
export function fillEstimate(template: Files, sale: Sale, s: Settings): Uint8Array {
  const files: Files = {...template};
  fillEstimateFiles(files, sale, s);
  return finishWorkbook(files);
}

/** 販売見積書のプレビュー（1枚）。原本はそのまま（{...template} に書く）なので、打つたびに呼んでよい */
export function estimatePreview(template: Files, sale: Sale, s: Settings): PvPage<EstimateField>[] {
  const files: Files = {...template};
  fillEstimateFiles(files, sale, s);
  const page = sheetPreview(files, template, ESTIMATE_SHEET, links(sale.items.length));
  return page ? [page] : [];
}

/** 保存する名前：印刷の PDF と同じ「御見積書_山田 花子様.xlsx」（お客様名がなければ「御見積書_（お客様名未入力）.xlsx」） */
export function estimateFileName(sale: Sale): string {
  return `御見積書_${customerLabel(sale).replace(/\s+様$/, '様')}.xlsx`.replace(/[\\/:*?"<>|\r\n]/g, '_');
}

/** 明細の行より多い商品（見積書に入らない） */
export const estimateOverflow = (sale: Sale) => Math.max(0, sale.items.length - ESTIMATE_ROWS.length);

/** 備考の3行に入らない行の数（介護保険の内訳で2行使う） */
export const estimateNoteOverflow = (sale: Sale, s: Settings) => Math.max(0, noteLines(sale, saleTotals(sale, s)).length - NOTE_ROWS.length);

// 販売見積書：いただいた会社の見積書の原本（TSS の Excel。src/tokutei/print/mitsumori.xltx）に案件を書き込む
// （ユーザーの指示「見積書の原本はこのような形にする。プレビューを見ながら入力できるようにする」2026-10-23）。
// 書く欄：宛名（A6）・見積番号（I4）・見積日（I5）・会社の欄（I8〜I16。所長印・担当印の枠の上：会社名／営業所　所長／〒／住所／TEL／FAX／登録番号／担当。設定の営業所から）・件名（B14）・
// 明細（23〜38行：品名 A・数量 F・単位 G・単価（税抜）H・金額 I＝式・税率 J・備考 K＝算出根拠）・備考（60〜62行：介護保険の内訳と見積書の備考に足す文）。
// 原本は 2026-10-25 にユーザーの指示で直した（灰色→薄い水色・会社の欄を左寄せ・TEL と FAX を別の行に・担当・明細を16行に・税率の右に備考の列。
// docs/tokutei/edit-mitsumori-template.py）。
// 合計・税率ごとの内訳・消費税は原本の式のまま（開いたときに Excel が計算する）。画面のプレビュー・スマホのために、式の答えも同じ計算で入れておく。
// 原本は所長の印影の画像だけ消した（アプリは誰でも開けるページなので。印の枠は残す）
// 明細が20行に入らないときは3ページまで（ユーザーの指示「ページは3ページまでいけるようにする」2026-10-25）：原本の1ページ目（1〜62行）の下に、
// 2・3ページ目（明細のつづき）を足す。題名・見積番号・見積日・宛名（1〜7行目の写し）・明細の見出し（22行目の写し）と明細の行（CONT_ROWS 行）。
// 合計・消費税・備考は1ページ目のまま（式は2・3ページ目の明細も足す）。改ページは手動、印刷の大きさは1ページ目が1枚に入る倍率（原本は「1ページに収める」）。

import {strFromU8, strToU8} from 'fflate';
import {itemNote, saleTotals} from './calc.ts';
import type {Totals} from './calc.ts';
import {OFFICES} from './defaults.ts';
import {customerLabel} from './sales.ts';
import {sheetPreviewPages} from './shinseiPreview.ts';
import type {PvPage, Range} from './shinseiPreview.ts';
import type {Sale, Settings, TaxType} from './types.ts';
import {yen} from './util.ts';
import {excelDate} from './shinsei.ts';
import {attrOf, cellRe, dropCalcChain, esc, finishWorkbook, numOf, setCell, setStyle, sheetLayout, sheetPath} from './xlsxEdit.ts';
import type {CellValue, Files} from './xlsxEdit.ts';

export const ESTIMATE_SHEET = '見積書';
/** 1ページ目の明細の行（原本は20行。ユーザーの指示「見積もりの行数は4行ぐらい減らしていい」で16行に。39〜42行は原本で隠してある） */
export const ESTIMATE_ROWS = Array.from({length: 16}, (_, i) => 23 + i);
/** 原本の明細の行（隠した行も。金額の欄の式を書く） */
const TEMPLATE_ITEM_ROWS = Array.from({length: 20}, (_, i) => 23 + i);
/** 列の数（A〜K。K は備考＝算出根拠） */
const LAST_COL = 11;
/** 1ページ目の終わり（原本の印刷の範囲 A1:J62） */
const PAGE1_LAST = 62;
/** 2・3ページ目に写す、1ページ目の頭の行（題名・見積番号・見積日・宛名）と明細の見出しの行 */
const HEAD_ROWS = [1, 2, 3, 4, 5, 6, 7];
const ITEM_HEAD_ROW = 22;
/** 2・3ページ目の明細の行の数（1ページ目と同じ高さに入るだけ：(1〜62行（隠した53〜57行は入れない） − 頭の7行 − 見出し) ÷ 明細の1行。テストで原本から確かめる） */
export const CONT_ROWS = 42;
export const MAX_PAGES = 3;
/** 見積書に入る商品の数（1ページ目 16＋つづき CONT_ROWS×2） */
export const ESTIMATE_CAPACITY = ESTIMATE_ROWS.length + CONT_ROWS * (MAX_PAGES - 1);

/** n ページ目（2・3）の行：上の行・見出しの行・明細の行 */
export function contBlock(page: number): {top: number; head: number; rows: number[]} {
  const top = PAGE1_LAST + 1 + (page - 2) * (HEAD_ROWS.length + 1 + CONT_ROWS);
  const head = top + HEAD_ROWS.length;
  return {top, head, rows: Array.from({length: CONT_ROWS}, (_, i) => head + 1 + i)};
}
/** 商品の数で何ページか（1〜3） */
export const estimatePages = (items: number) => (items <= ESTIMATE_ROWS.length ? 1 : Math.min(MAX_PAGES, 1 + Math.ceil((items - ESTIMATE_ROWS.length) / CONT_ROWS)));
/** 商品の行（前から：1ページ目の16行 → 2ページ目 → 3ページ目） */
export function itemRows(pages: number): number[] {
  const rows = [...ESTIMATE_ROWS];
  for (let p = 2; p <= pages; p++) rows.push(...contBlock(p).rows);
  return rows;
}
/**
 * 自己負担額の行の文（ユーザーの指示「自己負担額を表示のオンオフっていうチェック項目を入れ、オンにした場合は…商品の列の最後の2行下ぐらいに、自己負担額〇〇円みたいな形で表示する。
 * …1割負担、2割負担だと…自動的に、自己負担額を記入するようにする」2026-10-26）。お客様のお支払い（利用者負担＋限度額を超えた分。生活保護なら負担割合の分は介護扶助）。出さないときは ''
 */
export function selfPayText(sale: Sale, t: Pick<Totals, 'ratio' | 'userPay'>): string {
  if (!sale.showSelfPay || sale.items.length === 0) return '';
  return `自己負担額（${sale.welfare ? '生活保護' : `${t.ratio}割負担`}）　${yen(t.userPay)}円`;
}
/** 明細の何番目（0始まり）に自己負担額を書くか：最後の商品の2行下（1行あける）。そのページに入らなければすぐ下、それも入らなければ次のページの1行目。出さない・入らないときは -1 */
export function selfPayIndex(items: number, show: boolean): number {
  if (!show || items === 0) return -1;
  const pageOf = (i: number) => (i < ESTIMATE_ROWS.length ? 1 : 2 + Math.floor((i - ESTIMATE_ROWS.length) / CONT_ROWS));
  if (items + 1 < ESTIMATE_CAPACITY && pageOf(items + 1) === pageOf(items - 1)) return items + 1;
  return items < ESTIMATE_CAPACITY ? items : -1;
}
/** 明細の行を何行使うか（商品と自己負担額の行。ページの数を決める） */
const usedRows = (sale: Sale) => Math.max(sale.items.length, selfPayIndex(sale.items.length, !!sale.showSelfPay) + 1);
/** 備考の行（59行目の「備　　考」の下の3行。A〜K を1つにした欄） */
const NOTE_ROWS = [60, 61, 62];
/** 件名（原本は空欄） */
export const ESTIMATE_SUBJECT = '特定福祉用具の購入';

/** 見積書のプレビューで押すと案件の画面のその入れる所へ行く欄 */
export type EstimateField = 'customer' | 'quoteNo' | 'estimateDate' | 'staff' | 'items' | 'selfPay' | 'note';
export const ESTIMATE_LABEL: Record<EstimateField, string> = {
  customer: 'お客様名',
  quoteNo: '見積番号',
  estimateDate: '見積日',
  staff: '担当',
  items: '商品',
  selfPay: '自己負担額',
  note: '見積書の備考に足す文',
};
/** 押せる欄（明細は入っている行と、次に入る1行。自己負担額の行） */
const links = (sale: Sale): [EstimateField, string[]][] => {
  const items = sale.items.length;
  const pages = estimatePages(Math.max(items + 1, usedRows(sale)));
  const self = selfPayIndex(items, !!sale.showSelfPay);
  const tops = [1, ...Array.from({length: pages - 1}, (_, i) => contBlock(i + 2).top)];
  return [
    ['customer', tops.map((t) => `A${t + 5}`)],
    ['quoteNo', tops.map((t) => `I${t + 3}`)],
    ['estimateDate', tops.map((t) => `I${t + 4}`)],
    ['staff', ['I16']],
    ['items', itemRows(pages).slice(0, items + 1).flatMap((r) => ['A', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => `${c}${r}`))],
    ['selfPay', self >= 0 ? [`A${itemRows(pages)[self]}`] : []],
    ['note', NOTE_ROWS.map((r) => `A${r}`)],
  ];
};

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
  const tpl = xml; // 書く前の原本のシート（2・3ページ目の行の書式の元）
  const put = (ref: string, v: CellValue) => {
    xml = setCell(xml, ref, v);
  };
  // 宛名は左に詰めず、全角のすき間1つあける（ユーザーの指示「名前の部分は左に詰めるのではなく、スペース一つ分あける」2026-10-26）
  put('A6', `　${customerLabel(sale).replace(/\s*様$/, '')}　様`);
  put('I4', `№　${sale.quoteNo.trim()}`);
  const serial = excelDate(sale.estimateDate);
  if (serial) put('I5', serial);
  // 会社の欄（ユーザーの指示「会社名や社長名などの部分は、左寄せを統一」「会社住所の下に、電話番号とFAX番号」「担当名をいれる」、
  // 「社名の部分が全体的に小さい。そして、社名は所長印、担当の上にもってくる」2026-10-26。原本の I〜K の結合。長いときは縮めて入れる）。
  // 設定の営業所の値（設定で営業所を選ぶと入る。defaults.ts の OFFICES）。空の欄は原本の値（行橋営業所）のまま
  const office = OFFICES.find((o) => o.name === s.officeName.trim());
  const of = (v: string, d: string | undefined) => v.trim() || d || '';
  if (s.company.trim()) put('I8', s.company.trim());
  const officeName = s.officeName.trim();
  const manager = of(s.manager, office?.manager).replace(/\s+/, '　');
  if (officeName) put('I9', [officeName, manager && `所長　${manager}`].filter(Boolean).join('　'));
  const postal = of(s.postal, office?.postal);
  if (postal) put('I11', `〒${postal}`);
  const address = of(s.address, office?.address);
  if (address) put('I12', address);
  const tel = of(s.tel, office?.tel);
  if (tel) put('I13', `TEL：${tel}`);
  const fax = of(s.fax, office?.fax);
  if (fax) put('I14', `FAX：${fax}`);
  if (s.regNo.trim()) put('I15', `登録番号：${s.regNo.trim()}`);
  put('I16', sale.staff.trim() ? `担当：${sale.staff.trim()}` : '');
  put('B14', ESTIMATE_SUBJECT);
  // 明細の品名の欄の書式は、どの行も1行目と同じにする（原本は2行目が10pt・3行目が赤の太字14pt＝書いた例の名残り。いちばん下の行は下の罫線がちがうのでそのまま）
  for (const c of ['A', 'B', 'C', 'D', 'E']) {
    const st = /\ss="(\d+)"/.exec(cellRe(`${c}${ESTIMATE_ROWS[0]}`).exec(xml)?.[1] ?? '')?.[1];
    if (st) for (const r of ESTIMATE_ROWS.slice(1, -1)) xml = setStyle(xml, `${c}${r}`, st);
  }
  // 2・3ページ目（明細のつづき）を足す（1ページ目の頭の行は、宛名・番号・日付を書いたあとの写し）
  const pages = estimatePages(usedRows(sale));
  if (pages > 1) xml = addContinuation(xml, tpl, pages);
  const rows = itemRows(pages);
  // 明細の金額の欄は、どの行もふつうの式にする（前の原本の26〜42行は「共有の式」で、親の26行目を書きかえると下の行の式がこわれた。隠した行も）
  const amountStyle = /\ss="(\d+)"/.exec(cellRe('I26').exec(xml)?.[1] ?? '')?.[1];
  for (const r of new Set([...TEMPLATE_ITEM_ROWS, ...rows])) xml = setFormula(xml, `I${r}`, `IF(F${r}*H${r},F${r}*H${r},"")`, '', amountStyle);
  // 明細：前から3ページまで（金額は 数量×単価 の式。単価のない品目（手で入れて値段がまだ）は単価を空に）
  const sums: Record<string, number> = {};
  t.lines.slice(0, rows.length).forEach((l, k) => {
    const r = rows[k];
    const i = l.item;
    put(`A${r}`, [i.name.trim(), i.code.trim()].filter(Boolean).join('　'));
    put(`F${r}`, Math.round(i.qty * 100) / 100);
    put(`G${r}`, i.unit || '個');
    put(`H${r}`, l.unitPrice || '');
    put(`J${r}`, RATE[i.taxType]);
    put(`K${r}`, itemNote(l));
    const amount = l.amount;
    xml = setFormula(xml, `I${r}`, `IF(F${r}*H${r},F${r}*H${r},"")`, amount || '', amountStyle);
    const key = String(RATE[i.taxType]);
    sums[key] = (sums[key] ?? 0) + amount;
  });
  // 自己負担額（明細の最後の商品の2行下。品名の欄に文で。金額の欄・税率は空なので合計には入らない）
  const self = selfPayIndex(t.lines.length, !!sale.showSelfPay);
  if (self >= 0) put(`A${rows[self]}`, selfPayText(sale, t));
  // 備考
  const notes = estimateNotes(sale, t);
  NOTE_ROWS.forEach((r, k) => put(`A${r}`, notes[k] ?? ''));
  // 2・3ページ目の明細も足す（税率ごとの合計の式）
  if (pages > 1) {
    for (const ref of ['C47', 'C48', 'C49', 'C50', 'C51']) {
      const m = cellRe(ref).exec(xml);
      const f = /<f>([^<]*)<\/f>/.exec(m?.[2] ?? '')?.[1];
      if (!m || !f) continue;
      const crit = /SUMIF\(\$J\$23:\$J\$42,([A-Z]+\d+),/.exec(f)?.[1];
      if (!crit) continue;
      const more = Array.from({length: pages - 1}, (_, i) => contBlock(i + 2).rows).map((rs) => `+SUMIF($J$${rs[0]}:$J$${rs.at(-1)},${crit},$I$${rs[0]}:$I$${rs.at(-1)})`);
      xml = xml.slice(0, m.index) + m[0].replace(`<f>${f}</f>`, `<f>${f}${esc(more.join(''))}</f>`) + xml.slice(m.index + m[0].length);
    }
  }
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
  files[path] = strToU8(xml);
  if (pages > 1) setPrintArea(files, pages);
  dropCalcChain(files);
}

/** 行の XML（自分で閉じている行も） */
const rowRe = (r: number) => new RegExp(`<row r="${r}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</row>)`);

/** 行を写す（行の番号と、欄の番地の行の番号を替える） */
function copyRow(rowXml: string, from: number, to: number): string {
  return rowXml.replace(new RegExp(`(<row r=")${from}(")`), `$1${to}$2`).replace(new RegExp(`(<c r="[A-Z]+)${from}(")`, 'g'), `$1${to}$2`);
}

/** 原本の明細の1行（値・式なし。書式だけ）。品名の欄は1行目の書式、いちばん下の行は原本の42行目の書式（下の太い罫線） */
function blankItemRow(template: string, r: number, last: boolean): string {
  const src = last ? 42 : 24;
  const row = rowRe(src).exec(template)?.[0] ?? '';
  const head = /^<row\b[^>]*>/.exec(row)?.[0] ?? `<row r="${src}">`;
  const style = (c: string, rr: number) => /\ss="(\d+)"/.exec(cellRe(`${c}${rr}`).exec(template)?.[1] ?? '')?.[1];
  const cells = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => {
    // 品名の欄（A〜E）はいちばん下の行のほかは 23行目の書式、金額の欄（I）は 26行目（式のある行）の書式
    const s = style(c, !last && 'ABCDE'.includes(c) ? 23 : c === 'I' && !last ? 26 : src);
    return `<c r="${c}${r}"${s !== undefined ? ` s="${s}"` : ''}/>`;
  });
  return `${head.replace(new RegExp(`r="${src}"`), `r="${r}"`)}${cells.join('')}</row>`;
}

/** 2・3ページ目（明細のつづき）を足す：頭の行（1〜7行目の写し）・見出し（22行目の写し）・明細の行。結合・入力の規則・改ページ・印刷の倍率も */
function addContinuation(xml: string, tpl: string, pages: number): string {
  // 原本の63行目より下（空の行）は消す
  xml = xml.replace(/<row r="(\d+)"(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r: string) => (Number(r) > PAGE1_LAST ? '' : m));
  const merges: string[] = [];
  const valid: string[] = [];
  let add = '';
  for (let p = 2; p <= pages; p++) {
    const {top, head, rows} = contBlock(p);
    for (const [k, r] of HEAD_ROWS.entries()) {
      const row = rowRe(r).exec(xml)?.[0];
      if (row) add += copyRow(row, r, top + k);
    }
    add += copyRow(rowRe(ITEM_HEAD_ROW).exec(tpl)?.[0] ?? '', ITEM_HEAD_ROW, head);
    rows.forEach((r, i) => (add += blankItemRow(tpl, r, i === rows.length - 1)));
    merges.push(`D${top}:I${top + 1}`, `I${top + 3}:K${top + 3}`, `I${top + 4}:K${top + 4}`, `A${top + 5}:E${top + 6}`, `A${head}:E${head}`, ...rows.map((r) => `A${r}:E${r}`));
    valid.push(`J${rows[0]}:J${rows.at(-1)}`);
  }
  xml = xml.replace('</sheetData>', `${add}</sheetData>`);
  // ページの番号（1ページ目の左上と、つづきの左上）
  xml = setCell(xml, 'A4', `1／${pages}`);
  for (let p = 2; p <= pages; p++) xml = setCell(xml, `A${contBlock(p).top + 3}`, `${p}／${pages}（明細のつづき）`);
  // 結合・入力の規則（税率の一覧）・使っている範囲
  const all = [...xml.matchAll(/<mergeCell ref="[^"]+"\/>/g)].length + merges.length;
  xml = xml.replace(/<mergeCells count="\d+">/, `<mergeCells count="${all}">`).replace('</mergeCells>', `${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
  xml = xml.replace(/(<dataValidation\b[^>]*\ssqref=")J23:J42"/, `$1J23:J42 ${valid.join(' ')}"`);
  const last = contBlock(pages).rows.at(-1)!;
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:K${last}"/>`);
  // 印刷：手動の改ページ（1ページに収めるをやめる。Excel は「1ページに収める」だと手動の改ページを使わない）・1ページ目が1枚に入る倍率
  const breaks = Array.from({length: pages - 1}, (_, i) => (i === 0 ? PAGE1_LAST : contBlock(i + 1).rows.at(-1)!)); // 1ページ目・2ページ目の終わり
  xml = xml.replace(/<pageSetUpPr fitToPage="1"\/>/, '<pageSetUpPr fitToPage="0"/>');
  xml = xml.replace(/(<pageSetup\b[^>]*\sscale=")\d+"/, `$1${fitScale(tpl)}"`);
  xml = xml.replace(/(<pageSetup\b[^>]*\/>)/, `$1<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks.map((b) => `<brk id="${b}" max="16383" man="1"/>`).join('')}</rowBreaks>`);
  return xml;
}

/** 原本の1ページ目（1〜62行・A〜K列）が A4 縦の余白の内側に入る倍率（%。原本の「1ページに収める」と同じ大きさ） */
export function fitScale(tpl: string): number {
  const lay = sheetLayout(tpl);
  const m = /<pageMargins\b[^>]*>/.exec(tpl)?.[0] ?? '';
  const inch = (name: string, d: number) => numOf(attrOf(m, name), d) * 96;
  const pageW = (210 / 25.4) * 96 - inch('left', 0.7) - inch('right', 0.7);
  const pageH = (297 / 25.4) * 96 - inch('top', 0.75) - inch('bottom', 0.75);
  let w = 0;
  for (let c = 1; c <= LAST_COL; c++) w += lay.colW(c);
  let h = 0;
  for (let r = 1; r <= PAGE1_LAST; r++) h += lay.rowH(r);
  return Math.floor(Math.min(pageW / w, pageH / h) * 100);
}

/** 印刷の範囲を3ページ目の下まで */
function setPrintArea(files: Files, pages: number) {
  const last = contBlock(pages).rows.at(-1)!;
  const wb = strFromU8(files['xl/workbook.xml']);
  files['xl/workbook.xml'] = strToU8(wb.replace(/(<definedName name="_xlnm\.Print_Area"[^>]*>[^<!]*!\$A\$1:\$K\$)\d+/, `$1${last}`));
}

/** 販売見積書の Excel（.xlsx のバイト列） */
export function fillEstimate(template: Files, sale: Sale, s: Settings): Uint8Array {
  const files: Files = {...template};
  fillEstimateFiles(files, sale, s);
  return finishWorkbook(files);
}

/** 販売見積書のプレビュー（1〜3枚）。原本はそのまま（{...template} に書く）なので、打つたびに呼んでよい */
export function estimatePreview(template: Files, sale: Sale, s: Settings): PvPage<EstimateField>[] {
  const files: Files = {...template};
  fillEstimateFiles(files, sale, s);
  const pages = estimatePages(usedRows(sale));
  const ranges: (Range | null)[] = [pages > 1 ? [1, 1, LAST_COL, PAGE1_LAST] : null];
  for (let p = 2; p <= pages; p++) ranges.push([1, contBlock(p).top, LAST_COL, contBlock(p).rows.at(-1)!]);
  return sheetPreviewPages(files, template, ESTIMATE_SHEET, links(sale), ranges);
}

/**
 * 保存する名前（ユーザーの指示「保存のときの名前は、木村 米子様 販売見積書 とする」2026-10-26。前は「御見積書_木村　米子様」）：「山田 花子様 販売見積書」。
 * 名前の中のすき間（全角・半角）は半角1つに。お客様名がなければ「販売見積書」。Excel は .xlsx を付け、印刷の PDF（PrintView の題名）も同じ名前
 */
export function estimateBaseName(sale: Pick<Sale, 'customer'>): string {
  const name = sale.customer.replace(/\s+/g, ' ').trim().replace(/\s*様$/, '').replace(/[\\/:*?"<>|]/g, '_');
  return name ? `${name}様 販売見積書` : '販売見積書';
}
export const estimateFileName = (sale: Pick<Sale, 'customer'>): string => `${estimateBaseName(sale)}.xlsx`;

/** 3ページの明細の行より多い商品（見積書に入らない） */
export const estimateOverflow = (sale: Sale) => Math.max(0, sale.items.length - ESTIMATE_CAPACITY);

/** 備考の3行に入らない行の数（介護保険の内訳で2行使う） */
export const estimateNoteOverflow = (sale: Sale, s: Settings) => Math.max(0, noteLines(sale, saleTotals(sale, s)).length - NOTE_ROWS.length);

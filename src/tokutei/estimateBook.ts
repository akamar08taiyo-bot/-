// 販売見積書：いただいた会社の見積書の原本（TSS の Excel。src/tokutei/print/mitsumori.xltx）に案件を書き込む
// （ユーザーの指示「見積書の原本はこのような形にする。プレビューを見ながら入力できるようにする」2026-10-23）。
// 書く欄：宛名（A6）・見積番号（I4）・見積日（I5）・会社の欄（I8〜I16。所長印・担当印の枠の上：会社名／営業所　所長／〒／住所／TEL／FAX／登録番号／担当。設定の営業所から）・件名（B14）・
// 明細（23〜42行：品名 A・数量 F・単位 G・単価（税抜）H・金額 I＝式・税率 J・備考 K＝算出根拠）・備考（御見積合計の右の H47〜H51：見積書の備考に足す文）。
// 原本は 2026-10-25 にユーザーの指示で直した（灰色→薄い水色・会社の欄を左寄せ・TEL と FAX を別の行に・担当・明細を16行に・税率の右に備考の列。
// docs/tokutei/edit-mitsumori-template.py）。2026-11-03 にユーザーの指示「消費税については、この部分では不要の為、代わりに備考欄にする（行数を増やす）」
// 「１商品目と２商品目の間には１行開ける。３商品までは一度に入力できるようにする」で、御見積合計の右の「※※消費税について※※」の枠を備考（5行）に、
// 下の備考（58〜62行）を隠し、明細を20行に戻した（docs/tokutei/edit-mitsumori-note.py）。
// 合計・税率ごとの内訳・消費税は原本の式のまま（開いたときに Excel が計算する）。画面のプレビュー・スマホのために、式の答えも同じ計算で入れておく。
// 原本は所長の印影の画像だけ消した（アプリは誰でも開けるページなので。印の枠は残す）
// 明細が20行に入らないときは3ページまで（ユーザーの指示「ページは3ページまでいけるようにする」2026-10-25）：原本の1ページ目（1〜62行）の下に、
// 2・3ページ目（明細のつづき）を足す。題名・見積番号・見積日・宛名（1〜7行目の写し）・明細の見出し（22行目の写し）と明細の行（CONT_ROWS 行）。
// 合計・消費税・備考は1ページ目のまま（式は2・3ページ目の明細も足す）。改ページは手動、印刷の大きさは1ページ目が1枚に入る倍率（原本は「1ページに収める」）。

import {strFromU8, strToU8} from 'fflate';
import {itemNote, saleTotals} from './calc.ts';
import type {Totals} from './calc.ts';
import {OFFICES} from './defaults.ts';
import {customerLabel, withoutBlankItems} from './sales.ts';
import {sheetPreviewPages} from './shinseiPreview.ts';
import type {PvPage, Range} from './shinseiPreview.ts';
import type {Sale, SaleItem, Settings, TaxType} from './types.ts';
import {yen} from './util.ts';
import {excelDate} from './shinsei.ts';
import {attrOf, cellRe, colorStyle, dropCalcChain, edgeStyle, esc, finishWorkbook, numOf, setCell, setStyle, sheetLayout, sheetPath, sizeCell, sizeStyle} from './xlsxEdit.ts';
import type {CellValue, Files} from './xlsxEdit.ts';

export const ESTIMATE_SHEET = '見積書';
/**
 * 1ページ目の明細の行（23〜42行の20行）。2026-10-25 に「見積もりの行数は4行ぐらい減らしていい」で16行にしたが、2026-11-03 に下の備考の欄を御見積合計の右へ移した分で
 * 20行に戻した（「行数をつくり、１商品目と２商品目の間には１行開ける。３商品までは一度に入力できるようにする」）
 */
export const ESTIMATE_ROWS = Array.from({length: 20}, (_, i) => 23 + i);
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
export const CONT_ROWS = 41;
export const MAX_PAGES = 3;
/** 商品と商品の間の空けた行の数（ユーザーの指示「１商品目と２商品目の間には１行開ける」2026-11-03。前は「商品と商品の間に空白の行は入れない」2026-11-01） */
export const ITEM_GAP = 1;
/**
 * 商品の間をあけない商品の数：4商品からは商品と商品の間をあけずに詰める（ユーザーの指示「4商品目になる場合は、1商品目と2商品目でスペースを開けずに1ページにおさめる」
 * 2026-11-08。前は4商品でも1行ずつあけ、介護保険の内訳（限度額を超えた分まで5行）が1ページ目に入らず2ページ目に回った）。最後の商品の下（内訳との間）の1行はあける
 */
export const COMPACT_FROM = 4;
/** 商品と商品の間にあける行の数（3商品までは ITEM_GAP、4商品からは 0） */
export const itemGap = (count: number) => (count >= COMPACT_FROM ? 0 : ITEM_GAP);
/** n 行のページに入る、品名が3行の商品の数（商品と商品の間に gap 行あける。ページの最後の商品の下はあけなくてよい） */
const fullItemsIn = (n: number, gap: number) => Math.floor((n + gap) / (3 + gap));
/** 見積書に入る商品の数（品名が3行の商品で：1ページ目 6＋つづき 13×2。4商品からは商品の間をあけないので、その割り付けで数える。品名の行が少ない商品はもっと入る） */
export const ESTIMATE_CAPACITY = fullItemsIn(ESTIMATE_ROWS.length, 0) + fullItemsIn(CONT_ROWS, 0) * (MAX_PAGES - 1);

/** n ページ目（2・3）の行：上の行・見出しの行・明細の行 */
export function contBlock(page: number): {top: number; head: number; rows: number[]} {
  const top = PAGE1_LAST + 1 + (page - 2) * (HEAD_ROWS.length + 1 + CONT_ROWS);
  const head = top + HEAD_ROWS.length;
  return {top, head, rows: Array.from({length: CONT_ROWS}, (_, i) => head + 1 + i)};
}
/** 商品の行（前から：1ページ目の16行 → 2ページ目 → 3ページ目） */
export function itemRows(pages: number): number[] {
  const rows = [...ESTIMATE_ROWS];
  for (let p = 2; p <= pages; p++) rows.push(...contBlock(p).rows);
  return rows;
}
/**
 * 明細の下に介護保険の内訳（利用者負担＝自己負担額を赤字）を出すか（「自己負担額を表示」。ユーザーの指示「自己負担額を表示のオンオフっていうチェック項目を入れ」2026-10-26。
 * 初めから出す。外すと false）
 */
export const showsSelfPay = (sale: Pick<Sale, 'showSelfPay' | 'items'>) => sale.showSelfPay !== false && sale.items.length > 0;

/**
 * 1つの商品の品名の行（ユーザーの指示「品名は3行で表示する。1行目：メーカー名、2行目：商品名（色まで）、3行目：【品番】品番。メーカー名や品番が空の商品は、
 * その行を詰めて表示する」2026-11-01）。メーカー名は枠や記号で囲まない。品番は末尾まで（欄に入らなければ字を小さくする＝原本の「縮小して全体を表示」）
 */
export function itemNameLines(i: Pick<SaleItem, 'maker' | 'name' | 'code'>): string[] {
  const lines = [i.maker.trim(), i.name.trim(), i.code.trim() ? `【品番】${i.code.trim()}` : ''].filter(Boolean);
  return lines.length ? lines : [''];
}
/**
 * 1ページ目の明細の欄の商品の行（初めから3商品×（3行＋あける1行）＝12行。介護保険の内訳はこの下の行。ユーザーの指示「明細欄は、最初から3商品（9行分）が入る行数にする」2026-11-01、
 * 「１商品目と２商品目の間には１行開ける。３商品までは一度に入力できるようにする」2026-11-03）
 */
export const MIN_ITEM_ROWS = 3 * (3 + ITEM_GAP);
/** 受領委任払いの介護保険の内訳の行（介護保険（受領委任払い）・介護保険の対象・利用者負担・保険者負担） */
const FULL_BELOW = 4;
/**
 * 1ページ目に見せる明細の行の数の下限：3商品分（12行）＋受領委任払いの内訳（4行）＋あける1行＝17行（ユーザーの指示「3商品＋受領委任自己負担の説明をフルにいれた場合、
 * 1番下の行をあけるのは1行だけで良い」2026-11-03）。中身がこれより多いとき（償還払い・生活保護・限度額を超えた分・4商品から）は、使った行＋1行まで（原本の20行まで）見せ、
 * 残りの行は隠す（印刷・Excel・プレビューに出ない）
 */
export const MIN_SHOWN_ROWS = MIN_ITEM_ROWS + FULL_BELOW + 1;
/** 1ページ目に見せる明細の行の数（使った行の次の1行まで。17〜20行） */
export function shownRowsOnPage1(lay: EstimateLayout, belowLines: number): number {
  if (lay.pages > 1) return ESTIMATE_ROWS.length;
  const used = lay.below >= 0 ? lay.below + belowLines : lay.areaEnd + 1;
  return Math.min(ESTIMATE_ROWS.length, Math.max(MIN_SHOWN_ROWS, used + 1));
}
/** ページの明細の行の数・そのページの初めの行（itemRows の番号） */
const pageRows = (p: number) => (p === 1 ? ESTIMATE_ROWS.length : CONT_ROWS);
const pageStart = (p: number) => (p === 1 ? 0 : ESTIMATE_ROWS.length + (p - 2) * CONT_ROWS);
/** 明細の行（itemRows の番号）がそのページの最後の行か（原本の太い罫線があるので、商品の区切りの線は引かない） */
const pageEnd = (i: number) => [1, 2, 3].some((p) => i === pageStart(p) + pageRows(p) - 1);
/** 明細の行（itemRows の番号）のページ */
const pageOf = (i: number) => (i < pageStart(2) ? 1 : i < pageStart(3) ? 2 : 3);

/** 明細の割り付け：商品ごとの行（初めの行と行の数）・商品の欄の最後の行（この下に実線）・介護保険の内訳の初めの行（-1 は出さない・入らない）・ページの数 */
export type EstimateLayout = {items: {start: number; rows: number}[]; areaEnd: number; below: number; pages: number; gap: number};

/**
 * 明細の行の割り付け（ユーザーの指示 2026-11-01「1商品の3行を1つの枠として扱う」（「商品と商品の間に空白の行は入れない」は 2026-11-03 に「１商品目と２商品目の間には１行開ける」に）
 * 「明細欄は、最初から3商品（3行×3商品＝9行分）が入る行数にする。介護保険の内訳…の行は、この9行とは別に確保する」「1〜3商品のときは、この行数のまま変えない」
 * 「4商品以上になって入りきらないときだけ、明細欄の行数を必要な分だけ増やす」「1枚に入りきらない場合は2ページ目に続け、2ページ目にも明細の見出し行を付ける」）：
 *   商品は前から置き、商品の下に1行あける（ITEM_GAP。ページの最後ではあけない）。4商品からは商品と商品の間はあけない（itemGap。最後の商品の下の1行はあける）。
 *   1つの商品の行はページをまたがない（入らなければ次のページの初めから）。
 *   1ページ目の商品の欄は少なくとも 12 行（3商品分）。
 *   介護保険の内訳（below 行）は商品の欄のすぐ下。そのページに入らなければ次のページの初めから。合計・消費税の表は1ページ目の下のまま（明細の欄の中で割り付けるので、ずれない）。
 * perItem は商品ごとの品名の行の数（itemNameLines の数）。3ページに入らない商品は items に入れない
 */
export function estimateLayout(perItem: number[], below: number): EstimateLayout {
  const items: {start: number; rows: number}[] = [];
  const gap = itemGap(perItem.length);
  let page = 1;
  let at = 0; // そのページの中の行
  for (const k of perItem) {
    if (at + k > pageRows(page)) {
      if (page === MAX_PAGES) break;
      page++;
      at = 0;
    }
    items.push({start: pageStart(page) + at, rows: k});
    at = Math.min(pageRows(page), at + k + gap);
  }
  // 最後の商品の下（介護保険の内訳との間）は1行あける（ページの最後ではあけない）
  const last = items.at(-1);
  if (last) at = Math.min(pageRows(page), last.start - pageStart(page) + last.rows + ITEM_GAP);
  if (page === 1) at = Math.max(at, MIN_ITEM_ROWS);
  const areaEnd = pageStart(page) + at - 1;
  let start = -1;
  if (below > 0 && items.length) {
    if (at + below <= pageRows(page)) start = pageStart(page) + at;
    else if (page < MAX_PAGES) {
      page++;
      start = pageStart(page);
    }
  }
  return {items, areaEnd, below: start, pages: page, gap};
}
/** 利用者負担の行（自己負担額。見積書では赤字。見積もりの画面の「自己負担額を表示」の横にも出す） */
export const userBurdenLine = (t: Pick<Totals, 'ratio' | 'userBurden'>) => `利用者負担（${t.ratio}割）　${yen(t.userBurden)}円`;
/**
 * 介護保険の内訳：明細の最後の商品の2行下から1行ずつ「介護保険（受領委任払い）」「介護保険の対象　○円」「利用者負担（1割）　○円」「保険者負担（9割）　○円」
 * （ユーザーの指示「備考欄に記載している部分を上にずらす」「行を変えて見やすくする」「この部分のみ記載する形で良い　利用者負担額の部分のみ赤字で記載する」2026-10-26。
 * 前は下の備考の欄に2行でまとめ、そのあと一度「自己負担額（1割負担）」〜「（3割負担）」の3行と「お支払いいただく金額」も書いていた）。
 * 生活保護の分（負担割合の分。「介護扶助」とは書かない）・限度額を超えた分はあるときだけ。償還払いは、いったん全額を払うことが大事なので「いったんお支払いいただく金額」と払い戻しの行も。介護保険の対象がなければ []
 */
export function insuranceLines(sale: Sale, t: Totals): string[] {
  if (t.covered <= 0) return [];
  // 負担割合を選んでいなければ、割合で決まる行（利用者負担・介護扶助・保険者負担・払い戻し）は出さない
  // （ユーザーの指示「（負担割合を選ぶまで自己負担額は）出さない」2026-10-27）
  const out = [`介護保険（${sale.payMethod}）`, `介護保険の対象　${yen(t.covered)}円`];
  if (t.ratioSet) {
    out.push(userBurdenLine(t));
    // 生活保護のときの負担割合の分は「生活保護（1割）」と書く（ユーザーの指示「生活保護のときは、介護扶助という文言は不要」、見積書からも「外します」2026-10-28）
    if (t.aid > 0) out.push(`生活保護（${t.ratio}割）　${yen(t.aid)}円`);
    out.push(`保険者負担（${10 - t.ratio}割）　${yen(t.insurerBurden)}円`);
  }
  if (t.excess > 0) out.push(`限度額を超えた分　${yen(t.excess)}円`);
  if (sale.payMethod === '償還払い') out.push(`いったんお支払いいただく金額　${yen(t.total)}円`, ...(t.ratioSet ? [`（あとで保険者から ${yen(t.insurerBurden)}円が払い戻されます）`] : []));
  return out;
}
/** 明細の商品の下に書く行（介護保険の内訳）と、赤字にする行（利用者負担）。出さない・商品がなければ [] */
export function belowItemLines(sale: Sale, s: Settings): {lines: string[]; red: number} {
  if (!showsSelfPay(sale)) return {lines: [], red: -1};
  const t = saleTotals(sale, s);
  const lines = insuranceLines(sale, t);
  return {lines, red: lines.indexOf(userBurdenLine(t))};
}
const belowCount = (sale: Sale, s: Settings) => belowItemLines(sale, s).lines.length;
/** 案件の明細の割り付け（estimateLayout） */
export const saleLayout = (sale: Sale, s: Settings): EstimateLayout => estimateLayout(sale.items.map((i) => itemNameLines(i).length), belowCount(sale, s));
/** 備考の行（御見積合計の右の「備　　考」の下の5行。H〜K を1つにした欄。前は下の 60〜62行の3行。2026-11-03） */
const NOTE_ROWS = [47, 48, 49, 50, 51];
const NOTE_COL = 'H';
/** 見積書の備考に書ける行の数 */
export const ESTIMATE_NOTE_LINES = NOTE_ROWS.length;
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
const links = (sale: Sale, s: Settings): [EstimateField, string[]][] => {
  const lay = saleLayout(sale, s);
  const pages = lay.pages;
  const n = belowCount(sale, s);
  const rows = itemRows(pages);
  const tops = [1, ...Array.from({length: pages - 1}, (_, i) => contBlock(i + 2).top)];
  // 商品の行（品名の行のどれも）と、商品の欄の次の商品の行（あけた1行の下。押すと商品を足す所へ）
  const used = lay.items.flatMap((it) => Array.from({length: it.rows}, (_, j) => it.start + j));
  const last = lay.items.at(-1);
  const next = last ? last.start + last.rows + lay.gap : 0;
  const itemIdx = [...used, ...(next < rows.length && next <= lay.areaEnd ? [next] : [])];
  return [
    ['customer', tops.map((t) => `A${t + 5}`)],
    ['quoteNo', tops.map((t) => `I${t + 3}`)],
    ['estimateDate', tops.map((t) => `I${t + 4}`)],
    ['staff', ['I16']],
    ['items', itemIdx.flatMap((k) => ['A', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => `${c}${rows[k]}`))],
    ['selfPay', lay.below >= 0 ? rows.slice(lay.below, lay.below + n).map((r) => `A${r}`) : []],
    ['note', NOTE_ROWS.map((r) => `${NOTE_COL}${r}`)],
  ];
};

/** 税率の欄の値（原本の下の合計の欄が、この値で税率ごとに分ける。A53〜A57 と同じ値） */
const RATE: Record<TaxType, CellValue> = {'10%': 0.1, '8%': '軽減税率8%', 非課税: '非課税'};

/** 備考の行：見積書の備考に足す文（5行まで。介護保険の内訳は明細の下へ移した＝insuranceLines。2026-10-26） */
const noteLines = (sale: Pick<Sale, 'note'>) => sale.note.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
export const estimateNotes = (sale: Pick<Sale, 'note'>): string[] => noteLines(sale).slice(0, NOTE_ROWS.length);

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

/** 題（御　見　積　書）の文字の大きさ（pt） */
export const TITLE_PT = 26;
/** 宛名（A6）の字の大きさ（pt）。原本は 16pt */
export const NAME_PT = 20;

/** 原本（開いたもの）の写しに案件を書く。書いたブック（files をそのまま書きかえる） */
export function fillEstimateFiles(files: Files, all: Sale, s: Settings): void {
  const sale = withoutBlankItems(all); // 何も入れていない商品の欄は書かない
  const t = saleTotals(sale, s);
  const path = sheetPath(files, ESTIMATE_SHEET);
  let xml = strFromU8(files[path]);
  const tpl = xml; // 書く前の原本のシート（2・3ページ目の行の書式の元）
  const put = (ref: string, v: CellValue) => {
    xml = setCell(xml, ref, v);
  };
  // 宛名は左に詰めず、全角のすき間1つあける（ユーザーの指示「名前の部分は左に詰めるのではなく、スペース一つ分あける」2026-10-26）
  // お客様名が空なら名前の所は空けておく（手で書けるように。前は画面の「（お客様名未入力）」がそのまま見積書に出た）
  put('A6', `　${sale.customer.trim() ? customerLabel(sale).replace(/\s*様$/, '') : '　'.repeat(8)}　様`);
  // 宛名の字は原本（16pt）より2段大きく（ユーザーの指示「名前の部分は2段階ぐらい大きくする」2026-10-28。A6:E7 の結合＝高さ30pt に入る。長い名前は原本どおり縮めて入れる）。
  // 2・3ページ目の宛名は、ここで書いたあとの写しなので同じ大きさ
  xml = setStyle(xml, 'A6', String(sizeStyle(files, numOf(attrOf(cellRe('A6').exec(xml)?.[1] ?? '', 's'), 0), NAME_PT)));
  put('I4', `№　${sale.quoteNo.trim()}`);
  // 見積日が空なら空欄に（前は原本に残っていた日付＝2026年4月1日がそのまま出た）
  put('I5', excelDate(sale.estimateDate) || '');
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
  const lay = saleLayout(sale, s);
  const pages = lay.pages;
  if (pages > 1) xml = addContinuation(xml, tpl, pages);
  const rows = itemRows(pages);
  // 1ページ目の明細は、使った行の次の1行まで見せて、その下の行は隠す（17〜20行。表の下の太い線は43行目の上の線なので、隠しても表は閉じる）
  const shown = shownRowsOnPage1(lay, belowCount(sale, s));
  for (const r of ESTIMATE_ROWS.slice(shown)) xml = hideRow(xml, r);
  // 明細の金額の欄は、どの行もふつうの式にする（前の原本の26〜42行は「共有の式」で、親の26行目を書きかえると下の行の式がこわれた。隠した行も）
  const amountStyle = /\ss="(\d+)"/.exec(cellRe('I26').exec(xml)?.[1] ?? '')?.[1];
  for (const r of new Set([...TEMPLATE_ITEM_ROWS, ...rows])) xml = setFormula(xml, `I${r}`, `IF(F${r}*H${r},F${r}*H${r},"")`, '', amountStyle);
  // 明細：前から3ページまで（金額は 数量×単価 の式。単価のない品目（手で入れて値段がまだ）は単価を空に）。
  // 品名は メーカー名／商品名／【品番】の行（itemNameLines）。数量・単位・単価・金額・税率・備考は品名の1行目にそろえる（ユーザーの指示 2026-11-01）
  const sums: Record<string, number> = {};
  lay.items.forEach((it, k) => {
    const l = t.lines[k];
    const r = rows[it.start];
    const i = l.item;
    itemNameLines(i).forEach((text, j) => put(`A${rows[it.start + j]}`, text));
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
  // 商品の区切りは実線（商品の下にあけた1行の下と次の行の上を細い実線に。1つの商品の中の行の間・商品とあけた行の間は原本の細い点線のまま。
  // ページの最後の行は原本の太い線のまま。ページの最後の商品で1行あけられなかったときは商品の最後の行の下）。
  // 商品の欄の終わり（介護保険の内訳との境）も実線（ユーザーの指示「商品の区切りは実線で引く。1商品の中の3行の間は、線なしか細い点線にする」2026-11-01、
  // 「１商品目と２商品目の間には１行開ける」2026-11-03）
  // 4商品から（商品の間をあけない）は、商品の最後の行の下が区切り。最後の商品は下にあけた1行の下
  const frameEnd = (it: {start: number; rows: number}, k: number) => {
    const gap = it.start + it.rows - 1 + (k === lay.items.length - 1 ? ITEM_GAP : lay.gap);
    return pageOf(gap) === pageOf(it.start) ? gap : it.start + it.rows - 1;
  };
  const cut = new Set([...lay.items.map(frameEnd), lay.areaEnd].filter((k) => k >= 0 && k < rows.length && !pageEnd(k)));
  for (const k of cut) {
    for (const c of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
      for (const [ref, edges] of [
        [`${c}${rows[k]}`, {bottom: 'thin'}],
        [`${c}${rows[k + 1]}`, {top: 'thin'}],
      ] as [string, {top?: string; bottom?: string}][]) {
        const m = cellRe(ref).exec(xml);
        if (m) xml = setStyle(xml, ref, String(edgeStyle(files, numOf(attrOf(m[1], 's'), 0), edges)));
      }
    }
  }
  // 商品の欄のすぐ下から介護保険の内訳を1行ずつ。利用者負担（自己負担額）は赤字（ユーザーの指示「利用者負担額の部分のみ赤字で記載する」2026-10-26）。
  // 品名の欄に文で。金額の欄・税率は空なので合計には入らない
  const below = belowItemLines(sale, s);
  const self = lay.below;
  if (self >= 0)
    below.lines.forEach((text, k) => {
      const ref = `A${rows[self + k]}`;
      put(ref, text);
      if (k === below.red) xml = setStyle(xml, ref, String(colorStyle(files, numOf(attrOf(cellRe(ref).exec(xml)?.[1] ?? '', 's'), 0), 'FFFF0000')));
    });
  // 備考
  const notes = estimateNotes(sale);
  NOTE_ROWS.forEach((r, k) => put(`${NOTE_COL}${r}`, notes[k] ?? ''));
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
  // 消費税は商品（行）ごとに切り捨てて足す（calc.ts の lineOf・DESIGN.md 4.2。画面の合計・介護保険の対象・申請書の購入金額・販売受注簿と同じ）。
  // 原本の式は税率ごとの合計に1回だけ切り捨て（ROUNDDOWN(C47*0.1,0)）で、1円単位の単価の商品が2つ以上あると御見積合計だけ1円多くなった
  // （2026-11-08 のデバッグで見つけた。例：12,345円の商品2つ → 御見積合計 27,159円・介護保険の対象 27,158円）。
  // 式は行ごとの 数量×単価×税率 の切り捨ての合計（金額の欄は空の行が "" なので、数量・単価の欄でかける。2・3ページ目の明細も足す）
  const blocks: [number, number][] = [
    [ESTIMATE_ROWS[0], ESTIMATE_ROWS[ESTIMATE_ROWS.length - 1]],
    ...Array.from({length: pages - 1}, (_, i): [number, number] => {
      const rs = contBlock(i + 2).rows;
      return [rs[0], rs[rs.length - 1]];
    }),
  ];
  const lineTax = (crit: string, rate: string) =>
    blocks.map(([a, b]) => `SUMPRODUCT(($J$${a}:$J$${b}=${crit})*ROUNDDOWN($F$${a}:$F$${b}*$H$${a}:$H$${b}*${rate},0))`).join('+');
  const taxOfRate = (key: string) => lay.items.reduce((n, _, k) => n + (String(RATE[t.lines[k].item.taxType]) === key ? t.lines[k].tax : 0), 0);
  // 式の答え（税率ごとの合計・消費税・御見積合計。営業所の欄はマスタのシートの値）
  const c47 = sums['0.1'] ?? 0;
  const c48 = 0; // 8%（軽減でない）の商品はこのアプリにない
  const c49 = sums['軽減税率8%'] ?? 0;
  const c50 = sums['非課税'] ?? 0;
  const e47 = taxOfRate('0.1');
  const e48 = Math.floor(c48 * 0.08);
  const e49 = taxOfRate('軽減税率8%');
  xml = setFormula(xml, 'E47', lineTax('$A$53', '0.1'), e47, undefined);
  xml = setFormula(xml, 'E49', lineTax('$A$55', '0.08'), e49, undefined);
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
  // 題の「御　見　積　書」は少し大きく（ユーザーの指示「御見積書の部分は、少し文字を大きくする」2026-10-26。原本は 22pt。D1:I2 の結合に入る大きさ）
  sizeCell(files, ESTIMATE_SHEET, 'D1', TITLE_PT);
  if (pages > 1) setPrintArea(files, pages);
  dropCalcChain(files);
}

/** 行を隠す（<row> に hidden="1"） */
function hideRow(xml: string, r: number): string {
  return xml.replace(new RegExp(`<row r="${r}"(?=[\\s/>])([^>]*?)(/?)>`), (m, attrs: string, close: string) => (/\shidden="1"/.test(attrs) ? m : `<row r="${r}" hidden="1"${attrs}${close}>`));
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
export function estimatePreview(template: Files, all: Sale, s: Settings): PvPage<EstimateField>[] {
  const sale = withoutBlankItems(all); // 何も入れていない商品の欄は出さない（Excel と同じ）
  const files: Files = {...template};
  fillEstimateFiles(files, sale, s);
  const pages = saleLayout(sale, s).pages;
  const ranges: (Range | null)[] = [pages > 1 ? [1, 1, LAST_COL, PAGE1_LAST] : null];
  for (let p = 2; p <= pages; p++) ranges.push([1, contBlock(p).top, LAST_COL, contBlock(p).rows.at(-1)!]);
  return sheetPreviewPages(files, template, ESTIMATE_SHEET, links(sale, s), ranges);
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

/** 3ページの明細に入らない商品の数 */
export const estimateOverflow = (sale: Sale) => Math.max(0, sale.items.length - estimateLayout(sale.items.map((i) => itemNameLines(i).length), 0).items.length);

/** 備考の3行に入らない行の数 */
export const estimateNoteOverflow = (sale: Pick<Sale, 'note'>) => Math.max(0, noteLines(sale).length - NOTE_ROWS.length);

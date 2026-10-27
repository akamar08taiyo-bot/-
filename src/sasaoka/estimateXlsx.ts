// 見積書を Excel（.xlsx）で保存する。印刷する見積書（print/EstimateForms.tsx）と同じ書式・同じ数字で、
// ページごとに下へ並べて改ページを入れる（Excel で開いて、そのまま印刷できる）。
// 金額の欄は、Excel で数量・単価を直しても計算し直されるよう、元の見積書と同じ式（ROUNDDOWN(数量×単価) など）にする。
// 式ではアプリと同じ金額にならない行（割り切れない長さの部材など）は、アプリの金額をそのまま書く。

import {estimateTotals, rounddown} from './calc.ts';
import type {EstimateSums, EstimateTotals} from './calc.ts';
import {circled, FORM_INFO, formLines, hourlyBasis, jobForm, KINDS, lineNote, paginate, reiwa, TOTAL_ROWS} from './estimateForms.ts';
import type {FormLine} from './estimateForms.ts';
import {fitLines, fitName, fitText} from './print/fit.ts';
import type {Fit} from './print/fit.ts';
import {issuerLines, KK, KK_FOOT, KK_LEFT, KK_NOTE_1, KK_NOTE_2, KK_RIGHT, KK_ROWS, NOTE_KIND, NOTE_MARK, NOTE_PHOTO, totalRows, YK, YK_ROW} from './print/formLayout.ts';
import type {Job, Settings} from './types.ts';
import {customerFilePart, num, yen} from './util.ts';
import {cellRef, SheetBuilder, writeXlsx} from './xlsxWrite.ts';
import type {XEdges, XSheet, XStyle} from './xlsxWrite.ts';

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const GOTHIC = 'ＭＳ Ｐゴシック';
const MINCHO = 'ＭＳ Ｐ明朝';
const MONEY = '#,##0';

/**
 * 印刷の見積書の欄の印（'ml mr nr' など）を罫線にする。ruled は罫線のある行（ふだんは細線）。
 * ml・mr・mt・mb は太い線、nr・nl はその側の線なし、gap は左右が太い線、bt・bb は上・下の細線、box はまわりの細線
 */
function edges(cls: string, ruled: boolean): XEdges {
  const has = new Set(cls.split(' '));
  const e: XEdges = ruled || has.has('box') ? {l: 'thin', r: 'thin', t: 'thin', b: 'thin'} : {};
  if (has.has('bt')) e.t = 'thin';
  if (has.has('bb')) e.b = 'thin';
  if (has.has('ml') || has.has('gap')) e.l = 'medium';
  if (has.has('mr') || has.has('gap')) e.r = 'medium';
  if (has.has('mt')) e.t = 'medium';
  if (has.has('mb')) e.b = 'medium';
  if (has.has('nr')) e.r = 'hidden';
  if (has.has('nl')) e.l = 'hidden';
  return e;
}

/** 欄の印の r（右寄せ）・c（中央） */
function align(cls: string): XStyle['h'] {
  const has = new Set(cls.split(' '));
  return has.has('r') ? 'right' : has.has('c') ? 'center' : undefined;
}

/**
 * 欄の文字と書式：印刷と同じ大きさ・同じ改行（`fitText`・`fitLines`・`fitName`。印刷と同じ計算）。折り返す欄は改行を入れて折り返しの書式。
 * 1行の欄は「縮小して全体を表示」も付ける（Excel の字体が少し広くても切れない）。前は1行の欄を Excel の縮小に任せ、
 * 印刷では折り返す長い改修場所・備考が Excel では1行の小さな字になり、品名・備考の大きさも印刷と違っていた
 */
function fitted(f: Fit): {v: string | null; st: XStyle} {
  const v = f.lines.join('\n');
  return {v: v || null, st: f.lines.length > 1 ? {size: f.pt, wrap: true} : {size: f.pt, shrink: true}};
}
/** 1つの文字の欄（`fitText`） */
const fit = (text: string, w: number, h: number, maxPt: number, lines = 1) => fitted(fitText(text, w, h, maxPt, lines));

/** 金額・数量の欄：印刷と同じ大きさ（Excel の書式 #,##0 と同じ「12,345」の幅で） */
const money = (v: number, w: number, h: number, maxPt = 11): XStyle => ({size: fitText(yen(v), w, h, maxPt).pt, numFmt: MONEY, shrink: true});
const count = (q: number, w: number, h: number, maxPt = 9): XStyle => ({size: fitText(num(q, 3), w, h, maxPt).pt, shrink: true});
/** 数量は印刷と同じく小数3けたまで */
const qty3 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (rate: number) => Math.round(rate * 1000) / 10;

/** 金額＝ROUNDDOWN(数量×単価) の式。式の答えがアプリの金額と違うとき（割り切れない長さを丸めた数量など）は使わない */
function amountFormula(qty: number, price: number, amount: number, qtyCell: string, priceCell: string): string | undefined {
  return rounddown(qty * price) === amount ? `ROUNDDOWN(${qtyCell}*${priceCell},0)` : undefined;
}

/**
 * 合計の欄（小計・諸経費・消費税・合計）の式。col は金額の列、ranges は明細の金額の範囲（ページごと）。
 * 諸経費を手で直してあるか、合計の末尾を0にする端数調整で 小計×率 と違う金額にしたとき（`overheadAuto`）は、その金額をそのまま書く
 * （式の答えがアプリの金額と同じにならない欄は数字のまま）
 */
function totalFormulas(col: number, top: number, ranges: string[], manualOverhead: boolean, sums: EstimateSums, s: Settings): (string | undefined)[] {
  const [sub, oh, tax] = [cellRef(top, col), cellRef(top + 1, col), cellRef(top + 2, col)];
  const plain = !manualOverhead && sums.overhead === rounddown(sums.subtotal * s.estimateOverheadRate);
  return [
    `SUM(${ranges.join(',')})`,
    plain ? `ROUNDDOWN(${sub}*${s.estimateOverheadRate},0)` : undefined,
    `ROUNDDOWN((${sub}+${oh})*${s.taxRate},0)`,
    `${sub}+${oh}+${tax}`,
  ];
}

/** 介護保険の対象の諸経費を手で直してあるか（対象外の行がなければ全体と同じ諸経費） */
function manualTargetOverhead(job: Job, t: EstimateTotals): boolean {
  return t.excluded === 0 ? job.overhead != null : job.overheadTarget != null;
}

// ================================================================ 苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」

function yukuhashiSheet(job: Job, s: Settings, date: string): XSheet {
  const b = new SheetBuilder();
  const per = FORM_INFO.yukuhashi.perPage;
  const pages = paginate(formLines(job, s, 'yukuhashi'), per);
  const t = estimateTotals(job, s);
  const totals = totalRows(t);
  const name = job.customer.trim();
  const issuer = issuerLines(job, s);
  const issuerPt = Math.min(...issuer.map((l) => fitText(l, YK.H + YK.I + YK.J + YK.K + YK.L + YK.M, 5, 11).pt));
  const ranges = {all: [] as string[], target: [] as string[]};

  pages.forEach((page, pi) => {
    const last = pi === pages.length - 1;
    if (pi > 0) b.pageBreak();
    const title = b.row(10.05);
    b.put(title, 0, `①　${FORM_INFO.yukuhashi.title}`, {size: 24, h: 'center'}, {}, 1, 13);
    const [r2, r3, r4, r5] = [b.row(5.82), b.row(7.67), b.row(7.67), b.row(7.67)];
    b.put(r2, 7, pi === 0 ? issuer.join('\n') : null, {size: issuerPt, h: 'left', v: 'bottom', wrap: true}, {}, 4, 6);
    const nm = fit(name, YK.A + YK.B, 7.67, 18);
    b.put(r3, 0, nm.v, {...nm.st, h: 'center'}, edges('bb', false), 1, 2);
    b.put(r3, 2, '様邸　住宅改修', {size: 12});
    b.put(r4, 0, pi === 0 ? `介護保険被保険者番号（${job.insuredNo.trim() || '　　　　　　　　　　'}）` : null, {size: 12, shrink: true}, edges('bb', false), 1, 3);
    const label = fit('工事場所（住所）', YK.A, 7.67, 12);
    b.put(r5, 0, label.v, label.st, edges('bt bb', false));
    const address = fit(job.address, YK.B + YK.C, 7.67, 11);
    b.put(r5, 1, address.v, address.st, edges('bt bb', false), 1, 2);
    b.row(5.03);

    const [h1, h2] = [b.row(10.53), b.row(5.03)];
    const th = (r: number, c: number, text: string, cls: string, rs = 1, cs = 1) =>
      b.put(r, c, text, {size: 10.5, h: 'center', wrap: true}, edges(cls, true), rs, cs);
    th(h1, 0, '改修内容\n（付帯工事含む）', 'ml mt mb', 2);
    th(h1, 1, '改修場所\n（写真No．）', 'mt mb', 2);
    th(h1, 2, '内容（　規格・範囲　）', 'mt mb', 2);
    th(h1, 3, '数量', 'mt mb', 2, 2);
    th(h1, 5, '単価', 'mt mb', 2);
    th(h1, 6, '金額', 'mt mb mr', 2);
    th(h1, 7, '介護保険対象部分', 'mt mr', 1, 4);
    th(h1, 11, '介護保険\n対象外金額', 'mt mb mr', 2);
    th(h1, 12, '備考（定価等）', 'mt mb mr', 2);
    th(h2, 7, '数量', 'mb', 1, 2);
    th(h2, 9, '単価', 'mb');
    th(h2, 10, '金額', 'mb mr');

    const first = b.rows.length; // 明細の最初の行
    const detailEnd = first + (last ? per - TOTAL_ROWS : per) - 1;
    ranges.all.push(`${cellRef(first, 6)}:${cellRef(detailEnd, 6)}`);
    ranges.target.push(`${cellRef(first, 10)}:${cellRef(detailEnd, 10)}`);
    const top = first + per - TOTAL_ROWS; // 小計の行
    const fAll = totalFormulas(6, top, ranges.all, job.overhead != null, t.all, s);
    const fTarget = totalFormulas(10, top, ranges.target, manualTargetOverhead(job, t), t.target, s);
    for (let i = 0; i < per; i++) {
      const r = b.row(YK_ROW);
      const bottom = i === per - 1 ? ' mb' : '';
      const put = (c: number, v: string | number | null, cls: string, st: XStyle = {}, f?: string) =>
        b.put(r, c, v, {...st, h: align(cls) ?? st.h}, edges(cls + bottom, true), 1, 1, f);
      const ti = i - (per - TOTAL_ROWS);
      if (last && ti >= 0) {
        const [label, all, target] = totals[ti];
        put(0, null, 'ml');
        put(1, null, '');
        put(2, label, 'c', {size: 9, bold: true});
        put(3, null, 'nr');
        put(4, null, 'nl');
        put(5, null, '');
        put(6, all, 'r mr', money(all, YK.G, YK_ROW), fAll[ti]);
        put(7, null, 'nr');
        put(8, null, 'nl');
        put(9, null, '');
        put(10, target, 'r mr', money(target, YK.K, YK_ROW), fTarget[ti]);
        put(11, null, 'mr');
        put(12, null, 'mr');
        continue;
      }
      const l = page[i];
      if (!l) {
        ['ml', '', '', 'nr', 'nl', '', 'mr', 'nr', 'nl', '', 'mr', 'mr', 'mr'].forEach((cls, c) => put(c, null, cls));
        continue;
      }
      ykLine(l, r, put);
    }
  });

  const d = reiwa(date);
  return b.sheet({
    name: name ? `${name}様` : '見積書',
    cols: Object.values(YK),
    landscape: true,
    scale: 98, // パソコン・プリンターで列の幅が少し変わっても、右の列が次のページに行かないように
    margins: {l: 15, r: 10, t: 20, b: 15, header: 13, footer: 11},
    header: `&R作成日　令和${d ? d.y : '　'}年${d ? d.m : '　　'}月${d ? d.d : '　　'}日`,
    footer: '&Cページ　&P　／　&N',
    font: {name: GOTHIC, size: 11},
  });
}

type Put = (c: number, v: string | number | null, cls: string, st?: XStyle, f?: string) => void;

function ykLine(l: FormLine, r: number, put: Put) {
  const open = !l.isWork && l.qty === 0; // 数を入れていない部材（部材＋施工費（常用）で本数を空けたもの）：印刷と同じく数量・金額は空
  const target = !l.excluded;
  const q = qty3(l.qty);
  const [D, F, G] = [cellRef(r, 3), cellRef(r, 5), cellRef(r, 6)];
  const place = `${circled(l.photo)}${l.placeName}`;
  const work = fit(l.work, YK.A, YK_ROW, 11);
  const pl = fit(place, YK.B, YK_ROW, 11);
  put(0, l.first ? work.v : null, 'ml', work.st);
  put(1, l.first ? pl.v : null, '', pl.st);
  if (l.blank) {
    // 空白の行（何も入っていない部材の行）は、罫線だけの行
    ['', 'r nr', 'nl', 'r', 'r mr', 'r nr', 'nl', 'r', 'r mr', 'r mr', 'mr'].forEach((cls, i) => put(i + 2, null, cls));
    return;
  }
  const name = fitted(fitName(l.text, YK.C, YK_ROW, 9, 2));
  put(2, l.text ? name.v : null, '', name.st);
  put(3, open ? null : q, 'r nr', count(q, YK.D, YK_ROW));
  const unit = fit(l.unit, YK.E, YK_ROW, 11);
  put(4, unit.v, 'nl', unit.st);
  put(5, l.unitPrice, 'r', money(l.unitPrice, YK.F, YK_ROW));
  put(6, open ? null : l.amount, 'r mr', money(l.amount, YK.G, YK_ROW), open ? undefined : amountFormula(q, l.unitPrice, l.amount, D, F));
  // 介護保険対象部分は左の数量・単価・金額と同じ（左を直せば、こちらも変わる）
  put(7, target && !open ? q : null, 'r nr', count(q, YK.H, YK_ROW), target && !open ? D : undefined);
  const unit2 = fit(l.unit, YK.I, YK_ROW, 11);
  put(8, target ? unit2.v : null, 'nl', unit2.st);
  put(9, target ? l.unitPrice : null, 'r', money(l.unitPrice, YK.J, YK_ROW), target ? F : undefined);
  put(10, target && !open ? l.amount : null, 'r mr', money(l.amount, YK.K, YK_ROW), target && !open ? G : undefined);
  put(11, target || open ? null : l.amount, 'r mr', money(l.amount, YK.L, YK_ROW), target || open ? undefined : G);
  // 備考（定価等）：「定価8,000円（税抜）×0.8」。切って使う部材は「定価20,000円（4m）×0.8」と「600mm÷4000mm＝0.15」の2行
  const note = lineNote(l, 'yukuhashi', 0);
  const nt = note.length > 1 ? fitted(fitLines(note, YK.M, YK_ROW, 11)) : fit(note[0] ?? '', YK.M, YK_ROW, 11);
  put(12, nt.v, 'mr', nt.st);
}

// ================================================================ 広域連合用「住宅改修内訳明細書」（福岡県介護保険広域連合の様式）

function kouikiSheet(job: Job, s: Settings): XSheet {
  const b = new SheetBuilder();
  const per = FORM_INFO.kouiki.perPage;
  const pages = paginate(formLines(job, s, 'kouiki'), per);
  const t = estimateTotals(job, s);
  const totals = totalRows(t);
  const tax = pct(s.taxRate);
  const ranges = {all: [] as string[], target: [] as string[]};
  // 本文は明朝、数字の欄（印刷の gothic）はゴシック
  const font = (cls: string) => (cls.split(' ').includes('gothic') ? GOTHIC : MINCHO);

  pages.forEach((page, pi) => {
    const last = pi === pages.length - 1;
    if (pi > 0) b.pageBreak();
    const r1 = b.row(4.35);
    b.put(r1, 0, '内訳書　様式', {font: MINCHO, size: 9, h: 'center'}, edges('box', false), 1, 2);
    const photoNote = fit(NOTE_PHOTO, KK_RIGHT, 4.35, 8);
    b.put(r1, 11, photoNote.v, {font: MINCHO, ...photoNote.st}, {}, 1, 7);
    const r2 = b.row(4.6);
    const markNote = fit(NOTE_MARK, KK_LEFT, 4.6, 8);
    const kindNote = fit(NOTE_KIND, KK_RIGHT, 4.6, 8);
    b.put(r2, 0, markNote.v, {font: MINCHO, ...markNote.st}, {}, 1, 11);
    b.put(r2, 11, kindNote.v, {font: MINCHO, ...kindNote.st}, {}, 1, 7);

    const th = (r: number, c: number, text: string | null, cls: string, st: XStyle = {}, cs = 1) =>
      b.put(r, c, text, {font: MINCHO, size: 9, h: 'center', wrap: true, ...st}, edges(cls, true), 1, cs);
    const g = b.row(7.74);
    th(g, 0, '改修箇所：箇所毎工事名称：部材・仕様記入欄', 'ml mt mb mr', {size: 11}, 4);
    th(g, 4, null, 'gap mt mb');
    th(g, 5, '全改修工事部分', 'ml mt mb mr', {size: 11}, 4);
    th(g, 9, null, 'gap mt mb');
    th(g, 10, '対象工事部分', 'ml mt mb mr', {size: 11}, 8);
    const h = b.row(28.05);
    th(h, 0, '改修箇所\n（室名）', 'ml mb');
    th(h, 1, '改修箇所毎工事名称', 'mb');
    th(h, 2, null, 'mb');
    th(h, 3, '部材・仕様・・・・（材料）\n付属品を含めた単価を記入。\n手間・・・・・・（手間）', 'mb mr', {h: 'left', size: fitText('部材・仕様・・・・（材料）', KK.D, 10, 9).pt});
    th(h, 4, null, 'gap mb');
    th(h, 5, '数量', 'ml mb');
    th(h, 6, '単位', 'mb');
    th(h, 7, '単価', 'mb');
    th(h, 8, '金額', 'mb mr');
    th(h, 9, null, 'gap mb');
    th(h, 10, '写\n真\n番\n号', 'ml mb');
    th(h, 11, ['改修の種類', ...KINDS.map((k, i) => `${circled(i + 1)}${k}`)].join('\n'), 'mb', {
      h: 'left',
      bold: true,
      size: fitText(`${circled(1)}${KINDS[0]}`, KK.L, 4, 9).pt, // いちばん長い①の行が入る大きさ
    });
    th(h, 12, '数量', 'ml mb');
    th(h, 13, '単位', 'mb');
    th(h, 14, '単価', 'mb');
    th(h, 15, '金額', 'mb mr');
    th(h, 16, '算出根拠', 'ml mb mr', {}, 2);

    const first = b.rows.length;
    const detailEnd = first + (last ? per - TOTAL_ROWS : per) - 1;
    ranges.all.push(`${cellRef(first, 8)}:${cellRef(detailEnd, 8)}`);
    ranges.target.push(`${cellRef(first, 15)}:${cellRef(detailEnd, 15)}`);
    const top = first + per - TOTAL_ROWS;
    const fAll = totalFormulas(8, top, ranges.all, job.overhead != null, t.all, s);
    const fTarget = totalFormulas(15, top, ranges.target, manualTargetOverhead(job, t), t.target, s);
    KK_ROWS.forEach((height, i) => {
      const r = b.row(height);
      const bottom = i === per - 1 ? ' mb' : '';
      const put = (c: number, v: string | number | null, cls: string, st: XStyle = {}, f?: string) =>
        b.put(r, c, v, {font: font(cls), ...st, h: align(cls) ?? st.h}, edges(cls + bottom, true), 1, 1, f);
      const ti = i - (per - TOTAL_ROWS);
      if (last && ti >= 0) {
        const [label, all, target] = totals[ti];
        const isTax = label === '消費税';
        put(0, null, 'ml');
        put(1, null, '');
        put(2, null, '');
        put(3, label, 'c mr', {size: 11});
        put(4, null, 'gap');
        put(5, isTax ? tax : null, 'r ml', {size: 11});
        put(6, isTax ? '％' : null, '', {size: 11});
        put(7, null, '');
        put(8, all, 'r mr', money(all, KK.I, height), fAll[ti]);
        put(9, null, 'gap');
        put(10, null, 'ml');
        put(11, null, '');
        put(12, isTax ? tax : null, 'r ml', {size: 11});
        put(13, isTax ? '％' : null, '', {size: 11});
        put(14, null, '');
        put(15, target, 'r mr', money(target, KK.P, height), fTarget[ti]);
        b.put(r, 16, null, {font: MINCHO}, edges(`ml mr${bottom}`, true), 1, 2);
        return;
      }
      const l = page[i];
      if (!l) {
        ['ml', '', '', 'mr', 'gap', 'ml', '', '', 'mr', 'gap', 'ml', '', 'ml', '', '', 'mr', 'ml', 'mr'].forEach((cls, c) => put(c, null, cls));
        return;
      }
      kkLine(l, r, height, bottom, s.estimateHourRate, put, b);
    });

    const f1 = b.row(4.35);
    b.put(f1, 1, KK_NOTE_1, {font: MINCHO, size: 10}, {}, 1, 14);
    b.put(f1, 15, `Ｐ－${pi + 1}`, {font: MINCHO, size: 11}, {}, 1, 3);
    const f2 = b.row(4.84);
    b.put(f2, 1, KK_NOTE_2, {font: MINCHO, size: 10, shrink: true}, {}, 1, 17);
  });

  const name = job.customer.trim();
  return b.sheet({
    name: name ? `${name}様` : '見積書',
    cols: Object.values(KK),
    landscape: true,
    scale: 96, // 列の幅の合計が用紙の幅ちょうどなので、少し縮めて1ページの幅に入れる
    margins: {l: 16, r: 15, t: 16, b: 8, header: 8, footer: 3},
    // 大きさの指定（&9）のすぐあとに数字を書くと大きさの一部になるので、2021.4 の前は空ける
    footer: `&L&9${KK_FOOT[0]}&R&9 ${KK_FOOT[1]}`,
    font: {name: GOTHIC, size: 11},
  });
}

function kkLine(l: FormLine, r: number, height: number, bottom: string, hourRate: number, put: Put, b: SheetBuilder) {
  const open = !l.isWork && l.qty === 0; // 数を入れていない部材：印刷と同じく数量・金額は空
  const target = !l.excluded;
  const q = qty3(l.qty);
  const [F, H, I] = [cellRef(r, 5), cellRef(r, 7), cellRef(r, 8)];
  const photo = circled(l.photo);
  const kind = circled(l.kind);
  const pl = fit(l.placeName, KK.A, height, 11, 2);
  const work = fit(l.work, KK.B, height, 11, 2);
  const ph = fit(photo, KK.K, height, 11);
  const kd = fit(kind, KK.L, height, 11);
  put(0, l.first ? pl.v : null, 'c ml', pl.st);
  put(1, l.first ? work.v : null, 'c', work.st);
  if (l.blank) {
    // 空白の行（何も入っていない部材の行）は、箇所の欄のほかは罫線だけ
    ['', 'mr', 'gap', 'ml', '', '', 'mr', 'gap'].forEach((cls, i) => put(i + 2, null, cls));
    put(10, l.first ? ph.v : null, 'c ml', ph.st);
    put(11, l.first ? kd.v : null, 'c', kd.st);
    ['ml', '', '', 'mr', 'ml', 'mr'].forEach((cls, i) => put(i + 12, null, cls));
    return;
  }
  put(2, l.mark, 'mark', {v: 'bottom'});
  const name = fitted(fitName(l.text, KK.D, height, 9, 3));
  put(3, l.text ? name.v : null, 'mr gothic', name.st);
  put(4, null, 'gap');
  put(5, open ? null : q, 'r ml gothic', count(q, KK.F, height));
  const unit = fit(l.unit, KK.G, height, 11);
  put(6, unit.v, 'gothic', unit.st);
  put(7, l.unitPrice, 'r gothic', money(l.unitPrice, KK.H, height));
  put(8, open ? null : l.amount, 'r mr gothic', money(l.amount, KK.I, height), open ? undefined : amountFormula(q, l.unitPrice, l.amount, F, H));
  put(9, null, 'gap');
  put(10, l.first ? ph.v : null, 'c ml', ph.st);
  put(11, l.first ? kd.v : null, 'c', kd.st);
  // 対象工事部分は左の全改修工事部分と同じ（左を直せば、こちらも変わる）
  put(12, target && !open ? q : null, 'r ml gothic', count(q, KK.M, height), target && !open ? F : undefined);
  const unit2 = fit(l.unit, KK.N, height, 11);
  put(13, target ? unit2.v : null, 'gothic', unit2.st);
  put(14, target ? l.unitPrice : null, 'r gothic', money(l.unitPrice, KK.O, height), target ? H : undefined);
  put(15, target && !open ? l.amount : null, 'r mr gothic', money(l.amount, KK.P, height), target && !open ? I : undefined);
  // 算出根拠：「定価8,000円（税抜）×0.8」。施工費は「1時間2,500円×1.2時間」、切って使う部材は「定価20,000円（4m）×0.8」と「600mm÷4000mm＝0.15」の2行
  const note = lineNote(l, 'kouiki', hourRate);
  const basis = edges(`ml mr${bottom}`, true);
  if (note.length === 1 && l.hourly && l.note === null) {
    const hourly = fit(hourlyBasis(note[0]), KK.Q + KK.R, height, 11, 2);
    b.put(r, 16, hourly.v, {font: MINCHO, h: 'center', ...hourly.st}, basis, 1, 2);
  } else if (note.length > 0) {
    const nt = fitted(fitLines(note, KK.Q + KK.R, height, 10));
    b.put(r, 16, nt.v, {font: GOTHIC, ...nt.st}, basis, 1, 2);
  } else {
    put(16, null, 'ml');
    put(17, null, 'mr');
  }
}

// ================================================================

/**
 * 保存するファイルの名前：「山田花子様住宅改修見積書.xlsx」（ユーザーの指示、2026-10-22。申請書は「…様住宅改修申請書.xlsx」＝`shinseiFileName`）。
 * お客様名のすき間は詰める。書式・作成日は付けない（引数は前の呼び方のまま）
 */
export function estimateFileName(job: Job, _s?: Settings, _date?: string): string {
  return `${customerFilePart(job.customer)}住宅改修見積書.xlsx`;
}

/** 見積書の .xlsx。date は作成日（'YYYY-MM-DD'。空なら作成日の欄は空ける） */
export function estimateXlsx(job: Job, s: Settings, date: string): {bytes: Uint8Array; fileName: string} {
  const form = jobForm(job, s);
  const sheet = form === 'kouiki' ? kouikiSheet(job, s) : yukuhashiSheet(job, s, date);
  return {bytes: writeXlsx([sheet]), fileName: estimateFileName(job, s, date)};
}

// 見積書の Excel（.xlsx）。印刷の EstimateDoc.tsx と同じ中身・同じ形（A4縦1枚）で書く。
// 頭の部分（題名・宛名・ごあいさつ・条件の表／右の会社の枠と所長印・担当印）は印刷と同じ位置（横は mm・縦は pt）に枠を置き、
// その境目と品目の表の列の境目をあわせた行・列を作って、1つの枠は必要なセルをつなげて（結合して）作る。
// 金額・消費税・小計・合計・介護保険の内訳は Excel の計算式（calc.ts と同じ切り捨て・切り上げ）。
// 開いた時点の値は印刷と同じで、Excel で数量や単価を直すと計算し直される。

import {priceNote, saleTotals, taxPct} from '../calc.ts';
import {docLabel} from '../category.ts';
import {insurerLabel} from '../defaults.ts';
import {customerLabel} from '../sales.ts';
import type {Sale, Settings} from '../types.ts';
import {dateLabel, downloadBlob, yen} from '../util.ts';
import {XLSX_MIME, XL_GOTHIC, XL_MINCHO, XL_PT_MM as PT, createXlsxBook, xlLineCount, xlRange, xlRef, xlTextMm} from './xlsxBook.ts';
import type {XlFont, XlStyle, XlValue} from './xlsxBook.ts';

const W = 174; // 本文の幅（A4 の 210mm − 左右の余白 18mm）
const RX = W - 66; // 右の会社の枠（幅 66mm）の左端
const LW = RX - 8; // 左の列の幅（間 8mm）
const C = {
  ink: '29394C', navy: '153F82', blue: '3B82D6', blue2: '1D6DCC', client: '1E293B', suffix: '1B6CB2', lead: '34495D', cond: '334155', condTh: '1A5AA7',
  condLine: 'C5D9ED', condFill: 'E9F4FF', box: 'B9D7F0', boxFill: 'EFF7FF', meta: 'C2D9EC', office: '526174', stamp: 'B9D1E8', line: 'C1D9EF', th: 'DCECFF',
  td: '39495A', product: '263749', sub: '244F91', sum: '1B4E91', sumFill: 'F7FBFF', grandFill: 'EAF3FF', careLine: 'E0ECF8', pay: 'FFF8DB',
};
const M = (sz: number, o: XlFont = {}): XlFont => ({name: XL_MINCHO, sz, color: C.ink, ...o});
const G = (sz: number, o: XlFont = {}): XlFont => ({name: XL_GOTHIC, sz, color: C.ink, ...o});
const B = (col: string) => `thin:${col}`;
const YEN = '"¥"#,##0';

/** 置く枠：横 x1〜x2（mm）、縦 y1〜y2（pt）。値が関数のものは、表を並べてセルの番地が決まってから式を作る */
type El = {x1: number; x2: number; y1: number; y2: number; v: XlValue | (() => XlValue); s: XlStyle};

/** PDF と同じ名前（「御見積書_山田 花子様」）の .xlsx */
export function estimateXlsxName(sale: Sale): string {
  return `御見積書_${customerLabel(sale).replace(/\s+様$/, '様')}.xlsx`.replace(/[\\/:*?"<>|\r\n]/g, '_');
}

/** 見積書の Excel をファイルとして保存する（この端末の中で作り、どこにも送らない） */
export function saveEstimateXlsx(sale: Sale, s: Settings) {
  downloadBlob(new Blob([buildEstimateXlsx(sale, s)], {type: XLSX_MIME}), estimateXlsxName(sale));
}

export function buildEstimateXlsx(sale: Sale, s: Settings): Uint8Array {
  const t = saleTotals(sale, s);
  const head: El[] = [];
  const put = (x1: number, x2: number, y1: number, y2: number, v: El['v'], st: XlStyle) => head.push({x1, x2, y1, y2, v, s: st});

  // ---- 頭・左：題名（字間 0.2em・下線は左の列いっぱい）、宛名＋様、ごあいさつ、条件の表
  // 字間は、全角スペース（BIZ UDP明朝 は 2/3 em）に半角スペースを足して字の位置を印刷に近づける
  put(0, LW, 0, 24 + 4 * PT, '御　 見　 積　 書', {font: M(24, {color: C.navy}), border: {b: `medium:${C.blue}`}, align: {v: 'top'}});
  let ly = 24 + 4 * PT + 1.6 + 6 * PT;
  const name = sale.customer.trim() || '　';
  const nameLines = Math.max(1, Math.ceil((xlTextMm(name + '　', 18) + xlTextMm('様', 12.5)) / (LW * 0.93)));
  put(0, LW, ly, ly + nameLines * 23.4, {rich: [{t: name + '　', font: M(18, {color: C.client})}, {t: '様', font: M(12.5, {color: C.suffix})}]}, {
    font: M(18, {color: C.client}),
    align: {v: 'center', wrap: nameLines > 1},
  });
  ly += nameLines * 23.4;
  put(0, LW, ly, ly + 2.5 * PT, null, {border: {b: B('B7D4ED')}});
  ly += 2.5 * PT + 1 + 4.5 * PT;
  for (const line of ['下記の通り、お見積り申し上げます。', 'ご検討のほど、よろしくお願い申し上げます。']) {
    put(0, LW, ly, ly + 10.5 * 1.75, line, {font: M(10.5, {color: C.lead}), align: {v: 'center'}});
    ly += 10.5 * 1.75;
  }
  ly += 5 * PT;
  for (const [label, value] of [
    ['見積有効期限', s.validity],
    ['お支払条件', s.payment],
    ['納期', s.delivery],
  ]) {
    const n = xlLineCount(value, LW - 27 - 5.2, 9.5);
    const h = Math.max(8 * PT, n * 9.5 * 1.3 + 3.2 * PT);
    const bd = {l: B(C.condLine), r: B(C.condLine), t: B(C.condLine), b: B(C.condLine)};
    put(0, 27, ly, ly + h, label, {font: G(9.5, {color: C.condTh}), fill: C.condFill, border: bd, align: {h: 'left', v: 'center', indent: 1}});
    put(27, LW, ly, ly + h, value, {font: M(9.5, {color: C.cond}), border: bd, align: {h: 'left', v: 'center', wrap: n > 1, indent: 1}});
    ly += h;
  }

  // ---- 頭・右：会社の枠（見積番号・発行日・会社と営業所・住所など・所長印／担当印）
  // 枠の中は薄い青で塗り、左右に罫線。印の行は、印の枠のない所も塗って枠を切らさない
  const fill = C.boxFill;
  const side = {l: B(C.box), r: B(C.box)};
  let ry = 0;
  const gap = (h: number, edge: {t?: string; b?: string} = {}) => {
    put(RX, W, ry, ry + h, null, {fill, border: {...side, ...edge}});
    ry += h;
  };
  const line = (v: XlValue, font: XlFont, h: number) => {
    put(RX, W, ry, ry + h, v, {font, fill, border: side, align: {h: 'left', v: 'center', indent: 1}});
    ry += h;
  };
  gap(3.2 * PT + 1, {t: B(C.box)});
  for (const [label, value] of [
    ['見積番号', sale.quoteNo || '—'],
    ['発行日', dateLabel(sale.estimateDate)],
  ]) {
    const h = 9.2 * 1.3 + 2 * PT;
    put(RX, RX + 3.6 + 18, ry, ry + h, label, {font: G(9, {color: C.blue2}), fill, border: {l: B(C.box), b: B(C.meta)}, align: {h: 'left', v: 'center', indent: 1}});
    put(RX + 3.6 + 18, W, ry, ry + h, value, {font: G(9.2, {color: C.cond}), fill, border: {r: B(C.box), b: B(C.meta)}, align: {h: 'right', v: 'center', indent: 1, shrink: true}});
    ry += h;
  }
  gap(3 * PT);
  line(s.company, G(11, {color: C.navy}), 11 * 1.35);
  line(s.officeName, G(11, {color: C.navy}), 11 * 1.35);
  gap(2 * PT);
  const office = (v: XlValue) => line(v, G(8.6, {color: C.office}), 8.6 * 1.5);
  office(s.postal ? `〒${s.postal.replace(/^〒/, '')}` : '');
  const addrLines = xlLineCount(s.address, 66 - 7.2, 8.6);
  put(RX, W, ry, ry + addrLines * 8.6 * 1.5, s.address, {font: G(8.6, {color: C.office}), fill, border: side, align: {h: 'left', v: 'center', wrap: addrLines > 1, indent: 1}});
  ry += addrLines * 8.6 * 1.5;
  office(`TEL ${s.tel}`);
  office(`FAX ${s.fax}`);
  office({rich: [{t: '登録番号', font: G(8.6, {color: C.blue2})}, {t: ` ${s.regNo}`, font: G(8.6, {color: C.office})}]});
  office('');
  office(`所長　${s.manager}`);
  office(`担当　${sale.staff}`);
  gap(3.5 * PT);
  // 所長印・担当印（14mm 角）。枠の内側の右端（右の余白 3.6mm）に 4mm あけて並べる
  const stampX = [W - 3.6 - 14 - 4 - 14, W - 3.6 - 14];
  const stampRow = (h: number, cell: (x: number, k: number) => {v: XlValue; s: XlStyle}) => {
    const xs = [RX, stampX[0], stampX[0] + 14, stampX[1], stampX[1] + 14, W];
    for (let k = 0; k < 5; k++) {
      const x1 = xs[k];
      const x2 = xs[k + 1];
      const edge = {l: k === 0 ? B(C.box) : undefined, r: k === 4 ? B(C.box) : undefined};
      if (k === 1 || k === 3) {
        const c = cell(x1, (k - 1) / 2);
        put(x1, x2, ry, ry + h, c.v, c.s);
      } else put(x1, x2, ry, ry + h, null, {fill, border: edge});
    }
    ry += h;
  };
  stampRow(8.4 * 1.3, (_, k) => ({v: k === 0 ? '所長印' : '担当印', s: {font: G(8.4, {color: C.blue2}), fill, align: {h: 'center', v: 'center'}}}));
  gap(1 * PT);
  const sq = B(C.stamp);
  stampRow(14 * PT, () => ({v: null, s: {fill: 'FFFFFF', border: {l: sq, r: sq, t: sq, b: sq}}}));
  gap(3.2 * PT + 1, {b: B(C.box)});
  const headH = Math.max(ly, ry, 74 * PT);

  // ---- 列：品目の表の列（印刷の colgroup と同じ割合）を優先し、頭の部分と下の表の境目を足す（2mm より近い境目はまとめる）
  const tx = [0];
  for (const p of [46, 10, 15, 16, 13]) tx.push(tx[tx.length - 1] + (W * p) / 100);
  const careSplit = W - 38; // 介護保険の内訳の金額の列（幅 38mm）
  const careHeadSplit = 2.8 + xlTextMm('介護保険の内訳', 10) + 3;
  const totalSplit = 4 + xlTextMm('御見積金額　合計（税込）', 13) * 1.08 + 4;
  const xs = [...tx];
  for (const v of [...head.flatMap((e) => [e.x1, e.x2]), careSplit, careHeadSplit, totalSplit]) if (!xs.some((u) => Math.abs(u - v) < 2)) xs.push(v);
  xs.sort((a, b) => a - b);
  const nearest = (list: number[], v: number) => list.reduce((best, u, i) => (Math.abs(u - v) < Math.abs(list[best] - v) ? i : best), 0);
  const span = (x1: number, x2: number): [number, number] => {
    const c1 = nearest(xs, x1);
    return [c1, Math.max(c1, nearest(xs, x2) - 1)];
  };
  const last = xs.length - 2;

  const book = createXlsxBook();
  // 印刷は A4縦1枚（はみ出した分は切れる）。Excel では1枚に縮めて収める
  const ws = book.addSheet('御見積書', {margins: {l: 18, r: 18, t: 15, b: 14, h: 5, f: 5}, fitWidth: 1, fitHeight: 1});
  ws.setCols(xs.slice(1).map((v, i) => v - xs[i]));
  // 頭の部分：縦の境目で行に分ける（計算の端数でできるごく低い行は作らない。枠はどれも 0.3pt より高い）
  const ys = [0, headH];
  for (const e of head) for (const v of [e.y1, e.y2]) if (!ys.some((u) => Math.abs(u - v) < 0.3)) ys.push(v);
  ys.sort((a, b) => a - b);
  ys.slice(1).forEach((v, i) => ws.height(i, v - ys[i]));
  let r = ys.length - 1;
  const space = (pt: number) => {
    ws.height(r, pt);
    r++;
  };
  const cells = (k1: number, k2: number) => span(tx[k1], tx[k2 + 1]);

  // ---- 御見積金額　合計（税込）。式は品目の表を書いたあとで入れる
  space(7 * PT);
  const totalRow = r;
  space(15 * PT);
  space(5 * PT);
  // ---- 種目の見出しと品目の表
  ws.box(r, 0, r, last, '特定福祉用具（介護保険）', {font: G(11, {color: C.navy}), fill: C.boxFill, border: {l: B(C.line), r: B(C.line), t: B(C.line)}, align: {h: 'left', v: 'center', indent: 1}});
  space(7.5 * PT);
  const all = {l: B(C.line), r: B(C.line), t: B(C.line), b: B(C.line)};
  ['品目', '数量', '単価（税抜）', '金額（税抜）', '消費税'].forEach((h, k) => {
    const [c1, c2] = cells(k, k);
    ws.box(r, c1, r, c2, h, {font: G(10, {color: C.navy}), fill: C.th, border: all, align: {h: 'center', v: 'center'}});
  });
  space(8 * PT);
  const first = r;
  const qCol = cells(1, 1)[0];
  const pCol = cells(2, 2)[0];
  const aCol = cells(3, 3)[0];
  const tCol = cells(4, 4)[0];
  const numSt = (o: XlStyle = {}): XlStyle => ({font: M(10, {color: C.td}), border: all, align: {h: 'right', v: 'center', indent: 1, shrink: true}, ...o});
  for (const l of t.lines) {
    const i = l.item;
    const code = i.code && !i.name.includes(i.code) ? ` / ${i.code}` : '';
    const product = `${i.name}${code}`;
    const sub = [docLabel(i.category, i.sub), i.maker, priceNote(l)].filter(Boolean).join(' / ');
    const nameW = tx[1] - tx[0] - 3.6;
    const h = 4 * PT + xlLineCount(product, nameW, 10.5) * 10.5 * 1.35 + (sub ? 1.2 * PT + xlLineCount(sub, nameW - 2, 8.6) * 8.6 * 1.35 : 0) + 1;
    const [n1, n2] = cells(0, 0);
    ws.box(r, n1, r, n2, sub ? {rich: [{t: product, font: M(10.5, {color: C.product})}, {t: `\n${sub}`, font: M(8.6, {color: C.sub})}]} : product, {
      font: M(10.5, {color: C.product}),
      border: all,
      align: {h: 'left', v: 'top', wrap: true, indent: 1},
    });
    // 数量（単位つきの表示。計算は calc.ts と同じく小数第2位まで）
    const unit = i.unit.replace(/["\\]/g, '');
    const [q1, q2] = cells(1, 1);
    ws.box(r, q1, r, q2, Math.max(0, Math.round(i.qty * 100) / 100), numSt({fmt: unit ? `#,##0"${unit}"` : '#,##0'}));
    const [p1, p2] = cells(2, 2);
    ws.box(r, p1, r, p2, l.unitPrice, numSt({fmt: YEN}));
    // 金額＝販売単価×数量（1円未満切り捨て）、消費税＝金額×税率（行ごとに切り捨て）。非課税は 0 を「非課税」と見せる
    const [a1, a2] = cells(3, 3);
    ws.box(r, a1, r, a2, {f: `INT(ROUND(${xlRef(r, pCol)}*${xlRef(r, qCol)},2))`, v: l.amount}, numSt({fmt: YEN}));
    const pct = taxPct(i.taxType);
    const [t1, t2] = cells(4, 4);
    ws.box(r, t1, r, t2, pct ? {f: `INT(${xlRef(r, aCol)}*${pct}/100)`, v: l.tax} : 0, numSt({fmt: pct ? YEN : '"非課税";"非課税";"非課税"'}));
    ws.height(r, h);
    r++;
  }
  const amtRange = r > first ? xlRange(first, aCol, r - 1, aCol) : '';
  const taxRange = r > first ? xlRange(first, tCol, r - 1, tCol) : '';
  const AMT = amtRange ? `SUM(${amtRange})` : '0';
  const TAX = taxRange ? `SUM(${taxRange})` : '0';
  space(3.5 * PT);
  // 小計（税抜）・消費税・合計（税込）：印刷と同じく「見出し　¥金額」を右に寄せた1つの欄
  const sums: [string, string, number, boolean][] = [
    ['小計（税抜）', AMT, t.amount, false],
    ['消費税', TAX, t.tax, false],
    ['合計（税込）', `${AMT}+${TAX}`, t.total, true],
  ];
  for (const [label, expr, v, grand] of sums) {
    const [c1] = cells(1, 1);
    ws.box(r, c1, r, last, {f: `"${label}　¥"&TEXT(${expr},"#,##0")`, v: `${label}　¥${yen(v)}`}, {
      font: M(grand ? 11 : 10, {color: C.sum}),
      fill: grand ? C.grandFill : C.sumFill,
      border: all,
      align: {h: 'right', v: 'center', indent: 1, shrink: true},
    });
    space(8 * PT);
  }
  // 御見積金額（帯）
  const BT = `medium:${C.blue}`;
  const [l1, l2] = span(0, totalSplit);
  const [v1, v2] = span(totalSplit, W);
  ws.box(totalRow, l1, totalRow, l2, '御見積金額　合計（税込）', {font: G(13, {color: C.navy}), fill: C.boxFill, border: {l: BT, t: BT, b: BT}, align: {h: 'left', v: 'center', indent: 1}});
  ws.box(totalRow, v1, totalRow, v2, {f: `${AMT}+${TAX}`, v: t.total}, {
    font: M(19, {color: C.navy}),
    fill: C.boxFill,
    fmt: `"¥"#,##0" —"`,
    border: {r: BT, t: BT, b: BT},
    align: {h: 'right', v: 'center', indent: 1, shrink: true},
  });

  // ---- 介護保険の内訳（calc.ts の saleTotals と同じ計算を式で書く）
  space(6 * PT);
  const insurer = insurerLabel(sale.insurer, sale.insurerName);
  const repaid = sale.payMethod === '償還払い';
  const [h1, h2] = span(0, careHeadSplit);
  const [h3, h4] = span(careHeadSplit, W);
  const careHead = {font: G(10, {color: C.blue2}), fill: C.boxFill};
  ws.box(r, h1, r, h2, '介護保険の内訳', {...careHead, border: {l: B(C.line), t: B(C.line), b: B(C.line)}, align: {h: 'left', v: 'center', indent: 1}});
  ws.box(r, h3, r, h4, `${insurer ? `保険者：${insurer}　` : ''}${t.ratio}割負担　${sale.payMethod}`, {
    ...careHead,
    border: {r: B(C.line), t: B(C.line), b: B(C.line)},
    align: {h: 'right', v: 'center', indent: 1, shrink: true},
  });
  space(10 * 1.3 + 4 * PT);
  const totalRef = xlRef(r, span(careSplit, W)[0]);
  const COV = `MIN(${totalRef},${t.remaining})`; // 介護保険の対象＝購入金額と今年度の残りの小さい方
  const EXC = `(${totalRef}-${COV})`; // 残りを超えた分
  // 負担割合の分（切り上げ）。個別切り上げは、超えた分がなく、金額のある明細が2つ以上のときだけ品目ごとに切り上げる
  const whole = `CEILING(${COV}*${t.ratio}/10,1)`;
  const SHARE =
    sale.perItem && amtRange
      ? `IF(AND(${EXC}=0,COUNTIF(${amtRange},">0")>=2),SUMPRODUCT(CEILING((${amtRange}+${taxRange})*${t.ratio}/10,1)),${whole})`
      : whole;
  const USER = sale.welfare ? '0' : SHARE;
  const rows: [string, string, number][] = [['購入金額（10割・税込）', `${AMT}+${TAX}`, t.total]];
  if (t.excess > 0) rows.push([`介護保険の対象（年間の限度額 ${yen(t.limit)}円まで）`, COV, t.covered]);
  rows.push([`利用者負担額（${t.ratio}割・税込）`, USER, t.userBurden]);
  if (t.aid > 0) rows.push([`介護扶助（${t.ratio}割）`, SHARE, t.aid]);
  rows.push([`保険者負担額（${10 - t.ratio}割・税込）`, `MAX(0,${COV}-${SHARE})`, t.insurerBurden]);
  if (t.excess > 0) rows.push(['限度額を超えた分（全額ご負担）', EXC, t.excess]);
  rows.push([
    repaid ? 'お支払いいただく金額（いったん全額）' : 'お支払いいただく金額',
    repaid ? totalRef : sale.welfare ? EXC : `${USER}+${EXC}`,
    repaid ? t.total : t.userPay,
  ]);
  if (repaid) rows.push(['あとで保険者から払い戻される金額', `MAX(0,${COV}-${SHARE})`, t.insurerBurden]);
  const payRow = repaid ? rows.length - 2 : rows.length - 1;
  const [c1, c2] = span(0, careSplit);
  const [c3, c4] = span(careSplit, W);
  rows.forEach(([label, expr, v], k) => {
    const pay = k === payRow;
    const font = M(pay ? 11.5 : 10, {color: pay ? C.navy : C.ink});
    const top = k === 0 ? undefined : B(C.careLine);
    const bot = k === rows.length - 1 ? B(C.line) : undefined;
    ws.box(r, c1, r, c2, label, {font, fill: pay ? C.pay : undefined, border: {l: B(C.line), t: top, b: bot}, align: {h: 'left', v: 'center', indent: 1}});
    ws.box(r, c3, r, c4, {f: expr, v}, {font, fill: pay ? C.pay : undefined, fmt: YEN, border: {r: B(C.line), t: top, b: bot}, align: {h: 'right', v: 'center', indent: 1, shrink: true}});
    space(7.5 * PT);
  });

  // ---- 備考（1行ずつ別の行にして、行の間隔を印刷とそろえる）
  space(6 * PT);
  ws.box(r, 0, r, last, '備考', {font: G(10, {color: C.blue2}), fill: C.boxFill, border: all, align: {h: 'left', v: 'center', indent: 1}});
  space(10 * 1.3 + 3.6 * PT);
  const remarks = [s.remarks, sale.note].map((x) => x.trim()).filter(Boolean).join('\n');
  const bodyLines = remarks ? remarks.split('\n') : [];
  const sideOnly = {l: B(C.line), r: B(C.line)};
  ws.box(r, 0, r, last, null, {border: sideOnly});
  space(2 * PT);
  let bodyH = 0;
  for (const text of bodyLines) {
    const n = xlLineCount(text, W - 5.6, 9.6);
    ws.box(r, 0, r, last, text, {font: M(9.6, {color: C.td}), border: sideOnly, align: {h: 'left', v: 'center', wrap: n > 1, indent: 1}});
    space(n * 9.6 * 1.5);
    bodyH += n * 9.6 * 1.5;
  }
  ws.box(r, 0, r, last, null, {border: {...sideOnly, b: B(C.line)}});
  space(Math.max(2 * PT, 12 * PT - 2 * PT - bodyH)); // 備考の欄は 12mm より低くしない

  // 頭の部分を置く
  for (const e of head) {
    const [x1, x2] = span(e.x1, e.x2);
    const r1 = nearest(ys, e.y1);
    const r2 = Math.max(r1, nearest(ys, e.y2) - 1);
    ws.box(r1, x1, r2, x2, typeof e.v === 'function' ? e.v() : e.v, e.s);
  }
  ws.page.printArea = [0, 0, r - 1, last];
  return book.toBytes('御見積書');
}

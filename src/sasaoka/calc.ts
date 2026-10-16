// 金額の計算。元の「笹岡工務店仕切り計算表」の①〜⑦と同じ式を使う。
//   ① 部材代合計（元の表の「商品代金合計」）
//   ② 取付手間合計（元の表の「施工費合計」）
//   ③ 部材上乗せ ＝ ①×0.07（元の表の「商品代×0.07」）
//   ④ 諸経費 ＝（①＋②＋③）×0.07
//   ⑤ 消費税 ＝ ⑦×0.1－1（元の表の式。設定で切り捨てなどにも変えられる）
//   ⑥ 合計 ＝ ①＋②＋③＋④＋⑤
//   ⑦ 税抜合計 ＝ ①＋②＋③＋④
// 請求書に並べる数字が縦にも横にも合うよう、③④⑤はそれぞれ1円単位にしてから足す
// （Excelは小数のまま持って表示だけ丸めるので、まれに1円ずれることがある）。

import type {InvoiceTaxMode, Job, Place, Row, Settings, TaxMode} from './types.ts';

/** 掛け算の浮動小数の誤差（78150×0.07＝5470.500000000001 など）を取り除く */
function clean(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** 1円単位に四捨五入（Excelの表示と同じく、0.5は0から遠い方へ） */
export function roundYen(x: number): number {
  const v = clean(x);
  return v >= 0 ? Math.floor(v + 0.5) : -Math.floor(-v + 0.5);
}

export function taxAmount(subtotal: number, taxRate: number, mode: TaxMode): number {
  const raw = clean(subtotal * taxRate);
  switch (mode) {
    case 'floor':
      return raw >= 0 ? Math.floor(raw) : -Math.floor(-raw);
    case 'ceil':
      return raw >= 0 ? Math.ceil(raw) : -Math.ceil(-raw);
    case 'round':
      return roundYen(raw);
    case 'original':
    default:
      // 元の表の⑤：(①＋②＋③＋④)×0.1－1。何も入っていない様邸は 0円のまま（－1円にしない）
      return subtotal > 0 ? roundYen(raw) - 1 : roundYen(raw);
  }
}

export function rowAmount(row: Pick<Row, 'price' | 'qty'>): number {
  const price = Number.isFinite(row.price) ? row.price : 0;
  const qty = Number.isFinite(row.qty) ? row.qty : 0;
  return roundYen(price * qty);
}

export type PlaceTotals = {material: number; labor: number; total: number};

export function placeTotals(place: Pick<Place, 'rows'>): PlaceTotals {
  let material = 0;
  let labor = 0;
  for (const r of place.rows) {
    if (r.kind === 'labor') labor += rowAmount(r);
    else material += rowAmount(r);
  }
  return {material, labor, total: material + labor};
}

export type JobTotals = {
  material: number; // ①
  labor: number; // ②
  markup: number; // ③
  overhead: number; // ④
  subtotal: number; // ⑦
  tax: number; // ⑤
  total: number; // ⑥
};

export type CalcSettings = Pick<Settings, 'rate' | 'taxRate' | 'taxMode'>;

export function jobTotals(job: Pick<Job, 'places'>, s: CalcSettings): JobTotals {
  let material = 0;
  let labor = 0;
  for (const p of job.places) {
    const t = placeTotals(p);
    material += t.material;
    labor += t.labor;
  }
  const markup = roundYen(material * s.rate);
  const overhead = roundYen((material + labor + markup) * s.rate);
  const subtotal = material + labor + markup + overhead;
  const tax = taxAmount(subtotal, s.taxRate, s.taxMode);
  return {material, labor, markup, overhead, subtotal, tax, total: subtotal + tax};
}

export const ZERO_TOTALS: JobTotals = {material: 0, labor: 0, markup: 0, overhead: 0, subtotal: 0, tax: 0, total: 0};

export function addTotals(a: JobTotals, b: JobTotals): JobTotals {
  return {
    material: a.material + b.material,
    labor: a.labor + b.labor,
    markup: a.markup + b.markup,
    overhead: a.overhead + b.overhead,
    subtotal: a.subtotal + b.subtotal,
    tax: a.tax + b.tax,
    total: a.total + b.total,
  };
}

/** 施工日の早い順（施工日のないものは後ろ）、同じなら作った順 */
export function sortJobs<T extends Pick<Job, 'date' | 'createdAt'>>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.createdAt - b.createdAt;
  });
}

export type MonthSummary = {
  rows: {job: Job; totals: JobTotals}[];
  sum: JobTotals; // 様邸ごとの金額を列ごとに足したもの
  invoice: {subtotal: number; tax: number; total: number; mode: InvoiceTaxMode};
};

export function monthSummary(jobs: Job[], s: CalcSettings & Pick<Settings, 'invoiceTaxMode'>): MonthSummary {
  const rows = sortJobs(jobs).map((job) => ({job, totals: jobTotals(job, s)}));
  const sum = rows.reduce((acc, r) => addTotals(acc, r.totals), ZERO_TOTALS);
  if (s.invoiceTaxMode === 'monthly') {
    const tax = taxAmount(sum.subtotal, s.taxRate, s.taxMode);
    return {rows, sum, invoice: {subtotal: sum.subtotal, tax, total: sum.subtotal + tax, mode: 'monthly'}};
  }
  return {rows, sum, invoice: {subtotal: sum.subtotal, tax: sum.tax, total: sum.total, mode: 'perJob'}};
}

export function jobName(job: Pick<Job, 'customer' | 'suffix'>): string {
  const name = job.customer.trim();
  if (!name) return '（お客様名未入力）';
  return job.suffix && !name.endsWith(job.suffix) ? name + job.suffix : name;
}

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
// 請求書（1か月分）の消費税は、最初は「すべての様邸の税抜合計×消費税率」を1回だけ計算する。

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

export function monthSummary(jobs: Job[], s: CalcSettings & Pick<Settings, 'invoiceTaxMode' | 'totalTaxRounding'>): MonthSummary {
  const rows = sortJobs(jobs).map((job) => ({job, totals: jobTotals(job, s)}));
  const sum = rows.reduce((acc, r) => addTotals(acc, r.totals), ZERO_TOTALS);
  if (s.invoiceTaxMode === 'monthly') {
    // すべての様邸を合計した税抜の金額に、最後に消費税率をかける
    const tax = taxAmount(sum.subtotal, s.taxRate, s.totalTaxRounding);
    return {rows, sum, invoice: {subtotal: sum.subtotal, tax, total: sum.subtotal + tax, mode: 'monthly'}};
  }
  return {rows, sum, invoice: {subtotal: sum.subtotal, tax: sum.tax, total: sum.total, mode: 'perJob'}};
}

export function jobName(job: Pick<Job, 'customer' | 'suffix'>): string {
  const name = job.customer.trim();
  if (!name) return '（お客様名未入力）';
  return job.suffix && !name.endsWith(job.suffix) ? name + job.suffix : name;
}

// ---------------------------------------------------------------- 見積書
// 元の見積書（行橋市・苅田町用、みやこ町・築上町用）と同じく、金額はすべて ROUNDDOWN（1円未満を切り捨て）。
// 部材の単価 ＝ 定価×掛率（0.8）。規格品をそのまま使うときは 数量＝本数（1本4mの手すりなら1本）。
// 切って使うとき（使う長さを入れた部材）は 数量＝使う長さ÷1本の長さ。
//   例：定価 20,000円（1本4m）を60cm使う → 0.6÷4＝0.15本、単価 16,000円、金額 16,000×0.15＝2,400円
// 取付手間は、部材のすぐ下に続く手間の行を足して「同上施工費」の1行にする（例：木 2箇所 ＝ 2,000円）。
//   小計 ＝ 部材＋施工費、諸経費 ＝ 小計×0.1、消費税 ＝（小計＋諸経費）×0.1、合計 ＝ 小計＋諸経費＋消費税
//   諸経費は見積ごとに手で直せる（端数の調整など）。笹岡工務店の仕切り計算表の④諸経費は一律の式のまま。
// 介護保険の対象外にした行は「全体」にだけ入り、「介護保険の対象」には入らない。

/** ROUNDDOWN（0の方へ1円未満を切り捨て） */
export function rounddown(x: number): number {
  const v = clean(x);
  return v >= 0 ? Math.floor(v) : -Math.floor(-v);
}

export type EstimateSettings = Pick<Settings, 'estimateRate' | 'estimateOverheadRate' | 'taxRate'>;

/** 見積の単価（定価×掛率の1円未満は切り捨て）。手で入れた単価があればそれを使う。手間は取付手間の単価のまま */
export function estimateUnitPrice(row: Row, rate: number): number {
  if (row.kind === 'labor') return Number.isFinite(row.price) ? row.price : 0;
  if (row.estPrice !== null && Number.isFinite(row.estPrice)) return row.estPrice;
  const list = Number.isFinite(row.listPrice) ? row.listPrice : 0;
  return rounddown(list * rate);
}

/** 長さで数える部材か（使う長さと1本の長さの両方が入っている） */
export function cutToLength(row: Pick<Row, 'kind' | 'lengthCm' | 'pieceLengthM'>): boolean {
  return row.kind === 'material' && row.lengthCm > 0 && row.pieceLengthM > 0;
}

/** 見積の数量：切って使う部材は 使う長さ÷1本の長さ×本数（例：60cm÷4m＝0.15本）。それ以外は数量のまま */
export function estimateQty(row: Row): number {
  const qty = Number.isFinite(row.qty) ? row.qty : 0;
  return cutToLength(row) ? clean((qty * row.lengthCm) / 100 / row.pieceLengthM) : qty;
}

/** 見積の金額 ＝ ROUNDDOWN(数量×単価)。割り切れない数量（1m÷3m など）は丸める前の数量で計算する */
export function estimateAmount(row: Row, rate: number): number {
  const unit = estimateUnitPrice(row, rate);
  const qty = Number.isFinite(row.qty) ? row.qty : 0;
  return rounddown(cutToLength(row) ? (unit * qty * row.lengthCm) / 100 / row.pieceLengthM : unit * qty);
}

export type EstimateLine =
  | {kind: 'material'; row: Row; unitPrice: number; qty: number; amount: number; excluded: boolean}
  // 続けて並んだ手間の行をまとめたもの。部材のすぐ下なら「同上施工費」（対象外かどうかは部材に合わせる）、箇所の最初なら「施工費」。
  // 金額は取付手間の合計。見積書で金額を手で直していれば（最初の手間の行の estAmount）その金額。owner は上の部材の行
  | {kind: 'work'; rows: Row[]; amount: number; sum: number; afterMaterial: boolean; excluded: boolean; owner: Row | null};

export function estimatePlaceLines(place: Pick<Place, 'rows'>, rate: number): EstimateLine[] {
  const out: EstimateLine[] = [];
  for (const r of place.rows) {
    if (r.kind === 'material') {
      out.push({kind: 'material', row: r, unitPrice: estimateUnitPrice(r, rate), qty: estimateQty(r), amount: estimateAmount(r, rate), excluded: r.excluded});
      continue;
    }
    const amount = estimateAmount(r, rate);
    const last = out[out.length - 1];
    if (last && last.kind === 'work') {
      last.rows.push(r);
      last.sum += amount;
      if (!last.afterMaterial) last.excluded = last.excluded && r.excluded;
    } else if (last && last.kind === 'material') {
      out.push({kind: 'work', rows: [r], amount, sum: amount, afterMaterial: true, excluded: last.excluded, owner: last.row});
    } else out.push({kind: 'work', rows: [r], amount, sum: amount, afterMaterial: false, excluded: r.excluded, owner: null});
  }
  for (const l of out) if (l.kind === 'work') l.amount = l.rows[0].estAmount ?? l.sum;
  return out;
}

/** 小計から諸経費・消費税・合計を出す。overhead を渡すと、その金額を諸経費にする（手で直したとき） */
export type EstimateSums = {subtotal: number; overhead: number; tax: number; total: number};

export function estimateSums(subtotal: number, s: Pick<Settings, 'estimateOverheadRate' | 'taxRate'>, overhead: number | null = null): EstimateSums {
  const o = overhead ?? overheadAuto(subtotal, s);
  const tax = rounddown((subtotal + o) * s.taxRate);
  return {subtotal, overhead: o, tax, total: subtotal + o + tax};
}

/** 諸経費（手で直していないとき）＝ 小計×率 */
export function overheadAuto(subtotal: number, s: Pick<Settings, 'estimateOverheadRate'>): number {
  return rounddown(subtotal * s.estimateOverheadRate);
}

export type EstimateTotals = {
  material: number; // 部材（定価×掛率）
  work: number; // 施工費
  all: EstimateSums; // 全体（見積書の「金額」「全改修工事部分」）
  target: EstimateSums; // 介護保険の対象（「介護保険対象部分」「対象工事部分」）
  excluded: number; // 介護保険の対象外の金額（小計）
};

/**
 * 見積の合計。諸経費を手で直してあればその金額（対象外の行がなければ、全体と介護保険の対象は同じ金額）。
 * 対象外の行があるときの介護保険の対象の諸経費は overheadTarget（なければ 対象の小計×率）
 */
export function estimateTotals(
  job: Pick<Job, 'places'> & Partial<Pick<Job, 'overhead' | 'overheadTarget'>>,
  s: EstimateSettings,
): EstimateTotals {
  let material = 0;
  let work = 0;
  let excluded = 0;
  for (const p of job.places) {
    for (const l of estimatePlaceLines(p, s.estimateRate)) {
      if (l.kind === 'material') material += l.amount;
      else work += l.amount;
      if (l.excluded) excluded += l.amount;
    }
  }
  const subtotal = material + work;
  const all = estimateSums(subtotal, s, job.overhead ?? null);
  const target = excluded === 0 ? {...all} : estimateSums(subtotal - excluded, s, job.overheadTarget ?? null);
  return {material, work, all, target, excluded};
}

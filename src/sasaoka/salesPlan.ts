// 売上見込み（タブ「📈 売上見込みを確認する」。ユーザーの指示「請求書を作成するの横に、売上見込みを確認するとつくる。開くと住宅改修と特定福祉用具を別々に、
// その次の売上を集計、確認できるようにする。（税抜、税込）当然印刷も。☑︎して次月に回せるようにもする」2026-10-25）。
// 住宅改修：見積書のある様邸（見積書の金額。税抜＝小計＋諸経費、税込＝合計）。月は売上見込みの月（Job.salesMonth。なければ請求する月）。
// 特定福祉用具：特定福祉用具のアプリ（太陽ポータルの tokutei/）が、同じサイトの localStorage（taiyo-tokutei-sales-v1）に書いた案件ごとの金額のまとめを読む
// （特定福祉用具の src/tokutei/salesSummary.ts。2つのアプリはデータを分けているので、特定福祉用具のデータは書きかえない。次月に回した月はこのアプリの設定に持つ）。
import {estimateTotals, hasEstimateRows, jobName} from './calc.ts';
import type {EstimateSettings} from './calc.ts';
import type {Job, Settings} from './types.ts';

export const TOKUTEI_SALES_KEY = 'taiyo-tokutei-sales-v1';

/** 売上見込みの1行 */
export type PlanRow = {
  kind: 'jutaku' | 'tokutei';
  id: string; // 様邸の id か、特定福祉用具の案件の id
  name: string; // 「山田 花子様邸」「山田 花子様」
  month: string; // 売上見込みの月 'YYYY-MM'
  amount: number; // 税抜
  tax: number;
  total: number; // 税込
  status: string; // 特定福祉用具の状態（見積・申請・承認・納品・集金）。住宅改修は空
  staff: string;
  jobId: string; // 開く様邸（住宅改修はその様邸、特定福祉用具は住宅改修の様邸から作った案件ならその様邸。なければ空）
};

/** 特定福祉用具のアプリが書いたまとめの1件（salesSummary.ts の SalesSummaryRow のうち使うもの） */
export type TokuteiSale = {id: string; customer: string; jutakuJob: string; staff: string; status: string; month: string; amount: number; tax: number; total: number};

const MONTH = /^\d{4}-\d{2}$/;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** 住宅改修の様邸の売上見込みの月 */
export const jutakuSalesMonth = (job: Pick<Job, 'month' | 'salesMonth'>) => (job.salesMonth && MONTH.test(job.salesMonth) ? job.salesMonth : job.month);

/** 特定福祉用具のまとめを読む（こわれていれば空） */
export function readTokuteiSales(raw: string | null): {rows: TokuteiSale[]; updatedAt: number} {
  try {
    const d: unknown = JSON.parse(raw ?? '');
    if (typeof d !== 'object' || d === null || !Array.isArray((d as {rows?: unknown}).rows)) return {rows: [], updatedAt: 0};
    const rows = ((d as {rows: unknown[]}).rows.filter((r) => typeof r === 'object' && r !== null) as Record<string, unknown>[])
      .map((r) => ({
        id: str(r.id),
        customer: str(r.customer).trim(),
        jutakuJob: str(r.jutakuJob),
        staff: str(r.staff),
        status: str(r.status),
        month: MONTH.test(str(r.month)) ? str(r.month) : '',
        amount: num(r.amount),
        tax: num(r.tax),
        total: num(r.total),
      }))
      .filter((r) => r.id && r.month);
    return {rows, updatedAt: num((d as {updatedAt?: unknown}).updatedAt)};
  } catch {
    return {rows: [], updatedAt: 0};
  }
}

/** 売上見込みの行（住宅改修は見積書のある様邸、特定福祉用具はまとめの案件。月はすべて） */
export function planRows(jobs: Job[], s: EstimateSettings & Pick<Settings, 'tokuteiSalesMonths'>, tokutei: TokuteiSale[]): PlanRow[] {
  const jutaku = jobs
    .filter((j) => hasEstimateRows(j))
    .map((j): PlanRow => {
      const t = estimateTotals(j, s).all;
      return {kind: 'jutaku', id: j.id, name: jobName(j), month: jutakuSalesMonth(j), amount: t.subtotal + t.overhead, tax: t.tax, total: t.total, status: '', staff: j.staff, jobId: j.id};
    });
  const ids = new Set(jobs.map((j) => j.id));
  const toku = tokutei.map(
    (r): PlanRow => ({
      kind: 'tokutei',
      id: r.id,
      name: `${r.customer || '（お客様名未入力）'}様`,
      month: MONTH.test(s.tokuteiSalesMonths[r.id] ?? '') ? s.tokuteiSalesMonths[r.id] : r.month,
      amount: r.amount,
      tax: r.tax,
      total: r.total,
      status: r.status,
      staff: r.staff,
      jobId: r.jutakuJob && ids.has(r.jutakuJob) ? r.jutakuJob : '',
    }),
  );
  return [...jutaku, ...toku];
}

export type PlanSums = {count: number; amount: number; tax: number; total: number};
const sum = (rows: PlanRow[]): PlanSums => rows.reduce((a, r) => ({count: a.count + 1, amount: a.amount + r.amount, tax: a.tax + r.tax, total: a.total + r.total}), {count: 0, amount: 0, tax: 0, total: 0});

export type MonthPlan = {jutaku: PlanRow[]; tokutei: PlanRow[]; jutakuSum: PlanSums; tokuteiSum: PlanSums; all: PlanSums};

/** その月の住宅改修・特定福祉用具の行と、それぞれの合計・全体の合計 */
export function monthPlan(rows: PlanRow[], month: string): MonthPlan {
  const jutaku = rows.filter((r) => r.kind === 'jutaku' && r.month === month).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const tokutei = rows.filter((r) => r.kind === 'tokutei' && r.month === month).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return {jutaku, tokutei, jutakuSum: sum(jutaku), tokuteiSum: sum(tokutei), all: sum([...jutaku, ...tokutei])};
}

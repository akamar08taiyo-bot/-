// 売上見込み（タブ「📈 売上見込みを確認する」。ユーザーの指示「請求書を作成するの横に、売上見込みを確認するとつくる。開くと住宅改修と特定福祉用具を別々に、
// その次の売上を集計、確認できるようにする。（税抜、税込）当然印刷も。☑︎して次月に回せるようにもする」2026-10-25）。
// 住宅改修：見積書のある様邸（見積書の金額。税抜＝小計＋諸経費、税込＝合計）。月は売上見込みの月（Job.salesMonth。なければ請求する月）。
// 特定福祉用具：特定福祉用具のアプリ（太陽ポータルの tokutei/）が、同じサイトの localStorage（taiyo-tokutei-sales-v1）に書いた案件ごとの金額のまとめを読む
// （特定福祉用具の src/tokutei/salesSummary.ts。2つのアプリはデータを分けているので、特定福祉用具のデータは書きかえない。次月に回した月はこのアプリの設定に持つ）。
import {estimateTotals, hasEstimateRows, jobName} from './calc.ts';
import type {EstimateSettings} from './calc.ts';
import type {Job, Settings} from './types.ts';
import {addMonths} from './util.ts';

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

/** 住宅改修の様邸の売上見込みの月（売上月） */
export const jutakuSalesMonth = (job: Pick<Job, 'month' | 'salesMonth'>) => (job.salesMonth && MONTH.test(job.salesMonth) ? job.salesMonth : job.month);

/**
 * 売上月を m にした様邸。請求する月と同じなら持たない（ユーザーの話「請求月と販売月は基本的には同じです。まれに違うことがあります」2026-10-26。
 * 持たなければ売上月は請求する月で、請求する月を変えると一緒に変わる。ちがう月にしたときだけ持つ）
 */
export const withSalesMonth = <J extends Pick<Job, 'month' | 'salesMonth'>>(job: J, m: string): J => ({...job, salesMonth: m && m !== job.month ? m : undefined});
/** 請求する月を m にした様邸：売上月が請求する月と同じ（持たない）なら一緒に変わり、ちがう月にしてあればその月のまま（同じ月になったら持たない） */
export const withBillMonth = <J extends Pick<Job, 'month' | 'salesMonth'>>(job: J, m: string): J => {
  const next = {...job, month: m};
  return job.salesMonth && MONTH.test(job.salesMonth) ? withSalesMonth(next, job.salesMonth) : {...next, salesMonth: undefined};
};

/** 特定福祉用具の案件の売上の月（このアプリで月を変えたときはその月。受注残にもこの月で入る） */
export const tokuteiSalesMonth = (r: Pick<TokuteiSale, 'id' | 'month'>, s: Pick<Settings, 'tokuteiSalesMonths'>) => (MONTH.test(s.tokuteiSalesMonths[r.id] ?? '') ? s.tokuteiSalesMonths[r.id] : r.month);

/**
 * 見積もり・申請書の一覧の行の「売上月」（ユーザーの指示「見積もり作成日と、請求月というか販売月というか工事が発生する月っていうのは大きく異なります。
 * 10月末に見積もり作った分は、でも11月に売り上げになることがありますので、何月分かっていうのを簡単に切り替えができるように」2026-10-26）。
 * 住宅改修の見積書があるか、特定福祉用具の案件がない様邸は、様邸の売上見込みの月。特定福祉用具だけの様邸は、その案件の月
 */
export function rowSalesMonth(job: Pick<Job, 'id' | 'month' | 'salesMonth' | 'places'>, tokutei: TokuteiSale[], s: Pick<Settings, 'tokuteiSalesMonths'>): string {
  const linked = tokutei.filter((r) => r.jutakuJob === job.id);
  if (hasEstimateRows(job) || linked.length === 0) return jutakuSalesMonth(job);
  return tokuteiSalesMonth(linked[0], s);
}

/**
 * 売上月を dir か月ずらす：様邸の月（一覧の月・請求する月）と売上月を一緒に動かし（売上月を請求する月とちがう月にしてあれば、そのちがいのまま）、
 * この様邸の特定福祉用具の案件の月も新しい売上月にする（受注残・売上見込み・請求書が一緒に移る）。特定福祉用具だけの様邸は、その案件の月に様邸の月をそろえる。
 * 返すのは直した様邸と、特定福祉用具の案件の月（設定の tokuteiSalesMonths に足す分）
 */
export function shiftSalesMonth(job: Job, tokutei: TokuteiSale[], s: Pick<Settings, 'tokuteiSalesMonths'>, dir: number, now = Date.now()): {job: Job; tokuteiMonths: Record<string, string>} {
  const next = addMonths(rowSalesMonth(job, tokutei, s), dir);
  const linked = tokutei.filter((r) => r.jutakuJob === job.id);
  const tokuteiMonths = Object.fromEntries(linked.map((r) => [r.id, next]));
  if (!hasEstimateRows(job) && linked.length) return {job: {...job, month: next, salesMonth: undefined, updatedAt: now}, tokuteiMonths};
  const moved = {...job, month: addMonths(job.month, dir), updatedAt: now};
  return {job: withSalesMonth(moved, next), tokuteiMonths};
}

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
      month: tokuteiSalesMonth(r, s),
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

/**
 * 受注残・進捗管理（太陽ポータルの solar-silver-progress-app。taiyo-link）に渡す、見積書のある様邸ごとのまとめ
 * （ユーザーの指示「ゆくゆくは作成したら、自動的に受注残の連動して、金額が自動で入るようにする。当然包括、居宅、名前なども連動」2026-10-25、
 *  「今の内容が崩れたりだとか、使えなくなったりだとかしないように」2026-10-26）。同じサイトなので、この端末の localStorage（taiyo-jutaku-sales-v1）に書く。
 * 形は特定福祉用具の salesSummary（taiyo-tokutei-sales-v1）と同じ。受注残の画面が読んで「受注残に入れる」を出す（受注残のデータはこのアプリから書かない）。
 * 金額は売上見込みと同じ（税抜＝小計＋諸経費）、月は売上見込みの月、事業所名は理由書の作成者の事業所（居宅・包括）。仕切・利益は入れない。形を変えるときは受注残の index.html の taiyo-link も直す。
 * tokuteiMonths：このアプリで月を変えた特定福祉用具の案件（案件の id → 月）。受注残は特定福祉用具のまとめ（taiyo-tokutei-sales-v1）の月より、こちらを使う
 * （一覧の売上月・売上見込みの次月に回すで変えた月で受注残に入るように。2026-10-26）
 */
export const JUTAKU_SALES_KEY = 'taiyo-jutaku-sales-v1';
export type JutakuSalesRow = {id: string; customer: string; staff: string; careOffice: string; careManager: string; month: string; amount: number; tax: number; total: number; office: string};
export function jutakuSalesSummary(
  jobs: Job[],
  s: EstimateSettings & Pick<Settings, 'officeName'> & Partial<Pick<Settings, 'tokuteiSalesMonths'>>,
  now = Date.now(),
): {v: 1; updatedAt: number; rows: JutakuSalesRow[]; tokuteiMonths: Record<string, string>} {
  const rows = jobs
    .filter((j) => hasEstimateRows(j))
    .map((j): JutakuSalesRow => {
      const t = estimateTotals(j, s).all;
      return {
        id: j.id,
        customer: j.customer.trim(),
        staff: j.staff,
        careOffice: (j.shinsei?.reasonOffice ?? '').trim(),
        careManager: (j.shinsei?.reasonName ?? '').trim(),
        month: jutakuSalesMonth(j),
        amount: t.subtotal + t.overhead,
        tax: t.tax,
        total: t.total,
        office: s.officeName.trim(),
      };
    });
  const tokuteiMonths = Object.fromEntries(Object.entries(s.tokuteiSalesMonths ?? {}).filter(([, m]) => MONTH.test(m)));
  return {v: 1, updatedAt: now, rows, tokuteiMonths};
}
/** 書く（書けなくても困らない：受注残に住宅改修が届かないだけ）。ゴミ箱の様邸は渡さない（呼ぶ所でゴミ箱を除いた様邸を渡す） */
export function writeJutakuSalesSummary(jobs: Job[], s: EstimateSettings & Pick<Settings, 'officeName'> & Partial<Pick<Settings, 'tokuteiSalesMonths'>>, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(JUTAKU_SALES_KEY, JSON.stringify(jutakuSalesSummary(jobs, s)));
  } catch {
    /* 容量がいっぱい・使えないとき */
  }
}

// 「📈 売上見込みを確認する」のタブ（salesPlan.ts）。月ごとに、住宅改修と特定福祉用具を別々に並べて、税抜・税込の合計を出す。
// ☑ した行を「次月に回す」、印刷、受注残・進捗管理（別のアプリ）を開く。
// 特定福祉用具の金額は、特定福祉用具のアプリが書いたまとめ（taiyo-tokutei-sales-v1）。この画面を開いているあいだ、見えない枠で特定福祉用具のアプリを開いて
// まとめを新しくする（特定福祉用具のアプリは開くたびに書き直す。書いたら storage のできごとで読み直す）
import {useEffect, useMemo, useState} from 'react';
import type {PrintRequest} from '../print/PrintView.tsx';
import {monthPlan, planRows, readTokuteiSales, TOKUTEI_SALES_KEY, withSalesMonth} from '../salesPlan.ts';
import type {PlanRow, PlanSums} from '../salesPlan.ts';
import {TOKUTEI_URL} from '../tokuteiLink.ts';
import type {AppData} from '../types.ts';
import type {Update} from '../useStore.ts';
import {addMonths, monthLabel, staffShort, yen} from '../util.ts';
import {Btn, useToast} from './ui.tsx';

/** 受注残・進捗管理（太陽ポータルの別のアプリ。同じサイト） */
export const PROGRESS_APP_URL = 'https://akamar08taiyo-bot.github.io/solar-silver-progress-app/';

const readStored = () => {
  try {
    return readTokuteiSales(localStorage.getItem(TOKUTEI_SALES_KEY));
  } catch {
    return {rows: [], updatedAt: 0};
  }
};

export function SalesPlanPage({
  data,
  update,
  month,
  setMonth,
  onOpenJob,
  onPrint,
}: {
  data: AppData;
  update: Update;
  month: string;
  setMonth: (m: string) => void;
  onOpenJob: (id: string, view: 'estimate' | 'hanbai') => void;
  onPrint: (r: PrintRequest) => void;
}) {
  const toast = useToast();
  const [tokutei, setTokutei] = useState(readStored);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TOKUTEI_SALES_KEY) setTokutei(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const rows = useMemo(() => planRows(data.jobs, data.settings, tokutei.rows), [data.jobs, data.settings, tokutei.rows]);
  const plan = useMemo(() => monthPlan(rows, month), [rows, month]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => setChecked(new Set()), [month]);
  const key = (r: PlanRow) => `${r.kind}:${r.id}`;
  const toggle = (r: PlanRow) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(key(r))) n.delete(key(r));
      else n.add(key(r));
      return n;
    });
  const picked = [...plan.jutaku, ...plan.tokutei].filter((r) => checked.has(key(r)));

  /** ☑ した行を次の月の売上見込みへ（住宅改修は様邸の売上見込みの月、特定福祉用具はこのアプリの設定に持つ。請求する月・特定福祉用具のデータは変えない） */
  const moveNext = () => {
    if (picked.length === 0) return;
    const next = addMonths(month, 1);
    const jobIds = new Set(picked.filter((r) => r.kind === 'jutaku').map((r) => r.id));
    const tokuIds = picked.filter((r) => r.kind === 'tokutei').map((r) => r.id);
    if (jobIds.size) update('jobs', (list) => list.map((j) => (jobIds.has(j.id) ? {...withSalesMonth(j, next), updatedAt: Date.now()} : j)));
    if (tokuIds.length) update('settings', (s) => ({...s, tokuteiSalesMonths: {...s.tokuteiSalesMonths, ...Object.fromEntries(tokuIds.map((id) => [id, next]))}}));
    setChecked(new Set());
    toast(`${picked.length}件を${monthLabel(next)}に回しました`);
  };

  return (
    <div className="space-y-4">
      {/* 特定福祉用具のまとめを新しくする（見えない枠。特定福祉用具のアプリが開くとまとめを書く） */}
      <iframe src={`${TOKUTEI_URL}#embed=1`} title="特定福祉用具の金額を読む" className="hidden" aria-hidden="true" tabIndex={-1} />
      {/* 上の段：月・次月に回す（左）／印刷・受注残（まん中。ユーザーの指示「位置を少し中央にずらす」2026-10-28。前は右の端）。工務店請求書の上の段と同じ grid */}
      <div className="flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-[minmax(max-content,1fr)_auto_1fr] lg:gap-x-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
            <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="前の月">
              ◀
            </button>
            <label className="flex items-center gap-2 px-1">
              <span className="whitespace-nowrap text-lg font-bold text-[#115e59]">{monthLabel(month)}</span>
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-8 w-[8.5rem] rounded border border-slate-300 px-1 text-sm sm:w-[9.5rem]" aria-label="売上の月" />
            </label>
            <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="次の月">
              ▶
            </button>
          </div>
          <Btn color="white" disabled={picked.length === 0} onClick={moveNext}>
            ☑ したものを次月に回す{picked.length > 0 ? `（${picked.length}件）` : ''}
          </Btn>
        </div>
        <div role="group" aria-label="売上見込みの印刷・受注残" className="ml-auto flex flex-wrap gap-2 lg:ml-0 lg:justify-center">
          <Btn color="softSky" disabled={plan.all.count === 0} onClick={() => onPrint({kind: 'sales', month, plan})}>
            🖨 印刷
          </Btn>
          <a href={PROGRESS_APP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            📊 受注残・進捗管理を開く
          </a>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="合計">
        <SumCard title="住宅改修" sums={plan.jutakuSum} />
        <SumCard title="特定福祉用具" sums={plan.tokuteiSum} />
        <SumCard title="合計" sums={plan.all} strong />
      </section>

      <PlanList title="住宅改修" rows={plan.jutaku} sums={plan.jutakuSum} checked={checked} rowKey={key} onToggle={toggle} onOpen={(r) => onOpenJob(r.jobId, 'estimate')} empty="この月の住宅改修の見積書はありません" />
      <PlanList
        title="特定福祉用具"
        rows={plan.tokutei}
        sums={plan.tokuteiSum}
        checked={checked}
        rowKey={key}
        onToggle={toggle}
        onOpen={(r) => (r.jobId ? onOpenJob(r.jobId, 'hanbai') : window.open(`${TOKUTEI_URL}#tab=sales&sale=${encodeURIComponent(r.id)}`, '_blank'))}
        empty={tokutei.updatedAt ? 'この月の特定福祉用具の見積もりはありません' : '特定福祉用具の金額を読み込んでいます…'}
      />
    </div>
  );
}

function SumCard({title, sums, strong = false}: {title: string; sums: PlanSums; strong?: boolean}) {
  return (
    <div className={`rounded-xl border bg-white p-3 shadow-sm ${strong ? 'border-teal-300' : 'border-slate-200'}`}>
      <div className="text-xs font-bold text-slate-500">
        {title}（{sums.count}件）
      </div>
      <div className={`tabular-nums ${strong ? 'text-2xl font-bold text-[#115e59]' : 'text-xl font-bold text-slate-800'}`}>税込 {yen(sums.total)}円</div>
      <div className="text-sm tabular-nums text-slate-600">税抜 {yen(sums.amount)}円（消費税 {yen(sums.tax)}円）</div>
    </div>
  );
}

function PlanList({
  title,
  rows,
  sums,
  checked,
  rowKey,
  onToggle,
  onOpen,
  empty,
}: {
  title: string;
  rows: PlanRow[];
  sums: PlanSums;
  checked: Set<string>;
  rowKey: (r: PlanRow) => string;
  onToggle: (r: PlanRow) => void;
  onOpen: (r: PlanRow) => void;
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={title}>
      <h3 className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-200 bg-teal-50 px-4 py-2 text-base font-bold text-[#115e59]">
        {title}
        <span className="text-sm font-normal tabular-nums text-slate-600">
          {sums.count}件　税抜 {yen(sums.amount)}円・税込 {yen(sums.total)}円
        </span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={rowKey(r)} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2.5 last:border-b-0">
              <input type="checkbox" checked={checked.has(rowKey(r))} onChange={() => onToggle(r)} aria-label={`${r.name}を選ぶ`} className="h-5 w-5" />
              {/* 名前は1行に（狭い画面では金額を次の行の右へ） */}
              <button type="button" onClick={() => onOpen(r)} className="min-w-[12rem] flex-1 text-left font-bold text-slate-800 hover:text-teal-800 hover:underline">
                {r.name}
                {r.status && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">{r.status}</span>}
                {r.staff && <span className="ml-2 text-xs font-normal text-slate-500">{staffShort(r.staff)}</span>}
              </button>
              <span className="ml-auto flex items-baseline gap-3">
                <span className="text-sm tabular-nums text-slate-600">税抜 {yen(r.amount)}円</span>
                <span className="w-32 text-right font-bold tabular-nums text-slate-900">税込 {yen(r.total)}円</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

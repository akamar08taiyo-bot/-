import {useMemo} from 'react';
import {hasEstimateRows, jobName, monthSummary, sortJobs} from '../calc.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {withBillMonth} from '../salesPlan.ts';
import {addSamples, hasSamples} from '../samples.ts';
import type {AppData, Job} from '../types.ts';
import type {Update} from '../useStore.ts';
import {addMonths, downloadBlob, monthLabel, staffShort, uid, yen} from '../util.ts';
import {useTrashUndo} from './TrashPage.tsx';
import {Btn, useToast} from './ui.tsx';

export function newJob(month: string): Job {
  const now = Date.now();
  return {
    id: uid('j'),
    month,
    customer: '',
    suffix: '様邸',
    staff: '',
    date: '',
    address: '',
    note: '',
    insuredNo: '',
    form: '',
    overhead: null,
    overheadTarget: null,
    shikiri: true,
    places: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function JobsPage({
  data,
  update,
  month,
  setMonth,
  onOpen,
  onPrint,
  goMaterials,
  goEstimate,
}: {
  data: AppData;
  update: Update;
  month: string;
  setMonth: (m: string) => void;
  onOpen: (id: string) => void;
  onPrint: (r: PrintRequest) => void;
  goMaterials: () => void;
  goEstimate: () => void;
}) {
  const toast = useToast();
  useTrashUndo(update); // 様邸の画面で削除（ゴミ箱へ）して戻ってきたとき、Ctrl+Z で戻す
  // この月の様邸：☑（請求書に入れる＝shikiri）の様邸と、見積書はあるが外した様邸（☐。請求書に入れない。☑ で戻せる・次月に回せる）
  // （ユーザーの指示「請求書を作成する一覧については、シンプルにする。〇〇様邸、（開いてから詳細）☑︎ボックスを作成して、チェックしたものだけ、請求書にのせるようにする」
  // 「☑︎して次月に回せるようにもする」2026-10-25）。部材代などの内訳は様邸を開いた画面と印刷に
  const listed = useMemo(() => sortJobs(data.jobs.filter((j) => j.month === month && (j.shikiri || hasEstimateRows(j)))), [data.jobs, month]);
  const jobs = useMemo(() => listed.filter((j) => j.shikiri), [listed]);
  const summary = useMemo(() => monthSummary(jobs, data.settings), [jobs, data.settings]);
  const totalsOf = useMemo(() => new Map(monthSummary(listed, data.settings).rows.map((r) => [r.job.id, r.totals])), [listed, data.settings]);
  const monthly = data.settings.invoiceTaxMode === 'monthly';
  const unchecked = listed.filter((j) => !j.shikiri);
  const setShikiri = (id: string, shikiri: boolean) => update('jobs', (list) => list.map((j) => (j.id === id ? {...j, shikiri, updatedAt: Date.now()} : j)));
  /** 次の月の請求書へ（請求する月を1か月あとに。☐ の様邸は ☑ にして、次の月の請求書に入れる） */
  const toNextMonth = (ids: string[]) => {
    const next = addMonths(month, 1);
    const set = new Set(ids);
    // 売上月（受注残の月）は、請求する月と同じなら一緒に移る（ちがう月にしてあればそのまま。salesPlan.ts の withBillMonth）
    update('jobs', (list) => list.map((j) => (set.has(j.id) ? {...withBillMonth(j, next), shikiri: true, updatedAt: Date.now()} : j)));
    toast(`${ids.length}件を${monthLabel(next)}分に回しました`);
  };

  const add = () => {
    const j = newJob(month);
    update('jobs', (list) => [...list, j]);
    onOpen(j.id);
  };

  const saveCsv = () => {
    const head = ['No.', '施工日', 'お客様名', '担当', '部材代', '取付手間', '部材上乗せ', '諸経費', '税抜計', '消費税', '合計'];
    const lines = [head];
    // 1か月の合計にまとめて消費税をかけるときは、様邸ごとの消費税・合計は空にする（請求書と同じ）
    summary.rows.forEach(({job, totals: t}, i) =>
      lines.push([
        String(i + 1),
        job.date,
        jobName(job),
        staffShort(job.staff),
        ...[t.material, t.labor, t.markup, t.overhead, t.subtotal].map(String),
        monthly ? '' : String(t.tax),
        monthly ? '' : String(t.total),
      ]),
    );
    const s = summary.sum;
    lines.push(['', '', '合計', '', ...[s.material, s.labor, s.markup, s.overhead, s.subtotal, summary.invoice.tax, summary.invoice.total].map(String)]);
    const csv = lines.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    downloadBlob(new Blob(['﻿' + csv], {type: 'text/csv'}), `${data.settings.clientName || '請求'}_${month}_一覧.csv`);
  };

  const trySample = () => {
    // 足したものだけを今の並びのうしろに（data はゴミ箱の様邸を除いたものなので、並びごと置きかえるとゴミ箱が空になる）
    const r = addSamples(data, month);
    update('materials', (list) => [...list, ...r.materials]);
    update('jobs', (list) => [...list, ...r.jobs]);
    update('kits', (list) => [...list, ...r.kits]);
    toast('サンプルの部材5件と「（サンプル）山田様邸」・部材＋施工費（常用）1件を入れました。設定画面からまとめて消せます。');
  };

  return (
    <div className="space-y-4">
      {/* 上の段：左に請求する月・様邸を追加、まん中に印刷・CSV（ユーザーの指示「赤枠の部分を中央にもってくる」2026-10-27。前は右の端。
          見積書・申請書のタブの保存・Excel・印刷と同じく、よく使うボタンはまん中）。狭い画面は前と同じく折り返して並べる */}
      {/* 広い画面（xl）は 左・まん中・右 の3つに分け、まん中に置く。左の月・様邸を追加は折り返さない（入りきらなければ、まん中のボタンは左のすぐ右）*/}
      <div className="flex flex-wrap items-center gap-2 xl:grid xl:grid-cols-[minmax(max-content,1fr)_auto_1fr] xl:gap-x-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
            <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="前の月">
              ◀
            </button>
            <label className="flex items-center gap-2 px-1">
              <span className="whitespace-nowrap text-lg font-bold text-[#0c315e]">{monthLabel(month)}分</span>
              <input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="h-8 w-[8.5rem] rounded border border-slate-300 px-1 text-sm sm:w-[9.5rem]"
                aria-label="請求する月"
              />
            </label>
            <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="次の月">
              ▶
            </button>
          </div>
          <Btn color="emerald" onClick={add}>
            ＋ 様邸を追加
          </Btn>
        </div>
        <div role="group" aria-label="請求書の印刷・保存" className="flex flex-wrap gap-2 lg:ml-6 xl:ml-0 xl:justify-center">
          <Btn color="softSky" disabled={jobs.length === 0} onClick={() => onPrint({kind: 'invoice', month, withDetails: false})}>
            🖨 請求書を印刷
          </Btn>
          <Btn color="softSky" disabled={jobs.length === 0} onClick={() => onPrint({kind: 'invoice', month, withDetails: true})}>
            🖨 請求書＋各様邸の明細
          </Btn>
          <Btn color="white" disabled={jobs.length === 0} onClick={saveCsv}>
            CSVで保存
          </Btn>
        </div>
      </div>

      {listed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm leading-7 text-slate-600">
          <p className="text-base font-bold text-slate-800">{monthLabel(month)}分の様邸はまだありません。</p>
          <ol className="mt-2 list-decimal space-y-1 pl-6">
            <li>
              「
              <button type="button" className="font-bold text-purple-700 underline" onClick={goMaterials}>
                部材・施工費マスタ
              </button>
              」で、メーカーの仕切り表（Excel・CSV・PDF）を取り込み、よく使う部材をお気に入り（★）にします。
            </li>
            <li>「＋ 様邸を追加」で○○様邸を作り、玄関・トイレなどの箇所ごとに部材と取付手間（箇所数）を入れます。</li>
            <li>月の分がそろったら「請求書を印刷」で1か月分の一覧を印刷し、{data.settings.clientName || '工務店'}さまへお渡しします。</li>
            <li>
              見積書は「
              <button type="button" className="font-bold text-emerald-800 underline" onClick={goEstimate}>
                見積もり・申請書を作成する
              </button>
              」で作ります。見積書に入れた部材・施工費は、そのままこの一覧（請求する月の分）に入り、自動で計算されます。
            </li>
          </ol>
          {!hasSamples(data) && (
            <div className="mt-4">
              <Btn color="white" onClick={trySample}>
                サンプルで試す（玄関・トイレの例）
              </Btn>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs text-slate-600">
              <tr>
                <th className="w-14 whitespace-nowrap px-2 py-2 text-center">請求書</th>
                <th className="w-10 px-1 py-2 text-center">No.</th>
                <th className="px-2 py-2 text-left">お客様名</th>
                <th className="px-2 py-2 text-right">金額（税抜）</th>
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {listed.map((job, i) => (
                <tr key={job.id} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/60 ${job.shikiri ? '' : 'bg-slate-50 text-slate-400'}`} onClick={() => onOpen(job.id)}>
                  <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={job.shikiri} onChange={(e) => setShikiri(job.id, e.target.checked)} aria-label={`${jobName(job)}を請求書に入れる`} className="h-5 w-5 align-middle" />
                  </td>
                  <td className="px-1 py-2 text-center tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(job.id);
                      }}
                      className={`block w-full text-left text-base font-bold hover:underline ${job.shikiri ? 'text-slate-800 hover:text-blue-800' : 'text-slate-400'}`}
                    >
                      {jobName(job)}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(totalsOf.get(job.id)?.subtotal ?? 0)}</td>
                  <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <Btn small color="white" onClick={() => toNextMonth([job.id])} aria-label={`${jobName(job)}を次月に回す`}>
                      次月へ
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {unchecked.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
              <span>☐ {unchecked.length}件は今月の請求書に入れません</span>
              <Btn small color="white" onClick={() => toNextMonth(unchecked.map((j) => j.id))}>
                ☐ の様邸をまとめて次月へ
              </Btn>
            </div>
          )}
          {/* 下はご請求金額だけ（件数・税抜合計・消費税と説明は「不要」とユーザーの指示 2026-10-26。内訳は請求書の印刷に） */}
          <div className="flex flex-wrap items-center justify-end border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-lg font-bold text-[#0c315e]">ご請求金額（税込） {yen(summary.invoice.total)}円</span>
          </div>
        </div>
      )}
    </div>
  );
}

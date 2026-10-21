import {useMemo} from 'react';
import {jobName, monthSummary} from '../calc.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {addSamples, hasSamples} from '../samples.ts';
import type {AppData, Job} from '../types.ts';
import type {Update} from '../useStore.ts';
import {addMonths, downloadBlob, monthLabel, shortDate, staffShort, uid, yen} from '../util.ts';
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
  const jobs = useMemo(() => data.jobs.filter((j) => j.shikiri && j.month === month), [data.jobs, month]);
  const summary = useMemo(() => monthSummary(jobs, data.settings), [jobs, data.settings]);
  const monthly = data.settings.invoiceTaxMode === 'monthly';

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
    const r = addSamples(data, month);
    update('materials', () => r.materials);
    update('jobs', () => r.jobs);
    update('kits', () => r.kits);
    toast('サンプルの部材5件と「（サンプル）山田様邸」・部材＋施工費（常用）1件を入れました。設定画面からまとめて消せます。');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
          <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="前の月">
            ◀
          </button>
          <label className="flex items-center gap-2 px-1">
            <span className="text-lg font-bold text-[#0c315e]">{monthLabel(month)}分</span>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="h-8 w-[9.5rem] rounded border border-slate-300 px-1 text-sm"
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
        <div className="ml-auto flex flex-wrap gap-2">
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

      {jobs.length === 0 ? (
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
            <li>月の分がそろったら「請求書を印刷」で1か月分の一覧を印刷し、笹岡工務店さまへお渡しします。</li>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-slate-100 text-xs text-slate-600">
              <tr>
                <th className="px-2 py-2 text-center">No.</th>
                <th className="px-2 py-2 text-left">施工日</th>
                <th className="px-2 py-2 text-left">お客様名</th>
                <th className="px-2 py-2 text-left">担当</th>
                <th className="px-2 py-2 text-right">① 部材代</th>
                <th className="px-2 py-2 text-right">② 取付手間</th>
                <th className="px-2 py-2 text-right">③ 部材上乗せ</th>
                <th className="px-2 py-2 text-right">④ 諸経費</th>
                <th className="px-2 py-2 text-right">⑦ 税抜計</th>
                {!monthly && <th className="px-2 py-2 text-right">⑤ 消費税</th>}
                {!monthly && <th className="px-2 py-2 text-right">⑥ 合計</th>}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {summary.rows.map(({job, totals: t}, i) => (
                <tr key={job.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/60" onClick={() => onOpen(job.id)}>
                  <td className="px-2 py-2 text-center tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2 tabular-nums">{shortDate(job.date) || '—'}</td>
                  <td className="px-2 py-2 font-bold text-slate-800">
                    {jobName(job)}
                    <span className="ml-2 text-xs font-normal text-slate-500">{job.places.map((p) => p.name || '（箇所名なし）').join('・')}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{staffShort(job.staff) || <span className="text-slate-400">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(t.material)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(t.labor)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(t.markup)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(t.overhead)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(t.subtotal)}</td>
                  {!monthly && <td className="px-2 py-2 text-right tabular-nums">{yen(t.tax)}</td>}
                  {!monthly && <td className="px-2 py-2 text-right font-bold tabular-nums">{yen(t.total)}</td>}
                  <td className="px-2 py-1.5 text-right">
                    <Btn
                      small
                      color="white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrint({kind: 'job', jobId: job.id});
                      }}
                    >
                      明細を印刷
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <tr>
                <td colSpan={4} className="px-2 py-2 text-right">
                  {monthLabel(month)}分 合計（{summary.rows.length}件）
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{yen(summary.sum.material)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{yen(summary.sum.labor)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{yen(summary.sum.markup)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{yen(summary.sum.overhead)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{yen(summary.sum.subtotal)}</td>
                {!monthly && <td className="px-2 py-2 text-right tabular-nums">{yen(summary.sum.tax)}</td>}
                {!monthly && <td className="px-2 py-2 text-right tabular-nums text-[#0c315e]">{yen(summary.sum.total)}</td>}
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-slate-200 px-4 py-3 text-sm">
            <span>税抜合計 {yen(summary.invoice.subtotal)}円</span>
            <span>
              消費税 {yen(summary.invoice.tax)}円{monthly ? '（すべての様邸の合計に消費税率をかけています）' : '（様邸ごとの消費税の合計）'}
            </span>
            <span className="text-lg font-bold text-[#0c315e]">ご請求金額（税込） {yen(summary.invoice.total)}円</span>
          </div>
        </div>
      )}
    </div>
  );
}

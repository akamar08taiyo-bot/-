import {useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {jobName, jobTotals, monthSummary, placeTotals, rowAmount} from '../calc.ts';
import type {MonthSummary} from '../calc.ts';
import type {AppData, Job, Settings} from '../types.ts';
import {dateLabel, monthEnd, monthLabel, num, shortDate, todayIso, yen} from '../util.ts';

export type PrintRequest = {kind: 'invoice'; month: string; withDetails: boolean} | {kind: 'job'; jobId: string};

type InvoiceMeta = {date: string; number: string; due: string};
const META_KEY = 'sasaoka-app:invoice-meta';

/** 請求日・請求書番号・お支払期限は月ごとに覚えておく（次に開いたときも同じものが入る） */
function useInvoiceMeta(month: string) {
  const read = (): InvoiceMeta => {
    try {
      const all = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      if (all && all[month]) return {date: '', number: '', due: '', ...all[month]};
    } catch {
      /* 初期値にする */
    }
    const today = todayIso();
    return {date: today.slice(0, 7) > month ? monthEnd(month) : today, number: '', due: ''};
  };
  const [meta, setMeta] = useState<InvoiceMeta>(read);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
      all[month] = meta;
      localStorage.setItem(META_KEY, JSON.stringify(all));
    } catch {
      /* 覚えられなくても印刷はできる */
    }
  }, [month, meta]);
  return [meta, setMeta] as const;
}

export function PrintView({request, data, onClose}: {request: PrintRequest; data: AppData; onClose: () => void}) {
  const month = request.kind === 'invoice' ? request.month : data.jobs.find((j) => j.id === request.jobId)?.month ?? '';
  const [meta, setMeta] = useInvoiceMeta(month);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const title = document.title;
    // PDFに保存するときのファイル名になる
    if (request.kind === 'invoice') document.title = `${data.settings.clientName}様_御請求書_${monthLabel(request.month)}分`;
    else {
      const j = data.jobs.find((x) => x.id === request.jobId);
      if (j) document.title = `${data.settings.clientName}仕切り計算表_${jobName(j)}`;
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.title = title;
    };
  }, [onClose, request, data.jobs, data.settings.clientName]);

  const jobs = useMemo(() => data.jobs.filter((j) => j.month === month), [data.jobs, month]);
  const summary = useMemo(() => monthSummary(jobs, data.settings), [jobs, data.settings]);

  let sheets: ReactNode;
  if (request.kind === 'invoice') {
    sheets = (
      <>
        <InvoiceDoc month={request.month} summary={summary} settings={data.settings} meta={meta} />
        {request.withDetails && summary.rows.map(({job}) => <JobDoc key={job.id} job={job} settings={data.settings} />)}
      </>
    );
  } else {
    const job = data.jobs.find((j) => j.id === request.jobId);
    sheets = job ? <JobDoc job={job} settings={data.settings} /> : <div className="sheet">見つかりませんでした</div>;
  }

  return (
    <div className="print-overlay">
      <div className="print-toolbar">
        <div className="text-sm font-bold">
          印刷イメージ（A4縦）
          <span className="ml-2 font-normal text-slate-300">印刷の画面で「PDFに保存」を選ぶとPDFにできます</span>
        </div>
        {request.kind === 'invoice' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              請求日
              <input type="date" value={meta.date} onChange={(e) => setMeta({...meta, date: e.target.value})} className="h-8 rounded bg-white px-1 text-slate-900" />
            </label>
            <label className="flex items-center gap-1">
              請求書番号
              <input value={meta.number} onChange={(e) => setMeta({...meta, number: e.target.value})} className="h-8 w-28 rounded bg-white px-1 text-slate-900" placeholder="任意" />
            </label>
            <label className="flex items-center gap-1">
              お支払期限
              <input type="date" value={meta.due} onChange={(e) => setMeta({...meta, due: e.target.value})} className="h-8 rounded bg-white px-1 text-slate-900" />
            </label>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => window.print()} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-sky-700">
            🖨 印刷する
          </button>
          <button type="button" onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow hover:bg-slate-100">
            ✕ 閉じる
          </button>
        </div>
      </div>
      <div className="print-root">{sheets}</div>
    </div>
  );
}

function Issuer({s}: {s: Settings}) {
  const telFax = [s.tel && `TEL ${s.tel}`, s.fax && `FAX ${s.fax}`].filter(Boolean).join('　');
  return (
    <div className="issuer">
      {s.company && <div className="company">{s.company}</div>}
      {s.officeName && <div className="office">{s.officeName}</div>}
      {(s.postal || s.address) && (
        <div>
          {s.postal && `〒${s.postal.replace(/^〒/, '')}　`}
          {s.address}
        </div>
      )}
      {telFax && <div>{telFax}</div>}
      {s.regNo && <div>登録番号　{s.regNo}</div>}
      {s.person && <div>担当　{s.person}</div>}
    </div>
  );
}

function InvoiceDoc({month, summary, settings: s, meta}: {month: string; summary: MonthSummary; settings: Settings; meta: InvoiceMeta}) {
  const monthly = summary.invoice.mode === 'monthly';
  const taxPct = `${Math.round(s.taxRate * 1000) / 10}%`;
  return (
    <div className="sheet">
      <div className="doc-title">御請求書</div>
      <div className="doc-head">
        <div className="left">
          <div className="to">
            {s.clientName || '　　　　'}
            <small>御中</small>
          </div>
          <p className="greeting">下記のとおりご請求申し上げます。</p>
          <p className="subject">
            件名：{monthLabel(month)}分　{s.subject}
          </p>
          <div className="amount-box">
            <div className="k">ご請求金額（税込）</div>
            <div className="v">¥{yen(summary.invoice.total)}-</div>
          </div>
          {meta.due && <p className="due">お支払期限：{dateLabel(meta.due)}</p>}
        </div>
        <div className="right">
          <div className="meta">
            {meta.date && <div>請求日　{dateLabel(meta.date)}</div>}
            {meta.number && <div>請求書番号　{meta.number}</div>}
          </div>
          <Issuer s={s} />
        </div>
      </div>

      <table className="items invoice">
        <colgroup>
          <col style={{width: '4%'}} />
          <col style={{width: '7.5%'}} />
          <col style={{width: monthly ? '26.5%' : '17.5%'}} />
          {Array.from({length: monthly ? 5 : 7}, (_, i) => (
            <col key={i} style={{width: monthly ? '12.4%' : '10.14%'}} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>施工日</th>
            <th>お客様名</th>
            <th>部材代</th>
            <th>取付手間</th>
            <th>部材上乗せ</th>
            <th>諸経費</th>
            <th>{monthly ? '金額（税抜）' : '税抜計'}</th>
            {!monthly && <th>消費税</th>}
            {!monthly && <th>合計</th>}
          </tr>
        </thead>
        <tbody>
          {summary.rows.map(({job, totals: t}, i) => (
            <tr key={job.id}>
              <td className="c">{i + 1}</td>
              <td className="c">{shortDate(job.date)}</td>
              <td className="name">{jobName(job)}</td>
              <td className="num">{yen(t.material)}</td>
              <td className="num">{yen(t.labor)}</td>
              <td className="num">{yen(t.markup)}</td>
              <td className="num">{yen(t.overhead)}</td>
              <td className="num">{yen(t.subtotal)}</td>
              {!monthly && <td className="num">{yen(t.tax)}</td>}
              {!monthly && <td className="num strong">{yen(t.total)}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="r">
              合計（{summary.rows.length}件）
            </td>
            <td className="num">{yen(summary.sum.material)}</td>
            <td className="num">{yen(summary.sum.labor)}</td>
            <td className="num">{yen(summary.sum.markup)}</td>
            <td className="num">{yen(summary.sum.overhead)}</td>
            <td className="num">{yen(summary.sum.subtotal)}</td>
            {!monthly && <td className="num">{yen(summary.sum.tax)}</td>}
            {!monthly && <td className="num strong">{yen(summary.sum.total)}</td>}
          </tr>
          {monthly && (
            <>
              <tr>
                <td colSpan={7} className="r">
                  消費税（{taxPct}）
                </td>
                <td className="num">{yen(summary.invoice.tax)}</td>
              </tr>
              <tr>
                <td colSpan={7} className="r">
                  ご請求金額（税込）
                </td>
                <td className="num strong">{yen(summary.invoice.total)}</td>
              </tr>
            </>
          )}
        </tfoot>
      </table>
      <p className="breakdown">
        （内訳）{taxPct}対象　税抜 {yen(summary.invoice.subtotal)}円　消費税 {yen(summary.invoice.tax)}円
      </p>
      {s.bank && (
        <div className="bank">
          <span className="k">お振込先</span>
          {s.bank}
        </div>
      )}
      {s.invoiceNote && <div className="remarks">{s.invoiceNote}</div>}
    </div>
  );
}

function JobDoc({job, settings: s}: {job: Job; settings: Settings}) {
  const t = jobTotals(job, s);
  const rate = String(s.rate);
  const summary: [string, string, number, boolean][] = [
    ['①', '部材代合計', t.material, false],
    ['②', '取付手間合計', t.labor, false],
    ['③', `部材上乗せ（①×${rate}）`, t.markup, false],
    ['④', `諸経費（①＋②＋③）×${rate}`, t.overhead, false],
    ['⑤', `消費税　⑦×${s.taxRate}`, t.tax, false],
    ['⑥', '合計', t.total, true],
    ['⑦', '税抜合計', t.subtotal, true],
  ];
  return (
    <div className="sheet">
      <div className="doc-title job-title">{s.clientName}仕切り計算表</div>
      <div className="doc-head">
        <div className="left">
          <div className="customer">{jobName(job)}</div>
          <table className="info">
            <tbody>
              {job.date && (
                <tr>
                  <th>施工日</th>
                  <td>{dateLabel(job.date)}</td>
                </tr>
              )}
              <tr>
                <th>請求月</th>
                <td>{monthLabel(job.month)}分</td>
              </tr>
              {job.address && (
                <tr>
                  <th>住所</th>
                  <td>{job.address}</td>
                </tr>
              )}
              {job.note && (
                <tr>
                  <th>備考</th>
                  <td>{job.note}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="issuer-small">
            {[s.company, s.officeName].filter(Boolean).join('　')}
            {s.person && `　担当 ${s.person}`}
          </div>
        </div>
        <table className="summary">
          <tbody>
            {summary.map(([no, label, value, strong]) => (
              <tr key={no} className={strong ? 'strong' : ''}>
                <td className="no">{no}</td>
                <td className="label">{label}</td>
                <td className="num">{yen(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {job.places.map((place) => {
        const pt = placeTotals(place);
        return (
          <div key={place.id} className="place">
            <div className="place-name">【{place.name || '箇所'}】</div>
            <table className="items detail">
              <colgroup>
                <col style={{width: '8%'}} />
                <col style={{width: '42%'}} />
                <col style={{width: '16%'}} />
                <col style={{width: '11%'}} />
                <col style={{width: '9%'}} />
                <col style={{width: '14%'}} />
              </colgroup>
              <thead>
                <tr>
                  <th>区分</th>
                  <th>品名</th>
                  <th>品番</th>
                  <th>単価</th>
                  <th>数量</th>
                  <th>金額</th>
                </tr>
              </thead>
              <tbody>
                {place.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={`c kind ${r.kind}`}>{r.kind === 'labor' ? '手間' : '部材'}</td>
                    <td className="name">{r.name}</td>
                    <td className="code">{r.code}</td>
                    <td className="num">{yen(r.price)}</td>
                    <td className="num">{num(r.qty)}</td>
                    <td className="num">{yen(rowAmount(r))}</td>
                  </tr>
                ))}
                {place.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="c muted">
                      （入力なし）
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="r">
                    {place.name || '箇所'} 計（部材 {yen(pt.material)}・手間 {yen(pt.labor)}）
                  </td>
                  <td className="num strong">{yen(pt.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}

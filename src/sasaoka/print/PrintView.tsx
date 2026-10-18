import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {estimatePlaceLines, estimateTotals, jobName, jobTotals, jobWork, monthSummary, placeTotals, rowAmount} from '../calc.ts';
import type {MonthSummary} from '../calc.ts';
import type {AppData, Job, Settings} from '../types.ts';
import {dateLabel, monthEnd, monthLabel, num, shortDate, todayIso, yen} from '../util.ts';

export type PrintRequest =
  | {kind: 'invoice'; month: string; withDetails: boolean}
  | {kind: 'job'; jobId: string}
  | {kind: 'estimate'; jobId: string};

type DocMeta = {date: string; number: string; due: string};

const META_KEY = 'sasaoka-app:invoice-meta';

/**
 * 請求日・請求書番号・お支払期限は月ごとに、見積日・見積番号は様邸ごとに覚えておく（次に開いたときも同じものが入る）。
 * key は請求書なら 'YYYY-MM'、見積書なら 'est:様邸のID'
 */
function useDocMeta(key: string, defaultDate: () => string) {
  const read = (): DocMeta => {
    try {
      const all = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      if (all && all[key]) return {date: '', number: '', due: '', ...all[key]};
    } catch {
      /* 初期値にする */
    }
    return {date: defaultDate(), number: '', due: ''};
  };
  const [meta, setMeta] = useState<DocMeta>(read);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
      all[key] = meta;
      localStorage.setItem(META_KEY, JSON.stringify(all));
    } catch {
      /* 覚えられなくても印刷はできる */
    }
  }, [key, meta]);
  return [meta, setMeta] as const;
}

/** A4の幅（210mm）＋まわりの余白。画面がこれより狭いと、用紙全体が見えるように縮めて見せる */
const PAGE_PX = (210 / 25.4) * 96 + 16;

/** 印刷イメージを画面の幅に合わせる倍率（1＝原寸） */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / PAGE_PX));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, scale] as const;
}

export function PrintView({request, data, onClose}: {request: PrintRequest; data: AppData; onClose: () => void}) {
  const month = request.kind === 'invoice' ? request.month : data.jobs.find((j) => j.id === request.jobId)?.month ?? '';
  const [meta, setMeta] = useDocMeta(request.kind === 'estimate' ? `est:${request.jobId}` : month, () => {
    const today = todayIso();
    return request.kind !== 'estimate' && today.slice(0, 7) > month ? monthEnd(month) : today;
  });
  const [overlayRef, fitScale] = useFitScale();
  const [actualSize, setActualSize] = useState(false);
  const zoom = actualSize ? 1 : fitScale;

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
      if (j && request.kind === 'estimate') document.title = `御見積書_${j.customer.trim() || 'お客様'}様`;
      else if (j) document.title = `${data.settings.clientName}仕切り計算表_${jobName(j)}`;
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
    sheets = !job ? (
      <div className="sheet">見つかりませんでした</div>
    ) : request.kind === 'estimate' ? (
      <EstimateDoc job={job} settings={data.settings} meta={meta} />
    ) : (
      <JobDoc job={job} settings={data.settings} />
    );
  }

  return (
    <div className="print-overlay" ref={overlayRef}>
      <div className="print-toolbar">
        <div className="text-sm font-bold">
          印刷イメージ（A4縦）
          <span className="ml-2 hidden font-normal text-slate-300 sm:inline">印刷の画面で「PDFに保存」を選ぶとPDFにできます</span>
        </div>
        {request.kind === 'estimate' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              見積日
              <input type="date" value={meta.date} onChange={(e) => setMeta({...meta, date: e.target.value})} className="h-8 rounded bg-white px-1 text-slate-900" />
            </label>
            <label className="flex items-center gap-1">
              見積番号
              <input value={meta.number} onChange={(e) => setMeta({...meta, number: e.target.value})} className="h-8 w-28 rounded bg-white px-1 text-slate-900" placeholder="任意" />
            </label>
          </div>
        )}
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
          {fitScale < 1 && (
            <button
              type="button"
              onClick={() => setActualSize((v) => !v)}
              className="rounded-md border border-white/40 px-3 py-2 text-sm font-bold text-white hover:bg-white/10"
            >
              {actualSize ? '全体を表示' : '🔍 拡大'}
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-sky-700">
            🖨 印刷する
          </button>
          <button type="button" onClick={onClose} className="rounded-md bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow hover:bg-slate-100">
            ✕ 閉じる
          </button>
        </div>
      </div>
      {/* 画面の幅が足りないときは zoom で縮める（印刷するときは CSS で原寸に戻す） */}
      <div className="print-root" style={zoom < 1 ? {zoom} : undefined}>
        {sheets}
      </div>
    </div>
  );
}

/** 発行元。staff を渡すと（見積書）、その様邸の担当を「担当」に出す（担当が空なら設定の請求書の担当者） */
function Issuer({s, staff}: {s: Settings; staff?: string}) {
  const person = staff || s.person;
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
      {s.manager && (
        <div className="person">
          {s.officeName}所長　<b>{s.manager}</b>
        </div>
      )}
      {person && (
        <div className="person">
          担当　<b>{person}</b>
        </div>
      )}
    </div>
  );
}

function InvoiceDoc({month, summary, settings: s, meta}: {month: string; summary: MonthSummary; settings: Settings; meta: DocMeta}) {
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
          <col style={{width: '7%'}} />
          <col style={{width: monthly ? '22.5%' : '15.5%'}} />
          <col style={{width: '7%'}} />
          {Array.from({length: monthly ? 5 : 7}, (_, i) => (
            <col key={i} style={{width: monthly ? '11.9%' : '9.5%'}} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>施工日</th>
            <th>お客様名</th>
            <th>担当</th>
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
              <td className="c staff">{job.staff}</td>
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
            <td colSpan={4} className="r">
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
                <td colSpan={8} className="r">
                  消費税（{taxPct}）
                </td>
                <td className="num">{yen(summary.invoice.tax)}</td>
              </tr>
              <tr>
                <td colSpan={8} className="r">
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
          <div className="customer-line">
            <div className="customer">{jobName(job)}</div>
            {job.staff && (
              <div className="staff">
                担当　<b>{job.staff}</b>
              </div>
            )}
          </div>
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
          <div className="issuer-small">{[s.company, s.officeName, s.manager && `所長 ${s.manager}`].filter(Boolean).join('　')}</div>
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
                    <td className="name">{r.name || (r.kind === 'labor' ? '工事' : '部材')}</td>
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

/**
 * 見積書（仮の書式。正式な書式をいただいたら合わせる）。
 * 部材は 定価×掛率（長さがあれば×長さ）、右端の備考に「定価○○円（税抜）」。部材のすぐ下の手間は「同上施工費」の1行。
 */
function EstimateDoc({job, settings: s, meta}: {job: Job; settings: Settings; meta: DocMeta}) {
  const t = estimateTotals(job, s);
  const taxPct = `${Math.round(s.taxRate * 1000) / 10}%`;
  let no = 0;
  return (
    <div className="sheet">
      <div className="doc-title">御見積書</div>
      <div className="doc-head">
        <div className="left">
          <div className="to">
            {job.customer.trim() || '　　　　'}
            <small>様</small>
          </div>
          <p className="greeting">下記のとおりお見積り申し上げます。</p>
          <table className="info">
            <tbody>
              <tr>
                <th>工事内容</th>
                <td>{jobWork(job, s.estimateWork)}</td>
              </tr>
              {job.address && (
                <tr>
                  <th>工事場所</th>
                  <td>{job.address}</td>
                </tr>
              )}
              {s.estimateValid && (
                <tr>
                  <th>有効期限</th>
                  <td>{s.estimateValid}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="amount-box">
            <div className="k">御見積金額（税込）</div>
            <div className="v">¥{yen(t.total)}-</div>
          </div>
        </div>
        <div className="right">
          <div className="meta">
            {meta.date && <div>見積日　{dateLabel(meta.date)}</div>}
            {meta.number && <div>見積番号　{meta.number}</div>}
          </div>
          <Issuer s={s} staff={job.staff} />
          <div className="stamps">
            {['所長印', '担当印'].map((label) => (
              <div key={label} className="stamp">
                <div>{label}</div>
                <div className="box" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <table className="items estimate">
        <colgroup>
          <col style={{width: '5%'}} />
          <col style={{width: '39%'}} />
          <col style={{width: '7%'}} />
          <col style={{width: '6%'}} />
          <col style={{width: '11%'}} />
          <col style={{width: '12%'}} />
          <col style={{width: '20%'}} />
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>品名・規格</th>
            <th>数量</th>
            <th>単位</th>
            <th>単価</th>
            <th>金額</th>
            <th>備考</th>
          </tr>
        </thead>
        <tbody>
          {job.places.map((place) => {
            // 金額のない施工費の行は出さない
            const lines = estimatePlaceLines(place, s.estimateRate).filter((l) => l.kind === 'material' || l.amount !== 0);
            if (lines.length === 0) return null;
            return [
              <tr key={place.id} className="place-row">
                <td />
                <td colSpan={6}>【{place.name || '箇所'}】</td>
              </tr>,
              ...lines.map((l, i) =>
                l.kind === 'material' ? (
                  <tr key={`${place.id}-${i}`}>
                    <td className="c">{++no}</td>
                    <td className="name">
                      {l.row.name || '部材'}
                      {l.row.lengthCm > 0 && `（長さ ${num(l.row.lengthCm)}cm）`}
                      {l.row.code && <span className="code-sub">{l.row.code}</span>}
                    </td>
                    <td className="num">{num(l.row.qty)}</td>
                    <td className="c">{l.row.unit}</td>
                    <td className="num">{yen(l.unitPrice)}</td>
                    <td className="num">{yen(l.amount)}</td>
                    <td className="note">{l.row.listPrice > 0 && `定価${yen(l.row.listPrice)}円（税抜）`}</td>
                  </tr>
                ) : (
                  <tr key={`${place.id}-${i}`}>
                    <td className="c">{++no}</td>
                    <td className="name">{l.afterMaterial ? '同上施工費' : '施工費'}</td>
                    <td className="num">1</td>
                    <td className="c">式</td>
                    <td className="num">{yen(l.amount)}</td>
                    <td className="num">{yen(l.amount)}</td>
                    <td className="note" />
                  </tr>
                ),
              ),
            ];
          })}
          {no === 0 && (
            <tr>
              <td colSpan={7} className="c muted">
                （入力なし）
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="r">
              小計（税抜）
            </td>
            <td className="num">{yen(t.subtotal)}</td>
            <td />
          </tr>
          <tr>
            <td colSpan={5} className="r">
              消費税（{taxPct}）
            </td>
            <td className="num">{yen(t.tax)}</td>
            <td />
          </tr>
          <tr>
            <td colSpan={5} className="r">
              合計（税込）
            </td>
            <td className="num strong">{yen(t.total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {s.estimateNote && <div className="remarks">{s.estimateNote}</div>}
    </div>
  );
}

import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {cutToLength, estimateQty, isBlankRow, jobName, jobTotals, monthSummary, placeTotals, rowAmount, shikiriPrice, taxFormula} from '../calc.ts';
import type {MonthSummary} from '../calc.ts';
import {cutCalc, FORM_INFO, insurerLabel, jobForm} from '../estimateForms.ts';
import type {AppData, Job, Settings} from '../types.ts';
import {dateLabel, monthEnd, monthLabel, num, shortDate, staffShort, todayIso, yen} from '../util.ts';
import {Btn} from '../components/ui.tsx';
import {estimateDateOf, useDocMeta} from './docMeta.ts';
import type {DocMeta} from './docMeta.ts';
import {KouikiForm, YukuhashiForm} from './EstimateForms.tsx';
import {OrderDoc} from './OrderDoc.tsx';

export type PrintRequest =
  | {kind: 'invoice'; month: string; withDetails: boolean}
  | {kind: 'job'; jobId: string}
  | {kind: 'estimate'; jobId: string}
  | {kind: 'order'; jobId: string}; // 見積書の部材の発注書（A4縦）

/** 用紙の幅（A4縦 210mm・横 297mm）＋まわりの余白。画面がこれより狭いと、用紙全体が見えるように縮めて見せる */
const pagePx = (mm: number) => (mm / 25.4) * 96 + 16;
/** 用紙の右に置く「印刷する」の列の幅（ボタン＋左右のすき間。sasaoka.css の .print-side と同じ） */
const SIDE_PX = 184;

/** 大きさが変わったら measure を呼ぶ（ResizeObserver のないブラウザは画面の大きさ） */
function useResize(ref: {current: HTMLElement | null}, measure: (el: HTMLElement) => void, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => measure(el);
    run();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', run);
      return () => window.removeEventListener('resize', run);
    }
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, deps);
}

/**
 * 印刷イメージを画面の幅に合わせる倍率（1＝原寸）と、用紙の右に「印刷する」を置けるか（side。原寸の用紙の右にボタンの列が入る幅があるとき。
 * スマホなど狭い画面は上の帯に置く）
 */
function useFitScale(pageMm: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({scale: 1, side: false});
  useResize(
    ref,
    (el) => {
      const w = el.clientWidth;
      const next = {scale: Math.min(1, w / pagePx(pageMm)), side: w >= pagePx(pageMm) + SIDE_PX};
      setFit((f) => (f.scale === next.scale && f.side === next.side ? f : next));
    },
    [pageMm],
  );
  return [ref, fit.scale, fit.side] as const;
}

export function PrintView({request, data, onClose}: {request: PrintRequest; data: AppData; onClose: () => void}) {
  const month = request.kind === 'invoice' ? request.month : data.jobs.find((j) => j.id === request.jobId)?.month ?? '';
  // 請求日など（請求書は月ごとに覚える）。見積書の作成日は様邸に持つ見積もり作成日（見積書の画面で入れる）。
  // 請求日を出すのは請求書だけ：明細・発注書の印刷では覚えない（月の途中に明細を印刷した日が、その月の請求書の請求日になっていた）
  const [meta, setMeta] = useDocMeta(request.kind === 'invoice' ? month : '', () => {
    const today = todayIso();
    return today.slice(0, 7) > month ? monthEnd(month) : today;
  });
  // 見積書は A4横（元の Excel と同じ）
  const estJob = request.kind === 'estimate' ? data.jobs.find((j) => j.id === request.jobId) : undefined;
  const form = estJob ? jobForm(estJob, data.settings) : null;
  const [overlayRef, fitScale, side] = useFitScale(request.kind === 'estimate' ? 297 : 210);
  const [actualSize, setActualSize] = useState(false);
  const zoom = actualSize ? 1 : fitScale;
  // 上の帯の高さ（用紙の右の「印刷する」を、帯のすぐ下に止めておく）
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(60);
  useResize(barRef, (el) => setBarH(el.offsetHeight), []);
  // 「印刷する」は見やすい所に大きく（ユーザーの指示「発注書の印刷ボタンは見やすい位置に置く」2026-10-25。前は濃い紺の帯の右上で目立たなかった）：
  // 広い画面は用紙の右の灰色の所の上（スクロールしても見える）、狭い画面（スマホ）は用紙の右に場所がないので上の帯。見積書・請求書の印刷も同じ
  const printButton = (
    <Btn color="softSky" onClick={() => window.print()} className={side ? '!rounded-xl !px-6 !py-4 !text-xl shadow-lg' : '!px-5 !text-base'}>
      🖨 印刷する
    </Btn>
  );

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
      if (j && request.kind === 'estimate') document.title = `${FORM_INFO[jobForm(j, data.settings)].title}_${j.customer.trim() || 'お客様'}様`;
      else if (j && request.kind === 'order') document.title = `発注書_${j.customer.trim() || 'お客様'}様`;
      else if (j) document.title = `${data.settings.clientName}仕切り計算表_${jobName(j)}`;
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.title = title;
    };
  }, [onClose, request, data.jobs, data.settings]);

  const jobs = useMemo(() => data.jobs.filter((j) => j.shikiri && j.month === month), [data.jobs, month]);
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
    ) : request.kind === 'order' ? (
      <OrderDoc job={job} data={data} />
    ) : request.kind === 'estimate' ? (
      form === 'kouiki' ? (
        <KouikiForm job={job} settings={data.settings} />
      ) : (
        <YukuhashiForm job={job} settings={data.settings} date={estimateDateOf(job)} />
      )
    ) : (
      <JobDoc job={job} settings={data.settings} />
    );
  }

  return (
    <div className="print-overlay" ref={overlayRef}>
      {/* 見積書は A4横で印刷する（この画面を開いているあいだだけ） */}
      {form && <style>{'@media print { @page { size: A4 landscape; margin: 0; } }'}</style>}
      <div className="print-toolbar" ref={barRef}>
        <div className="text-sm font-bold">
          {form && estJob ? `見積書（A4横）・${insurerLabel(estJob, data.settings)}「${FORM_INFO[form].title}」` : request.kind === 'order' ? '発注書（A4縦）' : '印刷イメージ（A4縦）'}
          <span className="ml-2 hidden font-normal text-slate-300 sm:inline">印刷の画面で「PDFに保存」を選ぶとPDFにできます</span>
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {fitScale < 1 && (
            <button
              type="button"
              onClick={() => setActualSize((v) => !v)}
              className="rounded-md border border-white/40 px-3 py-2 text-sm font-bold text-white hover:bg-white/10"
            >
              {actualSize ? '全体を表示' : '🔍 拡大'}
            </button>
          )}
          {!side && printButton}
          {/* 閉じるは今までどおり右上（印刷するを用紙の右に移しても、探さなくてよいように） */}
          <Btn color="white" onClick={onClose} className="!px-5 !text-base">
            ✕ 閉じる
          </Btn>
        </div>
      </div>
      <div className={side ? 'print-body side' : 'print-body'}>
        {/* 画面の幅が足りないときは zoom で縮める（印刷するときは CSS で原寸に戻す） */}
        <div className="print-root" style={zoom < 1 ? {zoom} : undefined}>
          {sheets}
        </div>
        {side && (
          <div className="print-side" style={{top: barH + 16}}>
            {printButton}
          </div>
        )}
      </div>
    </div>
  );
}

/** 請求書の発行元（担当は設定の請求書の担当者） */
function Issuer({s}: {s: Settings}) {
  const person = s.person;
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
              <td className="c staff">{staffShort(job.staff)}</td>
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
    ['⑤', `消費税　${taxFormula(s)}`, t.tax, false],
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
                担当　<b>{staffShort(job.staff)}</b>
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
                {/* 見積書の空白の行（何も入っていない部材の行）は出さない */}
                {place.rows
                  .filter((r) => !isBlankRow(r))
                  .map((r) => (
                    <tr key={r.id}>
                      <td className={`c kind ${r.kind}`}>{r.kind === 'labor' ? '手間' : '部材'}</td>
                      <td className="name">
                        {r.name || (r.kind === 'labor' ? '工事' : '部材')}
                        {/* 切って使う部材は見積書と同じ本数（4m を 60cm → 600÷4000＝0.15本） */}
                        {cutToLength(r) && <span className="code-sub">{cutCalc(r)}本</span>}
                      </td>
                      <td className="code">{r.code}</td>
                      <td className="num">{yen(shikiriPrice(r))}</td>
                      <td className="num">{cutToLength(r) ? num(estimateQty(r), 3) : num(r.qty)}</td>
                      <td className="num">{yen(rowAmount(r))}</td>
                    </tr>
                  ))}
                {place.rows.every(isBlankRow) && (
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

import {useEffect, useMemo, useState} from 'react';
import {estimateTotals, hasEstimateRows, jobName} from '../calc.ts';
import {copyJob} from '../components/JobTools.tsx';
import {askTrash, trashLabel, useTrashUndo} from '../components/TrashPage.tsx';
import {tokuteiNames} from '../tokuteiLink.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {FORM_INFO, INSURER_IDS, INSURER_INFO, insurerLabel, jobForm} from '../estimateForms.ts';
import {estimateXlsx, XLSX_TYPE} from '../estimateXlsx.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {addSamples, hasSamples} from '../samples.ts';
import type {AppData, Insurer, Job, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {addMonths, downloadBlob, matchesAll, monthLabel, thisMonth, todayIso, uid, yen} from '../util.ts';

const SHOW_LIMIT = 100;

/**
 * 新しい様邸（申請書と見積書）。選んだ保険者（苅田町・行橋市・みやこ町・広域連合）の書式で作る（申請書も保険者ごと）。
 * 見積書に行を入れたときに、見積もり作成日（今日）を入れ、笹岡工務店の請求書（今月分）に入れる（calc.ts の startEstimate。
 * 申請書だけで終わる様邸を請求書に入れないため。笹岡工務店の工事でなければ、見積書の画面で外す）
 */
export function newEstimate(insurer: Insurer): Job {
  const now = Date.now();
  return {
    id: uid('j'),
    month: thisMonth(),
    customer: '',
    suffix: '様邸',
    staff: '',
    date: '',
    estDate: '', // 見積もり作成日（見積書に行を入れた日。それまでは作った日）
    address: '',
    note: '',
    insuredNo: '',
    insurer,
    form: INSURER_INFO[insurer].form,
    overhead: null,
    overheadTarget: null,
    shikiri: false,
    places: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 見積書（様邸）を削除する＝ゴミ箱に移す（確かめてから「○○様邸をゴミ箱に移しますか？」）。笹岡工務店の請求書・発注書からも外れる。
 * 完全に消すのはゴミ箱のタブから（ユーザーの指示「一時的に削除したデータを残せるようにする」2026-10-25）。移したら true
 */
export function removeEstimate(job: Job, s: Settings, update: Update, toast: (text: string) => void): boolean {
  return askTrash([job.id], trashLabel(job, s), update, toast);
}

/**
 * 見積書を複製する（お客様名に「（コピー）」。見積書を作ってあれば今月分の工務店の請求書に入れる。申請書だけなら申請書だけ）。複製したものを返す。
 * 一度「複製ボタンは不要」（2026-10-26）で外したが、ユーザーの指示「複製するボタン削除してもらいましたが、やはり残してください」（2026-10-26）で戻した
 */
export function duplicateEstimate(job: Job, update: Update, toast: (text: string) => void): Job {
  const estimated = hasEstimateRows(job);
  const c = {...copyJob(job), estDate: estimated ? todayIso() : '', shikiri: estimated, month: thisMonth()};
  update('jobs', (list) => [...list, c]);
  toast('複製しました。お客様名などを書き換えてください。');
  return c;
}

/**
 * 見積書を Excel ファイル（.xlsx）で保存する（ダウンロード）。印刷する見積書と同じ書式・同じ数字。作成日は見積もり作成日（印刷と同じ）
 */
export function saveEstimateExcel(job: Job, s: Settings, toast: (text: string) => void) {
  const {bytes, fileName} = estimateXlsx(job, s, estimateDateOf(job));
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), fileName);
  toast(`Excel ファイル「${fileName}」を保存しました（ダウンロードのフォルダに入ります）`);
}

const dateText = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}` : '';
};

function useEstimates(data: AppData, s: Settings) {
  // 作成日の新しい順
  return useMemo(
    () =>
      data.jobs
        .map((job) => ({job, date: estimateDateOf(job), form: jobForm(job, s), insurer: insurerLabel(job, s), t: estimateTotals(job, s)}))
        .sort((a, b) => b.date.localeCompare(a.date) || b.job.createdAt - a.job.createdAt),
    [data.jobs, s],
  );
}

/**
 * 見積もり・申請書を作成する：最初に「新規作成」か「一覧から作成」かを選ぶ。
 * 介護保険証・介護ソフトの画面は、ここ（メイン画面）ではなく様邸の画面の左の大きな欄に入れる（ユーザーの指示「各保険者のこの画面のこの辺に貼り付け欄を大きく設置し、
 * 貼り付けるようにする。メイン画面で貼り付けるのではなく」2026-10-23。CardReader.tsx の CardFill）
 */
export function EstimateHome({
  data,
  update,
  onNew,
  onList,
  goMaterials,
}: {
  data: AppData;
  update: Update;
  onNew: (insurer: Insurer) => void; // 新しい様邸（申請書と見積書のタブ）を開く
  onList: () => void;
  goMaterials: () => void;
}) {
  const all = useEstimates(data, data.settings);
  useTrashUndo(update); // 見積書の画面で削除（ゴミ箱へ）して戻ってきたとき、Ctrl+Z で戻す
  const month = thisMonth();
  const inMonth = all.filter((e) => e.job.month === month).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border-2 border-emerald-600 bg-white p-5 shadow-sm" aria-label="新規作成">
          <h2 className="text-xl font-bold text-[#14532d]">＋ 新規作成</h2>
          <div className="mt-4 grid gap-3">
            {/* 苅田町・行橋市・みやこ町は見積書が同じ書式。申請書は保険者ごとに違うので、保険者を分けて選ぶ */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {INSURER_IDS.filter((i) => INSURER_INFO[i].form === 'yukuhashi').map((i) => (
                  <Btn key={i} color="emerald" className="!px-4 !py-4 !text-base" onClick={() => onNew(i)}>
                    ＋ {INSURER_INFO[i].name}
                  </Btn>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <Btn color="emerald" className="w-full !px-4 !py-4 !text-base" onClick={() => onNew('kouiki')}>
                ＋ {INSURER_INFO.kouiki.name}
              </Btn>
            </div>
          </div>
        </section>
        <section className="rounded-xl border-2 border-slate-300 bg-white p-5 shadow-sm" aria-label="一覧から作成">
          <h2 className="text-xl font-bold text-slate-800">📋 一覧から作成</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Btn color="white" className="!px-5 !py-4 !text-base" onClick={onList}>
              📋 見積書の一覧を開く
            </Btn>
            <span className="text-sm text-slate-600">
              {monthLabel(month)}：{inMonth}件　／　全部で {all.length}件
            </span>
          </div>
        </section>
      </div>
      {all.length === 0 && <GettingStarted data={data} update={update} goMaterials={goMaterials} onSample={onList} />}
    </div>
  );
}

/** はじめて使うときの説明 */
function GettingStarted({data, update, goMaterials, onSample}: {data: AppData; update: Update; goMaterials: () => void; onSample?: () => void}) {
  const toast = useToast();
  const s = data.settings;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm leading-7 text-slate-600">
      <p className="text-base font-bold text-slate-800">見積書はまだありません。</p>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        <li>
          「
          <button type="button" className="font-bold text-purple-800 underline" onClick={goMaterials}>
            部材・施工費マスタ
          </button>
          」で、メーカーの価格表（Excel・CSV・PDF）を取り込み、よく使う部材に★を付けます。
        </li>
        <li>
          「＋ 新規作成」で保険者を選ぶと、申請書と見積書のタブができます。見積書は、いただいた見積書の形のまま Excel と同じように欄を選んで打ち込みます。
        </li>
        <li>
          品名を打つと部材リストの候補が出ます（★お気に入りが先）。備考（算出根拠）に定価を入れると、単価は定価×
          {s.estimateRate} になります。
        </li>
        <li>
          見積書に行を入れると、{s.clientName || '工務店'}の仕切り計算表と請求書（「請求書を確認する」）に入って自動で計算され、発注書も作れます。申請書だけの様邸（ほかの工務店の工事）は、請求書・発注書に入りません（{s.clientName || '工務店'}の工事でない見積書は、見積書の上の「{s.clientName || '工務店'}の請求書に入れる」を外します）。
        </li>
      </ol>
      {!hasSamples(data) && (
        <div className="mt-4">
          <Btn
            color="white"
            onClick={() => {
              // 足したものだけを今の並びのうしろに（data はゴミ箱の様邸を除いたものなので、並びごと置きかえるとゴミ箱が空になる）
              const r = addSamples(data, thisMonth());
              update('materials', (list) => [...list, ...r.materials]);
              update('jobs', (list) => [...list, ...r.jobs]);
              update('kits', (list) => [...list, ...r.kits]);
              toast('サンプルの部材5件と「（サンプル）山田様邸」の見積書・部材＋施工費（常用）1件を入れました。設定画面からまとめて消せます。');
              onSample?.();
            }}
          >
            サンプルで試す（玄関・トイレの例）
          </Btn>
        </div>
      )}
    </div>
  );
}

/** 見積書の一覧（作成日の月ごと）。探すときは、すべての月から探す */
export function EstimateList({
  data,
  update,
  month,
  setMonth,
  onOpen,
  onOpenShinsei,
  onNew,
  onPrint,
  goMaterials,
}: {
  data: AppData;
  update: Update;
  month: string;
  setMonth: (m: string) => void;
  onOpen: (id: string) => void;
  onOpenShinsei: (id: string) => void; // 様邸の申請書の画面を開く
  onNew: (insurer: Insurer) => void;
  onPrint: (r: PrintRequest) => void;
  goMaterials: () => void;
}) {
  const toast = useToast();
  const s = data.settings;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(SHOW_LIMIT);
  const all = useEstimates(data, s);
  // 特定福祉用具申請書だけを作っている様邸のお客様名（住宅改修の方に名前がないとき。tokuteiLink.ts）
  const names = useMemo(() => tokuteiNames(), [data.jobs]);
  const searching = query.trim() !== '';
  const list = useMemo(
    () =>
      searching
        ? all.filter(({job, insurer}) => matchesAll(`${job.customer} ${names.get(job.id) ?? ''} ${job.address} ${job.staff} ${insurer} ${job.places.map((p) => p.name).join(' ')}`, query))
        : all.filter((e) => e.job.month === month),
    [all, query, searching, month, names],
  );
  const total = list.reduce((n, e) => n + e.t.all.total, 0);
  const shown = list.slice(0, limit);
  // 一覧の先頭のチェック：選んだ様邸を次の月・前の月の一覧に回す（ユーザーの指示「先頭にチェックマークをつくり、次月にまわす、前月に回せるようにする」）。
  // 一覧の月は様邸の月（Job.month）。笹岡工務店の請求書に入れている様邸は、請求する月も一緒に移る
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  useEffect(() => setChecked(new Set()), [month, query]);
  const allChecked = shown.length > 0 && shown.every(({job}) => checked.has(job.id));
  const toggle = (id: string) =>
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const moveMonth = (dir: 1 | -1) => {
    const ids = checked;
    update('jobs', (jobs) => jobs.map((j) => (ids.has(j.id) ? {...j, month: addMonths(j.month, dir), updatedAt: Date.now()} : j)));
    toast(`${ids.size}件を${searching ? (dir === 1 ? '次の月' : '前の月') : monthLabel(addMonths(month, dir))}に回しました`);
    setChecked(new Set());
  };
  // チェックした様邸をまとめてゴミ箱に移す（ユーザーの指示。確かめは「N件をゴミ箱に移しますか？」）
  const trashChecked = () => {
    const ids = shown.filter(({job}) => checked.has(job.id)).map(({job}) => job.id);
    if (askTrash(ids, null, update, toast)) setChecked(new Set());
  };
  useTrashUndo(update); // さっきゴミ箱に移した様邸を Ctrl+Z で戻す

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-sm ${searching ? 'opacity-50' : ''}`}>
          <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="前の月">
            ◀
          </button>
          <label className="flex items-center gap-2 px-1">
            <span className="text-lg font-bold text-[#14532d]">{monthLabel(month)}</span>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="h-8 w-[9.5rem] rounded border border-slate-300 px-1 text-sm"
              aria-label="一覧の月"
            />
          </label>
          <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="次の月">
            ▶
          </button>
        </div>
        <span className="text-sm font-bold text-slate-600">＋ 新規作成：</span>
        {INSURER_IDS.map((i) => (
          <Btn key={i} color="emerald" onClick={() => onNew(i)} title={`${INSURER_INFO[i].area}の見積書（${FORM_INFO[INSURER_INFO[i].form].name}「${FORM_INFO[INSURER_INFO[i].form].title}」）`}>
            ＋ {INSURER_INFO[i].name}
          </Btn>
        ))}
        <TextInput value={query} onChange={setQuery} placeholder="お客様名・住所で探す（すべての月）" className="ml-auto w-72 text-sm" aria-label="見積書を探す" />
      </div>
      {checked.size > 0 && (
        <div role="status" aria-label="選んだ見積書" className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span className="font-bold">{checked.size}件を選んでいます</span>
          <Btn small color="white" onClick={() => moveMonth(-1)}>
            ◀ 前月に回す
          </Btn>
          <Btn small color="white" onClick={() => moveMonth(1)}>
            次月に回す ▶
          </Btn>
          <Btn small color="white" onClick={trashChecked}>
            削除する
          </Btn>
          <Btn small color="white" onClick={() => setChecked(new Set())}>
            やめる
          </Btn>
        </div>
      )}

      {all.length === 0 ? (
        <GettingStarted data={data} update={update} goMaterials={goMaterials} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white shadow-sm">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-emerald-50 text-xs text-emerald-900">
              <tr>
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map(({job}) => job.id)))}
                    className="h-4 w-4 align-middle"
                    aria-label="すべて選ぶ"
                  />
                </th>
                <th className="px-2 py-2 text-left">作成日</th>
                <th className="px-2 py-2 text-left">お客様名</th>
                <th className="px-2 py-2 text-right">見積の合計（税込）</th>
                <th className="px-2 py-2 text-left">{s.clientName || '工務店'}の請求書</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map(({job, date, t}) => {
                const estimated = hasEstimateRows(job); // 見積書を作った様邸（申請書だけの様邸は、請求書・発注書に入らない）
                return (
                  <tr key={job.id} className={`cursor-pointer border-t border-slate-100 hover:bg-emerald-50/60 ${checked.has(job.id) ? 'bg-sky-50' : ''}`} onClick={() => onOpen(job.id)}>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.has(job.id)} onChange={() => toggle(job.id)} className="h-4 w-4 align-middle" aria-label="選ぶ" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums">{dateText(date)}</td>
                    {/* 改修場所（玄関・トイレ…）・保険者・担当は出さない（ユーザーの指示「詳細や、保険者名、担当名などは不要」） */}
                    <td className="px-2 py-2 font-bold text-slate-800">
                      {job.customer.trim() ? (
                        jobName(job)
                      ) : names.get(job.id) ? (
                        <>
                          {jobName({...job, customer: names.get(job.id)!})}
                          <span className="ml-1.5 text-xs font-normal text-slate-500">特定福祉用具</span>
                        </>
                      ) : (
                        <span className="text-slate-400">（お客様名なし）</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-900">{estimated ? yen(t.all.total) : <span className="font-normal text-slate-400">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs">
                      {job.shikiri ? (
                        <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-bold text-[#0c315e]">{monthLabel(job.month)}分に入れる</span>
                      ) : estimated ? (
                        <span className="text-slate-400">入れない</span>
                      ) : (
                        <span className="text-slate-500">申請書だけ</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <Btn small color="white" onClick={() => onOpenShinsei(job.id)}>
                        📝 申請書
                      </Btn>
                      <Btn small color="softSky" className="ml-1.5" onClick={() => onPrint({kind: 'estimate', jobId: job.id})}>
                        🖨 印刷
                      </Btn>
                      <Btn small color="softGreen" className="ml-1.5" onClick={() => saveEstimateExcel(job, s, toast)}>
                        📗 Excel
                      </Btn>
                      <Btn
                        small
                        color="white"
                        className="ml-1.5"
                        onClick={() => {
                          // 開くタブは複製したもので決める（申請書だけなら申請書のタブ。行を押したときと同じ）。onOpen はまだ複製の入っていないデータから探すので、見積書のタブになっていた
                          const c = duplicateEstimate(job, update, toast);
                          (!c.estDate && !hasEstimateRows(c) ? onOpenShinsei : onOpen)(c.id);
                        }}
                      >
                        複製
                      </Btn>
                      <Btn small color="white" className="ml-1.5" onClick={() => removeEstimate(job, s, update, toast)}>
                        削除
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-emerald-50/60 text-sm">
                  <td colSpan={3} className="px-2 py-2 text-right font-bold text-emerald-900">
                    {searching ? `「${query}」の見積書` : `${monthLabel(month)}の見積書`}（{list.length}件）
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-900">{yen(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          {list.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              {searching ? `「${query}」の見積書は見つかりませんでした。` : `${monthLabel(month)}の見積書はありません。◀ ▶ でほかの月を見られます。`}
            </p>
          )}
          {list.length > limit && (
            <div className="border-t border-slate-100 px-4 py-2 text-center">
              <Btn small color="white" onClick={() => setLimit((n) => n + SHOW_LIMIT)}>
                もっと見る（あと{list.length - limit}件）
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

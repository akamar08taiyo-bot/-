import {useMemo, useState} from 'react';
import {estimateTotals, jobName} from '../calc.ts';
import {copyJob} from '../components/JobTools.tsx';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {FORM_INFO, INSURER_IDS, INSURER_INFO, insurerLabel, jobForm} from '../estimateForms.ts';
import {estimateXlsx, XLSX_TYPE} from '../estimateXlsx.ts';
import {readDocDate} from '../print/docMeta.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {addSamples, hasSamples} from '../samples.ts';
import type {AppData, Insurer, Job, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {addMonths, downloadBlob, matchesAll, monthLabel, staffShort, thisMonth, todayIso, uid, yen} from '../util.ts';

const SHOW_LIMIT = 100;

/**
 * 新しい見積書。選んだ保険者（苅田町・行橋市・みやこ町・広域連合）の書式で作る（申請書も保険者ごと）。
 * 笹岡工務店の請求書（今月分）に最初から入れる（笹岡工務店の工事でなければ、見積書の画面で外す）
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
    address: '',
    note: '',
    insuredNo: '',
    insurer,
    form: INSURER_INFO[insurer].form,
    overhead: null,
    overheadTarget: null,
    shikiri: true,
    places: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 見積書を削除する（確かめてから）。笹岡工務店の請求書に入れていれば、そこからも消えると知らせる。消したら true */
export function removeEstimate(job: Job, label: string, update: Update, toast: (text: string) => void): boolean {
  const also = job.shikiri ? `笹岡工務店の請求書（${monthLabel(job.month)}分）からも消えます。` : '';
  if (!confirm(`「${label}」の見積書を削除します。${also}元に戻せません。よろしいですか？`)) return false;
  update('jobs', (list) => list.filter((j) => j.id !== job.id));
  toast(`「${label}」を削除しました`);
  return true;
}

/** 見積書を複製する（お客様名に「（コピー）」。今月分の笹岡工務店の請求書に入れる）。複製したものを返す */
export function duplicateEstimate(job: Job, update: Update, toast: (text: string) => void): Job {
  const c = {...copyJob(job), shikiri: true, month: thisMonth()};
  update('jobs', (list) => [...list, c]);
  toast('複製しました。お客様名などを書き換えてください。');
  return c;
}

/**
 * 見積書を Excel ファイル（.xlsx）で保存する（ダウンロード）。印刷する見積書と同じ書式・同じ数字。
 * 作成日は見積書の右上の日付（入れていなければ今日。印刷と同じ）
 */
export function saveEstimateExcel(job: Job, s: Settings, toast: (text: string) => void) {
  const {bytes, fileName} = estimateXlsx(job, s, readDocDate(`est:${job.id}`) || todayIso());
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), fileName);
  toast(`Excel ファイル「${fileName}」を保存しました（ダウンロードのフォルダに入ります）`);
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateText = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}` : '';
};

/** 見積書の作成日（見積書の右上の日付。入れていなければ作った日） */
const estimateDate = (job: Job) => readDocDate(`est:${job.id}`) || isoOf(job.createdAt);

function useEstimates(data: AppData, s: Settings) {
  // 作成日の新しい順
  return useMemo(
    () =>
      data.jobs
        .map((job) => ({job, date: estimateDate(job), form: jobForm(job, s), insurer: insurerLabel(job, s), t: estimateTotals(job, s)}))
        .sort((a, b) => b.date.localeCompare(a.date) || b.job.createdAt - a.job.createdAt),
    [data.jobs, s],
  );
}

/** 見積もりを作成する：最初に「新規作成」か「一覧から作成」かを選ぶ */
export function EstimateHome({
  data,
  update,
  onNew,
  onList,
  goMaterials,
}: {
  data: AppData;
  update: Update;
  onNew: (insurer: Insurer) => void;
  onList: () => void;
  goMaterials: () => void;
}) {
  const all = useEstimates(data, data.settings);
  const month = thisMonth();
  const inMonth = all.filter((e) => e.date.startsWith(month)).length;
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
          「＋ 新規作成」で書式を選ぶと、いただいた見積書の形が出ます。Excel と同じように欄を選んで打ち込みます。
        </li>
        <li>
          品名を打つと部材リストの候補が出ます（★お気に入りが先）。備考（算出根拠）に定価を入れると、単価は定価×
          {s.estimateRate} になります。
        </li>
        <li>
          見積書に入れた内容は、そのまま笹岡工務店の仕切り計算表と請求書（「請求書を確認する」）に入り、自動で計算されます（笹岡工務店の工事でない見積書は、見積書の上の「笹岡工務店の請求書に入れる」を外します）。
        </li>
      </ol>
      {!hasSamples(data) && (
        <div className="mt-4">
          <Btn
            color="white"
            onClick={() => {
              const r = addSamples(data, thisMonth());
              update('materials', () => r.materials);
              update('jobs', () => r.jobs);
              update('kits', () => r.kits);
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
  onNew,
  onPrint,
  goMaterials,
}: {
  data: AppData;
  update: Update;
  month: string;
  setMonth: (m: string) => void;
  onOpen: (id: string) => void;
  onNew: (insurer: Insurer) => void;
  onPrint: (r: PrintRequest) => void;
  goMaterials: () => void;
}) {
  const toast = useToast();
  const s = data.settings;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(SHOW_LIMIT);
  const all = useEstimates(data, s);
  const searching = query.trim() !== '';
  const list = useMemo(
    () =>
      searching
        ? all.filter(({job, insurer}) => matchesAll(`${job.customer} ${job.address} ${job.staff} ${insurer} ${job.places.map((p) => p.name).join(' ')}`, query))
        : all.filter((e) => e.date.startsWith(month)),
    [all, query, searching, month],
  );
  const total = list.reduce((n, e) => n + e.t.all.total, 0);

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
              aria-label="見積書を作った月"
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
        <TextInput value={query} onChange={setQuery} placeholder="お客様名・住所・担当・保険者で探す（すべての月）" className="ml-auto w-72 text-sm" aria-label="見積書を探す" />
      </div>

      {all.length === 0 ? (
        <GettingStarted data={data} update={update} goMaterials={goMaterials} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white shadow-sm">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-emerald-50 text-xs text-emerald-900">
              <tr>
                <th className="px-2 py-2 text-left">作成日</th>
                <th className="px-2 py-2 text-left">お客様名</th>
                <th className="px-2 py-2 text-left">保険者</th>
                <th className="px-2 py-2 text-left">担当</th>
                <th className="px-2 py-2 text-right">見積の合計（税込）</th>
                <th className="px-2 py-2 text-left">笹岡工務店の請求書</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map(({job, date, form, insurer, t}) => {
                // お客様名のない見積書は、作成日と金額でどれか分かるようにする
                const label = job.customer.trim() ? jobName(job) : `お客様名なし・${dateText(date)}・${yen(t.all.total)}円`;
                return (
                  <tr key={job.id} className="cursor-pointer border-t border-slate-100 hover:bg-emerald-50/60" onClick={() => onOpen(job.id)}>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums">{dateText(date)}</td>
                    <td className="px-2 py-2 font-bold text-slate-800">
                      {job.customer.trim() ? jobName(job) : <span className="text-slate-400">（お客様名なし）</span>}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {job.places
                          .map((p) => p.name)
                          .filter(Boolean)
                          .join('・')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs" title={`${FORM_INFO[form].name}「${FORM_INFO[form].title}」`}>
                      {insurer}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{staffShort(job.staff) || <span className="text-slate-400">—</span>}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-900">{yen(t.all.total)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs">
                      {job.shikiri ? (
                        <span className="rounded bg-[#0c315e] px-1.5 py-0.5 font-bold text-white">{monthLabel(job.month)}分に入れる</span>
                      ) : (
                        <span className="text-slate-400">入れない</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <Btn small color="white" onClick={() => onPrint({kind: 'estimate', jobId: job.id})}>
                        🖨 印刷
                      </Btn>
                      <Btn small color="white" className="ml-1.5" onClick={() => saveEstimateExcel(job, s, toast)}>
                        📗 Excel
                      </Btn>
                      <Btn small color="white" className="ml-1.5" onClick={() => onOpen(duplicateEstimate(job, update, toast).id)}>
                        複製
                      </Btn>
                      <Btn small color="rose" className="ml-1.5" onClick={() => removeEstimate(job, label, update, toast)}>
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
                  <td colSpan={4} className="px-2 py-2 text-right font-bold text-emerald-900">
                    {searching ? `「${query}」の見積書` : `${monthLabel(month)}に作った見積書`}（{list.length}件）
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-900">{yen(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          {list.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              {searching ? `「${query}」の見積書は見つかりませんでした。` : `${monthLabel(month)}に作った見積書はありません。◀ ▶ でほかの月を見られます。`}
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

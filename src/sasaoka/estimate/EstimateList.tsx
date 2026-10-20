import {useMemo, useState} from 'react';
import {estimateTotals, jobName} from '../calc.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {FORM_IDS, FORM_INFO, jobForm} from '../estimateForms.ts';
import {readDocDate} from '../print/docMeta.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {addSamples, hasSamples} from '../samples.ts';
import type {AppData, EstimateForm, Job} from '../types.ts';
import type {Update} from '../useStore.ts';
import {matchesAll, monthLabel, staffShort, thisMonth, uid, yen} from '../util.ts';

const SHOW_LIMIT = 100;

/** 新しい見積書。選んだ書式で作る。笹岡工務店の請求書には、選んだときだけ入れる */
export function newEstimate(form: EstimateForm): Job {
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
    form,
    overhead: null,
    overheadTarget: null,
    shikiri: false,
    places: [],
    createdAt: now,
    updatedAt: now,
  };
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

export function EstimateList({
  data,
  update,
  onOpen,
  onPrint,
  goMaterials,
}: {
  data: AppData;
  update: Update;
  onOpen: (id: string) => void;
  onPrint: (r: PrintRequest) => void;
  goMaterials: () => void;
}) {
  const toast = useToast();
  const s = data.settings;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(SHOW_LIMIT);

  // 作成日（見積書の右上の日付。入れていなければ作った日）の新しい順
  const all = useMemo(
    () =>
      data.jobs
        .map((job) => ({
          job,
          date: readDocDate(`est:${job.id}`) || isoOf(job.createdAt),
          form: jobForm(job, s),
          t: estimateTotals(job, s),
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || b.job.createdAt - a.job.createdAt),
    [data.jobs, s],
  );
  const list = useMemo(
    () => all.filter(({job}) => matchesAll(`${job.customer} ${job.address} ${job.staff} ${job.places.map((p) => p.name).join(' ')}`, query)),
    [all, query],
  );

  const add = (form: EstimateForm) => {
    const j = newEstimate(form);
    update('jobs', (jobs) => [...jobs, j]);
    onOpen(j.id);
  };

  const trySample = () => {
    const r = addSamples(data, thisMonth());
    update('materials', () => r.materials);
    update('jobs', () => r.jobs);
    update('kits', () => r.kits);
    toast('サンプルの部材5件と「（サンプル）山田様邸」の見積書・一式1件を入れました。設定画面からまとめて消せます。');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FORM_IDS.map((f) => (
          <Btn key={f} color="emerald" onClick={() => add(f)}>
            ＋ {FORM_INFO[f].name}の見積書
          </Btn>
        ))}
        <TextInput value={query} onChange={setQuery} placeholder="お客様名・住所・担当で探す" className="ml-auto w-64 text-sm" aria-label="見積書を探す" />
      </div>

      {all.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm leading-7 text-slate-600">
          <p className="text-base font-bold text-slate-800">見積書はまだありません。</p>
          <ol className="mt-2 list-decimal space-y-1 pl-6">
            <li>
              「
              <button type="button" className="font-bold text-emerald-800 underline" onClick={goMaterials}>
                部材リスト（★お気に入り）
              </button>
              」で、メーカーの価格表（Excel・CSV・PDF）を取り込み、よく使う部材に★を付けます（仕切り計算・請求書作成アプリと同じ部材リストです）。
            </li>
            <li>
              上の「＋ 苅田町・行橋用の見積書」か「＋ みやこ町・広域連合用の見積書」を押すと、いただいた見積書の形が出ます。Excel
              と同じように欄を選んで打ち込みます。
            </li>
            <li>
              品名を打つと部材リストの候補が出ます（★お気に入りが先）。備考（算出根拠）に定価を入れると、単価は定価×
              {s.estimateRate} になります。
            </li>
            <li>笹岡工務店の工事は、見積書の下の「笹岡工務店の請求書に入れる」を選ぶと、仕切り計算表と請求書に入ります。</li>
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
        <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white shadow-sm">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-emerald-50 text-xs text-emerald-900">
              <tr>
                <th className="px-2 py-2 text-left">作成日</th>
                <th className="px-2 py-2 text-left">お客様名</th>
                <th className="px-2 py-2 text-left">書式</th>
                <th className="px-2 py-2 text-left">担当</th>
                <th className="px-2 py-2 text-right">見積の合計（税込）</th>
                <th className="px-2 py-2 text-left">笹岡工務店の請求書</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map(({job, date, form, t}) => (
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
                  <td className="whitespace-nowrap px-2 py-2 text-xs">{FORM_INFO[form].name}</td>
                  <td className="whitespace-nowrap px-2 py-2">{staffShort(job.staff) || <span className="text-slate-400">—</span>}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-900">{yen(t.all.total)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">
                    {job.shikiri ? (
                      <span className="rounded bg-[#0c315e] px-1.5 py-0.5 font-bold text-white">{monthLabel(job.month)}分に入れる</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Btn
                      small
                      color="white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrint({kind: 'estimate', jobId: job.id});
                      }}
                    >
                      🖨 印刷
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">「{query}」の見積書は見つかりませんでした。</p>}
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

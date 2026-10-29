import {useEffect, useMemo, useState} from 'react';
import {estimateTotals, hasEstimateRows, jobName} from '../calc.ts';
import {copyJob} from '../components/JobTools.tsx';
import {askTrash, trashLabel, useTrashUndo} from '../components/TrashPage.tsx';
import {tokuteiItemJobs, tokuteiNames} from '../tokuteiLink.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {FORM_INFO, INSURER_IDS, INSURER_INFO, insurerLabel, jobForm, officeInsurer} from '../estimateForms.ts';
import {estimateXlsx, XLSX_TYPE} from '../estimateXlsx.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {DocImportDrop, useDocImport} from './DocImport.tsx';
import type {PrintRequest} from '../print/PrintView.tsx';
import {jutakuSales, jutakuSalesMonth, readTokuteiSales, rowSalesMonth, shiftSalesMonth, TOKUTEI_SALES_KEY} from '../salesPlan.ts';
import type {TokuteiSale} from '../salesPlan.ts';
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
 * 介護保険証は、ここ（メイン画面）ではなく様邸の画面の左の大きな欄に入れる（ユーザーの指示「各保険者のこの画面のこの辺に貼り付け欄を大きく設置し、
 * 貼り付けるようにする。メイン画面で貼り付けるのではなく」2026-10-23。CardReader.tsx の CardFill）
 */
export function EstimateHome({
  data,
  update,
  onNew,
  onList,
  onImported,
  goMaterials,
}: {
  data: AppData;
  update: Update;
  onNew: (insurer: Insurer) => void; // 新しい様邸（申請書と見積書のタブ）を開く
  onList: () => void;
  onImported: (month: string) => void; // 取り込んだあと（その月の一覧を開く）
  goMaterials: () => void;
}) {
  const all = useEstimates(data, data.settings);
  const docs = useDocImport(data, update, onImported);
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
                {/* 北九州市・福岡市の営業所は、その市をいちばん初めに（ユーザーの指示「北九州の事業所の場合は、デフォルトが北九州と広域の様式」2026-10-29） */}
                {INSURER_IDS.filter((i) => INSURER_INFO[i].form === 'yukuhashi')
                  .sort((a, b) => Number(b === officeInsurer(data.settings)) - Number(a === officeInsurer(data.settings)))
                  .map((i) => (
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
        {/* 新規作成（薄い緑）と同じ形で、薄い水色に色づけて分かるように（ユーザーの指示「一覧から作成の方も、薄く色づけてわかるようにする」2026-10-27。前は白い枠に白いボタン） */}
        <section className="rounded-xl border-2 border-sky-600 bg-white p-5 shadow-sm" aria-label="一覧から作成">
          <h2 className="text-xl font-bold text-sky-900">📋 一覧から作成</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
            <Btn color="sky" className="!px-5 !py-4 !text-base" onClick={onList}>
              📋 見積書の一覧を開く
            </Btn>
            <span className="text-sm text-slate-600">
              {monthLabel(month)}：{inMonth}件　／　全部で {all.length}件
            </span>
          </div>
          {/* 申請書・見積書・理由書の Excel を取り込む（ユーザーの指示「申請書や見積もり・理由書の取り込みをできるようにする」2026-10-27。DocImport.tsx） */}
          <div className="mt-3">
            <DocImportDrop onFiles={docs.start} onPick={docs.pick} />
          </div>
          {docs.element}
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
          見積書に行を入れると、{s.clientName || '工務店'}の仕切り計算表と請求書（「工務店請求書を確認する」）に入って自動で計算され、発注書も作れます。申請書だけの様邸（ほかの工務店の工事）は、請求書・発注書に入りません（{s.clientName || '工務店'}の工事でない見積書は、見積書の上の「{s.clientName || '工務店'}の請求書に入れる」を外します）。
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

/** 特定福祉用具のアプリが書いた案件のまとめ（売上月に使う。読めなければ空） */
function tokuteiSales(): TokuteiSale[] {
  try {
    return readTokuteiSales(localStorage.getItem(TOKUTEI_SALES_KEY)).rows;
  } catch {
    return [];
  }
}

/** 売上月の短い書き方：一覧の月と同じ年なら「11月」、ちがえば「2027年1月」 */
const shortMonth = (m: string, base: string) => (m.slice(0, 4) === base.slice(0, 4) ? `${Number(m.slice(5, 7))}月` : monthLabel(m));

/** 見積書の一覧（売上月＝様邸の月ごと。初めは作った月）。探すときは、すべての月から探す */
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
  onBack,
  onImported,
}: {
  data: AppData;
  update: Update;
  month: string;
  setMonth: (m: string) => void;
  onBack?: () => void; // 「← 戻る」：見積もりの入口（新規作成・一覧から作成）へ
  onImported?: (month: string) => void; // 取り込んだあと（その月の一覧にする）
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
  // 特定福祉用具の案件に商品の入っている様邸（行の先頭の「特福」の印）
  const tokuteiJobs = useMemo(() => tokuteiItemJobs(), [data.jobs]);
  const tokutei = useMemo(() => tokuteiSales(), [data.jobs, s.tokuteiSalesMonths]);
  const searching = query.trim() !== '';
  const docs = useDocImport(data, update, (m) => {
    setQuery('');
    (onImported ?? setMonth)(m);
  });
  const list = useMemo(
    () =>
      searching
        ? all.filter(({job, insurer}) => matchesAll(`${job.customer} ${names.get(job.id) ?? ''} ${job.address} ${job.staff} ${insurer} ${job.places.map((p) => p.name).join(' ')}`, query))
        : all.filter((e) => e.job.month === month),
    [all, query, searching, month, names],
  );
  // 見積の合計：見積書の行がなければ、取り込んだ見積書の合計か申請書の改修費用（売上見込み・受注残と同じ金額。salesPlan.ts の jutakuSales）
  const total = list.reduce((n, e) => n + (jutakuSales(e.job, s)?.total ?? 0), 0);
  const shown = list.slice(0, limit);
  // 一覧の先頭のチェック：選んだ様邸を次の月・前の月の一覧に回す（ユーザーの指示「先頭にチェックマークをつくり、次月にまわす、前月に回せるようにする」）。
  // 行ごとの「売上月」の ◀ ▶ も同じ（ユーザーの指示「何月分かっていうのを簡単に切り替えができるように一覧表の中で…切り替えた分に関しては受注残に飛ばすときにも、
  // その月の該当の月の受注残に含める」2026-10-26）。一覧の月は様邸の月（Job.month）。請求する月・売上見込みの月・この様邸の特定福祉用具の案件の月も一緒に移る
  // （salesPlan.ts の shiftSalesMonth。受注残には、移した月で入る）
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
  const shift = (ids: Set<string>, dir: 1 | -1) => {
    const months: Record<string, string> = {};
    for (const j of data.jobs) if (ids.has(j.id)) Object.assign(months, shiftSalesMonth(j, tokutei, s, dir).tokuteiMonths);
    update('jobs', (jobs) => jobs.map((j) => (ids.has(j.id) ? shiftSalesMonth(j, tokutei, s, dir).job : j)));
    if (Object.keys(months).length) update('settings', (st) => ({...st, tokuteiSalesMonths: {...st.tokuteiSalesMonths, ...months}}));
  };
  const moveMonth = (dir: 1 | -1) => {
    shift(checked, dir);
    toast(`${checked.size}件を${searching ? (dir === 1 ? '次の月' : '前の月') : monthLabel(addMonths(month, dir))}に回しました`);
    setChecked(new Set());
  };
  const moveOne = (job: Job, name: string, dir: 1 | -1) => {
    shift(new Set([job.id]), dir);
    toast(`${name}を${monthLabel(addMonths(rowSalesMonth(job, tokutei, s), dir))}分にしました`);
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
        {/* 見積もりの入口（新規作成・一覧から作成）へ（ユーザーの指示「戻るボタンを設置。（新規作成と一覧のページ）」2026-10-27。前は上の「見積もり・申請書を作成する」のタブを押し直すだけ） */}
        {onBack && (
          <Btn color="white" className="!text-base" onClick={onBack}>
            ← 戻る
          </Btn>
        )}
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
              className="h-8 w-[8.5rem] rounded border border-slate-300 px-1 text-sm sm:h-9 sm:w-[9.5rem] sm:text-base"
              aria-label="一覧の月"
            />
          </label>
          <button type="button" className="rounded-md px-3 py-1.5 text-lg font-bold text-slate-600 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="次の月">
            ▶
          </button>
        </div>
        <span className="text-base font-bold text-slate-600">＋ 新規作成：</span>
        {INSURER_IDS.map((i) => (
          <Btn key={i} color="emerald" className="!text-base" onClick={() => onNew(i)} title={`${INSURER_INFO[i].area}の見積書（${FORM_INFO[INSURER_INFO[i].form].name}「${FORM_INFO[INSURER_INFO[i].form].title}」）`}>
            ＋ {INSURER_INFO[i].name}
          </Btn>
        ))}
        <Btn color="purple" className="!text-base" onClick={docs.pick} title="申請書・見積書・理由書の Excel（.xlsx）を取り込む">
          📥 取り込む
        </Btn>
        {docs.element}
        <TextInput value={query} onChange={setQuery} placeholder="お客様名・住所で探す" title="すべての月から探します" className="ml-auto w-44 min-w-[10.5rem] max-w-[20rem] flex-1 text-base" aria-label="見積書を探す" />
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
          {/* 文字はひとまわり大きく（ユーザーの指示「全体の文字を少しだけ大きくする」2026-10-27。前は 本文 14px・見出し 12px） */}
          <table className="w-full min-w-[1200px] text-base">
            <thead className="bg-emerald-50 text-sm text-emerald-900">
              <tr>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">種類</th>
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map(({job}) => job.id)))}
                    className="h-5 w-5 align-middle"
                    aria-label="すべて選ぶ"
                  />
                </th>
                {/* 作成日・売上月は中身の幅だけ（スマホでもお客様名が見えるように） */}
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">作成日</th>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">売上月</th>
                <th className="min-w-[11rem] px-2 py-2 text-left">お客様名</th>
                <th className="px-2 py-2 text-right">見積の合計（税込）</th>
                <th className="px-2 py-2 text-left">{s.clientName || '工務店'}の請求書</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map(({job, date, t}) => {
                const estimated = hasEstimateRows(job); // 見積書を作った様邸（申請書だけの様邸は、請求書・発注書に入らない）
                const sales = jutakuSales(job, s); // 見積の合計（見積書の行がなければ、取り込んだ見積書の合計か申請書の改修費用）
                const housing = estimated || job.places.some((p) => p.name.trim()); // 住宅改修の見積書か申請書（改修の箇所）を作っている
                const name = job.customer.trim() ? jobName(job) : names.get(job.id) ? jobName({...job, customer: names.get(job.id)!}) : 'お客様名なし';
                const salesMonth = rowSalesMonth(job, tokutei, s);
                // 請求書に入れていて、売上月を請求する月とちがう月にしてある（まれ）：薄い黄色（見積書の上の「売上月」で直した月）
                const apart = estimated && job.shikiri && jutakuSalesMonth(job) !== job.month;
                const arrow = 'h-9 w-9 rounded text-base text-slate-500 hover:bg-slate-100 hover:text-slate-800';
                return (
                  <tr key={job.id} className={`cursor-pointer border-t border-slate-100 hover:bg-emerald-50/60 ${checked.has(job.id) ? 'bg-sky-50' : ''}`} onClick={() => onOpen(job.id)}>
                    {/* 何を作っているか（ユーザーの指示「何の申請書を作成しているかわからないので、住改・特福のマークを先頭の赤枠の部分につける。ただし、基本的に住所・名前などは
                        連動していると思うので、見積書作成（住宅改修）見積書（特定福祉用具）を作成途中のものを前提とする」2026-10-27）：
                        住改＝住宅改修の見積書に行がある（見積書がなくても改修の箇所を入れた申請書）、特福＝特定福祉用具の案件に商品がある（申請書と見積書は同じ商品）か、
                        特定福祉用具の案件があって住宅改修の方は何も作っていない（特定福祉用具申請書だけを作っている。お客様名は両方に連動するので名前では分けない）。両方なら両方 */}
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="inline-flex gap-1">
                        {housing && (
                          <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-sm text-emerald-800" title="住宅改修">
                            住改
                          </span>
                        )}
                        {(tokuteiJobs.has(job.id) || (!housing && names.has(job.id))) && (
                          <span className="rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-sm text-violet-800" title="特定福祉用具">
                            特福
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.has(job.id)} onChange={() => toggle(job.id)} className="h-5 w-5 align-middle" aria-label="選ぶ" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                      {/* スマホは年を出さない（売上月の ◀ ▶ とお客様名を見えるように） */}
                      <span className="hidden sm:inline">{dateText(date).replace(/\/.*$/, '/')}</span>
                      {dateText(date).replace(/^\d+\//, '')}
                    </td>
                    {/* 売上月（工事・販売の月）。見積もり作成日とは別。◀ ▶ で前の月・次の月へ（受注残・売上見込み・請求書もこの月）。
                        名前は「売上月」だけ（お客様名を入れると、お客様名で行のセルを探すときに2つ見つかる） */}
                    <td className="whitespace-nowrap px-1 py-1" onClick={(e) => e.stopPropagation()}>
                      <span
                        role="group"
                        aria-label="売上月"
                        title={apart ? `${name}の売上月（請求する月とちがう月）` : `${name}の売上月`}
                        className={`inline-flex items-center rounded-md border ${apart ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
                      >
                        <button type="button" className={arrow} onClick={() => moveOne(job, name, -1)} aria-label="売上月を前月に">
                          ◀
                        </button>
                        <span className="min-w-[3rem] px-1 text-center font-bold tabular-nums text-slate-800">{shortMonth(salesMonth, searching ? thisMonth() : month)}</span>
                        <button type="button" className={arrow} onClick={() => moveOne(job, name, 1)} aria-label="売上月を次月に">
                          ▶
                        </button>
                      </span>
                    </td>
                    {/* 改修場所（玄関・トイレ…）・保険者・担当は出さない（ユーザーの指示「詳細や、保険者名、担当名などは不要」） */}
                    <td className="px-2 py-2 font-bold text-slate-800">
                      {job.customer.trim() ? (
                        jobName(job)
                      ) : names.get(job.id) ? (
                        <>
                          {jobName({...job, customer: names.get(job.id)!})}
                          <span className="ml-1.5 text-sm font-normal text-slate-500">特定福祉用具</span>
                        </>
                      ) : (
                        <span className="text-slate-400">（お客様名なし）</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-900" title={sales && !estimated ? (job.imported?.some((d) => d.kind === 'estimate' && !d.rows) ? '取り込んだ見積書の合計' : '申請書の改修費用') : undefined}>
                      {sales ? yen(sales.total) : <span className="font-normal text-slate-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm">
                      {job.shikiri ? (
                        <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-bold text-[#0c315e]">{monthLabel(job.month)}分に入れる</span>
                      ) : estimated ? (
                        <span className="text-slate-400">入れない</span>
                      ) : (
                        <span className="text-slate-500">申請書だけ</span>
                      )}
                    </td>
                    {/* 行のボタン（申請書・印刷・Excel・複製・削除）：右の端から少し左へ（ユーザーの指示「赤枠の部分を少しだけ中央（左に寄せる）」2026-10-27）。字は 14px */}
                    <td className="whitespace-nowrap py-1.5 pl-2 pr-2 text-right xl:pr-28 [&_button]:!text-sm" onClick={(e) => e.stopPropagation()}>
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
                <tr className="border-t border-slate-200 bg-emerald-50/60 text-base">
                  <td colSpan={5} className="px-2 py-2 text-right font-bold text-emerald-900">
                    {searching ? `「${query}」の見積書` : `${monthLabel(month)}の見積書`}（{list.length}件）
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-900">{yen(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          {list.length === 0 && (
            <p className="px-4 py-6 text-center text-base text-slate-500">
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

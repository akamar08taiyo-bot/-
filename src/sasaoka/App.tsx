// 住宅改修の見積書と、笹岡工務店への請求書（仕切り計算）と、部材・工賃のマスタを、タブで切り替えて使う1つのアプリ。
// 太陽ポータルの2つの入口（jutaku-mitsumori/・sasaoka/）は同じアプリで、最初に開くタブ（start）だけが違う。
//   見積もりを作成する：「新規作成」か「一覧から作成」（作った月ごとの一覧）を選び、いただいた見積書
//                       （苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」・広域連合用「住宅改修内訳明細書」）の形のまま打ち込む。
//                       打ち込んだ内容は、そのまま笹岡工務店の仕切り計算表・請求書に入る（入れない見積書は外せる）
//   請求書を確認する：請求する月ごとの様邸（仕切り計算表）と、1か月分の御請求書
//   部材・工賃マスタ：部材リスト（メーカーの仕切価格・定価）と、工賃（笹岡工務店の取付手間の単価）
//   設定

import {useEffect, useMemo, useState} from 'react';
import {JobEditor} from './components/JobEditor.tsx';
import {JobsPage} from './components/JobsPage.tsx';
import {LaborPage} from './components/LaborPage.tsx';
import {MaterialsPage} from './components/MaterialsPage.tsx';
import {SettingsPage} from './components/SettingsPage.tsx';
import {ToastProvider} from './components/ui.tsx';
import {EstimateEditor} from './estimate/EstimateEditor.tsx';
import {EstimateHome, EstimateList, newEstimate} from './estimate/EstimateList.tsx';
import {APP_TITLE, PORTAL_URL, readHash, writeHash} from './links.ts';
import type {MainTab} from './links.ts';
import {PrintView} from './print/PrintView.tsx';
import type {PrintRequest} from './print/PrintView.tsx';
import type {EstimateForm, Job} from './types.ts';
import {useStore} from './useStore.ts';
import {thisMonth} from './util.ts';

const TABS: {id: MainTab; label: string}[] = [
  {id: 'estimate', label: '📝 見積もりを作成する'},
  {id: 'invoice', label: '🧾 請求書を確認する'},
  {id: 'master', label: '📦 部材・工賃マスタ'},
  {id: 'settings', label: '⚙ 設定'},
];

// タブごとの色（見積書は緑、請求書は紺、部材・工賃マスタは紫、設定は灰）。選んでいるタブは下の画面と同じ色にしてつなげる
const THEME: Record<MainTab, {head: string; page: string; active: string; sub: string; width: string}> = {
  estimate: {head: 'bg-[#14532d]', page: 'bg-[#f2f6f4]', active: 'bg-[#f2f6f4] text-[#14532d]', sub: 'text-green-100', width: 'max-w-[1600px]'},
  invoice: {head: 'bg-[#0c315e]', page: 'bg-[#f3f6fa]', active: 'bg-[#f3f6fa] text-[#0c315e]', sub: 'text-blue-100', width: 'max-w-[1400px]'},
  master: {head: 'bg-[#3b1f6b]', page: 'bg-[#f6f4fa]', active: 'bg-[#f6f4fa] text-[#3b1f6b]', sub: 'text-purple-100', width: 'max-w-[1400px]'},
  settings: {head: 'bg-[#334155]', page: 'bg-[#f4f5f7]', active: 'bg-[#f4f5f7] text-[#334155]', sub: 'text-slate-200', width: 'max-w-[1400px]'},
};

type MasterTab = 'materials' | 'labor';

const MONTH_KEY = 'sasaoka-app:ui-month';

function loadMonth(): string {
  try {
    const m = sessionStorage.getItem(MONTH_KEY);
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  } catch {
    /* 使えなければ今月 */
  }
  return thisMonth();
}

/** 何も入れていない見積書・様邸（作ってすぐ戻ったもの。残さない） */
const isEmpty = (j: Job) => !j.customer.trim() && !j.staff && j.places.length === 0 && !j.address && !j.insuredNo && !j.date && !j.note;

export default function App({start}: {start: MainTab}) {
  const store = useStore();
  // URL に #tab=…&job=… があれば、そのタブ・見積書（様邸）を開く（前の版の #job=… は、最初のタブで開く）
  const [initial] = useState(readHash);
  const [tab, setTab] = useState<MainTab>(initial.tab ?? start);
  const [estimateId, setEstimateId] = useState<string | null>((initial.tab ?? start) === 'estimate' ? initial.job : null);
  const [invoiceId, setInvoiceId] = useState<string | null>((initial.tab ?? start) === 'invoice' ? initial.job : null);
  // 見積もりを作成する：最初の画面（新規作成・一覧から作成）か、月ごとの一覧か
  // URL から見積書を開いたとき（読み直したとき）は、戻ると一覧
  const [estimateView, setEstimateView] = useState<'home' | 'list'>(estimateId ? 'list' : 'home');
  const [estimateMonth, setEstimateMonth] = useState(thisMonth);
  const [month, setMonth] = useState(loadMonth); // 請求書を確認する：請求する月
  const [masterTab, setMasterTab] = useState<MasterTab>('materials');
  const [print, setPrint] = useState<PrintRequest | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(MONTH_KEY, month);
    } catch {
      /* 覚えられなくても困らない */
    }
  }, [month]);

  const data = store.data;
  const estimateJob = useMemo(() => (data && estimateId ? (data.jobs.find((j) => j.id === estimateId) ?? null) : null), [data, estimateId]);
  // 請求書に入れていない見積書（「笹岡工務店の請求書に入れる」を外したもの）は、請求書の画面では開かない
  const invoiceJob = useMemo(() => (data && invoiceId ? (data.jobs.find((j) => j.id === invoiceId && j.shikiri) ?? null) : null), [data, invoiceId]);
  const loaded = data !== null;
  // 開いている様邸の請求する月の一覧に戻れるように、その月にしておく
  useEffect(() => {
    if (invoiceJob) setMonth(invoiceJob.month);
  }, [invoiceJob?.id]);
  useEffect(() => {
    if (loaded) writeHash(tab, tab === 'estimate' ? (estimateJob?.id ?? null) : tab === 'invoice' ? (invoiceJob?.id ?? null) : null);
  }, [loaded, tab, estimateJob?.id, invoiceJob?.id]);
  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  if (store.loadError) {
    return <div className="p-8 text-rose-700">データを読み込めませんでした：{store.loadError}</div>;
  }
  if (!data) {
    return <div className="p-8 text-slate-500">読み込んでいます…</div>;
  }

  const theme = THEME[tab];
  const removeIfEmpty = (job: Job | null) => {
    if (job && isEmpty(job)) store.update('jobs', (list) => list.filter((j) => j.id !== job.id));
  };
  const goTab = (t: MainTab) => {
    // 同じタブをもう一度押したら、そのタブの最初の画面に戻る
    if (t === tab) {
      if (t === 'estimate') {
        removeIfEmpty(estimateJob);
        setEstimateId(null);
        setEstimateView('home');
      }
      if (t === 'invoice') {
        removeIfEmpty(invoiceJob);
        setInvoiceId(null);
      }
    }
    setTab(t);
  };
  const newOne = (form: EstimateForm) => {
    const j = newEstimate(form);
    store.update('jobs', (jobs) => [...jobs, j]);
    setEstimateId(j.id);
  };
  // 見積書と請求書（仕切り計算表）を行き来する（同じ様邸を開く）
  const openEstimate = (id: string) => {
    setEstimateId(id);
    setTab('estimate');
  };
  const openInvoice = (id: string) => {
    setInvoiceId(id);
    setTab('invoice');
  };
  const goMaster = (t: MasterTab = 'materials') => {
    setMasterTab(t);
    setTab('master');
  };

  return (
    <ToastProvider>
      <div className={`min-h-screen ${theme.page} text-slate-800 ${print ? 'no-print' : ''}`}>
        <header className={`no-print ${theme.head} text-white transition-colors`}>
          <div className={`mx-auto flex ${theme.width} flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-lg font-black">住</div>
              <div>
                <div className="text-base font-bold leading-tight">住宅改修 見積書・請求書</div>
                <div className={`text-[11px] ${theme.sub}`}>
                  請求先：{data.settings.clientName || '（未設定）'}　／　{data.settings.officeName || '営業所未設定'}
                </div>
              </div>
            </div>
            <div className={`ml-auto flex flex-wrap items-center gap-3 text-[11px] ${theme.sub}`}>
              {store.saveError ? (
                <span className="rounded bg-rose-100 px-2 py-1 font-bold text-rose-800">{store.saveError}</span>
              ) : (
                <span>{store.savedAt ? 'この端末に自動保存しました' : 'この端末に自動保存します'}</span>
              )}
              <a href={PORTAL_URL} className="rounded-md border border-white/30 px-2.5 py-1.5 font-bold text-white hover:bg-white/10">
                業務アプリポータルへ
              </a>
            </div>
          </div>
          <nav className={`mx-auto flex ${theme.width} gap-1 overflow-x-auto px-3`}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`whitespace-nowrap rounded-t-lg px-5 py-2.5 text-[15px] font-bold transition ${tab === t.id ? theme.active : `${theme.sub} hover:bg-white/10`}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className={`no-print mx-auto min-w-0 px-3 py-4 sm:px-4 ${theme.width}`}>
          {tab === 'estimate' &&
            (estimateJob ? (
              <EstimateEditor
                key={estimateJob.id}
                job={estimateJob}
                data={data}
                update={store.update}
                onBack={() => {
                  removeIfEmpty(estimateJob);
                  setEstimateId(null);
                }}
                onOpen={setEstimateId}
                onOpenInvoice={openInvoice}
                onPrint={setPrint}
              />
            ) : estimateView === 'home' ? (
              <EstimateHome data={data} update={store.update} onNew={newOne} onList={() => setEstimateView('list')} goMaterials={() => goMaster()} />
            ) : (
              <EstimateList
                data={data}
                update={store.update}
                month={estimateMonth}
                setMonth={setEstimateMonth}
                onOpen={setEstimateId}
                onNew={newOne}
                onPrint={setPrint}
                goMaterials={() => goMaster()}
              />
            ))}
          {tab === 'invoice' &&
            (invoiceJob ? (
              <JobEditor
                job={invoiceJob}
                data={data}
                update={store.update}
                onBack={() => {
                  // 何も入れずに戻った様邸は残さない。請求月を変えていたら、その月の一覧に戻る
                  if (isEmpty(invoiceJob)) removeIfEmpty(invoiceJob);
                  else setMonth(invoiceJob.month);
                  setInvoiceId(null);
                }}
                onOpen={setInvoiceId}
                onOpenEstimate={openEstimate}
                onPrint={setPrint}
              />
            ) : (
              <JobsPage
                data={data}
                update={store.update}
                month={month}
                setMonth={setMonth}
                onOpen={setInvoiceId}
                onPrint={setPrint}
                goMaterials={() => goMaster()}
                goEstimate={() => goTab('estimate')}
              />
            ))}
          {tab === 'master' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="部材・工賃マスタ">
                {(
                  [
                    ['materials', `部材リスト（${data.materials.length}件）`],
                    ['labor', `工賃（笹岡工務店の手間・${data.labor.length}項目）`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={masterTab === id}
                    onClick={() => setMasterTab(id)}
                    className={`rounded-lg border-2 px-5 py-2.5 text-[15px] font-bold shadow-sm transition ${
                      masterTab === id ? 'border-[#3b1f6b] bg-[#3b1f6b] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {masterTab === 'materials' ? <MaterialsPage data={data} update={store.update} /> : <LaborPage data={data} update={store.update} />}
            </div>
          )}
          {tab === 'settings' && <SettingsPage data={data} update={store.update} />}
        </main>
      </div>
      {print && <PrintView request={print} data={data} onClose={() => setPrint(null)} />}
    </ToastProvider>
  );
}

// 住宅改修の見積書と、笹岡工務店への請求書（仕切り計算）と、部材・施工費のマスタを、タブで切り替えて使う1つのアプリ。
// 太陽ポータルの2つの入口（jutaku-mitsumori/・sasaoka/）は同じアプリで、最初に開くタブ（start）だけが違う。
//   見積もりを作成する：「新規作成」か「一覧から作成」（作った月ごとの一覧）を選ぶ。新規作成で保険者を選ぶと、
//                       様邸の画面に2つのタブ（左に申請書、右に見積書）ができる（ユーザーの指示）。同じ様邸の内容なので、どちらで直しても両方に出る。
//                       申請書は保険者の Excel の様式のまま画面に出して、欄を押して入れる。見積書はいただいた見積書
//                       （苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」・広域連合用「住宅改修内訳明細書」）の形のまま打ち込む。
//                       見積書に打ち込んだ内容は、そのまま笹岡工務店の仕切り計算表・請求書に入る（入れない見積書は外せる）
//   請求書を確認する：請求する月ごとの様邸（仕切り計算表）と、1か月分の御請求書
//   部材・施工費マスタ：部材リスト（メーカーの仕切価格・定価）と、施工費（笹岡工務店の取付手間の単価）と、
//                       部材＋施工費（常用）のセット（よく使う部材と施工費の組み合わせ）
//   設定

import {useEffect, useMemo, useState} from 'react';
import {hasEstimateRows} from './calc.ts';
import {JobEditor} from './components/JobEditor.tsx';
import {JobsPage} from './components/JobsPage.tsx';
import {KitsPage} from './components/KitsPage.tsx';
import {LaborPage} from './components/LaborPage.tsx';
import {MaterialsPage} from './components/MaterialsPage.tsx';
import {SettingsPage} from './components/SettingsPage.tsx';
import {ToastProvider} from './components/ui.tsx';
import {LABOR_REV} from './defaults.ts';
import {EstimateEditor} from './estimate/EstimateEditor.tsx';
import {EstimateHome, EstimateList, newEstimate} from './estimate/EstimateList.tsx';
import {OrderPage} from './estimate/OrderPage.tsx';
import {ShinseiEditor} from './estimate/ShinseiEditor.tsx';
import {hasShinseiInfo} from './estimateForms.ts';
import {APP_TITLE, PORTAL_URL, readHash, writeHash} from './links.ts';
import type {JobView, MainTab} from './links.ts';
import {prunePhotos} from './photos.ts';
import {PrintView} from './print/PrintView.tsx';
import type {PrintRequest} from './print/PrintView.tsx';
import {EXAMPLE_KIT_ID, exampleKit} from './samples.ts';
import type {Insurer, Job, Row} from './types.ts';
import {useNewVersion} from './update.ts';
import {useStore} from './useStore.ts';
import {thisMonth} from './util.ts';

const TABS: {id: MainTab; label: string}[] = [
  {id: 'estimate', label: '📝 見積もりを作成する'},
  {id: 'invoice', label: '🧾 請求書を確認する'},
  {id: 'master', label: '📦 部材・施工費マスタ'},
  {id: 'settings', label: '⚙ 設定'},
];

// タブごとの色（見積書は緑、請求書は紺、部材・施工費マスタは紫、設定は灰）。選んでいるタブは下の画面と同じ色にしてつなげる
const THEME: Record<MainTab, {head: string; page: string; active: string; sub: string; width: string}> = {
  estimate: {head: 'bg-[#14532d]', page: 'bg-[#f2f6f4]', active: 'bg-[#f2f6f4] text-[#14532d]', sub: 'text-green-100', width: 'max-w-[1600px]'},
  invoice: {head: 'bg-[#0c315e]', page: 'bg-[#f3f6fa]', active: 'bg-[#f3f6fa] text-[#0c315e]', sub: 'text-blue-100', width: 'max-w-[1400px]'},
  master: {head: 'bg-[#3b1f6b]', page: 'bg-[#f6f4fa]', active: 'bg-[#f6f4fa] text-[#3b1f6b]', sub: 'text-purple-100', width: 'max-w-[1400px]'},
  settings: {head: 'bg-[#334155]', page: 'bg-[#f4f5f7]', active: 'bg-[#f4f5f7] text-[#334155]', sub: 'text-slate-200', width: 'max-w-[1400px]'},
};

type MasterTab = 'materials' | 'labor' | 'kits';

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

/**
 * 様邸の画面の2つのタブ：左に申請書、右に見積書（ユーザーの指示「新規作成で、保険者を選んだら、2種類、タブを作る。左側に、申請書、右側に見積もり」）。
 * 同じ様邸の内容（氏名・住所・被保険者番号・改修の箇所・金額）なので、どちらで直しても、もう一方にすぐ出る
 */
function JobTabs({view, onView}: {view: JobView; onView: (v: JobView) => void}) {
  const tabs: [JobView, string][] = [
    ['shinsei', '📝 申請書'],
    ['estimate', '📋 見積書'],
  ];
  return (
    <div role="tablist" aria-label="申請書と見積書" className="inline-flex overflow-hidden rounded-lg border-2 border-[#14532d] bg-white shadow-sm">
      {tabs.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onView(v)}
          className={`px-5 py-2 text-[15px] font-bold transition ${view === v ? 'bg-[#14532d] text-white' : 'text-[#14532d] hover:bg-emerald-50'}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** 何も入れていない見積書・様邸・申請書（作ってすぐ戻ったもの。残さない） */
const isEmpty = (j: Job) => !j.customer.trim() && !j.staff && j.places.length === 0 && !j.address && !j.insuredNo && !j.date && !j.note && !hasShinseiInfo(j.shinsei);

export default function App({start}: {start: MainTab}) {
  const store = useStore();
  const newVersion = useNewVersion();
  // URL に #tab=…&job=… があれば、そのタブ・見積書（様邸）を開く（前の版の #job=… は、最初のタブで開く）
  const [initial] = useState(readHash);
  const [tab, setTab] = useState<MainTab>(initial.tab ?? start);
  const [estimateId, setEstimateId] = useState<string | null>((initial.tab ?? start) === 'estimate' ? initial.job : null);
  const [invoiceId, setInvoiceId] = useState<string | null>((initial.tab ?? start) === 'invoice' ? initial.job : null);
  // 見積もりを作成する：最初の画面（新規作成・一覧から作成）か、月ごとの一覧か
  // URL から見積書を開いたとき（読み直したとき）は、戻ると一覧
  const [estimateView, setEstimateView] = useState<'home' | 'list'>(estimateId ? 'list' : 'home');
  // 見積書の画面か、そこから開いた発注書・申請書か（見積書を閉じると見積書の画面にもどる）
  const [jobView, setJobView] = useState<JobView>(estimateId ? initial.view : 'estimate');
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
    if (loaded) writeHash(tab, tab === 'estimate' ? (estimateJob?.id ?? null) : tab === 'invoice' ? (invoiceJob?.id ?? null) : null, tab === 'estimate' ? jobView : 'estimate');
  }, [loaded, tab, estimateJob?.id, invoiceJob?.id, jobView]);
  // 見積書を閉じたら、発注書・申請書も閉じる
  useEffect(() => {
    if (loaded && !estimateJob) setJobView('estimate');
  }, [loaded, estimateJob?.id]);
  useEffect(() => {
    document.title = APP_TITLE;
  }, []);
  // 部材＋施工費（常用）の例を1つ入れておく（ユーザーの指示。一度だけ。消したら入れ直さない）
  useEffect(() => {
    if (!data || data.settings.kitExample) return;
    const kit = exampleKit(data.materials, data.labor);
    store.update('kits', (list) => (list.some((k) => k.id === EXAMPLE_KIT_ID) ? list : [...list, kit]));
    store.update('settings', (s) => ({...s, kitExample: true}));
  }, [loaded]);
  // 取付手間に見積の単価ができる前に作った見積書：取付手間のマスタの見積の単価を入れる（一度だけ）
  useEffect(() => {
    if (!data || data.settings.laborEst) return;
    const est = new Map(data.labor.map((l) => [l.id, l.estPrice]));
    const fix = (r: Row): Row => (r.kind === 'labor' && r.refId && r.estPrice === null && est.get(r.refId) != null ? {...r, estPrice: est.get(r.refId) ?? null} : r);
    store.update('jobs', (jobs) => {
      const next = jobs.map((j) => (j.places.some((p) => p.rows.some((r) => fix(r) !== r)) ? {...j, places: j.places.map((p) => ({...p, rows: p.rows.map(fix)}))} : j));
      return next.some((j, i) => j !== jobs[i]) ? next : jobs;
    });
    store.update('settings', (s) => ({...s, laborEst: true}));
  }, [loaded]);
  // 取付手間の見積の単価を直した（版2：踏台 木 は1箇所 2,000円。ユーザーの指示）。前に保存したマスタと見積書の行で、空のままのものだけ直す（一度だけ。手で入れた単価は変えない）
  useEffect(() => {
    if (!data || data.settings.laborRev >= LABOR_REV) return;
    const fixes = new Map<string, number>([['l07', 2000]]);
    store.update('labor', (list) => {
      const next = list.map((l) => (l.estPrice === null && fixes.has(l.id) ? {...l, estPrice: fixes.get(l.id) ?? null} : l));
      return next.some((l, i) => l !== list[i]) ? next : list;
    });
    const fix = (r: Row): Row => (r.kind === 'labor' && r.refId && r.estPrice === null && fixes.has(r.refId) ? {...r, estPrice: fixes.get(r.refId) ?? null} : r);
    store.update('jobs', (jobs) => {
      const next = jobs.map((j) => (j.places.some((p) => p.rows.some((r) => fix(r) !== r)) ? {...j, places: j.places.map((p) => ({...p, rows: p.rows.map(fix)}))} : j));
      return next.some((j, i) => j !== jobs[i]) ? next : jobs;
    });
    store.update('settings', (s) => ({...s, laborRev: LABOR_REV}));
  }, [loaded]);

  // どの様邸からも使われなくなった写真（写真を消した・差し替えた・様邸を消した）を、この端末から消す。開いたときに一度。
  // ほかのタブで入れたばかりの写真（まだ様邸に保存されていないかもしれない）を消さないように、1時間より前に入れた写真だけ
  useEffect(() => {
    if (!data) return;
    const keep = new Set(data.jobs.flatMap((j) => j.places.flatMap((p) => [p.photos?.before ?? '', p.photos?.after ?? ''])).filter(Boolean));
    prunePhotos(keep, Date.now() - 60 * 60 * 1000).catch(() => undefined);
  }, [loaded]);

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
        setJobView('estimate');
      }
      if (t === 'invoice') {
        // 様邸から一覧に戻る（様邸の画面の左上は「← 見積もりへ戻る」なので、一覧へはこのタブで戻る）。請求月を変えていたら、その月の一覧
        if (invoiceJob && !isEmpty(invoiceJob)) setMonth(invoiceJob.month);
        removeIfEmpty(invoiceJob);
        setInvoiceId(null);
      }
    }
    setTab(t);
  };
  // 新規作成：保険者を選ぶと、申請書と見積書のタブのある様邸の画面を開く（左の申請書のタブから）。
  // 見積書に行を入れるまでは、見積もり作成日は空・笹岡工務店の請求書には入れない（申請書だけの様邸を請求書に入れないため。calc.ts の startEstimate）
  const newOne = (insurer: Insurer) => {
    const j = newEstimate(insurer);
    store.update('jobs', (jobs) => [...jobs, j]);
    setEstimateId(j.id);
    setJobView('shinsei');
  };
  const openShinsei = (id: string) => {
    setEstimateId(id);
    setJobView('shinsei');
  };
  // 一覧から開く：見積書を作ってあれば見積書のタブ、まだ申請書だけなら申請書のタブ
  const openJob = (id: string) => {
    const j = data.jobs.find((x) => x.id === id);
    setEstimateId(id);
    setJobView(j && !j.estDate && !hasEstimateRows(j) ? 'shinsei' : 'estimate');
  };
  const tabs = <JobTabs view={jobView} onView={setJobView} />;
  // 見積書と請求書（仕切り計算表）を行き来する（同じ様邸を開く）
  const openEstimate = (id: string) => {
    setEstimateId(id);
    setJobView('estimate');
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
      {newVersion && (
        // 新しい版が出ている（スマホなどで前の版が出たままのとき）。打ち込んだ内容を保存してから読み込み直す
        <div role="status" className="no-print sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-sm font-bold text-slate-900 shadow">
          このアプリの新しい版が出ています。
          <button
            type="button"
            onClick={() => void store.flush().then(() => location.reload())}
            className="rounded-md border border-slate-900/20 bg-white px-3 py-1.5 font-bold text-slate-900 shadow-sm hover:bg-amber-50"
          >
            ⟳ 読み込み直す
          </button>
        </div>
      )}
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
            (estimateJob && jobView === 'order' && hasEstimateRows(estimateJob) ? (
              <OrderPage key={estimateJob.id} job={estimateJob} data={data} update={store.update} onBack={() => setJobView('estimate')} onPrint={setPrint} />
            ) : estimateJob && jobView === 'shinsei' ? (
              <ShinseiEditor
                key={estimateJob.id}
                job={estimateJob}
                data={data}
                update={store.update}
                onBack={() => {
                  removeIfEmpty(estimateJob);
                  setEstimateId(null);
                  setJobView('estimate');
                }}
                tabs={tabs}
              />
            ) : estimateJob ? (
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
                onOpenOrder={() => setJobView('order')}
                tabs={tabs}
                onPrint={setPrint}
                onSave={store.flush}
                onManageKits={() => goMaster('kits')}
              />
            ) : estimateView === 'home' ? (
              <EstimateHome
                data={data}
                update={store.update}
                onNew={newOne}
                onCreate={(j) => {
                  store.update('jobs', (jobs) => [...jobs, j]);
                  setEstimateId(j.id);
                  setJobView('estimate');
                }}
                onList={() => setEstimateView('list')}
                goMaterials={() => goMaster()}
              />
            ) : (
              <EstimateList
                data={data}
                update={store.update}
                month={estimateMonth}
                setMonth={setEstimateMonth}
                onOpen={openJob}
                onOpenShinsei={openShinsei}
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
                onBackToEstimate={() => {
                  // この様邸の見積書を開き、請求書のタブは一覧に戻しておく（請求月を変えていたら、その月）。空の様邸も見積書で開く（見積書を閉じるときに消える）
                  if (!isEmpty(invoiceJob)) setMonth(invoiceJob.month);
                  setInvoiceId(null);
                  openEstimate(invoiceJob.id);
                }}
                onPrint={setPrint}
                onManageKits={() => goMaster('kits')}
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
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="部材・施工費マスタ">
                {(
                  [
                    ['materials', `部材リスト（${data.materials.length}件）`],
                    ['labor', `施工費（笹岡工務店の手間・${data.labor.length}項目）`],
                    ['kits', `部材＋施工費（常用・${data.kits.length}件）`],
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
              {masterTab === 'materials' && <MaterialsPage data={data} update={store.update} />}
              {masterTab === 'labor' && <LaborPage data={data} update={store.update} />}
              {masterTab === 'kits' && <KitsPage data={data} update={store.update} />}
            </div>
          )}
          {tab === 'settings' && <SettingsPage data={data} update={store.update} />}
        </main>
      </div>
      {print && <PrintView request={print} data={data} onClose={() => setPrint(null)} />}
    </ToastProvider>
  );
}

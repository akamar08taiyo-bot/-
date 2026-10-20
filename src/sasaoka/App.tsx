import {useEffect, useMemo, useState} from 'react';
import {JobEditor} from './components/JobEditor.tsx';
import {JobsPage} from './components/JobsPage.tsx';
import {LaborPage} from './components/LaborPage.tsx';
import {MaterialsPage} from './components/MaterialsPage.tsx';
import {SettingsPage} from './components/SettingsPage.tsx';
import {ToastProvider} from './components/ui.tsx';
import {appUrl, APP_NAMES, hashJobId, PORTAL_URL, setHashJobId} from './links.ts';
import {PrintView} from './print/PrintView.tsx';
import type {PrintRequest} from './print/PrintView.tsx';
import {useStore} from './useStore.ts';
import {thisMonth} from './util.ts';

type Tab = 'jobs' | 'materials' | 'labor' | 'settings';

const TABS: {id: Tab; label: string}[] = [
  {id: 'jobs', label: '様邸一覧（月ごと）'},
  {id: 'materials', label: '部材リスト（メーカー仕切り）'},
  {id: 'labor', label: '取付手間の単価'},
  {id: 'settings', label: '設定'},
];

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

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('jobs');
  const [month, setMonth] = useState(loadMonth);
  // 見積書作成アプリの「仕切り計算・請求書作成で開く」から来たときは、その様邸を開く
  const [openJobId, setOpenJobId] = useState<string | null>(hashJobId);
  const [print, setPrint] = useState<PrintRequest | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(MONTH_KEY, month);
    } catch {
      /* 覚えられなくても困らない */
    }
  }, [month]);

  const data = store.data;
  // 請求書に入れていない見積書（見積書作成アプリで「笹岡工務店の請求書に入れる」を選んでいないもの）は開かない
  const openJob = useMemo(() => (data && openJobId ? data.jobs.find((j) => j.id === openJobId && j.shikiri) ?? null : null), [data, openJobId]);
  const width = 'max-w-[1400px]';
  const loaded = data !== null;
  // 開いている様邸の請求する月の一覧に戻れるように、その月にしておく。開いている様邸は URL にも残す
  useEffect(() => {
    if (openJob) setMonth(openJob.month);
  }, [openJob?.id]);
  useEffect(() => {
    if (loaded) setHashJobId(tab === 'jobs' && openJob ? openJob.id : null);
  }, [loaded, tab, openJob?.id]);

  if (store.loadError) {
    return <div className="p-8 text-rose-700">データを読み込めませんでした：{store.loadError}</div>;
  }
  if (!data) {
    return <div className="p-8 text-slate-500">読み込んでいます…</div>;
  }

  return (
    <ToastProvider>
      <div className={`min-h-screen bg-[#f3f6fa] text-slate-800 ${print ? 'no-print' : ''}`}>
        <header className="no-print bg-[#0c315e] text-white">
          <div className={`mx-auto flex ${width} flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-lg font-black">仕</div>
              <div>
                <div className="text-base font-bold leading-tight">{APP_NAMES.shikiri}</div>
                <div className="text-[11px] text-blue-100">
                  請求先：{data.settings.clientName || '（未設定）'}　／　{data.settings.officeName || '営業所未設定'}
                </div>
              </div>
            </div>
            <a
              href={appUrl('estimate')}
              className="rounded-md bg-[#14532d] px-3 py-1.5 text-sm font-bold text-white shadow hover:bg-[#166534]"
              title="見積書は別のアプリで作ります（部材リスト・★お気に入りは同じものを使います）"
            >
              📝 見積書は「{APP_NAMES.estimate}」へ
            </a>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-blue-100">
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
          <nav className={`mx-auto flex ${width} gap-1 overflow-x-auto px-3`}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setOpenJobId(null);
                }}
                className={`whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-bold transition ${
                  tab === t.id ? 'bg-[#f3f6fa] text-[#0c315e]' : 'text-blue-100 hover:bg-white/10'
                }`}
              >
                {t.label}
                {t.id === 'materials' && data.materials.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-purple-100 px-1.5 text-[10px] text-purple-800">{data.materials.length}</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        <main className={`no-print mx-auto min-w-0 px-3 py-4 sm:px-4 ${width}`}>
          {tab === 'jobs' &&
            (openJob ? (
              <JobEditor
                job={openJob}
                data={data}
                update={store.update}
                onBack={() => {
                  // 何も入れずに戻った様邸は残さない。請求月を変えていたら、その月の一覧に戻る
                  const empty =
                    !openJob.customer.trim() && !openJob.staff && openJob.places.length === 0 && !openJob.date && !openJob.address && !openJob.note;
                  if (empty) store.update('jobs', (list) => list.filter((j) => j.id !== openJob.id));
                  else setMonth(openJob.month);
                  setOpenJobId(null);
                }}
                onOpen={setOpenJobId}
                onPrint={setPrint}
              />
            ) : (
              <JobsPage
                data={data}
                update={store.update}
                month={month}
                setMonth={setMonth}
                onOpen={setOpenJobId}
                onPrint={setPrint}
                goMaterials={() => setTab('materials')}
              />
            ))}
          {tab === 'materials' && <MaterialsPage data={data} update={store.update} />}
          {tab === 'labor' && <LaborPage data={data} update={store.update} />}
          {tab === 'settings' && <SettingsPage data={data} update={store.update} />}
        </main>
      </div>
      {print && <PrintView request={print} data={data} onClose={() => setPrint(null)} />}
    </ToastProvider>
  );
}

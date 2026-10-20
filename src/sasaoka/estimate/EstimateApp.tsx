// 住宅改修 見積書作成：いただいた見積書（苅田町・行橋用「工事費見積書兼工事費内訳書」・みやこ町・広域連合用「住宅改修内訳明細書」）の
// 形のまま、Excel と同じように欄を選んで打ち込むアプリ。仕切り計算・請求書作成アプリとは別のアプリだが、
// 部材リスト・★お気に入り・一式・設定・様邸は同じもの（同じサイトの同じ保存場所）を使う。
// 「笹岡工務店の請求書に入れる」を選んだ見積書は、仕切り計算・請求書作成アプリの仕切り計算表・請求書に入る。

import {useEffect, useMemo, useState} from 'react';
import {MaterialsPage} from '../components/MaterialsPage.tsx';
import {SettingsPage} from '../components/SettingsPage.tsx';
import {ToastProvider} from '../components/ui.tsx';
import {appUrl, APP_NAMES, hashJobId, PORTAL_URL, setHashJobId} from '../links.ts';
import {PrintView} from '../print/PrintView.tsx';
import type {PrintRequest} from '../print/PrintView.tsx';
import type {Job} from '../types.ts';
import {useStore} from '../useStore.ts';
import {EstimateEditor} from './EstimateEditor.tsx';
import {EstimateList} from './EstimateList.tsx';

type Tab = 'list' | 'materials' | 'settings';

const TABS: {id: Tab; label: string}[] = [
  {id: 'list', label: '見積書の一覧'},
  {id: 'materials', label: '部材リスト（★お気に入り）'},
  {id: 'settings', label: '設定'},
];

/** 何も入れていない見積書（作ってすぐ一覧に戻ったもの。残さない） */
const isEmpty = (j: Job) => !j.customer.trim() && !j.staff && j.places.length === 0 && !j.address && !j.insuredNo && !j.shikiri;

export default function EstimateApp() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('list');
  // 仕切り計算・請求書作成アプリから「見積書を開く」で来たときは、その見積書を開く
  const [openId, setOpenId] = useState<string | null>(hashJobId);
  const [print, setPrint] = useState<PrintRequest | null>(null);
  const data = store.data;
  const openJob = useMemo(() => (data && openId ? (data.jobs.find((j) => j.id === openId) ?? null) : null), [data, openId]);
  const loaded = data !== null;

  useEffect(() => {
    if (loaded) setHashJobId(tab === 'list' && openJob ? openJob.id : null);
  }, [loaded, tab, openJob?.id]);

  useEffect(() => {
    document.title = APP_NAMES.estimate;
  }, []);

  if (store.loadError) {
    return <div className="p-8 text-rose-700">データを読み込めませんでした：{store.loadError}</div>;
  }
  if (!data) {
    return <div className="p-8 text-slate-500">読み込んでいます…</div>;
  }

  const back = () => {
    if (openJob && isEmpty(openJob)) store.update('jobs', (list) => list.filter((j) => j.id !== openJob.id));
    setOpenId(null);
  };

  return (
    <ToastProvider>
      <div className={`min-h-screen bg-[#f2f6f4] text-slate-800 ${print ? 'no-print' : ''}`}>
        <header className="no-print bg-[#14532d] text-white">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-lg font-black">見</div>
              <div>
                <div className="text-base font-bold leading-tight">{APP_NAMES.estimate}</div>
                <div className="text-[11px] text-green-100">
                  苅田町・行橋用／みやこ町・広域連合用　／　
                  {data.settings.officeName || '営業所未設定'}
                </div>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-green-100">
              {store.saveError ? (
                <span className="rounded bg-rose-100 px-2 py-1 font-bold text-rose-800">{store.saveError}</span>
              ) : (
                <span>{store.savedAt ? 'この端末に自動保存しました' : 'この端末に自動保存します'}</span>
              )}
              <a href={appUrl('shikiri')} className="rounded-md border border-white/30 px-2.5 py-1.5 font-bold text-white hover:bg-white/10">
                仕切り計算・請求書へ
              </a>
              <a href={PORTAL_URL} className="rounded-md border border-white/30 px-2.5 py-1.5 font-bold text-white hover:bg-white/10">
                業務アプリポータルへ
              </a>
            </div>
          </div>
          <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  if (t.id === 'list' && tab === 'list') back();
                }}
                className={`whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-bold transition ${tab === t.id ? 'bg-[#f2f6f4] text-[#14532d]' : 'text-green-100 hover:bg-white/10'}`}
              >
                {t.label}
                {t.id === 'materials' && data.materials.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">{data.materials.filter((m) => m.favorite).length}★</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        <main className="no-print mx-auto min-w-0 max-w-[1600px] px-3 py-4 sm:px-4">
          {tab === 'list' &&
            (openJob ? (
              <EstimateEditor key={openJob.id} job={openJob} data={data} update={store.update} onBack={back} onOpen={setOpenId} onPrint={setPrint} />
            ) : (
              <EstimateList data={data} update={store.update} onOpen={setOpenId} onPrint={setPrint} goMaterials={() => setTab('materials')} />
            ))}
          {tab === 'materials' && <MaterialsPage data={data} update={store.update} />}
          {tab === 'settings' && <SettingsPage data={data} update={store.update} app="estimate" />}
        </main>
      </div>
      {print && <PrintView request={print} data={data} onClose={() => setPrint(null)} />}
    </ToastProvider>
  );
}

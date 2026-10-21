// 特定福祉用具 購入申請書・見積もり作成。
//   見積もり・申請：お客様1件ごとに ★ から商品を選び、定価の2割引きで見積書を作る（介護保険の内訳つき）
//   商品マスタ：仕切り一覧表（Excel・CSV・PDF）を取り込み、★お気に入り・種目を付ける
//   設定：見積書の発行元（営業所）・割引率・限度額・バックアップ
// 申請書（保険者ごとの様式への差し込み）と販売受注簿への転記は、様式をいただいてから足す（docs/tokutei/DESIGN.md）。

import {useCallback, useEffect, useState} from 'react';
import {ProductsPage} from './components/ProductsPage.tsx';
import {SaleEditor} from './components/SaleEditor.tsx';
import {SalesPage} from './components/SalesPage.tsx';
import {SettingsPage} from './components/SettingsPage.tsx';
import {ToastProvider} from './components/ui.tsx';
import {PrintView} from './print/PrintView.tsx';
import {useNewVersion} from './update.ts';
import {useStore} from './useStore.ts';

type Tab = 'sales' | 'products' | 'settings';
const TABS: {id: Tab; label: string}[] = [
  {id: 'sales', label: '📝 見積もり・申請'},
  {id: 'products', label: '📦 商品マスタ'},
  {id: 'settings', label: '⚙ 設定'},
];
const PORTAL_URL = 'https://akamar08taiyo-bot.github.io/taiyo-portal/';

/** URL のうしろ（#tab=sales&sale=…&print=1）。読み直しても同じ画面を開く */
function readHash(): {tab?: Tab; sale?: string; print?: boolean} {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const tab = p.get('tab');
  return {
    tab: tab === 'sales' || tab === 'products' || tab === 'settings' ? tab : undefined,
    sale: p.get('sale') || undefined,
    print: p.get('print') === '1',
  };
}

function writeHash(tab: Tab, sale: string | null, print: boolean) {
  const p = new URLSearchParams({tab});
  if (sale) p.set('sale', sale);
  if (print) p.set('print', '1');
  try {
    history.replaceState(null, '', `#${p.toString()}`);
  } catch {
    /* URL を書き換えられない環境（保存したファイルを開いたときなど）でも動くように */
  }
}

export default function App() {
  const store = useStore();
  const newVersion = useNewVersion();
  const initial = readHash();
  const [tab, setTab] = useState<Tab>(initial.tab ?? 'sales');
  const [saleId, setSaleId] = useState<string | null>(initial.sale ?? null);
  const [printId, setPrintId] = useState<string | null>(initial.print ? (initial.sale ?? null) : null);
  const data = store.data;

  const sale = data?.sales.find((x) => x.id === saleId) ?? null;
  const printSale = data?.sales.find((x) => x.id === printId) ?? null;

  useEffect(() => {
    if (data) writeHash(tab, tab === 'sales' ? (sale?.id ?? null) : null, !!printSale);
  }, [data, tab, sale?.id, printSale]);

  const closePrint = useCallback(() => setPrintId(null), []);

  if (store.loadError) return <p className="p-6 text-rose-700">読み込めませんでした：{store.loadError}</p>;
  if (!data) return <p className="p-6 text-slate-500">読み込んでいます…</p>;

  const goTab = (t: Tab) => {
    // 同じタブをもう一度押したら、そのタブの最初の画面（一覧）に戻る
    if (t === tab && t === 'sales') setSaleId(null);
    setTab(t);
  };

  return (
    <ToastProvider>
      {newVersion && (
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
      <div className={`min-h-screen text-slate-800 ${printSale ? 'no-print' : ''}`}>
        <header className="no-print bg-[#0f4c5c] text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-lg font-black">特</div>
              <div>
                <h1 className="text-base font-bold leading-tight">特定福祉用具 購入申請書・見積もり作成</h1>
                <div className="text-[11px] text-teal-100">{data.settings.officeName || '営業所未設定'}</div>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-teal-100">
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
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`whitespace-nowrap rounded-t-lg px-5 py-2.5 text-[15px] font-bold transition ${tab === t.id ? 'bg-[#f2f7f7] text-[#0f4c5c]' : 'text-teal-100 hover:bg-white/10'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="no-print mx-auto max-w-6xl px-3 py-4 sm:px-4">
          {tab === 'sales' &&
            (sale ? (
              <SaleEditor key={sale.id} sale={sale} data={data} update={store.update} onBack={() => setSaleId(null)} onOpen={setSaleId} onPrint={setPrintId} />
            ) : (
              <SalesPage data={data} update={store.update} onOpen={setSaleId} onPrint={setPrintId} />
            ))}
          {tab === 'products' && <ProductsPage data={data} update={store.update} />}
          {tab === 'settings' && <SettingsPage data={data} update={store.update} />}
        </main>
      </div>
      {printSale && <PrintView sale={printSale} settings={data.settings} onClose={closePrint} />}
    </ToastProvider>
  );
}

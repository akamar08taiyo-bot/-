// 特定福祉用具 購入申請書・見積もり作成。
//   見積もり・申請：お客様1件ごとに ★ から商品を選び、定価の2割引きで見積書を作る（介護保険の内訳つき）
//   商品マスタ：仕切り一覧表（Excel・CSV・PDF）を取り込み、★お気に入り・種目を付ける
//   設定：見積書の発行元（営業所）・割引率・限度額・バックアップ
// 申請書（保険者ごとの様式への差し込み）と販売受注簿への転記は、様式をいただいてから足す（docs/tokutei/DESIGN.md）。

import {useCallback, useEffect, useRef, useState} from 'react';
import {ProductsPage} from './components/ProductsPage.tsx';
import {SaleEditor} from './components/SaleEditor.tsx';
import {SalesPage} from './components/SalesPage.tsx';
import {SettingsPage} from './components/SettingsPage.tsx';
import {ToastProvider} from './components/ui.tsx';
import {applyJutaku, FROM_JUTAKU_CATALOG, JUTAKU_KEY, jutakuChanges, readJutaku, syncedValues, TO_JUTAKU} from './jutaku.ts';
import type {CatalogAsk} from './jutaku.ts';
import type {JutakuFields} from './types.ts';
import {estimateBook} from './print/estimateFiles.ts';
import {PrintView} from './print/PrintView.tsx';
import {writeSalesSummary} from './salesSummary.ts';
import {shinseiForm} from './shinsei.ts';
import {shinseiBook} from './shinseiFiles.ts';
import {useNewVersion} from './update.ts';
import {useStore} from './useStore.ts';

type Tab = 'sales' | 'products' | 'settings';
const TABS: {id: Tab; label: string}[] = [
  {id: 'sales', label: '📝 見積もり・申請'},
  {id: 'products', label: '📦 商品マスタ'},
  {id: 'settings', label: '⚙ 設定'},
];
const PORTAL_URL = 'https://akamar08taiyo-bot.github.io/taiyo-portal/';

/**
 * URL のうしろ（#tab=sales&sale=…&print=1）。読み直しても同じ画面を開く。
 * 住宅改修のアプリの「🛁 特定福祉用具申請書」のタブの中では #jutaku=<様邸の id>&embed=1&view=shinsei（申請書だけ）、
 * 「販売見積書」のタブの中では view=quote（見積書だけ）（jutaku.ts）
 */
function readHash(): {tab?: Tab; sale?: string; print?: boolean; jutaku?: string; embed?: boolean; view?: EmbedView} {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const tab = p.get('tab');
  return {
    tab: tab === 'sales' || tab === 'products' || tab === 'settings' ? tab : undefined,
    sale: p.get('sale') || undefined,
    print: p.get('print') === '1',
    jutaku: p.get('jutaku') || undefined,
    embed: p.get('embed') === '1',
    view: p.get('view') === 'shinsei' || p.get('view') === 'quote' ? (p.get('view') as EmbedView) : undefined,
  };
}

/** 住宅改修のタブの中で出す画面（申請書だけ／見積書だけ） */
type EmbedView = 'shinsei' | 'quote';

function writeHash(tab: Tab, sale: string | null, print: boolean, embed: boolean, view: EmbedView | undefined) {
  const p = new URLSearchParams({tab});
  if (sale) p.set('sale', sale);
  if (print) p.set('print', '1');
  if (embed) p.set('embed', '1'); // 住宅改修のタブの中で読み直しても、上の段を出さないまま
  if (embed && view) p.set('view', view);
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
  const [embed] = useState(initial.embed === true);
  const [jutaku] = useState(initial.jutaku ?? null);
  const [embedView] = useState(initial.embed ? initial.view : undefined);
  const linked = useRef(false);
  const given = useRef<JutakuFields | null>(null); // 住宅改修から受け取ったお客様の情報（開いたとき）
  const data = store.data;

  const sale = data?.sales.find((x) => x.id === saleId) ?? null;
  const printSale = data?.sales.find((x) => x.id === printId) ?? null;

  useEffect(() => {
    if (data) writeHash(tab, tab === 'sales' ? (sale?.id ?? null) : null, !!printSale, embed, embedView);
  }, [data, tab, sale?.id, printSale, embed, embedView]);

  // 住宅改修の様邸から開いたとき：その様邸の案件を開く（なければ作る。お客様の情報は住宅改修が localStorage に書いたもの）
  useEffect(() => {
    if (!data || !jutaku || linked.current) return;
    linked.current = true;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(JUTAKU_KEY);
    } catch {
      /* 読めなければ一覧のまま */
    }
    const handoff = readJutaku(raw, jutaku);
    if (!handoff) return;
    given.current = handoff.fields;
    const r = applyJutaku(data.sales, data.settings, handoff);
    if (r.sales !== data.sales) store.update('sales', () => r.sales);
    setTab('sales');
    setSaleId(r.id);
  }, [data, jutaku, store]);

  // 売上見込み（住宅改修のアプリの「📈 売上見込みを確認する」）に、案件ごとの金額のまとめを渡す（salesSummary.ts）。案件・設定が変わるたびに書き直す
  const sales = data?.sales;
  const settings = data?.settings;
  useEffect(() => {
    if (sales && settings) writeSalesSummary(sales, settings);
  }, [sales, settings]);

  // 住宅改修のタブの中（embed）では、住宅改修がタブを替える・一覧へ戻る前にこれを呼んで、保存が終わるのを待つ
  // （枠が消えると保存が途中で止まるため。住宅改修の src/sasaoka/tokuteiLink.ts の flushTokutei）
  useEffect(() => {
    if (!embed) return;
    const w = window as Window & {__taiyoTokuteiFlush?: () => Promise<boolean>};
    w.__taiyoTokuteiFlush = store.flush;
    return () => {
      delete w.__taiyoTokuteiFlush;
    };
  }, [embed, store.flush]);

  // 住宅改修の様邸の画面の「まとめて保存」：この様邸の案件の申請書・販売見積書の Excel を作って渡す（住宅改修の src/sasaoka/tokuteiLink.ts の tokuteiFiles。
  // ユーザーの指示「住宅改修申請書・特定福祉用具申請書・住宅改修見積もり・特定福祉用具販売見積もりを一括で保存できる機能をつける」2026-10-26）。
  // 様邸の案件ができてから置く（できる前に呼ばれて空を返さないように）。商品のない案件は何も作らない
  const linkedSale = embed && jutaku && data ? [...data.sales].filter((x) => x.jutakuJob === jutaku).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
  // ここで直したお客様の情報を住宅改修の様邸にも送る（⇔。jutaku.ts の jutakuChanges。開いたときは、住宅改修で空の項目だけ）
  const sent = useRef<JutakuFields | null>(null);
  useEffect(() => {
    if (!linkedSale || !jutaku || window.parent === window || !linked.current) return;
    const fields = jutakuChanges(linkedSale, sent.current, given.current);
    sent.current = syncedValues(linkedSale);
    if (Object.keys(fields).length === 0) return;
    try {
      window.parent.postMessage({type: TO_JUTAKU, job: jutaku, fields}, location.origin);
    } catch {
      /* 住宅改修に送れなくても、ここでは使える */
      return;
    }
    // 住宅改修にも同じ値が入るので、住宅改修から受け取った値（jutakuSync）にもする。しないと、ここで直した項目を「手で直した」とみなして、
    // あとで住宅改修で直した値（担当など）が入らなかった（2026-10-26）
    const id = linkedSale.id;
    store.update('sales', (list) => list.map((x) => (x.id === id ? {...x, jutakuSync: {...x.jutakuSync, ...fields}} : x)));
  }, [linkedSale, jutaku, store]);
  useEffect(() => {
    if (!linkedSale || !data) return;
    type Book = {name: string; bytes: Uint8Array};
    const w = window as Window & {__taiyoTokuteiFiles?: (kinds: string[]) => Promise<Book[]>};
    const settings = data.settings;
    w.__taiyoTokuteiFiles = async (kinds) => {
      await store.flush();
      if (linkedSale.items.length === 0) return [];
      const out: Book[] = [];
      if (kinds.includes('shinsei') && shinseiForm(linkedSale.insurer)) out.push(await shinseiBook(linkedSale, settings));
      if (kinds.includes('quote')) out.push(await estimateBook(linkedSale, settings));
      return out;
    };
    return () => {
      delete w.__taiyoTokuteiFiles;
    };
  }, [linkedSale, data, store.flush]);

  // 住宅改修の「📖 カタログを表示」「🖨 カタログを印刷」：開いている案件の画面で、カタログの窓・カタログの印刷を出す（案件が開く前に届いても、開いたら出す）
  const [catalogAsk, setCatalogAsk] = useState<CatalogAsk | null>(null);
  useEffect(() => {
    if (!embed) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data as {type?: unknown; action?: unknown} | null;
      if (m?.type !== FROM_JUTAKU_CATALOG || (m.action !== 'show' && m.action !== 'print')) return;
      const action = m.action;
      setCatalogAsk((c) => ({action, n: (c?.n ?? 0) + 1}));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embed]);

  const closePrint = useCallback(() => setPrintId(null), []);
  // 住宅改修の様邸のタブの中には一覧へ戻るボタンがない（ユーザーの指示「赤枠の部分は不要です」2026-10-28）。「削除」のあとも一覧は出さず、
  // タブを開いたときと同じく、その様邸の新しい案件を開く（住宅改修が書いたお客様の情報で。上の「住宅改修の様邸から開いたとき」をもう一度）
  const back = useCallback(() => {
    if (embed && jutaku) {
      linked.current = false;
      sent.current = null;
    }
    setSaleId(null);
  }, [embed, jutaku]);

  if (store.loadError)
    return (
      <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-bold">読み込めませんでした：{store.loadError}</p>
        <button type="button" onClick={() => location.reload()} className="mt-3 rounded-md border border-rose-300 bg-white px-4 py-2 font-bold text-rose-800 hover:bg-rose-100">
          ⟳ 読み込み直す
        </button>
      </div>
    );
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
        {/* 住宅改修のタブの中（embed）では、濃い帯を出さない：住宅改修の部材・施工費マスタのタブと同じ、白い地に枠のある大きめのタブ
            （ユーザーの指示「この部分の色合いも調整する。ボタンも大きくする」2026-10-27。前は濃い青緑の帯に小さめのタブ） */}
        <header className={`no-print ${embed ? 'px-3 pt-3 sm:px-4' : 'bg-[#0f4c5c] text-white'}`}>
          {/* 住宅改修のタブの中（embed）では、題名・ポータルへのリンクの段は出さない（住宅改修の画面の上にある） */}
          <div className={`mx-auto max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${embed ? 'hidden' : 'flex'}`}>
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
          <nav className={`flex overflow-x-auto ${embed ? 'gap-1.5 sm:gap-2' : 'mx-auto max-w-6xl gap-1 px-3'}`}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={
                  embed
                    ? `whitespace-nowrap rounded-lg border-2 px-3 py-2 text-sm font-bold shadow-sm transition sm:px-5 sm:py-2.5 sm:text-base lg:text-[17px] ${tab === t.id ? 'border-[#14532d] bg-emerald-50 text-[#14532d]' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`
                    : `whitespace-nowrap rounded-t-lg px-5 py-2.5 text-[15px] font-bold transition ${tab === t.id ? 'bg-[#f2f7f7] text-[#0f4c5c]' : 'text-teal-100 hover:bg-white/10'}`
                }
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {/* 住宅改修のタブの中（申請書・販売見積書）は、画面の幅いっぱい（プレビューを大きく） */}
        <main className={`no-print mx-auto px-3 py-4 sm:px-4 ${embed && embedView ? 'max-w-none' : 'max-w-6xl'}`}>
          {tab === 'sales' &&
            (sale ? (
              <SaleEditor key={sale.id} sale={sale} data={data} update={store.update} onBack={back} onOpen={setSaleId} onPrint={setPrintId} fixedView={embedView} catalogAsk={catalogAsk} />
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

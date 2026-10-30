// 住宅改修の見積書と、笹岡工務店への請求書（仕切り計算）と、部材・施工費のマスタを、タブで切り替えて使う1つのアプリ。
// 太陽ポータルの2つの入口（jutaku-mitsumori/・sasaoka/）は同じアプリで、最初に開くタブ（start）だけが違う。
//   見積もり・申請書を作成する：「新規作成」か「一覧から作成」（作った月ごとの一覧）を選ぶ。新規作成で保険者を選ぶと、
//                       様邸の画面に2つのタブ（左に申請書、右に見積書）ができる（ユーザーの指示）。同じ様邸の内容なので、どちらで直しても両方に出る。
//                       申請書は保険者の Excel の様式のまま画面に出して、欄を押して入れる。見積書はいただいた見積書
//                       （苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」・広域連合用「住宅改修内訳明細書」）の形のまま打ち込む。
//                       見積書に打ち込んだ内容は、そのまま笹岡工務店の仕切り計算表・請求書に入る（入れない見積書は外せる）
//   工務店請求書を確認する：請求する月ごとの様邸（仕切り計算表）と、1か月分の御請求書
//   売上見込みを確認する：月ごとの売上の見込み（住宅改修と特定福祉用具を別々に。salesPlan.ts・components/SalesPlanPage.tsx）
//   部材・施工費マスタ：部材リスト（メーカーの仕切価格・定価）と、施工費（笹岡工務店の取付手間の単価）と、
//                       部材＋施工費（常用）のセット（よく使う部材と施工費の組み合わせ）
//   設定
//   ゴミ箱：削除した様邸（見積書・申請書）。元に戻す・完全に削除（trash.ts・components/TrashPage.tsx）

import {useEffect, useMemo, useRef, useState} from 'react';
import {hasEstimateRows} from './calc.ts';
import {JobEditor} from './components/JobEditor.tsx';
import {JobsPage} from './components/JobsPage.tsx';
import {KitsPage} from './components/KitsPage.tsx';
import {LaborPage} from './components/LaborPage.tsx';
import {MaterialsPage} from './components/MaterialsPage.tsx';
import {PhotoJumpButton, PhotoJumpCtx, PhotoJumpFab, scrollToPhotos} from './components/PhotoJump.tsx';
import {SalesPlanPage} from './components/SalesPlanPage.tsx';
import {SettingsPage} from './components/SettingsPage.tsx';
import {TrashPage} from './components/TrashPage.tsx';
import {ToastProvider, useTouchUi} from './components/ui.tsx';
import {LABOR_REV} from './defaults.ts';
import {EstimateEditor} from './estimate/EstimateEditor.tsx';
import {EstimateHome, EstimateList, newEstimate} from './estimate/EstimateList.tsx';
import {OrderPage} from './estimate/OrderPage.tsx';
import {RiyuEditor} from './estimate/RiyuEditor.tsx';
import {ShinseiEditor} from './estimate/ShinseiEditor.tsx';
import {TokuteiEditor} from './estimate/TokuteiEditor.tsx';
import {hasShinseiInfo} from './estimateForms.ts';
import {APP_TITLE, PORTAL_URL, readHash, writeHash} from './links.ts';
import type {JobView, MainTab} from './links.ts';
import {photoIdsInUse, prunePhotos} from './photos.ts';
import {PrintView} from './print/PrintView.tsx';
import type {PrintRequest} from './print/PrintView.tsx';
import {hasRiyuInfo} from './riyu.ts';
import {EXAMPLE_KIT_ID, exampleKit} from './samples.ts';
import {CATALOG_EVENT, flushTokutei, readFromTokutei, tokuteiNames, withTokuteiFields, writeTokutei} from './tokuteiLink.ts';
import {DocsButton} from './components/DocsDialog.tsx';
import {isTrashed, liveJobs} from './trash.ts';
import {writeJutakuSalesSummary} from './salesPlan.ts';
import type {Insurer, Job, Row} from './types.ts';
import {useNewVersion} from './update.ts';
import {useStore} from './useStore.ts';
import {tesuri, thisMonth} from './util.ts';

const TABS: {id: MainTab; label: string}[] = [
  {id: 'estimate', label: '📝 見積もり・申請書を作成する'},
  // 売上見込みは見積もりのすぐ右、工務店の請求書はその右（ユーザーの指示「請求書を確認するではなく、工務店請求書を確認するに変更」
  // 「売上見込みを確認すると、工務店請求書を確認するの位置をいれかえる」2026-10-27。売上見込みは 2026-10-25 に請求書の右に足した）
  {id: 'sales', label: '📈 売上見込みを確認する'},
  {id: 'invoice', label: '🧾 工務店請求書を確認する'},
  {id: 'master', label: '📦 部材・施工費マスタ'},
  {id: 'settings', label: '⚙ 設定'},
  {id: 'trash', label: '🗑 ゴミ箱'}, // 設定のタブの横（ユーザーの指示「設定のタブの横にゴミ箱をつくり」2026-10-25）
];

// タブごとの色（見積書は緑、請求書は紺、売上見込みは青緑、部材・施工費マスタは紫、設定は灰、ゴミ箱は茶色がかった灰）。選んでいるタブは下の画面と同じ色にしてつなげ、
// 広い画面ではタブの上に色の帯（accent）を付けて、どれを選んでいるか分かるようにする
const THEME: Record<MainTab, {head: string; page: string; active: string; sub: string; accent: string}> = {
  estimate: {head: 'bg-[#14532d]', page: 'bg-[#f2f6f4]', active: 'bg-[#f2f6f4] text-[#14532d]', sub: 'text-green-100', accent: 'lg:border-emerald-500'},
  invoice: {head: 'bg-[#0c315e]', page: 'bg-[#f3f6fa]', active: 'bg-[#f3f6fa] text-[#0c315e]', sub: 'text-blue-100', accent: 'lg:border-blue-500'},
  sales: {head: 'bg-[#115e59]', page: 'bg-[#f1f7f6]', active: 'bg-[#f1f7f6] text-[#115e59]', sub: 'text-teal-100', accent: 'lg:border-teal-500'},
  master: {head: 'bg-[#3b1f6b]', page: 'bg-[#f6f4fa]', active: 'bg-[#f6f4fa] text-[#3b1f6b]', sub: 'text-purple-100', accent: 'lg:border-purple-500'},
  settings: {head: 'bg-[#334155]', page: 'bg-[#f4f5f7]', active: 'bg-[#f4f5f7] text-[#334155]', sub: 'text-slate-200', accent: 'lg:border-slate-500'},
  trash: {head: 'bg-[#44403c]', page: 'bg-[#f5f5f4]', active: 'bg-[#f5f5f4] text-[#44403c]', sub: 'text-stone-200', accent: 'lg:border-stone-500'},
};
// 画面の幅（ヘッダー・タブ・中身）はどのタブも同じ。前は見積もりのタブだけ広く（1600px、ほかは 1400px）、広い画面で見積もりのタブを選ぶと
// 全体が左に 100px 動いていた（ユーザーの報告「申請書・見積書を作成するのタブを選んだときのみ、左にぐっと動く」）
const PAGE_WIDTH = 'max-w-[1600px]';

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
 * 様邸の画面のタブ：左から 住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書（ユーザーの指示「住宅改修申請書、工事見積書、特定福祉用具申請書、販売見積書の順にする」、2026-10-23。
 * その前は「上のタブのところに、住宅改修申請書、特定福祉用具申請書、工事見積書、理由書の順番で、並べてください」、2026-10-22。
 * その前は「新規作成で、保険者を選んだら、2種類、タブを作る。左側に、申請書、右側に見積もり」・「必要に応じて住宅改修の理由書にも飛べるようにする」）。
 * 同じ様邸の内容（氏名・住所・被保険者番号・改修の箇所・金額）なので、どれで直しても、ほかにすぐ出る。特定福祉用具申請書は、特定福祉用具のアプリをお客様の情報を渡して中に出す（TokuteiEditor.tsx）
 */
function JobTabs({view, onView}: {view: JobView; onView: (v: JobView) => void}) {
  // 携帯（md 未満）だけ、格子の理由書のとなりに「📷 写真へ」（写真の欄へ飛ぶ。タブではない。タブレットは JobHeader.tsx。PhotoJump.tsx）
  const touch = useTouchUi();
  // ユーザーの指示「住宅改修申請書、工事見積書、特定福祉用具申請書、販売見積書の順にする」（2026-10-23）。理由書は最後
  const tabs: [JobView, string][] = [
    ['shinsei', '📝 住宅改修申請書'],
    ['estimate', '📋 工事見積書'],
    ['tokutei', '🛁 特定福祉用具申請書'],
    ['hanbai', '🏷 販売見積書'],
    ['riyu', '📄 理由書'],
  ];
  return (
    <>
      {/* スマホ・タブレットの縦の幅では2つずつ並べる（5つ目の理由書は1段まるごと。1段にすると名前が折り返して読みにくい。「📷 写真へ」があるときは理由書のとなり）。
          線はすき間（gap-px）から見える枠の色 */}
      <div
        data-job-tabs
        role="tablist"
        aria-label="住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書"
        className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-lg border-2 border-[#14532d] bg-[#14532d] shadow-sm md:inline-flex md:w-auto md:gap-0 md:bg-white"
      >
        {tabs.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => onView(v)}
            // 広い画面は少し大きく（ユーザーの指示「このタブの部分をもう少し大きくする」2026-10-27）。md の幅は今の大きさのまま（大きくすると1段に入らない）
            className={`whitespace-nowrap px-2 py-2 text-sm font-bold transition ${v === 'riyu' && !touch ? 'col-span-2' : ''} md:px-4 md:text-[15px] lg:px-5 lg:py-2.5 lg:text-[17px] ${view === v ? 'bg-[#14532d] text-white' : 'bg-white text-[#14532d] hover:bg-emerald-50'}`}
          >
            {text}
          </button>
        ))}
        <PhotoJumpButton className="bg-sky-50 px-2 py-2 text-sm md:hidden" />
      </div>
    </>
  );
}

/** 何も入れていない見積書・様邸・申請書（作ってすぐ戻ったもの。残さない）。平面図の図だけ入れた様邸は残す */
const isEmpty = (j: Job) =>
  !j.customer.trim() && !j.staff && j.places.length === 0 && !j.address && !j.insuredNo && !j.date && !j.note && !hasShinseiInfo(j.shinsei) && !hasRiyuInfo(j.riyu) && !j.planPhoto;

export default function App({start}: {start: MainTab}) {
  const store = useStore();
  const newVersion = useNewVersion();
  // 携帯・タブレットか（様邸の画面の右下の「📷 写真へ」を出す。PhotoJump.tsx）
  const touch = useTouchUi();
  // URL に #tab=…&job=… があれば、そのタブ・見積書（様邸）を開く（前の版の #job=… は、最初のタブで開く）
  const [initial] = useState(readHash);
  const [tab, setTab] = useState<MainTab>(initial.tab ?? start);
  const [estimateId, setEstimateId] = useState<string | null>((initial.tab ?? start) === 'estimate' ? initial.job : null);
  const [invoiceId, setInvoiceId] = useState<string | null>((initial.tab ?? start) === 'invoice' ? initial.job : null);
  // 見積もり・申請書を作成する：最初の画面（新規作成・一覧から作成）か、月ごとの一覧か
  // URL から見積書を開いたとき（読み直したとき）は、戻ると一覧
  const [estimateView, setEstimateView] = useState<'home' | 'list'>(estimateId ? 'list' : 'home');
  // 見積書の画面か、そこから開いた発注書・申請書か（見積書を閉じると見積書の画面にもどる）
  const [jobView, setJobView] = useState<JobView>(estimateId ? initial.view : 'estimate');
  const [estimateMonth, setEstimateMonth] = useState(thisMonth);
  // 申請書・見積書・理由書を取り込んだら、その月の見積書の一覧を出す（DocImport.tsx）
  const showImported = (m: string) => {
    setEstimateMonth(m);
    setEstimateView('list');
  };
  const [month, setMonth] = useState(loadMonth); // 工務店請求書を確認する：請求する月
  const [salesMonth, setSalesMonth] = useState(thisMonth); // 売上見込みを確認する：売上の月
  const [masterTab, setMasterTab] = useState<MasterTab>('materials');
  const [print, setPrint] = useState<PrintRequest | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(MONTH_KEY, month);
    } catch {
      /* 覚えられなくても困らない */
    }
  }, [month]);

  const all = store.data; // ゴミ箱の様邸も入ったデータ（保存・写真の掃除・設定のバックアップ・ゴミ箱のタブ）
  // 画面に出すデータ：ゴミ箱の様邸を除く（見積もりの一覧・請求書・発注書・探す・件数・印刷に出さない。trash.ts）。
  // 様邸の一覧を書きかえるときの update は、ゴミ箱の様邸も入った今の並びを受け取る（並びごと置きかえないこと。サンプルを入れるときなど）
  // 様邸の並びが変わったときだけ作り直す（部材・設定を直しただけなら、一覧・請求書の計算に同じ並びを渡す）
  const allJobs = all?.jobs;
  const live = useMemo(() => (allJobs ? liveJobs(allJobs) : null), [allJobs]);
  const data = useMemo(() => (all && live ? (live === all.jobs ? all : {...all, jobs: live}) : null), [all, live]);
  const trashCount = allJobs && live ? allJobs.length - live.length : 0;
  // 受注残・進捗管理に、見積書のある様邸ごとの金額のまとめを渡す（salesPlan.ts の writeJutakuSalesSummary。ゴミ箱の様邸は渡さない）。様邸・設定が変わるたびに書き直す
  const liveSettings = all?.settings;
  useEffect(() => {
    if (live && liveSettings) writeJutakuSalesSummary(live, liveSettings);
  }, [live, liveSettings]);
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
  // 🛁 特定福祉用具申請書のタブを開いた様邸。中のアプリの案件はこの様邸の id につながるので、そちらにだけ入れた（住宅改修は空の）様邸も
  // 離れるときに消さない（前は消えて、特定福祉用具の案件が行き先のない id につながったままになり、作り直すと案件が2つになった）
  const tokuteiOpened = useRef(new Set<string>());
  useEffect(() => {
    if (estimateJob && (jobView === 'tokutei' || jobView === 'hanbai')) tokuteiOpened.current.add(estimateJob.id);
  }, [estimateJob?.id, jobView]);
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
  // 名前の「手摺」は「手すり」と書く（ユーザーの指示「手摺ではなく、手すり」）。前に保存した部材リスト・施工費（安寿框手摺）・常用のセット・
  // 見積書の行の名前を一度だけ直す（あとで自分で打った文字は変えない）
  useEffect(() => {
    if (!data || data.settings.tesuri) return;
    const fixName = <T extends {name: string}>(x: T): T => (tesuri(x.name) === x.name ? x : {...x, name: tesuri(x.name)});
    const fixList = <T extends {name: string}>(list: T[]): T[] => {
      const next = list.map(fixName);
      return next.some((x, i) => x !== list[i]) ? next : list;
    };
    const fixRows = <T extends {rows: Row[]}>(x: T): T => {
      const rows = fixList(x.rows);
      return rows === x.rows ? x : {...x, rows};
    };
    store.update('materials', fixList);
    store.update('labor', fixList);
    store.update('kits', (kits) => {
      const next = kits.map((k) => fixRows(fixName(k)));
      return next.some((k, i) => k !== kits[i]) ? next : kits;
    });
    store.update('jobs', (jobs) => {
      const next = jobs.map((j) => {
        const places = j.places.map(fixRows);
        return places.some((p, i) => p !== j.places[i]) ? {...j, places} : j;
      });
      return next.some((j, i) => j !== jobs[i]) ? next : jobs;
    });
    store.update('settings', (s) => ({...s, tesuri: true}));
  }, [loaded]);

  // どの様邸からも使われなくなった写真（写真を消した・差し替えた・様邸を完全に削除した）を、この端末から消す。開いたときと、ゴミ箱で完全に削除して保存できたあと。
  // ほかのタブで入れたばかりの写真（まだ様邸に保存されていないかもしれない）を消さないように、1時間より前に入れた写真だけ
  // 残すのは様邸のどこかに書いてある番号すべて（箇所の写真・平面図の図のほか、あとから足した項目の写真も消さない。`photoIdsInUse`）。
  // ゴミ箱の様邸の写真も残す（完全に削除するまで）
  // 特定福祉用具のタブ（中のアプリ）で直したお客様の情報を、この様邸にも入れる（⇔。tokuteiLink.ts の withTokuteiFields。請求書に入れるか・見積もり作成日は変えない）。
  // 次に開くときに古い値を渡さないよう、受け渡しの localStorage も新しくする
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      const m = readFromTokutei(e.data);
      if (!m) return;
      store.update('jobs', (list) =>
        list.map((j) => {
          if (j.id !== m.job || isTrashed(j)) return j;
          const next = withTokuteiFields(j, m.fields);
          if (next !== j) writeTokutei(next);
          return next;
        }),
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [store.update]);
  // 様邸の画面の左の「📖 カタログを表示」「🖨 カタログを印刷」：カタログは特定福祉用具のアプリにあるので、🛁 のタブを開く（販売見積書のタブならそのまま）。
  // 頼みは TokuteiEditor.tsx が中のアプリに渡す（tokuteiLink.ts の askCatalog）
  useEffect(() => {
    const onCatalog = () => setJobView((v) => (v === 'tokutei' || v === 'hanbai' ? v : 'tokutei'));
    window.addEventListener(CATALOG_EVENT, onCatalog);
    return () => window.removeEventListener(CATALOG_EVENT, onCatalog);
  }, []);
  const [pruneTick, setPruneTick] = useState(0);
  useEffect(() => {
    if (!all) return;
    prunePhotos(photoIdsInUse(all.jobs), Date.now() - 60 * 60 * 1000).catch(() => undefined);
  }, [loaded, pruneTick]);
  // ゴミ箱で完全に削除したら、保存できてから写真の掃除（保存のときにほかのタブで元に戻した様邸とまとめたら、それは残っているので写真も消さない）。
  // 保存はこの描画のあと（update の中身は描画のときに動くので、押したすぐあとに flush しても、まだ保存するものがない）
  const [purgeTick, setPurgeTick] = useState(0);
  useEffect(() => {
    if (purgeTick) void store.flush().then((ok) => ok && setPruneTick((n) => n + 1));
  }, [purgeTick]);

  if (store.loadError) {
    return <div className="p-8 text-rose-700">データを読み込めませんでした：{store.loadError}</div>;
  }
  if (!data || !all) {
    return <div className="p-8 text-slate-500">読み込んでいます…</div>;
  }

  const theme = THEME[tab];
  // ゴミ箱に移した様邸は消さない（何も入れていない様邸でも、削除を押したならゴミ箱に残す）
  const removeIfEmpty = (job: Job | null) => {
    // 特定福祉用具申請書だけを作っている様邸（特定福祉用具の方にお客様名がある）は空でも消さない（前に開いたときの案件が、次に開いて戻ると消えていた）
    if (job && isEmpty(job) && !tokuteiOpened.current.has(job.id) && !tokuteiNames().has(job.id)) store.update('jobs', (list) => list.filter((j) => j.id !== job.id || isTrashed(j)));
  };
  // 特定福祉用具申請書のタブを離れるときは、中の特定福祉用具のアプリの保存が終わってから（枠を消すと保存が途中で止まる。tokuteiLink.ts）
  const leaveTokutei = (go: () => void) => {
    if (tab === 'estimate' && estimateJob && (jobView === 'tokutei' || jobView === 'hanbai')) void flushTokutei().then(go);
    else go();
  };
  const goTab = (t: MainTab) => leaveTokutei(() => openTab(t));
  const openTab = (t: MainTab) => {
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
  // 「📗 Excelで保存」「✉ メールで送付」（どのタブからも同じ。DocsDialog.tsx。初めは開いているタブの書類だけにチェック）。作る前に、開いている特定福祉用具のタブの変更と、
  // この様邸の変更を保存させる。Excelで保存は上の段（JobHeader.tsx）の2段目の初め、メールで送付は3段目の初め（前の「📦 まとめて保存」の所。
  // ユーザーの指示「Excel で保存っていうので、一つに…プラスアルファで、メールで送付」2026-10-30）
  const docs = estimateJob && {
    excel: <DocsButton mode="excel" job={estimateJob} s={data.settings} view={jobView === 'order' ? 'estimate' : jobView} onBeforeSave={() => Promise.all([flushTokutei(), store.flush()])} />,
    mail: <DocsButton mode="mail" job={estimateJob} s={data.settings} view={jobView === 'order' ? 'estimate' : jobView} onBeforeSave={() => Promise.all([flushTokutei(), store.flush()])} />,
  };
  // 「📷 写真へ」（携帯・タブレット）：写真の欄は住宅改修申請書のタブにあるので、ほかのタブならそのタブに替えてから
  const goPhotos = () => {
    if (jobView === 'shinsei') scrollToPhotos();
    else
      leaveTokutei(() => {
        setJobView('shinsei');
        scrollToPhotos();
      });
  };
  const tabs = <JobTabs view={jobView} onView={(v) => leaveTokutei(() => setJobView(v))} />;
  // 見積書と請求書（仕切り計算表）を行き来する（同じ様邸を開く）
  const openEstimate = (id: string) => {
    setEstimateId(id);
    setJobView('estimate');
    setTab('estimate');
  };
  // 売上見込みから開く：住宅改修は工事見積書、特定福祉用具は販売見積書のタブ
  const openFromSales = (id: string, view: 'estimate' | 'hanbai') => {
    setEstimateId(id);
    setJobView(view);
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
  // 広い画面（lg 以上）は1段：タブの名前を「工務店請求書を確認する」にして長くなったので（2026-10-27）、1024〜1279px は余白と字を少し詰める（ゴミ箱が右にはみ出していた）
  const tabButton = (t: (typeof TABS)[number]) => {
    const on = tab === t.id;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => goTab(t.id)}
        aria-current={on ? 'page' : undefined}
        className={`flex min-h-11 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[15px] font-bold transition sm:text-base lg:min-h-[3.25rem] lg:flex-none lg:rounded-b-none lg:rounded-t-xl lg:border-t-4 lg:px-2.5 lg:text-[15px] xl:px-5 xl:text-[17px] ${
          on ? `${theme.active} ${theme.accent}` : 'bg-white/10 text-white hover:bg-white/20 lg:border-transparent'
        }`}
      >
        {t.label}
        {/* ゴミ箱に入っている件数 */}
        {t.id === 'trash' && trashCount > 0 && <span className={`rounded-full px-2 text-[13px] leading-5 tabular-nums ${on ? 'bg-stone-200' : 'bg-white/20'}`}>{trashCount}</span>}
      </button>
    );
  };

  return (
    <ToastProvider>
      {newVersion && (
        // 新しい版が出ている（スマホなどで前の版が出たままのとき）。打ち込んだ内容を保存してから読み込み直す
        <div role="status" className="no-print sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm font-bold text-slate-900 shadow">
          このアプリの新しい版が出ています。
          <button
            type="button"
            // 保存できなかったときは読み込み直さない（読み込み直すと、直したところが消える。保存できなかったことは画面の上に出る）
            onClick={() => void Promise.all([store.flush(), flushTokutei()]).then(([saved]) => saved && location.reload())}
            className="rounded-md border border-slate-900/20 bg-white px-3 py-1.5 font-bold text-slate-900 shadow-sm hover:bg-amber-50"
          >
            ⟳ 読み込み直す
          </button>
        </div>
      )}
      <div className={`min-h-screen ${theme.page} text-slate-800 ${print ? 'no-print' : ''}`}>
        <header className={`no-print ${theme.head} text-white transition-colors`}>
          <div className={`mx-auto flex ${PAGE_WIDTH} flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
            {/* 業務アプリポータルへ戻るボタンは左上（全アプリ共通の形 .taiyo-portal-back。ユーザーの指示「太陽ポータルに戻るボタンは左上に設置」2026-10-28。前は右上） */}
            <a href={PORTAL_URL} className="taiyo-portal-back">
              ← 業務アプリポータルへ戻る
            </a>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-lg font-black">住</div>
              <div>
                <div className="text-base font-bold leading-tight">{APP_TITLE}</div>
                {/* 「請求先：笹岡工務店」は出さない（ユーザーの指示）。営業所だけ */}
                <div className={`text-[11px] ${theme.sub}`}>{data.settings.officeName || '営業所未設定'}</div>
              </div>
            </div>
            <div className={`ml-auto flex flex-wrap items-center gap-3 text-[11px] ${theme.sub}`}>
              {store.saveError ? (
                <span className="rounded bg-rose-100 px-2 py-1 font-bold text-rose-800">{store.saveError}</span>
              ) : (
                <span>{store.savedAt ? 'この端末に自動保存しました' : 'この端末に自動保存します'}</span>
              )}
            </div>
          </div>
          {/* 上のタブ：字を大きく・高く（ユーザーの指示「ここらへんのタブももう少し大きく見やすくする」2026-10-25）。選んでいないタブも薄い白の地で、タブと分かるように。
              広い画面（lg 以上）は1段に並べ、選んでいるタブは下の画面と同じ色＋上の色の帯でつなげる。
              狭い画面は折り返して並べる（横にスクロールさせると、右のタブ（ゴミ箱）が画面の外に隠れる）。字の幅で並べ、段ごとに横いっぱいに広げる。
              設定とゴミ箱は1つのまとまりにして、いつも同じ段に並べる（ゴミ箱だけが1段に横長に残らないように。広い画面では lg:contents でまとまりを消す）。
              スマホの幅 390px では 見積もり・申請書を作成する／売上見込みを確認する／工務店請求書を確認する／部材・施工費マスタ・設定・ゴミ箱 の4段 */}
          <nav className={`mx-auto flex ${PAGE_WIDTH} flex-wrap gap-1.5 px-3 pb-3 lg:flex-nowrap lg:pb-0`}>
            {TABS.slice(0, 4).map(tabButton)}
            <div className="flex flex-auto gap-1.5 lg:contents">{TABS.slice(4).map(tabButton)}</div>
          </nav>
        </header>

        <main className={`no-print mx-auto min-w-0 px-3 py-4 sm:px-4 touch:pb-20 ${PAGE_WIDTH}`}>
          {/* 様邸の画面の「📷 写真へ」（携帯・タブレット。JobTabs・JobHeader.tsx の PhotoJumpButton）が飛ぶ先 */}
          <PhotoJumpCtx.Provider value={goPhotos}>
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
                  docs={docs}
                />
              ) : estimateJob && (jobView === 'tokutei' || jobView === 'hanbai') ? (
                // 特定福祉用具申請書は申請書だけ、販売見積書は見積書だけを出す（同じ特定福祉用具の案件。申請書で入れた商品は見積書にも出る）
                <TokuteiEditor
                  key={`${estimateJob.id}:${jobView}`}
                  job={estimateJob}
                  view={jobView === 'tokutei' ? 'shinsei' : 'quote'}
                  update={store.update}
                  settings={data.settings}
                  onBack={() =>
                    leaveTokutei(() => {
                      removeIfEmpty(estimateJob);
                      setEstimateId(null);
                      setJobView('estimate');
                    })
                  }
                  tabs={tabs}
                  docs={docs}
                />
              ) : estimateJob && jobView === 'riyu' ? (
                <RiyuEditor
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
                  docs={docs}
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
                  docs={docs}
                  onPrint={setPrint}
                  onSave={store.flush}
                  onManageKits={() => goMaster('kits')}
                />
              ) : estimateView === 'home' ? (
                <EstimateHome
                  data={data}
                  update={store.update}
                  onNew={newOne}
                  onList={() => setEstimateView('list')}
                  onImported={showImported}
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
                  onBack={() => setEstimateView('home')}
                  onImported={showImported}
                />
              ))}
          </PhotoJumpCtx.Provider>
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
          {tab === 'sales' && <SalesPlanPage data={data} update={store.update} month={salesMonth} setMonth={setSalesMonth} onOpenJob={openFromSales} onPrint={setPrint} />}
          {tab === 'master' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="部材・施工費マスタ">
                {(
                  [
                    ['materials', `部材リスト（${data.materials.length}件）`],
                    ['labor', `施工費（${data.labor.length}項目）`],
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
          {/* 設定はゴミ箱の様邸も入ったデータ（バックアップ（すべて）に入れて、なくさない。読み込んでもゴミ箱のまま） */}
          {tab === 'settings' && <SettingsPage data={all} update={store.update} />}
          {tab === 'trash' && (
            <TrashPage
              data={all}
              update={store.update}
              onPurged={() => setPurgeTick((n) => n + 1)}
            />
          )}
          {/* 携帯・タブレットの様邸の画面：右下の「📷 写真へ」「↑ 上へ」（PhotoJump.tsx）。発注書の画面には出さない */}
          {touch && tab === 'estimate' && estimateJob && jobView !== 'order' && <PhotoJumpFab onPhotos={goPhotos} />}
        </main>
      </div>
      {print && <PrintView request={print} data={data} onClose={() => setPrint(null)} />}
    </ToastProvider>
  );
}

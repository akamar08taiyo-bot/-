// 見積書・請求書・部材と施工費のマスタは、タブで切り替える1つのアプリ。
// 太陽ポータル（taiyo-portal）の2つのフォルダ（jutaku-mitsumori/・sasaoka/）に同じアプリを置き、最初に開くタブだけを変える。
// 同じサイトなので、データ（IndexedDB）も同じものを使う。
// 開いているタブ・見積書（様邸）・発注書・申請書は、URL のうしろに #tab=…&job=…&view=order（住宅改修申請書は view=shinsei、特定福祉用具申請書は view=tokutei、販売見積書は view=hanbai、理由書は view=riyu）で残す（読み直しても同じ所を開く）。

export const PORTAL_URL = 'https://akamar08taiyo-bot.github.io/taiyo-portal/';

/** 画面の上・ブラウザのタブの題名。太陽ポータルのタイル（住宅改修と特定福祉用具を1つにまとめた入口）と同じ名前（ユーザーの答え「変える」、2026-10-22。前は「住宅改修 見積書・請求書（笹岡工務店）」） */
export const APP_TITLE = '申請書・見積書作成';

// trash：ゴミ箱（設定のタブの右。削除した様邸を残しておく所。trash.ts）
export type MainTab = 'estimate' | 'invoice' | 'sales' | 'master' | 'settings' | 'trash';
const TABS: MainTab[] = ['estimate', 'invoice', 'sales', 'master', 'settings', 'trash'];

/** 見積もり・申請書を作成するのタブで、様邸のどの画面を開いているか（工事見積書・発注書・住宅改修申請書・特定福祉用具申請書・販売見積書・理由書） */
export type JobView = 'estimate' | 'order' | 'shinsei' | 'tokutei' | 'hanbai' | 'riyu';

/** URL のうしろの #tab=…&job=…&view=order（前の版の #job=… だけのときは、タブは null）。view=order は見積書の発注書、view=shinsei は住宅改修申請書、view=tokutei は特定福祉用具申請書、view=hanbai は販売見積書、view=riyu は理由書 */
export function readHash(): {tab: MainTab | null; job: string | null; view: JobView} {
  try {
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    const tab = p.get('tab');
    const view = p.get('view');
    return {tab: TABS.includes(tab as MainTab) ? (tab as MainTab) : null, job: p.get('job') || null, view: view === 'order' || view === 'shinsei' || view === 'tokutei' || view === 'hanbai' || view === 'riyu' ? view : 'estimate'};
  } catch {
    return {tab: null, job: null, view: 'estimate'};
  }
}

/** 開いているタブ・見積書（様邸）・発注書・申請書を URL に残す。書き換えられない所では何もしない */
export function writeHash(tab: MainTab, jobId: string | null, view: JobView = 'estimate') {
  try {
    const hash = `#tab=${tab}${jobId ? `&job=${encodeURIComponent(jobId)}${view !== 'estimate' ? `&view=${view}` : ''}` : ''}`;
    if (hash !== location.hash) history.replaceState(null, '', location.pathname + location.search + hash);
  } catch {
    /* 書き換えられなくても困らない */
  }
}

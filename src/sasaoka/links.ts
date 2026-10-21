// 見積書・請求書・部材と施工費のマスタは、タブで切り替える1つのアプリ。
// 太陽ポータル（taiyo-portal）の2つのフォルダ（jutaku-mitsumori/・sasaoka/）に同じアプリを置き、最初に開くタブだけを変える。
// 同じサイトなので、データ（IndexedDB）も同じものを使う。
// 開いているタブ・見積書（様邸）・発注書・申請書は、URL のうしろに #tab=…&job=…&view=order（申請書は view=shinsei）で残す（読み直しても同じ所を開く）。

export const PORTAL_URL = 'https://akamar08taiyo-bot.github.io/taiyo-portal/';

export const APP_TITLE = '住宅改修 見積書・請求書（笹岡工務店）';

export type MainTab = 'estimate' | 'invoice' | 'master' | 'settings';
const TABS: MainTab[] = ['estimate', 'invoice', 'master', 'settings'];

/** 見積もりを作成するのタブで、様邸のどの画面を開いているか（見積書・発注書・申請書） */
export type JobView = 'estimate' | 'order' | 'shinsei';

/** URL のうしろの #tab=…&job=…&view=order（前の版の #job=… だけのときは、タブは null）。view=order は見積書の発注書、view=shinsei は申請書 */
export function readHash(): {tab: MainTab | null; job: string | null; view: JobView} {
  try {
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    const tab = p.get('tab');
    const view = p.get('view');
    return {tab: TABS.includes(tab as MainTab) ? (tab as MainTab) : null, job: p.get('job') || null, view: view === 'order' || view === 'shinsei' ? view : 'estimate'};
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

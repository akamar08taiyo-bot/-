// 見積書作成アプリと仕切り計算・請求書アプリを行き来するリンク。
// どちらも太陽ポータル（taiyo-portal）の中のフォルダに置く（sasaoka/・jutaku-mitsumori/）。同じサイトなので、データ（IndexedDB）も同じものを使う。
// 様邸を開いたまま移れるように、URL のうしろに #job=様邸のID を付ける。

export const PORTAL_URL = 'https://akamar08taiyo-bot.github.io/taiyo-portal/';

export type AppId = 'shikiri' | 'estimate';

const DIRS: Record<AppId, string> = {
  shikiri: 'sasaoka',
  estimate: 'jutaku-mitsumori',
};

export const APP_NAMES: Record<AppId, string> = {
  shikiri: '仕切り計算・請求書作成',
  estimate: '住宅改修 見積書作成',
};

/** もう片方のアプリの URL（ポータルの中なら隣のフォルダ。パソコンに保存したファイルで開いたときはポータルの URL） */
export function appUrl(app: AppId, jobId?: string): string {
  const hash = jobId ? `#job=${encodeURIComponent(jobId)}` : '';
  try {
    if (/^https?:$/.test(location.protocol)) return new URL(`../${DIRS[app]}/index.html`, location.href).href + hash;
  } catch {
    /* 下のポータルの URL にする */
  }
  return `${PORTAL_URL}${DIRS[app]}/index.html${hash}`;
}

/** URL のうしろの #job=様邸のID（もう片方のアプリから様邸を開いて来たとき） */
export function hashJobId(): string | null {
  try {
    const m = /^#job=([^&]+)/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** 開いている様邸を URL に残す（ページを読み直したり、もう片方のアプリから戻ったりしたときに、同じ様邸を開く）。書き換えられない所では何もしない */
export function setHashJobId(jobId: string | null) {
  try {
    const url = location.pathname + location.search + (jobId ? `#job=${encodeURIComponent(jobId)}` : '');
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  } catch {
    /* 書き換えられなくても困らない */
  }
}

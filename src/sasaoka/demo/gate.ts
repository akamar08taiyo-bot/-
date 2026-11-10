// （株）イヤーズ デモアプリの入口：開くたびに「止めるスイッチ」（デモのリポジトリの status.json）を読み、使えるときだけアプリを出す
// （ユーザーの指示「サンプルURLを渡し、こちらが主導権を握れるようにする。正式なものができるまではずっと使わせない」2026-11-10。答え「期限日＋止めるスイッチ」）。
// status.json：{"enabled": true, "until": "2026-12-31", "message": ""}。enabled を false にする・until を過ぎると、次に開いたときから使えない
// （開いている画面も、30分ごとと画面に戻ったときに読み直して止める）。読めないとき（ネットにつながっていない・ファイルがない）は開かない。
// ブラウザで動くアプリなので、ファイルを保存して中を書きかえられると止められない（報告でユーザーに伝えた）

import {DEMO_NAME} from './flag.ts';

declare const __DEMO_STATUS__: string | undefined;
/** 止めるスイッチの場所（いつも同じ URL を読む＝パソコンに保存した写しからでも、このファイルで止まる） */
export const STATUS_URL = typeof __DEMO_STATUS__ === 'string' && __DEMO_STATUS__ ? __DEMO_STATUS__ : 'https://akamar08taiyo-bot.github.io/years-demo/status.json';

export type Verdict = {ok: true; until: string} | {ok: false; reason: 'off' | 'expired' | 'unreachable' | 'bad'; message: string};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fmt = (d: string) => `${Number(d.slice(0, 4))}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;

/** status.json の中身と今日（YYYY-MM-DD）から、使えるか。until の日までは使える（その日も含む） */
export function demoVerdict(raw: unknown, today: string): Verdict {
  if (!raw || typeof raw !== 'object') return {ok: false, reason: 'bad', message: 'デモの設定を読めませんでした。'};
  const r = raw as Record<string, unknown>;
  const extra = typeof r.message === 'string' && r.message.trim() ? r.message.trim() : '';
  if (r.enabled !== true) return {ok: false, reason: 'off', message: extra || 'このデモは現在お使いいただけません。'};
  const until = typeof r.until === 'string' && DATE.test(r.until) ? r.until : '';
  if (!until) return {ok: false, reason: 'bad', message: 'デモの設定を読めませんでした。'};
  if (today > until) return {ok: false, reason: 'expired', message: extra || `デモの期間（${fmt(until)}まで）は終わりました。`};
  return {ok: true, until};
}

/** 今日（この端末の日付）を YYYY-MM-DD で */
export function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** status.json を読んで判定する（キャッシュは使わない） */
export async function checkDemo(): Promise<Verdict> {
  try {
    const res = await fetch(`${STATUS_URL}?t=${Date.now()}`, {cache: 'no-store'});
    if (!res.ok) return {ok: false, reason: 'unreachable', message: 'デモの確認ができませんでした。'};
    return demoVerdict(await res.json(), todayIso());
  } catch {
    return {ok: false, reason: 'unreachable', message: 'デモの確認ができませんでした。インターネットにつないで、開き直してください。'};
  }
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 使えないときの画面（アプリの上に重ねる。開いていた画面のデータは、この端末に保存したまま） */
function showLock(v: Exclude<Verdict, {ok: true}>, retry: () => void): void {
  let el = document.getElementById('demo-lock');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo-lock';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-label', 'デモを使えません');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#f2f6f4;font-family:system-ui,sans-serif;padding:16px';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div style="max-width:28rem;width:100%;border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:24px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.08)">' +
    `<div style="font-size:14px;color:#14532d;font-weight:700">${esc(DEMO_NAME)}</div>` +
    `<p style="margin:16px 0;font-size:16px;color:#1e293b;line-height:1.7">${esc(v.message)}</p>` +
    (v.reason === 'unreachable' ? '<button type="button" style="border:1px solid #94a3b8;border-radius:8px;background:#fff;padding:8px 16px;font-size:15px">もう一度確かめる</button>' : '') +
    '</div>';
  el.querySelector('button')?.addEventListener('click', retry);
}

/** 入口：確かめてから load（アプリの本体を読み込む）。開いたあとも読み直して、止めたら重ねて隠す */
export function startDemo(load: () => Promise<unknown>): void {
  const root = document.getElementById('root');
  if (root) root.innerHTML = `<div style="padding:48px 16px;text-align:center;color:#475569;font-family:system-ui,sans-serif">${esc(DEMO_NAME)}を開いています…</div>`;
  let started = false;
  let last = 0;
  const run = async () => {
    last = Date.now();
    const v = await checkDemo();
    if (v.ok) {
      document.getElementById('demo-lock')?.remove();
      if (!started) {
        started = true;
        await load();
      }
      return;
    }
    const bad = v as Exclude<Verdict, {ok: true}>;
    // 開いたあとでネットにつながらないだけなら、作業は止めない（止めるのは、スイッチで止めた・期限が過ぎたとき）
    if (started && bad.reason === 'unreachable') return;
    showLock(bad, run);
  };
  void run();
  window.setInterval(() => void run(), 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > 10 * 60 * 1000) void run();
  });
}

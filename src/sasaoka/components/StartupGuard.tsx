// 画面を出せなかったときに、真っ白のままにしない（ユーザーの話「タブレットで申請書を開こうとしたら開かない。ポータルまでは開く」2026-11-12）。
// その端末だけで起きることは、こちらのテストのブラウザでは出ないことがある。何が起きたかの短い文と「⟳ 読み込み直す」を出して、
// 画面の写真を送ってもらえば分かるようにする。データ（様邸・写真）はこの端末の保存場所に残っているので、読み込み直しで消えない。
// 読み込みの前のエラー（古いブラウザで読めない文など）は jutaku.html・sasaoka.html・years.html の小さなスクリプトが出す（同じ見た目）

import {Component, useEffect, useState} from 'react';
import type {ErrorInfo, ReactNode} from 'react';

/** 起動のエラーの画面（React が動かないときの HTML の画面と同じ文） */
export function StartupError({message}: {message: string}) {
  return (
    <div className="mx-auto max-w-xl p-6 text-slate-800">
      <p className="text-lg font-bold">画面を出せませんでした</p>
      <button type="button" onClick={() => location.reload()} className="mt-4 h-12 rounded-lg border border-slate-300 bg-white px-5 text-base font-bold text-slate-700 hover:bg-slate-50">
        ⟳ 読み込み直す
      </button>
      <p className="mt-4 break-all text-sm text-slate-500">{message}</p>
      <p className="mt-1 break-all text-xs text-slate-400">{navigator.userAgent}</p>
    </div>
  );
}

/**
 * 読み込んでいるあいだの画面。10秒たっても読めなければ「⟳ 読み込み直す」も出す（この端末の保存場所＝IndexedDB が開くまで待っているとき。
 * iPad の Safari は、ほかのタブが同じ保存場所を使っているときなどに開くのを待ったまま止まることがあり、読み込み直すと開く）
 */
export function LoadingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="p-8 text-slate-500">
      読み込んでいます…
      {slow && (
        <div className="mt-4">
          <button type="button" onClick={() => location.reload()} className="h-12 rounded-lg border border-slate-300 bg-white px-5 text-base font-bold text-slate-700 hover:bg-slate-50">
            ⟳ 読み込み直す
          </button>
        </div>
      )}
    </div>
  );
}

export class StartupGuard extends Component<{children: ReactNode}, {error: Error | null}> {
  state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('画面を出せませんでした', error, info.componentStack);
  }

  render() {
    const {error} = this.state;
    if (!error) return this.props.children;
    const where = (error.stack ?? '').split('\n').slice(0, 2).join(' / ');
    return <StartupError message={`${error.name}: ${error.message}${where ? ` （${where.slice(0, 300)}）` : ''}`} />;
  }
}

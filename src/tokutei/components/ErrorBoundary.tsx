import {Component} from 'react';
import type {ErrorInfo, ReactNode} from 'react';

/**
 * 画面の途中で止まったとき：まっ白にせず、止まったことと「⟳ 読み込み直す」を出す（住宅改修の「特定福祉用具申請書」「販売見積書」のタブで
 * まっ白になって開かないと言われた 2026-10-26。データは保存してあるので、読み込み直せば続きから使える）。止まった理由は小さく出す（知らせてもらうため）
 */
export class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('特定福祉用具のアプリが止まりました', error, info.componentStack);
  }

  render() {
    const {error} = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-bold">画面を出せませんでした。</p>
        <button type="button" onClick={() => location.reload()} className="mt-3 rounded-md border border-rose-300 bg-white px-4 py-2 font-bold text-rose-800 hover:bg-rose-100">
          ⟳ 読み込み直す
        </button>
        <p className="mt-3 break-all text-xs text-rose-700/80">{error.message}</p>
      </div>
    );
  }
}

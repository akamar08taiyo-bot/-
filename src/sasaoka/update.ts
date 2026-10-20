// 新しい版の知らせ：同じ場所の version.json（公開するときにアプリと一緒に置く。vite.version.ts）の版の印が、
// 開いているアプリの印と違えば true。スマホのブラウザは前に開いたページをしばらく覚えていて、直した版がすぐには出ないことがあるため。
// 開いて少ししてからと、画面に戻ったとき（1分に1回まで）に見る。小さなファイルだけを読む

import {useEffect, useState} from 'react';

const build = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';

export function useNewVersion(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!build || location.protocol === 'file:') return;
    let last = 0;
    let stopped = false;
    const check = async () => {
      if (stopped || Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        const res = await fetch(new URL('version.json', location.href), {cache: 'no-store'});
        if (!res.ok) return;
        const v = (await res.json()) as {build?: unknown};
        if (typeof v.build === 'string' && v.build !== build && !stopped) setAvailable(true);
      } catch {
        /* 電波がないときなどは、次に画面に戻ったときにまた見る */
      }
    };
    const onShow = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const timer = window.setTimeout(check, 2000);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, []);
  return available;
}

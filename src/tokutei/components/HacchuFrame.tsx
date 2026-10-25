import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {applyHacchu, HACCHU_LIVE} from '../hacchuLive.ts';
import {hacchuEmbedUrl, hacchuImport} from '../handoff.ts';
import type {Sale, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {useToast} from './ui.tsx';

const MIN_HEIGHT = 560;
const BOTTOM = 12;

/**
 * 販売見積書のページの中の販売受注簿（販売受注簿作成ツールを iframe で出す。やりとりは hacchuLive.ts）。
 * 見積書で入れたお客様・商品は、案件を直すたびに受注簿へ送る。受注簿で直した商品・足した商品・受注簿の中身は案件に入れる
 */
export function HacchuFrame({sale, settings, update, shown}: {sale: Sale; settings: Settings; update: Update; shown: boolean}) {
  const toast = useToast();
  const frame = useRef<HTMLIFrameElement>(null);
  // 送る内容（作った時刻は入れない：同じ内容なら送り直さない）
  const live = useMemo(() => hacchuImport(sale, settings, 0), [sale, settings]);
  const liveText = JSON.stringify(live);
  const latest = useRef({sale, live, liveText, settings});
  latest.current = {sale, live, liveText, settings};
  const ready = useRef(false);
  const sent = useRef('');
  const send = useRef((withState: boolean) => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    const now = latest.current;
    w.postMessage({type: HACCHU_LIVE, v: 1, saleId: now.sale.id, data: now.live, ...(withState ? {state: now.sale.hacchu ?? null} : {})}, location.origin);
    sent.current = now.liveText;
  }).current;

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== location.origin || !frame.current || ev.source !== frame.current.contentWindow) return;
      const msg: unknown = ev.data;
      if (typeof msg !== 'object' || msg === null) return;
      const type = (msg as {type?: unknown}).type;
      if (type === 'taiyo-hacchu-ready') {
        ready.current = true;
        send(true);
        return;
      }
      const id = latest.current.sale.id;
      if (applyHacchu(latest.current.sale, msg, latest.current.settings) === null) return;
      update('sales', (list) => list.map((x) => (x.id === id ? (applyHacchu(x, msg, latest.current.settings) ?? x) : x)));
      if (type === 'taiyo-hacchu-add') toast('受注簿で足した商品を、見積書にも入れました');
      if (type === 'taiyo-hacchu-remove') toast('受注簿で消した商品を、見積書からも消しました');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [update, toast, send]);
  // 案件を直したら送る（受注簿の中身が変わっただけのとき＝受注簿から届いたときは、同じ内容なので送らない）
  useEffect(() => {
    if (ready.current && liveText !== sent.current) send(false);
  }, [liveText, send]);

  // 中の枠は画面の下までの高さ（受注簿の中だけスクロールする。住宅改修のタブの中の特定福祉用具と同じ）
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!shown) return;
    const fit = () => {
      const el = frame.current;
      if (el) setHeight(Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - el.getBoundingClientRect().top - BOTTOM)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [shown]);

  return (
    <div className={shown ? '' : 'hidden'}>
      <iframe
        ref={frame}
        data-hacchu
        title="販売受注簿"
        src={hacchuEmbedUrl()}
        style={height ? {height} : undefined}
        className="block h-[calc(100vh-12rem)] w-full rounded-xl border border-slate-200 bg-white shadow-sm"
      />
    </div>
  );
}

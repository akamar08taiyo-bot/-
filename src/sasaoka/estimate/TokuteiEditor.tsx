// 様邸の画面の「🛁 特定福祉用具申請書」「🏷 販売見積書」のタブ：特定福祉用具のアプリ（太陽ポータルの tokutei/）を、この様邸のお客様の情報を渡して中に出す（tokuteiLink.ts）。
// 申請書のタブは申請書だけ（view=shinsei）、販売見積書のタブは見積書だけ（view=quote）。どちらも同じ特定福祉用具の案件（ユーザーの指示「申請書の中の商品名を入力したら、隣のタブの販売見積書に自動転記」）

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {jobName} from '../calc.ts';
import {CardFill} from '../components/CardReader.tsx';
import {Btn} from '../components/ui.tsx';
import {INSURER_INFO, jobInsurer} from '../estimateForms.ts';
import {flushTokutei, tokuteiUrl, writeTokutei} from '../tokuteiLink.ts';
import type {TokuteiView} from '../tokuteiLink.ts';
import type {Job} from '../types.ts';
import type {Update} from '../useStore.ts';

const MIN_HEIGHT = 560;
const BOTTOM = 16; // 下の余白（main の py-4）
const SLOW_MS = 10000; // これより長く中のアプリが出なければ「⟳ 読み込み直す」を出す

/** 中のアプリ（特定福祉用具）が出たか：出ると __taiyoTokuteiFlush を置く（tokutei の App.tsx）。同じサイトなので中を見られる */
const frameReady = (el: HTMLIFrameElement | null) => {
  try {
    return typeof (el?.contentWindow as (Window & {__taiyoTokuteiFlush?: unknown}) | null | undefined)?.__taiyoTokuteiFlush === 'function';
  } catch {
    return false;
  }
};

export function TokuteiEditor({job, view, onBack, tabs, update}: {job: Job; view: TokuteiView; onBack: () => void; tabs: ReactNode; update?: Update}) {
  const insurer = jobInsurer(job);
  // タブを開くたびに今のお客様の情報を渡す（住宅改修申請書・理由書で直した氏名・住所なども入る）。iframe が読み込むより前に書く
  useState(() => writeTokutei(job));
  // 介護保険証から入れたとき：中のアプリの保存を待ってから、新しい情報を渡して中のアプリを開き直す（特定福祉用具の案件にも入る）
  const [frameKey, setFrameKey] = useState(0);
  const [reload, setReload] = useState(false);
  useEffect(() => {
    if (!reload) return;
    setReload(false);
    void flushTokutei().then(() => {
      writeTokutei(job);
      setFrameKey((k) => k + 1);
    });
  }, [reload, job]);
  const setJob = (fn: (j: Job) => Job) => {
    update?.('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
    setReload(true);
  };
  // 中の枠は画面の下までの高さ（画面ごとスクロールさせず、特定福祉用具のアプリの中だけスクロールする。上の段が折り返す幅・画面の大きさを変えたときも合わせる）
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = frame.current;
      if (el) setHeight(Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - el.getBoundingClientRect().top - window.scrollY - BOTTOM)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  // 中のアプリが出るまでは「読み込んでいます…」、長くかかれば「⟳ 読み込み直す」（前は出ないまま待つしかなく「読み込み中で開かない」と言われた 2026-10-26）
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setReady(false);
    setSlow(false);
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (frameReady(frame.current)) {
        setReady(true);
        window.clearInterval(timer);
      } else if (Date.now() - started > SLOW_MS) setSlow(true);
    }, 300);
    return () => window.clearInterval(timer);
  }, [frameKey]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 一覧へ戻る
        </Btn>
        {tabs}
        {/* 介護保険証から入れるは、ほかのタブと同じくタブのすぐ右 */}
        {update && <CardFill job={job} setJob={setJob} />}
        <h1 className="text-lg font-bold text-[#14532d]">{job.customer.trim() ? jobName(job) : view === 'shinsei' ? '新しい特定福祉用具申請書' : '新しい販売見積書'}</h1>
        {insurer && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{INSURER_INFO[insurer].name}</span>}
      </div>
      <div className="relative">
        <iframe
          key={frameKey}
          ref={frame}
          data-tokutei
          title="特定福祉用具 購入申請書・見積もり作成"
          src={tokuteiUrl(job.id, view)}
          style={height ? {height} : undefined}
          className="block h-[calc(100vh-12rem)] w-full rounded-xl border border-slate-200 bg-white shadow-sm"
        />
        {!ready && slow && (
          <div role="status" className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-center gap-3 p-6 text-sm text-slate-600">
            <Btn color="white" onClick={() => setFrameKey((k) => k + 1)}>
              ⟳ 読み込み直す
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// 様邸の画面の「🛁 特定福祉用具申請書」のタブ：特定福祉用具のアプリ（太陽ポータルの tokutei/）を、この様邸のお客様の情報を渡して中に出す（tokuteiLink.ts）

import {useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {jobName} from '../calc.ts';
import {Btn} from '../components/ui.tsx';
import {INSURER_INFO, jobInsurer} from '../estimateForms.ts';
import {tokuteiUrl, writeTokutei} from '../tokuteiLink.ts';
import type {Job} from '../types.ts';

const MIN_HEIGHT = 560;
const BOTTOM = 16; // 下の余白（main の py-4）

export function TokuteiEditor({job, onBack, tabs}: {job: Job; onBack: () => void; tabs: ReactNode}) {
  const insurer = jobInsurer(job);
  // タブを開くたびに今のお客様の情報を渡す（住宅改修申請書・理由書で直した氏名・住所なども入る）。iframe が読み込むより前に書く
  useState(() => writeTokutei(job));
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
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 一覧へ戻る
        </Btn>
        {tabs}
        <h1 className="text-lg font-bold text-[#14532d]">{job.customer.trim() ? jobName(job) : '新しい特定福祉用具申請書'}</h1>
        {insurer && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{INSURER_INFO[insurer].name}</span>}
      </div>
      <iframe
        ref={frame}
        data-tokutei
        title="特定福祉用具 購入申請書・見積もり作成"
        src={tokuteiUrl(job.id)}
        style={height ? {height} : undefined}
        className="block h-[calc(100vh-12rem)] w-full rounded-xl border border-slate-200 bg-white shadow-sm"
      />
    </div>
  );
}

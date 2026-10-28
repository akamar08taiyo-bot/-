// 様邸の画面の「🛁 特定福祉用具申請書」「🏷 販売見積書」のタブ：特定福祉用具のアプリ（太陽ポータルの tokutei/）を、この様邸のお客様の情報を渡して中に出す（tokuteiLink.ts）。
// 申請書のタブは申請書だけ（view=shinsei）、販売見積書のタブは見積書だけ（view=quote）。どちらも同じ特定福祉用具の案件（ユーザーの指示「申請書の中の商品名を入力したら、隣のタブの販売見積書に自動転記」）

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {jobName} from '../calc.ts';
import {CardFill} from '../components/CardReader.tsx';
import {Btn, btnClass} from '../components/ui.tsx';
import {JobHeader, JobTitle} from './JobHeader.tsx';
import {HACCHU_PATH} from '../order.ts';
import {INSURER_INFO, jobInsurer} from '../estimateForms.ts';
import {linkedTokutei, readTokuteiSales, TOKUTEI_SALES_KEY, tokuteiSalesMonth, withTokuteiSalesMonth} from '../salesPlan.ts';
import type {TokuteiSale} from '../salesPlan.ts';
import {CATALOG_EVENT, CATALOG_MSG, flushTokutei, takeCatalog, tokuteiUrl, writeTokutei} from '../tokuteiLink.ts';
import type {TokuteiView} from '../tokuteiLink.ts';
import type {Job, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';

const MIN_HEIGHT = 560;
/** 特定福祉用具のアプリ（tokutei の SaleEditor.tsx）に頼めること。同じ名前を向こうでも使う */
type TokuteiCmd = 'excel' | 'print' | 'delete' | 'catalog' | 'uriage' | 'hacchu';
/** 販売受注簿作成ツール（特定福祉用具から開く口。tokutei の handoff.ts の hacchuUrl と同じ） */
const HACCHU_URL = `${HACCHU_PATH}?from=tokutei`;
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

/** 特定福祉用具のアプリが書いた案件のまとめ（売上月に使う。読めなければ空） */
const storedSales = (): TokuteiSale[] => {
  try {
    return readTokuteiSales(localStorage.getItem(TOKUTEI_SALES_KEY)).rows;
  } catch {
    return [];
  }
};

export function TokuteiEditor({
  job,
  view,
  onBack,
  tabs,
  batch,
  update,
  settings,
}: {
  job: Job;
  view: TokuteiView;
  onBack: () => void;
  tabs: ReactNode;
  batch?: ReactNode; // 📦 まとめて保存（3段目の初め。ほかのタブと同じ）
  update?: Update;
  settings?: Pick<Settings, 'tokuteiSalesMonths'>; // 販売見積書のタブの「売上月」（このアプリで変えた特定福祉用具の案件の月）
}) {
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
  const head = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = frame.current;
      if (el) setHeight(Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - el.getBoundingClientRect().top - window.scrollY - BOTTOM)));
    };
    fit();
    window.addEventListener('resize', fit);
    // 上の段の高さが変わったとき（商品を入れて売上月が出たときなど）も合わせる
    const ro = new ResizeObserver(fit);
    if (head.current) ro.observe(head.current);
    return () => {
      window.removeEventListener('resize', fit);
      ro.disconnect();
    };
  }, []);
  // 販売見積書のタブの「売上月」：この様邸の特定福祉用具の案件（商品のある案件）の売上見込み・受注残の月。中のアプリがまとめを書くたびに読み直す
  // （中の枠は別の画面なので、書いたら storage のできごとが届く）
  const [sales, setSales] = useState(storedSales);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TOKUTEI_SALES_KEY) setSales(storedSales());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const linked = linkedTokutei(job.id, sales);
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
  // 左の「📖 カタログを表示」「🖨 カタログを印刷」（tokuteiLink.ts の askCatalog）：中のアプリが出てから頼む（このタブを開く前に押したときも）
  useEffect(() => {
    if (!ready) return;
    const send = () => {
      const w = frame.current?.contentWindow;
      if (!w || !frameReady(frame.current)) return;
      const action = takeCatalog();
      if (action) w.postMessage({type: CATALOG_MSG, action}, location.origin);
    };
    send();
    window.addEventListener(CATALOG_EVENT, send);
    return () => window.removeEventListener(CATALOG_EVENT, send);
  }, [ready]);
  // 上の段のボタン（どのタブとも同じ JobHeader.tsx の形）を押したら、中のアプリ（SaleEditor.tsx の cmds）に頼む。中のアプリがまだ出ていなければ何もしない
  const cmd = (c: TokuteiCmd): boolean => {
    try {
      const run = (frame.current?.contentWindow as (Window & {__taiyoTokuteiCmd?: (c: TokuteiCmd) => boolean}) | null | undefined)?.__taiyoTokuteiCmd;
      return typeof run === 'function' ? run(c) === true : false;
    } catch {
      return false;
    }
  };
  const book = view === 'shinsei' ? '申請書' : '見積書';
  return (
    <div className="space-y-3">
      <div ref={head}>
        <JobHeader
          onBack={onBack}
          tabs={tabs}
          // 介護保険証から入れるは、ほかのタブと同じくタブのすぐ右
          extra={update && <CardFill job={job} setJob={setJob} />}
          // お客様名がまだないときの名前は、ほかのタブ（新しい申請書・新しい見積書・新しい理由書）と同じ長さに（長いと2段目のボタンが右へずれ、タブごとに位置が変わる）
          title={<JobTitle name={job.customer.trim() ? jobName(job) : view === 'shinsei' ? '新しい申請書' : '新しい見積書'} badge={insurer ? INSURER_INFO[insurer].name : undefined} />}
          primary={
            <>
              <Btn color="softGreen" onClick={() => cmd('excel')}>
                📗 {book}をExcelで保存
              </Btn>
              <Btn color="softSky" onClick={() => cmd('print')}>
                🖨 {book}を印刷
              </Btn>
              {/* 削除は特定福祉用具の案件（申請書・販売見積書）を消す。消したあとは、この様邸の新しい案件が開く */}
              <Btn color="white" onClick={() => cmd('delete')}>
                削除
              </Btn>
            </>
          }
          secondary={
            <>
              {batch}
              {view === 'shinsei' ? (
                <Btn color="softSky" onClick={() => cmd('catalog')}>
                  🖨 カタログを印刷
                </Btn>
              ) : (
                <>
                  <Btn color="white" onClick={() => cmd('uriage')}>
                    🧾 売上伝票依頼書
                  </Btn>
                  {/* 販売受注簿作成ツールを新しいタブで開く。リンクなので、ポップアップを止める設定でも開く。開く前に中のアプリが商品を置く（置けなければ開かない） */}
                  <a href={HACCHU_URL} target="_blank" onClick={(e) => cmd('hacchu') || e.preventDefault()} className={btnClass('white')}>
                    📤 販売受注簿に転記
                  </a>
                  {/* 売上月（工事見積書の「売上月」と同じ。仕入れの月は出さない＝ユーザーの指示「仕入れの月は不要」2026-10-28）。商品を入れた案件だけ。
                      画面だけの値で、中のアプリの見積書・申請書・Excel・印刷には出ない */}
                  {update && settings && linked.length > 0 && <TokuteiSalesMonth rows={linked} settings={settings} update={update} />}
                </>
              )}
            </>
          }
        />
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

/**
 * 特定福祉用具の売上月（売上見込み・受注残の月）。初めは案件の月（納品日。まだなければ承認日・申請日・見積日の月）で、ちがう月にするときだけ直す
 * （ユーザーの指示「特定福祉用具に関しても、売上を10月にいれるのか、11月にするのかを選択できるようにする」2026-10-28。工事見積書の売上月と同じく、ちがうときは薄い黄色）。
 * 直した月はこのアプリの設定（tokuteiSalesMonths）に持つ（売上見込みの「次月に回す」・一覧の ◀ ▶ と同じ所）
 */
function TokuteiSalesMonth({rows, settings, update}: {rows: TokuteiSale[]; settings: Pick<Settings, 'tokuteiSalesMonths'>; update: Update}) {
  const month = tokuteiSalesMonth(rows[0], settings);
  const apart = month !== rows[0].month;
  return (
    <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
      売上月
      <input
        type="month"
        value={month}
        onChange={(e) => {
          const m = e.target.value;
          if (m) update('settings', (s) => ({...s, tokuteiSalesMonths: withTokuteiSalesMonth(s.tokuteiSalesMonths, rows, m)}));
        }}
        className={`h-11 rounded-md border px-2 text-base font-normal text-slate-800 ${apart ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-white'}`}
        aria-label="売上月"
        title={apart ? '納品日などの月とちがう月です' : '納品日の月（まだなければ承認日・申請日・見積日の月）'}
      />
    </label>
  );
}

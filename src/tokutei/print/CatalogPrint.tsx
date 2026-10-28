import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CATALOG, catalogLabel, catalogPicks, catalogTitle} from '../catalog.ts';
import type {Sale} from '../types.ts';
import {loadCatalogPage} from './catalogPdf.ts';
import type {CatalogImage} from './catalogPdf.ts';
import {useFitZoom} from './PrintView.tsx';

/**
 * 介援隊のカタログの印刷（catalog.ts）。カタログのページを A4 縦の紙で並べ、チェックしたページだけ印刷する。
 * 初めは見積もりの商品が載っているページにチェック（品番・細目・商品名で）。画面にもチェックしたページだけを出す（ユーザーの指示「チェックを入れたら、
 * 該当のカタログページを一番上にもってくる」「該当のページのみ印刷プレビューに表示する」2026-10-26。前は全部のページを並べ、外したページを薄くしていた）
 */
export function CatalogPrintView({sale, onClose}: {sale: Sale; onClose: () => void}) {
  const zoom = useFitZoom();
  const [pages, setPages] = useState<(CatalogImage | 'error' | null)[]>(() => CATALOG.map(() => null));
  const [picked, setPicked] = useState<Set<number>>(() => catalogPicks(sale.items));
  const touched = useRef(false);
  const items = useRef(sale.items); // 開いたときの商品で選ぶ（印刷の画面を開いているあいだに商品は変わらない）
  useEffect(() => {
    const before = document.title;
    document.title = catalogTitle(sale);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.title = before;
      window.removeEventListener('keydown', onKey);
    };
  }, [sale, onClose]);
  // 1ページずつ読む（読めたページから出す）。全部読めたら、品番の載っているページにもチェック（まだ手で変えていなければ）
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      const got: (CatalogImage | 'error')[] = [];
      for (const [i, p] of CATALOG.entries()) {
        const r = await loadCatalogPage(p.file).catch(() => 'error' as const);
        if (r !== 'error') urls.push(r.url);
        if (!alive) break;
        got[i] = r;
        setPages((c) => c.map((x, j) => (j === i ? r : x)));
      }
      if (alive && !touched.current) setPicked(catalogPicks(items.current, got.map((x) => (x && x !== 'error' ? x.codes : null))));
    })();
    return () => {
      alive = false;
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);
  const toggle = (i: number) => {
    touched.current = true;
    setPicked((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  // 左の大きな「印刷する」は画面のまん中の高さ。ただし上の帯（ページの名前）より下に（住宅改修のタブの中の低い枠では、まん中だと上の帯の「閉じる」にかぶった）
  const bar = useRef<HTMLDivElement>(null);
  const [sideTop, setSideTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const place = () => setSideTop(Math.round(Math.max((bar.current?.getBoundingClientRect().bottom ?? 0) + 16, window.innerHeight / 2 - 72)));
    place();
    const ro = new ResizeObserver(place);
    if (bar.current) ro.observe(bar.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, []);
  const last = Math.max(-1, ...picked);
  const ready = picked.size > 0 && [...picked].every((i) => pages[i] && pages[i] !== 'error');
  return createPortal(
    <div className="print-overlay">
      <div ref={bar} className="print-toolbar">
        <span className="font-bold">カタログ（介援隊）</span>
        {/* 広い画面（xl）では「印刷する」は左の空いた所に大きく（下の cat-print-side）。狭い画面はここ（ページの左に置く所がない） */}
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          className="rounded-md bg-sky-100 px-5 py-2.5 text-base font-bold text-sky-900 shadow hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40 xl:hidden"
        >
          🖨 印刷する
        </button>
        {/* ページの名前は大きく、押せる所を広く（ユーザーの指示「チラシリスト（例浴槽手すり、浴槽台）などの文字は大きくして選びやすくする」2026-10-28。前は 14px の字とチェックだけ）。
            スマホはページが12あると上の帯が画面の半分になるので、帯の中でスクロールする高さまで */}
        <span role="group" aria-label="印刷するページ" className="flex max-h-[10rem] flex-wrap items-center gap-x-1.5 gap-y-1 overflow-y-auto sm:max-h-none sm:overflow-visible">
          {CATALOG.map((p, i) => (
            <label
              key={p.file}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-base sm:text-[17px] ${picked.has(i) ? 'bg-white/20 ring-1 ring-white/60' : 'hover:bg-white/10'}`}
            >
              <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="h-5 w-5 shrink-0" />
              {catalogLabel(p)}
            </label>
          ))}
        </span>
        <button type="button" onClick={onClose} className="rounded-md border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
          閉じる
        </button>
      </div>
      {/* 「印刷する」を左の空いた所に大きく（ユーザーの指示「印刷ボタンをこちらに大きくもってくる」2026-10-28。前は上の帯の題名の横の小さなボタン）。
          紙（A4 の幅 794px）の左に 240px ほど空く広い画面（xl・1280px〜）だけ */}
      <button
        type="button"
        onClick={() => window.print()}
        disabled={!ready}
        style={sideTop === null ? undefined : {top: sideTop}}
        className="cat-print-side fixed left-6 top-1/2 z-[2] hidden h-36 w-44 flex-col items-center justify-center gap-2 rounded-xl bg-sky-100 text-xl font-bold text-sky-900 shadow-lg hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40 xl:flex"
      >
        <span aria-hidden="true" className="text-4xl leading-none">🖨</span>
        <span className="sr-only">🖨 </span>印刷する
      </button>
      <div className="print-root" style={{zoom}}>
        {picked.size === 0 && <p className="p-10 text-center text-sm text-white/80">印刷するページにチェックを入れてください</p>}
        {CATALOG.map((p, i) => {
          const pg = pages[i];
          if (!picked.has(i)) return null;
          return (
            <div key={p.file} className={`est-sheet cat-sheet ${i === last ? 'est-last' : ''}`} aria-label={`カタログ ${catalogLabel(p)}`}>
              {pg && pg !== 'error' ? (
                <img src={pg.url} alt={catalogLabel(p)} />
              ) : (
                <p className="p-10 text-center text-sm text-slate-500">{pg === 'error' ? `${catalogLabel(p)} を読めませんでした` : `${catalogLabel(p)} を読み込んでいます…`}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

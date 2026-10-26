import {useEffect, useRef, useState} from 'react';
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
  const last = Math.max(-1, ...picked);
  const ready = picked.size > 0 && [...picked].every((i) => pages[i] && pages[i] !== 'error');
  return createPortal(
    <div className="print-overlay">
      <div className="print-toolbar">
        <span className="font-bold">カタログ（介援隊）</span>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          className="rounded-md bg-sky-100 px-4 py-2 text-sm font-bold text-sky-900 shadow hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🖨 印刷する
        </button>
        {/* スマホはページが12あると上の帯が画面の半分になるので、帯の中でスクロールする高さまで */}
        <span role="group" aria-label="印刷するページ" className="flex max-h-[7.5rem] flex-wrap items-center gap-x-3 gap-y-1 overflow-y-auto text-sm sm:max-h-none sm:overflow-visible">
          {CATALOG.map((p, i) => (
            <label key={p.file} className="flex items-center gap-1">
              <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="h-4 w-4" />
              {catalogLabel(p)}
            </label>
          ))}
        </span>
        <button type="button" onClick={onClose} className="rounded-md border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
          閉じる
        </button>
      </div>
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

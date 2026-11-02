import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CATALOG, catalogLabel, catalogPicks, catalogTitle} from '../catalog.ts';
import type {CatalogPagesFilter} from '../catalog.ts';
import {salePages} from '../catalogItems.ts';
import type {Sale} from '../types.ts';
import {loadCatalogCodes, loadCatalogPage, loadCatalogProducts} from './catalogPdf.ts';
import type {CatalogImage} from './catalogPdf.ts';
import {MarkLayer, MarkToggle, rememberMarks, rememberedMarks, saleMarks, useMarkKeys} from './CatalogMarks.tsx';
import type {Mark, Marks} from './CatalogMarks.tsx';
import {useFitZoom} from './PrintView.tsx';

/**
 * 介援隊のカタログの印刷（catalog.ts）。カタログのページを A4 縦の紙で並べ、チェックしたページだけ印刷する。
 * 初めは見積もりの商品が載っているページにチェック（品番・細目・商品名で）。画面にもチェックしたページだけを出す（ユーザーの指示「チェックを入れたら、
 * 該当のカタログページを一番上にもってくる」「該当のページのみ印刷プレビューに表示する」2026-10-26。前は全部のページを並べ、外したページを薄くしていた）。
 * 初めのチェックは、商品の種目・項目名・メーカーで絞った商品のページ（salePages。商品検索と同じ絞り方）。only（カタログの窓で絞ったページ）があればそのページ。
 * ページの一覧も絞ったページだけを出し、「＋ ほかのページ」で全部（ユーザーの指示「該当の項目で絞ったら絞ったものだけを表示するようにする。
 * 現在は、自分でチェックする形式」2026-11-01）。絵にするのはチェックしたページだけ（26ページを全部絵にすると重い）
 */
export function CatalogPrintView({sale, only, onClose}: {sale: Sale; only?: CatalogPagesFilter; onClose: () => void}) {
  const zoom = useFitZoom();
  const [pages, setPages] = useState<(CatalogImage | 'error' | null)[]>(() => CATALOG.map(() => null));
  const [fixed] = useState(() => (only?.pages.length ? new Set(CATALOG.flatMap((c, i) => (only.pages.includes(c.page) ? [i] : []))) : null));
  const [picked, setPicked] = useState<Set<number>>(() => fixed ?? catalogPicks(sale.items));
  const [matched, setMatched] = useState<Set<number>>(() => fixed ?? catalogPicks(sale.items)); // 絞ったページ（一覧に出す）
  const [showAll, setShowAll] = useState(false);
  const touched = useRef(false);
  const items = useRef(sale.items); // 開いたときの商品で選ぶ（印刷の画面を開いているあいだに商品は変わらない）
  // 「🔲 枠で囲む」（CatalogMarks.tsx）：ページごとの枠・選んでいる枠・ページの絵の大きさ（枠の位置は絵に対する割合）
  const [marking, setMarking] = useState(false);
  const [marks, setMarksState] = useState<Marks>(() => rememberedMarks(sale.id));
  const [sel, setSel] = useState<{file: string; i: number} | null>(null);
  const [natural, setNatural] = useState<Record<string, {w: number; h: number}>>({});
  const history = useRef<Marks[]>([]); // 変える前の枠（Ctrl+Z で1つ前に戻す。消した枠も戻る）
  const putMarks = (next: Marks) => {
    rememberMarks(sale.id, next);
    return next;
  };
  const setMarks = (file: string, list: Mark[]) => {
    history.current.push(marks);
    setMarksState(putMarks({...marks, [file]: list}));
  };
  const toggleMarking = async () => {
    if (marking) {
      setMarking(false);
      setSel(null);
      return;
    }
    setMarking(true);
    // 初めて押したとき（枠がひとつもない）は、見積もりの商品のカタログの囲みに枠を付ける
    if (Object.values(marks).some((l) => l.length)) return;
    const products = await loadCatalogProducts().catch(() => []);
    const auto = saleMarks(
      items.current,
      products,
      (page) => natural[CATALOG.find((c) => c.page === page)?.file ?? ''] ?? null,
      (page) => {
        const i = CATALOG.findIndex((c) => c.page === page);
        return i >= 0 && picked.has(i) ? CATALOG[i].file : null;
      },
    );
    if (Object.keys(auto).length) {
      history.current.push(marks);
      setMarksState(putMarks(auto));
    }
  };
  useMarkKeys(
    marking,
    () => {
      if (!sel) return;
      setMarks(sel.file, (marks[sel.file] ?? []).filter((_, j) => j !== sel.i));
      setSel(null);
    },
    () => {
      const prev = history.current.pop();
      if (!prev) return;
      setMarksState(putMarks(prev));
      setSel(null);
    },
  );
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
  // 品番・商品の一覧（文字だけ）を読んだら、商品の載っているページにチェックし直す（まだ手で変えていなければ。カタログの窓で絞って開いたときはそのまま）
  const alive = useRef(true);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    alive.current = true;
    if (!fixed) {
      void Promise.all([loadCatalogCodes(), loadCatalogProducts().catch(() => [])]).then(([codes, products]) => {
        if (!alive.current || touched.current) return;
        const m = salePages(items.current, codes, products);
        setPicked(m);
        setMatched(m);
      });
    }
    return () => {
      alive.current = false;
      for (const u of urls.current) URL.revokeObjectURL(u);
    };
  }, []);
  // チェックしたページを1ページずつ絵にする（読めたページから出す。一度読んだページは覚えておく）
  const requested = useRef(new Set<number>());
  useEffect(() => {
    void (async () => {
      for (const i of [...picked].sort((a, b) => a - b)) {
        if (requested.current.has(i)) continue;
        requested.current.add(i);
        const r = await loadCatalogPage(CATALOG[i].file).catch(() => 'error' as const);
        if (r !== 'error') urls.current.push(r.url);
        if (!alive.current) return;
        setPages((c) => c.map((x, j) => (j === i ? r : x)));
      }
    })();
  }, [picked]);
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
    // 「🔲 枠で囲む」（高さ 80px＋すき間 12px）を上に重ねても、「印刷する」は前と同じ高さ（帯より下にはみ出すときは帯の下から）
    const place = () => setSideTop(Math.round(Math.max((bar.current?.getBoundingClientRect().bottom ?? 0) + 16, window.innerHeight / 2 - 72 - 92)));
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
  // 一覧に出すページ：絞ったページ（とチェックしたページ）。「＋ ほかのページ」で全部
  const narrowed = matched.size > 0 && !showAll;
  const listed = CATALOG.flatMap((_, i) => (!narrowed || matched.has(i) || picked.has(i) ? [i] : []));
  const ready = picked.size > 0 && [...picked].every((i) => pages[i] && pages[i] !== 'error');
  return createPortal(
    <div className="print-overlay">
      <div ref={bar} className="print-toolbar">
        <span className="font-bold">カタログ（介援隊）</span>
        {/* 広い画面（xl）では「印刷する」は左の空いた所に大きく（下の cat-print-side）。狭い画面はここ（ページの左に置く所がない） */}
        <span className="xl:hidden">
          <MarkToggle on={marking} onClick={() => void toggleMarking()} />
        </span>
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
          {only?.label && <span className="text-sm text-white/80">🔍 {only.label}</span>}
          {listed.map((i) => (
            <label
              key={CATALOG[i].file}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-base sm:text-[17px] ${picked.has(i) ? 'bg-white/20 ring-1 ring-white/60' : 'hover:bg-white/10'}`}
            >
              <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="h-5 w-5 shrink-0" />
              {catalogLabel(CATALOG[i])}
            </label>
          ))}
          {matched.size > 0 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-md border border-white/40 px-2.5 py-1 text-sm text-white hover:bg-white/10">
              {showAll ? '絞ったページだけ' : `＋ ほかのページ（${CATALOG.length - listed.length}）`}
            </button>
          )}
        </span>
        <button type="button" onClick={onClose} className="rounded-md border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
          閉じる
        </button>
      </div>
      {/* 「印刷する」を左の空いた所に大きく（ユーザーの指示「印刷ボタンをこちらに大きくもってくる」2026-10-28。前は上の帯の題名の横の小さなボタン）。
          紙（A4 の幅 794px）の左に 240px ほど空く広い画面（xl・1280px〜）だけ。その上に「🔲 枠で囲む」（ユーザーの指示「カタログを丸で囲むボタンをつくる。
          印刷ボタンと並行して作成する」「丸でかこむは、しかくでわくがこみに変更」2026-11-02） */}
      <div style={sideTop === null ? undefined : {top: sideTop}} className="cat-print-side fixed left-6 top-1/2 z-[2] hidden flex-col gap-3 xl:flex">
        <MarkToggle big on={marking} onClick={() => void toggleMarking()} />
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          className="flex h-36 w-44 flex-col items-center justify-center gap-2 rounded-xl bg-sky-100 text-xl font-bold text-sky-900 shadow-lg hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true" className="text-4xl leading-none">🖨</span>
          <span className="sr-only">🖨 </span>印刷する
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
                natural[p.file] ? (
                  // 枠を重ねるため、絵と同じ縦横の比の箱に入れる（紙の中で縦横どちらかいっぱい・まん中。印刷の紙の高さ 296mm に収める）
                  <div className="cat-mark-frame" style={{aspectRatio: `${natural[p.file].w} / ${natural[p.file].h}`, ...(natural[p.file].w / natural[p.file].h > 210 / 296 ? {width: '100%'} : {height: '100%'})}}>
                    <MarkLayer
                      marks={marks[p.file] ?? []}
                      on={marking}
                      onChange={(list) => setMarks(p.file, list)}
                      selected={sel?.file === p.file ? sel.i : null}
                      onSelect={(i) => setSel(i === null ? null : {file: p.file, i})}
                      label={`${catalogLabel(p)}の枠`}
                    >
                      <img src={pg.url} alt={catalogLabel(p)} draggable={false} />
                    </MarkLayer>
                  </div>
                ) : (
                  <img
                    src={pg.url}
                    alt={catalogLabel(p)}
                    onLoad={(e) => {
                      const {naturalWidth: w, naturalHeight: h} = e.currentTarget;
                      setNatural((n) => ({...n, [p.file]: {w, h}}));
                    }}
                  />
                )
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

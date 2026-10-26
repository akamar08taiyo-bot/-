// カタログの窓（ユーザーの指示「商品を入力する際、カタログから検索という欄を入力して、右のスペースにカタログを開くことができる。
// カタログを見ながら商品を入力できるようにする。カタログのポップは位置を移動したり、大きさを変更できるようにする」2026-10-26）。
// 画面の右に浮かぶ窓で、上の帯をつかむと動き、右下の角をつかむと大きさが変わる（マウスでも指でも）。置いた所・大きさはこの端末で覚える。
// 「カタログから検索」に商品名・品番（261-S1063 など）を打つと、その字のあるページだけを並べる。ページを押すとそのページを出す
import {useEffect, useMemo, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {CATALOG, catalogLabel, catalogMatches, catalogPicks} from '../catalog.ts';
import type {Sale} from '../types.ts';
import {loadCatalogPage} from './catalogPdf.ts';
import type {CatalogImage} from './catalogPdf.ts';

const KEY = 'taiyo-tokutei-catalog-window-v1'; // 窓の位置・大きさ（この端末だけ）
const MIN = {w: 320, h: 260};

/** 読んだページ（窓を閉じても覚えておく。開くたびに読み直さない） */
const loaded = new Map<string, Promise<CatalogImage | null>>();
function page(file: string): Promise<CatalogImage | null> {
  let p = loaded.get(file);
  if (!p) {
    p = loadCatalogPage(file).catch(() => null);
    loaded.set(file, p);
  }
  return p;
}

type Box = {x: number; y: number; w: number; h: number};
/** 初めは画面の右（プレビューの所）。前に置いた所があればそこ（画面からはみ出す分は戻す） */
function firstBox(): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const def = vw < 640 ? {x: 8, y: Math.round(vh * 0.35), w: vw - 16, h: Math.round(vh * 0.6)} : {x: vw - Math.min(620, Math.round(vw * 0.46)) - 16, y: 72, w: Math.min(620, Math.round(vw * 0.46)), h: vh - 100};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Box | null;
    if (v && [v.x, v.y, v.w, v.h].every((n) => typeof n === 'number' && Number.isFinite(n))) return clampBox(v);
  } catch {
    /* 覚えていなければ初めの所 */
  }
  return def;
}
/** 窓は画面の中に収める（はみ出すと右下の角をつかめなくなる） */
function clampBox(b: Box): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(Math.min(MIN.w, vw), Math.min(b.w, vw));
  const h = Math.max(Math.min(MIN.h, vh), Math.min(b.h, vh));
  return {w, h, x: Math.max(0, Math.min(b.x, vw - w)), y: Math.max(0, Math.min(b.y, vh - h))};
}

export function CatalogViewer({sale, query: initial, onClose, onPrint}: {sale: Sale; query: string; onClose: () => void; onPrint: () => void}) {
  const [box, setBox] = useState<Box>(firstBox);
  const [query, setQuery] = useState(initial);
  const [texts, setTexts] = useState<(string | null)[]>(() => CATALOG.map(() => null));
  const [images, setImages] = useState<(CatalogImage | null | undefined)[]>(() => CATALOG.map(() => undefined));
  const [zoom, setZoom] = useState(1);
  // 初めに出すページ：見積もりの商品が載っているページ（なければ1ページ目）
  const [current, setCurrent] = useState(() => [...catalogPicks(sale.items)][0] ?? 0);
  useEffect(() => setQuery(initial), [initial]);
  // ページを読む（読めたページから検索できる）
  useEffect(() => {
    let alive = true;
    CATALOG.forEach((p, i) => {
      void page(p.file).then((r) => {
        if (!alive) return;
        setImages((c) => c.map((x, j) => (j === i ? r : x)));
        setTexts((c) => c.map((x, j) => (j === i ? (r?.text ?? '') : x)));
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  const matches = useMemo(() => catalogMatches(query, texts), [query, texts]);
  // 検索したら、見つかった最初のページを出す（打つたびに。見つかったページの中を押して選び直せる）
  useEffect(() => {
    if (!query.trim()) return;
    if (matches.length && !matches.includes(current)) setCurrent(matches[0]);
  }, [query, matches]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(box));
    } catch {
      /* 覚えられなくても使える */
    }
  }, [box]);
  useEffect(() => {
    const onResize = () => setBox((b) => clampBox(b));
    const onKey = (e: KeyboardEvent) => {
      // 印刷の画面（カタログの印刷）を開いているときの Esc は、印刷の画面だけを閉じる
      if (e.key === 'Escape' && !document.querySelector('.print-overlay')) onClose();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  /** つかんで動かす（kind=move）・右下の角で大きさを変える（kind=size） */
  const drag = (e: ReactPointerEvent<HTMLElement>, kind: 'move' | 'size') => {
    if ((e.target as HTMLElement).closest('button, input') && kind === 'move') return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = {x: e.clientX, y: e.clientY, box};
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const b = start.box;
      // 大きさを変えるときは、左上は動かさず画面の右下まで
      setBox(clampBox(kind === 'move' ? {...b, x: b.x + dx, y: b.y + dy} : {...b, w: Math.min(b.w + dx, window.innerWidth - b.x), h: Math.min(b.h + dy, window.innerHeight - b.y)}));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const img = images[current];
  const tool = 'h-8 min-w-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 hover:bg-slate-50';
  return (
    <div
      role="dialog"
      aria-label="カタログ"
      aria-modal="false"
      className="no-print fixed z-40 flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
      style={{left: box.x, top: box.y, width: box.w, height: box.h}}
    >
      <div onPointerDown={(e) => drag(e, 'move')} className="flex cursor-move touch-none flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-2 py-1.5" title="つかんで動かす">
        <span className="text-sm font-bold text-slate-700">📖 カタログ</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カタログから検索（商品名・品番）"
          aria-label="カタログから検索"
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm"
        />
        <button type="button" className={tool} onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10))} aria-label="小さく">
          −
        </button>
        <button type="button" className={tool} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.2) * 10) / 10))} aria-label="大きく">
          ＋
        </button>
        <button type="button" className={`${tool} !border-sky-300 !bg-sky-50 !text-sky-900`} onClick={onPrint}>
          🖨 印刷
        </button>
        <button type="button" className={tool} onClick={onClose} aria-label="カタログを閉じる">
          ✕
        </button>
      </div>
      <div role="group" aria-label="カタログのページ" className="flex max-h-20 flex-wrap gap-1 overflow-y-auto border-b border-slate-200 px-2 py-1.5">
        {matches.length === 0 && <span className="text-xs text-slate-500">見つかりません</span>}
        {matches.map((i) => (
          <button
            key={CATALOG[i].file}
            type="button"
            aria-pressed={i === current}
            onClick={() => setCurrent(i)}
            className={`rounded-md border px-2 py-0.5 text-xs ${i === current ? 'border-sky-400 bg-sky-100 text-sky-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {catalogLabel(CATALOG[i])}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-slate-200" aria-label="カタログのページの絵">
        {img ? (
          <img src={img.url} alt={catalogLabel(CATALOG[current])} className="block max-w-none" style={{width: `${zoom * 100}%`}} draggable={false} />
        ) : (
          <p className="p-6 text-center text-sm text-slate-500">{img === null ? `${catalogLabel(CATALOG[current])} を読めませんでした` : 'カタログを読み込んでいます…'}</p>
        )}
      </div>
      {/* 右下の角：つかんで大きさを変える */}
      <div
        onPointerDown={(e) => drag(e, 'size')}
        className="absolute bottom-0 right-0 h-6 w-6 cursor-nwse-resize touch-none"
        role="button"
        aria-label="カタログの窓の大きさ"
        title="つかんで大きさを変える"
        style={{background: 'linear-gradient(135deg, transparent 50%, rgb(148 163 184) 50%, rgb(148 163 184) 60%, transparent 60%, transparent 70%, rgb(148 163 184) 70%, rgb(148 163 184) 80%, transparent 80%)'}}
      />
    </div>
  );
}

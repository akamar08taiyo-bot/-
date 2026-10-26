import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {ShinseiPages} from '../components/ShinseiPreview.tsx';
import {estimateBaseName, estimatePreview} from '../estimateBook.ts';
import type {EstimateField} from '../estimateBook.ts';
import type {PvPage, ShinseiField} from '../shinseiPreview.ts';
import type {Sale, Settings} from '../types.ts';
import {saveEstimateBook, useEstimateTemplate} from './estimateFiles.ts';

/** A4縦（210mm）を画面の幅に合わせて縮めて見せる（印刷は原寸。tokutei.css の @media print） */
const A4_WIDTH_PX = (210 / 25.4) * 96;
const MM = 96 / 25.4;
/** 原本の印刷の余白（左 17mm・右 10mm・上 14mm・下 8mm）の内側に、1枚に収まる大きさで描く */
const INNER = {w: (210 - 17 - 10) * MM, h: (297 - 14 - 8) * MM};

export function useFitZoom(): number {
  const calc = () => Math.min(1, Math.max(0.3, (window.innerWidth - 16) / A4_WIDTH_PX));
  const [zoom, setZoom] = useState(calc);
  useEffect(() => {
    const onResize = () => setZoom(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return zoom;
}

const NONE = new Set<EstimateField>();

/** 見積書（会社の見積書の原本の形）の印刷イメージ。ブラウザの印刷で、そのまま紙・PDF にできる */
export function PrintView({sale, settings, onClose}: {sale: Sale; settings: Settings; onClose: () => void}) {
  const zoom = useFitZoom();
  const template = useEstimateTemplate(true);
  const pages = useMemo(() => (template ? estimatePreview(template, sale, settings) : null), [template, sale, settings]);
  useEffect(() => {
    // PDF に保存するときのファイル名の元になる（「山田 花子様 販売見積書」。Excel と同じ）
    const before = document.title;
    document.title = estimateBaseName(sale);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.title = before;
      window.removeEventListener('keydown', onKey);
    };
  }, [sale, onClose]);
  // 1枚に収まる大きさ（紙の余白の内側。プレビューの紙の余白の分もふくめて。2・3ページ目も1ページ目と同じ大きさ）
  const page = pages?.[0];
  const scale = page ? Math.min(INNER.w / (page.width + 36), INNER.h / (page.height + 36)) : 1;
  return (
    <div className="print-overlay">
      <div className="print-toolbar">
        <span className="font-bold">見積書（A4縦）</span>
        <button type="button" onClick={() => window.print()} className="rounded-md bg-sky-100 px-4 py-2 text-sm font-bold text-sky-900 shadow hover:bg-sky-200">
          🖨 印刷する
        </button>
        <button type="button" onClick={() => void saveEstimateBook(sale, settings)} className="rounded-md bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 shadow hover:bg-emerald-100">
          📗 Excelで保存
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
          閉じる
        </button>
      </div>
      <div className="print-root" style={{zoom}}>
        {/* 1ページずつ A4 の紙に（明細が多いときは3ページまで。estimateBook.ts） */}
        {(pages ?? [null]).map((p, i) => (
          <div key={i} className="est-sheet" aria-label={i === 0 ? '見積書の印刷' : `見積書の印刷（${i + 1}ページ目）`}>
            {p && <ShinseiPages<EstimateField> pages={[p]} missing={NONE} active={null} label={() => ''} onOpen={() => undefined} title="見積書" print fixedScale={scale} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const NO_FIELDS = new Set<ShinseiField>();

/**
 * 申請書の印刷イメージ（ユーザーの指示「申請書をEXCEL保存の横に、印刷ボタンを設置する」2026-10-26）。画面のプレビューと同じページ（Excel に保存するときと同じ書き込みをしたシート）を、
 * 1ページずつ A4 縦の紙の余白の内側に入る大きさで描く。ブラウザの印刷で、そのまま紙・PDF にできる
 */
export function ShinseiPrintView({pages, title, onClose, onExcel}: {pages: PvPage[]; title: string; onClose: () => void; onExcel: () => void}) {
  const zoom = useFitZoom();
  useEffect(() => {
    // PDF に保存するときのファイル名の元になる
    const before = document.title;
    document.title = title;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.title = before;
      window.removeEventListener('keydown', onKey);
    };
  }, [title, onClose]);
  // 印刷するページ：初めは1枚目（事前申請書）だけ（ユーザーの指示「申請書印刷の場合は、１枚目のみ印刷、デフォルトは」2026-10-26）。
  // ほかのページもチェックで足せる。外したページは画面では薄く、印刷には出さない
  const [picked, setPicked] = useState<Set<number>>(() => new Set([0]));
  const last = Math.max(-1, ...picked);
  const toggle = (i: number) =>
    setPicked((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  // 案件の画面（印刷しない main の中）から開くので、body の直下に出す（main ごと印刷から外れないように）
  return createPortal(
    <div className="print-overlay">
      <div className="print-toolbar">
        <span className="font-bold">申請書（A4縦）</span>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={picked.size === 0}
          className="rounded-md bg-sky-100 px-4 py-2 text-sm font-bold text-sky-900 shadow hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🖨 印刷する
        </button>
        {pages.length > 1 && (
          <span role="group" aria-label="印刷するページ" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {pages.map((p, i) => (
              <label key={i} className="flex items-center gap-1" title={p.sheet}>
                <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="h-4 w-4" />
                {i + 1}枚目
              </label>
            ))}
          </span>
        )}
        <button type="button" onClick={onExcel} className="rounded-md bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 shadow hover:bg-emerald-100">
          📗 Excelで保存
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
          閉じる
        </button>
      </div>
      <div className="print-root" style={{zoom}}>
        {pages.map((p, i) => (
          <div key={i} className={`est-sheet ${picked.has(i) ? '' : 'est-skip'} ${i === last ? 'est-last' : ''}`} aria-label={`申請書の印刷（${i + 1}ページ目）`}>
            <ShinseiPages pages={[p]} missing={NO_FIELDS} active={null} label={() => ''} onOpen={() => undefined} title="申請書" print fixedScale={Math.min(INNER.w / (p.width + 36), INNER.h / (p.height + 36))} />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

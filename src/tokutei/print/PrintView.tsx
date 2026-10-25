import {useEffect, useMemo, useState} from 'react';
import {ShinseiPages} from '../components/ShinseiPreview.tsx';
import {estimatePreview} from '../estimateBook.ts';
import type {EstimateField} from '../estimateBook.ts';
import {customerLabel} from '../sales.ts';
import type {Sale, Settings} from '../types.ts';
import {saveEstimateBook, useEstimateTemplate} from './estimateFiles.ts';

/** A4縦（210mm）を画面の幅に合わせて縮めて見せる（印刷は原寸。tokutei.css の @media print） */
const A4_WIDTH_PX = (210 / 25.4) * 96;
const MM = 96 / 25.4;
/** 原本の印刷の余白（左 17mm・右 10mm・上 14mm・下 8mm）の内側に、1枚に収まる大きさで描く */
const INNER = {w: (210 - 17 - 10) * MM, h: (297 - 14 - 8) * MM};

function useFitZoom(): number {
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
    // PDF に保存するときのファイル名の元になる（「御見積書_山田 花子様」）
    const before = document.title;
    document.title = `御見積書_${customerLabel(sale).replace(/\s+様$/, '様')}`;
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
        <button type="button" onClick={() => window.print()} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-sky-600">
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

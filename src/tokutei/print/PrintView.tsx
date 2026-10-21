import {useEffect, useState} from 'react';
import {customerLabel} from '../sales.ts';
import type {Sale, Settings} from '../types.ts';
import {EstimateDoc} from './EstimateDoc.tsx';
import {saveEstimateXlsx} from './estimateXlsx.ts';

/** A4縦（210mm）を画面の幅に合わせて縮めて見せる（印刷は原寸。tokutei.css の @media print） */
const A4_WIDTH_PX = (210 / 25.4) * 96;

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

/** 見積書の印刷イメージ。ブラウザの印刷で、そのまま紙・PDF にできる */
export function PrintView({sale, settings, onClose}: {sale: Sale; settings: Settings; onClose: () => void}) {
  const zoom = useFitZoom();
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
  return (
    <div className="print-overlay">
      <div className="print-toolbar">
        <span className="font-bold">見積書（A4縦）</span>
        <button type="button" onClick={() => window.print()} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-sky-600">
          🖨 印刷する
        </button>
        <button type="button" onClick={() => saveEstimateXlsx(sale, settings)} className="rounded-md bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 shadow hover:bg-emerald-100">
          📗 Excelで保存
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
          閉じる
        </button>
      </div>
      <div className="print-root" style={{zoom}}>
        <EstimateDoc sale={sale} settings={settings} />
      </div>
    </div>
  );
}

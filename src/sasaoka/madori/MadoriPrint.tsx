// 見取図の印刷（A4横）。いただいた Excel のテンプレートと同じ並び（sheet.ts の pageSvg）。階が2つ以上なら1階ずつ1枚。
// 申請書の印刷（ShinseiPrint.tsx）と同じく body の直下に出し、印刷のあいだはアプリの画面を出さない（html.shinsei-printing）
import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {Btn} from '../components/ui.tsx';
import type {Job, Settings} from '../types.ts';
import type {Madori} from './model.ts';
import {floorLegend, pageSvg, placeLookup, sheetFloors, sheetText} from './sheet.ts';

const MM = 96 / 25.4;

export function MadoriPrint({job, settings, madori, onClose}: {job: Job; settings: Settings; madori: Madori; onClose: () => void}) {
  const t = sheetText(job, settings, madori);
  const look = useMemo(() => placeLookup(job, settings), [job, settings]);
  const floors = sheetFloors(madori);
  const pages = floors.map((f, i) => pageSvg(t, madori, f, floorLegend(madori, f, look.no, look.line, i === 0), look.no, floors.length > 1 ? f.name : '', `pp${i}`));
  const [picked, setPicked] = useState<Set<number>>(() => new Set(pages.map((_, i) => i)));
  const fit = () => Math.min(1, Math.max(0.25, (window.innerWidth - 16) / (297 * MM)));
  const [zoom, setZoom] = useState(fit);
  useEffect(() => {
    const before = document.title;
    document.title = t.fileName; // PDF に保存するときのファイル名（Excel と同じ）
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onResize = () => setZoom(fit());
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.documentElement.classList.add('shinsei-printing');
    return () => {
      document.documentElement.classList.remove('shinsei-printing');
      document.title = before;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [t.fileName, onClose]);
  const last = Math.max(-1, ...picked);
  return createPortal(
    <div className="print-overlay">
      <style>{'@media print { @page { size: A4 landscape; margin: 0; } .madori-page { box-shadow: none !important; margin: 0 !important; break-after: page; } .madori-page.madori-last { break-after: auto; } .madori-page.madori-skip { display: none !important; } }'}</style>
      <div className="print-toolbar justify-center">
        <div className="text-sm font-bold">見取図（A4横）</div>
        {pages.length > 1 && (
          <span role="group" aria-label="印刷する階" className="flex flex-wrap items-center gap-x-3 text-sm">
            {floors.map((f, i) => (
              <label key={f.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={picked.has(i)}
                  onChange={() =>
                    setPicked((c) => {
                      const next = new Set(c);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className="h-4 w-4"
                />
                {f.name}
              </label>
            ))}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Btn color="softSky" onClick={() => window.print()} disabled={picked.size === 0} className="!px-5 !text-base">
            🖨 印刷する
          </Btn>
          <Btn color="white" onClick={onClose} className="!px-5 !text-base">
            ✕ 閉じる
          </Btn>
        </div>
      </div>
      <div className="print-root" style={zoom < 1 ? {zoom} : undefined}>
        {pages.map((svg, i) => (
          <div
            key={floors[i].id}
            aria-label={`見取図の印刷（${floors[i].name}）`}
            className={`madori-page mx-auto mb-4 overflow-hidden bg-white shadow-lg [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${picked.has(i) ? '' : 'madori-skip opacity-40'} ${i === last ? 'madori-last' : ''}`}
            style={{width: '297mm', height: '209.6mm'}}
            dangerouslySetInnerHTML={{__html: svg}}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}

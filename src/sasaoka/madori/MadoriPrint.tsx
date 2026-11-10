// 見取図の印刷（A4。縦が基本、横に広い図は横。sheet.ts の sheetLayout・pageSvg）。階が2つ以上でも1枚に並べる。
// 申請書の印刷（ShinseiPrint.tsx）と同じく body の直下に出し、印刷のあいだはアプリの画面を出さない（html.shinsei-printing）
import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Btn} from '../components/ui.tsx';
import type {Job, Settings} from '../types.ts';
import type {Madori} from './model.ts';
import {underlayImages} from './planImage.ts';
import {pageSvg, placeLookup, sheetFloors, sheetLayout, sheetLegend, sheetText} from './sheet.ts';

const MM = 96 / 25.4;

export function MadoriPrint({job, settings, madori, onClose}: {job: Job; settings: Settings; madori: Madori; onClose: () => void}) {
  const t = sheetText(job);
  const look = useMemo(() => placeLookup(job, settings), [job, settings]);
  const floors = sheetFloors(madori);
  // 図に入れる下絵（申請書の平面図の枠に入れた図）も印刷に描く
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    let off = false;
    void underlayImages(madori).then((x) => !off && setImages(x));
    return () => {
      off = true;
    };
  }, [madori]);
  const legend = sheetLegend(madori, floors, look.no, look.line, look.byNo);
  const lay = sheetLayout(floors, legend);
  const svg = pageSvg(madori, floors, lay, legend, look.no, 'pp', images);
  // 紙の大きさ（px）。高さは 0.4mm 引く（ちょうどだと、ブラウザによっては白紙の2枚目が出る）
  const pw = lay.w * MM;
  const ph = (lay.h - 0.4) * MM;
  // 画面の幅と高さの両方に入るように縮める（iPad の横向きで用紙の下が切れていた。ユーザーの「印刷画面が変になっている」2026-11-10）。
  // 高さは上の帯の下に、用紙の上下の余白（.print-root の 16px と下の余白）を足して1枚が入るように。印刷は原寸（sasaoka.css）
  const bar = useRef<HTMLDivElement>(null);
  const fit = () => {
    const top = bar.current?.offsetHeight ?? 64;
    const w = (window.innerWidth - 16) / pw;
    const h = (window.innerHeight - top - 8) / (ph + 32);
    return Math.min(1, Math.max(0.2, Math.min(w, h)));
  };
  const [zoom, setZoom] = useState(fit);
  useEffect(() => {
    const before = document.title;
    document.title = t.fileName; // PDF に保存するときのファイル名（Excel と同じ）
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onResize = () => setZoom(fit());
    onResize(); // 上の帯の高さが分かってから測り直す
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.documentElement.classList.add('shinsei-printing');
    return () => {
      document.documentElement.classList.remove('shinsei-printing');
      document.title = before;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [t.fileName, onClose, lay.landscape]); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="print-overlay">
      <style>{`@media print { @page { size: A4 ${lay.landscape ? 'landscape' : 'portrait'}; margin: 0; } .madori-page { box-shadow: none !important; margin: 0 !important; } }`}</style>
      <div ref={bar} className="print-toolbar justify-center">
        <div className="text-sm font-bold">見取図（A4{lay.landscape ? '横' : '縦'}）</div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn color="softSky" onClick={() => window.print()} className="!px-5 !text-base">
            🖨 印刷する
          </Btn>
          <Btn color="white" onClick={onClose} className="!px-5 !text-base">
            ✕ 閉じる
          </Btn>
        </div>
      </div>
      <div className="print-root" style={zoom < 1 ? {zoom} : undefined}>
        <div
          aria-label="見取図の印刷"
          data-orientation={lay.landscape ? 'landscape' : 'portrait'}
          className="madori-page mx-auto mb-4 overflow-hidden bg-white shadow-lg [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{width: `${lay.w}mm`, height: `${lay.h - 0.4}mm`}}
          dangerouslySetInnerHTML={{__html: svg}}
        />
      </div>
    </div>,
    document.body,
  );
}

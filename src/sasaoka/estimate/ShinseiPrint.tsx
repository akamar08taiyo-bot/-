// 住宅改修申請書の印刷（ユーザーの指示「申請書を保存、まとめて保存、印刷ボタンを並びで表示する」2026-10-26）。
// 申請書のタブのプレビューと同じページ（Excel に保存するときと同じ書き込みをしたシート）を、1ページずつ A4 縦の紙の余白の内側に入る大きさで描く。
// ブラウザの印刷で、そのまま紙・PDF にできる。初めは1枚目（事前申請書）だけ印刷し、ほかのページはチェックで足す
// （特定福祉用具の申請書の印刷と同じ。ユーザーの指示「申請書印刷の場合は、１枚目のみ印刷、デフォルトは」2026-10-26）
import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {Btn} from '../components/ui.tsx';
import type {PvPage} from '../shinseiPreview.ts';
import type {ShinseiMarks} from '../types.ts';
import {paper, ShinseiPages} from './ShinseiPreview.tsx';
import type {PreviewPhotos, PreviewPlan} from './ShinseiPreview.tsx';

const MM = 96 / 25.4;
/** 紙の余白（sasaoka.css の @page：上 11mm・左右 11mm・下 12mm）の内側。印刷の1枚の高さ（sasaoka.css の .shinsei-sheet の 270mm）に収まるように少し小さめ */
const INNER = {w: (210 - 22 - 2) * MM, h: (297 - 23 - 6) * MM};
const A4_PX = 210 * MM;

const NO_MARKS = {} as ShinseiMarks;

export function ShinseiPrint({pages, title, photos, plan, onClose}: {pages: PvPage[]; title: string; photos: PreviewPhotos; plan?: PreviewPlan; onClose: () => void}) {
  const fit = () => Math.min(1, Math.max(0.3, (window.innerWidth - 16) / A4_PX));
  const [zoom, setZoom] = useState(fit);
  const [picked, setPicked] = useState<Set<number>>(() => new Set([0]));
  useEffect(() => {
    // PDF に保存するときのファイル名の元になる（「山田花子様住宅改修申請書」。Excel と同じ）
    const before = document.title;
    document.title = title;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onResize = () => setZoom(fit());
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    // 印刷のあいだはアプリの画面（#root）を出さない（sasaoka.css。中の main は no-print でも、外の min-h-screen の箱が白紙の1枚目になった）
    document.documentElement.classList.add('shinsei-printing');
    return () => {
      document.documentElement.classList.remove('shinsei-printing');
      document.title = before;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [title, onClose]);
  const last = Math.max(-1, ...picked);
  const toggle = (i: number) =>
    setPicked((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  // 様邸の画面（印刷しない main の中）から開くので、body の直下に出す（main ごと印刷から外れないように）
  return createPortal(
    <div className="print-overlay">
      <div className="print-toolbar">
        <div className="text-sm font-bold">申請書（A4縦）</div>
        {pages.length > 1 && (
          <span role="group" aria-label="印刷するページ" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {pages.map((p, i) => (
              <label key={p.sheet} className="flex items-center gap-1" title={p.sheet}>
                <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="h-4 w-4" />
                {i + 1}枚目
              </label>
            ))}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Btn color="softSky" onClick={() => window.print()} disabled={picked.size === 0} className="!px-5 !text-base">
            🖨 印刷する
          </Btn>
          <Btn color="white" onClick={onClose} className="!px-5 !text-base">
            ✕ 閉じる
          </Btn>
        </div>
      </div>
      <div className="print-root" style={zoom < 1 ? {zoom} : undefined}>
        {pages.map((p, i) => {
          const pp = paper(p);
          const scale = Math.min(INNER.w / pp.width, INNER.h / pp.height);
          return (
            <div key={p.sheet} className={`shinsei-sheet ${picked.has(i) ? '' : 'shinsei-skip'} ${i === last ? 'shinsei-last' : ''}`} aria-label={`申請書の印刷（${i + 1}枚目）`}>
              <ShinseiPages pages={[p]} missing={{}} active={null} marks={NO_MARKS} label={() => ''} onOpen={() => undefined} onToggle={() => undefined} photos={photos} plan={plan} title="申請書" print fixedScale={scale} />
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

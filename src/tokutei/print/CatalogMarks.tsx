import {useEffect, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, ReactNode} from 'react';
import type {CatalogProduct} from '../catalogItems.ts';
import type {SaleItem} from '../types.ts';
import {DPI} from './catalogPdf.ts';

/**
 * カタログの印刷の「⭕ 丸で囲む」（ユーザーの指示「カタログを丸で囲むボタンをつくる。印刷ボタンと並行して作成する」2026-11-02）。
 * 丸はページの絵に対する割合（0〜1）で持つので、画面の大きさ・印刷の大きさが変わっても同じ所に出る。印刷にもそのまま出る（赤い線）。
 * 初めて押したときは、見積もりの商品（品番が合うもの）のカタログの囲み（CatalogProduct.box）に丸を付ける。ページの上をなぞると丸を足せる。
 * 丸を押すと選べて、右上の ✕ か Delete で消す。Ctrl+Z で1つ前に戻す（消した丸も戻る）
 */
export type Mark = {x: number; y: number; w: number; h: number};
export type Marks = Record<string, Mark[]>; // カタログのページのファイル名ごと

// 印刷の画面を閉じて開き直しても、同じ見積もりなら丸を残す（アプリを開いているあいだだけ。保存はしない）
const memory = new Map<string, Marks>();
export const rememberedMarks = (saleId: string): Marks => memory.get(saleId) ?? {};
export const rememberMarks = (saleId: string, marks: Marks) => memory.set(saleId, marks);

const codeKey = (s: string) => s.normalize('NFKC').replace(/[\s\-‐－―ー]/g, '').toUpperCase();

/** 見積もりの商品の、カタログのページの囲みに合わせた丸（品番が合う商品だけ）。囲みより少し大きく */
export function saleMarks(items: Pick<SaleItem, 'code'>[], products: CatalogProduct[], natural: (page: number) => {w: number; h: number} | null, fileOf: (page: number) => string | null): Marks {
  const codes = new Set(items.map((i) => codeKey(i.code)).filter(Boolean));
  const out: Marks = {};
  if (!codes.size) return out;
  const k = DPI / 72;
  for (const p of products) {
    if (!p.box || !p.variants.some((v) => codes.has(codeKey(v.code)))) continue;
    const size = natural(p.page);
    const file = fileOf(p.page);
    if (!size || !file) continue;
    const padX = p.box.w * 0.08;
    const padY = p.box.h * 0.08;
    const x = Math.max(0, ((p.box.x - padX) * k) / size.w);
    const y = Math.max(0, ((p.box.y - padY) * k) / size.h);
    const r = Math.min(1, ((p.box.x + p.box.w + padX) * k) / size.w);
    const b = Math.min(1, ((p.box.y + p.box.h + padY) * k) / size.h);
    (out[file] ??= []).push({x, y, w: r - x, h: b - y});
  }
  return out;
}

/**
 * ページの絵に重ねる丸。on（丸で囲むがオン）のときは、なぞると丸を足す・押すと選ぶ。オフのときは見るだけ（押せない）。
 * children はページの絵（img）。この箱の大きさ＝絵の大きさ
 */
export function MarkLayer({
  marks,
  on,
  onChange,
  selected,
  onSelect,
  label,
  children,
}: {
  marks: Mark[];
  on: boolean;
  onChange: (marks: Mark[]) => void;
  selected: number | null;
  onSelect: (i: number | null) => void;
  label: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Mark | null>(null);
  const start = useRef<{x: number; y: number} | null>(null);
  const at = (e: ReactPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return {x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))};
  };
  const rect = (a: {x: number; y: number}, b: {x: number; y: number}): Mark => ({x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y)});
  return (
    <div
      ref={box}
      className={`cat-mark-box relative h-full w-full ${on ? 'cursor-crosshair touch-none select-none' : ''}`}
      aria-label={label}
      onPointerDown={(e) => {
        if (!on || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = at(e);
        onSelect(null);
      }}
      onPointerMove={(e) => {
        if (start.current) setDraft(rect(start.current, at(e)));
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        setDraft(null);
        if (!s) return;
        const m = rect(s, at(e));
        // 押しただけ・小さすぎる（紙の 2% より小さい）ときは足さない
        if (m.w < 0.02 || m.h < 0.015) return;
        onChange([...marks, m]);
        onSelect(marks.length);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
    >
      {children}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[...marks, ...(draft ? [draft] : [])].map((m, i) => {
          const isDraft = draft && i === marks.length;
          return (
            <g key={i}>
              {/* 押しやすいように、見えない太い線を重ねる（オンのときだけ押せる） */}
              {!isDraft && on && (
                <ellipse
                  cx={(m.x + m.w / 2) * 100}
                  cy={(m.y + m.h / 2) * 100}
                  rx={(m.w / 2) * 100}
                  ry={(m.h / 2) * 100}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  vectorEffect="non-scaling-stroke"
                  className="cat-mark-ui cursor-pointer"
                  style={{pointerEvents: 'stroke'}}
                  role="button"
                  aria-label={`丸 ${i + 1}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(i);
                  }}
                />
              )}
              <ellipse
                cx={(m.x + m.w / 2) * 100}
                cy={(m.y + m.h / 2) * 100}
                rx={(m.w / 2) * 100}
                ry={(m.h / 2) * 100}
                fill="none"
                stroke={selected === i && on ? '#f97316' : '#e11d48'}
                strokeWidth={3.5}
                strokeDasharray={isDraft ? '6 4' : undefined}
                vectorEffect="non-scaling-stroke"
                data-mark=""
              />
            </g>
          );
        })}
      </svg>
      {on && selected !== null && marks[selected] && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            onChange(marks.filter((_, j) => j !== selected));
            onSelect(null);
          }}
          className="cat-mark-ui absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-rose-600 text-sm font-bold text-white shadow"
          style={{left: `${(marks[selected].x + marks[selected].w * 0.85) * 100}%`, top: `${(marks[selected].y + marks[selected].h * 0.15) * 100}%`}}
          aria-label="丸を消す"
          title="丸を消す（Delete）"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * 「⭕ 丸で囲む」のボタンの見た目：黄色（ユーザーの指示「丸のボタンは黄色」2026-11-02）。オンのときは少し濃い黄色と枠。big は左の大きなボタン（印刷するの上）
 */
export function MarkToggle({on, onClick, big = false}: {on: boolean; onClick: () => void; big?: boolean}) {
  const tone = on ? 'border-amber-400 bg-yellow-200 text-amber-950 ring-2 ring-amber-400' : 'border-yellow-300 bg-yellow-100 text-amber-900 hover:bg-yellow-200';
  if (big)
    return (
      <button type="button" aria-pressed={on} onClick={onClick} className={`flex h-20 w-44 flex-col items-center justify-center gap-1 rounded-xl border text-lg font-bold shadow-lg ${tone}`}>
        <span aria-hidden="true" className="text-2xl leading-none">⭕</span>
        <span className="sr-only">⭕ </span>丸で囲む
      </button>
    );
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-md border px-4 py-2.5 text-base font-bold shadow ${tone}`}>
      ⭕ 丸で囲む
    </button>
  );
}

/** 選んだ丸を Delete・Backspace で消す・Ctrl+Z で1つ前に戻す（字を打つ欄にいるときは何もしない） */
export function useMarkKeys(on: boolean, onDelete: () => void, onUndo: () => void) {
  const fns = useRef({onDelete, onUndo});
  fns.current = {onDelete, onUndo};
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        fns.current.onDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        fns.current.onUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
}

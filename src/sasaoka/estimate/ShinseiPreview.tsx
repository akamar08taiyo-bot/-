// 申請書のプレビュー：原本の様式のまま描く（材料は shinseiPreview.ts。Excel に保存するときと同じ書き込みをしたもの）。
// 欄を押すと、その項目を入れる所が欄のすぐ下に出る（打つとプレビューもすぐ変わる。Enter で次の欄へ）。
// 丸で囲む値（男・女など）は押すと丸がつく（もう一度押すと外れる）。まだ入っていない欄は薄い黄色。スマホでは入れる所を画面の下に出す

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CSSProperties, KeyboardEvent, ReactNode} from 'react';
import type {PvFont, PvHeader, PvPage, PvShape, PvText, Rect, ShinseiField} from '../shinseiPreview.ts';
import type {ShinseiMarks} from '../types.ts';

const PAD = 18; // 紙の余白（画素）
const MAX_SCALE = 1.3; // 広い画面では少し大きく
const PHONE = 640; // これより狭い画面は、入れる所を画面の下に出す

/** 要素の幅（画面の幅が変わったら測り直す） */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** 文字の幅（画素。画面の字体で測る。縮小して全体を表示する欄） */
function textWidth(text: string, f: PvFont): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * f.size;
  measureCtx.font = `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${f.size}px ${f.family}`;
  return measureCtx.measureText(text).width;
}

const fontCss = (f: PvFont, k = 1): CSSProperties => ({
  fontFamily: f.family,
  fontSize: f.size * k,
  fontWeight: f.bold ? 700 : 400,
  fontStyle: f.italic ? 'italic' : undefined,
  textDecoration: [f.underline && 'underline', f.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
  color: f.color,
});

function TextView({t}: {t: PvText}) {
  if (t.marked) {
    // 丸で囲む欄：1文字ずつ、丸と同じ計算の位置に置く
    const font = t.runs[0]?.font;
    return (
      <div style={{position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, overflow: 'hidden'}}>
        <span className="sr-only">{t.runs.map((r) => r.text).join('')}</span>
        {t.marked.chars.map((c, i) =>
          c.ch.trim() ? (
            <span
              key={i}
              aria-hidden="true"
              style={{position: 'absolute', left: c.x - t.x, top: t.marked!.cy - t.y, width: c.w, textAlign: 'center', transform: 'translateY(-50%)', lineHeight: 1, whiteSpace: 'pre', ...(font ? fontCss(font) : {}), fontSize: t.marked!.em}}
            >
              {c.ch}
            </span>
          ) : null,
        )}
      </div>
    );
  }
  let k = 1;
  if (t.shrink) {
    const need = t.runs.reduce((n, r) => n + textWidth(r.text, r.font), 0);
    const avail = t.w - 4 - t.indent;
    if (need > avail && need > 0) k = Math.max(0.3, avail / need);
  }
  const distributed = t.align === 'distributed';
  return (
    <div
      style={{
        position: 'absolute',
        left: t.x,
        top: t.y,
        width: t.w,
        height: t.h,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: t.valign === 'top' ? 'flex-start' : t.valign === 'bottom' ? 'flex-end' : 'center',
        padding: '0 2px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          textAlign: distributed ? 'justify' : (t.align as 'left' | 'center' | 'right'),
          textAlignLast: distributed ? 'justify' : undefined,
          whiteSpace: t.wrap ? (distributed ? 'normal' : 'pre-wrap') : 'pre',
          wordBreak: 'break-all',
          lineHeight: 1.2,
          paddingLeft: t.align === 'left' || distributed ? t.indent : 0,
          paddingRight: t.align === 'right' || distributed ? t.indent : 0,
        }}
      >
        {t.runs.map((r, i) => (
          <span key={i} style={fontCss(r.font, k)}>
            {r.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShapeView({s}: {s: PvShape}) {
  const stroke = s.stroke || 'none';
  const fill = s.fill || 'none';
  const w = s.stroke ? s.width : 0;
  if (s.kind === 'ellipse') return <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={Math.abs(s.w) / 2} ry={Math.abs(s.h) / 2} fill={fill} stroke={stroke} strokeWidth={w} />;
  if (s.kind === 'rect' || s.kind === 'roundRect') {
    const r = s.kind === 'roundRect' ? Math.min(s.w, s.h) * 0.1667 : 0;
    return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={r} fill={fill} stroke={stroke} strokeWidth={w} />;
  }
  if (s.kind === 'bracketPair') {
    // （ ）の形：角の丸みは短い辺の 1/6
    const r = Math.min(s.w, s.h) * 0.1667;
    const {x, y} = s;
    const [x2, y2] = [s.x + s.w, s.y + s.h];
    return (
      <path
        d={`M${x + r},${y} Q${x},${y} ${x},${y + r} L${x},${y2 - r} Q${x},${y2} ${x + r},${y2} M${x2 - r},${y} Q${x2},${y} ${x2},${y + r} L${x2},${y2 - r} Q${x2},${y2} ${x2 - r},${y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={w}
      />
    );
  }
  const [x1, x2] = s.flipH ? [s.x + s.w, s.x] : [s.x, s.x + s.w];
  const [y1, y2] = s.flipV ? [s.y + s.h, s.y] : [s.y, s.y + s.h];
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={w} />;
}

function HeaderView({h, top, width, height}: {h: PvHeader; top: number; width: number; height: number}) {
  const part = (runs: PvHeader['left'], align: 'left' | 'center' | 'right') => (
    <div style={{flex: 1, textAlign: align, whiteSpace: 'pre'}}>
      {runs.map((r, i) => (
        <span key={i} style={fontCss(r.font)}>
          {r.text}
        </span>
      ))}
    </div>
  );
  return (
    <div style={{position: 'absolute', left: PAD, top, width, height, display: 'flex', alignItems: 'center', gap: 8}}>
      {part(h.left, 'left')}
      {part(h.center, 'center')}
      {part(h.right, 'right')}
    </div>
  );
}

const bandHeight = (h: PvHeader | null) => (h ? Math.max(...[...h.left, ...h.center, ...h.right].map((r) => r.font.size), 12) * 1.5 + 8 : 0);

/** 1枚の大きさ（紙。画素） */
function paper(page: PvPage) {
  const head = bandHeight(page.header);
  const foot = bandHeight(page.footer);
  return {width: page.width + PAD * 2, height: page.height + head + foot + PAD * 2, head, foot};
}

export function ShinseiPages({
  pages,
  missing,
  active,
  marks,
  label,
  onOpen,
  onToggle,
  onMove,
  editor,
  wide,
}: {
  pages: PvPage[];
  missing: Partial<Record<ShinseiField, boolean>>;
  active: ShinseiField | null; // 入れる所を開いている項目
  marks: ShinseiMarks; // 今の丸
  label: (f: ShinseiField) => string;
  onOpen: (f: ShinseiField | null) => void;
  onToggle: (key: keyof ShinseiMarks, option: string) => void;
  onMove: (dir: 1 | -1) => void; // 前・次の項目へ
  editor: ReactNode; // 開いている項目の入れる所
  wide: boolean; // 入れる所を広く（改修の内容）
}) {
  const [wrapRef, wrapWidth] = useWidth<HTMLDivElement>();
  // どの欄を押して開いたか（同じ項目が2枚目にもあるとき＝式で同じ値を出している欄、押した方の下に出す）
  const [spot, setSpot] = useState<{page: number; rect: Rect} | null>(null);
  const phone = wrapWidth > 0 && wrapWidth < PHONE;
  const widest = Math.max(...pages.map((p) => paper(p).width), 1);
  const scale = wrapWidth ? Math.min(MAX_SCALE, wrapWidth / widest) : 1;

  // 開いている項目の欄：押した欄、なければ最初に出てくる欄
  let anchor: {page: number; rect: Rect} | null = null;
  if (active) {
    if (spot && pages[spot.page]?.fields.some((f) => f.field === active && f.x === spot.rect.x && f.y === spot.rect.y)) anchor = spot;
    else {
      const page = pages.findIndex((p) => p.fields.some((f) => f.field === active));
      const f = page >= 0 ? pages[page].fields.find((x) => x.field === active) : undefined;
      if (f) anchor = {page, rect: f};
    }
  }

  // 開いた欄が見えるように動かし、入れる所の最初の欄にカーソルを置く（Enter のすぐあとに打った文字も次の欄に入るように、描いたすぐあと）
  const popRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const anchorKey = anchor ? `${active}:${anchor.page}:${anchor.rect.x}:${anchor.rect.y}` : '';
  useLayoutEffect(() => {
    if (!anchorKey) return;
    spotRef.current?.scrollIntoView({block: phone ? 'center' : 'nearest', behavior: 'smooth'});
    // 打つ欄があればその最初（生年月日は年）、なければ丸の値（性別など）の最初
    const first = popRef.current?.querySelector<HTMLElement>('input[data-nav], select[data-nav], textarea') ?? popRef.current?.querySelector<HTMLElement>('[role="group"] button');
    first?.focus({preventScroll: true});
    if (first instanceof HTMLInputElement && first.type !== 'date') first.select();
  }, [anchorKey]);

  // 外を押したら閉じる（欄・丸・入れる所を押したときは閉じない）
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('[data-shinsei-pop], [data-shinsei-spot]')) return;
      onOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [active, onOpen]);

  // Enter で次の欄（入れる所の中の次の欄、最後なら次の項目）。Esc で閉じる
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onOpen(null);
      return;
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const el = e.target as HTMLElement;
    if (!el.matches('input')) return;
    e.preventDefault();
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('input[data-nav], select[data-nav]')];
    const next = all[all.indexOf(el) + (e.shiftKey ? -1 : 1)];
    if (next) next.focus();
    else onMove(e.shiftKey ? -1 : 1);
  };

  const popWidth = Math.min(wide ? 760 : 540, Math.max(wrapWidth - 8, 280));
  // 入れる所の左の位置（紙の左から）。紙は真ん中に置いているので、紙の外（画面の端まで）にはみ出してもよい
  const popLeft = (page: PvPage, rect: Rect) => {
    const side = (wrapWidth - paper(page).width * scale) / 2;
    return Math.max(4 - side, Math.min((PAD + rect.x) * scale, paper(page).width * scale + side - popWidth - 4));
  };
  const pop =
    active && anchor ? (
      <div
        ref={popRef}
        data-shinsei-pop
        role="dialog"
        aria-label={`${label(active)}を入れる`}
        onKeyDown={onKey}
        className={
          phone
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t-2 border-sky-600 bg-white px-3 pb-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.18)]'
            : 'absolute z-30 rounded-xl border-2 border-sky-600 bg-white px-3 pb-3 pt-2 shadow-xl'
        }
        style={
          phone
            ? undefined
            : {
                width: popWidth,
                left: popLeft(pages[anchor.page], anchor.rect),
                top: (PAD + paper(pages[anchor.page]).head + anchor.rect.y + anchor.rect.h) * scale + 6,
              }
        }
      >
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-sm font-bold text-sky-900">{label(active)}</span>
          <span className="ml-auto" />
          <button type="button" onClick={() => onMove(-1)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label="前の欄">
            ◀ 前
          </button>
          <button type="button" onClick={() => onMove(1)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label="次の欄">
            次 ▶
          </button>
          <button type="button" onClick={() => onOpen(null)} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">{editor}</div>
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className="space-y-4" aria-label="申請書のプレビュー">
      {pages.map((page, pi) => {
        const pp = paper(page);
        const isAnchor = anchor?.page === pi;
        return (
          <div key={page.sheet} className="relative mx-auto" style={{width: pp.width * scale, height: pp.height * scale}}>
            <div
              className="absolute left-0 top-0 origin-top-left bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
              style={{width: pp.width, height: pp.height, transform: `scale(${scale})`}}
              role="group"
              aria-label={page.sheet}
            >
              {page.header && <HeaderView h={page.header} top={6} width={page.width} height={pp.head} />}
              {page.footer && <HeaderView h={page.footer} top={pp.height - pp.foot - 6} width={page.width} height={pp.foot} />}
              <div className="absolute" style={{left: PAD, top: PAD + pp.head, width: page.width, height: page.height}}>
                {page.fills.map((f, i) => (
                  <div key={i} style={{position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, background: f.color}} />
                ))}
                {page.texts.map((t) => (
                  <TextView key={t.ref} t={t} />
                ))}
                {page.shapes
                  .filter((s) => s.text && s.font)
                  .map((s, i) => (
                    <div key={`st${i}`} style={{position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h, display: 'grid', placeItems: 'center', textAlign: 'center', whiteSpace: 'pre', ...fontCss(s.font!)}}>
                      {s.text}
                    </div>
                  ))}
                <svg width={page.width} height={page.height} className="pointer-events-none absolute left-0 top-0 overflow-visible">
                  {page.lines.map((l, i) =>
                    l.double ? (
                      <g key={i} stroke={l.color} strokeWidth={1} shapeRendering="crispEdges">
                        {l.y1 === l.y2 ? (
                          <>
                            <line x1={l.x1} y1={l.y1 - 1} x2={l.x2} y2={l.y2 - 1} />
                            <line x1={l.x1} y1={l.y1 + 1} x2={l.x2} y2={l.y2 + 1} />
                          </>
                        ) : (
                          <>
                            <line x1={l.x1 - 1} y1={l.y1} x2={l.x2 - 1} y2={l.y2} />
                            <line x1={l.x1 + 1} y1={l.y1} x2={l.x2 + 1} y2={l.y2} />
                          </>
                        )}
                      </g>
                    ) : (
                      <line
                        key={i}
                        x1={l.x1}
                        y1={l.y1}
                        x2={l.x2}
                        y2={l.y2}
                        stroke={l.color}
                        strokeWidth={l.width}
                        strokeDasharray={l.dash || undefined}
                        strokeLinecap={l.dash ? 'butt' : 'square'}
                        shapeRendering="crispEdges"
                      />
                    ),
                  )}
                  {page.shapes.map((s, i) => (
                    <ShapeView key={i} s={s} />
                  ))}
                </svg>
                {/* 押すと入れられる欄（まだ入っていない欄は薄い黄色） */}
                {page.fields.map((f, i) => {
                  const on = active === f.field;
                  const here = isAnchor && anchor?.rect.x === f.x && anchor?.rect.y === f.y;
                  return (
                    <div
                      key={`f${i}`}
                      ref={here ? spotRef : undefined}
                      data-shinsei-spot
                      role="button"
                      tabIndex={-1}
                      aria-label={label(f.field)}
                      title={label(f.field)}
                      onClick={() => {
                        setSpot({page: pi, rect: f});
                        onOpen(f.field);
                      }}
                      className={`absolute cursor-pointer rounded-[2px] transition-colors ${
                        on ? 'bg-sky-400/15 outline outline-2 outline-sky-600' : missing[f.field] ? 'bg-amber-300/35 hover:outline hover:outline-2 hover:outline-emerald-600' : 'hover:bg-emerald-400/10 hover:outline hover:outline-2 hover:outline-emerald-600'
                      }`}
                      style={{left: f.x, top: f.y, width: f.w, height: f.h}}
                    />
                  );
                })}
                {/* 押すと丸がつく値 */}
                {page.options.map((o, i) => (
                  <button
                    key={`o${i}`}
                    type="button"
                    data-shinsei-spot
                    aria-label={`${o.option}に丸をつける`}
                    aria-pressed={marks[o.key] === o.option}
                    title={marks[o.key] === o.option ? `${o.option}の丸を外す` : `${o.option}に丸をつける`}
                    onClick={() => onToggle(o.key, o.option)}
                    className="absolute cursor-pointer rounded-full hover:bg-emerald-500/20 hover:outline hover:outline-1 hover:outline-emerald-700"
                    style={{left: o.x, top: o.y, width: o.w, height: o.h}}
                  />
                ))}
              </div>
            </div>
            {isAnchor && !phone && pop}
          </div>
        );
      })}
      {phone && pop}
    </div>
  );
}

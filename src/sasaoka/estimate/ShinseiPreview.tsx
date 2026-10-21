// 申請書のプレビュー：原本の様式のまま描く（材料は shinseiPreview.ts。Excel に保存するときと同じ書き込みをしたもの）。
// 申請書のタブで、一覧で入れながら横で見る（ユーザーの指示「一覧から入力をメインとする。プレビューをみながら入力」）。
// 一覧で入れている項目の欄は囲んで、見える所まで動かす。欄を押すと一覧のその項目へ。丸で囲む値（男・女など）は押すと丸がつく（もう一度押すと外れる）。
// まだ入っていない欄は薄い黄色。写真貼付用紙は、改修前・改修後の枠に写真を重ねて出す（枠に写真のファイル・写真の欄の写真をドロップ、押して選ぶ）
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CSSProperties, DragEvent, RefObject} from 'react';
import type {PvFont, PvHeader, PvPage, PvPhotoSlot, PvShape, PvText, Rect, ShinseiField} from '../shinseiPreview.ts';
import {circled} from '../estimateForms.ts';
import {photoFit} from '../shinsei.ts';
import type {ShinseiMarks} from '../types.ts';

const PAD = 18; // 紙の余白（画素）
const MAX_SCALE = 1.3; // 広い画面では少し大きく

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

/** 図形の中の文字（平面図の工事内容の文字の枠など）：段落ごとに改行し、左右・上下の配置と文字のまわりの余白は原本のとおり */
function ShapeText({s}: {s: PvShape}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: s.x,
        top: s.y,
        width: s.w,
        height: s.h,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: s.valign === 'top' ? 'flex-start' : s.valign === 'bottom' ? 'flex-end' : 'center',
        padding: `${s.inset.t}px ${s.inset.r}px ${s.inset.b}px ${s.inset.l}px`,
        textAlign: s.align,
        whiteSpace: s.wrap ? 'pre-wrap' : 'pre',
        wordBreak: 'break-all',
        lineHeight: 1.2,
        ...fontCss(s.font!),
      }}
    >
      {s.text}
    </div>
  );
}

/** 写真貼付用紙の写真（画面の URL と大きさ）と、枠にドロップ・枠を押したとき */
export type PreviewPhotos = {
  of: (no: number, slot: PvPhotoSlot['slot']) => {url: string; w: number; h: number} | null;
  onDrop: (no: number, slot: PvPhotoSlot['slot'], e: DragEvent) => void;
  onPick: (no: number, slot: PvPhotoSlot['slot']) => void;
};

const SLOT_NAME = {before: '改修前', after: '改修後'} as const;

/** 写真貼付用紙の改修前・改修後の枠：写真は Excel に貼るのと同じ大きさ・位置（photoFit）。ないときは「＋ 改修前」 */
function PhotoSlotView({slot, no, photos}: {slot: PvPhotoSlot; no: number; photos: PreviewPhotos}) {
  const [over, setOver] = useState(false);
  const photo = photos.of(no, slot.slot);
  const fit = photo ? photoFit({x: 0, y: 0, w: slot.w, h: slot.h}, photo.w, photo.h) : null;
  return (
    <button
      type="button"
      aria-label={`写真貼付用紙${circled(no)}の${SLOT_NAME[slot.slot]}`}
      title={photo ? `${SLOT_NAME[slot.slot]}の写真を差し替える（写真をドロップしても入ります）` : `${SLOT_NAME[slot.slot]}の写真を入れる`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].some((t) => t === 'Files' || t.startsWith('application/x-sasaoka-photo'))) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        photos.onDrop(no, slot.slot, e);
      }}
      onClick={() => photos.onPick(no, slot.slot)}
      className={`absolute cursor-pointer ${over ? 'bg-emerald-400/15 outline outline-4 outline-emerald-600' : photo ? 'hover:outline hover:outline-2 hover:outline-emerald-600' : 'hover:bg-emerald-400/10'}`}
      style={{left: slot.x, top: slot.y, width: slot.w, height: slot.h}}
    >
      {photo && fit ? (
        <img src={photo.url} alt="" draggable={false} className="absolute" style={{left: fit.x, top: fit.y, width: fit.w, height: fit.h}} />
      ) : (
        <span className="absolute inset-3 flex items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-base text-slate-400">＋ {SLOT_NAME[slot.slot]}</span>
      )}
    </button>
  );
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
  photos,
  scrollBox,
}: {
  pages: PvPage[];
  missing: Partial<Record<ShinseiField, boolean>>;
  active: ShinseiField | null; // 一覧で入れている項目（その欄を囲む）
  marks: ShinseiMarks; // 今の丸
  label: (f: ShinseiField) => string;
  onOpen: (f: ShinseiField) => void; // 欄を押したとき（一覧のその項目へ）
  onToggle: (key: keyof ShinseiMarks, option: string) => void;
  photos?: PreviewPhotos; // 写真貼付用紙の写真（ないときは枠を出さない）
  scrollBox?: RefObject<HTMLElement | null>; // プレビューを入れた枠（一覧の横に並べて、枠の中で動くとき）
}) {
  const [wrapRef, wrapWidth] = useWidth<HTMLDivElement>();
  const widest = Math.max(...pages.map((p) => paper(p).width), 1);
  const scale = wrapWidth ? Math.min(MAX_SCALE, wrapWidth / widest) : 1;

  // 一覧で入れている項目の欄（同じ項目が2枚目にもあるとき＝式で同じ値を出している欄は、最初に出てくる欄）が見えるように、プレビューの枠の中を動かす。
  // 縦に並べた狭い画面（枠が動かない）では、画面ごと動かさない（入れている欄が見えなくなるので）
  const firstRef = useRef<HTMLDivElement>(null);
  const firstKey = active ? `${active}:${pages.findIndex((p) => p.fields.some((f) => f.field === active))}` : '';
  useEffect(() => {
    const box = scrollBox?.current;
    const el = firstRef.current;
    if (!box || !el || box.scrollHeight <= box.clientHeight + 1) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return;
    box.scrollTo({top: box.scrollTop + r.top - b.top - b.height / 3, behavior: 'smooth'});
  }, [firstKey]);
  let firstDone = false;

  return (
    <div ref={wrapRef} className="space-y-4" aria-label="申請書のプレビュー">
      {pages.map((page) => {
        const pp = paper(page);
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
                    <ShapeText key={`st${i}`} s={s} />
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
                {/* 押すと一覧のその項目へ（まだ入っていない欄は薄い黄色、入れている項目は囲む） */}
                {page.fields.map((f, i) => {
                  const on = active === f.field;
                  const first = on && !firstDone;
                  if (first) firstDone = true;
                  return (
                    <div
                      key={`f${i}`}
                      ref={first ? firstRef : undefined}
                      role="button"
                      tabIndex={-1}
                      aria-label={label(f.field)}
                      title={label(f.field)}
                      onClick={() => onOpen(f.field)}
                      className={`absolute cursor-pointer rounded-[2px] transition-colors ${
                        on ? 'bg-sky-400/15 outline outline-2 outline-sky-600' : missing[f.field] ? 'bg-amber-300/35 hover:outline hover:outline-2 hover:outline-emerald-600' : 'hover:bg-emerald-400/10 hover:outline hover:outline-2 hover:outline-emerald-600'
                      }`}
                      style={{left: f.x, top: f.y, width: f.w, height: f.h}}
                    />
                  );
                })}
                {/* 写真貼付用紙の写真の枠 */}
                {photos && page.photoSlots.map((slot) => <PhotoSlotView key={slot.slot} slot={slot} no={page.photo} photos={photos} />)}
                {/* 押すと丸がつく値 */}
                {page.options.map((o, i) => (
                  <button
                    key={`o${i}`}
                    type="button"
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
          </div>
        );
      })}
    </div>
  );
}

// 申請書のプレビュー：保険者の原本の様式のまま描く（材料は shinseiPreview.ts。Excel に保存するときと同じ書き込みをしたもの）。
// 案件の画面の「📄 申請書」で、左の入れる所で入れながら右で見る（ユーザーの指示「特定福祉用具購入の申請書も、住宅改修の申請書と同じく
// プレビューを見ながら入力することができる」2026-10-22）。住宅改修アプリの estimate/ShinseiPreview.tsx を写したもの（写真の枠・丸のボタンはない）。
// 入れている所の欄は囲んで、見える所まで動かす。欄を押すと左のその入れる所へ。まだ入っていない欄は薄い黄色
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CSSProperties, RefObject} from 'react';
import type {PvFont, PvHeader, PvPage, PvShape, PvText, ShinseiField} from '../shinseiPreview.ts';

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

/** 縦書きの1文字の高さ（文字の大きさの何倍か。行の高さと同じ） */
const V_LINE = 1.2;

/** 縦書きの欄：Excel の縦書きと同じく、1文字ずつ下へ積む（縮小して全体を表示する欄は、縦の長さが入るように縮める） */
function VerticalText({t}: {t: PvText}) {
  const chars = t.runs.flatMap((r) => [...r.text].map((ch) => ({ch, font: r.font})));
  let k = 1;
  if (t.shrink) {
    const need = chars.reduce((n, c) => n + c.font.size * V_LINE, 0);
    const avail = t.h - 4;
    if (need > avail && need > 0) k = Math.max(0.3, avail / need);
  }
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
        padding: '2px 0',
        overflow: 'hidden',
        textAlign: t.align === 'left' || t.align === 'right' ? t.align : 'center',
        lineHeight: V_LINE,
      }}
    >
      <span className="sr-only">{t.runs.map((r) => r.text).join('')}</span>
      {chars.map((c, i) => (
        <div key={i} aria-hidden="true" style={{...fontCss(c.font, k), whiteSpace: 'pre'}}>
          {c.ch}
        </div>
      ))}
    </div>
  );
}

// 測った幅に足す余裕：Windows の ＭＳ 明朝・ＭＳ ゴシックは小さい字で、画面に出る字の幅が測った幅より少し広いことがあり、
// ぎりぎりに縮めた見出しの終わりが欄の線で切れた（「記載者 事業所・氏名」。ユーザーの指示「文字がはみ出ていないか確認」2026-10-26）
const FIT_MARGIN = 1.05;

/**
 * 欄の文字を欄の中に全部見せる大きさ（倍率。住宅改修の estimate/ShinseiPreview.tsx の fitScale と同じ）。1行の欄は幅に入るまで（縮小して全体を表示する欄と同じ）、
 * 折り返しの欄は高さに入る行の数になるまで縮める。原本の字体のない端末（スマホ・タブレットなど）は字の幅が違うので、Excel では入っている原本の文字も切れるため
 */
function fitScale(t: PvText): number {
  const avail = t.w - 4 - t.indent;
  if (avail <= 0 || t.runs.length === 0) return 1;
  if (t.oneLine) {
    // 名前の欄：どの行も幅に入り、行の数が高さに入る大きさ（折り返さない）
    const size = Math.max(...t.runs.map((r) => r.font.size));
    const rows = textLines(t);
    const widest = Math.max(...rows.map((l) => l.reduce((n, r) => n + textWidth(r.text, r.font), 0) * FIT_MARGIN), 0);
    const k = Math.min(1, widest > avail ? avail / widest : 1, t.h / (rows.length * size * 1.2));
    return Math.max(0.3, k);
  }
  if (!t.wrap) {
    const need = t.runs.reduce((n, r) => n + textWidth(r.text, r.font), 0) * FIT_MARGIN;
    return need > avail && need > 0 ? Math.max(0.3, avail / need) : 1;
  }
  // 折り返し：行ごとの幅（改行で分ける）から、折り返した行の数を数える（1文字ずつ折り返すので、1行に1文字分の余りを見る）
  const size = Math.max(...t.runs.map((r) => r.font.size));
  const widths = [0];
  for (const r of t.runs) {
    r.text.split(/\r?\n/).forEach((part, i) => {
      if (i > 0) widths.push(0);
      widths[widths.length - 1] += textWidth(part, r.font) * FIT_MARGIN;
    });
  }
  for (let k = 1; k > 0.3; k -= 0.05) {
    const rows = widths.reduce((n, w) => n + Math.max(1, Math.ceil((w * k) / Math.max(1, avail - size * k))), 0);
    if (rows * size * k * 1.2 <= t.h) return k;
  }
  return 0.3;
}

/** 欄の文字を改行で行に分ける（行ごとに字体ごとのかたまり） */
function textLines(t: PvText): PvText['runs'][] {
  const rows: PvText['runs'][] = [[]];
  for (const r of t.runs) {
    r.text.split(/\r?\n/).forEach((part, i) => {
      if (i > 0) rows.push([]);
      if (part) rows[rows.length - 1].push({...r, text: part});
    });
  }
  return rows;
}

function TextView({t}: {t: PvText}) {
  if (t.vertical) return <VerticalText t={t} />;
  if (t.marked) {
    // 丸で囲む欄（男・女、要介護度など）：1文字ずつ、丸と同じ計算の位置に置く（何行もある欄は行ごとの高さ＝c.cy）
    const font = t.runs[0]?.font;
    return (
      <div style={{position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, overflow: 'hidden'}}>
        <span className="sr-only">{t.runs.map((r) => r.text).join('')}</span>
        {t.marked.chars.map((c, i) =>
          c.ch.trim() ? (
            <span
              key={i}
              aria-hidden="true"
              style={{position: 'absolute', left: c.x - t.x, top: c.cy - t.y, width: c.w, textAlign: 'center', transform: 'translateY(-50%)', lineHeight: 1, whiteSpace: 'pre', ...(font ? fontCss(font) : {}), fontSize: t.marked!.em}}
            >
              {c.ch}
            </span>
          ) : null,
        )}
      </div>
    );
  }
  const k = fitScale(t);
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
          // 均等割り付けは改行を残して空白はまとめる（pre-line。Excel も Alt+Enter の改行で行を分ける。広域連合の福祉用具名・製造事業者名の2行）
          whiteSpace: t.wrap ? (distributed ? 'pre-line' : 'pre-wrap') : 'pre',
          wordBreak: 'break-all',
          lineHeight: 1.2,
          // 行の高さは、この箱の文字の大きさ（ないと画面の 16px）の 1.2 倍より低くならないので、欄の文字の大きさにそろえる
          fontSize: t.runs.length ? Math.max(...t.runs.map((r) => r.font.size)) * k : undefined,
          paddingLeft: t.align === 'left' || distributed ? t.indent : 0,
          paddingRight: t.align === 'right' || distributed ? t.indent : 0,
        }}
      >
        {t.oneLine
          ? // 名前の欄は1行ずつ、折り返さない（均等割り付けの欄も1行の中で割り付ける）
            textLines(t).map((row, i) => (
              <div key={i} style={{whiteSpace: distributed ? 'nowrap' : 'pre', minHeight: '1.2em'}}>
                {row.map((r, j) => (
                  <span key={j} style={fontCss(r.font, k)}>
                    {r.text}
                  </span>
                ))}
              </div>
            ))
          : t.runs.map((r, i) => (
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

/** 図形の中の文字：段落ごとに改行し、左右・上下の配置と文字のまわりの余白は原本のとおり */
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
function paper(page: PvPage<string>) {
  const head = bandHeight(page.header);
  const foot = bandHeight(page.footer);
  return {width: page.width + PAD * 2, height: page.height + head + foot + PAD * 2, head, foot};
}

const TONE = {
  sky: {on: 'bg-sky-400/15 outline outline-2 outline-sky-600', hover: 'hover:outline hover:outline-2 hover:outline-teal-600', hoverBg: 'hover:bg-teal-400/10'},
  // 見積書（地が水色）：入れている所は薄い黄色（ユーザーの指示「入力欄では、緑ではなく薄い黄色。特定福祉用具や住宅改修と同様」2026-10-26。前は緑）。
  // 地の色は住宅改修の申請書の黄色（入れる所の bg-amber-50・プレビューのまだ入っていない欄の bg-amber-300/35）のあいだの薄さ、枠は細く
  // （「黄色の部分の色がちょっと濃すぎて、チカチカして見にくいので色は薄く…住宅改修の申請書などで、入力しているときに黄色くしている…それと同じぐらいの色合いに」
  // 2026-10-26。前は bg-amber-200/50 と 3px のオレンジの枠）
  yellow: {on: 'bg-amber-300/25 outline outline-1 outline-amber-400', hover: 'hover:outline hover:outline-1 hover:outline-amber-400', hoverBg: 'hover:bg-amber-300/15'},
};

export function ShinseiPages<F extends string = ShinseiField>({
  pages,
  missing,
  active,
  label,
  onOpen,
  scrollBox,
  title = '申請書のプレビュー',
  print = false,
  fixedScale,
  tone = 'sky',
}: {
  pages: PvPage<F>[];
  missing: Set<F>;
  active: F | null; // 左で入れている所（その欄を囲む）
  label: (f: F) => string;
  onOpen: (f: F) => void; // 欄を押したとき（左のその入れる所へ）
  scrollBox?: RefObject<HTMLElement | null>; // プレビューを入れた枠（左の横に並べて、枠の中で動くとき）
  title?: string; // プレビューの名前（見積書は「見積書のプレビュー」）
  print?: boolean; // 印刷：押す欄・色を出さない
  fixedScale?: number; // 決まった大きさで描く（印刷。画面の幅に合わせない）
  // 入れている所・押せる所の色：申請書（白い様式）は水色。見積書は様式が水色なので薄い黄色（ユーザーの指示
  // 「見積もりが水色で入力しているとわかるようにしてある色も水色なので、わかりづらい」「入力欄では、緑ではなく薄い黄色」2026-10-26）
  tone?: 'sky' | 'yellow';
}) {
  const [wrapRef, wrapWidth] = useWidth<HTMLDivElement>();
  const widest = Math.max(...pages.map((p) => paper(p).width), 1);
  const scale = fixedScale ?? (wrapWidth ? Math.min(MAX_SCALE, wrapWidth / widest) : 1);

  // 入れている所の欄（同じ所が2枚目にもあるとき＝式で同じ値を出している欄は、最初に出てくる欄）が見えるように、プレビューの枠の中を動かす。
  // 縦に並べた狭い画面（枠が動かない）では、画面ごと動かさない（入れている所が見えなくなるので）
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
  }, [firstKey, scrollBox]);
  let firstDone = false;

  return (
    <div ref={wrapRef} className={print ? 'print-pages' : 'space-y-4'} aria-label={title}>
      {pages.map((page, pageNo) => {
        const pp = paper(page);
        return (
          <div key={`${page.sheet}:${pageNo}`} className="relative mx-auto" style={{width: pp.width * scale, height: pp.height * scale}}>
            <div
              className={`absolute left-0 top-0 origin-top-left bg-white ${print ? '' : 'shadow-[0_1px_4px_rgba(0,0,0,0.25)]'}`}
              // 印刷は zoom（transform だと、印刷でページに分けるときに縮める前の位置で分けられ、紙の下より下に描いた字が次の紙に送られて消えた。2ページ目のある見積書）
              style={print ? {width: pp.width, height: pp.height, zoom: scale} : {width: pp.width, height: pp.height, transform: `scale(${scale})`}}
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
                {/* 押すと左のその入れる所へ（まだ入っていない欄は薄い黄色、入れている所は囲む） */}
                {!print && page.fields.map((f, i) => {
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
                      data-pv-field={f.field}
                      onClick={() => onOpen(f.field)}
                      className={`absolute cursor-pointer rounded-[2px] transition-colors ${
                        on ? TONE[tone].on : missing.has(f.field) ? `bg-amber-300/35 ${TONE[tone].hover}` : `${TONE[tone].hoverBg} ${TONE[tone].hover}`
                      }`}
                      style={{left: f.x, top: f.y, width: f.w, height: f.h}}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

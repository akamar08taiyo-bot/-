// 写真への書き込み（photoMarks.ts）を描く：申請書のプレビュー・印刷・写真の欄の小さな写真・書き込みの画面（PhotoMarkEditor.tsx）で同じ見た目に。
// w・h＝写真の見えている四角の紙の上の大きさ（画素）、k＝紙の画素 → 画面の画素。図形は1つずつ SVG（線・塗り・矢印）と文字（HTML）で、重なりの順は書き込みの順（あとが前）

import type {CSSProperties} from 'react';
import {arrowHead, dashArray, isBoxKind, lineEnds, MARK_INSET, MARK_LINE_K, PT_PX, shapeBox} from '../photoMarks.ts';
import {familyOf} from '../shinseiPreview.ts';
import type {PhotoMark} from '../types.ts';

/** 書き込みの文字の字体（Excel の図形の文字と同じく、申請書の原本のテーマの本文の字体。写真に書く内容と同じ） */
export const MARK_FONT = familyOf('');

/** 図形の中の文字の CSS（紙の画素 × k） */
export function markTextCss(m: PhotoMark, k: number): CSSProperties {
  return {
    padding: `${MARK_INSET.y * k}px ${MARK_INSET.x * k}px`,
    fontFamily: MARK_FONT,
    fontSize: m.size * PT_PX * k,
    lineHeight: MARK_LINE_K,
    fontWeight: m.bold ? 700 : 400,
    color: `#${m.color}`,
    textAlign: m.kind === 'text' ? 'left' : 'center',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  };
}

/** 図形1つの線・塗り（写真の見えている四角の左上からの紙の画素） */
function ShapeSvg({m, w, h}: {m: PhotoMark; w: number; h: number}) {
  const vb = {x: 0, y: 0, w, h};
  const sw = m.width * PT_PX;
  const {array, cap} = dashArray(m.dash, sw);
  const stroke = m.line ? `#${m.line}` : 'none';
  if (m.kind === 'line') {
    const e = lineEnds(m, vb);
    let [a, b] = [{x: e.x1, y: e.y1}, {x: e.x2, y: e.y2}];
    const heads: [number, number][][] = [];
    const both = !!(m.start && m.end);
    if (m.line && m.end) {
      const head = arrowHead(b, a, sw, both);
      heads.push(head.points);
      b = head.base;
    }
    if (m.line && m.start) {
      const head = arrowHead({x: e.x1, y: e.y1}, {x: e.x2, y: e.y2}, sw, both);
      heads.push(head.points);
      a = head.base;
    }
    return (
      <>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={sw} strokeDasharray={array} strokeLinecap={cap} />
        {heads.map((p, i) => (
          <polygon key={i} points={p.map((q) => q.join(',')).join(' ')} fill={stroke} />
        ))}
      </>
    );
  }
  const b = shapeBox(m, vb);
  const common = {
    fill: m.fill ? `#${m.fill}` : 'none',
    stroke,
    strokeWidth: m.line ? sw : 0,
    strokeDasharray: array,
    strokeLinecap: cap,
    transform: b.rot ? `rotate(${b.rot} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined,
  } as const;
  return m.kind === 'ellipse' ? <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...common} /> : <rect x={b.x} y={b.y} width={b.w} height={b.h} {...common} />;
}

/** 図形の中の文字（テキストボックスは左上から、四角形・楕円はまん中） */
export function MarkText({m, w, h, k}: {m: PhotoMark; w: number; h: number; k: number}) {
  const b = shapeBox(m, {x: 0, y: 0, w, h});
  return (
    <div
      data-mark-text={m.id}
      style={{
        position: 'absolute',
        left: b.x * k,
        top: b.y * k,
        width: b.w * k,
        height: b.h * k,
        transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: m.kind === 'text' ? 'flex-start' : 'center',
        ...markTextCss(m, k),
      }}
    >
      {m.text}
    </div>
  );
}

/**
 * 写真への書き込み（押せない絵。写真の見えている四角の左上に置く）。hide＝この番号の図形の文字は描かない（書き込みの画面で文字を打っているとき）
 */
export function MarkLayer({marks, w, h, k = 1, hide, style}: {marks: PhotoMark[]; w: number; h: number; k?: number; hide?: string | null; style?: CSSProperties}) {
  if (!marks.length || !(w > 0) || !(h > 0)) return null;
  return (
    <div className="pointer-events-none absolute" style={{width: w * k, height: h * k, ...style}} data-marks={marks.length}>
      {marks.map((m) => (
        <div key={m.id} data-mark={m.id} data-kind={m.kind} className="absolute inset-0">
          <svg width={w * k} height={h * k} viewBox={`0 0 ${w} ${h}`} overflow="visible" className="absolute left-0 top-0 block">
            <ShapeSvg m={m} w={w} h={h} />
          </svg>
          {isBoxKind(m.kind) && m.text && hide !== m.id && <MarkText m={m} w={w} h={h} k={k} />}
        </div>
      ))}
    </div>
  );
}

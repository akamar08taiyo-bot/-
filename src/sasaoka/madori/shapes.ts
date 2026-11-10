// 図形（Excel の「挿入 → 図形」の一覧と同じ分け方：基本図形・線・矢印。ユーザーの指示「EXCELのような図形をそのまま書き込めるようにする」
// 「ここの図形の機能はつけてください」2026-11-10）。箱の図形はドラッグした四角（w×h）の中の道（path）、線の図形は始めから終わり（w・h が向き）。
// 画面・印刷・画像・Excel で同じ絵（render.ts の shapeSvg がここの道を使う）

export type ShapeGroup = '基本図形' | '線' | '矢印';
// hidden：一覧に出さない図形（平面図に要らない形。ユーザーの指示「平面図に置いて不要なものは外してください。変な形の三角や四角など」2026-11-10。前に描いた図形の絵のために残す）
// pts：頂点の並び（0〜1。頂点の編集にするときの頂点。四角・矢印など角だけの形）
export type ShapeDef = {name: string; group: ShapeGroup; line?: boolean; open?: boolean; hidden?: boolean; path?: (w: number, h: number) => string; pts?: [number, number][]};

const r1 = (v: number) => Math.round(v * 10) / 10;
/** 0〜1 の点の並び → 箱の大きさの道 */
const poly = (pts: [number, number][]) => Object.assign((w: number, h: number) => `M${pts.map(([x, y]) => `${r1(x * w)} ${r1(y * h)}`).join('L')}Z`, {pts});
/** 正 n 角形（上が頂点） */
const regular = (n: number) =>
  poly(
    Array.from({length: n}, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)] as [number, number];
    }),
  );

export const SHAPES: ShapeDef[] = [
  // ---- 基本図形
  {name: '四角', group: '基本図形', path: (w, h) => `M0 0H${w}V${h}H0Z`, pts: [[0, 0], [1, 0], [1, 1], [0, 1]]},
  {
    name: '角丸四角',
    group: '基本図形',
    path: (w, h) => {
      const r = r1(Math.min(w, h) * 0.18);
      return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
    },
  },
  {name: '丸', group: '基本図形', path: (w, h) => `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`},
  {name: '三角', hidden: true, group: '基本図形', path: poly([[0.5, 0], [1, 1], [0, 1]])},
  {name: '直角三角', hidden: true, group: '基本図形', path: poly([[0, 0], [1, 1], [0, 1]])},
  {name: '平行四辺形', hidden: true, group: '基本図形', path: poly([[0.25, 0], [1, 0], [0.75, 1], [0, 1]])},
  {name: '台形', hidden: true, group: '基本図形', path: poly([[0.2, 0], [0.8, 0], [1, 1], [0, 1]])},
  {name: 'ひし形', hidden: true, group: '基本図形', path: poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])},
  {name: '五角形', hidden: true, group: '基本図形', path: regular(5)},
  {name: '六角形', hidden: true, group: '基本図形', path: regular(6)},
  {name: '八角形', hidden: true, group: '基本図形', path: regular(8)},
  {name: '十字', hidden: true, group: '基本図形', path: poly([[0.33, 0], [0.67, 0], [0.67, 0.33], [1, 0.33], [1, 0.67], [0.67, 0.67], [0.67, 1], [0.33, 1], [0.33, 0.67], [0, 0.67], [0, 0.33], [0.33, 0.33]])},
  {
    name: 'フレーム',
    hidden: true,
    group: '基本図形',
    path: (w, h) => {
      const t = r1(Math.min(w, h) * 0.15);
      return `M0 0H${w}V${h}H0ZM${t} ${t}V${h - t}H${w - t}V${t}Z`;
    },
  },
  {
    name: 'L字',
    hidden: true,
    group: '基本図形',
    path: (w, h) => {
      const t = r1(Math.min(w, h) * 0.42);
      return `M0 0H${t}V${h - t}H${w}V${h}H0Z`;
    },
  },
  {
    name: '円柱',
    hidden: true,
    group: '基本図形',
    path: (w, h) => {
      const ry = r1(h * 0.12);
      return `M0 ${ry}A${w / 2} ${ry} 0 0 1 ${w} ${ry}A${w / 2} ${ry} 0 0 1 0 ${ry}ZM0 ${ry}V${h - ry}A${w / 2} ${ry} 0 0 0 ${w} ${h - ry}V${ry}`;
    },
  },
  {
    name: '立方体',
    hidden: true,
    group: '基本図形',
    path: (w, h) => {
      const d = r1(Math.min(w, h) * 0.25);
      return `M0 ${d}H${w - d}V${h}H0ZM0 ${d}L${d} 0H${w}L${w - d} ${d}ZM${w - d} ${d}L${w} 0V${h - d}L${w - d} ${h}Z`;
    },
  },
  {name: '大かっこ（左）', hidden: true, group: '基本図形', open: true, path: (w, h) => `M${w} 0H0V${h}H${w}`},
  {name: '大かっこ（右）', hidden: true, group: '基本図形', open: true, path: (w, h) => `M0 0H${w}V${h}H0`},
  {
    name: '中かっこ（左）',
    hidden: true,
    group: '基本図形',
    open: true,
    path: (w, h) => `M${w} 0Q${w / 2} 0 ${w / 2} ${h * 0.1}V${h * 0.4}Q${w / 2} ${h / 2} 0 ${h / 2}Q${w / 2} ${h / 2} ${w / 2} ${h * 0.6}V${h * 0.9}Q${w / 2} ${h} ${w} ${h}`,
  },
  {
    name: '中かっこ（右）',
    hidden: true,
    group: '基本図形',
    open: true,
    path: (w, h) => `M0 0Q${w / 2} 0 ${w / 2} ${h * 0.1}V${h * 0.4}Q${w / 2} ${h / 2} ${w} ${h / 2}Q${w / 2} ${h / 2} ${w / 2} ${h * 0.6}V${h * 0.9}Q${w / 2} ${h} 0 ${h}`,
  },
  // ---- 線（始めから終わりへ。矢印の頭は終わり＝なぞった向き）
  {name: '直線', group: '線', line: true},
  {name: '矢印', group: '線', line: true},
  {name: '両矢印', group: '線', line: true},
  {name: 'カギ線', group: '線', line: true},
  {name: 'カギ線矢印', group: '線', line: true},
  {name: '曲線', group: '線', line: true},
  {name: '曲線矢印', group: '線', line: true},
  // ---- 矢印（ブロック矢印）
  {name: '右矢印', group: '矢印', path: poly([[0, 0.25], [0.6, 0.25], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.75], [0, 0.75]])},
  {name: '左矢印', group: '矢印', path: poly([[1, 0.25], [0.4, 0.25], [0.4, 0], [0, 0.5], [0.4, 1], [0.4, 0.75], [1, 0.75]])},
  {name: '上矢印', group: '矢印', path: poly([[0.25, 1], [0.25, 0.4], [0, 0.4], [0.5, 0], [1, 0.4], [0.75, 0.4], [0.75, 1]])},
  {name: '下矢印', group: '矢印', path: poly([[0.25, 0], [0.25, 0.6], [0, 0.6], [0.5, 1], [1, 0.6], [0.75, 0.6], [0.75, 0]])},
  {name: '左右矢印', group: '矢印', path: poly([[0, 0.5], [0.25, 0], [0.25, 0.25], [0.75, 0.25], [0.75, 0], [1, 0.5], [0.75, 1], [0.75, 0.75], [0.25, 0.75], [0.25, 1]])},
  {name: '上下矢印', group: '矢印', path: poly([[0.5, 0], [1, 0.25], [0.75, 0.25], [0.75, 0.75], [1, 0.75], [0.5, 1], [0, 0.75], [0.25, 0.75], [0.25, 0.25], [0, 0.25]])},
  {
    name: '四方向矢印',
    hidden: true,
    group: '矢印',
    path: poly([[0.5, 0], [0.65, 0.15], [0.57, 0.15], [0.57, 0.43], [0.85, 0.43], [0.85, 0.35], [1, 0.5], [0.85, 0.65], [0.85, 0.57], [0.57, 0.57], [0.57, 0.85], [0.65, 0.85], [0.5, 1], [0.35, 0.85], [0.43, 0.85], [0.43, 0.57], [0.15, 0.57], [0.15, 0.65], [0, 0.5], [0.15, 0.35], [0.15, 0.43], [0.43, 0.43], [0.43, 0.15], [0.35, 0.15]]),
  },
  {name: '曲折矢印', hidden: true, group: '矢印', path: poly([[0, 1], [0, 0.45], [0.1, 0.3], [0.25, 0.25], [0.7, 0.25], [0.7, 0], [1, 0.4], [0.7, 0.8], [0.7, 0.55], [0.35, 0.55], [0.3, 0.6], [0.3, 1]])},
  {name: 'Uターン矢印', hidden: true, group: '矢印', path: poly([[0, 1], [0, 0.35], [0.1, 0.1], [0.3, 0], [0.55, 0], [0.75, 0.1], [0.85, 0.35], [0.85, 0.55], [1, 0.55], [0.7, 0.85], [0.4, 0.55], [0.55, 0.55], [0.55, 0.35], [0.5, 0.25], [0.42, 0.22], [0.33, 0.25], [0.28, 0.35], [0.28, 1]])},
  {name: 'ホームベース', hidden: true, group: '矢印', path: poly([[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1]])},
  {name: '山形', hidden: true, group: '矢印', path: poly([[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1], [0.3, 0.5]])},
];

// 角だけの形は、道を作る関数に頂点の並びを持たせてある（poly）。それを ShapeDef の pts にも置く
for (const d of SHAPES) {
  const pts = (d.path as {pts?: [number, number][]} | undefined)?.pts;
  if (pts) d.pts = pts;
}

export const shapeDef = (name?: string) => SHAPES.find((s) => s.name === name);

/**
 * 図形を頂点の編集にするときの頂点（mm。回した向きも入れる）と、なめらかな線にするか：角だけの形はその角、丸は 12 の点を通るなめらかな線、
 * ほか（角丸四角など）は四隅。curve＝なめらかな線（smoothPath）
 */
export function shapeToPts(it: {type?: string; x: number; y: number; w: number; h: number; rot?: number}): {pts: {x: number; y: number}[]; curve: boolean} {
  const def = shapeDef(it.type);
  const w = Math.abs(it.w);
  const h = Math.abs(it.h);
  const round = it.type === '丸';
  const unit: [number, number][] = round
    ? Array.from({length: 12}, (_, i) => [0.5 + 0.5 * Math.cos((i * Math.PI) / 6 - Math.PI / 2), 0.5 + 0.5 * Math.sin((i * Math.PI) / 6 - Math.PI / 2)] as [number, number])
    : (def?.pts ?? [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const rot = ((it.rot ?? 0) * Math.PI) / 180;
  const cx = it.x + w / 2;
  const cy = it.y + h / 2;
  const pts = unit.map(([u, v]) => {
    const dx = u * w - w / 2;
    const dy = v * h - h / 2;
    return {x: Math.round(cx + dx * Math.cos(rot) - dy * Math.sin(rot)), y: Math.round(cy + dx * Math.sin(rot) + dy * Math.cos(rot))};
  });
  return {pts, curve: round};
}
/** 一覧に出す図形 */
export const SHAPES_SHOWN = SHAPES.filter((s) => !s.hidden);
/** 線の図形か（なければ四角と同じ箱の図形） */
export const isLineShapeType = (name?: string) => !!shapeDef(name)?.line;

/** 線の図形の道と矢印の頭（x・y から w・h の向き） */
export function shapeLine(type: string, x: number, y: number, w: number, h: number, color: string, sw: number): string {
  const x2 = x + w;
  const y2 = y + h;
  let d = `M${r1(x)} ${r1(y)}L${r1(x2)} ${r1(y2)}`;
  // 終わりの頭の向き（最後の区間の向き）と、始めの頭の向き（最初の区間の向き）
  let endFrom = {x, y};
  let startTo = {x: x2, y: y2};
  if (type.startsWith('カギ線')) {
    const mx = x + w / 2;
    d = `M${r1(x)} ${r1(y)}H${r1(mx)}V${r1(y2)}H${r1(x2)}`;
    endFrom = {x: mx, y: y2};
    startTo = {x: mx, y};
    if (!w) {
      endFrom = {x, y};
      startTo = {x: x2, y: y2};
    }
  } else if (type.startsWith('曲線')) {
    // 始めと終わりのまん中から、直角に長さの 25% ふくらませる
    const len = Math.hypot(w, h) || 1;
    const cx = x + w / 2 + (-h / len) * len * 0.25;
    const cy = y + h / 2 + (w / len) * len * 0.25;
    d = `M${r1(x)} ${r1(y)}Q${r1(cx)} ${r1(cy)} ${r1(x2)} ${r1(y2)}`;
    endFrom = {x: cx, y: cy};
    startTo = {x: cx, y: cy};
  }
  const head = (tip: {x: number; y: number}, from: {x: number; y: number}) => {
    const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
    const L = Math.min(260, Math.hypot(w, h) * 0.4);
    const p = (a: number) => `${r1(tip.x - L * Math.cos(ang + a))} ${r1(tip.y - L * Math.sin(ang + a))}`;
    return `<path d="M${p(-0.45)}L${r1(tip.x)} ${r1(tip.y)}L${p(0.45)}Z" fill="${color}" stroke="${color}" stroke-width="${r1(sw / 3)}" stroke-linejoin="round"/>`;
  };
  let s = `<path d="${d}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  if (type.endsWith('矢印')) s += head({x: x2, y: y2}, endFrom);
  if (type === '両矢印') s += head({x, y}, startTo);
  return s;
}

/** 一覧の絵（40×30 の箱。線は左下から右上へ） */
export function shapeIcon(name: string): string {
  const def = shapeDef(name);
  const c = '#334155';
  let inner = '';
  if (def?.line) inner = shapeLine(name, 2, 28, 36, -26, c, 2.2);
  else if (def?.path) inner = `<path d="${def.path(40, 30)}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 46 36">${inner}</svg>`;
}

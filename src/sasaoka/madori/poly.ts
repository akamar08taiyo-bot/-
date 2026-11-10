// 多角形の部屋（L 字・S 字など。辺はみな横か縦）の計算。マイホームクラウドの「部屋入力」と同じく、角を順に押して描き、
// 選ぶと頂点（■）と辺のまん中（□）のつまみで形・大きさを変える（ユーザーの指示「入力方法としては、場所を選択したら頂点で編集できるようにする。
// そのまま枠囲みもできるようにもする」「この状態で頂点で大きさを変更できるようにする」2026-11-10）。
// 部屋の pts（頂点。mm）があれば多角形、なければ x・y・w・h の四角。多角形でも x・y・w・h は囲む四角にそろえておく（寸法線・絵の範囲・重なりに使う）

export type Pt = {x: number; y: number};

const snapTo = (v: number, s: number) => Math.round(v / s) * s;

/** 部屋の頂点（四角なら四隅。右回り） */
export function roomPts(it: {x: number; y: number; w: number; h: number; pts?: Pt[]}): Pt[] {
  if (it.pts && it.pts.length >= 3) return it.pts;
  const {x, y, w, h} = it;
  return [
    {x, y},
    {x: x + w, y},
    {x: x + w, y: y + h},
    {x, y: y + h},
  ];
}

/** 広さ（mm²） */
export function polyArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** 点が多角形の中か */
export function inPoly(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

export function bboxOf(pts: Pt[]): {x: number; y: number; w: number; h: number} {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y};
}

/** 同じ点・一直線の途中の点を除く（辺が縦・横のままの形にそろえる） */
export function tidy(pts: Pt[]): Pt[] {
  let out = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return i === 0 ? !(p.x === pts[pts.length - 1].x && p.y === pts[pts.length - 1].y) : !(p.x === q.x && p.y === q.y);
  });
  for (let changed = true; changed && out.length > 3; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
        out = out.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** 頂点から部屋の形（x・y・w・h と pts）。四角になったら pts は持たない */
export function shapeOf(pts: Pt[]): {x: number; y: number; w: number; h: number; pts?: Pt[]} {
  const t = tidy(pts);
  const b = bboxOf(t);
  const rect = t.length === 4 && t.every((p) => (p.x === b.x || p.x === b.x + b.w) && (p.y === b.y || p.y === b.y + b.h));
  return rect || t.length < 3 ? b : {...b, pts: t};
}

/** 次の頂点を、前の頂点から横か縦（動いた量の多い方）にそろえる */
export function orthoNext(last: Pt, p: Pt): Pt {
  return Math.abs(p.x - last.x) >= Math.abs(p.y - last.y) ? {x: p.x, y: last.y} : {x: last.x, y: p.y};
}

/** 描き終わり：最後の頂点からはじめの頂点まで横・縦の2本で戻れるように、角を1つ足す（そろっていれば足さない） */
export function closed(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (last.x === first.x || last.y === first.y) return pts;
  const prev = pts[pts.length - 2];
  const lastHoriz = prev ? prev.y === last.y : true;
  return [...pts, lastHoriz ? {x: last.x, y: first.y} : {x: first.x, y: last.y}];
}

/** 頂点 i を p へ（となりの頂点も、辺が横・縦のままになるように一緒に動く） */
export function vertexMoved(pts: Pt[], i: number, p: Pt): Pt[] {
  const n = pts.length;
  const o = pts[i];
  const out = pts.map((q) => ({...q}));
  const pi = (i + n - 1) % n;
  const ni = (i + 1) % n;
  if (pts[pi].y === o.y) out[pi].y = p.y;
  else out[pi].x = p.x;
  if (pts[ni].y === o.y) out[ni].y = p.y;
  else out[ni].x = p.x;
  out[i] = {...p};
  return out;
}

/** 辺 i（頂点 i から i+1）を p まで、辺に直角に動かす（となりの辺がのびちぢみする） */
export function edgeMoved(pts: Pt[], i: number, p: Pt): Pt[] {
  const n = pts.length;
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const out = pts.map((q) => ({...q}));
  if (a.y === b.y) {
    out[i].y = p.y;
    out[(i + 1) % n].y = p.y;
  } else {
    out[i].x = p.x;
    out[(i + 1) % n].x = p.x;
  }
  return out;
}

/** 頂点を step にそろえる */
export const snapPt = (p: Pt, s: number): Pt => ({x: snapTo(p.x, s), y: snapTo(p.y, s)});

/** 90°右回り（囲む四角のまん中で） */
export function turnedPts(pts: Pt[], step: number): Pt[] {
  const b = bboxOf(pts);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return pts.map((p) => snapPt({x: cx - (p.y - cy), y: cy + (p.x - cx)}, step));
}

export const movedPts = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((p) => ({x: p.x + dx, y: p.y + dy}));

/** 辺（横・縦の壁）：h＝横の壁、at＝その線の位置、from〜to＝長さの範囲 */
export function polyEdges(pts: Pt[]): {h: boolean; at: number; from: number; to: number}[] {
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    return a.y === b.y ? {h: true, at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x)} : {h: false, at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y)};
  });
}

/** 名前を書く所：部屋の中でいちばん広く空いた所（L 字の角の外に出さない）。maxW はそこでの横の幅 */
export function labelSpot(pts: Pt[], holes: Pt[][] = []): {x: number; y: number; maxW: number; maxH: number} {
  const b = bboxOf(pts);
  // 中に置いたほかの部屋（廊下の中の部屋など）は穴：名前はその外の空いた所に書く
  const edges = [...polyEdges(pts), ...holes.flatMap(polyEdges)];
  const N = holes.length ? 40 : 24;
  let best = {x: b.x + b.w / 2, y: b.y + b.h / 2, d: -1};
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const p = {x: b.x + (b.w * i) / N, y: b.y + (b.h * j) / N};
      if (!inPoly(p, pts) || holes.some((h) => inPoly(p, h))) continue;
      let d = Infinity;
      for (const e of edges) {
        const along = e.h ? p.x : p.y;
        const across = e.h ? p.y : p.x;
        const c = Math.max(e.from, Math.min(e.to, along));
        d = Math.min(d, Math.hypot(along - c, across - e.at));
      }
      if (d > best.d) best = {x: p.x, y: p.y, d};
    }
  }
  // その高さ・その横の位置で、部屋の中の幅・高さ
  const span = (horiz: boolean) => {
    const cuts = edges
      .filter((e) => e.h !== horiz && (horiz ? best.y : best.x) >= e.from && (horiz ? best.y : best.x) <= e.to)
      .map((e) => e.at)
      .sort((u, v) => u - v);
    const at = horiz ? best.x : best.y;
    let lo = horiz ? b.x : b.y;
    let hi = horiz ? b.x + b.w : b.y + b.h;
    for (const c of cuts) {
      if (c <= at) lo = c;
      else {
        hi = c;
        break;
      }
    }
    return hi - lo;
  };
  return {x: best.x, y: best.y, maxW: span(true), maxH: span(false)};
}

/** SVG の道 */
export const polyPath = (pts: Pt[]) => `M${pts.map((p) => `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join('L')}Z`;

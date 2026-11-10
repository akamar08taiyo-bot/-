// 平面図の編集の計算（画面の MadoriEditor.tsx から使う。テストできるように画面と分ける）。
// まどりっち・マイホームクラウドと同じ使い心地にするための「吸い付き」：部屋は方眼に、ドア・窓は近くの壁に、トイレ・浴槽などの設備は
// 背中を近くの壁に向けて壁ぎわに、手すりは壁ぞいに。長さはすべて mm

import {DOOR_TYPES, fixType, roomType, STAIR_TYPES, STEP_TYPES, WINDOW_TYPES} from './catalog.ts';
import {bounds, isShapeLine, mid, railBend, snapTo} from './model.ts';
import {edgeMoved, inPoly, movedPts, polyArea, polyEdges, shapeOf, snapPt, turnedPts, vertexMoved} from './poly.ts';
import type {MItem, Module, Rot} from './model.ts';

export type P = {x: number; y: number};
export type Box = {x: number; y: number; w: number; h: number};

/** 道具（左の一覧で選ぶ） */
export type Tool =
  | {t: 'select'}
  | {t: 'room'; type: string}
  | {t: 'door'; type: string}
  | {t: 'window'; type: string}
  | {t: 'fix'; type: string}
  | {t: 'stair'; type: string}
  | {t: 'rail'; place?: string; len?: number; lshape?: boolean}
  | {t: 'vrail'; place?: string}
  | {t: 'step'; type: string; place?: string}
  | {t: 'num'; place?: string}
  | {t: 'text'}
  | {t: 'line'; type: '壁' | '細線'}
  | {t: 'dim'}
  | {t: 'shape'; type: ShapeType};

/** 図形（Excel と同じ。上の段の「図形」のボタン） */
export const SHAPE_TYPES = ['直線', '矢印', '四角', '丸'] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
/** 図形の色（赤・青・黒・緑） */
export const SHAPE_COLORS: {name: string; hex: string}[] = [
  {name: '赤', hex: '#e01b24'},
  {name: '青', hex: '#1d4ed8'},
  {name: '黒', hex: '#111827'},
  {name: '緑', hex: '#15803d'},
];

/** ドラッグで大きさ・長さを決める道具（ほかは押した所に置く） */
export const DRAG_TOOLS: Tool['t'][] = ['room', 'stair', 'rail', 'step', 'line', 'dim', 'shape'];

/** 壁の中心線（部屋の四角の辺）。h＝横の壁（y が一定） */
export type Wall = {h: boolean; at: number; from: number; to: number};
const HALF_WALL = 30; // 壁の厚みの半分（render.ts の WALL_W 60 の半分）

export function walls(items: MItem[]): Wall[] {
  const out: Wall[] = [];
  for (const r of items) {
    if (r.kind !== 'room') continue;
    if (r.pts) {
      out.push(...polyEdges(r.pts)); // 多角形の部屋は辺ごとの壁
      continue;
    }
    out.push({h: true, at: r.y, from: r.x, to: r.x + r.w}, {h: true, at: r.y + r.h, from: r.x, to: r.x + r.w});
    out.push({h: false, at: r.x, from: r.y, to: r.y + r.h}, {h: false, at: r.x + r.w, from: r.y, to: r.y + r.h});
  }
  return out;
}

/** p にいちばん近い壁（max より遠ければ null）。d は壁の中心線までの距離、side は p が壁のどちら側か（+1＝下・右） */
export function nearestWall(ws: Wall[], p: P, max: number): {w: Wall; d: number; side: 1 | -1} | null {
  let best: {w: Wall; d: number; side: 1 | -1} | null = null;
  for (const w of ws) {
    const along = w.h ? p.x : p.y;
    const across = w.h ? p.y : p.x;
    if (along < w.from - 1 || along > w.to + 1) continue;
    const d = Math.abs(across - w.at);
    if (d <= max && (!best || d < best.d)) best = {w, d, side: across >= w.at ? 1 : -1};
  }
  return best;
}

/** 部屋の大きさ（種類の決まった大きさ。方眼のマス × module） */
export function roomSize(type: string, module: Module): {w: number; h: number} {
  const t = roomType(type);
  const [a, b] = t?.size ?? [2, 2];
  return {w: a * module, h: b * module};
}

/** 2つの点の四角（方眼にそろえる。押しただけなら種類の大きさ） */
function rectFrom(a: P, b: P, step: number, size: {w: number; h: number}, clickOnly: boolean): Box {
  if (clickOnly) return {x: snapTo(a.x - size.w / 2, step), y: snapTo(a.y - size.h / 2, step), w: size.w, h: size.h};
  const x0 = snapTo(Math.min(a.x, b.x), step);
  const y0 = snapTo(Math.min(a.y, b.y), step);
  const x1 = snapTo(Math.max(a.x, b.x), step);
  const y1 = snapTo(Math.max(a.y, b.y), step);
  return {x: x0, y: y0, w: Math.max(step, x1 - x0), h: Math.max(step, y1 - y0)};
}

/** 建具・窓を壁に置く：近くの壁の上、開口の端を方眼の半分の歩みにそろえる。開く向きは押した側 */
export function placeOpening(kind: 'door' | 'window', type: string, p: P, ws: Wall[], step: number): MItem | null {
  const def = (kind === 'door' ? DOOR_TYPES : WINDOW_TYPES).find((d) => d.name === type) ?? (kind === 'door' ? DOOR_TYPES[0] : WINDOW_TYPES[0]);
  const near = nearestWall(ws, p, 600);
  if (!near) return null;
  const {w: wall, side} = near;
  const width = Math.min(def.w, wall.to - wall.from);
  const along = wall.h ? p.x : p.y;
  const s = step / 2;
  let start = snapTo(along - width / 2, s);
  start = Math.max(wall.from, Math.min(wall.to - width, start));
  const c = start + width / 2;
  // rot 0：開く側 +1＝下（flip なし）。rot 90：開く側 +1＝左（render.ts は rotate(90) で +y が −x になる）なので、右へ開くときに flip
  return wall.h
    ? {id: mid(), kind, type: def.name, x: c, y: wall.at, w: width, h: 0, ...(side < 0 ? {flip: true} : {})}
    : {id: mid(), kind, type: def.name, x: wall.at, y: c, w: width, h: 0, rot: 90, ...(side > 0 ? {flip: true} : {})};
}

/** 回したあとの外まわり（w・h が入れかわる） */
const turned = (w: number, h: number, rot: Rot | undefined) => (rot === 90 || rot === 270 ? {w: h, h: w} : {w, h});

/** 外まわりの四角（回したあと）から、部品の x・y（回す前の左上）を出す */
function fromBox(box: Box, w: number, h: number): P {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {x: cx - w / 2, y: cy - h / 2};
}

/** 四角の辺が壁の面（壁の中心線から厚みの半分）に近ければ、その面にそろえる（設備・段差の解消を動かすとき） */
export function magnet(box: Box, ws: Wall[], tol = 140): Box {
  let {x, y} = box;
  let dx = Infinity;
  let dy = Infinity;
  for (const w of ws) {
    const overlap = w.h ? box.x < w.to && box.x + box.w > w.from : box.y < w.to && box.y + box.h > w.from;
    if (!overlap) continue;
    const faces = [w.at + HALF_WALL, w.at - HALF_WALL];
    for (const f of faces) {
      if (w.h) {
        for (const [edge, nx] of [
          [box.y, f],
          [box.y + box.h, f - box.h],
        ] as const) {
          const d = Math.abs(edge - f);
          if (d <= tol && d < dy) {
            dy = d;
            y = nx;
          }
        }
      } else {
        for (const [edge, nx] of [
          [box.x, f],
          [box.x + box.w, f - box.w],
        ] as const) {
          const d = Math.abs(edge - f);
          if (d <= tol && d < dx) {
            dx = d;
            x = nx;
          }
        }
      }
    }
  }
  return {x, y, w: box.w, h: box.h};
}

/**
 * 設備・家具を置く：押した所のいちばん近い壁（900mm 以内）に背中（上の辺）を向けて、壁の面にぴったり付ける。
 * 壁が遠ければ向きはそのまま（rot 0）で、押した所をまん中に
 */
export function placeFixture(type: string, p: P, ws: Wall[]): MItem {
  const def = fixType(type);
  const w = def?.w ?? 600;
  const h = def?.h ?? 600;
  const near = nearestWall(ws, p, 900);
  let rot: Rot = 0;
  if (near) rot = near.w.h ? (near.side > 0 ? 0 : 180) : near.side > 0 ? 270 : 90;
  const t = turned(w, h, rot);
  const cx = snapTo(p.x, 5); // 5mm 刻み（910mm の部屋のまん中 455 に置けるように）
  const cy = snapTo(p.y, 5);
  let box: Box = {x: cx - t.w / 2, y: cy - t.h / 2, w: t.w, h: t.h};
  if (near) {
    const face = near.w.at + near.side * HALF_WALL;
    if (near.w.h) box = {...box, y: near.side > 0 ? face : face - t.h};
    else box = {...box, x: near.side > 0 ? face : face - t.w};
    box = magnet(box, ws, 200);
  }
  const at = fromBox(box, w, h);
  return {id: mid(), kind: 'fix', type: def?.name ?? type, x: Math.round(at.x), y: Math.round(at.y), w, h, ...(rot ? {rot} : {})};
}

/** 手すりの線：横か縦にそろえ、壁の近く（250mm 以内）なら壁の面から少し内側（壁ぞい）に。長さは 50mm 刻み */
export function railLine(a: P, b: P, ws: Wall[], clickOnly: boolean, defLen = 600): {x: number; y: number; w: number; h: number} {
  const horiz = clickOnly ? true : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const near = nearestWall(
    ws.filter((w) => w.h === horiz),
    a,
    250,
  );
  const off = HALF_WALL + 50;
  let x = snapTo(a.x, 50);
  let y = snapTo(a.y, 50);
  if (near) {
    if (horiz) y = near.w.at + near.side * off;
    else x = near.w.at + near.side * off;
  }
  const raw = clickOnly ? defLen : horiz ? b.x - a.x : b.y - a.y;
  const len = Math.sign(raw || 1) * Math.max(100, snapTo(Math.abs(raw), 50));
  return horiz ? {x, y, w: len, h: 0} : {x, y, w: 0, h: len};
}

/** 縦手すり（点）：近くの壁（300mm 以内）の面のすぐ内側へ */
export function vrailPoint(p: P, ws: Wall[]): P {
  const near = nearestWall(ws, p, 300);
  const x = snapTo(p.x, 50);
  const y = snapTo(p.y, 50);
  if (!near) return {x, y};
  const at = near.w.at + near.side * (HALF_WALL + 70);
  return near.w.h ? {x, y: at} : {x: at, y};
}

/** 線・寸法線：横・縦・45° にそろえる。端は step にそろえる */
export function straight(a: P, b: P, step: number): {x: number; y: number; w: number; h: number} {
  const x = snapTo(a.x, step);
  const y = snapTo(a.y, step);
  let dx = snapTo(b.x, step) - x;
  let dy = snapTo(b.y, step) - y;
  const ang = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
  const a45 = Math.min(ang, 180 - ang);
  if (a45 < 22.5) dy = 0;
  else if (a45 > 67.5) dx = 0;
  else {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx) * m;
    dy = Math.sign(dy) * m;
  }
  return {x, y, w: dx, h: dy};
}

/**
 * 道具で部品を作る（a＝押した所、b＝離した所。clickOnly＝ドラッグしなかった）。置けないとき（壁のない所のドア）は null
 */
/**
 * 一筆で描いた L 字の手すり（ユーザーの指示「こんな感じでL字にしたい場合がある。一筆でかけるようにする」2026-11-10）：
 * なぞった道（path）が、始めから横（縦）へ進んで角で曲がり、縦（横）へ進んでいれば L 字。両方とも 150mm 以上で、角のそばを通っているとき。
 * 1本目は壁ぞい（railLine）、2本目も角のそばの壁ぞいにそろえ、1本目の終わりをそこまで延ばす
 */
export function railStroke(a: P, b: P, path: P[], ws: Wall[]): {x: number; y: number; w: number; h: number; len?: number; turn?: 1 | -1} {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (path.length >= 3 && Math.abs(dx) >= 150 && Math.abs(dy) >= 150) {
    const near = (c: P) => Math.min(...path.map((q) => Math.hypot(q.x - c.x, q.y - c.y)));
    const cH = {x: b.x, y: a.y}; // 横から縦へ
    const cV = {x: a.x, y: b.y}; // 縦から横へ
    const dH = near(cH);
    const dV = near(cV);
    const horizFirst = dH <= dV;
    const corner = horizFirst ? cH : cV;
    if (Math.min(dH, dV) <= Math.min(Math.abs(dx), Math.abs(dy)) * 0.35) {
      const l1 = railLine(a, corner, ws, false);
      const l2 = railLine(corner, b, ws, false);
      if (horizFirst) {
        const w = snapTo(l2.x - l1.x, 50) || Math.sign(dx) * 100;
        const rest = b.y - l1.y;
        return {x: l1.x, y: l1.y, w, h: 0, len: Math.max(100, snapTo(Math.abs(rest), 50)), turn: rest >= 0 ? 1 : -1};
      }
      const h = snapTo(l2.y - l1.y, 50) || Math.sign(dy) * 100;
      const rest = b.x - l1.x;
      return {x: l1.x, y: l1.y, w: 0, h, len: Math.max(100, snapTo(Math.abs(rest), 50)), turn: rest >= 0 ? 1 : -1};
    }
  }
  return railLine(a, b, ws, false);
}

export function makeItem(tool: Tool, a: P, b: P, clickOnly: boolean, ctx: {items: MItem[]; module: Module; step: number; path?: P[]}): MItem | null {
  const ws = walls(ctx.items);
  switch (tool.t) {
    case 'room': {
      const r = rectFrom(a, b, ctx.step, roomSize(tool.type, ctx.module), clickOnly);
      return {id: mid(), kind: 'room', type: tool.type, ...r};
    }
    case 'stair': {
      const def = STAIR_TYPES.find((s) => s.name === tool.type) ?? STAIR_TYPES[0];
      const r = rectFrom(a, b, ctx.step, {w: def.size[0] * ctx.module, h: def.size[1] * ctx.module}, clickOnly);
      return {id: mid(), kind: 'stair', type: def.name, ...r};
    }
    case 'door':
    case 'window':
      return placeOpening(tool.t, tool.type, b, ws, ctx.step);
    case 'fix':
      return placeFixture(tool.type, b, ws);
    case 'rail': {
      // なぞった道が角で曲がっていれば L 字（一筆）。「L型手すり」の道具は、まっすぐなぞっても下（右）へ 600mm 曲げる
      const l = !clickOnly && ctx.path ? railStroke(a, b, ctx.path, ws) : railLine(a, b, ws, clickOnly, tool.len ?? 600);
      return {id: mid(), kind: 'rail', ...l, ...(tool.place ? {place: tool.place} : {}), ...(tool.lshape && !('turn' in l && l.turn) ? {len: 600, turn: 1 as const} : {})};
    }
    case 'vrail': {
      const q = vrailPoint(b, ws);
      return {id: mid(), kind: 'vrail', x: q.x, y: q.y, w: 0, h: 0, len: 800, ...(tool.place ? {place: tool.place} : {})};
    }
    case 'step': {
      const def = STEP_TYPES.find((s) => s.name === tool.type) ?? STEP_TYPES[0];
      let r: Box;
      if (clickOnly) {
        r = magnet({x: snapTo(b.x - def.w / 2, 10), y: snapTo(b.y - def.h / 2, 10), w: def.w, h: def.h}, ws, 200);
      } else {
        const x0 = snapTo(Math.min(a.x, b.x), 50);
        const y0 = snapTo(Math.min(a.y, b.y), 50);
        r = {x: x0, y: y0, w: Math.max(100, snapTo(Math.abs(b.x - a.x), 50)), h: Math.max(100, snapTo(Math.abs(b.y - a.y), 50))};
      }
      return {id: mid(), kind: 'step', type: def.name, ...r, ...(tool.place ? {place: tool.place} : {})};
    }
    case 'num':
      return {id: mid(), kind: 'num', x: snapTo(b.x, 10), y: snapTo(b.y, 10), w: 0, h: 0, ...(tool.place ? {place: tool.place} : {})};
    case 'text':
      return {id: mid(), kind: 'text', x: snapTo(b.x, 10), y: snapTo(b.y, 10), w: 0, h: 0, label: '文字', size: 220};
    case 'line': {
      const l = straight(a, b, ctx.step / 2);
      if (!l.w && !l.h) return null;
      return {id: mid(), kind: 'line', ...l, ...(tool.type === '細線' ? {type: '細線'} : {})};
    }
    case 'shape': {
      // 直線・矢印はなぞった向きのまま（ななめも）、四角・丸はなぞった箱。押しただけなら決まった大きさ
      if (tool.type === '直線' || tool.type === '矢印') {
        const w = clickOnly ? 900 : snapTo(b.x - a.x, 10);
        const h = clickOnly ? 0 : snapTo(b.y - a.y, 10);
        if (!w && !h) return null;
        return {id: mid(), kind: 'shape', type: tool.type, x: snapTo(a.x, 10), y: snapTo(a.y, 10), w, h};
      }
      const r = clickOnly
        ? {x: snapTo(b.x - 450, 10), y: snapTo(b.y - 300, 10), w: 900, h: 600}
        : {x: snapTo(Math.min(a.x, b.x), 10), y: snapTo(Math.min(a.y, b.y), 10), w: Math.max(100, snapTo(Math.abs(b.x - a.x), 10)), h: Math.max(100, snapTo(Math.abs(b.y - a.y), 10))};
      return {id: mid(), kind: 'shape', type: tool.type, ...r};
    }
    case 'dim': {
      const l = straight(a, b, 10);
      if (!l.w && !l.h) return null;
      return {id: mid(), kind: 'dim', ...l};
    }
    default:
      return null;
  }
}

/** 文字の部品の外まわり（字の幅の見積もり。render.ts と同じ全角 1・半角 0.6） */
export function textBox(it: MItem): Box {
  const size = it.size ?? 220;
  const lines = (it.label || '').split('\n');
  const width = Math.max(...lines.map((l) => [...l].reduce((a, c) => a + (c.charCodeAt(0) < 0x2000 ? 0.6 : 1), 0))) * size;
  return {x: it.x, y: it.y, w: Math.max(size, width), h: size * lines.length * 1.1};
}

const segDist = (p: P, a: P, b: P) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const inBox = (p: P, b: Box, pad = 0) => p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;

/** 押した所の部品（上に描いてあるものを先に。部屋は中にいちばん小さい部屋）。tol は線をつかめる幅（mm） */
export function hitTest(items: MItem[], p: P, tol: number): MItem | null {
  const order: MItem['kind'][][] = [['text', 'num'], ['shape'], ['rail', 'vrail'], ['door', 'window'], ['step'], ['fix', 'stair'], ['line', 'dim']];
  for (const kinds of order) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!kinds.includes(it.kind)) continue;
      if (it.kind === 'text' ? inBox(p, textBox(it), tol / 2) : it.kind === 'num' || it.kind === 'vrail' ? Math.hypot(p.x - it.x, p.y - it.y) <= Math.max(160, tol) : it.kind === 'rail' || it.kind === 'line' || it.kind === 'dim' || isShapeLine(it) ? Math.min(segDist(p, it, {x: it.x + it.w, y: it.y + it.h}), ((e) => (e ? segDist(p, {x: it.x + it.w, y: it.y + it.h}, e) : Infinity))(railBend(it))) <= Math.max(tol, it.kind === 'line' ? 40 : 60) : inBox(p, bounds(it), it.kind === 'door' || it.kind === 'window' ? 0 : tol / 3)) return it;
    }
  }
  let room: MItem | null = null;
  const areaOf = (r: MItem) => (r.pts ? polyArea(r.pts) : r.w * r.h);
  for (const it of items) {
    if (it.kind !== 'room' || !(it.pts ? inPoly(p, it.pts) : inBox(p, it))) continue;
    if (!room || areaOf(it) < areaOf(room)) room = it;
  }
  return room;
}

/** つまみ（大きさを変える所）。四角の部品は四隅と四辺、線の部品は両端、多角形の部屋は頂点（v0…）と辺のまん中（e0…） */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p0' | 'p1' | `v${number}` | `e${number}`;
/** 頂点・角のつまみ（■。塗る）か、辺のつまみ（□） */
export const isCornerHandle = (h: Handle) => h.startsWith('v') || h === 'nw' || h === 'ne' || h === 'se' || h === 'sw' || h === 'p0' || h === 'p1';

export function handlesOf(it: MItem): {h: Handle; x: number; y: number}[] {
  if (it.kind === 'room' && it.pts) {
    const pts = it.pts;
    return [
      ...pts.map((p, i) => ({h: `v${i}` as Handle, x: p.x, y: p.y})),
      ...pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return {h: `e${i}` as Handle, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2};
      }),
    ];
  }
  if (it.kind === 'rail' || it.kind === 'line' || it.kind === 'dim' || isShapeLine(it)) {
    return [
      {h: 'p0', x: it.x, y: it.y},
      {h: 'p1', x: it.x + it.w, y: it.y + it.h},
    ];
  }
  if (it.kind === 'room' || it.kind === 'stair' || it.kind === 'step' || it.kind === 'fix' || it.kind === 'shape') {
    const b = bounds(it);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return [
      {h: 'nw', x: b.x, y: b.y},
      {h: 'n', x: cx, y: b.y},
      {h: 'ne', x: b.x + b.w, y: b.y},
      {h: 'e', x: b.x + b.w, y: cy},
      {h: 'se', x: b.x + b.w, y: b.y + b.h},
      {h: 's', x: cx, y: b.y + b.h},
      {h: 'sw', x: b.x, y: b.y + b.h},
      {h: 'w', x: b.x, y: cy},
    ];
  }
  return [];
}

/** つまみを動かした部品（step にそろえる。部屋は step、ほかは 10mm） */
export function resized(it: MItem, h: Handle, p: P, step: number): MItem {
  // 多角形の部屋：頂点（となりの頂点も横・縦のまま）・辺（直角に動かす）。小さくなりすぎた辺・一直線の頂点はまとめる
  if (it.kind === 'room' && it.pts && (h.startsWith('v') || h.startsWith('e')) && !['e', 'w', 'n', 's', 'ne', 'nw', 'se', 'sw'].includes(h)) {
    const i = Number(h.slice(1));
    const q = snapPt(p, step);
    const next = h.startsWith('v') ? vertexMoved(it.pts, i, q) : edgeMoved(it.pts, i, q);
    const s = shapeOf(next);
    if (s.w < step || s.h < step) return it;
    const {pts: _old, ...rest} = it;
    return {...rest, ...s};
  }
  if (h === 'p0' || h === 'p1') {
    const end = {x: it.x + it.w, y: it.y + it.h};
    const s = it.kind === 'line' ? step / 2 : it.kind === 'rail' ? 50 : 10;
    const q = {x: snapTo(p.x, s), y: snapTo(p.y, s)};
    const fixed = h === 'p0' ? end : {x: it.x, y: it.y};
    // 手すり・寸法線は横・縦のまま（ななめにしない）。線は 45° まで
    let moved = q;
    if (it.kind !== 'line' && it.kind !== 'shape') moved = Math.abs(q.x - fixed.x) >= Math.abs(q.y - fixed.y) ? {x: q.x, y: fixed.y} : {x: fixed.x, y: q.y};
    return h === 'p0' ? {...it, x: moved.x, y: moved.y, w: fixed.x - moved.x, h: fixed.y - moved.y} : {...it, w: moved.x - it.x, h: moved.y - it.y};
  }
  const s = it.kind === 'room' || it.kind === 'stair' ? step : 10;
  const b = bounds(it);
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  if (h.includes('w')) x0 = Math.min(snapTo(p.x, s), x1 - s);
  if (h.includes('e')) x1 = Math.max(snapTo(p.x, s), x0 + s);
  if (h.includes('n')) y0 = Math.min(snapTo(p.y, s), y1 - s);
  if (h.includes('s')) y1 = Math.max(snapTo(p.y, s), y0 + s);
  const box = {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
  const vert = it.rot === 90 || it.rot === 270;
  const w = vert ? box.h : box.w;
  const hh = vert ? box.w : box.h;
  const at = fromBox(box, w, hh);
  return {...it, x: at.x, y: at.y, w, h: hh};
}

/** 部品を動かす（d＝動かした量）。部屋・階段は方眼に、ドア・窓は近くの壁に、設備・段差の解消は壁の面に吸い付く */
export function moved(it: MItem, d: P, items: MItem[], step: number): MItem {
  const ws = walls(items.filter((o) => o.id !== it.id));
  if (it.kind === 'room' && it.pts) {
    const x = snapTo(it.x + d.x, step);
    const y = snapTo(it.y + d.y, step);
    return {...it, x, y, pts: movedPts(it.pts, x - it.x, y - it.y)};
  }
  if (it.kind === 'room' || it.kind === 'stair') return {...it, x: snapTo(it.x + d.x, step), y: snapTo(it.y + d.y, step)};
  if (it.kind === 'door' || it.kind === 'window') {
    const next = placeOpening(it.kind, it.type ?? '', {x: it.x + d.x, y: it.y + d.y}, ws, step);
    if (!next) return it;
    return {...it, x: next.x, y: next.y, rot: next.rot, w: it.w, ...(next.rot === it.rot ? {} : {flip: next.flip})};
  }
  if (it.kind === 'fix' || it.kind === 'step') {
    const b = bounds(it);
    const box = magnet({x: snapTo(b.x + d.x, 10), y: snapTo(b.y + d.y, 10), w: b.w, h: b.h}, ws);
    const at = fromBox(box, it.w, it.h);
    return {...it, x: Math.round(at.x), y: Math.round(at.y)};
  }
  if (it.kind === 'rail') return {...it, x: snapTo(it.x + d.x, 10), y: snapTo(it.y + d.y, 10)};
  if (it.kind === 'line') return {...it, x: snapTo(it.x + d.x, step / 2), y: snapTo(it.y + d.y, step / 2)};
  return {...it, x: snapTo(it.x + d.x, 10), y: snapTo(it.y + d.y, 10)};
}

/** 90°回す：部屋は縦横を入れかえ（まん中のまま）、設備・階段・段差の解消は右回り、線の部品はまん中で、ドア・窓は開く向きを回す */
export function turnedItem(it: MItem, step: number): MItem {
  if (it.kind === 'room' && it.pts) return {...it, ...shapeOf(turnedPts(it.pts, step))};
  if (it.kind === 'room') {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    return {...it, x: snapTo(cx - it.h / 2, step), y: snapTo(cy - it.w / 2, step), w: it.h, h: it.w};
  }
  if (it.kind === 'shape' && !isShapeLine(it)) {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    return {...it, x: Math.round(cx - it.h / 2), y: Math.round(cy - it.w / 2), w: it.h, h: it.w};
  }
  if (it.kind === 'rail' || it.kind === 'line' || it.kind === 'dim' || isShapeLine(it)) {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    // L 字の2本目も一緒に 90°（横の1本目の下向き＝turn 1 は、縦になると左向き＝−1）
    const turn = it.turn ? (it.h === 0 ? (-it.turn as 1 | -1) : it.turn) : undefined;
    return {...it, x: Math.round(cx + it.h / 2), y: Math.round(cy - it.w / 2), w: -it.h, h: it.w, ...(turn ? {turn} : {})};
  }
  if (it.kind === 'door' || it.kind === 'window') {
    // 開く側と吊り元を順に回す（右開き→左開き…）
    if (!it.flip && !it.hinge) return {...it, hinge: true};
    if (!it.flip && it.hinge) return {...it, flip: true};
    if (it.flip && it.hinge) return {...it, hinge: false};
    return {...it, flip: false};
  }
  return {...it, rot: (((it.rot ?? 0) + 90) % 360) as Rot};
}

/** 部品を写す（Ctrl+C・Ctrl+V・複製。方眼の1歩ずらす） */
export function copied(it: MItem, step: number): MItem {
  const {place: _place, n: _n, ...rest} = it; // 申請書の箇所・番号は写さない（同じ番号が2つにならないように）
  return {...rest, id: mid(), x: it.x + step, y: it.y + step, ...(it.pts ? {pts: movedPts(it.pts, step, step)} : {})};
}

/** 延べ床の広さ（屋外・吹抜・バルコニー・テラス・ポーチ・車庫を除いた部屋の合計 ㎡）。ほかの部屋の中に描いた部屋（洋室の中の収納など）は二重に数えない */
export function floorArea(items: MItem[]): number {
  const skip = new Set(['屋外', '吹抜', 'バルコニー', 'テラス', 'ポーチ', '車庫']);
  const rooms = items.filter((it) => it.kind === 'room' && !skip.has(it.type ?? ''));
  // 中に入っている部屋（大きい部屋の中に描いた収納など）は数えない
  const inside = (a: MItem, b: MItem) => a !== b && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const top = rooms.filter((a) => !rooms.some((b) => inside(a, b)));
  return Math.round(top.reduce((s, r) => s + (r.pts ? polyArea(r.pts) : Math.abs(r.w) * Math.abs(r.h)) / 1e6, 0) * 100) / 100;
}

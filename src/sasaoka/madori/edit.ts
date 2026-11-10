// 平面図の編集の計算（画面の MadoriEditor.tsx から使う。テストできるように画面と分ける）。
// まどりっち・マイホームクラウドと同じ使い心地にするための「吸い付き」：部屋は方眼に、ドア・窓は近くの壁に、トイレ・浴槽などの設備は
// 背中を近くの壁に向けて壁ぎわに、手すりは壁ぞいに。長さはすべて mm

import {DOOR_TYPES, fixType, roomType, STAIR_TYPES, STEP_TYPES, WINDOW_TYPES} from './catalog.ts';
import {simplifyStroke} from '../photoMarks.ts';
import {bounds, isShapeLine, mid, railBend, railPts, snapTo} from './model.ts';
import {isLineShapeType, shapeDef} from './shapes.ts';
import {bboxOf, edgeMoved, freeMoved, inPoly, isOrtho, movedPts, pointAdded, polyArea, polyEdges, scaledPts, shapeOf, snapPt, turnedPts, vertexMoved} from './poly.ts';
import type {MItem, MKind, Module, Rot} from './model.ts';

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
  // 手すり：straight＝横棒（いつもまっすぐ。横か縦）、free＝自在棒（なぞって曲げる。ユーザーの指示「横棒、自在棒（線は真っ直ぐ）」2026-11-10）。
  // どちらもないもの（左の「横手すり」）は自在棒と同じ
  | {t: 'rail'; place?: string; len?: number; lshape?: boolean; straight?: boolean; free?: boolean}
  | {t: 'vrail'; place?: string}
  | {t: 'step'; type: string; place?: string; fill?: boolean} // fill＝塗りつぶしの四角（横四角）
  | {t: 'num'; place?: string}
  | {t: 'text'}
  | {t: 'line'; type: '壁' | '細線'}
  | {t: 'dim'}
  | {t: 'shape'; type: ShapeType};

/** 図形（Excel と同じ。上の段の「図形 ▼」の一覧。shapes.ts） */
export type ShapeType = string;
/** 図形の色（赤・青・黒・緑） */
export const SHAPE_COLORS: {name: string; hex: string}[] = [
  {name: '赤', hex: '#e01b24'},
  {name: '青', hex: '#1d4ed8'},
  {name: '黒', hex: '#111827'},
  {name: '緑', hex: '#15803d'},
];

/** ドラッグで大きさ・長さを決める道具（ほかは押した所に置く） */
export const DRAG_TOOLS: Tool['t'][] = ['room', 'stair', 'rail', 'vrail', 'step', 'line', 'dim', 'shape'];

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
 * 曲げた手すりの点を整える：同じ点・同じ向きにまっすぐ続く途中の点を除く。2点ならまっすぐの手すり（pts なし）、3点より多ければ pts。
 * x・y・w・h は1本目（始めの点から次の点まで）。L 字の len・turn は使わない（点で持つ）
 */
export function railFrom(it: MItem, pts: P[]): MItem {
  const out: P[] = [];
  for (const q of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(q.x - last.x, q.y - last.y) < 1) continue;
    out.push({x: q.x, y: q.y});
  }
  for (let i = 1; i < out.length - 1; ) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
    const l = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (l && Math.abs(cross) / l < 0.01 && dot > 0) out.splice(i, 1);
    else i++;
  }
  if (out.length < 2) return it;
  const {pts: _p, len: _l, turn: _t, ...rest} = it;
  const [a, b] = out;
  return {...rest, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, ...(out.length >= 3 ? {pts: out} : {})};
}

/**
 * なぞった道から、曲がり角のある手すり（ユーザーの指示「横棒とL字など、自由自在に曲げれる棒（線は真っ直ぐ）」2026-11-10）：
 * 道を間引いて曲がり角だけを残し（線はまっすぐ）、区間は線と同じく横・縦・45° にそろえ、点は 50mm にそろえる。
 * 横・縦の区間が壁の近く（250mm 以内）を通るときは壁ぞいに。はじめ・終わりの短いはね（指を離すときのゆれ）は除く。tol＝間引く幅（mm）
 */
export function railPolyline(path: P[], ws: Wall[], tol: number): P[] {
  const s = simplifyStroke(path, tol);
  const out: P[] = [];
  for (const q0 of s) {
    const last = out[out.length - 1];
    let q = {x: snapTo(q0.x, 50), y: snapTo(q0.y, 50)};
    if (last) {
      const dx = q.x - last.x;
      const dy = q.y - last.y;
      const ang = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
      const a45 = Math.min(ang, 180 - ang);
      if (a45 < 22.5) q = {x: q.x, y: last.y};
      else if (a45 > 67.5) q = {x: last.x, y: q.y};
      else {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        q = {x: last.x + Math.sign(dx) * m, y: last.y + Math.sign(dy) * m};
      }
      if (q.x === last.x && q.y === last.y) continue;
    }
    out.push(q);
  }
  const short = Math.max(150, tol * 1.5);
  const segLen = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
  while (out.length > 2 && segLen(out[out.length - 2], out[out.length - 1]) < short) out.pop();
  while (out.length > 2 && segLen(out[0], out[1]) < short) out.shift();
  const off = HALF_WALL + 50;
  for (let i = 0; i < out.length - 1; i++) {
    const [a, b] = [out[i], out[i + 1]];
    const horiz = a.y === b.y;
    if (!horiz && a.x !== b.x) continue;
    const near = nearestWall(
      ws.filter((w) => w.h === horiz),
      {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
      250,
    );
    if (!near) continue;
    const at = near.w.at + near.side * off;
    if (horiz) a.y = b.y = at;
    else a.x = b.x = at;
  }
  return out;
}

/** 点が横・縦だけで曲がる L 字（3点）か */
const isOrthoL = (pts: P[]) => pts.length === 3 && pts.slice(1).every((q, i) => q.x === pts[i].x || q.y === pts[i].y);

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

export function makeItem(tool: Tool, a: P, b: P, clickOnly: boolean, ctx: {items: MItem[]; module: Module; step: number; path?: P[]; tol?: number}): MItem | null {
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
      // 横棒：なぞっても曲げない（横か縦のまっすぐ。押しただけなら 600mm）
      if (tool.straight) return {id: mid(), kind: 'rail', ...railLine(a, b, ws, clickOnly, tool.len ?? 600), ...(tool.place ? {place: tool.place} : {})};
      // なぞった道が2回より多く曲がっていれば（コ字・クランクなど）、曲がり角のある棒。ななめ（45°）の区間があるときも
      if (!clickOnly && ctx.path && ctx.path.length >= 3 && !tool.lshape) {
        const pts = railPolyline(ctx.path, ws, ctx.tol ?? 120);
        if (pts.length >= 4 || (pts.length === 3 && !isOrthoL(pts)) || (pts.length === 2 && pts[0].x !== pts[1].x && pts[0].y !== pts[1].y)) {
          return railFrom({id: mid(), kind: 'rail', x: 0, y: 0, w: 0, h: 0, ...(tool.place ? {place: tool.place} : {})}, pts);
        }
      }
      // なぞった道が角で曲がっていれば L 字（一筆）。「L型手すり」の道具は、まっすぐなぞっても下（右）へ 600mm 曲げる
      const l = !clickOnly && ctx.path ? railStroke(a, b, ctx.path, ws) : railLine(a, b, ws, clickOnly, tool.len ?? 600);
      return {id: mid(), kind: 'rail', ...l, ...(tool.place ? {place: tool.place} : {}), ...(tool.lshape && !('turn' in l && l.turn) ? {len: 600, turn: 1 as const} : {})};
    }
    case 'vrail': {
      // 丸（縦手すり）：なぞると、その大きさ・形（だ円）。押しただけなら決まった大きさで壁ぎわに
      if (!clickOnly) {
        const w = Math.max(40, snapTo(Math.abs(b.x - a.x), 10));
        const h = Math.max(40, snapTo(Math.abs(b.y - a.y), 10));
        return {id: mid(), kind: 'vrail', x: snapTo((a.x + b.x) / 2, 10), y: snapTo((a.y + b.y) / 2, 10), w, h, len: 800, ...(tool.place ? {place: tool.place} : {})};
      }
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
      return {id: mid(), kind: 'step', type: def.name, ...r, ...(tool.place ? {place: tool.place} : {}), ...(tool.fill ? {fill: true} : {})};
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
      if (isLineShapeType(tool.type)) {
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

/** p がその部品の上か（部屋のほか。tol は線をつかめる幅 mm） */
export function hitsItem(it: MItem, p: P, tol: number): boolean {
  if (it.kind === 'text') return inBox(p, textBox(it), tol / 2);
  if (it.kind === 'num' || it.kind === 'vrail') return Math.hypot(p.x - it.x, p.y - it.y) <= Math.max(160, tol, Math.max(it.w, it.h) / 2 + tol / 2);
  if (it.kind === 'rail') {
    const pts = railPts(it);
    return pts.slice(1).some((q, i) => segDist(p, pts[i], q) <= Math.max(tol, 60));
  }
  if (it.kind === 'line' || it.kind === 'dim' || isShapeLine(it)) return segDist(p, it, {x: it.x + it.w, y: it.y + it.h}) <= Math.max(tol, it.kind === 'line' ? 40 : 60);
  if (it.kind === 'room') return it.pts ? inPoly(p, it.pts) : inBox(p, it);
  if (it.kind === 'shape' && it.pts && it.pts.length >= 3) {
    const pts = it.pts;
    return inPoly(p, pts) || pts.some((a, i) => segDist(p, a, pts[(i + 1) % pts.length]) <= Math.max(tol, 60));
  }
  return inBox(p, bounds(it), it.kind === 'door' || it.kind === 'window' ? 0 : tol / 3);
}

/** 押した所の部品（上に描いてあるものを先に。部屋は中にいちばん小さい部屋）。tol は線をつかめる幅（mm） */
export function hitTest(items: MItem[], p: P, tol: number): MItem | null {
  const order: MItem['kind'][][] = [['text', 'num'], ['shape'], ['rail', 'vrail'], ['door', 'window'], ['step'], ['fix', 'stair'], ['line', 'dim']];
  for (const kinds of order) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (kinds.includes(it.kind) && hitsItem(it, p, tol)) return it;
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

/** 頂点の編集ができる部品（部屋・箱の図形。ユーザーの指示「頂点で編集できるようにもする」2026-11-10） */
export const canVertexEdit = (it: MItem | null | undefined): it is MItem => !!it && (it.kind === 'room' || (it.kind === 'shape' && !isShapeLine(it) && !shapeDef(it.type)?.open));

/**
 * vertex＝頂点の編集のあいだ：頂点（■。動かす・ダブルタップで消す）と辺のまん中（□。つまむと頂点が増える）。ほかの頂点は動かない。
 * 頂点の編集でななめにした形（部屋・図形）は、ふだんは囲む四角の四隅・四辺（のびちぢみ）
 */
export function handlesOf(it: MItem, vertex = false): {h: Handle; x: number; y: number}[] {
  if (vertex && (it.kind === 'room' || it.kind === 'shape') && it.pts && it.pts.length >= 3) {
    const pts = it.pts;
    return [
      ...pts.map((p, i) => ({h: `v${i}` as Handle, x: p.x, y: p.y})),
      ...pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return {h: `e${i}` as Handle, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2};
      }),
    ];
  }
  if (it.kind === 'room' && it.pts && isOrtho(it.pts)) {
    const pts = it.pts;
    return [
      ...pts.map((p, i) => ({h: `v${i}` as Handle, x: p.x, y: p.y})),
      ...pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return {h: `e${i}` as Handle, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2};
      }),
    ];
  }
  // 手すり：曲がり角のある棒は点ごと（■）、まっすぐの棒は両端。どちらも区間のまん中（□）をつまむと、そこで曲がる（新しい角）
  if (it.kind === 'rail' && (it.pts || railBend(it))) {
    const pts = railPts(it);
    return [
      ...pts.map((q, i) => ({h: `v${i}` as Handle, x: q.x, y: q.y})),
      ...pts.slice(1).map((q, i) => ({h: `e${i}` as Handle, x: (pts[i].x + q.x) / 2, y: (pts[i].y + q.y) / 2})),
    ];
  }
  if (it.kind === 'rail' || it.kind === 'line' || it.kind === 'dim' || isShapeLine(it)) {
    return [
      {h: 'p0', x: it.x, y: it.y},
      {h: 'p1', x: it.x + it.w, y: it.y + it.h},
      ...(it.kind === 'rail' ? [{h: 'e0' as Handle, x: it.x + it.w / 2, y: it.y + it.h / 2}] : []),
    ];
  }
  if (it.kind === 'room' || it.kind === 'stair' || it.kind === 'step' || it.kind === 'fix' || it.kind === 'shape' || it.kind === 'vrail') {
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
export function resized(it: MItem, h: Handle, p: P, step: number, vertex = false): MItem {
  // 頂点の編集：頂点だけを動かす・辺のまん中をつまむと頂点を足す（10mm にそろえる）
  if (vertex && it.pts && it.pts.length >= 3 && /^[ve]\d+$/.test(h)) {
    const i = Number(h.slice(1));
    const q = {x: snapTo(p.x, 10), y: snapTo(p.y, 10)};
    const pts = h[0] === 'v' ? freeMoved(it.pts, i, q) : pointAdded(it.pts, i, q);
    return {...it, ...bboxOf(pts), pts};
  }
  // 頂点で作った形（ななめの辺のある部屋・頂点の編集にした図形）の四隅・四辺：囲む四角ごとのびちぢみ
  if ((it.kind === 'room' || it.kind === 'shape') && it.pts && it.pts.length >= 3 && (it.kind === 'shape' || !isOrtho(it.pts)) && !/^[ve]\d+$/.test(h)) {
    const b = bboxOf(it.pts);
    let x0 = b.x;
    let y0 = b.y;
    let x1 = b.x + b.w;
    let y1 = b.y + b.h;
    if (h.includes('w')) x0 = Math.min(snapTo(p.x, 10), x1 - 50);
    if (h.includes('e')) x1 = Math.max(snapTo(p.x, 10), x0 + 50);
    if (h.includes('n')) y0 = Math.min(snapTo(p.y, 10), y1 - 50);
    if (h.includes('s')) y1 = Math.max(snapTo(p.y, 10), y0 + 50);
    const pts = scaledPts(it.pts, b, {x: x0, y: y0, w: x1 - x0, h: y1 - y0});
    return {...it, ...bboxOf(pts), pts};
  }
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
  // 手すりの点（■）を動かす・区間のまん中（□）をつまんで曲げる。となりの点と横・縦に近ければ（8° まで）そろえる
  if (it.kind === 'rail' && /^[ve]\d+$/.test(h)) {
    const pts = railPts(it).map((q) => ({...q}));
    const i = Number(h.slice(1));
    const q = {x: snapTo(p.x, 50), y: snapTo(p.y, 50)};
    const k = h[0] === 'e' ? i + 1 : i;
    if (h[0] === 'e') pts.splice(k, 0, q);
    else if (pts[k]) pts[k] = q;
    else return it;
    for (const nb of [pts[k - 1], pts[k + 1]]) {
      if (!nb) continue;
      if (Math.abs(q.y - nb.y) <= Math.abs(q.x - nb.x) * 0.14) q.y = nb.y;
      else if (Math.abs(q.x - nb.x) <= Math.abs(q.y - nb.y) * 0.14) q.x = nb.x;
    }
    return railFrom(it, pts);
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
  // 丸（縦手すり）は x・y がまん中。大きさ・形（だ円）を変える
  if (it.kind === 'vrail') return {...it, x: box.x + box.w / 2, y: box.y + box.h / 2, w: Math.max(40, box.w), h: Math.max(40, box.h)};
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
  if (it.kind === 'rail') {
    const x = snapTo(it.x + d.x, 10);
    const y = snapTo(it.y + d.y, 10);
    return {...it, x, y, ...(it.pts ? {pts: movedPts(it.pts, x - it.x, y - it.y)} : {})};
  }
  if (it.kind === 'line') return {...it, x: snapTo(it.x + d.x, step / 2), y: snapTo(it.y + d.y, step / 2)};
  const x = snapTo(it.x + d.x, 10);
  const y = snapTo(it.y + d.y, 10);
  return {...it, x, y, ...(it.pts ? {pts: movedPts(it.pts, x - it.x, y - it.y)} : {})}; // 頂点の編集にした図形は頂点も一緒に
}

/** 90°回す：部屋は縦横を入れかえ（まん中のまま）、設備・階段・段差の解消は右回り、線の部品はまん中で、ドア・窓は開く向きを回す */
export function turnedItem(it: MItem, step: number): MItem {
  if (it.kind === 'room' && it.pts) return {...it, ...shapeOf(turnedPts(it.pts, step))};
  if (it.kind === 'room') {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    return {...it, x: snapTo(cx - it.h / 2, step), y: snapTo(cy - it.w / 2, step), w: it.h, h: it.w};
  }
  if (it.kind === 'rail' && it.pts) return railFrom(it, turnedPts(it.pts, 10));
  if (it.kind === 'shape' && it.pts) {
    const pts = turnedPts(it.pts, 10);
    return {...it, ...bboxOf(pts), pts};
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

/** ぐしゃぐしゃに書いて消せる部品（線・図形・寸法線・手すり・番号・文字・段差の解消。部屋・建具・窓・設備・階段は消さない） */
export const ERASABLE: MKind[] = ['line', 'dim', 'shape', 'rail', 'vrail', 'num', 'text', 'step'];

/**
 * ぐしゃぐしゃの道（mm）が上を通った部品（ユーザーの指示「グジャグジャってすると線や図形は消せる」2026-11-10。写真の書き込みのペンと同じしぐさ）。
 * 速く書くと点がまばらなので、点のあいだも tol の半分ごとに見る
 */
export function scribbleHits(items: MItem[], path: P[], tol: number): string[] {
  const dense = path.flatMap((q, i) => {
    const o = path[i - 1];
    if (!o) return [q];
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - o.x, q.y - o.y) / Math.max(1, tol / 2)));
    return Array.from({length: n}, (_, j) => ({x: o.x + ((q.x - o.x) * (j + 1)) / n, y: o.y + ((q.y - o.y) * (j + 1)) / n}));
  });
  return items.filter((it) => ERASABLE.includes(it.kind) && dense.some((q) => hitsItem(it, q, tol))).map((it) => it.id);
}

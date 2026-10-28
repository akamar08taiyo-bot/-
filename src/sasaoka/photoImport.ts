// 取り込んだ申請書（Excel）の写真貼付用紙・平面図の写真と、写真の上に Excel で描いた図形を読む
// （ユーザーの指示「申請書などを取り込んだときに、一括で写真などもと取り込めるようにする」2026-10-28）。
// 写真貼付用紙は改修前・改修後の枠ごと、平面図は図の枠（`ShinseiSheet.plan`）ごとに、枠に重なる写真（1枚とはかぎらない。回した・切り抜いた写真も）と、
// 直線・矢印・四角形・楕円・テキストボックス・フリーフォーム（線をつないだ図形。手すりの位置を黄色の線で描くなど）を読む。
// 枠の写真は、ブラウザで1枚の写真にまとめて（DocImport.tsx の composeFrame）、その写真番号の箇所の写真にする。図形は写真への書き込み（photoMarks.ts）にする
// （フリーフォームは1本ずつの直線に分ける）。原本に残っている文字のないテキストボックス・線も塗りもない図形・このアプリが書いた「改修前の説明」は読まない。
// ここは xlsx を読むだけ（画面・canvas は使わない）。お客様の写真はこの端末の中だけで扱う

import {strFromU8, unzipSync} from 'fflate';
import {attrOf, cellText, EMU, photoSheets, rangeBox, resolvePath, SHINSEI, sharedStrings, sheetLayout, sheetPaths, unesc} from './shinsei.ts';
import type {Box, Files, ShinseiMap, ShinseiSheet, SheetLayout} from './shinsei.ts';
import {photoNumbers} from './estimateForms.ts';
import type {EstimateRates} from './calc.ts';
import {cleanMarks, DASHES, rotatedBounds} from './photoMarks.ts';
import type {Insurer, Job, PhotoMark, PhotoMarkDash} from './types.ts';

/** 枠に重なる写真1枚：box は回す前の四角（画素・シートの左上から）、rot は右回りの角度、crop は切り抜き（0〜1。左・上・右・下） */
export type FramePic = {bytes: Uint8Array; type: string; box: Box; rot: number; flipH: boolean; flipV: boolean; crop: {l: number; t: number; r: number; b: number}};
/** 枠に重なる図形（書き込み）：位置はシートの画素（直線は始点・終点、ほかは回す前の四角の左上・右下） */
export type SheetMark = Omit<PhotoMark, 'id'>;
/** 1つの枠（写真貼付用紙の写真番号の改修前・改修後、平面図）の写真と書き込み。date は撮影日の欄の文字（あれば） */
export type FramePhotos = {photo: number; slot: 'before' | 'after' | 'plan'; frame: Box; pics: FramePic[]; marks: SheetMark[]; date: string};

const IMAGE_TYPE: Record<string, string> = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp'};

/** 申請書（4つの保険者の原本の形）の写真。insurer は readShinseiBook が見分けた保険者。写真のある枠だけ */
export function readShinseiPhotos(bytes: Uint8Array, insurer: Insurer): FramePhotos[] {
  const map = SHINSEI[insurer];
  if (!map) return [];
  let files: Files;
  try {
    files = unzipSync(bytes);
  } catch {
    return [];
  }
  return framesOf(files, map);
}

function framesOf(files: Files, map: ShinseiMap): FramePhotos[] {
  const paths = sheetPaths(files);
  const theme = themeOf(files);
  const shared = sharedStrings(files);
  const out: FramePhotos[] = [];
  const frames: {sheet: ShinseiSheet; photo: number; slot: FramePhotos['slot']; range: string; date?: string}[] = [];
  for (const [n, sheet] of photoSheets(files, map)) {
    const pp = sheet.photoPlace!;
    for (const slot of ['before', 'after'] as const) if (pp[slot]) frames.push({sheet, photo: n, slot, range: pp[slot]!, date: pp.dates?.[slot]});
  }
  for (const sheet of map.sheets) if (sheet.plan) frames.push({sheet, photo: 0, slot: 'plan', range: sheet.plan});
  const shapes = new Map<string, {lay: SheetLayout; items: Shape[]}>();
  for (const f of frames) {
    const path = paths.get(f.sheet.sheet);
    if (!path || !files[path]) continue;
    if (!shapes.has(path)) {
      const xml = strFromU8(files[path]);
      const lay = sheetLayout(xml);
      shapes.set(path, {lay, items: drawingShapes(files, path, xml, lay, theme)});
    }
    const {lay, items} = shapes.get(path)!;
    const frame = rangeBox(lay, f.range);
    const inside = (b: Box) => {
      const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
      return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
    };
    const pics = items.flatMap((s) => (s.pic && inside(rotatedBounds(s.pic.box, s.pic.rot)) ? [s.pic] : []));
    if (pics.length === 0) continue;
    const marks = items.flatMap((s) => s.marks.filter((m) => inside(sheetMarkBounds(m))));
    const date = f.date ? cellText(strFromU8(files[path]), f.date, shared).replace(/^撮影日[\s\u3000]*/, '').trim() : '';
    out.push({photo: f.photo, slot: f.slot, frame, pics, marks, date});
  }
  return out;
}

/** 書き込みの外側の四角（シートの画素） */
export function sheetMarkBounds(m: SheetMark): Box {
  if (m.kind === 'line') return {x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1)};
  return rotatedBounds({x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1)}, m.rot ?? 0);
}

// ---------------------------------------------------------------- 図形のファイルを読む

type Shape = {pic: FramePic | null; marks: SheetMark[]};
/** 図形の置き場所の変換：xfrm の EMU の四角 → シートの画素の四角（Excel の列の幅とこのアプリの列の幅の差は、置き場所（from・to）のまん中にそろえて消す） */
type Place = (off: {x: number; y: number}, ext: {w: number; h: number}) => Box;

function drawingShapes(files: Files, sheetPath: string, sheetXml: string, lay: SheetLayout, theme: Theme): Shape[] {
  const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const rid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheetXml)?.[1];
  if (!rid || !files[relsPath]) return [];
  const rel = [...strFromU8(files[relsPath]).matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attrOf(r, 'Id') === rid);
  const target = rel && attrOf(rel, 'Target');
  if (!target) return [];
  const drawing = resolvePath(sheetPath, target);
  if (!files[drawing]) return [];
  const dRels = drawing.replace(/([^/]+)$/, '_rels/$1.rels');
  const media = new Map<string, string>();
  if (files[dRels]) for (const m of strFromU8(files[dRels]).matchAll(/<Relationship\b[^>]*>/g)) media.set(attrOf(m[0], 'Id') ?? '', resolvePath(drawing, attrOf(m[0], 'Target') ?? ''));
  const out: Shape[] = [];
  for (const a of strFromU8(files[drawing]).matchAll(/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
    const anchor = a[0];
    const at = anchorBox(lay, a[1], anchor);
    for (const el of elements(anchor.replace(/^<xdr:\w+\b[^>]*>/, ''))) {
      const xf = xfrmOf(el.xml);
      if (!xf) continue;
      // 置き場所（from・to）のまん中に、図形のまん中をそろえる（回した図形も、置き場所のまん中は図形のまん中）
      const [cx, cy] = at ? [at.x + at.w / 2, at.y + at.h / 2] : [(xf.x + xf.w / 2) / EMU, (xf.y + xf.h / 2) / EMU];
      const dx = cx - (xf.x + xf.w / 2) / EMU;
      const dy = cy - (xf.y + xf.h / 2) / EMU;
      const place: Place = (off, ext) => ({x: off.x / EMU + dx, y: off.y / EMU + dy, w: ext.w / EMU, h: ext.h / EMU});
      out.push(...shapesOf(el, place, files, media, theme));
    }
  }
  return out;
}

/** 置き場所（twoCellAnchor の from・to／oneCellAnchor の from と大きさ／absoluteAnchor の位置と大きさ）の四角（画素） */
function anchorBox(lay: SheetLayout, kind: string, xml: string): Box | null {
  const n = (tag: string, part: string) => {
    const m = new RegExp(`<xdr:${part}>[\\s\\S]*?<xdr:${tag}>(-?\\d+)</xdr:${tag}>`).exec(xml);
    return m ? Number(m[1]) : 0;
  };
  const at = (part: string) => {
    let [x, y] = [0, 0];
    for (let k = 1; k <= n('col', part); k++) x += lay.colW(k);
    for (let k = 1; k <= n('row', part); k++) y += lay.rowH(k);
    return {x: x + n('colOff', part) / EMU, y: y + n('rowOff', part) / EMU};
  };
  const ext = /<xdr:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xml);
  if (kind === 'twoCellAnchor') {
    const [p, q] = [at('from'), at('to')];
    return {x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y};
  }
  if (kind === 'oneCellAnchor' && ext) {
    const p = at('from');
    return {x: p.x, y: p.y, w: Number(ext[1]) / EMU, h: Number(ext[2]) / EMU};
  }
  const pos = /<xdr:pos\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(xml);
  if (pos && ext) return {x: Number(pos[1]) / EMU, y: Number(pos[2]) / EMU, w: Number(ext[1]) / EMU, h: Number(ext[2]) / EMU};
  return null;
}

type Xfrm = {x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean; ch?: {x: number; y: number; w: number; h: number}};

/** 図形の位置・大きさ・角度（EMU。最初の a:xfrm＝その図形のもの。グループは子の座標 chOff・chExt も） */
function xfrmOf(xml: string): Xfrm | null {
  const m = /<a:xfrm\b([^>]*)>([\s\S]*?)<\/a:xfrm>/.exec(xml);
  if (!m) return null;
  const off = /<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(m[2]);
  const ext = /<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(m[2]);
  if (!off || !ext) return null;
  const chOff = /<a:chOff\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(m[2]);
  const chExt = /<a:chExt\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(m[2]);
  return {
    x: Number(off[1]),
    y: Number(off[2]),
    w: Number(ext[1]),
    h: Number(ext[2]),
    rot: Number(attrOf(m[0], 'rot') ?? 0) / 60000,
    flipH: attrOf(m[0], 'flipH') === '1',
    flipV: attrOf(m[0], 'flipV') === '1',
    ...(chOff && chExt ? {ch: {x: Number(chOff[1]), y: Number(chOff[2]), w: Number(chExt[1]), h: Number(chExt[2])}} : {}),
  };
}

/** 図形の XML のうち、すぐ下の段の図形（写真・図形・線・グループ）。同じ名前の入れ子も数えて閉じる所を探す */
function elements(xml: string): {tag: string; xml: string}[] {
  const out: {tag: string; xml: string}[] = [];
  const open = /<xdr:(pic|sp|cxnSp|grpSp)\b/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    const tag = m[1];
    const re = new RegExp(`<xdr:${tag}\\b|</xdr:${tag}>`, 'g');
    re.lastIndex = m.index + 1;
    let depth = 1;
    let end = -1;
    let k: RegExpExecArray | null;
    while ((k = re.exec(xml))) {
      depth += k[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = k.index + k[0].length;
        break;
      }
    }
    if (end < 0) break;
    out.push({tag, xml: xml.slice(m.index, end)});
    open.lastIndex = end;
  }
  return out;
}

function shapesOf(el: {tag: string; xml: string}, place: Place, files: Files, media: Map<string, string>, theme: Theme): Shape[] {
  const xf = xfrmOf(el.xml);
  if (!xf) return [];
  const box = place({x: xf.x, y: xf.y}, {w: xf.w, h: xf.h});
  if (el.tag === 'grpSp') {
    // グループ：子の座標（chOff・chExt）をグループの四角に写す（グループを回していれば、子の角度に足す）
    const ch = xf.ch ?? {x: xf.x, y: xf.y, w: xf.w, h: xf.h};
    const inner = el.xml.replace(/^<xdr:grpSp\b[^>]*>/, '').replace(/<xdr:grpSpPr\b[\s\S]*?<\/xdr:grpSpPr>/, '');
    const kx = ch.w ? box.w / ch.w : 1;
    const ky = ch.h ? box.h / ch.h : 1;
    const child: Place = (off, ext) => ({x: box.x + (off.x - ch.x) * kx, y: box.y + (off.y - ch.y) * ky, w: ext.w * kx, h: ext.h * ky});
    return elements(inner).flatMap((c) => shapesOf(c, child, files, media, theme).map((s) => (xf.rot ? turnShape(s, box, xf.rot) : s)));
  }
  if (el.tag === 'pic') {
    const id = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(el.xml)?.[1];
    const path = id ? media.get(id) : undefined;
    const type = IMAGE_TYPE[(path ?? '').split('.').pop()?.toLowerCase() ?? ''];
    if (!path || !type || !files[path] || box.w <= 0 || box.h <= 0) return [];
    const src = /<a:srcRect\b[^>]*>/.exec(el.xml)?.[0] ?? '';
    const crop = (k: string) => Math.min(0.95, Math.max(0, Number(attrOf(src, k) ?? 0) / 100000));
    return [{pic: {bytes: files[path], type, box, rot: xf.rot, flipH: xf.flipH, flipV: xf.flipV, crop: {l: crop('l'), t: crop('t'), r: crop('r'), b: crop('b')}}, marks: []}];
  }
  // このアプリが書いた「改修前の説明」（写真に書く内容。取り込むと自動の文で書き直す）は読まない
  if (/<xdr:cNvPr\b[^>]*name="改修前の説明/.test(el.xml)) return [];
  return [{pic: null, marks: marksOf(el, box, xf, theme)}];
}

/** グループを回したとき：子の図形をグループのまん中で回す */
function turnShape(s: Shape, group: Box, deg: number): Shape {
  const [cx, cy] = [group.x + group.w / 2, group.y + group.h / 2];
  const t = (deg * Math.PI) / 180;
  const turn = (x: number, y: number) => [cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t)];
  const moveBox = (b: Box): Box => {
    const [x, y] = turn(b.x + b.w / 2, b.y + b.h / 2);
    return {x: x - b.w / 2, y: y - b.h / 2, w: b.w, h: b.h};
  };
  return {
    pic: s.pic && {...s.pic, box: moveBox(s.pic.box), rot: s.pic.rot + deg},
    marks: s.marks.map((m) => {
      if (m.kind === 'line') {
        const [x1, y1] = turn(m.x1, m.y1);
        const [x2, y2] = turn(m.x2, m.y2);
        return {...m, x1, y1, x2, y2};
      }
      const b = moveBox({x: m.x1, y: m.y1, w: m.x2 - m.x1, h: m.y2 - m.y1});
      return {...m, x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h, rot: ((m.rot ?? 0) + deg) % 360};
    }),
  };
}

// ---------------------------------------------------------------- 図形 → 書き込み

const LINE_GEOMS = new Set(['line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'curvedConnector3']);
const ARROW = (end: string) => !!end && !/type="none"/.test(end);

function marksOf(el: {tag: string; xml: string}, box: Box, xf: Xfrm, theme: Theme): SheetMark[] {
  const xml = el.xml;
  const spPr = /<xdr:spPr\b[\s\S]*?<\/xdr:spPr>/.exec(xml)?.[0] ?? '';
  const style = /<xdr:style\b[\s\S]*?<\/xdr:style>/.exec(xml)?.[0] ?? '';
  const lnXml = /<a:ln\b[^>]*?(?:\/>|>[\s\S]*?<\/a:ln>)/.exec(spPr)?.[0] ?? '';
  const line = lineOf(lnXml, style, theme);
  const geom = /<a:prstGeom\b[^>]*prst="([^"]+)"/.exec(spPr)?.[1] ?? (/<a:custGeom\b/.test(spPr) ? 'cust' : 'rect');
  const dash = (/<a:prstDash\b[^>]*val="([^"]+)"/.exec(lnXml)?.[1] ?? 'solid') as PhotoMarkDash;
  const base = {line: line.color, width: line.width, dash: DASHES.some((d) => d.key === dash) ? dash : ('solid' as PhotoMarkDash), fill: '', size: 11, color: '000000'};
  const head = ARROW(/<a:headEnd\b[^>]*>/.exec(lnXml)?.[0] ?? '');
  const tail = ARROW(/<a:tailEnd\b[^>]*>/.exec(lnXml)?.[0] ?? '');
  // 直線：四角の左上 → 右下（左右・上下の反転で向きが変わる）。回していれば、まん中で回す
  const ends = (p: [number, number][]): [number, number][] => {
    const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
    const t = (xf.rot * Math.PI) / 180;
    return p.map(([u, v]) => {
      const x = box.x + (xf.flipH ? 1 - u : u) * box.w;
      const y = box.y + (xf.flipV ? 1 - v : v) * box.h;
      return [cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t)];
    });
  };
  if (el.tag === 'cxnSp' || LINE_GEOMS.has(geom)) {
    if (!line.color) return [];
    const [[x1, y1], [x2, y2]] = ends([
      [0, 0],
      [1, 1],
    ]);
    return [{kind: 'line', x1, y1, x2, y2, ...base, ...(head ? {start: true} : {}), ...(tail ? {end: true} : {})}];
  }
  if (geom === 'cust') {
    // フリーフォーム：つないだ線を1本ずつの直線に（曲線は細かい直線に）。最初の線に始点の矢印、最後の線に終点の矢印
    if (!line.color) return [];
    const out: SheetMark[] = [];
    for (const path of pathsOf(spPr)) {
      const pts = ends(simplify(path, 0.004));
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1];
        const [x2, y2] = pts[i];
        if (Math.hypot(x2 - x1, y2 - y1) < 0.5) continue;
        out.push({kind: 'line', x1, y1, x2, y2, ...base});
      }
    }
    if (out.length > 0) {
      if (head) out[0].start = true;
      if (tail) out[out.length - 1].end = true;
    }
    return out.slice(0, 200);
  }
  // 四角形・楕円・テキストボックス（ほかの形は四角形）。文字・線・塗りのどれもない図形（原本に残っている空のテキストボックスなど）は読まない
  const fill = fillOf(spPr.replace(lnXml, ''), style, theme);
  const text = textOf(xml, theme);
  if (!text.text && !line.color && !fill) return [];
  const txBox = /<xdr:cNvSpPr\b[^>]*txBox="1"/.test(xml);
  const kind: SheetMark['kind'] = geom === 'ellipse' ? 'ellipse' : txBox || (!line.color && !fill && text.text) ? 'text' : 'rect';
  return [
    {
      kind,
      x1: box.x,
      y1: box.y,
      x2: box.x + box.w,
      y2: box.y + box.h,
      ...(xf.rot ? {rot: ((xf.rot % 360) + 360) % 360} : {}),
      ...base,
      fill,
      ...(text.text ? {text: text.text} : {}),
      size: text.size,
      color: text.color || fontColor(style, theme) || '000000',
      ...(text.bold ? {bold: true} : {}),
    },
  ];
}

/** フリーフォームの線（図形の四角の中の 0〜1 の点の並び）。moveTo で新しい線。close は最初の点に戻る */
function pathsOf(spPr: string): [number, number][][] {
  const cust = /<a:custGeom\b[\s\S]*?<\/a:custGeom>/.exec(spPr)?.[0] ?? '';
  const out: [number, number][][] = [];
  for (const pm of cust.matchAll(/<a:path\b([^>]*)>([\s\S]*?)<\/a:path>/g)) {
    const pw = Number(attrOf(`<a:path${pm[1]}>`, 'w') ?? 0);
    const ph = Number(attrOf(`<a:path${pm[1]}>`, 'h') ?? 0);
    if (!(pw > 0 && ph > 0)) continue;
    const guides = guidesOf(cust, pw, ph);
    const val = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : (guides.get(v) ?? 0));
    let cur: [number, number][] = [];
    let last: [number, number] = [0, 0];
    const at = (p: string): [number, number] => [val(attrOf(p, 'x') ?? '0') / pw, val(attrOf(p, 'y') ?? '0') / ph];
    for (const cmd of pm[2].matchAll(/<a:(moveTo|lnTo|cubicBezTo|quadBezTo|close)\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:\1>)/g)) {
      const pts = [...(cmd[2] ?? '').matchAll(/<a:pt\b[^>]*>/g)].map((p) => at(p[0]));
      if (cmd[1] === 'moveTo' && pts[0]) {
        if (cur.length > 1) out.push(cur);
        cur = [pts[0]];
        last = pts[0];
      } else if (cmd[1] === 'lnTo' && pts[0]) {
        cur.push(pts[0]);
        last = pts[0];
      } else if ((cmd[1] === 'cubicBezTo' && pts.length === 3) || (cmd[1] === 'quadBezTo' && pts.length === 2)) {
        const [p0, ...cp] = [last, ...pts];
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          const q = cp.length === 3 ? bez3(p0, cp[0], cp[1], cp[2], t) : bez2(p0, cp[0], cp[1], t);
          cur.push(q);
        }
        last = pts[pts.length - 1];
      } else if (cmd[1] === 'close' && cur.length > 1) {
        cur.push(cur[0]);
      }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

const bez3 = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
};
const bez2 = (a: [number, number], b: [number, number], c: [number, number], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
};

/** フリーフォームの点の名前（gd）の値。式は「*\/ a b c」（a×b÷c）・「+- a b c」（a＋b−c）・「val a」。w・h はパスの幅・高さ */
function guidesOf(cust: string, w: number, h: number): Map<string, number> {
  const g = new Map<string, number>([
    ['w', w],
    ['h', h],
    ['l', 0],
    ['t', 0],
    ['r', w],
    ['b', h],
    ['wd2', w / 2],
    ['hd2', h / 2],
  ]);
  const v = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : (g.get(s) ?? 0));
  for (const m of cust.matchAll(/<a:gd\b[^>]*name="([^"]+)"[^>]*fmla="([^"]+)"/g)) {
    const [op, a = '0', b = '0', c = '0'] = unesc(m[2]).trim().split(/\s+/);
    const val = op === '*/' ? (v(c) ? (v(a) * v(b)) / v(c) : 0) : op === '+-' ? v(a) + v(b) - v(c) : op === 'val' ? v(a) : 0;
    g.set(m[1], val);
  }
  return g;
}

/** 点の並びを、tol（0〜1 の長さ）より小さいずれの点を除いて減らす（フリーハンドの線が何百もの直線にならないように） */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let [far, at] = [0, 0];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > far) [far, at] = [d, i];
  }
  if (far <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** 図形の中の文字（段落を改行で）と、最初の文字の大きさ（pt）・色・太字 */
function textOf(xml: string, theme: Theme): {text: string; size: number; color: string; bold: boolean} {
  // 段落の中の改行（a:br）は改行の文字に
  const body = (/<xdr:txBody\b[\s\S]*?<\/xdr:txBody>/.exec(xml)?.[0] ?? '').replace(/<a:br\b[^>]*?(?:\/>|>[\s\S]*?<\/a:br>)/g, '<a:t>\n</a:t>');
  const paras = [...body.matchAll(/<a:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:p>)/g)].map((p) => [...(p[1] ?? '').matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => unesc(t[1])).join(''));
  while (paras.length && !paras[paras.length - 1].trim()) paras.pop();
  const text = paras.join('\n');
  const rPr = /<a:rPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:rPr>)/.exec(body)?.[0] ?? /<a:endParaRPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:endParaRPr>)/.exec(body)?.[0] ?? '';
  const sz = Number(attrOf(rPr, 'sz') ?? 0);
  const color = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(rPr)?.[1];
  return {text: text.trim() ? text : '', size: sz > 0 ? sz / 100 : 11, color: color ? (colorOf(color, theme) ?? '') : '', bold: attrOf(rPr, 'b') === '1'};
}

// ---------------------------------------------------------------- 色・線（テーマの色と、図形のスタイルの線・塗り）

type Theme = {colors: Record<string, string>; lineWidths: number[]};
const THEME_DEFAULT: Theme = {
  colors: {dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72'},
  lineWidths: [6350, 12700, 19050],
};
const SCHEME_ALIAS: Record<string, string> = {tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2'};
const PRESET: Record<string, string> = {black: '000000', white: 'FFFFFF', red: 'FF0000', yellow: 'FFFF00', blue: '0000FF', green: '008000', lime: '00FF00', orange: 'FFA500', gray: '808080'};

function themeOf(files: Files): Theme {
  const xml = files['xl/theme/theme1.xml'] ? strFromU8(files['xl/theme/theme1.xml']) : '';
  const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml)?.[0] ?? '';
  const colors = {...THEME_DEFAULT.colors};
  for (const m of scheme.matchAll(/<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g)) {
    const c = /srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/.exec(m[2])?.[1] ?? /sysClr\b[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(m[2])?.[1];
    if (c) colors[m[1]] = c.toUpperCase();
  }
  const lns = /<a:lnStyleLst>([\s\S]*?)<\/a:lnStyleLst>/.exec(xml)?.[1] ?? '';
  const widths = [...lns.matchAll(/<a:ln\b[^>]*w="(\d+)"/g)].map((m) => Number(m[1]));
  return {colors, lineWidths: widths.length ? widths : THEME_DEFAULT.lineWidths};
}

/** 色の XML（srgbClr・schemeClr・sysClr・prstClr と、明るさの調整 lumMod・lumOff・shade・tint）→ 'RRGGBB'。phClr はスタイルの色 */
function colorOf(xml: string, theme: Theme, ph?: string): string | null {
  const m = /<a:(srgbClr|schemeClr|sysClr|prstClr)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:\1>)/.exec(xml);
  if (!m) return null;
  const val = attrOf(m[0], 'val') ?? '';
  let hex =
    m[1] === 'srgbClr' ? val : m[1] === 'sysClr' ? (attrOf(m[0], 'lastClr') ?? '000000') : m[1] === 'prstClr' ? (PRESET[val] ?? '000000') : val === 'phClr' ? (ph ?? '000000') : (theme.colors[SCHEME_ALIAS[val] ?? val] ?? '000000');
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mods = m[3] ?? '';
  const num = (tag: string) => {
    const x = new RegExp(`<a:${tag}\\b[^>]*val="(\\d+)"`).exec(mods);
    return x ? Number(x[1]) / 100000 : null;
  };
  const [lumMod, lumOff, shade, tint] = [num('lumMod'), num('lumOff'), num('shade'), num('tint')];
  const each = (f: (c: number) => number) => ([r, g, b] = [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, f(c))))));
  if (lumMod !== null || lumOff !== null) each((c) => c * (lumMod ?? 1) + 255 * (lumOff ?? 0));
  if (shade !== null) each((c) => c * shade);
  if (tint !== null) each((c) => 255 - (255 - c) * tint);
  hex = [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
  return hex.toUpperCase();
}

/** 枠線の色と太さ（pt）。a:ln に noFill なら線なし。色がなければスタイルの線（lnRef。idx 0 は線なし） */
function lineOf(ln: string, style: string, theme: Theme): {color: string; width: number} {
  const ref = /<a:lnRef\b[^>]*idx="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/a:lnRef>)/.exec(style);
  const idx = Number(ref?.[1] ?? 0);
  const refColor = ref?.[2] ? colorOf(ref[2], theme) : null;
  const w = Number(attrOf(ln, 'w') ?? 0) || (idx > 0 ? (theme.lineWidths[idx - 1] ?? 12700) : 9525);
  const width = Math.round((w / 12700) * 100) / 100;
  const fill = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(ln)?.[1];
  if (!fill && /<a:noFill\s*\/>/.test(ln)) return {color: '', width};
  if (fill) return {color: colorOf(fill, theme, refColor ?? undefined) ?? '', width};
  return {color: idx > 0 && refColor ? refColor : '', width};
}

/** 塗りつぶしの色（spPr の a:ln を除いた所）。noFill なら塗りなし。なければスタイルの塗り（fillRef。idx 0 は塗りなし） */
function fillOf(spPr: string, style: string, theme: Theme): string {
  if (/<a:noFill\s*\/>/.test(spPr)) return '';
  const solid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(spPr)?.[1];
  const ref = /<a:fillRef\b[^>]*idx="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/a:fillRef>)/.exec(style);
  const refColor = ref?.[2] ? colorOf(ref[2], theme) : null;
  if (solid) return colorOf(solid, theme, refColor ?? undefined) ?? '';
  if (/<a:(gradFill|blipFill|pattFill)\b/.test(spPr)) return refColor ?? '';
  return Number(ref?.[1] ?? 0) > 0 && refColor ? refColor : '';
}

/** 文字の色（スタイルの fontRef の色） */
function fontColor(style: string, theme: Theme): string | null {
  const ref = /<a:fontRef\b[^>]*>([\s\S]*?)<\/a:fontRef>/.exec(style)?.[1];
  return ref ? colorOf(ref, theme) : null;
}

// ---------------------------------------------------------------- 様邸に入れる

/**
 * 枠の写真を1枚にまとめるときの範囲（シートの画素）と、その範囲の中の割合にした書き込み。範囲は写真（回した写真は外側の四角）と書き込みの全部を囲む四角を、
 * 枠の中に切ったもの（写真の横に書いた文字も、写真と一緒に動くように範囲に入れる。写真のない所は白）
 */
export function frameLayout(f: Pick<FramePhotos, 'frame' | 'pics' | 'marks'>): {region: Box; marks: PhotoMark[]} {
  const boxes = [...f.pics.map((p) => rotatedBounds(p.box, p.rot)), ...f.marks.map(sheetMarkBounds)];
  const x1 = Math.max(f.frame.x, Math.min(...boxes.map((b) => b.x)));
  const y1 = Math.max(f.frame.y, Math.min(...boxes.map((b) => b.y)));
  const x2 = Math.min(f.frame.x + f.frame.w, Math.max(...boxes.map((b) => b.x + b.w)));
  const y2 = Math.min(f.frame.y + f.frame.h, Math.max(...boxes.map((b) => b.y + b.h)));
  const region = {x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1)};
  const fx = (x: number) => (x - region.x) / region.w;
  const fy = (y: number) => (y - region.y) / region.h;
  return {region, marks: cleanMarks(f.marks.map((m) => ({...m, x1: fx(m.x1), y1: fy(m.y1), x2: fx(m.x2), y2: fy(m.y2)})))};
}

/** 端末に保存した枠の写真（写真の番号 id と書き込み・撮影日 'YYYY-MM-DD'） */
export type StoredFrame = {photo: number; slot: FramePhotos['slot']; id: string; marks: PhotoMark[]; date: string};

/** 枠の写真を入れる所：写真番号の箇所（なければ null）。平面図は様邸 */
function targetOf(job: Pick<Job, 'places'>, photo: number, rates: EstimateRates): string | null {
  for (const [id, n] of photoNumbers(job, rates)) if (n === photo) return id;
  return null;
}

/** まだ入っていない枠（写真番号の箇所があって、その改修前・改修後の写真が空。平面図は平面図の図が空）。前に取り込んだ申請書の写真だけを入れるときにも使う */
export function missingFrames<F extends Pick<FramePhotos, 'photo' | 'slot'>>(job: Pick<Job, 'places' | 'planPhoto'>, frames: F[], rates: EstimateRates): F[] {
  return frames.filter((f) => {
    if (f.slot === 'plan') return !job.planPhoto;
    const id = targetOf(job, f.photo, rates);
    const p = id ? job.places.find((q) => q.id === id) : undefined;
    return !!p && !p.photos?.[f.slot];
  });
}

/** 取り込んだ写真を様邸に入れる：空いている枠だけ（入っている写真・書き込み・撮影日は変えない） */
export function withImportedPhotos(job: Job, frames: StoredFrame[], rates: EstimateRates): Job {
  let out = job;
  for (const f of missingFrames(job, frames, rates)) {
    if (f.slot === 'plan') {
      out = {...out, planPhoto: f.id};
      continue;
    }
    const slot = f.slot;
    const id = targetOf(out, f.photo, rates);
    out = {
      ...out,
      places: out.places.map((p) =>
        p.id !== id || p.photos?.[slot]
          ? p
          : {
              ...p,
              photos: {...p.photos, [slot]: f.id},
              ...(f.marks.length ? {photoMarks: {...p.photoMarks, [slot]: f.marks}} : {}),
              ...(f.date && !p.photoDates?.[slot] ? {photoDates: {...p.photoDates, [slot]: f.date}} : {}),
            },
      ),
    };
  }
  return out;
}

// 平面図を SVG の文字にする（編集の画面・見取図の印刷・画像・Excel・申請書の平面図で同じ絵）。長さは mm のまま描く（viewBox が mm）。
// 見た目はいただいた見取図のテンプレートに合わせる：壁＝紺の太い線、フローリング＝橙の横じま、畳＝緑の畳割り、タイル＝青の目地、
// 手すり＝赤い線と両端の点・①②、ドア＝開く向きの弧、窓＝細い3本線

import {FINISH, roomFinish, roomType} from './catalog.ts';
import {bounds, circled, joLabel, lineLength, roomArea} from './model.ts';
import type {MItem, Module} from './model.ts';

export const WALL = '#203a55';
export const RED = '#e01b24';
const WALL_W = 60; // 壁の線の太さ（mm）

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 文字の幅（mm）の見積もり：全角 1、半角 0.6 文字ぶん */
export const textWidth = (s: string, size: number) => [...s].reduce((a, c) => a + (c.charCodeAt(0) < 0x2000 ? 0.6 : 1), 0) * size;

const FONT = "font-family=\"'BIZ UDPGothic','Meiryo','Hiragino Sans','Noto Sans JP',sans-serif\"";

/** 部屋の床の柄（部屋の四角の中だけ） */
function roomPattern(it: MItem, module: Module, pid: string): string {
  const f = roomFinish(it.type);
  const {x, y, w, h} = it;
  const c = FINISH[f];
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c.fill}"/>`;
  if (f === 'floor') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-floor)"/>`;
  else if (f === 'tile') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-tile)"/>`;
  else if (f === 'doma') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-doma)"/>`;
  else if (f === 'outside') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-out)"/>`;
  else if (f === 'wood') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-wood)"/>`;
  else if (f === 'void') s += `<path d="M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}" stroke="${c.line}" stroke-width="20" fill="none"/>`;
  else if (f === 'tatami') s += tatami(x, y, w, h, module, c.line);
  return s;
}

/**
 * 畳割り：1枚＝方眼の1マス×2マス。行ごとに縦横をずらして、4枚の角が1点に集まらないように（レンガ張り）。
 * 方眼に合わない大きさの部屋（半マスなど）は、余りを半畳にする
 */
export function tatami(x: number, y: number, w: number, h: number, module: Module, color: string): string {
  const cols = Math.max(1, Math.round(w / module));
  const rows = Math.max(1, Math.round(h / module));
  const cw = w / cols;
  const ch = h / rows;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    // 偶数の行は左から2マスずつ、奇数の行は半分ずらす（はじめを1マスに）
    let c = r % 2 === 0 ? 0 : 1;
    if (r % 2 === 1 && cols > 1) lines.push(`M${r1(x + cw)} ${r1(y + r * ch)}V${r1(y + (r + 1) * ch)}`);
    while (c < cols) {
      const end = Math.min(cols, c + 2);
      if (end < cols) lines.push(`M${r1(x + end * cw)} ${r1(y + r * ch)}V${r1(y + (r + 1) * ch)}`);
      c = end;
    }
    if (r > 0) lines.push(`M${r1(x)} ${r1(y + r * ch)}H${r1(x + w)}`);
  }
  return lines.length ? `<path d="${lines.join('')}" stroke="${color}" stroke-width="22" fill="none"/>` : '';
}

/** 部屋の名前と広さ（部屋の大きさに入るように字を小さくする） */
function roomLabel(it: MItem, module: Module, showArea: boolean): string {
  const name = (it.label?.trim() || it.type || '').trim();
  const area = roomArea(it.w, it.h, module);
  const areaText = showArea && roomFinish(it.type) !== 'void' && area.jo >= 0.5 ? `${joLabel(area.jo)}（${area.m2}㎡）` : '';
  if (!name && !areaText) return '';
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const maxW = Math.max(100, Math.abs(it.w) - 120);
  const fit = (s: string, size: number) => (s ? Math.min(size, (maxW / textWidth(s, 1)) * 0.95) : size);
  const ns = fit(name, 260);
  const as = fit(areaText, 170);
  const rows: string[] = [];
  const both = name && areaText && Math.abs(it.h) > ns + as + 80;
  if (name) rows.push(`<text x="${r1(cx)}" y="${r1(both ? cy - as * 0.35 : cy + ns * 0.35)}" font-size="${r1(ns)}" text-anchor="middle" fill="#1f2937">${esc(name)}</text>`);
  if (areaText && (both || !name)) rows.push(`<text x="${r1(cx)}" y="${r1(both ? cy + ns * 0.55 + as * 0.3 : cy + as * 0.35)}" font-size="${r1(as)}" text-anchor="middle" fill="#475569">${esc(areaText)}</text>`);
  return rows.join('');
}

/** 建具・窓（壁の上。rot 0 の形で描いて回す） */
function opening(it: MItem): string {
  const w = it.w;
  const half = w / 2;
  const rot = it.rot ?? 0;
  const side = it.flip ? -1 : 1; // 開く側（+y が下）
  const g: string[] = [];
  // 壁を切る（白で上から塗る）
  g.push(`<rect x="${-half}" y="${-WALL_W * 0.75}" width="${w}" height="${WALL_W * 1.5}" fill="#ffffff"/>`);
  const t = it.type ?? '';
  if (it.kind === 'window') {
    const lw = t === '掃き出し窓' ? 18 : 12;
    g.push(`<path d="M${-half} ${-WALL_W / 2}H${half}M${-half} ${WALL_W / 2}H${half}" stroke="${WALL}" stroke-width="${lw}"/>`);
    if (t === 'FIX窓') g.push(`<path d="M${-half} 0H${half}" stroke="${WALL}" stroke-width="12"/>`);
    else if (t === '小窓') g.push(`<path d="M${-half} 0H${half}" stroke="${WALL}" stroke-width="10"/>`);
    else g.push(`<path d="M${-half} ${-10}H${half * 0.1}M${-half * 0.1} ${10}H${half}" stroke="${WALL}" stroke-width="${lw + 6}"/>`);
    if (t === '掃き出し窓') g.push(`<path d="M${-half} ${side * 120}H${half}" stroke="${WALL}" stroke-width="8" stroke-dasharray="40 30"/>`);
  } else {
    const leaf = (hx: number, len: number, dir: 1 | -1, thick = 22) => {
      // 吊り元 (hx, 0) から開いた扉（壁に直角）と、閉じた位置までの弧
      const ex = hx;
      const ey = side * len;
      const cx2 = hx + dir * len;
      g.push(`<path d="M${hx} 0L${ex} ${ey}" stroke="${WALL}" stroke-width="${thick}"/>`);
      g.push(`<path d="M${ex} ${ey}A${len} ${len} 0 0 ${(dir === 1) === (side === 1) ? 0 : 1} ${cx2} 0" stroke="${WALL}" stroke-width="10" fill="none"/>`);
    };
    if (t === '両開き戸') {
      leaf(-half, half, 1);
      leaf(half, half, -1);
    } else if (t === '片引き戸') {
      g.push(`<path d="M${-half} ${-side * 18}H${half * 0.95}" stroke="${WALL}" stroke-width="26"/>`);
      g.push(`<path d="M${half} ${side * 18}H${half + w * 0.9}" stroke="${WALL}" stroke-width="10" stroke-dasharray="30 25"/>`);
      g.push(`<path d="M${-half * 0.4} ${side * 70}H${half * 0.4}M${half * 0.4 - 60} ${side * 70 - 40}L${half * 0.4} ${side * 70}L${half * 0.4 - 60} ${side * 70 + 40}" stroke="${WALL}" stroke-width="10" fill="none"/>`);
    } else if (t === '引違い戸') {
      g.push(`<path d="M${-half} ${-18}H${w * 0.06}M${-w * 0.06} ${18}H${half}" stroke="${WALL}" stroke-width="26"/>`);
    } else if (t === '折れ戸') {
      const q = w / 4;
      g.push(`<path d="M${-half} 0L${-half + q} ${side * q * 0.9}L${-half + 2 * q} 0L${-half + 3 * q} ${side * q * 0.9}L${half} 0" stroke="${WALL}" stroke-width="16" fill="none"/>`);
    } else if (t === '開口') {
      g.push(`<path d="M${-half} ${-WALL_W / 2}V${WALL_W / 2}M${half} ${-WALL_W / 2}V${WALL_W / 2}" stroke="${WALL}" stroke-width="16"/>`);
    } else {
      // 片開き戸・玄関ドア（吊り元は左の端。hinge で右の端）
      const hx = it.hinge ? half : -half;
      leaf(hx, w, it.hinge ? -1 : 1, t === '玄関ドア' ? 34 : 22);
    }
  }
  return `<g transform="translate(${r1(it.x)} ${r1(it.y)}) rotate(${rot})">${g.join('')}</g>`;
}

/** 設備・家具の記号（左上 0,0・幅 w・奥行 h。上の辺が壁側） */
export function fixtureSymbol(type: string, w: number, h: number): string {
  const st = `stroke="${WALL}" stroke-width="14" fill="#ffffff"`;
  const thin = `stroke="${WALL}" stroke-width="10" fill="none"`;
  const lab = (s: string, size = Math.min(w, h) * 0.32) => `<text x="${w / 2}" y="${h / 2 + size * 0.35}" font-size="${r1(size)}" text-anchor="middle" fill="${WALL}">${esc(s)}</text>`;
  switch (type) {
    case '洋式便器':
      return `<rect x="${w * 0.05}" y="0" width="${w * 0.9}" height="${h * 0.26}" rx="30" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.62}" rx="${w * 0.42}" ry="${h * 0.36}" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.64}" rx="${w * 0.24}" ry="${h * 0.22}" ${thin}/>`;
    case '和式便器':
      return `<rect x="${w * 0.1}" y="0" width="${w * 0.8}" height="${h}" rx="${w * 0.4}" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.6}" rx="${w * 0.22}" ry="${h * 0.25}" ${thin}/><path d="M${w * 0.15} ${h * 0.25}H${w * 0.85}" ${thin}/>`;
    case '洗面台':
      return `<rect width="${w}" height="${h}" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.58}" rx="${w * 0.3}" ry="${h * 0.3}" ${thin}/><circle cx="${w / 2}" cy="${h * 0.14}" r="${Math.min(w, h) * 0.06}" ${thin}/>`;
    case '手洗器':
      return `<rect width="${w}" height="${h}" rx="20" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.55}" rx="${w * 0.32}" ry="${h * 0.3}" ${thin}/>`;
    case '浴槽':
      return `<rect width="${w}" height="${h}" rx="60" ${st}/><rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.84}" height="${h * 0.76}" rx="${Math.min(w, h) * 0.25}" ${thin}/>`;
    case 'キッチン':
      return `<rect width="${w}" height="${h}" ${st}/><rect x="${w * 0.08}" y="${h * 0.2}" width="${w * 0.26}" height="${h * 0.6}" rx="30" ${thin}/><circle cx="${w * 0.66}" cy="${h * 0.5}" r="${h * 0.17}" ${thin}/><circle cx="${w * 0.84}" cy="${h * 0.5}" r="${h * 0.17}" ${thin}/>`;
    case '洗濯機':
      return `<rect width="${w}" height="${h}" rx="30" ${st}/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.32}" ${thin}/>`;
    case '冷蔵庫':
      return `<rect width="${w}" height="${h}" ${st}/>${lab('冷')}`;
    case '下駄箱':
      return `<rect width="${w}" height="${h}" ${st}/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" ${thin}/>`;
    case 'ベッド':
    case '介護ベッド':
      return (
        `<rect width="${w}" height="${h}" rx="30" ${st}/><rect x="${w * 0.12}" y="${h * 0.04}" width="${w * 0.76}" height="${h * 0.14}" rx="40" ${thin}/><path d="M0 ${h * 0.3}H${w}" ${thin}/>` +
        (type === '介護ベッド' ? `<path d="M-40 ${h * 0.2}V${h * 0.6}M${w + 40} ${h * 0.2}V${h * 0.6}" stroke="${WALL}" stroke-width="30"/>` : '')
      );
    case 'テーブル':
    case '机':
      return `<rect width="${w}" height="${h}" ${st}/>`;
    case 'ソファ':
      return `<rect width="${w}" height="${h}" rx="60" ${st}/><path d="M${w * 0.1} ${h * 0.3}H${w * 0.9}M${w * 0.1} ${h * 0.3}V${h}M${w * 0.9} ${h * 0.3}V${h}" ${thin}/>`;
    case 'タンス':
      return `<rect width="${w}" height="${h}" ${st}/><path d="M0 ${h * 0.8}H${w}" ${thin}/>`;
    case 'テレビ':
      return `<rect width="${w}" height="${h}" ${st}/>${lab('TV', h * 0.6)}`;
    case '椅子':
      return `<rect width="${w}" height="${h}" rx="40" ${st}/><path d="M${w * 0.1} ${h * 0.18}H${w * 0.9}" stroke="${WALL}" stroke-width="30"/>`;
    case 'ポータブルトイレ':
      return `<rect width="${w}" height="${h}" rx="40" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.55}" rx="${w * 0.28}" ry="${h * 0.26}" ${thin}/>`;
    case '車いす':
      return `<rect x="${w * 0.15}" y="${h * 0.15}" width="${w * 0.7}" height="${h * 0.5}" rx="40" ${st}/><path d="M0 ${h * 0.1}V${h * 0.75}M${w} ${h * 0.1}V${h * 0.75}" stroke="${WALL}" stroke-width="40"/><circle cx="${w * 0.25}" cy="${h * 0.9}" r="${w * 0.08}" ${thin}/><circle cx="${w * 0.75}" cy="${h * 0.9}" r="${w * 0.08}" ${thin}/>`;
    case 'シャワーチェア':
      return `<rect width="${w}" height="${h}" rx="80" ${st}/><path d="M${w * 0.15} ${h * 0.15}H${w * 0.85}" stroke="${WALL}" stroke-width="24"/>`;
    default:
      return `<rect width="${w}" height="${h}" ${st}/>${type ? lab(type.slice(0, 4), Math.min(h * 0.4, (w / textWidth(type.slice(0, 4), 1)) * 0.9)) : ''}`;
  }
}

/** 設備・家具・階段・段差（左上 x,y・幅 w・奥行 h を rot だけ中心のまわりに回す） */
function placed(it: MItem, inner: string): string {
  const rot = it.rot ?? 0;
  return `<g transform="translate(${r1(it.x)} ${r1(it.y)})${rot ? ` rotate(${rot} ${r1(it.w / 2)} ${r1(it.h / 2)})` : ''}">${inner}</g>`;
}

/** 階段（下から上へ上がる。矢印の先が上） */
function stair(it: MItem, module: Module): string {
  const {w, h} = it;
  const t = it.type ?? '直階段';
  const tread = module / 4;
  const p: string[] = [`<rect width="${w}" height="${h}" stroke="${WALL}" stroke-width="20" fill="#ffffff"/>`];
  const steps = (x0: number, y0: number, x1: number, y1: number, horiz: boolean) => {
    const len = horiz ? x1 - x0 : y1 - y0;
    const n = Math.max(1, Math.round(len / tread));
    const d: string[] = [];
    for (let i = 1; i < n; i++) {
      if (horiz) d.push(`M${r1(x0 + (len * i) / n)} ${y0}V${y1}`);
      else d.push(`M${x0} ${r1(y0 + (len * i) / n)}H${x1}`);
    }
    return `<path d="${d.join('')}" stroke="${WALL}" stroke-width="10"/>`;
  };
  const arrow = (pts: [number, number][]) => {
    const [ax, ay] = pts[pts.length - 2];
    const [bx, by] = pts[pts.length - 1];
    const ang = Math.atan2(by - ay, bx - ax);
    const s = Math.min(w, h, 900) * 0.18;
    const head = `M${r1(bx - s * Math.cos(ang - 0.45))} ${r1(by - s * Math.sin(ang - 0.45))}L${bx} ${by}L${r1(bx - s * Math.cos(ang + 0.45))} ${r1(by - s * Math.sin(ang + 0.45))}`;
    return `<path d="M${pts.map(([a, b]) => `${r1(a)} ${r1(b)}`).join('L')}${head}" stroke="${WALL}" stroke-width="14" fill="none"/>`;
  };
  if (t === '折返し階段') {
    p.push(`<path d="M${w / 2} ${h * 0.45}V${h}" stroke="${WALL}" stroke-width="16"/>`);
    p.push(steps(0, h * 0.45, w / 2, h, false), steps(w / 2, h * 0.45, w, h, false), `<path d="M0 ${h * 0.45}H${w}" stroke="${WALL}" stroke-width="10"/>`);
    p.push(arrow([[w * 0.25, h * 0.95], [w * 0.25, h * 0.25], [w * 0.75, h * 0.25], [w * 0.75, h * 0.7]]));
  } else if (t === 'L字階段') {
    const lw = Math.min(w, h) * 0.5;
    p.push(`<path d="M${lw} ${lw}V${h}M${lw} ${lw}H${w}" stroke="${WALL}" stroke-width="16" fill="none"/>`);
    p.push(steps(0, lw, lw, h, false), steps(lw, 0, w, lw, true));
    p.push(arrow([[lw / 2, h * 0.95], [lw / 2, lw / 2], [w * 0.92, lw / 2]]));
  } else {
    p.push(steps(0, 0, w, h, h < w));
    p.push(h >= w ? arrow([[w / 2, h * 0.95], [w / 2, h * 0.08]]) : arrow([[w * 0.05, h / 2], [w * 0.92, h / 2]]));
  }
  return placed(it, p.join(''));
}

/** 段差の解消（踏み台＝斜線・スロープ＝矢印） */
function step(it: MItem): string {
  const {w, h} = it;
  const t = it.type ?? '踏み台';
  const blue = '#1d6fd1';
  let inner = `<rect width="${w}" height="${h}" stroke="${blue}" stroke-width="22" fill="#e8f1fc"/>`;
  if (t === 'スロープ') {
    const s = Math.min(w, h) * 0.25;
    inner += `<path d="M${w / 2} ${h * 0.9}V${h * 0.1}M${w / 2 - s} ${h * 0.1 + s}L${w / 2} ${h * 0.1}L${w / 2 + s} ${h * 0.1 + s}" stroke="${blue}" stroke-width="16" fill="none"/>`;
  } else {
    const d: string[] = [];
    for (let k = -h; k < w; k += 120) d.push(`M${Math.max(0, k)} ${Math.max(0, -k)}L${Math.min(w, k + h)} ${Math.min(h, w - k)}`);
    inner += `<path d="${d.join('')}" stroke="${blue}" stroke-width="8"/>`;
  }
  return placed(it, inner);
}

/** 番号（赤い①。点の近くに置く） */
const numText = (n: number, x: number, y: number, size = 230) =>
  `<text x="${r1(x)}" y="${r1(y + size * 0.36)}" font-size="${size}" text-anchor="middle" fill="${RED}">${circled(n)}</text>`;

/**
 * 線の部品の番号の置き場所：線の始まり（左・上の端）の近くで、線に直角に少し離す（上か左）。見本の見取図も手すりの端のそばに①
 * （まん中だと部屋の名前・広さの字に重なった）
 */
function numSpot(it: MItem): [number, number] {
  const len = Math.hypot(it.w, it.h) || 1;
  let nx = -it.h / len;
  let ny = it.w / len;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  // 左・上の端（w・h が負なら終わりの端）から、線にそって 1/4（長い手すりでも 400mm まで）
  const flip = it.w < 0 || (it.w === 0 && it.h < 0);
  const sx = flip ? it.x + it.w : it.x;
  const sy = flip ? it.y + it.h : it.y;
  const along = Math.min(len / 4, 400);
  return [sx + (Math.abs(it.w) / len) * along + nx * 230, sy + (Math.abs(it.h) / len) * along + ny * 230];
}

function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, size = 170): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const tx = -uy * 60;
  const ty = ux * 60;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
  const up = ang > 90 || ang <= -90 ? ang + 180 : ang;
  return (
    `<path d="M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}M${r1(x1 - tx)} ${r1(y1 - ty)}L${r1(x1 + tx)} ${r1(y1 + ty)}M${r1(x2 - tx)} ${r1(y2 - ty)}L${r1(x2 + tx)} ${r1(y2 + ty)}" stroke="#475569" stroke-width="8"/>` +
    `<text x="${r1(mx)}" y="${r1(my)}" font-size="${size}" text-anchor="middle" fill="#334155" transform="rotate(${r1(up)} ${r1(mx)} ${r1(my)}) translate(0 ${-size * 0.35})">${esc(label)}</text>`
  );
}

/** 部屋の外まわりの寸法線（上と左。部屋の端で区切った連続寸法と、全体の長さ） */
function autoDims(items: MItem[]): string {
  const rooms = items.filter((it) => it.kind === 'room');
  if (!rooms.length) return '';
  const xs = [...new Set(rooms.flatMap((r) => [Math.round(r.x), Math.round(r.x + r.w)]))].sort((a, b) => a - b);
  const ys = [...new Set(rooms.flatMap((r) => [Math.round(r.y), Math.round(r.y + r.h)]))].sort((a, b) => a - b);
  const top = ys[0] - 420;
  const left = xs[0] - 420;
  const out: string[] = [];
  for (let i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] >= 200) out.push(dimLine(xs[i], top, xs[i + 1], top, String(xs[i + 1] - xs[i]), 150));
  for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1] - ys[i] >= 200) out.push(dimLine(left, ys[i + 1], left, ys[i], String(ys[i + 1] - ys[i]), 150));
  if (xs.length > 2) out.push(dimLine(xs[0], top - 260, xs[xs.length - 1], top - 260, String(xs[xs.length - 1] - xs[0]), 170));
  if (ys.length > 2) out.push(dimLine(left - 260, ys[ys.length - 1], left - 260, ys[0], String(ys[ys.length - 1] - ys[0]), 170));
  return out.join('');
}

/** 柄の定義（ページの中で同じ id が重ならないように頭を付ける） */
export function patternDefs(pid: string): string {
  return (
    `<pattern id="${pid}-floor" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M0 60H120" stroke="${FINISH.floor.line}" stroke-width="24"/></pattern>` +
    `<pattern id="${pid}-tile" width="150" height="150" patternUnits="userSpaceOnUse"><path d="M0 0H150V150" stroke="${FINISH.tile.line}" stroke-width="10" fill="none"/></pattern>` +
    `<pattern id="${pid}-doma" width="160" height="160" patternUnits="userSpaceOnUse"><circle cx="40" cy="40" r="14" fill="${FINISH.doma.line}"/><circle cx="120" cy="110" r="10" fill="${FINISH.doma.line}"/></pattern>` +
    `<pattern id="${pid}-out" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M0 200L200 0" stroke="${FINISH.outside.line}" stroke-width="10"/></pattern>` +
    `<pattern id="${pid}-wood" width="300" height="300" patternUnits="userSpaceOnUse"><path d="M150 0V300" stroke="${FINISH.wood.line}" stroke-width="10"/></pattern>`
  );
}

export type RenderOpts = {
  module: Module;
  showArea: boolean;
  showDims: boolean;
  nums: Map<string, number>; // 番号（numberItems）
  pid?: string; // 柄の id の頭
};

/**
 * 1つの階の中身（<g> の文字）。重なりの順：部屋の床 → 部屋の壁 → 設備・階段 → 部屋の名前 → 段差 → 建具・窓（壁を切る）→ 線・寸法 → 手すり → 番号・文字。
 * 部屋の壁は床をみな塗ったあとに描く（となりの部屋の床が壁を隠さないように）
 */
export function floorSvg(items: MItem[], o: RenderOpts): string {
  const pid = o.pid ?? 'md';
  const rooms = items.filter((it) => it.kind === 'room');
  const out: string[] = [];
  for (const r of rooms) out.push(roomPattern(r, o.module, pid));
  for (const r of rooms) out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${WALL}" stroke-width="${WALL_W}" stroke-linejoin="miter"/>`);
  for (const it of items) {
    if (it.kind === 'fix') out.push(placed(it, fixtureSymbol(it.type ?? '', it.w, it.h)));
    else if (it.kind === 'stair') out.push(stair(it, o.module));
  }
  // 部屋の名前は設備の上に（浴槽・ベッドに隠れないように）。字のまわりを白くふちどって読みやすく
  out.push(`<g paint-order="stroke" stroke="#ffffff" stroke-width="40" stroke-linejoin="round">${rooms.map((r) => roomLabel(r, o.module, o.showArea)).join('')}</g>`);
  for (const it of items) if (it.kind === 'step') out.push(step(it));
  for (const it of items) if (it.kind === 'door' || it.kind === 'window') out.push(opening(it));
  if (o.showDims) out.push(autoDims(items));
  for (const it of items) {
    if (it.kind === 'line') out.push(`<path d="M${r1(it.x)} ${r1(it.y)}l${r1(it.w)} ${r1(it.h)}" stroke="${WALL}" stroke-width="${it.type === '細線' ? 14 : WALL_W}" stroke-linecap="square"/>`);
    else if (it.kind === 'dim') out.push(dimLine(it.x, it.y, it.x + it.w, it.y + it.h, String(lineLength(it))));
  }
  for (const it of items) {
    if (it.kind === 'rail') {
      out.push(`<path d="M${r1(it.x)} ${r1(it.y)}l${r1(it.w)} ${r1(it.h)}" stroke="${RED}" stroke-width="45"/>`);
      out.push(`<circle cx="${r1(it.x)}" cy="${r1(it.y)}" r="55" fill="${RED}"/><circle cx="${r1(it.x + it.w)}" cy="${r1(it.y + it.h)}" r="55" fill="${RED}"/>`);
    } else if (it.kind === 'vrail') {
      out.push(`<circle cx="${r1(it.x)}" cy="${r1(it.y)}" r="75" fill="${RED}"/><circle cx="${r1(it.x)}" cy="${r1(it.y)}" r="32" fill="#ffffff"/>`);
    }
  }
  for (const it of items) {
    const n = o.nums.get(it.id);
    if (it.kind === 'rail' && n) {
      const [nx, ny] = numSpot(it);
      out.push(numText(n, nx, ny));
    } else if (it.kind === 'vrail' && n) out.push(numText(n, it.x + 230, it.y - 120));
    else if (it.kind === 'step' && n) {
      const b = bounds(it);
      out.push(numText(n, b.x + b.w + 200, b.y + 80));
    } else if (it.kind === 'num' && n) out.push(numText(n, it.x, it.y, it.size ?? 260));
    else if (it.kind === 'text' && it.label) {
      const size = it.size ?? 220;
      it.label.split('\n').forEach((line, i) => out.push(`<text x="${r1(it.x)}" y="${r1(it.y + size * (i + 0.85))}" font-size="${size}" fill="#111827">${esc(line)}</text>`));
    }
  }
  return `<g ${FONT}>${out.join('')}</g>`;
}

/** 絵の範囲（部品を囲む四角に余白。寸法線・番号の分も） */
export function viewOf(items: MItem[], margin = 700): {x: number; y: number; w: number; h: number} {
  const bs = items.map(bounds);
  if (!bs.length) return {x: 0, y: 0, w: 9100, h: 6370};
  const x0 = Math.min(...bs.map((b) => b.x)) - margin;
  const y0 = Math.min(...bs.map((b) => b.y)) - margin;
  const x1 = Math.max(...bs.map((b) => b.x + b.w)) + margin;
  const y1 = Math.max(...bs.map((b) => b.y + b.h)) + margin;
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
}

/** 1つの階を1枚の SVG（印刷・画像用。背景は白） */
export function floorSvgDoc(items: MItem[], o: RenderOpts, view = viewOf(items)): string {
  const pid = o.pid ?? 'md';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(view.x)} ${r1(view.y)} ${r1(view.w)} ${r1(view.h)}" width="${r1(view.w / 10)}" height="${r1(view.h / 10)}">` +
    `<defs>${patternDefs(pid)}</defs><rect x="${r1(view.x)}" y="${r1(view.y)}" width="${r1(view.w)}" height="${r1(view.h)}" fill="#ffffff"/>${floorSvg(items, {...o, pid})}</svg>`
  );
}

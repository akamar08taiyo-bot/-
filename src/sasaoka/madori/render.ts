// 平面図を SVG の文字にする（編集の画面・見取図の印刷・画像・Excel・申請書の平面図で同じ絵）。長さは mm のまま描く（viewBox が mm）。
// 見た目はいただいた見取図のテンプレートに合わせる：壁＝紺の太い線、フローリング＝橙の横じま、畳＝緑の畳割り、タイル＝青の目地、
// 手すり＝赤い線と両端の点・①②、ドア＝開く向きの弧、窓＝細い3本線

import {FINISH, roomColor, roomFinish, TONE} from './catalog.ts';
import {bounds, circled, joLabel, lineLength, railBend, railPts, roomAreaOf} from './model.ts';
import {labelSpot, polyArea, polyPath, roomPts, smoothPath} from './poly.ts';
import {shapeDef, shapeLine} from './shapes.ts';
import type {MItem, Module} from './model.ts';

export const WALL = '#203a55';
export const RED = '#e01b24';
/** 縦手すりの丸（塗りつぶしの青。写真・平面図の書き込みの「丸（縦手すり）」の 0070C0 と同じ） */
export const VRAIL = '#0070c0';
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
  // 色は部屋の種類の色（一覧のボタンと同じ）、柄の形は床の種類（catalog.ts の TONE・roomColor）
  const c = f === 'void' ? FINISH.void : roomColor(it.type);
  const k = 'key' in c ? c.key : 'base';
  if (it.pts) {
    // 多角形の部屋：床と柄は形の道で塗る。畳割り・吹抜の × は形で切り抜く（囲む四角に描いて、はみ出しを隠す）
    const d = polyPath(it.pts);
    const fillOf: Partial<Record<string, string>> = {floor: 'floor', tile: 'tile', doma: 'doma', outside: 'out', wood: 'wood'};
    let s = `<path d="${d}" fill="${c.fill}"/>`;
    if (fillOf[f]) s += `<path d="${d}" fill="url(#${pid}-${fillOf[f]}-${k})"/>`;
    else if (f === 'void' || f === 'tatami') {
      const cid = `${pid}-c-${it.id.replace(/[^\w-]/g, '')}`;
      const inner = f === 'tatami' ? tatami(x, y, w, h, module, c.line) : `<path d="M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}" stroke="${c.line}" stroke-width="20" fill="none"/>`;
      s += `<clipPath id="${cid}"><path d="${d}"/></clipPath><g clip-path="url(#${cid})">${inner}</g>`;
    }
    return s;
  }
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c.fill}"/>`;
  if (f === 'floor') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-floor-${k})"/>`;
  else if (f === 'tile') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-tile-${k})"/>`;
  else if (f === 'doma') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-doma-${k})"/>`;
  else if (f === 'outside') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-out-${k})"/>`;
  else if (f === 'wood') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid}-wood-${k})"/>`;
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
function roomLabel(it: MItem, module: Module, showArea: boolean, inner: MItem[] = []): string {
  const name = (it.label?.trim() || it.type || '').trim();
  // 中に置いたほかの部屋の分は引く（廊下を大きく描いて中に部屋を置いたとき、廊下の広さは空いた所だけ）
  const own = roomAreaOf(it, module);
  const area = {...own, jo: Math.max(0, Math.round((own.jo - inner.reduce((a, r) => a + roomAreaOf(r, module).jo, 0)) * 10) / 10)};
  // 広さは帖だけ（ユーザーの指示「ここの長さとヘーベーは不要」2026-11-10。前は「4.5帖（7.45㎡）」。㎡・坪は右の枠に出す）
  const areaText = showArea && roomFinish(it.type) !== 'void' && area.jo >= 0.5 ? joLabel(area.jo) : '';
  if (!name && !areaText) return '';
  // 多角形の部屋は、部屋の中のいちばん広く空いた所に書く（L 字の角の外に出さない）
  const spot = it.pts || inner.length ? labelSpot(roomPts(it), inner.map(roomPts)) : {x: it.x + it.w / 2, y: it.y + it.h / 2, maxW: Math.abs(it.w), maxH: Math.abs(it.h)};
  const cx = spot.x;
  const cy = spot.y;
  const maxW = Math.max(100, spot.maxW - 120);
  const fit = (s: string, size: number) => (s ? Math.min(size, (maxW / textWidth(s, 1)) * 0.95) : size);
  const ns = fit(name, 260);
  const as = fit(areaText, 170);
  const rows: string[] = [];
  const both = name && areaText && spot.maxH > ns + as + 80;
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
    } else if (t === '親子ドア') {
      // 大きい扉（親）と小さい扉（子）
      leaf(-half, w * 0.65, 1);
      leaf(half, w * 0.35, -1);
    } else if (t === '片開き戸（袖）') {
      // 扉と、開かない袖（細い板）
      leaf(it.hinge ? half : -half, w * 0.7, it.hinge ? -1 : 1);
      const sx = it.hinge ? -half : half - w * 0.3;
      g.push(`<path d="M${sx} 0H${sx + w * 0.3}" stroke="${WALL}" stroke-width="16"/>`);
    } else if (t === '引違い戸3枚' || t === '引違い戸4枚') {
      // 3枚・4枚の戸を、交互に前・うしろのレールに
      const n = t === '引違い戸3枚' ? 3 : 4;
      const pw = w / n;
      for (let i = 0; i < n; i++) g.push(`<path d="M${r1(-half + i * pw - (i ? w * 0.03 : 0))} ${i % 2 ? 18 : -18}H${r1(-half + (i + 1) * pw + (i < n - 1 ? w * 0.03 : 0))}" stroke="${WALL}" stroke-width="22"/>`);
    } else if (t === '折れ戸2枚') {
      const q = w / 8;
      const fold = (x0: number, dir: 1 | -1) => `M${x0} 0L${x0 + dir * q} ${side * q * 0.9}L${x0 + dir * 2 * q} 0L${x0 + dir * 3 * q} ${side * q * 0.9}L${x0 + dir * 4 * q} 0`;
      g.push(`<path d="${fold(-half, 1)}${fold(half, -1)}" stroke="${WALL}" stroke-width="16" fill="none"/>`);
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
    case '洗面セット':
      // 洗面化粧台と洗濯パン（左右に並べる）
      return `<rect width="${w * 0.52}" height="${h}" ${st}/><ellipse cx="${w * 0.26}" cy="${h * 0.58}" rx="${w * 0.16}" ry="${h * 0.28}" ${thin}/><rect x="${w * 0.56}" y="${h * 0.02}" width="${w * 0.44}" height="${h * 0.96}" rx="40" ${st}/><circle cx="${w * 0.78}" cy="${h * 0.5}" r="${Math.min(w * 0.15, h * 0.3)}" ${thin}/>`;
    case 'I型キッチン':
    case 'キッチン':
      return `<rect width="${w}" height="${h}" ${st}/><rect x="${w * 0.08}" y="${h * 0.2}" width="${w * 0.26}" height="${h * 0.6}" rx="30" ${thin}/><circle cx="${w * 0.66}" cy="${h * 0.5}" r="${h * 0.17}" ${thin}/><circle cx="${w * 0.84}" cy="${h * 0.5}" r="${h * 0.17}" ${thin}/>`;
    case '対面キッチン':
      return `<rect width="${w}" height="${h}" ${st}/><path d="M0 ${h * 0.72}H${w}" ${thin}/><rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.26}" height="${h * 0.45}" rx="30" ${thin}/><circle cx="${w * 0.66}" cy="${h * 0.36}" r="${h * 0.13}" ${thin}/><circle cx="${w * 0.84}" cy="${h * 0.36}" r="${h * 0.13}" ${thin}/>`;
    case 'アイランド型キッチン':
      return `<rect width="${w}" height="${h}" rx="40" ${st}/><rect x="${w * 0.1}" y="${h * 0.25}" width="${w * 0.25}" height="${h * 0.5}" rx="30" ${thin}/><circle cx="${w * 0.64}" cy="${h * 0.5}" r="${h * 0.15}" ${thin}/><circle cx="${w * 0.84}" cy="${h * 0.5}" r="${h * 0.15}" ${thin}/>`;
    case 'L型キッチン': {
      const d = Math.min(650, w * 0.35, h * 0.4);
      return `<path d="M0 0H${w}V${d}H${d}V${h}H0Z" ${st}/><rect x="${d * 0.2}" y="${h * 0.55}" width="${d * 0.6}" height="${h * 0.3}" rx="30" ${thin}/><circle cx="${w * 0.66}" cy="${d / 2}" r="${d * 0.2}" ${thin}/><circle cx="${w * 0.84}" cy="${d / 2}" r="${d * 0.2}" ${thin}/>`;
    }
    case '床下収納':
      return `<rect width="${w}" height="${h}" ${st}/><rect x="${w * 0.12}" y="${h * 0.12}" width="${w * 0.76}" height="${h * 0.76}" ${thin}/>`;
    case '床下点検口':
      return `<rect width="${w}" height="${h}" stroke="${WALL}" stroke-width="14" fill="#ffffff" stroke-dasharray="50 30"/><path d="M0 0L${w} ${h}" ${thin}/>`;
    case 'キッチンカウンター':
    case '食器棚':
      return `<rect width="${w}" height="${h}" ${st}/><path d="${[1, 2, 3].map((i) => `M${(w * i) / 4} 0V${h}`).join('')}" ${thin}/>`;
    case '洗面化粧台':
    case '洗面台':
      return `<rect width="${w}" height="${h}" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.58}" rx="${w * 0.3}" ry="${h * 0.3}" ${thin}/><circle cx="${w / 2}" cy="${h * 0.14}" r="${Math.min(w, h) * 0.06}" ${thin}/>`;
    case '洗濯パン':
      return `<rect width="${w}" height="${h}" rx="60" ${st}/><rect x="${w * 0.1}" y="${h * 0.1}" width="${w * 0.8}" height="${h * 0.8}" rx="40" ${thin}/><circle cx="${w * 0.78}" cy="${h * 0.78}" r="${Math.min(w, h) * 0.05}" ${thin}/>`;
    case 'ユニットバス':
      return `<rect width="${w}" height="${h}" ${st}/><rect x="${w * 0.06}" y="${h * 0.05}" width="${w * 0.88}" height="${h * 0.45}" rx="${Math.min(w, h) * 0.12}" ${thin}/><path d="M0 ${h * 0.55}H${w}" ${thin}/>`;
    case 'トイレ付ユニットバス':
      return `<rect width="${w}" height="${h}" ${st}/><rect x="${w * 0.06}" y="${h * 0.04}" width="${w * 0.88}" height="${h * 0.36}" rx="${Math.min(w, h) * 0.1}" ${thin}/><path d="M0 ${h * 0.45}H${w}" ${thin}/><ellipse cx="${w * 0.25}" cy="${h * 0.8}" rx="${w * 0.1}" ry="${h * 0.1}" ${thin}/><rect x="${w * 0.16}" y="${h * 0.62}" width="${w * 0.18}" height="${h * 0.06}" ${thin}/>`;
    case '玄関収納':
    case '下駄箱':
      return `<rect width="${w}" height="${h}" ${st}/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" ${thin}/>`;
    case '間仕切':
      return `<rect width="${w}" height="${h}" stroke="${WALL}" stroke-width="10" fill="${WALL}"/>`;
    case 'ロフト':
      return `<rect width="${w}" height="${h}" stroke="${WALL}" stroke-width="12" fill="#ffffff" stroke-dasharray="60 40"/><path d="M${w * 0.1} ${h * 0.6}V${h}M${w * 0.28} ${h * 0.6}V${h}${[0.68, 0.76, 0.84, 0.92].map((y) => `M${w * 0.1} ${h * y}H${w * 0.28}`).join('')}" ${thin}/>${lab('ロフト', Math.min(w, h) * 0.18)}`;
    case '食卓セット4人用':
    case '食卓セット6人用':
    case '食卓セット2人用': {
      // テーブルと、上下に並べたいす
      const n = type === '食卓セット6人用' ? 3 : type === '食卓セット4人用' ? 2 : 1;
      const th = h * 0.5;
      const ty = (h - th) / 2;
      const cw = Math.min(450, (w / n) * 0.75);
      const chairs = Array.from({length: n}, (_, i) => {
        const cx = (w * (i + 0.5)) / n - cw / 2;
        return `<rect x="${r1(cx)}" y="0" width="${r1(cw)}" height="${r1(ty - 30)}" rx="30" ${thin}/><rect x="${r1(cx)}" y="${r1(ty + th + 30)}" width="${r1(cw)}" height="${r1(ty - 30)}" rx="30" ${thin}/>`;
      }).join('');
      return `<rect y="${r1(ty)}" width="${w}" height="${r1(th)}" ${st}/>${chairs}`;
    }
    case '食卓2人用':
    case '食卓4人用':
    case '食卓6人用':
      return `<rect width="${w}" height="${h}" ${st}/>`;
    case 'いす':
      return `<rect width="${w}" height="${h}" rx="40" ${st}/><path d="M${w * 0.1} ${h * 0.18}H${w * 0.9}" stroke="${WALL}" stroke-width="30"/>`;
    case 'スツール':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${st}/>`;
    case '手洗器':
      return `<rect width="${w}" height="${h}" rx="20" ${st}/><ellipse cx="${w / 2}" cy="${h * 0.55}" rx="${w * 0.32}" ry="${h * 0.3}" ${thin}/>`;
    case '浴槽':
      return `<rect width="${w}" height="${h}" rx="60" ${st}/><rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.84}" height="${h * 0.76}" rx="${Math.min(w, h) * 0.25}" ${thin}/>`;
    case '洗濯機':
      return `<rect width="${w}" height="${h}" rx="30" ${st}/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.32}" ${thin}/>`;
    case '冷蔵庫':
      return `<rect width="${w}" height="${h}" ${st}/>${lab('冷')}`;
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
// mirror＝左右反転（階段の曲がる向き。四角の中で左右を入れかえてから回す）
function placed(it: MItem, inner: string, mirror = false): string {
  const rot = it.rot ?? 0;
  return `<g transform="translate(${r1(it.x)} ${r1(it.y)})${rot ? ` rotate(${rot} ${r1(it.w / 2)} ${r1(it.h / 2)})` : ''}${mirror ? ` translate(${r1(it.w)} 0) scale(-1 1)` : ''}">${inner}</g>`;
}

/** 階段（下から上へ上がる。矢印の先が上） */
function stair(it: MItem, module: Module): string {
  const {w, h} = it;
  const t = it.type ?? '直階段';
  const tread = module / 4;
  const p: string[] = [`<rect width="${w}" height="${h}" stroke="${WALL}" stroke-width="20" fill="#ffffff"/>`];
  // count＝段の数を決めるとき（外階段の3段）。なければ踏み面が方眼の 1/4 ほどになる数
  const steps = (x0: number, y0: number, x1: number, y1: number, horiz: boolean, count?: number) => {
    const len = horiz ? x1 - x0 : y1 - y0;
    const n = count ?? Math.max(1, Math.round(len / tread));
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
  } else if (t === '折返し回り階段') {
    // 折返し階段の踊り場を、まん中から扇に広がる回り段（6段）にしたもの
    const lh = h * 0.45;
    const cx = w / 2;
    p.push(`<path d="M${cx} ${lh}V${h}" stroke="${WALL}" stroke-width="16"/>`);
    p.push(steps(0, lh, cx, h, false), steps(cx, lh, w, h, false), `<path d="M0 ${lh}H${w}" stroke="${WALL}" stroke-width="10"/>`);
    const rays = [150, 120, 90, 60, 30].map((deg) => {
      const dx = Math.cos((deg * Math.PI) / 180);
      const dy = -Math.sin((deg * Math.PI) / 180);
      const k = Math.min(dx < 0 ? -cx / dx : dx > 0 ? (w - cx) / dx : Infinity, -lh / dy);
      return `M${r1(cx)} ${r1(lh)}L${r1(cx + dx * k)} ${r1(lh + dy * k)}`;
    });
    p.push(`<path d="${rays.join('')}" stroke="${WALL}" stroke-width="10"/>`);
    p.push(arrow([[w * 0.25, h * 0.95], [w * 0.25, lh * 0.75], [cx, lh * 0.3], [w * 0.75, lh * 0.75], [w * 0.75, h * 0.7]]));
  } else if (t === '直階段（踊り場）') {
    // まっすぐの階段のまん中に、幅と同じ長さの踊り場（長い方の向きに上がる）
    const tall = h >= w;
    const L = Math.min(tall ? w : h, (tall ? h : w) * 0.3);
    const a = ((tall ? h : w) - L) / 2;
    if (tall) {
      p.push(steps(0, 0, w, a, false), steps(0, a + L, w, h, false), `<path d="M0 ${r1(a)}H${w}M0 ${r1(a + L)}H${w}" stroke="${WALL}" stroke-width="16"/>`);
      p.push(arrow([[w / 2, h * 0.96], [w / 2, h * 0.05]]));
    } else {
      p.push(steps(0, 0, a, h, true), steps(a + L, 0, w, h, true), `<path d="M${r1(a)} 0V${h}M${r1(a + L)} 0V${h}" stroke="${WALL}" stroke-width="16"/>`);
      p.push(arrow([[w * 0.04, h / 2], [w * 0.95, h / 2]]));
    }
  } else if (t === 'らせん階段') {
    // まん中の柱のまわりを回る（12段）。矢印は下から右回り
    const cx = w / 2;
    const cy = h / 2;
    const R = (Math.min(w, h) / 2) * 0.94;
    const r0 = R * 0.14;
    const rays = Array.from({length: 12}, (_, k) => {
      const a = (k * Math.PI) / 6;
      return `M${r1(cx + r0 * Math.cos(a))} ${r1(cy + r0 * Math.sin(a))}L${r1(cx + R * Math.cos(a))} ${r1(cy + R * Math.sin(a))}`;
    });
    p.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R)}" stroke="${WALL}" stroke-width="16" fill="none"/>`, `<path d="${rays.join('')}" stroke="${WALL}" stroke-width="10"/>`);
    p.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r0)}" stroke="${WALL}" stroke-width="12" fill="#ffffff"/>`);
    const ra = R * 0.6;
    p.push(arrow(Array.from({length: 19}, (_, k) => {
      const a = Math.PI / 2 + (k / 18) * Math.PI * 1.6;
      return [cx + ra * Math.cos(a), cy + ra * Math.sin(a)] as [number, number];
    })));
  } else if (t === '外階段（3段）') {
    // 玄関・勝手口の外の数段（段の数は3。奥へ上がる）
    p.push(steps(0, 0, w, h, false, 3));
    p.push(arrow([[w / 2, h * 0.93], [w / 2, h * 0.08]]));
  } else if (t === '回り階段') {
    // L 字の角を、ななめの段（回り段）でまわる
    const lw = Math.min(w, h) * 0.5;
    p.push(steps(0, lw, lw, h, false), steps(lw, 0, w, lw, true));
    p.push(`<path d="M0 ${lw}L${lw} ${lw}L${lw} 0M${lw} ${lw}L0 0M${lw} ${lw}L${lw * 0.45} 0M${lw} ${lw}L0 ${lw * 0.45}" stroke="${WALL}" stroke-width="10" fill="none"/>`);
    p.push(arrow([[lw / 2, h * 0.95], [lw / 2, lw * 0.6], [lw * 0.6, lw / 2], [w * 0.92, lw / 2]]));
  } else if (t === 'コ字階段') {
    // 左を上がって、上で右へ、右を下りる向き（3つの段の列と、2つの踊り場）
    const cw = w / 3;
    const lh = Math.min(h * 0.32, cw);
    p.push(steps(0, lh, cw, h, false), steps(cw, 0, 2 * cw, lh, true), steps(2 * cw, lh, w, h, false));
    p.push(`<path d="M${cw} ${lh}V${h}M${2 * cw} ${lh}V${h}M0 ${lh}H${cw}M${2 * cw} ${lh}H${w}M${cw} ${lh}H${2 * cw}" stroke="${WALL}" stroke-width="16" fill="none"/>`);
    p.push(arrow([[cw / 2, h * 0.95], [cw / 2, lh / 2], [w - cw / 2, lh / 2], [w - cw / 2, h * 0.7]]));
  } else if (t === 'L字階段') {
    const lw = Math.min(w, h) * 0.5;
    p.push(`<path d="M${lw} ${lw}V${h}M${lw} ${lw}H${w}" stroke="${WALL}" stroke-width="16" fill="none"/>`);
    p.push(steps(0, lw, lw, h, false), steps(lw, 0, w, lw, true));
    p.push(arrow([[lw / 2, h * 0.95], [lw / 2, lw / 2], [w * 0.92, lw / 2]]));
  } else {
    p.push(steps(0, 0, w, h, h < w));
    p.push(h >= w ? arrow([[w / 2, h * 0.95], [w / 2, h * 0.08]]) : arrow([[w * 0.05, h / 2], [w * 0.92, h / 2]]));
  }
  return placed(it, p.join(''), !!it.flip);
}

/** 段差の解消（踏み台＝斜線・スロープ＝矢印） */
function step(it: MItem): string {
  const {w, h} = it;
  const t = it.type ?? '踏み台';
  const blue = '#1d6fd1';
  // 横四角（塗りつぶし。ユーザーの指示「横四角塗り潰し（大きさや形は変動できる）」2026-11-10）：丸（縦手すり）と同じ青で塗る
  if (it.fill) return placed(it, `<rect width="${w}" height="${h}" stroke="${VRAIL}" stroke-width="22" fill="${VRAIL}"/>`);
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
/** 床の柄（形は床の種類、色は部屋の種類の色ごと。id は「頭-柄-色」） */
export function patternDefs(pid: string): string {
  const colors: [string, string][] = [...Object.values(TONE).map((t): [string, string] => [t.key, t.line]), ['base', FINISH.plain.line]];
  return colors
    .map(
      ([k, line]) =>
        `<pattern id="${pid}-floor-${k}" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M0 60H120" stroke="${line}" stroke-width="24"/></pattern>` +
        `<pattern id="${pid}-tile-${k}" width="150" height="150" patternUnits="userSpaceOnUse"><path d="M0 0H150V150" stroke="${line}" stroke-width="10" fill="none"/></pattern>` +
        `<pattern id="${pid}-doma-${k}" width="160" height="160" patternUnits="userSpaceOnUse"><circle cx="40" cy="40" r="14" fill="${line}"/><circle cx="120" cy="110" r="10" fill="${line}"/></pattern>` +
        `<pattern id="${pid}-out-${k}" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M0 200L200 0" stroke="${line}" stroke-width="10"/></pattern>` +
        `<pattern id="${pid}-wood-${k}" width="300" height="300" patternUnits="userSpaceOnUse"><path d="M150 0V300" stroke="${line}" stroke-width="10"/></pattern>`,
    )
    .join('');
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
  // 大きい部屋から先に塗る（廊下を大きく描いて、中に部屋を置けるように。描いた順は問わない）
  const sizeOf = (r: MItem) => (r.pts ? polyArea(r.pts) : Math.abs(r.w * r.h));
  const rooms = items.filter((it) => it.kind === 'room').sort((a, b) => sizeOf(b) - sizeOf(a));
  // 部屋の中に（囲む四角ごと）入っているほかの部屋
  const innerOf = (r: MItem) => rooms.filter((q) => q !== r && sizeOf(q) < sizeOf(r) && q.x >= r.x && q.y >= r.y && q.x + q.w <= r.x + r.w && q.y + q.h <= r.y + r.h);
  const out: string[] = [];
  for (const r of rooms) out.push(roomPattern(r, o.module, pid));
  for (const r of rooms)
    out.push(
      r.pts
        ? `<path d="${polyPath(r.pts)}" fill="none" stroke="${WALL}" stroke-width="${WALL_W}" stroke-linejoin="miter"/>`
        : `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${WALL}" stroke-width="${WALL_W}" stroke-linejoin="miter"/>`,
    );
  for (const it of items) {
    if (it.kind === 'fix') out.push(placed(it, fixtureSymbol(it.type ?? '', it.w, it.h)));
    else if (it.kind === 'stair') out.push(stair(it, o.module));
  }
  // 部屋の名前は設備の上に（浴槽・ベッドに隠れないように）。字のまわりを白くふちどって読みやすく
  out.push(`<g paint-order="stroke" stroke="#ffffff" stroke-width="40" stroke-linejoin="round">${rooms.map((r) => roomLabel(r, o.module, o.showArea, innerOf(r))).join('')}</g>`);
  for (const it of items) if (it.kind === 'step') out.push(step(it));
  for (const it of items) if (it.kind === 'door' || it.kind === 'window') out.push(opening(it));
  if (o.showDims) out.push(autoDims(items));
  for (const it of items) {
    if (it.kind === 'line') out.push(`<path d="M${r1(it.x)} ${r1(it.y)}l${r1(it.w)} ${r1(it.h)}" stroke="${WALL}" stroke-width="${it.type === '細線' ? 14 : WALL_W}" stroke-linecap="square"/>`);
    else if (it.kind === 'dim') out.push(dimLine(it.x, it.y, it.x + it.w, it.y + it.h, String(lineLength(it))));
    else if (it.kind === 'shape') out.push(shapeSvg(it));
  }
  for (const it of items) {
    if (it.kind === 'rail' && it.pts) {
      // 曲がり角のある棒（何回でも曲げた手すり）
      const pts = railPts(it);
      const [a, z] = [pts[0], pts[pts.length - 1]];
      out.push(`<path d="M${pts.map((q) => `${r1(q.x)} ${r1(q.y)}`).join('L')}" stroke="${RED}" stroke-width="45" fill="none" stroke-linejoin="round"/>`);
      out.push(`<circle cx="${r1(a.x)}" cy="${r1(a.y)}" r="55" fill="${RED}"/><circle cx="${r1(z.x)}" cy="${r1(z.y)}" r="55" fill="${RED}"/>`);
    } else if (it.kind === 'rail') {
      const e = railBend(it); // L 字の2本目（一筆で描いた L 字）
      const end = e ?? {x: it.x + it.w, y: it.y + it.h};
      out.push(`<path d="M${r1(it.x)} ${r1(it.y)}l${r1(it.w)} ${r1(it.h)}${e ? `L${r1(e.x)} ${r1(e.y)}` : ''}" stroke="${RED}" stroke-width="45" fill="none" stroke-linejoin="round"/>`);
      out.push(`<circle cx="${r1(it.x)}" cy="${r1(it.y)}" r="55" fill="${RED}"/><circle cx="${r1(end.x)}" cy="${r1(end.y)}" r="55" fill="${RED}"/>`);
    } else if (it.kind === 'vrail') {
      // 縦手すりは塗りつぶした丸（ユーザーの指示「○（塗り潰し）」2026-11-10。申請書の写真・平面図の書き込みの「丸（縦手すり）」と同じ青）。
      // 大きさ・形（だ円）は w・h（0 なら 150mm の丸）
      const rx = (it.w || 150) / 2;
      const ry = (it.h || 150) / 2;
      out.push(rx === ry ? `<circle cx="${r1(it.x)}" cy="${r1(it.y)}" r="${r1(rx)}" fill="${VRAIL}"/>` : `<ellipse cx="${r1(it.x)}" cy="${r1(it.y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${VRAIL}"/>`);
    }
  }
  for (const it of items) {
    const n = o.nums.get(it.id);
    if (it.kind === 'rail' && n) {
      const [nx, ny] = numSpot(it);
      out.push(numText(n, nx, ny));
    } else if (it.kind === 'vrail' && n) out.push(numText(n, it.x + (it.w || 150) / 2 + 155, it.y - (it.h || 150) / 2 - 45));
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

/** 図形（Excel と同じ 直線・矢印・四角・丸。線の太さ 30mm、色は図形ごと＝初めは赤） */
function shapeSvg(it: MItem): string {
  const c = it.color ?? RED;
  const sw = 30;
  const def = shapeDef(it.type);
  if (it.pts && it.pts.length >= 3) {
    // 頂点の編集にした図形（頂点は mm のまま。回した向きも頂点に入っている）
    const fill = it.fill ? `fill="${c}" fill-opacity="0.18"` : 'fill="none"';
    return `<path d="${it.curve ? smoothPath(it.pts) : polyPath(it.pts)}" ${fill} stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  }
  if (!def || def.line) return shapeLine(it.type ?? '直線', it.x, it.y, it.w, it.h, c, sw);
  // 箱の図形：箱の中の道を、回した向き（rot）で。塗るときは薄く
  const d = def.path ? def.path(Math.abs(it.w), Math.abs(it.h)) : '';
  const fill = it.fill && !def.open ? `fill="${c}" fill-opacity="0.18"` : 'fill="none"';
  return placed(it, `<path d="${d}" ${fill} fill-rule="evenodd" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`);
}

/** 一覧のボタンの絵：部品1つだけの SVG（viewBox は部品のまわり）。住設・家具・階段・間口・部屋 */
export function thumbSvg(kind: 'fix' | 'stair' | 'door' | 'window', type: string, w: number, h: number, module: Module = 910): string {
  if (kind === 'door' || kind === 'window') {
    const it: MItem = {id: 't', kind, type, x: 0, y: 0, w, h: 0};
    const pad = w * 0.12;
    const top = kind === 'door' ? -w * 0.1 : -WALL_W * 2;
    const hh = kind === 'door' ? w * 1.05 : WALL_W * 6;
    // 壁の線（左右）＋建具
    const wallLine = `<path d="M${-w / 2 - pad} 0H${w / 2 + pad}" stroke="${WALL}" stroke-width="${WALL_W}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(-w / 2 - pad)} ${r1(top)} ${r1(w + pad * 2)} ${r1(hh)}">${wallLine}${opening(it)}</svg>`;
  }
  const pad = Math.max(w, h) * 0.06;
  const inner = kind === 'stair' ? stair({id: 't', kind: 'stair', type, x: 0, y: 0, w, h}, module) : fixtureSymbol(type, w, h);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(-pad)} ${r1(-pad)} ${r1(w + pad * 2)} ${r1(h + pad * 2)}" ${FONT}>${inner}</svg>`;
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

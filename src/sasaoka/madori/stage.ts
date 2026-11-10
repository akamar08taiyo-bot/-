// 申請書の箇所から、平面図の置き場に部品を用意する（ユーザーの指示「申請書を事前に入力していた場合は、事前に空きスペースに用意する。
// ①横棒 ②塗り潰し丸記号など ③スロープ記号など、移動するだけで平面図が作成できる」2026-11-10）。
// 置き場の部品は平面図のデータには入れない（画面に薄く出すだけ。印刷・Excel・申請書の平面図の枠にも出ない）。つかんで方眼に動かすと、
// 申請書の箇所につないだ部品（番号＝写真番号、一覧の文＝申請書の改修の内容）として図に入る

import type {Place} from '../types.ts';
import {bounds, floorBounds, numberItems} from './model.ts';
import type {MFloor, MItem, Module} from './model.ts';

const mm = (v: string | undefined) => Number(String(v ?? '').normalize('NFKC').replace(/[^\d.]/g, '')) || 0;

/** 箇所の文字（改修場所・そのほか・見積書の品名）。縦手すり・踏み台などを見分ける */
const placeText = (p: Place) => [p.name, p.shinseiText ?? '', ...p.rows.map((r) => r.name)].join(' ').normalize('NFKC');

/** 箇所1つの部品（位置は 0,0 から。並べるときにずらす） */
export function stageItem(p: Place): MItem {
  const id = `stage-${p.id}`;
  const text = placeText(p);
  if (p.kind === 1) {
    // 手すり：縦手すり（I型）は塗りつぶしの丸、ほかは横棒（長さは申請書の L）
    if (/縦|I型|Ｉ型|I字/.test(text)) return {id, kind: 'vrail', x: 0, y: 0, w: 0, h: 0, place: p.id};
    return {id, kind: 'rail', x: 0, y: 0, w: mm(p.dims?.l) || 800, h: 0, place: p.id};
  }
  if (p.kind === 2) {
    // 段差の解消：踏み台・式台は横四角（塗りつぶし）、ほかはスロープの記号（大きさは申請書の幅・奥行）
    if (/踏み台|踏台|式台|ステップ/.test(text)) return {id, kind: 'step', type: '踏み台', fill: true, x: 0, y: 0, w: mm(p.dims?.w) || 600, h: mm(p.dims?.d) || 400, place: p.id};
    return {id, kind: 'step', type: 'スロープ', x: 0, y: 0, w: mm(p.dims?.w) || 900, h: mm(p.dims?.d) || 1200, place: p.id};
  }
  // 床材の変更・扉・便器の取替など：番号だけ
  return {id, kind: 'num', x: 0, y: 0, w: 0, h: 0, place: p.id};
}

/** 置き場の字の大きさ（mm。図と一緒に大きく・小さくなる） */
export const STAGE_FONT = 200;

/**
 * 置き場の部品と置き場の枠：まだ図にない申請書の箇所（その箇所につないだ部品も、その写真番号の番号もない）だけを、
 * いまの階の図の右（何もなければ方眼の右のほう。左は描く所に空けておく）に縦に並べる。部品の右に改修場所の名前（玄関など）。
 * list は申請書の順（写真番号・改修場所の名前つき）
 */
export function stagedItems(
  floors: MFloor[],
  floor: MFloor,
  places: Place[],
  list: {id: string; photo: number; name?: string}[],
  placeNo: (id: string) => number | undefined,
  module: Module,
): {items: MItem[]; labels: {x: number; y: number; text: string}[]; box: {x: number; y: number; w: number; h: number} | null} {
  const all = floors.flatMap((f) => f.items);
  const linked = new Set(all.map((it) => it.place).filter(Boolean));
  const used = new Set(numberItems(floors, placeNo).values());
  const todo = list.filter((w) => !linked.has(w.id) && !used.has(w.photo));
  if (!todo.length) return {items: [], labels: [], box: null};
  const b = floorBounds(floor.items);
  const x0 = b ? b.x + b.w + module * 1.5 : module * 9;
  let y = b ? b.y : 0;
  const out: MItem[] = [];
  const labels: {x: number; y: number; text: string}[] = [];
  for (const w of todo) {
    const p = places.find((q) => q.id === w.id);
    if (!p) continue;
    const it = stageItem(p);
    const top = y + 300; // 番号の字の分
    const placed =
      it.kind === 'rail'
        ? {...it, x: x0, y: top + 100}
        : it.kind === 'vrail' || it.kind === 'num'
          ? {...it, x: x0 + 150, y: top + 150}
          : {...it, x: x0, y: top};
    out.push(placed);
    const bb = bounds(placed);
    if (w.name) labels.push({x: bb.x + Math.max(bb.w, 300) + 250, y: bb.y + bb.h / 2 + STAGE_FONT * 0.35, text: w.name});
    y = bb.y + Math.max(bb.h, 200) + 450;
  }
  const bs = out.map(bounds);
  const textW = (t: string) => [...t].length * STAGE_FONT;
  const bx = Math.min(...bs.map((q) => q.x)) - 300;
  const by = Math.min(...bs.map((q) => q.y)) - 700;
  const bx2 = Math.max(...bs.map((q) => q.x + q.w), ...labels.map((l) => l.x + textW(l.text))) + 300;
  const by2 = Math.max(...bs.map((q) => q.y + q.h)) + 300;
  return {items: out, labels, box: {x: bx, y: by, w: Math.max(bx2 - bx, STAGE_FONT * 16), h: by2 - by}};
}

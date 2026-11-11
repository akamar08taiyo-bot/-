// 申請書の箇所から、平面図の置き場に部品を用意する（ユーザーの指示「申請書を事前に入力していた場合は、事前に空きスペースに用意する。
// ①横棒 ②塗り潰し丸記号など ③スロープ記号など、移動するだけで平面図が作成できる」2026-11-10）。
// 置き場の部品は平面図のデータには入れない（画面に薄く出すだけ。印刷・Excel・申請書の平面図の枠にも出ない）。つかんで方眼に動かすと、
// 申請書の箇所につないだ部品（番号＝写真番号、一覧の文＝申請書の改修の内容）として図に入る

import type {Place} from '../types.ts';
import {bounds, floorBounds, NUM_SIZE, numberItems} from './model.ts';
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

/** 置き場の字の大きさ（mm。図と一緒に大きく・小さくなる。画面では番号の大きさに合わせてもっと大きくする＝stagedItems の ns） */
export const STAGE_FONT = 200;

/** 置き場の1行（申請書の箇所1つ）：左に番号、まん中に部品、右に改修場所の名前。行のどこを押しても、その部品だけをつかむ（rect） */
export type StageRow = {item: MItem; photo: number; rect: {x: number; y: number; w: number; h: number}; num: {x: number; y: number}};
export type Stage = {
  items: MItem[];
  labels: {x: number; y: number; text: string}[];
  rows: StageRow[];
  box: {x: number; y: number; w: number; h: number} | null;
  ns: number; // 番号の字の大きさ（mm）
  font: number; // 名前・見出しの字の大きさ（mm）
};

/**
 * 置き場の部品と置き場の枠：まだ図にない申請書の箇所（その箇所につないだ部品も、その写真番号の番号もない）だけを、
 * いまの階の図の右（何もなければ方眼の右のほう。左は描く所に空けておく）に縦に並べる。1行に1つ：左に番号（①）、まん中に部品（横棒・丸・四角）、
 * 右に改修場所の名前（玄関など）。list は申請書の順（写真番号・改修場所の名前つき）。
 * ns は番号の字の大きさ（mm）。画面で番号を大きく描く（MadoriEditor の numMin）ときは、行の高さ・字もそれに合わせる
 * （前は行の間が番号より狭く、大きくした①②③が重なって1つずつつかめなかった。ユーザーの指示「個別で動くようにする」2026-11-11）
 */
export function stagedItems(
  floors: MFloor[],
  floor: MFloor,
  places: Place[],
  list: {id: string; photo: number; name?: string}[],
  placeNo: (id: string) => number | undefined,
  module: Module,
  ns = NUM_SIZE,
  emptyRight?: number, // 何も描いていない階：置き場の右の端をここまでに（携帯の初めの見え方で、置き場が右にはみ出さないように）
): Stage {
  const font = Math.max(STAGE_FONT, ns * 0.55);
  const all = floors.flatMap((f) => f.items);
  const linked = new Set(all.map((it) => it.place).filter(Boolean));
  const used = new Set(numberItems(floors, placeNo).values());
  const todo = list.filter((w) => !linked.has(w.id) && !used.has(w.photo));
  if (!todo.length) return {items: [], labels: [], rows: [], box: null, ns, font};
  const b = floorBounds(floor.items);
  const x0 = b ? b.x + b.w + module * 1.5 : module * 9;
  const numX = x0 + ns * 0.6; // 番号の列のまん中
  const partX = x0 + ns * 1.4; // 部品の左
  const gap = ns * 0.35; // 行と行のあいだ
  let y = (b ? b.y : 0) + font * 2.2; // 見出し（申請書の箇所（動かして置く））の下から
  const out: MItem[] = [];
  const labels: Stage['labels'] = [];
  const rows: {item: MItem; photo: number; top: number; h: number; mid: number; right: number}[] = [];
  for (const w of todo) {
    const p = places.find((q) => q.id === w.id);
    if (!p) continue;
    const it = stageItem(p);
    const h0 = it.kind === 'step' ? it.h : it.kind === 'vrail' ? 300 : 0;
    const h = Math.max(h0, ns * 1.2);
    const mid = y + h / 2;
    const placed =
      it.kind === 'num'
        ? {...it, x: numX, y: mid} // 番号だけの箇所は、番号そのものが部品
        : it.kind === 'rail'
          ? {...it, x: partX, y: mid}
          : it.kind === 'vrail'
            ? {...it, x: partX + 150, y: mid}
            : {...it, x: partX, y: mid - it.h / 2};
    out.push(placed);
    const bb = bounds(placed);
    const right = it.kind === 'num' ? numX + ns * 0.6 : bb.x + bb.w;
    if (w.name) labels.push({x: right + font * 1.2, y: mid + font * 0.35, text: w.name});
    rows.push({item: placed, photo: w.photo, top: y, h, mid, right});
    y += h + gap;
  }
  const textW = (t: string) => [...t].length * font;
  const bx = x0 - ns * 0.2;
  const by = (b ? b.y : 0);
  const bx2 = Math.max(...rows.map((r) => r.right), ...labels.map((l) => l.x + textW(l.text))) + font;
  const by2 = y - gap + ns * 0.3;
  const box0 = {x: bx, y: by, w: Math.max(bx2 - bx, font * 14), h: by2 - by};
  // 何も描いていない階で、置き場が右の端を越えるなら左へずらす（図があるときは図の右のまま）
  const dx = !b && emptyRight !== undefined ? Math.min(0, emptyRight - (box0.x + box0.w)) : 0;
  const box = {...box0, x: box0.x + dx};
  return {
    items: out.map((it) => ({...it, x: it.x + dx})),
    labels: labels.map((l) => ({...l, x: l.x + dx})),
    rows: rows.map((r) => ({item: {...r.item, x: r.item.x + dx}, photo: r.photo, rect: {x: box.x, y: r.top - gap / 2, w: box.w, h: r.h + gap}, num: {x: numX + dx, y: r.mid}})),
    box,
    ns,
    font,
  };
}

/** 置き場の行のどこか（番号・部品・名前・その行の空いた所）を押したら、その行の部品 */
export function stageHit(stage: Stage, p: {x: number; y: number}): MItem | null {
  const r = stage.rows.find(({rect}) => p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h);
  return r ? r.item : null;
}

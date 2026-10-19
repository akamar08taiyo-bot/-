// 箇所の行を作る・取付手間の箇所数を数える・一式を入れる などの行の操作

import type {Kit, LaborItem, Material, Place, Row, RowKind} from './types.ts';
import {uid} from './util.ts';

const BLANK: Omit<Row, 'id' | 'kind'> = {
  refId: null,
  name: '',
  code: '',
  maker: '',
  unit: '',
  price: 0,
  qty: 1,
  listPrice: 0,
  lengthCm: 0,
  pieceLengthM: 0,
  estPrice: null,
  excluded: false,
};

/** 新しい箇所。見積書の改修の種類は「①手すりの取付」、写真番号は箇所の順番、工事名称は改修の種類から */
export function newPlace(name: string, rows: Row[] = []): Place {
  return {id: uid('p'), name: name.trim(), rows, kind: 1, photo: 0, work: ''};
}

/** 部材リストから選んだ部材の行（仕切り価格・定価を書き写す） */
export function materialRow(m: Material, qty = 1): Row {
  return {
    ...BLANK,
    id: uid('r'),
    kind: 'material',
    refId: m.id,
    name: m.name,
    code: m.code,
    maker: m.maker,
    unit: m.unit,
    price: m.price,
    listPrice: m.listPrice,
    pieceLengthM: m.pieceLengthM,
    qty,
  };
}

export function laborRow(item: LaborItem, qty = 1): Row {
  return {...BLANK, id: uid('r'), kind: 'labor', refId: item.id, name: item.name, price: item.price, qty};
}

/** 手入力の行。品名は空でもよい（金額だけ入れる行） */
export function manualRow(kind: RowKind, patch: Partial<Omit<Row, 'id' | 'kind'>> = {}): Row {
  return {...BLANK, ...patch, id: uid('r'), kind};
}

export function copyRows(rows: Row[]): Row[] {
  return rows.map((r) => ({...r, id: uid('r')}));
}

const isLabor = (r: Row, itemId: string) => r.kind === 'labor' && r.refId === itemId;

/** 手間の箇所数（同じ手間が何行かあれば足す） */
export function laborCount(rows: Row[], itemId: string): number {
  return rows.reduce((n, r) => (isLabor(r, itemId) ? n + r.qty : n), 0);
}

/**
 * 手間の箇所数を n にする。増やすときは同じ手間の一番下の行に足し（なければ最後に1行入れる）、
 * 減らすときは下の行から減らして、0 になった行は消す。
 * 部材ごとに分けて入れた手間の行（見積書の「同上施工費」）は1行にまとめない。
 */
export function setLaborCount(rows: Row[], item: LaborItem, n: number): Row[] {
  let delta = Math.max(0, n) - laborCount(rows, item.id);
  if (delta === 0) return rows;
  if (delta > 0) {
    let last = -1;
    rows.forEach((r, i) => {
      if (isLabor(r, item.id)) last = i;
    });
    if (last < 0) return [...rows, laborRow(item, delta)];
    return rows.map((r, i) => (i === last ? {...r, qty: r.qty + delta} : r));
  }
  const out = [...rows];
  for (let i = out.length - 1; i >= 0 && delta < 0; i--) {
    if (!isLabor(out[i], item.id)) continue;
    const take = Math.min(out[i].qty, -delta);
    out[i] = {...out[i], qty: out[i].qty - take};
    delta += take;
  }
  return out.filter((r) => !(isLabor(r, item.id) && r.qty <= 0));
}

/** 部材の行（at）のすぐ下に続く手間の行の範囲 [start, end)。見積書ではここが「同上施工費」になる */
export function workRange(rows: Row[], at: number): [number, number] {
  let end = at + 1;
  while (end < rows.length && rows[end].kind === 'labor') end++;
  return [at + 1, end];
}

/** rows の [start, end) を next に入れ替える */
export function replaceRange(rows: Row[], [start, end]: [number, number], next: Row[]): Row[] {
  return [...rows.slice(0, start), ...next, ...rows.slice(end)];
}

/** 箇所の行から一式を作る */
export function kitFromRows(name: string, rows: Row[]): Kit {
  return {id: uid('k'), name: name.trim(), rows: copyRows(rows), updatedAt: Date.now()};
}

/**
 * 一式を箇所に入れる行にする。IDを付け直し、部材リスト・取付手間の単価に今もあるものは今の単価・定価にする
 * （仕切り表を新しくしても、一式を作り直さなくてよい）。
 */
export function kitRows(kit: Kit, materials: Material[], labor: LaborItem[]): Row[] {
  const mats = new Map(materials.map((m) => [m.id, m]));
  const labs = new Map(labor.map((l) => [l.id, l]));
  return copyRows(kit.rows).map((r) => {
    if (!r.refId) return r;
    if (r.kind === 'material') {
      const m = mats.get(r.refId);
      return m ? {...r, price: m.price, listPrice: m.listPrice, pieceLengthM: m.pieceLengthM || r.pieceLengthM} : r;
    }
    const l = labs.get(r.refId);
    return l ? {...r, price: l.price} : r;
  });
}

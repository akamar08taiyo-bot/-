// 箇所の行を作る・取付手間の箇所数を数える・部材＋施工費（常用）を入れる などの行の操作

import {isBlankRow} from './calc.ts';
import {normalize} from './priceImport.ts';
import type {Kit, LaborItem, Material, Place, Row, RowKind} from './types.ts';
import {uid} from './util.ts';

/** 品番を比べるための形（全角・大文字小文字・空白・ハイフンの違いは同じとみる） */
export const codeKey = (code: string) => normalize(code).toLowerCase().replace(/[\s\-‐－ー―]/g, '');

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
  estText: null,
  estNote: null,
  estAmount: null,
};

/** 新しい箇所。見積書の改修の種類は「①手すりの取り付け」（改修内容・工事名称もここから）、写真番号は箇所の順番 */
export function newPlace(name: string, rows: Row[] = []): Place {
  return {id: uid('p'), name: name.trim(), rows, kind: 1, photo: 0};
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

/**
 * 部材を選ぶ画面の「＋ 追加」：選んだ部材を箇所に1行入れる（見積書で選んでいる行の所。`insertRowsAt`）。
 * 同じ部材がもう箇所にあっても、その行に数量を足さずに別の行にする（ユーザーの指示「施工費や部材を追加する際は、同じ部材を追加する場合でも、
 * 1箇所につき、部材をのせていく。例えばBD-132 BD-08G 施工費2000円が2箇所ある場合は、たさずにそれぞれでこの部材を追加していく」2026-11-02。
 * 前は同じ部材の行の数量が増え、2か所目の手すりのエンドブラケットが1か所目の行に足されていた）。入れた行の数量は、選ぶ画面の ＋／−（`changeRowQty`）
 */
export function addMaterial(rows: Row[], row: Row, at: string | null = null): Row[] {
  return insertRowsAt(rows, [row], at);
}

/** 部材を選ぶ画面の ＋／−：その行（いま入れた行）の数量を delta だけ変える。0 になったら行を消す（`removeOneMaterial` と同じ消し方） */
export function changeRowQty(rows: Row[], rowId: string, delta: number): Row[] {
  const at = rows.findIndex((r) => r.id === rowId);
  if (at < 0) return rows;
  const qty = rows[at].qty + delta;
  return qty > 0 ? rows.map((r, i) => (i === at ? {...r, qty} : r)) : dropMaterialAt(rows, at);
}

/**
 * 見積書で選んでいる（タップしている）行のところに行を入れる（ユーザーの指示「タップしている部分に、施工費や部材をいれる」）：
 * 選んでいる行が空白の行ならその行と入れ替え、ほかの行ならその行の組（部材とすぐ下の同上施工費）のすぐ下。選んでいなければいちばん下
 */
export function insertRowsAt(rows: Row[], add: Row[], at: string | null): Row[] {
  const i = at ? rows.findIndex((r) => r.id === at) : -1;
  if (i < 0) return [...rows, ...add];
  if (isBlankRow(rows[i])) return [...rows.slice(0, i), ...add, ...rows.slice(i + 1)];
  let end = i + 1;
  while (end < rows.length && rows[end].kind === 'labor') end++;
  return [...rows.slice(0, end), ...add, ...rows.slice(end)];
}

/**
 * 部材を選ぶ画面の −：同じ部材の数量を1つ減らす。0 になったら行を消す。
 * すぐ下の施工費（同上施工費）は、上の部材の同上施工費としてそのまま残す（手すり・ブラケット・エンドのあとの施工費など）。
 * ただし上が施工費の行のときは一緒に消す（見積書の ✕ と同じ）：残すと上の施工費のまとまりに入り、手で直した見積の金額には入らないまま
 * 仕切り計算表にだけ残って、見積書と請求書が合わなくなった
 */
export function removeOneMaterial(rows: Row[], refId: string): Row[] {
  const at = rows.findIndex((r) => r.kind === 'material' && r.refId === refId);
  if (at < 0) return rows;
  const same = rows[at];
  if (same.qty > 1) return rows.map((r) => (r === same ? {...r, qty: r.qty - 1} : r));
  return dropMaterialAt(rows, at);
}

/** 部材の行を消す。上が施工費の行なら、すぐ下の施工費（同上施工費）も一緒に消す（`removeOneMaterial` のわけ） */
function dropMaterialAt(rows: Row[], at: number): Row[] {
  const end = at > 0 && rows[at - 1].kind === 'labor' ? workRange(rows, at)[1] : at + 1;
  return [...rows.slice(0, at), ...rows.slice(end)];
}

/** 取付手間の行。仕切り（笹岡工務店）と見積の単価を書き写す */
export function laborRow(item: LaborItem, qty = 1): Row {
  return {...BLANK, id: uid('r'), kind: 'labor', refId: item.id, name: item.name, price: item.price, estPrice: item.estPrice ?? null, qty};
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
 * 一番下の同じ手間の行が、いちばん下の部材より上（前の手すりの同上施工費）なら、そこには足さずに最後に1行入れる（いちばん下の部材の同上施工費になる。
 * ユーザーの指示「BD-132 BD-08G 施工費2000円が2箇所ある場合は、たさずにそれぞれでこの部材を追加していく」2026-11-02）。
 * 箇所のはじめの施工費（上に部材のない行）には今までどおり足す
 */
export function setLaborCount(rows: Row[], item: LaborItem, n: number): Row[] {
  let delta = Math.max(0, n) - laborCount(rows, item.id);
  if (delta === 0) return rows;
  if (delta > 0) {
    let last = -1;
    let lastMaterial = -1;
    rows.forEach((r, i) => {
      if (isLabor(r, item.id)) last = i;
      if (r.kind === 'material' && !isBlankRow(r)) lastMaterial = i;
    });
    const lead = last >= 0 && !rows.slice(0, last).some((r) => r.kind === 'material' && !isBlankRow(r));
    if (last < 0 || (last < lastMaterial && !lead)) {
      const added = [...rows, laborRow(item, delta)];
      return autoGroupAmount(added, [added.length - 1]);
    }
    return autoGroupAmount(
      rows.map((r, i) => (i === last ? {...r, qty: r.qty + delta} : r)),
      [last],
    );
  }
  const out = [...rows];
  const changed: number[] = [];
  for (let i = out.length - 1; i >= 0 && delta < 0; i--) {
    if (!isLabor(out[i], item.id)) continue;
    const take = Math.min(out[i].qty, -delta);
    out[i] = {...out[i], qty: out[i].qty - take};
    changed.push(i);
    delta += take;
  }
  return autoGroupAmount(out, changed).filter((r) => !(isLabor(r, item.id) && r.qty <= 0));
}

/**
 * 箇所数を変えた施工費のまとまり（続いた手間の行＝見積書の1行）は、見積書で手で直した金額（estAmount）を外して自動の金額に戻す。
 * 残すと、木を足しても・タイルを足しても見積書の金額が打った金額のままで、足した施工費が入らなかった（2026-11-02 のデバッグで見つけた）
 */
function autoGroupAmount(rows: Row[], at: number[]): Row[] {
  const out = [...rows];
  for (const i of at) {
    if (out[i]?.kind !== 'labor') continue;
    let start = i;
    while (start > 0 && out[start - 1].kind === 'labor') start--;
    for (let k = start; k < out.length && out[k].kind === 'labor'; k++) if (out[k].estAmount != null) out[k] = {...out[k], estAmount: null};
  }
  return out;
}

/**
 * 施工費（手間）の行が数えている部材：すぐ上の部材（あいだの施工費の行はとばす。見積書の「同上施工費」の部材と同じ）。
 * 箇所のはじめの施工費・空白の行の下の施工費は null
 */
export function laborOwner(rows: Row[], i: number): Row | null {
  if (rows[i]?.kind !== 'labor') return null;
  for (let k = i - 1; k >= 0; k--) if (rows[k].kind === 'material') return isBlankRow(rows[k]) ? null : rows[k];
  return null;
}

/**
 * 施工費の行に出す、取り付ける部材の名前（商品名と型番）：「手すり（丸棒 4000mm） BD-134 の施工費」。
 * 施工費の名前（木・タイル…）だけでは何の施工費か分からなかった（ユーザーの指示「商品名と型番を記載する」2026-10-29）
 */
export const laborForText = (owner: Row): string => `${[owner.name.trim(), owner.code.trim()].filter(Boolean).join(' ') || '部材'} の施工費`;

/** 部材の行（at）のすぐ下に続く手間の行の範囲 [start, end)。見積書ではここが「同上施工費」になる */
export function workRange(rows: Row[], at: number): [number, number] {
  let end = at + 1;
  while (end < rows.length && rows[end].kind === 'labor') end++;
  return [at + 1, end];
}

/**
 * 施工費を入れる所（見積書で選んでいる＝タップしている行から決める）。owner：すぐ下の手間を数える部材（null は箇所のはじめの施工費）。
 * 同上施工費の行ならその上の部材。空白の行なら、施工費はその行に入る（drop＝施工費を入れたら外す空白の行。すぐ上の部材の同上施工費になる）。
 * 行を選んでいなければ箇所の全部（whole）
 */
export type LaborSpot = {whole: boolean; owner: string | null; drop: string | null};
export function laborSpot(rows: Row[], rowId: string | null): LaborSpot {
  const i = rowId ? rows.findIndex((r) => r.id === rowId) : -1;
  if (i < 0) return {whole: true, owner: null, drop: null};
  const blank = isBlankRow(rows[i]);
  let k = blank ? i - 1 : i;
  while (k >= 0 && rows[k].kind === 'labor') k--;
  return {whole: false, owner: k >= 0 ? rows[k].id : null, drop: blank ? rows[i].id : null};
}

/** laborSpot の手間の行の範囲 [start, end)（外す空白の行もふくむ） */
export function laborRange(rows: Row[], spot: LaborSpot): [number, number] {
  if (spot.whole) return [0, rows.length];
  const start = spot.owner ? rows.findIndex((r) => r.id === spot.owner) + 1 : 0;
  if (spot.owner && start === 0) return [0, rows.length]; // 部材がなくなっていたら箇所の全部
  let end = start;
  while (end < rows.length && (rows[end].kind === 'labor' || rows[end].id === spot.drop)) end++;
  return [start, end];
}

/** rows の [start, end) を next に入れ替える */
export function replaceRange(rows: Row[], [start, end]: [number, number], next: Row[]): Row[] {
  return [...rows.slice(0, start), ...next, ...rows.slice(end)];
}

/** 箇所の行から部材＋施工費（常用）を作る */
export function kitFromRows(name: string, rows: Row[]): Kit {
  return {id: uid('k'), name: name.trim(), rows: copyRows(rows), updatedAt: Date.now()};
}

/**
 * 部材＋施工費（常用）を箇所に入れる行にする。IDを付け直し、部材リスト・取付手間の単価に今もあるものは今の単価・定価にする
 * （仕切り表を新しくしても、作り直さなくてよい）。
 */
export function kitRows(kit: Kit, materials: Material[], labor: LaborItem[]): Row[] {
  const mats = new Map(materials.map((m) => [m.id, m]));
  const labs = new Map(labor.map((l) => [l.id, l]));
  return copyRows(kit.rows).map((r) => {
    if (!r.refId) {
      // 品番だけ入れた行（例のセットなど）：部材リストに同じ品番があれば、その部材にする（あとから価格表を取り込んでも使える）
      const m = r.kind === 'material' && r.code.trim() ? materials.find((x) => codeKey(x.code) === codeKey(r.code)) : undefined;
      return m ? {...materialRow(m, r.qty), id: r.id, lengthCm: r.lengthCm, excluded: r.excluded} : r;
    }
    if (r.kind === 'material') {
      const m = mats.get(r.refId);
      return m ? {...r, price: m.price, listPrice: m.listPrice, pieceLengthM: m.pieceLengthM || r.pieceLengthM} : r;
    }
    const l = labs.get(r.refId);
    return l ? {...r, price: l.price, estPrice: l.estPrice ?? null} : r;
  });
}

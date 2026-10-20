// 発注書：見積書に入っている部材を「何を何個（何本・何枚）発注するか」にまとめる。
//   同じ部材（メーカー・品番・品名が同じ）は、箇所をまたいで足す。施工費（手間）の行・何も入っていない行は入れない。
//   切って使う部材（マツ六の手すり BD-134・ベースプレートなど、1本の長さと使う長さの入った部材）は、
//   使う長さを足して、1本（4000mm）を何本発注するかを数える：
//     ・同じ1本から切れるものはまとめる（長いものから順に、入る1本に入れていく）
//     ・半分の長さ（4000mm なら 2000mm）で足りる1本は、2000mm にする（部材リストの 2000mm の品。なければ品番を空けて知らせる）
//     ・余り（発注する長さ − 使う長さ）が 0.1本（4000mm なら 400mm）より少ないときは危ないので、もう1本（2000mm）
//     例：600mm×2＋1600mm×1＝2800mm（0.7本）→ 4000mm を1本（余り 1200mm）
//         1600mm×1（0.4本）→ 2000mm を1本（余り 400mm）
//         3800mm×1（0.95本）→ 4000mm を1本、余りが 200mm しかないので 2000mm をもう1本
//   そのほか（規格品をそのまま使う部材）は見積書の数量のまま。
// 発注書で数を直した・消した・足した行は、様邸の order に持つ（見積書を直しても、手で直したところはそのまま）。

import {cutToLength, isBlankRow, listPriceOf, shikiriPrice} from './calc.ts';
import {normalize} from './priceImport.ts';
import type {Job, Material, OrderEdits, OrderLine, Row} from './types.ts';
import {num, staffShort, uid} from './util.ts';

/** 余りがこれより少ないと危ないので、もう1本（1本の長さに対する割合。4000mm なら 400mm） */
export const ORDER_MARGIN = 0.1;

const EPS = 1e-6;
const norm = (s: string) => normalize(s).toLowerCase();
const mm = (x: number) => String(Math.round(x * 10) / 10); // 見積書と同じく桁区切りなし（4000mm）

export function emptyOrderEdits(): OrderEdits {
  return {qty: {}, removed: [], added: [], supplier: '', date: '', note: ''};
}

/** 単位が空の部材：切って使うものは「本」（ベースプレート・板は「枚」）、ほかは「個」 */
function unitOf(r: Pick<Row, 'unit' | 'name'>, bar: boolean): string {
  const u = r.unit.trim();
  if (u) return u;
  if (!bar) return '個';
  return /プレート|板/.test(normalize(r.name)) ? '枚' : '本';
}

// ---------------------------------------------------------------- 切って使う部材の本数

export type BarPlan = {
  full: number; // 1本の長さ（4000mm）の本数
  half: number; // 半分の長さ（2000mm）の本数
  totalMm: number; // 使う長さの合計
  slackMm: number; // 余り（発注する長さの合計 − 使う長さの合計）
  extra: boolean; // 余りが 0.1本より少ないので、もう1本足した
  halved: boolean; // 2000mm で足りる1本を 2000mm にした
};

/**
 * 使う長さ（mm×本数）から、1本 stockMm の部材を何本発注するか。halfOk のときは、半分の長さの品も使う。
 * 1本より長いもの（継いで使う）は、まるごとの1本と残りに分けて数える
 */
export function planBars(pieces: {mm: number; count: number}[], stockMm: number, halfOk: boolean, margin = ORDER_MARGIN): BarPlan {
  const list: number[] = [];
  let joined = 0;
  const put = (len: number) => {
    if (!(len > EPS)) return;
    const n = Math.floor(len / stockMm + EPS);
    joined += n;
    const rest = len - n * stockMm;
    if (rest > EPS) list.push(rest);
  };
  for (const p of pieces) {
    const count = Math.max(0, p.count);
    for (let i = 1; i <= Math.floor(count + EPS); i++) put(p.mm);
    const frac = count - Math.floor(count + EPS);
    if (frac > EPS) put(p.mm * frac);
  }
  // 長いものから順に、入る1本に入れていく（入らなければ新しい1本）
  list.sort((a, b) => b - a);
  const bins: number[] = [];
  for (const len of list) {
    const i = bins.findIndex((used) => used + len <= stockMm + EPS);
    if (i >= 0) bins[i] += len;
    else bins.push(len);
  }
  const totalMm = joined * stockMm + list.reduce((a, b) => a + b, 0);
  const halfMm = stockMm / 2;
  const need = margin * stockMm;
  let full = joined + bins.length;
  let half = 0;
  let slack = full * stockMm - totalMm;
  let halved = false;
  // いちばん少ししか使わない1本が半分の長さで足り、それでも余りが 0.1本以上あれば、半分の長さにする
  if (halfOk && bins.length > 0 && Math.min(...bins) <= halfMm + EPS && slack - halfMm >= need - EPS) {
    full--;
    half++;
    slack -= halfMm;
    halved = true;
  }
  let extra = false;
  if (slack < need - EPS) {
    extra = true;
    if (halfOk) half++;
    else full++;
    slack += halfOk ? halfMm : stockMm;
  }
  return {full, half, totalMm, slackMm: slack, extra, halved};
}

// ---------------------------------------------------------------- 2000mm の品

/** 名前から長さ（4000mm・4m・L=4000）を除いたもの。長さだけが違う同じ品かを比べる */
function withoutLength(name: string): string {
  return norm(name)
    .replace(/\d+(?:\.\d+)?\s*(?:mm|m)(?![a-z])/g, '#')
    .replace(/(^|[^a-z])l\s*[=:]?\s*\d{3,5}(?!\d)/g, '$1#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 品番から半分の長さの品番の見当（HD5-4000 → HD5-2000、BD-134（4m）→ BD-132）。部材リストの中から選ぶときの手がかりだけに使う */
function halfCodes(code: string, stockMm: number): string[] {
  const c = norm(code);
  if (!c) return [];
  const out: string[] = [];
  const half = stockMm / 2;
  if (c.includes(String(stockMm))) out.push(c.replace(String(stockMm), String(half)));
  const m = stockMm / 1000;
  if (Number.isInteger(m) && Number.isInteger(m / 2) && new RegExp(`\\d${m}$`).test(c)) out.push(c.slice(0, -1) + String(m / 2));
  return out;
}

/** 部材リストから、同じ品で半分の長さ（4000mm なら 2000mm）のものを探す。なければ null */
export function findHalfMaterial(r: Pick<Row, 'maker' | 'code' | 'name' | 'refId'>, stockMm: number, materials: Material[]): Material | null {
  const halfMm = stockMm / 2;
  const maker = norm(r.maker);
  const cands = materials.filter(
    (m) => m.id !== r.refId && m.pieceLengthM > 0 && Math.abs(m.pieceLengthM * 1000 - halfMm) < 1 && (!maker || norm(m.maker) === maker),
  );
  if (cands.length === 0) return null;
  const codes = halfCodes(r.code, stockMm);
  const codeHit = (m: Material) => codes.includes(norm(m.code));
  const base = withoutLength(r.name);
  const byName = cands.filter((m) => withoutLength(m.name) === base);
  return byName.find(codeHit) ?? byName[0] ?? cands.find(codeHit) ?? null;
}

/** 部材リストに 2000mm の品がないときの品名（4000mm → 2000mm に書きかえる。長さが書いてなければうしろに付ける） */
function halfName(name: string, stockMm: number): string {
  const half = stockMm / 2;
  const n = name.trim();
  const re = new RegExp(`${stockMm}\\s*mm`, 'i');
  if (re.test(n)) return n.replace(re, `${half}mm`);
  const reM = new RegExp(`(^|[^\\d.])${stockMm / 1000}\\s*m(?![a-z])`, 'i');
  if (reM.test(n)) return n.replace(reM, `$1${half / 1000}m`);
  return `${n}（${half}mm）`;
}

// ---------------------------------------------------------------- 見積書から発注書の行を作る

type Group = {
  key: string;
  first: Row;
  stockMm: number; // 1本の長さ（mm）。0 なら長さでは数えない
  whole: number; // 切らずに使う数
  pieces: Map<number, number>; // 切って使う長さ（mm）→ 本数
  places: Map<string, number>; // 箇所 → 数（規格品のとき、内訳に出す）
};

const productKey = (r: Row) => [r.maker, r.code, r.name].map(norm).join('|');

/** 見積書の部材から、発注書の行を作る（手で直したところは入れない） */
export function orderBaseLines(job: Pick<Job, 'places'>, materials: Material[]): OrderLine[] {
  const groups = new Map<string, Group>();
  for (const place of job.places) {
    for (const r of place.rows) {
      if (r.kind !== 'material' || isBlankRow(r)) continue;
      if (!r.name.trim() && !r.code.trim()) continue; // 金額だけの行（値引きなど）は発注しない
      if (!(r.qty > 0)) continue;
      const stockMm = r.pieceLengthM > 0 ? Math.round(r.pieceLengthM * 1000) : 0;
      const key = stockMm > 0 ? `bar:${productKey(r)}|${stockMm}` : `qty:${productKey(r)}|${norm(r.unit)}`;
      let g = groups.get(key);
      if (!g) {
        g = {key, first: r, stockMm, whole: 0, pieces: new Map(), places: new Map()};
        groups.set(key, g);
      }
      if (cutToLength(r)) {
        const len = Math.round(r.lengthCm * 100) / 10;
        g.pieces.set(len, (g.pieces.get(len) ?? 0) + r.qty);
      } else {
        g.whole += r.qty;
        const pn = place.name.trim() || '（箇所名なし）';
        g.places.set(pn, (g.places.get(pn) ?? 0) + r.qty);
      }
    }
  }

  const out: OrderLine[] = [];
  for (const g of groups.values()) {
    const r = g.first;
    const bar = g.stockMm > 0;
    const unit = unitOf(r, bar);
    const line: OrderLine = {
      key: g.key,
      refId: r.refId,
      maker: r.maker.trim(),
      code: r.code.trim(),
      name: r.name.trim(),
      unit,
      qty: g.whole,
      calc: g.whole,
      lengthMm: bar ? g.stockMm : 0,
      price: shikiriPrice(r),
      listPrice: listPriceOf(r),
      detail: '',
      warn: '',
    };
    if (g.pieces.size === 0) {
      // 規格品をそのまま使う：見積書の数量のまま。2か所以上なら箇所ごとの数を内訳に
      if (g.places.size > 1) line.detail = [...g.places].map(([pn, q]) => `${pn} ${num(q, 3)}${unit}`).join('＋');
      out.push(line);
      continue;
    }

    const halfMat = findHalfMaterial(r, g.stockMm, materials);
    // 4000mm の部材は 2000mm も発注できる（部材リストになければ品番を空けて知らせる）
    const halfOk = halfMat !== null || g.stockMm === 4000;
    const pieces = [...g.pieces].map(([len, count]) => ({mm: len, count})); // 見積書に出てくる順
    const plan = planBars(pieces, g.stockMm, halfOk);
    line.qty = line.calc = g.whole + plan.full;

    const used = pieces.map((p) => `${mm(p.mm)}mm×${num(p.count, 3)}${unit}`).join('＋');
    const ratio = num(plan.totalMm / g.stockMm, 3);
    const half = g.stockMm / 2;
    const order = [plan.full > 0 ? `${g.stockMm}mm ${plan.full}${unit}` : '', plan.half > 0 ? `${half}mm ${plan.half}${unit}` : ''].filter(Boolean).join('＋');
    const why = plan.extra
      ? `余りが${mm(g.stockMm * ORDER_MARGIN)}mm（${ORDER_MARGIN}${unit}）より少ないので${halfOk ? `${half}mm` : ''}をもう1${unit}`
      : `余り ${mm(plan.slackMm)}mm`;
    line.detail =
      (g.whole > 0 ? `切らずに使う ${num(g.whole, 3)}${unit}＋` : '') +
      `使う長さ ${used}＝${mm(plan.totalMm)}mm（${ratio}${unit}）→ ${order}（${why}）`;
    if (line.qty > 0) out.push(line);

    if (plan.half > 0) {
      const hl: OrderLine = halfMat
        ? {
            ...line,
            key: `half:${productKey(r)}|${g.stockMm}`,
            refId: halfMat.id,
            maker: halfMat.maker.trim() || line.maker,
            code: halfMat.code.trim(),
            name: halfMat.name.trim(),
            unit: halfMat.unit.trim() || unit,
            price: shikiriPrice({kind: 'material', price: halfMat.price, listPrice: halfMat.listPrice}),
            listPrice: listPriceOf({kind: 'material', price: halfMat.price, listPrice: halfMat.listPrice}),
          }
        : {
            ...line,
            key: `half:${productKey(r)}|${g.stockMm}`,
            refId: null,
            code: '',
            name: halfName(r.name, g.stockMm),
            price: 0,
            listPrice: 0,
            warn: `${half}mmの品が部材リストにありません。品番・価格を確かめてください`,
          };
      hl.lengthMm = half;
      hl.qty = hl.calc = plan.half;
      // 4000mm を発注しないとき（2000mm だけで足りる）は、計算をこの行に出す
      hl.detail =
        line.qty > 0 ? `${line.code || line.name}（${g.stockMm}mm）の${plan.extra && !plan.halved ? '余りが少ないので足す分' : `${half}mmで足りる分`}` : line.detail;
      out.push(hl);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 手で直したところを重ねる

/** 発注書に並べる行：見積書から作った行（消したものを除き、直した数にする）＋発注書で足した行 */
export function applyOrderEdits(base: OrderLine[], edits: OrderEdits | null | undefined): OrderLine[] {
  if (!edits) return base;
  const removed = new Set(edits.removed);
  const has = (k: string) => Object.prototype.hasOwnProperty.call(edits.qty, k);
  const lines = base.filter((l) => !removed.has(l.key)).map((l) => (has(l.key) ? {...l, qty: edits.qty[l.key]} : l));
  return [...lines, ...edits.added];
}

/** 見積書から作った行のうち、発注書で消したもの（「戻す」に出す） */
export function removedLines(base: OrderLine[], edits: OrderEdits | null | undefined): OrderLine[] {
  if (!edits) return [];
  const removed = new Set(edits.removed);
  return base.filter((l) => removed.has(l.key));
}

/** 行の数を変える。見積書から計算した数に戻したら、直した印を消す */
export function setOrderQty(edits: OrderEdits, line: OrderLine, qty: number): OrderEdits {
  const q = Math.max(0, Math.round(qty * 1000) / 1000);
  if (line.key.startsWith('add:')) return {...edits, added: edits.added.map((l) => (l.key === line.key ? {...l, qty: q} : l))};
  const next = {...edits.qty};
  if (Math.abs(q - line.calc) < EPS) delete next[line.key];
  else next[line.key] = q;
  return {...edits, qty: next};
}

/** 見積書から作った行の数を delta だけ増やす（発注書で直した数があれば、その数から） */
export function bumpOrderQty(edits: OrderEdits, line: OrderLine, delta: number): OrderEdits {
  const now = Object.prototype.hasOwnProperty.call(edits.qty, line.key) ? edits.qty[line.key] : line.calc;
  return setOrderQty(edits, line, now + delta);
}

export function removeOrderLine(edits: OrderEdits, line: OrderLine): OrderEdits {
  if (line.key.startsWith('add:')) return {...edits, added: edits.added.filter((l) => l.key !== line.key)};
  const next = {...edits.qty};
  delete next[line.key];
  return {...edits, qty: next, removed: edits.removed.includes(line.key) ? edits.removed : [...edits.removed, line.key]};
}

export function restoreOrderLine(edits: OrderEdits, key: string): OrderEdits {
  return {...edits, removed: edits.removed.filter((k) => k !== key)};
}

/** 発注書で足す行（部材リストから選んだ部材・手入力）。同じ部材がもう足してあれば数を足す */
export function addOrderLine(edits: OrderEdits, row: Pick<Row, 'refId' | 'maker' | 'code' | 'name' | 'unit' | 'qty' | 'price' | 'listPrice' | 'pieceLengthM'>): OrderEdits {
  const same = row.refId ? edits.added.find((l) => l.refId === row.refId) : undefined;
  if (same) return {...edits, added: edits.added.map((l) => (l === same ? {...l, qty: l.qty + row.qty} : l))};
  const r = {kind: 'material' as const, price: row.price, listPrice: row.listPrice};
  const line: OrderLine = {
    key: uid('add:'),
    refId: row.refId,
    maker: row.maker.trim(),
    code: row.code.trim(),
    name: row.name.trim(),
    unit: unitOf(row, row.pieceLengthM > 0),
    qty: row.qty,
    calc: 0,
    lengthMm: 0,
    price: shikiriPrice(r),
    listPrice: listPriceOf(r),
    detail: '',
    warn: '',
  };
  return {...edits, added: [...edits.added, line]};
}

/** 発注書で足した部材を1つ減らす（0 で行を消す）。部材を選ぶ画面の − */
export function removeOneOrderLine(edits: OrderEdits, refId: string): OrderEdits {
  const same = edits.added.find((l) => l.refId === refId);
  if (!same) return edits;
  return same.qty > 1
    ? {...edits, added: edits.added.map((l) => (l === same ? {...l, qty: l.qty - 1} : l))}
    : {...edits, added: edits.added.filter((l) => l !== same)};
}

/** 発注する行（数が 0 の行は発注しない） */
export const orderedLines = (lines: OrderLine[]) => lines.filter((l) => l.qty > 0);

/** 単位ごとの合計（「3本・2枚・12個」） */
export function unitTotals(lines: OrderLine[]): string {
  const sums = new Map<string, number>();
  for (const l of orderedLines(lines)) sums.set(l.unit, (sums.get(l.unit) ?? 0) + l.qty);
  return [...sums].map(([u, q]) => `${num(q, 3)}${u}`).join('・');
}

// ---------------------------------------------------------------- 販売受注簿へ渡す

/** 販売受注簿作成ツールへ渡す内容を置く場所（同じサイトなので、この端末の localStorage で渡せる） */
export const HACCHU_IMPORT_KEY = 'taiyo-hacchu-import-v1';
/** 販売受注簿作成ツール（太陽ポータルと同じサイトの /taiyo-hacchu-scan/） */
export const HACCHU_PATH = '/taiyo-hacchu-scan/';

export type HacchuItem = {
  productName: string;
  maker: string;
  modelNumber: string; // 品番
  quantity: number; // 1以上の整数（販売受注簿の数量は整数）
  unit: string;
  listPrice: number; // 定価（税抜・1つあたり）。分からなければ 0
  cost: number; // 仕切り（税抜・1つあたり）。分からなければ 0
  note: string;
};

export type HacchuImport = {
  kind: 'taiyo-jutaku-order';
  v: 1;
  createdAt: number;
  title: string; // 何の発注か（「山田様邸 住宅改修」）
  customerName: string;
  address: string;
  sales: string; // 営業担当（名字）
  supplier: string; // 発注先
  items: HacchuItem[];
};

export function hacchuImport(job: Pick<Job, 'customer' | 'suffix' | 'address' | 'staff'>, lines: OrderLine[], edits: OrderEdits | null | undefined): HacchuImport {
  const customer = job.customer.trim();
  return {
    kind: 'taiyo-jutaku-order',
    v: 1,
    createdAt: Date.now(),
    title: `${customer ? `${customer}${job.suffix || '様'} ` : ''}住宅改修`,
    customerName: customer,
    address: job.address.trim(),
    sales: staffShort(job.staff),
    supplier: edits?.supplier.trim() ?? '',
    items: orderedLines(lines).map((l) => ({
      productName: l.name || l.code,
      maker: l.maker,
      modelNumber: l.code,
      quantity: Math.max(1, Math.ceil(l.qty - EPS)),
      unit: l.unit,
      listPrice: l.listPrice,
      cost: l.price,
      note: l.detail,
    })),
  };
}

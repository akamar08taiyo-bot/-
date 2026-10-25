// 案件（お客様1件の販売）を作る・写す・商品マスタから明細を入れる部品。画面から呼ぶ（計算は calc.ts）

import {INSURERS} from './defaults.ts';
import type {Product, Sale, SaleItem, Settings} from './types.ts';
import {todayIso, uid} from './util.ts';
import {fiscalYearOf} from './wareki.ts';

/** 見積番号：見積日（YYYYMMDD）＋その日の何件目か（「20261021-2」） */
export function nextQuoteNo(sales: Sale[], date: string): string {
  const day = date.replace(/-/g, '');
  const used = new Set(sales.map((s) => s.quoteNo));
  for (let n = 1; ; n++) {
    const no = `${day}-${n}`;
    if (!used.has(no)) return no;
  }
}

export function newSale(sales: Sale[], settings: Settings, insurer: string, now = Date.now()): Sale {
  const date = todayIso();
  return {
    id: uid('s'),
    customer: '',
    kana: '',
    insuredNo: '',
    birthDate: '',
    gender: '',
    zip: '',
    address: '',
    tel: '',
    careLevel: '',
    insurer,
    insurerName: '',
    burdenRatio: 1,
    payMethod: '受領委任払い',
    remaining: null,
    perItem: INSURERS.find((i) => i.key === insurer)?.perItem ?? false,
    welfare: false,
    staff: settings.staffList[0] ?? '',
    careOffice: '',
    careManager: '',
    carePlan: '',
    quoteNo: nextQuoteNo(sales, date),
    estimateDate: date,
    applyDate: '',
    approveDate: '',
    deliveryDate: '',
    claimDate: '',
    collectDate: '',
    status: '見積',
    note: '',
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 案件を写す（同じお客様に別の見積もり・似た見積もりを作るとき）。日付と状態は新しくする */
export function copySale(sale: Sale, sales: Sale[], now = Date.now()): Sale {
  const date = todayIso();
  return {
    ...sale,
    id: uid('s'),
    quoteNo: nextQuoteNo(sales, date),
    estimateDate: date,
    applyDate: '',
    approveDate: '',
    deliveryDate: '',
    claimDate: '',
    collectDate: '',
    status: '見積',
    items: sale.items.map((i) => ({...i, id: uid('i')})),
    createdAt: now,
    updatedAt: now,
  };
}

/** 商品マスタの商品を明細の1行にする（値を書き写す。割引率は設定の初期値） */
export function itemFromProduct(p: Product, settings: Pick<Settings, 'discountRate'>): SaleItem {
  return {
    id: uid('i'),
    productId: p.id,
    name: p.name,
    maker: p.maker,
    code: p.code,
    tais: p.tais,
    category: p.category,
    sub: p.sub,
    unit: p.unit || '台',
    supplier: p.supplier,
    taxType: p.taxType,
    listPrice: p.listPrice,
    cost: p.cost,
    qty: 1,
    discountRate: settings.discountRate,
    unitPrice: null,
    reason: '',
  };
}

/** 手で入れる明細（商品マスタにない商品） */
export function blankItem(settings: Pick<Settings, 'discountRate'>): SaleItem {
  return {
    id: uid('i'),
    productId: null,
    name: '',
    maker: '',
    code: '',
    tais: '',
    category: '',
    sub: '',
    unit: '台',
    supplier: '',
    taxType: '10%',
    listPrice: 0,
    cost: 0,
    qty: 1,
    discountRate: settings.discountRate,
    unitPrice: null,
    reason: '',
  };
}

/** 案件で使った商品の「よく使う回数」を1つ増やす（★の中でもよく使う順に並べるため） */
export function markUsed(products: Product[], productId: string, now = Date.now()): Product[] {
  return products.map((p) => (p.id === productId ? {...p, useCount: p.useCount + 1, lastUsedAt: now} : p));
}

/** お客様名の表示（未入力でも一覧で分かるように） */
export function customerLabel(sale: Sale): string {
  return sale.customer.trim() ? `${sale.customer.trim()} 様` : '（お客様名未入力）';
}

/** 印刷・申請の前に確かめてほしいこと（種目が決まっていない・価格がない・仕切がない商品など） */
export function saleWarnings(sale: Sale): string[] {
  const out: string[] = [];
  const named = (i: SaleItem) => i.name.trim() || '（商品名なし）';
  const noCat = sale.items.filter((i) => !i.category);
  if (noCat.length) out.push(`種目が決まっていない商品：${noCat.map(named).join('、')}`);
  const noPrice = sale.items.filter((i) => i.unitPrice === null && i.listPrice <= 0 && i.cost <= 0);
  if (noPrice.length) out.push(`価格が入っていない商品：${noPrice.map(named).join('、')}`);
  const noCost = sale.items.filter((i) => i.cost <= 0);
  if (noCost.length) out.push(`仕切が入っていない商品（利益が分かりません）：${noCost.map(named).join('、')}`);
  if (!sale.insurer || (sale.insurer === 'other' && !sale.insurerName.trim())) out.push('保険者が選ばれていません');
  return out;
}

// ---------------------------------------------------------------- 前に入れたものを使い回す（ユーザーの指示「無駄を省けるようにする」）

/** 同じお客様かの見分け：被保険者番号（10けたにそろえる）、なければ 名前＋生年月日 */
export function customerKey(sale: Pick<Sale, 'insuredNo' | 'customer' | 'birthDate'>): string {
  const no = sale.insuredNo.normalize('NFKC').replace(/\D/g, '');
  if (no) return `no:${no.padStart(10, '0')}`;
  const name = sale.customer.normalize('NFKC').replace(/\s+/g, '');
  return name ? `name:${name}|${sale.birthDate}` : '';
}

/** 前の見積もりのお客様（お客様ごとに いちばん新しい見積もり。新しい順）。今の見積もりのお客様は除く */
export function pastCustomers(sales: Sale[], current: Sale): Sale[] {
  const seen = new Set<string>([customerKey(current)]);
  const out: Sale[] = [];
  for (const s of [...sales].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const key = customerKey(s);
    if (!key || s.id === current.id || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** 前の見積もりから写すもの：お客様・介護保険・ケアマネジャー（商品・日付・番号は写さない） */
export function customerPatch(from: Sale): Partial<Sale> {
  return {
    customer: from.customer,
    kana: from.kana,
    insuredNo: from.insuredNo,
    birthDate: from.birthDate,
    gender: from.gender,
    zip: from.zip,
    address: from.address,
    tel: from.tel,
    careLevel: from.careLevel,
    insurer: from.insurer,
    insurerName: from.insurerName,
    burdenRatio: from.burdenRatio,
    payMethod: from.payMethod,
    perItem: from.perItem,
    welfare: from.welfare,
    careOffice: from.careOffice,
    careManager: from.careManager,
    carePlan: from.carePlan,
  };
}

/** 案件の日（年度を決める日）：納品日、なければ申請日、なければ見積日 */
const saleDay = (s: Pick<Sale, 'deliveryDate' | 'applyDate' | 'estimateDate'>) => s.deliveryDate || s.applyDate || s.estimateDate;

/**
 * このアプリの記録にある、同じお客様の同じ年度の申請（申請・承認・納品・集金の案件）。
 * 今年度の残り（10万円 − 使った分）を出すのに使う。ほかの事業所で買った分は入っていない
 */
export function sameYearSales(sales: Sale[], current: Sale): Sale[] {
  const key = customerKey(current);
  const year = fiscalYearOf(saleDay(current));
  if (!key || year === null) return [];
  return sales.filter((s) => s.id !== current.id && s.status !== '見積' && customerKey(s) === key && fiscalYearOf(saleDay(s)) === year);
}

/** よく使う値（多い順。居宅介護支援事業所など）。where を付けると、その案件の中だけ */
export function frequentValues(sales: Sale[], pick: (s: Sale) => string, where: (s: Sale) => boolean = () => true, limit = 6): string[] {
  const count = new Map<string, number>();
  for (const s of sales) {
    if (!where(s)) continue;
    const v = pick(s).trim();
    if (v) count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}

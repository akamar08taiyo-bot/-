// 案件（お客様1件の販売）を作る・写す・商品マスタから明細を入れる部品。画面から呼ぶ（計算は calc.ts）

import {DEFAULT_MAKERS, INSURERS} from './defaults.ts';
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
    burdenRatio: null, // 未選択（負担割合証で確かめて選ぶ。選ぶまで自己負担額は出さない）
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

/**
 * 手で入れた商品（商品マスタにない）で、商品名のあるもの。同じ名前・メーカーの商品がもう商品マスタにあれば入れない
 * （ユーザーの指示「商品名や金額を一度入力したら、お気に入り登録として追加できるようにする。印刷の前に、お気に入り登録するか否かの確認」2026-10-26）
 */
export function unregisteredItems(sale: Pick<Sale, 'items'>, products: Pick<Product, 'name' | 'maker'>[]): SaleItem[] {
  const key = (name: string, maker: string) => `${name.normalize('NFKC').replace(/\s+/g, '')}|${makerKey(maker)}`;
  const known = new Set(products.map((p) => key(p.name, p.maker)));
  return sale.items.filter((i) => i.productId === null && i.name.trim() && !known.has(key(i.name, i.maker)));
}

/**
 * 手で入れた商品を、商品マスタの★お気に入りにする（商品名・メーカー・品番・種目・定価・仕切など、入れた値のまま）。
 * 明細はその商品につなぐ（商品マスタから選んだのと同じになる）。返すのは新しい商品マスタと明細
 */
export function addFavorites(products: Product[], items: SaleItem[], ids: Set<string>, now = Date.now()): {products: Product[]; items: SaleItem[]} {
  const added: Product[] = [];
  const next = items.map((i) => {
    if (!ids.has(i.id) || i.productId !== null || !i.name.trim()) return i;
    const p: Product = {
      id: uid('p'),
      name: i.name.trim(),
      maker: i.maker.trim(),
      code: i.code.trim(),
      tais: i.tais.trim(),
      jan: '',
      category: i.category,
      sub: i.sub,
      categoryByHand: !!i.category,
      listPrice: i.listPrice,
      cost: i.cost,
      taxType: i.taxType,
      unit: i.unit,
      supplier: i.supplier,
      favorite: true,
      useCount: 1,
      lastUsedAt: now,
      source: '手入力',
      updatedAt: now,
    };
    added.push(p);
    return {...i, productId: p.id};
  });
  return {products: [...products, ...added], items: next};
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

/** 印刷・申請の前に確かめてほしいこと（種目が決まっていない・価格がない商品など）。
 * 仕切は任意（ユーザーの指示「仕切りは（任意）」2026-10-26）なので、入っていなくても知らせない */
export function saleWarnings(sale: Sale): string[] {
  const out: string[] = [];
  const named = (i: SaleItem) => i.name.trim() || '（商品名なし）';
  const noCat = sale.items.filter((i) => !i.category);
  if (noCat.length) out.push(`種目が決まっていない商品：${noCat.map(named).join('、')}`);
  const noPrice = sale.items.filter((i) => i.unitPrice === null && i.listPrice <= 0 && i.cost <= 0);
  if (noPrice.length) out.push(`価格が入っていない商品：${noPrice.map(named).join('、')}`);
  if (!sale.insurer || (sale.insurer === 'other' && !sale.insurerName.trim())) out.push('保険者が選ばれていません');
  return out;
}

// ---------------------------------------------------------------- 前に入れたものを使い回す（ユーザーの指示「無駄を省けるようにする」）

/** メーカー名の見分け（「アロン化成」「アロン化成（株）」「アロン化成株式会社」、全角・半角・すき間のちがいは同じ） */
export const makerKey = (v: string) => v.normalize('NFKC').replace(/株式会社|有限会社|\((?:株|有)\)|㈱|㈲|\s/g, '');

/**
 * メーカー名の候補：はじめにパナソニックエイジフリー（株）・アロン化成（株）（DEFAULT_MAKERS）、そのあとに商品マスタと見積もりで使ったメーカー（多い順）。
 * 同じメーカーの書き方ちがいは1つにする（はじめの2つと同じなら、はじめの2つの書き方）
 */
export function makerChoices(products: Pick<Product, 'maker'>[], sales: Pick<Sale, 'items'>[], limit = 40): string[] {
  const count = new Map<string, {name: string; n: number}>();
  const add = (v: string) => {
    const name = v.trim();
    const k = makerKey(name);
    if (!k) return;
    const c = count.get(k);
    if (c) c.n += 1;
    else count.set(k, {name, n: 1});
  };
  for (const p of products) add(p.maker);
  for (const s of sales) for (const i of s.items) add(i.maker);
  const first = new Set(DEFAULT_MAKERS.map(makerKey));
  const rest = [...count.entries()].filter(([k]) => !first.has(k)).sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name, 'ja'));
  return [...DEFAULT_MAKERS, ...rest.slice(0, limit).map(([, c]) => c.name)];
}

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

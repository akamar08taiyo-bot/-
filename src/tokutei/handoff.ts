// 販売受注簿作成ツール（太陽ポータルと同じサイトの /taiyo-hacchu-scan/）へ渡す内容（DESIGN.md 5.3）。
// 同じサイトなので、この端末の localStorage（taiyo-hacchu-import-v1）に置いてから受注簿を新しいタブで開く
// （住宅改修のアプリの「📤 販売受注簿に転記」と同じ口。受注簿ツールの src/main.jsx の jutaku-import-begin〜end が kind で見分けて読む）。
// 受注簿は商品1点が1ページで、ページごとに給付内訳を出す。ページごとに切り上げると合計が見積書と1円ずれることがあるので、
// 給付の内訳もここで商品ごとに分けて渡す（合計は saleTotals と同じ）。送る形を変えるときは、受注簿ツールの受け取りも直す。

import {actualDiscount, saleTotals} from './calc.ts';
import type {Totals} from './calc.ts';
import type {Sale, Settings, TaxType} from './types.ts';
import {staffShort, yen} from './util.ts';

export const HACCHU_IMPORT_KEY = 'taiyo-hacchu-import-v1';
/**
 * 状態を「承認」にした見積もりを、販売受注簿へ自動で送る列（ユーザーの指示「販売受注簿にも自動で転記する」2026-10-25）。
 * 受注簿ツールは開いたときに、HACCHU_IMPORT_KEY がなければこの列の古いものから1つずつ「受注簿に入れる」を出す（受注簿ツールの src/main.jsx の jutaku-import-begin）。
 * 同じ案件は1つだけ（saleId）。30件まで
 */
export const HACCHU_QUEUE_KEY = 'taiyo-hacchu-import-queue-v1';
/** 販売受注簿作成ツール（太陽ポータルと同じサイト） */
export const HACCHU_PATH = '/taiyo-hacchu-scan/';

/** 受注簿の1ページ（商品1点）の給付内訳。全部の商品を足すと、見積書の 介護保険の対象・利用者負担・介護扶助・保険者負担 になる */
export type HacchuBenefit = {
  target: number; // 介護保険の対象（税込）
  userBurden: number; // 利用者負担（生活保護なら 0）
  aid: number; // 介護扶助（生活保護のときの負担割合の分）
  insurerBurden: number; // 保険者負担
};

export type HacchuItem = {
  productName: string;
  maker: string;
  modelNumber: string; // 品番
  supplier: string; // 発注先（仕入先）。空なら受注簿の初めの値のまま
  quantity: number; // 1以上の整数（受注簿の数量は整数）
  unit: string;
  listPrice: number; // 定価（税抜・1つ）。なければ 0
  cost: number; // 仕切（税抜・1つ）。なければ 0
  taxType: TaxType;
  discountRate: number;
  saleUnitPrice: number; // 販売単価（税抜）。見積書と同じ（手で入れた単価・仕切×125% も）。価格がなければ 0
  totalTaxIn: number; // 購入金額（税込）。見積書・申請書と同じ
  careInsuranceBalance: number; // この商品より前の商品の分を引いた今年度の残り（受注簿でページを直したときの計算に使う。0 なら全額自己負担）
  benefit: HacchuBenefit;
  note: string; // 受注簿の備考（限度額を超えた分・生活保護のときだけ）
};

export type HacchuImport = {
  kind: 'taiyo-tokutei-order';
  v: 1;
  createdAt: number;
  title: string; // 何の受注か（「山田 花子様 特定福祉用具」）
  customerName: string;
  furigana: string;
  address: string;
  tel: string;
  sales: string; // 営業担当（名字）。空なら受注簿の初めの値のまま
  deliveryDate: string; // 納品予定日 'YYYY-MM-DD'（納品日が入っていれば）
  burdenRatio: 1 | 2 | 3; // 給付割合
  welfare: boolean; // 生活保護（利用者負担 0）
  items: HacchuItem[];
};

/**
 * 給付の内訳を商品ごとに分ける。今年度の残りは前の商品から順に使う。
 * 利用者負担（生活保護なら介護扶助）は、商品ごとに切り上げた額から、合計が見積書の額になるまで後ろの商品から1円ずつ減らす
 * （どの商品も、切り捨てた額と切り上げた額のあいだになる）。個別切り上げ（みやこ町）は、商品ごとの切り上げがそのまま見積書の額。
 */
export function benefitSplit(t: Totals, welfare: boolean): {balance: number; benefit: HacchuBenefit}[] {
  let balance = t.remaining;
  const rows = t.lines.map((l) => {
    const before = balance;
    const target = Math.min(l.total, Math.max(0, balance));
    balance -= target;
    return {before, target, share: Math.ceil(((t.perItemApplied ? l.total : target) * t.ratio) / 10)};
  });
  let over = rows.reduce((n, r) => n + r.share, 0) - t.share;
  for (let i = rows.length - 1; i >= 0 && over > 0; i--) {
    if ((rows[i].target * t.ratio) % 10 === 0) continue;
    rows[i].share -= 1;
    over -= 1;
  }
  return rows.map((r) => ({
    balance: Math.max(0, r.before),
    benefit: {target: r.target, userBurden: welfare ? 0 : r.share, aid: welfare ? r.share : 0, insurerBurden: r.target - r.share},
  }));
}

export function hacchuImport(sale: Sale, s: Pick<Settings, 'markupRate' | 'limit' | 'minProfitRate'>, now = Date.now()): HacchuImport {
  const t = saleTotals(sale, s);
  const split = benefitSplit(t, sale.welfare);
  const customer = sale.customer.trim();
  return {
    kind: 'taiyo-tokutei-order',
    v: 1,
    createdAt: now,
    title: `${customer ? `${customer}様 ` : ''}特定福祉用具`,
    customerName: customer,
    furigana: sale.kana.trim(),
    address: sale.address.trim(),
    tel: sale.tel.trim(),
    sales: staffShort(sale.staff),
    deliveryDate: sale.deliveryDate,
    burdenRatio: t.ratio === 2 ? 2 : t.ratio === 3 ? 3 : 1,
    welfare: sale.welfare,
    items: t.lines.map((l, i) => {
      const {balance, benefit} = split[i];
      const over = l.total - benefit.target;
      const note = [
        over > 0 && benefit.target > 0 && `限度額を超えた分 ${yen(over)}円は全額自己負担`,
        over > 0 && benefit.target === 0 && '限度額を超えるので全額自己負担',
        benefit.aid > 0 && `生活保護（${t.ratio}割 ${yen(benefit.aid)}円）`, // 「介護扶助」とは書かない（ユーザーの指示 2026-10-28）
      ].filter(Boolean);
      return {
        productName: l.item.name.trim(),
        maker: l.item.maker.trim(),
        modelNumber: l.item.code.trim(),
        supplier: l.item.supplier.trim(),
        quantity: Math.max(1, Math.round(l.item.qty)),
        unit: l.item.unit.trim() || '台',
        listPrice: Math.max(0, Math.round(l.item.listPrice)),
        cost: Math.max(0, Math.round(l.item.cost)),
        taxType: l.item.taxType,
        // 手で単価を入れた行は、割引率の欄ではなく定価と単価から（欄が前の値のままでも受注簿は実際の割引率。2026-10-28 のユーザーの指摘）
        discountRate: actualDiscount(l),
        saleUnitPrice: l.unitPrice,
        totalTaxIn: l.total,
        careInsuranceBalance: balance,
        benefit,
        note: note.join('・'),
      };
    }),
  };
}

export type HacchuQueued = HacchuImport & {saleId: string};

/** 販売受注簿へ自動で送る列に入れる（同じ案件の前のものは置きかえる）。商品がなければ入れない */
export function queueHacchu(sale: Sale, s: Pick<Settings, 'markupRate' | 'limit' | 'minProfitRate'>, store: Pick<Storage, 'getItem' | 'setItem'> = localStorage, now = Date.now()): boolean {
  if (sale.items.length === 0) return false;
  let list: unknown;
  try {
    list = JSON.parse(store.getItem(HACCHU_QUEUE_KEY) || '[]');
  } catch {
    list = [];
  }
  const keep = (Array.isArray(list) ? list : []).filter((x): x is HacchuQueued => typeof x === 'object' && x !== null && (x as HacchuQueued).saleId !== sale.id);
  store.setItem(HACCHU_QUEUE_KEY, JSON.stringify([...keep, {...hacchuImport(sale, s, now), saleId: sale.id}].slice(-30)));
  return true;
}

/** 受注簿を開く URL（受け取り口は ?from=tokutei で、リンクから開いたことを知る） */
export function hacchuUrl(): string {
  return new URL(`${HACCHU_PATH}?from=tokutei`, location.origin).href;
}

// 金額の計算。見積書・申請書・販売受注簿へ渡す金額は、すべてここで計算したものを使う
// （販売受注簿作成ツールで「見積書だけ金額が違う」不具合が出たので、計算を1か所にまとめる）。
// 1円未満の決まり：販売単価・消費税・保険者負担は切り捨て、利用者負担は切り上げ（販売受注簿・売上伝票発行依頼書と同じ）。
// 介護保険の負担は整数で計算する（Math.floor(対象×(1−0.3)) のように小数をかけると、3割のとき1円少なくなることがある）。

import type {Sale, SaleItem, Settings, TaxType} from './types.ts';

/** 税率（%） */
export function taxPct(t: TaxType): number {
  return t === '非課税' ? 0 : t === '8%' ? 8 : 10;
}

/** 円の金額を1円単位の整数に（小数の誤差をなくす） */
const toYen = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

/**
 * 販売単価（税抜）が何から決まったか。
 * list＝定価×(100−割引率)%、cost＝定価がないので仕切×(100＋上乗せ)%、manual＝手で入れた、none＝価格がない
 */
export type PriceBasis = 'list' | 'cost' | 'manual' | 'none';

export function unitPriceOf(item: Pick<SaleItem, 'unitPrice' | 'listPrice' | 'cost' | 'discountRate'>, s: Pick<Settings, 'markupRate'>): {price: number; basis: PriceBasis} {
  if (item.unitPrice !== null && Number.isFinite(item.unitPrice)) return {price: Math.max(0, Math.floor(item.unitPrice)), basis: 'manual'};
  // 1銭単位の整数にしてからかける（定価に小数があっても誤差で1円ずれないように）
  const list = Math.round(toYen(item.listPrice) * 100);
  if (list > 0) {
    const rate = Math.min(100, Math.max(0, Math.round(item.discountRate)));
    return {price: Math.floor((list * (100 - rate)) / 10000), basis: 'list'};
  }
  const cost = Math.round(toYen(item.cost) * 100);
  if (cost > 0) return {price: Math.floor((cost * (100 + Math.max(0, Math.round(s.markupRate)))) / 10000), basis: 'cost'};
  return {price: 0, basis: 'none'};
}

export type Line = {
  item: SaleItem;
  unitPrice: number; // 販売単価（税抜）
  basis: PriceBasis;
  amount: number; // 金額（税抜）＝ 販売単価×数量
  tax: number; // 消費税（行ごとに切り捨て）
  total: number; // 購入金額（税込）＝ 金額＋消費税。申請書の「購入金額」
  costTotal: number; // 仕切×数量（税抜）
  profit: number; // 利益（税抜）＝ 金額 − 仕切×数量
};

export function lineOf(item: SaleItem, s: Pick<Settings, 'markupRate'>): Line {
  const {price, basis} = unitPriceOf(item, s);
  const qty = Math.max(0, Math.round(item.qty * 100) / 100);
  const amount = Math.floor(Math.round(price * qty * 100) / 100);
  const tax = Math.floor((amount * taxPct(item.taxType)) / 100);
  const costTotal = Math.round(toYen(item.cost) * qty);
  return {item, unitPrice: price, basis, amount, tax, total: amount + tax, costTotal, profit: amount - costTotal};
}

export type Totals = {
  lines: Line[];
  amount: number; // 金額の合計（税抜）
  tax: number; // 消費税の合計
  total: number; // 購入金額の合計（税込）
  limit: number; // 1年間の限度額
  remaining: number; // 今年度の残り（空欄なら限度額）
  remainingBlank: boolean;
  covered: number; // 介護保険の対象（購入金額と残りの小さい方）
  excess: number; // 残りを超えた分（全額自己負担）
  ratio: number; // 負担割合（1・2・3割）。未選択なら 1割として計算するが、画面・帳票には出さない（ratioSet）
  ratioSet: boolean; // 負担割合を選んであるか。false なら 利用者負担・介護扶助・保険者負担・お支払い は出さない
  share: number; // 対象のうち負担割合の分（利用者負担。生活保護なら介護扶助）
  userBurden: number; // 利用者負担（生活保護なら 0）
  aid: number; // 介護扶助（生活保護のときの負担割合の分）
  insurerBurden: number; // 保険者負担（＝ 対象 − 負担割合の分）
  userPay: number; // 利用者のお支払い ＝ 利用者負担 ＋ 超えた分
  perItemApplied: boolean; // 個別切り上げで計算したか
  costTotal: number;
  profit: number;
  profitRate: number; // 利益 ÷ 金額（0〜1）
  lowProfit: boolean; // 利益がマイナス、または利益率が設定より低い
};

export function saleTotals(sale: Sale, s: Pick<Settings, 'markupRate' | 'limit' | 'minProfitRate'>): Totals {
  const lines = sale.items.map((it) => lineOf(it, s));
  const amount = lines.reduce((n, l) => n + l.amount, 0);
  const tax = lines.reduce((n, l) => n + l.tax, 0);
  const total = amount + tax;
  const limit = Math.max(0, Math.round(s.limit));
  const remainingBlank = sale.remaining === null || !Number.isFinite(sale.remaining);
  // 残りが空欄なら限度額（10万円）として計算する（ユーザーの指示。0 は「もう残っていない」）
  const remaining = remainingBlank ? limit : Math.max(0, Math.round(sale.remaining as number));
  const covered = Math.min(total, remaining);
  const excess = total - covered;
  const ratioSet = sale.burdenRatio === 1 || sale.burdenRatio === 2 || sale.burdenRatio === 3;
  const ratio = sale.burdenRatio === 2 ? 2 : sale.burdenRatio === 3 ? 3 : 1;
  // 個別切り上げは、超えた分がなく、明細が2つ以上のときだけ（1つなら合計で計算しても同じ）
  const perItemApplied = sale.perItem && excess === 0 && lines.filter((l) => l.total > 0).length >= 2;
  const share = perItemApplied ? lines.reduce((n, l) => n + Math.ceil((l.total * ratio) / 10), 0) : Math.ceil((covered * ratio) / 10);
  const insurerBurden = Math.max(0, covered - share);
  const userBurden = sale.welfare ? 0 : share;
  const aid = sale.welfare ? share : 0;
  const costTotal = lines.reduce((n, l) => n + l.costTotal, 0);
  const profit = amount - costTotal;
  const profitRate = amount > 0 ? profit / amount : 0;
  return {
    lines,
    amount,
    tax,
    total,
    limit,
    remaining,
    remainingBlank,
    covered,
    excess,
    ratio,
    ratioSet,
    share,
    userBurden,
    aid,
    insurerBurden,
    userPay: userBurden + excess,
    perItemApplied,
    costTotal,
    profit,
    profitRate,
    lowProfit: amount > 0 && (profit < 0 || profitRate * 100 < s.minProfitRate),
  };
}

/** 掛率の表示：割引率 20 → 「0.8」、15 → 「0.85」 */
export function rateText(discountRate: number): string {
  const r = (100 - Math.round(discountRate)) / 100;
  return String(Math.round(r * 100) / 100);
}

/**
 * 見積書の税率の右の「備考」に書く算出根拠（ユーザーの指示「税率の横に、備考を入れて、算出根拠をいれる。例えば税抜定価が28000円で20%引きするのであれば、その旨を記載」2026-10-25）。
 * 定価×割引：「定価28,000円の20%引き」。手で単価を入れた行は、定価からちょうど何%引きなら同じ書き方、そうでなければ「定価28,000円」。
 * 定価のない商品（仕切×125% など）は書かない（仕入れの値段をお客様に見せない）
 */
export function basisNote(line: Line): string {
  const list = toYen(line.item.listPrice);
  if (list <= 0 || line.basis === 'cost' || line.basis === 'none') return '';
  const base = `定価${Math.round(list).toLocaleString('ja-JP')}円`;
  const off = line.basis === 'list' ? Math.round(line.item.discountRate) : Math.round((1 - line.unitPrice / list) * 1000) / 10;
  if (line.basis === 'manual' && (!Number.isInteger(off) || Math.floor((list * (100 - off)) / 100) !== line.unitPrice)) return base;
  return off > 0 ? `${base}の${off}%引き` : base;
}
/** 見積書の備考の欄に出す文（手で直していればそれ。手で空にしたら空） */
export const itemNote = (line: Line): string => (typeof line.item.basisNote === 'string' ? line.item.basisNote.trim() : basisNote(line));

/** 見積書の品目の下の行：「定価32,000円（税抜）×0.8」。手で単価を入れた行は ×0.8 を付けない */
export function priceNote(line: Line): string {
  const list = toYen(line.item.listPrice);
  if (list <= 0) return '';
  const base = `定価${Math.round(list).toLocaleString('ja-JP')}円（税抜）`;
  return line.basis === 'list' ? `${base}×${rateText(line.item.discountRate)}` : base;
}

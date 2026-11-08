// 金額の計算。見積書・申請書・販売受注簿へ渡す金額は、すべてここで計算したものを使う
// （販売受注簿作成ツールで「見積書だけ金額が違う」不具合が出たので、計算を1か所にまとめる）。
// 1円未満の決まり：販売単価・消費税・保険者負担は切り捨て、利用者負担は切り上げ（販売受注簿・売上伝票発行依頼書と同じ）。
// 介護保険の負担は整数で計算する（Math.floor(対象×(1−0.3)) のように小数をかけると、3割のとき1円少なくなることがある）。

import {taxFreeCategory} from './category.ts';
import type {Sale, SaleItem, Settings, TaxType} from './types.ts';

/** 税率（%） */
export function taxPct(t: TaxType): number {
  return t === '非課税' ? 0 : t === '8%' ? 8 : 10;
}

/**
 * 商品の税区分：歩行器・歩行補助つえ（多点杖など）は非課税（category.ts の TAX_FREE_CATEGORIES）、ほかは商品マスタ・カタログの税区分のまま。
 * ユーザーの指示「歩行器（ピックアップ）や四点杖は非課税…しっかりと全ての商品で認識する」2026-11-03
 */
export const taxOf = (category: string, taxType: TaxType): TaxType => (taxFreeCategory(category) ? '非課税' : taxType);

/**
 * 種目を変えたときの税区分：歩行器・歩行補助つえにしたら非課税、そこから外したら 10%。
 * 税込の横の「非課税」ボタンで手で決めた商品（taxByHand）は変えない（ユーザーの指示「念のため、税込み金額の横に非課税ボタンを設置」2026-11-03）
 */
export function categoryTaxPatch(item: Pick<SaleItem, 'category' | 'taxType' | 'taxByHand'>, category: string): Partial<SaleItem> {
  if (item.taxByHand) return {};
  if (taxFreeCategory(category)) return item.taxType === '非課税' ? {} : {taxType: '非課税'};
  if (taxFreeCategory(item.category) && item.taxType === '非課税') return {taxType: '10%'};
  return {};
}

/**
 * 利益率（%。小数1けた）＝（販売単価 − 仕切）÷ 販売単価。仕切か単価がなければ null
 * （ユーザーの指示「仕切りの部分を入力したら、右側に利益率を表示、利益率をいじると、販売金額が自動的に変わる」2026-11-03。商品マスタの利益率と同じ、販売価格に対する率）
 */
export function marginRate(unitPrice: number, cost: number): number | null {
  if (!(cost > 0) || !(unitPrice > 0)) return null;
  return Math.round(((unitPrice - cost) / unitPrice) * 1000) / 10;
}
/** 利益率（%）から販売単価（税抜）＝ 仕切 ÷（1 − 利益率）。円未満は切り上げ（打った利益率を下回らないように）。仕切がない・100%以上なら null */
export function priceFromMargin(cost: number, rate: number): number | null {
  if (!(cost > 0) || !Number.isFinite(rate) || rate >= 100) return null;
  return Math.max(0, Math.ceil(Math.round((cost / (1 - rate / 100)) * 1e6) / 1e6));
}

/** 割引率（%）を0.1%単位の整数に（17.5 → 175。0〜100%） */
const discount10 = (rate: number) => Math.min(1000, Math.max(0, Math.round((Number.isFinite(rate) ? rate : 0) * 10)));
/** 割引率（%。小数1けたまで） */
const discountPct = (rate: number) => discount10(rate) / 10;

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
    // 割引率は小数1けたまで（欄に 17.5 と打てる。前は四捨五入して 18% で計算していたので、欄は 17.5 なのに単価・備考・受注簿は 18% 引きだった）
    const rate10 = discount10(item.discountRate);
    return {price: Math.floor((list * (1000 - rate10)) / 100000), basis: 'list'};
  }
  const cost = Math.round(toYen(item.cost) * 100);
  if (cost > 0) return {price: Math.floor((cost * (100 + Math.max(0, Math.round(s.markupRate)))) / 10000), basis: 'cost'};
  return {price: 0, basis: 'none'};
}

/**
 * 定価と販売単価（税抜）から割引率（%）。定価×(100−%)% の切り捨て（unitPriceOf と同じ）がちょうどその単価になる整数の%なら、その%。でなければ null
 */
export function impliedDiscount(listPrice: number, unitPrice: number): number | null {
  const list = Math.round(toYen(listPrice) * 100);
  if (list <= 0 || !Number.isFinite(unitPrice)) return null;
  const off = Math.round((1 - (unitPrice * 100) / list) * 100);
  if (off < 0 || off > 100) return null;
  return Math.floor((list * (100 - off)) / 10000) === Math.floor(unitPrice) ? off : null;
}

/**
 * 販売単価を手で入れたときの直し：ちょうど何%引きの単価なら、割引率の欄もその%にする（割引率・単価・備考・販売受注簿をそろえる。
 * ユーザーの指摘「販売受注簿に転機した場合に、なぜか割引率が35%になっている」2026-10-28：単価を手で入れても割引率の欄は前の値のままで、それが受注簿に渡っていた）
 */
export function unitPricePatch(item: Pick<SaleItem, 'listPrice'>, unitPrice: number | null): Partial<SaleItem> {
  if (unitPrice === null) return {unitPrice};
  const off = impliedDiscount(item.listPrice, unitPrice);
  if (off !== null) return {unitPrice, discountRate: off};
  // ちょうど何%引きでなくても、割引率の欄は定価と単価からの割引率（小数1けた・0〜100%）にする（ユーザーの指示「税抜き金額、税込み金額を変更すると、
  // 自動的に割引率が変わるようにする。また、逆もしかり」2026-11-03。前は割引率の欄が前の値のままだった）。定価がなければ割引率はそのまま
  const list = toYen(item.listPrice);
  if (list <= 0 || !Number.isFinite(unitPrice)) return {unitPrice};
  return {unitPrice, discountRate: Math.min(100, Math.max(0, Math.round((1 - unitPrice / list) * 1000) / 10))};
}

/** 1台の税込の値段：販売単価（税抜）＋消費税（切り捨て。数量が1のときの lineOf の購入金額と同じ） */
export function taxIncluded(unitPrice: number, taxType: TaxType): number {
  const p = Math.max(0, Math.floor(unitPrice));
  return p + Math.floor((p * taxPct(taxType)) / 100);
}

/**
 * 税込の値段から販売単価（税抜）：税込がその値段を超えない一番高い税抜（消費税の切り捨てで、ちょうどの税抜がない税込は1円少なくなる。10% なら 28,159円 → 25,599円＝税込 28,158円）。
 * 販売見積書・申請書の商品の欄の「税込」を打ったとき（ユーザーの指示「税込み金額を変更すると、自動的に割引率が変わるようにする」2026-11-03）
 */
export function priceFromTaxIncluded(taxIn: number, taxType: TaxType): number {
  const t = Number.isFinite(taxIn) ? Math.max(0, Math.floor(taxIn)) : 0;
  let p = Math.floor((t * 100) / (100 + taxPct(taxType)));
  while (taxIncluded(p + 1, taxType) <= t) p++;
  while (p > 0 && taxIncluded(p, taxType) > t) p--;
  return p;
}

/** 実際の割引率（%。販売受注簿に渡す）：定価×割引の行はその割引率、手で単価を入れた行は定価と単価から（整数でなければ小数1けた）、定価がなければ割引率の欄のまま */
export function actualDiscount(line: Pick<Line, 'item' | 'unitPrice' | 'basis'>): number {
  const list = toYen(line.item.listPrice);
  if (line.basis !== 'manual' || list <= 0) return discountPct(line.item.discountRate);
  return impliedDiscount(list, line.unitPrice) ?? Math.round((1 - line.unitPrice / list) * 1000) / 10;
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
  return String((1000 - discount10(discountRate)) / 1000); // 17.5% → 0.825
}

/**
 * 見積書の税率の右の「備考」に書く算出根拠（ユーザーの指示「税率の横に、備考を入れて、算出根拠をいれる。例えば税抜定価が28000円で20%引きするのであれば、その旨を記載」2026-10-25）。
 * 定価×割引：「定価28,000円の20%引き」。手で単価を入れた行（税抜・税込・利益率を打った行）も、定価からの割引率を書く
 * （ユーザーの指示「利益率をいじると、販売金額が自動的に変わる」「当然備考の部分も連動して数字が変わる」2026-11-03。前は、ちょうど何%引きでなければ「定価28,000円」だけ）：
 * 小数2けたまでで、その割引率から計算した単価（切り捨てか四捨五入）がちょうど同じになれば「の23.21%引き」、ならなければ小数1けたで「の約23.2%引き」。
 * 定価のない商品（仕切×125% など）は書かない（仕入れの値段をお客様に見せない）
 */
export function basisNote(line: Line): string {
  const list = toYen(line.item.listPrice);
  if (list <= 0 || line.basis === 'cost' || line.basis === 'none') return '';
  const base = `定価${Math.round(list).toLocaleString('ja-JP')}円`;
  if (line.basis === 'list') {
    const off = discountPct(line.item.discountRate);
    return off > 0 ? `${base}の${off}%引き` : base;
  }
  const raw = (1 - line.unitPrice / list) * 100;
  if (!(raw > 0.0001)) return base; // 定価のまま・定価より高い
  for (const d of [1, 10, 100]) {
    const off = Math.round(raw * d) / d;
    const at = (list * (100 - off)) / 100;
    if (off > 0 && (Math.floor(at + 1e-9) === line.unitPrice || Math.round(at) === line.unitPrice)) return `${base}の${off}%引き`;
  }
  return `${base}の約${Math.round(raw * 10) / 10}%引き`;
}
/** 見積書の備考の欄に出す文（手で直していればそれ。手で空にしたら空） */
export const itemNote = (line: Line): string => (typeof line.item.basisNote === 'string' ? line.item.basisNote.trim() : basisNote(line));

/** 見積書の品目の下の行：「定価32,000円（税抜）×0.8」。手で単価を入れた行は ×0.8 を付けない */
export function priceNote(line: Line): string {
  const list = toYen(line.item.listPrice);
  if (list <= 0) return '';
  const base = `定価${Math.round(list).toLocaleString('ja-JP')}円（${line.item.taxType === '非課税' ? '非課税' : '税抜'}）`;
  return line.basis === 'list' ? `${base}×${rateText(line.item.discountRate)}` : base;
}

// 売上見込み（住宅改修のアプリの「📈 売上見込みを確認する」。ユーザーの指示「売上見込みを確認するとつくる。開くと住宅改修と特定福祉用具を別々に、
// その次の売上を集計、確認できるようにする。（税抜、税込）」2026-10-25）に渡す、案件ごとの金額のまとめ。
// 同じサイト（太陽ポータル）なので、この端末の localStorage（taiyo-tokutei-sales-v1）に書く。読むのは住宅改修の src/sasaoka/salesPlan.ts。
// 案件が変わるたびに書き直す（App.tsx）。お客様名・担当・居宅・金額（税抜・税込・お客様のお支払い）だけ。仕切・利益は入れない。
// 受注残・進捗管理（solar-silver-progress-app の index.html の taiyo-link）も読む（受注残の「受注残に入れる」。2026-10-26。営業所 office でその営業所の画面だけに出す）。
// 形を変えるときは、住宅改修の salesPlan.ts と受注残の taiyo-link の読み取りも直す。
import {saleTotals} from './calc.ts';
import type {Sale, Settings} from './types.ts';

export const SALES_SUMMARY_KEY = 'taiyo-tokutei-sales-v1';

export type SalesSummaryRow = {
  id: string;
  customer: string;
  jutakuJob: string; // 住宅改修の様邸から開いた案件ならその様邸の id（売上見込みで同じお客様と分かるように）
  staff: string;
  careOffice: string;
  careManager: string;
  status: Sale['status'];
  month: string; // 売上の月 'YYYY-MM'（salesMonthOf）
  amount: number; // 金額（税抜）
  tax: number;
  total: number; // 購入金額（税込）
  userPay: number; // お客様のお支払い（受領委任払いなら利用者負担、償還払いなら全額）
  office: string; // 営業所（設定の営業所。受注残・進捗管理がその営業所の画面だけに出す）
};

/**
 * 住宅改修の様邸から開いた案件のお客様名（商品のない作りかけもふくむ。売上には入れない）。住宅改修の「見積もり・申請書を作成する」の一覧で、
 * 特定福祉用具申請書だけを作っている様邸にもお客様名を出すため（ユーザーの指示「特定福祉用具の申請書を作成途中の場合も、こちらの一覧には表示されるようにする」2026-10-26）。
 * rows を読むアプリ（住宅改修の salesPlan.ts・受注残の taiyo-link）は読まない
 */
export type SalesSummaryLinked = {job: string; customer: string};

export type SalesSummary = {v: 1; updatedAt: number; rows: SalesSummaryRow[]; linked: SalesSummaryLinked[]};

/** 売上の月：納品日（購入日）の月。まだなければ 承認日 → 申請日 → 見積日 → 作った日 の月（売上見込みの初めの月。住宅改修のアプリで次月に回せる） */
export function salesMonthOf(sale: Pick<Sale, 'deliveryDate' | 'approveDate' | 'applyDate' | 'estimateDate' | 'createdAt'>): string {
  for (const d of [sale.deliveryDate, sale.approveDate, sale.applyDate, sale.estimateDate]) if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
  const t = new Date(sale.createdAt || Date.now());
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

/** 商品のある案件だけ（作りかけの空の案件は売上に入れない） */
export function salesSummary(sales: Sale[], s: Pick<Settings, 'markupRate' | 'limit' | 'minProfitRate' | 'officeName'>, now = Date.now()): SalesSummary {
  const rows = sales
    .filter((x) => x.items.length > 0)
    .map((x): SalesSummaryRow => {
      const t = saleTotals(x, s);
      return {
        id: x.id,
        customer: x.customer.trim(),
        jutakuJob: x.jutakuJob ?? '',
        staff: x.staff,
        careOffice: x.careOffice.trim(),
        careManager: x.careManager.trim(),
        status: x.status,
        month: salesMonthOf(x),
        amount: t.amount,
        tax: t.tax,
        total: t.total,
        userPay: x.payMethod === '償還払い' ? t.total : t.userPay,
        office: s.officeName.trim(),
      };
    });
  const linked = sales.filter((x) => x.jutakuJob && x.customer.trim()).map((x) => ({job: x.jutakuJob!, customer: x.customer.trim()}));
  return {v: 1, updatedAt: now, rows, linked};
}

/** 書く（書けなくても困らない：売上見込みに特定福祉用具が出ないだけ） */
export function writeSalesSummary(sales: Sale[], s: Pick<Settings, 'markupRate' | 'limit' | 'minProfitRate' | 'officeName'>, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(SALES_SUMMARY_KEY, JSON.stringify(salesSummary(sales, s)));
  } catch {
    /* 容量がいっぱい・使えないとき */
  }
}

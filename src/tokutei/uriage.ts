// 売上伝票発行依頼書（太陽ポータルと同じサイトの /taiyo-uriage-denpyo/）へ渡す内容。
// ユーザーの依頼「売上伝票の発行依頼書を自動的に作りたい」（2026-10-27）。販売見積書の上の段の「🧾 売上伝票依頼書」で、
// 足りない所（負担割合・介護度・新規／既存・納品日）を窓（components/UriageDialog.tsx）で入れてから、中身の入った売上伝票を新しいタブで開く。
// お客様の情報は URL に載せず、この端末の localStorage（taiyo-uriage-import-v1）に置く。売上伝票のアプリが受け取ったらすぐ消す
// （売上伝票のアプリの src/lib/importRequest.js。形を変えるときは、受け取る側を先に公開する）。
// 住宅改修（src/sasaoka/uriage.ts）も同じ口で送る。金額は見積書と同じ（saleTotals）。

import {saleTotals} from './calc.ts';
import type {Totals} from './calc.ts';
import {guessCategory} from './category.ts';
import type {Sale, Settings} from './types.ts';

export const URIAGE_IMPORT_KEY = 'taiyo-uriage-import-v1';
export const URIAGE_PATH = '/taiyo-uriage-denpyo/';
export type CustomerType = 'new' | 'existing';

/** 売上伝票の介護度の書き方（「要介護2」→「介護２」） */
export function slipCareLevel(level: string): string {
  const m = /^要(支援|介護)([1-5])$/.exec(level.normalize('NFKC').replace(/\s+/g, ''));
  return m ? `${m[1]}${String.fromCharCode(0xff10 + Number(m[2]))}` : '';
}

/** 売上伝票の種目（売上伝票のアプリの SPECIFIC_CATEGORIES の名前） */
const SLIP_CATEGORY: Record<string, string> = {
  入浴用いす: 'シャワーチェア',
  浴槽内いす: '浴槽台',
  浴槽用手すり: '浴槽手すり',
  腰掛便座: '腰掛便座',
  歩行補助つえ: '歩行補助杖',
  歩行器: '歩行器',
  固定用スロープ: 'スロープ',
  移動用リフトのつり具の部分: '移動用リフトのつり具',
  自動排泄処理装置の交換可能部品: '自動排泄処理装置の交換可能備品',
  排泄予測支援機器: '排泄予測支援機器',
  簡易浴槽: '簡易浴槽',
};

/** 商品の種目から売上伝票の種目（同じものは1つ）。入浴補助用具は細目で決める（入浴台・すのこ・介助ベルトは売上伝票に種目がない） */
export function slipCategories(sale: Pick<Sale, 'items'>): string[] {
  const out: string[] = [];
  for (const i of sale.items) {
    const g = i.category ? {category: i.category, sub: i.sub} : guessCategory(i.name);
    const name = g.category === '入浴補助用具' ? SLIP_CATEGORY[g.sub || guessCategory(i.name).sub] : SLIP_CATEGORY[g.category];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** 窓で選ぶもの（伝票の前に決める。選んだら案件にも入る） */
export type UriageChoice = {customerType: CustomerType | null; issueDate: string};

/** 足りないもの。fix は窓で入れられるもの、elsewhere は見積書で入れるもの（お客様名・担当・金額） */
export function uriageMissing(sale: Sale, t: Totals, c: UriageChoice): {fix: string[]; elsewhere: string[]} {
  const fix: string[] = [];
  const elsewhere: string[] = [];
  if (!t.ratioSet) fix.push('負担割合');
  if (!slipCareLevel(sale.careLevel)) fix.push('介護度');
  if (!c.customerType) fix.push('新規・既存');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.issueDate)) fix.push('納品日');
  if (!sale.customer.trim()) elsewhere.push('お客様名');
  if (!sale.staff.trim()) elsewhere.push('担当');
  if (t.total <= 0) elsewhere.push('商品の金額');
  return {fix, elsewhere};
}

export type UriageRequest = {
  kind: 'taiyo-uriage-request';
  v: 1;
  createdAt: number;
  sales: Record<string, unknown>;
};

/** 売上伝票に入れる内容（売上伝票のアプリの共有リンクの sales と同じ項目＋生活保護 welfare） */
export function uriageRequest(sale: Sale, s: Pick<Settings, 'markupRate' | 'limit' | 'minProfitRate'>, c: UriageChoice, now = Date.now()): UriageRequest {
  const t = saleTotals(sale, s);
  return {
    kind: 'taiyo-uriage-request',
    v: 1,
    createdAt: now,
    sales: {
      serviceType: 'specific',
      issueDate: c.issueDate,
      staff: sale.staff.trim(),
      customerName: sale.customer.trim(),
      customerAddress: sale.address.trim(),
      officeName: sale.careOffice.trim(),
      careManager: sale.careManager.trim(),
      customerType: c.customerType ?? 'new',
      billingType: sale.payMethod === '償還払い' ? 'reimbursement' : 'receipt',
      careLevel: slipCareLevel(sale.careLevel),
      userRatio: t.ratio / 10,
      // 今年度の残り：入れてあるか、限度額（10万円）を超えるときだけ（売上伝票は空欄なら超えない計算）
      ...(!t.remainingBlank || t.total > t.limit ? {remaining: t.remaining} : {}),
      items: t.lines.filter((l) => l.total > 0).map((l) => ({amount: l.total, cost: 0, productName: l.item.name.trim(), color: ''})),
      miyakoChecked: t.perItemApplied,
      showDetail: true,
      categories: slipCategories(sale),
      isSelfPay: false,
      welfare: sale.welfare,
    },
  };
}

/** 売上伝票を開く URL（受け取り口は ?from=shinsei で、ここから開いたことを知る） */
export function uriageUrl(): string {
  return new URL(`${URIAGE_PATH}?from=shinsei`, location.origin).href;
}

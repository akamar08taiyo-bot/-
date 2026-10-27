// 売上伝票発行依頼書（太陽ポータルと同じサイトの /taiyo-uriage-denpyo/）へ渡す内容（住宅改修）。
// ユーザーの依頼「売上伝票の発行依頼書を自動的に作りたい」と、相談で決めたこと（2026-10-27）：置き場所は工事見積書のタブの上の段、
// 住宅改修の明細は「住宅改修工事」の1行（見積書の合計（税込）と、工務店に払う仕切り＝仕切り計算表の合計（税込））。
// 足りない所（負担割合・介護度・新規／既存・施工日）は窓（estimate/UriageDialog.tsx）で入れてから、中身の入った売上伝票を新しいタブで開く。
// お客様の情報は URL に載せず、この端末の localStorage（taiyo-uriage-import-v1）に置く。売上伝票のアプリ（src/lib/importRequest.js）が受け取ったらすぐ消す。
// 特定福祉用具（src/tokutei/uriage.ts）も同じ口。形を変えるときは、受け取る側（売上伝票）を先に公開する。

import {estimateTotals, jobTotals} from './calc.ts';
import {NO_SHINSEI} from './estimateForms.ts';
import type {Job, Settings} from './types.ts';
import {staffFull} from './util.ts';

export const URIAGE_IMPORT_KEY = 'taiyo-uriage-import-v1';
export const URIAGE_PATH = '/taiyo-uriage-denpyo/';
/** 住宅改修の支給限度基準額（20万円）。介護保険の対象がこれを超えるとき、超えた分は売上伝票で実費になるように残高を渡す */
export const HOUSING_LIMIT = 200000;

export type CustomerType = 'new' | 'existing';
export type Billing = 'receipt' | 'reimbursement';

/** 売上伝票の介護度の書き方（「要介護2」→「介護２」） */
export function slipCareLevel(level: string): string {
  const m = /^要(支援|介護)([1-5])$/.exec(level.normalize('NFKC').replace(/\s+/g, ''));
  return m ? `${m[1]}${String.fromCharCode(0xff10 + Number(m[2]))}` : '';
}

/** 見積書の金額：合計（税込）・介護保険の対象（税込）・工務店に払う仕切り（仕切り計算表の合計＝税込） */
export function uriageAmounts(job: Job, s: Settings): {total: number; target: number; cost: number} {
  const e = estimateTotals(job, s);
  return {total: e.all.total, target: e.target.total, cost: jobTotals(job, s).total};
}

/** 窓で選ぶもの */
export type UriageChoice = {customerType: CustomerType | null; billing: Billing; issueDate: string};

/** 足りないもの。fix は窓で入れられるもの、elsewhere は見積書で入れるもの（お客様名・担当・金額） */
export function uriageMissing(job: Job, s: Settings, c: UriageChoice): {fix: string[]; elsewhere: string[]} {
  const si = job.shinsei ?? NO_SHINSEI;
  const fix: string[] = [];
  const elsewhere: string[] = [];
  if (!si.burden) fix.push('負担割合');
  if (!slipCareLevel(si.care)) fix.push('介護度');
  if (!c.customerType) fix.push('新規・既存');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.issueDate)) fix.push('施工日');
  if (!job.customer.trim()) elsewhere.push('お客様名');
  if (!job.staff.trim()) elsewhere.push('担当');
  if (uriageAmounts(job, s).total <= 0) elsewhere.push('見積書の金額');
  return {fix, elsewhere};
}

export type UriageRequest = {kind: 'taiyo-uriage-request'; v: 1; createdAt: number; sales: Record<string, unknown>};

/** 売上伝票に入れる内容（売上伝票のアプリの共有リンクの sales と同じ項目＋生活保護 welfare） */
export function uriageRequest(job: Job, s: Settings, c: UriageChoice, now = Date.now()): UriageRequest {
  const si = job.shinsei ?? NO_SHINSEI;
  const a = uriageAmounts(job, s);
  // 介護保険の対象外の工事があるか、対象が限度額（20万円）を超えるときは、売上伝票の「介護保険残高」に対象（20万円まで）を入れて、
  // 残りを実費（超過分）にする（売上伝票は残高が空欄なら全額を対象にする）
  const covered = Math.min(a.target, HOUSING_LIMIT);
  return {
    kind: 'taiyo-uriage-request',
    v: 1,
    createdAt: now,
    sales: {
      serviceType: 'housing',
      issueDate: c.issueDate,
      staff: staffFull(job.staff, s.staffList).trim(),
      customerName: job.customer.trim(),
      customerAddress: job.address.trim(),
      officeName: si.reasonOffice.trim(),
      careManager: si.reasonName.trim(),
      contractor: s.clientName.trim(),
      customerType: c.customerType ?? 'new',
      billingType: c.billing,
      careLevel: slipCareLevel(si.care),
      userRatio: Number(si.burden || 1) / 10,
      ...(covered < a.total ? {remaining: covered} : {}),
      items: [{amount: a.total, cost: a.cost, productName: '住宅改修工事', color: ''}],
      isSelfPay: false,
      welfare: si.welfare === true,
    },
  };
}

/** 売上伝票を開く URL（受け取り口は ?from=shinsei で、ここから開いたことを知る） */
export function uriageUrl(): string {
  return new URL(`${URIAGE_PATH}?from=shinsei`, location.origin).href;
}

// 見積書の明細の下に書く介護保険の内訳（「介護保険（受領委任払い）」「介護保険の対象　○円」「利用者負担（1割）　○円」＝赤字「保険者負担（9割）　○円」）。
// 特定福祉用具の販売見積書と同じ書き方（tokutei の estimateBook.ts の insuranceLines）。ユーザーの指示「工事見積書にも販売見積書と同様に記載する。
// 記載する、記載しないは販売見積もりと同様に選択できるようにする」2026-10-28。画面・印刷（print/EstimateForms.tsx）と Excel（estimateXlsx.ts）で同じ行を使う。
// 金額は売上伝票（uriage.ts・estimate/UriageDialog.tsx）と同じ計算：介護保険の対象は限度額（20万円）まで、利用者負担は切り上げ、保険者負担は残り。

import {estimateTotals} from './calc.ts';
import type {EstimateSettings} from './calc.ts';
import {NO_SHINSEI, paginate, TOTAL_ROWS} from './estimateForms.ts';
import type {FormLine} from './estimateForms.ts';
import type {Job} from './types.ts';
import {HOUSING_LIMIT} from './uriage.ts';
import {yen} from './util.ts';

/** 利用者負担の行の赤（画面・印刷。Excel は同じ色の C00000） */
export const CARE_RED = '#c00000';
export const CARE_RED_XLSX = 'C00000';

/** 介護保険の内訳の行の文字（見積書の Excel を取り込むとき、明細の行と見分ける。importDocs.ts） */
export const CARE_LINE = /^(介護保険（|介護保険の対象|介護保険の対象外|利用者負担（|生活保護（|保険者負担（|限度額を超えた分|いったんお支払いいただく金額|（あとで保険者から)/;

/** 書くか（「自己負担額を表示」。初めは書く。外すと false） */
export const showsCareLines = (job: Pick<Job, 'showSelfPay'>) => job.showSelfPay !== false;

/** 利用者負担の行（見積書では赤字。見積書の上の「自己負担額を表示」の横にも出す） */
export const userBurdenLine = (ratio: number, amount: number) => `利用者負担（${ratio}割）　${yen(amount)}円`;

export type CareLines = {lines: string[]; red: number; user: number | null};

/**
 * 介護保険の内訳の行。red は赤字にする行（利用者負担）の番号（なければ -1）、user は利用者負担の金額（負担割合を選んでいなければ null）。
 * 負担割合を選ぶまで、割合で決まる行（利用者負担・生活保護・保険者負担・払い戻し）は書かない（販売見積書と同じ）。
 * 限度額を超えた分・介護保険の対象外の工事はあるときだけ。償還払いは、いったん全額を払うことと払い戻しの行も。介護保険の対象がなければ []
 */
type CareJob = Pick<Job, 'places' | 'overhead' | 'overheadTarget' | 'shinsei' | 'uriage'>;

/**
 * 介護保険の金額：介護保険の対象（限度額 20万円まで）・負担割合（未選択は 0）・負担割合の分（切り上げ）・保険給付額（保険者負担＝対象−負担割合の分）。
 * 見積書の内訳と、申請書の委任状の保険給付額（shinsei.ts の shinseiValues）で同じ計算
 */
export function careAmounts(job: CareJob, s: EstimateSettings) {
  const t = estimateTotals(job, s);
  const ratio = Number((job.shinsei ?? NO_SHINSEI).burden) || 0;
  const covered = Math.min(t.target.total, HOUSING_LIMIT);
  const share = ratio ? Math.ceil((covered * ratio) / 10) : 0;
  return {t, ratio, covered, share, benefit: ratio ? covered - share : 0};
}

export function careLines(job: CareJob, s: EstimateSettings): CareLines {
  const {t, ratio, covered, share} = careAmounts(job, s);
  if (t.target.total <= 0) return {lines: [], red: -1, user: null};
  const si = job.shinsei ?? NO_SHINSEI;
  const pay = job.uriage?.billing === 'reimbursement' ? '償還払い' : '受領委任払い';
  const lines = [`介護保険（${pay}）`, `介護保険の対象　${yen(covered)}円`];
  let red = -1;
  if (ratio) {
    // 生活保護のときの負担割合の分は「生活保護（1割）」と書く（「介護扶助」とは書かない。販売見積書と同じ）
    if (si.welfare) lines.push(`生活保護（${ratio}割）　${yen(share)}円`);
    else {
      red = lines.length;
      lines.push(userBurdenLine(ratio, share));
    }
    lines.push(`保険者負担（${10 - ratio}割）　${yen(covered - share)}円`);
  }
  if (t.target.total > covered) lines.push(`限度額を超えた分　${yen(t.target.total - covered)}円`);
  if (t.all.total > t.target.total) lines.push(`介護保険の対象外　${yen(t.all.total - t.target.total)}円`);
  if (pay === '償還払い') lines.push(`いったんお支払いいただく金額　${yen(t.all.total)}円`, ...(ratio ? [`（あとで保険者から ${yen(covered - share)}円が払い戻されます）`] : []));
  return {lines, red, user: ratio ? (si.welfare ? 0 : share) : null};
}

/** 内訳の1行（見積書の明細の行の形。memo の行は文字だけを左の欄に書く） */
function memoLine(text: string, red: boolean): FormLine {
  return {
    place: -1, // 箇所の行とは別のまとまり（paginate で同じページに入れる）
    placeId: '',
    rowId: '',
    rowIds: [],
    excludeId: '',
    isWork: false,
    first: false,
    placeName: '',
    work: '',
    kind: 0,
    photo: 0,
    mark: '材',
    text: '',
    autoText: '',
    qty: 0,
    unit: '',
    unitPrice: 0,
    amount: 0,
    excluded: false,
    listPrice: 0,
    rate: null,
    cut: '',
    piece: 0,
    hourly: false,
    note: null,
    manualAmount: false,
    blank: true,
    memo: {text, red},
  };
}

/**
 * 明細の行のあとに介護保険の内訳の行を足す（書かないとき・介護保険の対象がないときはそのまま）。
 * 最後の行の2行下から（1行あける）。最後のページの合計の上に入らないときは、あけずにすぐ下、それも入らなければ次のページ（paginate が送る）
 */
export function withCareLines(lines: FormLine[], job: Parameters<typeof careLines>[0] & Pick<Job, 'showSelfPay'>, s: EstimateSettings, perPage: number): FormLine[] {
  if (!showsCareLines(job)) return lines;
  const care = careLines(job, s);
  if (care.lines.length === 0) return lines;
  const pages = paginate(lines, perPage);
  const free = perPage - TOTAL_ROWS - pages[pages.length - 1].length;
  const gap = lines.length > 0 && free >= care.lines.length + 1 ? [memoLine('', false)] : [];
  return [...lines, ...gap, ...care.lines.map((text, i) => memoLine(text, i === care.red))];
}

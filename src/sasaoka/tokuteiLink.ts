// 様邸の画面の「🛁 特定福祉用具申請書」のタブ：特定福祉用具のアプリ（太陽ポータルの tokutei/）を、この様邸のお客様の情報を渡して中に出す
// （ユーザーの指示「上のタブのところに、住宅改修申請書、特定福祉用具申請書、工事見積書、理由書の順番で、並べてください」「特定福祉用具アプリを出す」、2026-10-22）。
//   localStorage の TOKUTEI_KEY にお客様の情報（特定福祉用具の案件の項目の名前で）を書いてから、../tokutei/index.html#jutaku=<様邸の id>&embed=1 を開く。
//   特定福祉用具は、その様邸の案件を開く（なければ作る）。住宅改修で変わった値だけ入れ直し、特定福祉用具で手で直した値はそのまま。
//   2つのアプリはコードもデータも分けている（ユーザーの指示「全く別物として作成」）。受け渡しの形を変えるときは、
//   特定福祉用具（同じリポジトリのブランチ claude/care-insurance-auto-transfer-3z0c9n）の src/tokutei/jutaku.ts も直す

import {jobInsurer, NO_SHINSEI} from './estimateForms.ts';
import {birthIso} from './riyu.ts';
import type {Job} from './types.ts';

export const TOKUTEI_KEY = 'taiyo-tokutei-from-jutaku-v1';
/** 特定福祉用具のアプリ（ポータルでは jutaku-mitsumori/・sasaoka/ のとなりの tokutei/） */
export const TOKUTEI_URL = '../tokutei/index.html';

/** 特定福祉用具に渡すお客様の情報（特定福祉用具の案件の項目の名前。保険者・負担割合は入っていなければ渡さない） */
export type TokuteiFields = {
  customer: string;
  kana: string;
  insuredNo: string;
  birthDate: string; // 'YYYY-MM-DD'
  gender: '' | '男' | '女';
  zip: string;
  address: string;
  tel: string;
  careLevel: string; // 要支援1〜要介護5
  insurer?: string; // kanda・yukuhashi・miyako・kouiki（特定福祉用具も同じ名前）
  burdenRatio?: 1 | 2 | 3;
  careOffice: string; // 居宅介護支援事業所（理由書の作成者の事業所）
  careManager: string; // ケアマネジャー（理由書の作成者）
  // 介護保険証から（入っていなければ渡さない。特定福祉用具の支給申請書に書くとき用。2026-10-22）
  careFrom?: string; // 認定の有効期間のはじめ 'YYYY-MM-DD'
  careTo?: string; // 認定の有効期間のおわり
  insurerNo?: string; // 保険者番号（6けた）
};

export function tokuteiFields(job: Job): TokuteiFields {
  const info = {...NO_SHINSEI, ...job.shinsei};
  const insurer = jobInsurer(job);
  return {
    customer: job.customer.trim(),
    kana: info.kana.trim(),
    insuredNo: job.insuredNo.trim(),
    birthDate: birthIso(info),
    gender: info.gender === '男' || info.gender === '女' ? info.gender : '',
    zip: info.zip.trim(),
    address: job.address.trim(),
    tel: info.phone.trim(),
    careLevel: info.care,
    ...(insurer ? {insurer} : {}),
    ...(info.burden ? {burdenRatio: Number(info.burden) as 1 | 2 | 3} : {}),
    careOffice: info.reasonOffice.trim(),
    careManager: info.reasonName.trim(),
    ...(info.careFrom ? {careFrom: info.careFrom} : {}),
    ...(info.careTo ? {careTo: info.careTo} : {}),
    ...(info.insurerNo.trim() ? {insurerNo: info.insurerNo.trim()} : {}),
  };
}

/** タブの中に出す特定福祉用具のアプリの URL（その様邸の案件を開く。上の題名の段は出さない） */
export const tokuteiUrl = (jobId: string) => `${TOKUTEI_URL}#jutaku=${encodeURIComponent(jobId)}&embed=1`;

/**
 * 特定福祉用具申請書のタブを離れる（タブを替える・一覧へ戻る）前に、中の特定福祉用具のアプリに、まだ保存していない変更を保存させて待つ。
 * 枠を消すと、中のアプリの保存が途中で止まって、直した値が消えるため（特定福祉用具の App.tsx の __taiyoTokuteiFlush）。待つのは長くても2秒
 */
export function flushTokutei(): Promise<void> {
  let saving: Promise<unknown> | undefined;
  try {
    const win = document.querySelector<HTMLIFrameElement>('iframe[data-tokutei]')?.contentWindow as (Window & {__taiyoTokuteiFlush?: () => Promise<unknown>}) | null | undefined;
    saving = win?.__taiyoTokuteiFlush?.();
  } catch {
    /* 中のアプリを読めなくても、タブは替える */
  }
  if (!saving) return Promise.resolve();
  return Promise.race([saving.then(() => undefined, () => undefined), new Promise<void>((done) => setTimeout(done, 2000))]);
}

/** お客様の情報を特定福祉用具に渡す（localStorage に書く。書けなければ false＝特定福祉用具は一覧から） */
export function writeTokutei(job: Job): boolean {
  try {
    localStorage.setItem(TOKUTEI_KEY, JSON.stringify({job: job.id, fields: tokuteiFields(job)}));
    return true;
  } catch {
    return false;
  }
}

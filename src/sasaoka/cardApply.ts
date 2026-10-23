// 介護保険証から読んだ項目を、様邸（申請書・理由書・見積書と同じ Job）に入れる。確かめる画面（CardDialog）の行もここで決める。
// 被保険者番号・氏名・住所は見積書・申請書・理由書の共通の欄、フリガナ・生年月日・性別・郵便番号・要介護・認定有効期間・保険者番号・負担割合・
// 居宅介護支援事業所（理由書の作成者の事業所）は申請書の項目（ShinseiInfo）。特定福祉用具へは tokuteiLink.ts で同じ値を渡す

import {eraOf, INSURER_INFO, NO_SHINSEI} from './estimateForms.ts';
import type {CardInfo, CardKey} from './hokensho.ts';
import {warekiText} from './riyu.ts';
import type {Insurer, Job, ShinseiInfo} from './types.ts';

/** 確かめる画面の1行（いくつかの項目をまとめたもの＝生年月日・認定有効期間） */
export type CardField = 'insuredNo' | 'kana' | 'name' | 'birth' | 'gender' | 'zip' | 'address' | 'care' | 'careTerm' | 'insurer' | 'insurerNo' | 'office' | 'burden';

export const CARD_FIELDS: {field: CardField; label: string; keys: CardKey[]}[] = [
  {field: 'insuredNo', label: '被保険者番号', keys: ['insuredNo']},
  {field: 'kana', label: 'フリガナ', keys: ['kana']},
  {field: 'name', label: '氏名', keys: ['name']},
  {field: 'birth', label: '生年月日', keys: ['era', 'birthY', 'birthM', 'birthD']},
  {field: 'gender', label: '性別', keys: ['gender']},
  {field: 'zip', label: '郵便番号', keys: ['zip']},
  {field: 'address', label: '住所', keys: ['address']},
  {field: 'care', label: '要介護状態区分', keys: ['care']},
  {field: 'careTerm', label: '認定の有効期間', keys: ['careFrom', 'careTo']},
  {field: 'insurer', label: '保険者', keys: ['insurer']},
  {field: 'insurerNo', label: '保険者番号', keys: ['insurerNo']},
  {field: 'office', label: '居宅介護支援事業所', keys: ['office']},
  {field: 'burden', label: '利用者負担の割合', keys: ['burden']},
];

/** 和暦の生年月日の文字（「昭和13年4月14日」） */
export const birthText = (v: Pick<CardInfo, 'era' | 'birthY' | 'birthM' | 'birthD'>) => (v.era && v.birthY ? `${v.era}${v.birthY}年${v.birthM}月${v.birthD}日` : '');

// 和暦は理由書と同じ（令和は2019年5月1日から。2019年1〜4月は平成31年）
export const termText = (from: string, to: string) => (from || to ? `${warekiText(from)}～${warekiText(to)}` : '');

/** 様邸の今の値（確かめる画面で、読んだ値と並べる） */
export function currentOf(job: Job): CardInfo {
  const s: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  return {
    insuredNo: job.insuredNo,
    insurerNo: s.insurerNo,
    insurer: job.insurer ?? '',
    insurerName: job.insurer ? INSURER_INFO[job.insurer].name : '',
    kana: s.kana,
    name: job.customer,
    zip: s.zip,
    address: job.address,
    // 元号を選んでいない生年月日は、申請書と同じく昭和（空のままだと「今の値なし」になり、たしかでない読みで上書きしていた）
    era: s.birthY ? eraOf(s) : s.era,
    birthY: s.birthY,
    birthM: s.birthM,
    birthD: s.birthD,
    gender: s.gender,
    care: s.care,
    careFrom: s.careFrom,
    careTo: s.careTo,
    office: s.reasonOffice,
    burden: s.burden,
    burdenFrom: '',
    burdenTo: '',
  };
}

/** 同じ値か（全角半角・空白のちがいは同じ） */
export const sameText = (a: string, b: string) => a.normalize('NFKC').replace(/\s/g, '') === b.normalize('NFKC').replace(/\s/g, '');

/** 確かめる画面の行に出す値（そろえた文字。同じかどうかの比べにも使う） */
export function fieldText(v: CardInfo, f: CardField): string {
  switch (f) {
    case 'birth':
      return birthText(v);
    case 'careTerm':
      return termText(v.careFrom, v.careTo);
    case 'insurer':
      return v.insurer ? INSURER_INFO[v.insurer].name : '';
    case 'burden':
      return v.burden ? `${v.burden}割` : '';
    default:
      return String(v[f]).replace(/[ \t]+/g, ' ').trim();
  }
}

/**
 * はじめから入れる（チェックする）行：読めた値が今とちがい、今が空か、読めた値がたしか（形に合う）なとき。
 * 今の値があって、読めた値がたしかでないときは入れない（読み違いで上書きしない）。保険者は今が空のときだけ（様式が変わるため）
 */
export function defaultPicks(job: Job, read: CardInfo, unsure: CardKey[]): Set<CardField> {
  const cur = currentOf(job);
  const out = new Set<CardField>();
  for (const {field, keys} of CARD_FIELDS) {
    const v = fieldText(read, field);
    if (!v) continue;
    const now = fieldText(cur, field);
    if (sameText(now, v)) continue;
    if (field === 'insurer' && job.insurer) continue;
    const sure = !keys.some((k) => unsure.includes(k));
    if (!now || sure) out.add(field);
  }
  return out;
}

/** 選んだ行の値を様邸に入れる（申請書・理由書・見積書に同時に出る） */
export function applyCard(job: Job, v: CardInfo, picks: Set<CardField>): Job {
  const s: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  let next: Job = {...job};
  const sh: Partial<ShinseiInfo> = {};
  for (const f of picks) {
    switch (f) {
      case 'insuredNo':
        // 全角の数字（確かめる画面で日本語入力のまま打ち直した「０００…」）も数字に
        next.insuredNo = v.insuredNo.normalize('NFKC').replace(/\D/g, '');
        break;
      case 'name':
        next.customer = v.name.trim();
        break;
      case 'address':
        next.address = v.address.trim();
        break;
      case 'kana':
        sh.kana = v.kana.trim();
        break;
      case 'birth':
        // 申請書の元号は明治・大正・昭和（平成生まれは元号を空にして、年月日だけ）
        sh.era = v.era === '平成' ? '' : (v.era as ShinseiInfo['era']);
        sh.birthY = v.birthY;
        sh.birthM = v.birthM;
        sh.birthD = v.birthD;
        break;
      case 'gender':
        sh.gender = v.gender;
        break;
      case 'zip':
        sh.zip = v.zip;
        break;
      case 'care':
        sh.care = v.care;
        break;
      case 'careTerm':
        sh.careFrom = v.careFrom;
        sh.careTo = v.careTo;
        break;
      case 'insurerNo':
        sh.insurerNo = v.insurerNo.normalize('NFKC').replace(/\D/g, '').slice(0, 8);
        break;
      case 'office':
        sh.reasonOffice = v.office.trim();
        break;
      case 'burden':
        sh.burden = v.burden;
        break;
      case 'insurer':
        if (v.insurer) next = {...next, insurer: v.insurer as Insurer, form: INSURER_INFO[v.insurer as Insurer].form};
        break;
    }
  }
  next.shinsei = {...s, ...sh};
  return next;
}

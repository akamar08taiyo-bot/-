// 介護保険証から読んだ項目を、様邸（申請書・理由書・見積書と同じ Job）に入れる。確かめる画面（CardDialog）の行もここで決める。
// 被保険者番号・氏名・住所は見積書・申請書・理由書の共通の欄、フリガナ・生年月日・性別・郵便番号・要介護・認定有効期間・保険者番号・負担割合・
// 居宅介護支援事業所（理由書の作成者の事業所）は申請書の項目（ShinseiInfo）。特定福祉用具へは tokuteiLink.ts で同じ値を渡す

import {editDistance} from './careSoft.ts';
import type {SoftKey, SoftRead} from './careSoft.ts';
import {eraOf, INSURER_INFO, NO_SHINSEI} from './estimateForms.ts';
import {NO_CARD} from './hokensho.ts';
import type {CardInfo, CardKey, CardRead} from './hokensho.ts';
import {riyuOf, warekiText} from './riyu.ts';
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
    // 今の住所が読んだ住所で始まる（建物名・部屋番号まで入っている）ときは、短くしない
    if (field === 'address' && now.normalize('NFKC').replace(/\s/g, '').startsWith(v.normalize('NFKC').replace(/\s/g, ''))) continue;
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

// ---------------------------------------------------------------- 介護ソフトの画面から（2026-10-23）
// 介護保険証と同じ入口に、介護ソフトのお客様の欄のスクリーンショットも入れられる（careSoft.ts・careSoftOcr.ts）。
// 保険証にもある項目は上の行（CARD_FIELDS）で、保険証にない項目（電話番号・担当・ケアマネジャー・居宅の電話・生活保護）はここの行で、読めたときだけ出す

/** 介護ソフトの画面から読んだ、保険証にない項目 */
export type ExtraInfo = {
  phone: string; // 電話番号 → 申請書の電話番号
  staff: string; // 営業（担当）：読んだまま（担当者の候補と同じときだけ入れる）
  reasonName: string; // 委託先居宅のケアマネジャー → 理由書の作成者の氏名
  reasonTel: string; // 居宅の電話 → 理由書の作成者の連絡先
  welfare: '' | 'yes' | 'no'; // 生活保護（給付情報が「生保」）
};
export type ExtraField = keyof ExtraInfo;
export const NO_EXTRA: ExtraInfo = {phone: '', staff: '', reasonName: '', reasonTel: '', welfare: ''};
export const EXTRA_FIELDS: {field: ExtraField; label: string}[] = [
  {field: 'phone', label: '電話番号'},
  {field: 'staff', label: '担当'},
  {field: 'reasonName', label: 'ケアマネジャー'},
  {field: 'reasonTel', label: '居宅の電話'},
  {field: 'welfare', label: '生活保護'},
];

/** 読んだもの：介護保険証（被保険者証・負担割合証）、または介護ソフトの画面（soft。保険証にない項目も） */
export type ReadResult = CardRead & {soft?: {extra: ExtraInfo; unsure: ExtraField[]}};

/** 介護ソフトの画面から読んだ結果 → 確かめる画面の形（保険証の項目＋保険証にない項目） */
export function softRead(s: SoftRead): ReadResult {
  const i = s.info;
  const info: CardInfo = {
    ...NO_CARD,
    insuredNo: i.insuredNo,
    insurer: i.insurer,
    insurerName: i.insurerName,
    kana: i.kana,
    name: i.name,
    zip: i.zip,
    address: i.address,
    era: i.era,
    birthY: i.birthY,
    birthM: i.birthM,
    birthD: i.birthD,
    gender: i.gender,
    care: i.care,
    careFrom: i.careFrom,
    careTo: i.careTo,
    office: i.office,
    burden: i.burden,
  };
  const cardKeys = new Set<string>(Object.keys(NO_CARD));
  const toExtra: Partial<Record<SoftKey, ExtraField>> = {phone: 'phone', staff: 'staff', manager: 'reasonName', officeTel: 'reasonTel', welfare: 'welfare'};
  return {
    info,
    unsure: s.unsure.filter((k) => cardKeys.has(k) && k !== 'insurerName') as CardKey[],
    kinds: [],
    soft: {
      extra: {phone: i.phone, staff: i.staff, reasonName: i.manager, reasonTel: i.officeTel, welfare: i.welfare},
      unsure: s.unsure.map((k) => toExtra[k]).filter((k): k is ExtraField => !!k),
    },
  };
}

/** 担当者の候補のうち、読んだ名前のもの（空白のちがいは同じ。読んだ字の前後のごみは気にしない＝候補のフルネームが読んだ字の中にあれば） */
export function staffMatch(read: string, list: string[]): string {
  return staffGuess(read, list).exact ? staffGuess(read, list).name : '';
}

/**
 * 担当者の候補から、読んだ名前の人を選ぶ。exact：候補のフルネームが読んだ字の中にある。
 * そうでなくても、姓の1字目が同じで、ちがう字が候補の字の半分まで・ほかの候補より近ければ、その人（小さな字の読み違い。久保 区中 → 久保 匠史。確かめてもらう）
 */
export function staffGuess(read: string, list: string[]): {name: string; exact: boolean} {
  const r = read.normalize('NFKC').replace(/\s/g, '');
  if (!r) return {name: '', exact: false};
  const key = (x: string) => x.normalize('NFKC').replace(/\s/g, '');
  const exact = list.filter((x) => key(x).length >= 2 && r.includes(key(x))).sort((a, b) => key(b).length - key(a).length)[0];
  if (exact) return {name: exact, exact: true};
  const near = list
    .filter((x) => key(x).length >= 2 && key(x)[0] === r[0])
    .map((x) => ({x, d: editDistance(r, key(x))}))
    .filter((c) => c.d <= Math.floor(key(c.x).length / 2))
    .sort((a, b) => a.d - b.d);
  return near.length && (near.length === 1 || near[0].d < near[1].d) ? {name: near[0].x, exact: false} : {name: '', exact: false};
}

/** 様邸の今の値（保険証にない項目。生活保護は入っていなければ「なし」） */
export function currentExtra(job: Job): ExtraInfo {
  const s: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  return {phone: s.phone, staff: job.staff, reasonName: s.reasonName, reasonTel: riyuOf(job).tel, welfare: s.welfare ? 'yes' : 'no'};
}

/** 確かめる画面の行に出す値（保険証にない項目） */
export function extraText(v: ExtraInfo, f: ExtraField): string {
  if (f === 'welfare') return v.welfare === 'yes' ? 'あり（生保）' : v.welfare === 'no' ? 'なし' : '';
  return v[f].replace(/[ \t]+/g, ' ').trim();
}

/** 同じ値か（電話番号はハイフンのちがいも同じ） */
export const sameExtra = (f: ExtraField, a: string, b: string) => (f === 'phone' || f === 'reasonTel' ? a.normalize('NFKC').replace(/\D/g, '') === b.normalize('NFKC').replace(/\D/g, '') && !!a === !!b : sameText(a, b));

/**
 * はじめから入れる（チェックする）行（保険証にない項目）：defaultPicks と同じ決まり（今とちがい、今が空か、読めた値がたしかなとき）。
 * 担当は、担当者の候補にある名前のときだけ（v.staff は候補の名前にしてから渡す）
 */
export function extraPicks(job: Job, v: ExtraInfo, unsure: ExtraField[]): Set<ExtraField> {
  const cur = currentExtra(job);
  const out = new Set<ExtraField>();
  for (const {field} of EXTRA_FIELDS) {
    const value = extraText(v, field);
    if (!value) continue;
    const now = extraText(cur, field);
    if (sameExtra(field, now, value)) continue;
    if (!now || !unsure.includes(field)) out.add(field);
  }
  return out;
}

/** 選んだ行の値を様邸に入れる（保険証にない項目）。担当は担当者の候補にある名前のときだけ（ないときはそのまま） */
export function applyExtra(job: Job, v: ExtraInfo, picks: Set<ExtraField>, staffList: string[]): Job {
  const next: Job = {...job};
  const s: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  for (const f of picks) {
    switch (f) {
      case 'phone':
        s.phone = v.phone.trim();
        break;
      case 'reasonName':
        s.reasonName = v.reasonName.trim();
        break;
      case 'welfare':
        // 生活保護でなければ持たない（undefined にしておくと、確かめているあいだの変更と合わせるときも消える）
        if (v.welfare) s.welfare = v.welfare === 'yes' ? true : undefined;
        break;
      case 'staff': {
        const m = staffList.includes(v.staff) ? v.staff : staffGuess(v.staff, staffList).name;
        if (m) next.staff = m;
        break;
      }
      case 'reasonTel':
        next.riyu = {...riyuOf(job), tel: v.reasonTel.trim()};
        break;
    }
  }
  next.shinsei = s;
  return next;
}

// ---------------------------------------------------------------- 追加で読み取る（2026-10-23）
// 1回で読めなかった所を、確かめる画面に2枚目のスクリーンショット（画面の別の所）・保険証を入れて足す
// （ユーザーの指示「１回でよみ取れない場合は、追加で読み取れるようにもする」）

/**
 * 追加で読んだ値を足すか：空の欄は足す。たしかでない欄は、たしかな読みに替える（同じ読みが2回でもたしか）。たしかな欄・手で直した欄（呼ぶ側で除く）はそのまま。
 * take：値を替える、sure：足したあとのたしかさ。null：何もしない
 */
function addOne(now: string, nowSure: boolean, add: string, addSure: boolean, same: (a: string, b: string) => boolean): {take: boolean; sure: boolean} | null {
  if (!add) return null;
  if (!now) return {take: true, sure: addSure};
  if (nowSure) return null;
  if (same(now, add)) return {take: false, sure: true};
  return addSure ? {take: true, sure: true} : null;
}

/** 追加で読んだ結果を、確かめる画面の値（保険証にもある項目）に足す。edited：手で直した欄（変えない）。changed：値・たしかさの変わった欄 */
export function addCardRead(cur: CardInfo, unsure: CardKey[], edited: ReadonlySet<CardField>, add: CardRead): {info: CardInfo; unsure: CardKey[]; changed: CardField[]} {
  const info: CardInfo = {...cur};
  let un = [...unsure];
  const changed: CardField[] = [];
  for (const {field, keys} of CARD_FIELDS) {
    if (edited.has(field)) continue;
    const r = addOne(fieldText(cur, field), !keys.some((k) => unsure.includes(k)), fieldText(add.info, field), !keys.some((k) => add.unsure.includes(k)), sameText);
    if (!r) continue;
    if (r.take) {
      for (const k of keys) (info as Record<string, unknown>)[k] = add.info[k];
      if (field === 'insurer') info.insurerName = add.info.insurerName;
      if (field === 'burden') [info.burdenFrom, info.burdenTo] = [add.info.burdenFrom, add.info.burdenTo];
    }
    un = un.filter((k) => !keys.includes(k));
    if (!r.sure) un.push(...keys);
    changed.push(field);
  }
  return {info, unsure: un, changed};
}

/** 追加で読んだ、保険証にない項目（介護ソフトの画面）を足す。edited：手で直した欄（変えない） */
export function addExtraRead(cur: ExtraInfo, unsure: ExtraField[], edited: ReadonlySet<ExtraField>, add: {extra: ExtraInfo; unsure: ExtraField[]}): {extra: ExtraInfo; unsure: ExtraField[]; changed: ExtraField[]} {
  const extra: ExtraInfo = {...cur};
  let un = [...unsure];
  const changed: ExtraField[] = [];
  for (const {field} of EXTRA_FIELDS) {
    if (edited.has(field)) continue;
    const r = addOne(extraText(cur, field), !unsure.includes(field), extraText(add.extra, field), !add.unsure.includes(field), (a, b) => sameExtra(field, a, b));
    if (!r) continue;
    if (r.take) (extra as Record<string, unknown>)[field] = add.extra[field];
    un = un.filter((k) => k !== field);
    if (!r.sure) un.push(field);
    changed.push(field);
  }
  return {extra, unsure: un, changed};
}

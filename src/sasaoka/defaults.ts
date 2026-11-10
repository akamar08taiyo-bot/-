import {COMPANY_NAME, DEFAULT_LABOR, DEFAULT_OFFICE, DEFAULT_STAFF, OFFICES, REG_NO, STAFF_FULL_NAMES} from './company.ts';
import type {Settings} from './types.ts';

// 会社ごとの値（取付手間の単価・担当者・営業所・会社名・登録番号）は company.ts（デモのビルドは demo/company.ts に置きかえる。vite.years.config.ts）
export {DEFAULT_LABOR, DEFAULT_STAFF, OFFICES, STAFF_FULL_NAMES};
export type {Office} from './company.ts';


/**
 * 箇所（改修場所）の候補：苅田町の写真の用紙の改修箇所（「□廊下　□階段　□台所　□居間・食堂　□寝室　□洗面・脱衣室　□浴室　□トイレ／□玄関　□玄関～道路　□その他（　）」）と
 * 同じ名前・同じ順番（ユーザーの指示「箇所を足すの項目は、写真の用紙の□玄関などの項目にあわせる」。その他は「＋ そのほか」で名前を打つ）
 */
export const DEFAULT_PLACES = ['廊下', '階段', '台所', '居間・食堂', '寝室', '洗面・脱衣室', '浴室', 'トイレ', '玄関', '玄関～道路'];
/** 前の版の箇所の候補（設定がこのままなら、読み込んだときに新しい候補にする） */
export const OLD_DEFAULT_PLACES = ['玄関', '上がり框', '廊下', '階段', 'トイレ', '浴室', '脱衣所', '洗面所', '居室', '寝室', '台所', '勝手口', '屋外・アプローチ'];



/** 太陽ポータル（taiyo-portal）で選んだ営業所名。ポータルと同じサイトで開いたときだけ読める */
export function portalOffice(): string {
  try {
    const raw = localStorage.getItem('taiyo_portal_session');
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.office === 'string' ? s.office : '';
  } catch {
    return '';
  }
}

export function settingsForOffice(base: Settings, officeName: string): Settings {
  const o = OFFICES.find((x) => x.name === officeName);
  if (!o) return {...base, officeName};
  return {...base, officeName: o.name, manager: o.manager, postal: o.postal, address: o.address, tel: o.tel, fax: o.fax};
}

/**
 * 設定の版。古い版で保存した設定を読み込むときに直す（storage.ts の cleanSettings）。
 * 2：請求書の消費税を「すべての様邸の合計に最後にかける」形にした
 * 3：担当者の候補をフルネームにした（久保 → 久保 匠史、土居 → 土居 翔太）
 * 4：残りの担当者の候補もフルネームにした（宮村 → 宮村 茉莉花、信田 → 信田 裕太、藤田 → 藤田 知美）
 * 5：箇所の候補を写真の用紙の改修箇所の名前にした（前の候補のままなら新しい候補に。DEFAULT_PLACES）
 */
export const SETTINGS_REV = 6;
/** 取付手間の見積の単価を直した版（2：踏台 木 を 2,000円に）。前に保存したマスタ・見積書の行を一度だけ直す（App.tsx） */
export const LABOR_REV = 2;

export function defaultSettings(): Settings {
  const office = portalOffice() || DEFAULT_OFFICE;
  const base: Settings = {
    // 請求先（工務店）は設定で入れる（初めは空＝画面では「工務店」）。ユーザーの指示「笹岡工務店ではなく、笹岡に絞らず、工務店の請求書にいれるに変更。全て。
    // 笹岡にしたかったら、設定の部分で工務店名を入力する」2026-11-03。前は行橋営業所だけ初めから笹岡工務店（2026-10-26）
    clientName: '',
    company: COMPANY_NAME,
    officeName: '',
    manager: '',
    postal: '',
    address: '',
    tel: '',
    fax: '',
    person: '',
    // 見積・提案書作成アプリの御見積書と同じ登録番号
    regNo: REG_NO,
    bank: '',
    subject: '工事代金',
    invoiceNote: '',
    rate: 0.07,
    taxRate: 0.1,
    taxMode: 'original',
    invoiceTaxMode: 'monthly',
    totalTaxRounding: 'floor',
    placePresets: DEFAULT_PLACES,
    staffList: DEFAULT_STAFF,
    estimateRate: 0.8,
    estimateLaborRate: 1.5, // 見積の単価を入れていない取付手間は、仕切りの1.5倍（例：2,000円 → 3,000円）
    estimateOverheadRate: 0.1,
    estimateHourRate: 2500,
    estimateForm: 'yukuhashi',
    kitExample: false,
    laborEst: false,
    laborRev: LABOR_REV,
    tesuri: false,
    tokuteiSalesMonths: {},
    rev: SETTINGS_REV,
  };
  return settingsForOffice(base, office);
}

// （株）イヤーズ デモアプリの会社ごとの値（vite.years.config.ts が ../company.ts の代わりに使う）。
// 太陽シルバーサービスの社内の値（営業所・所長・担当者・工務店の仕切り・登録番号・原本の営業所の字）は入れない
// （ユーザーの指示「申請書、見積もりツールを（株）イヤーズ専用で作ろう…サンプルURLを渡し、こちらが主導権を握れるようにする」2026-11-10）。
// 営業所・担当者は、デモを使う人が ⚙ 設定で入れる。取付手間は名前だけ同じで、単価は見本（自社の単価に直して使う）
import type {LaborItem} from '../types.ts';

/** 会社名（ユーザーの答え「名前が変わって（株）イヤーズ」2026-11-10。帳票は正式な書き方。せまい欄は ㈱イヤーズ になる） */
export const COMPANY_NAME = '株式会社イヤーズ';
/** ポータルの営業所が分からないときの初めの営業所 */
export const DEFAULT_OFFICE = '';
export const REG_NO = '';

const note = '見本の単価';
/** 取付手間（見本の単価。仕切りは入れない） */
export const DEFAULT_LABOR: LaborItem[] = [
  {id: 'l01', name: '木', price: 0, estPrice: 3000, note},
  {id: 'l02', name: 'タイル', price: 0, estPrice: 4000, note},
  {id: 'l03', name: 'エルボ・チーズ（屋内）', price: 0, estPrice: 2000, note},
  {id: 'l04', name: '補強板 2m以下', price: 0, estPrice: 4000, note},
  {id: 'l05', name: '補強板 2m～3m', price: 0, estPrice: 6000, note},
  {id: 'l06', name: '補強板 3m以上', price: 0, estPrice: 8000, note},
  {id: 'l07', name: '踏台 木', price: 0, estPrice: 3000, note},
  {id: 'l08', name: '踏台 タイル', price: 0, estPrice: 4000, note},
  {id: 'l09', name: 'コア抜き', price: 0, estPrice: 5000, note},
  {id: 'l10', name: '基礎工事', price: 0, estPrice: 10000, note},
  {id: 'l11', name: 'スタンド', price: 0, estPrice: 3000, note},
  {id: 'l12', name: 'ヤザキステップ台', price: 0, estPrice: 3000, note},
  {id: 'l13', name: 'レバーハンドル', price: 0, estPrice: 3000, note},
  {id: 'l14', name: '敷居撤去', price: 0, estPrice: 5000, note},
  {id: 'l15', name: 'ウォシュレット', price: 0, estPrice: 8000, note},
  {id: 'l16', name: 'ウォシュレット 部品代', price: 0, estPrice: 3000, note},
  {id: 'l17', name: '安寿框手すり', price: 0, estPrice: 5000, note},
];

/** 担当者の候補（初めは空。設定で入れる） */
export const DEFAULT_STAFF: string[] = [];
export const STAFF_FULL_NAMES = new Map<string, string>();

export type Office = {name: string; postal: string; address: string; tel: string; fax: string; manager: string; jigyoshoNo: string; juryoNo?: string};
/** 営業所の一覧（デモには入れない。設定で営業所名・住所などを打つ） */
export const OFFICES: Office[] = [];

/** 申請書の施工業者に初めから選べる営業所（デモには入れない。申請書の画面の「＋ 追加」で足す） */
export const BUILDER_OFFICES: string[] = [];

/** 役所の原本に書いてあった営業所の字（デモのビルドでは原本の字も空白にしてあるので、書きかえない） */
export const ORIGINAL_OFFICE_TEXTS: {name: string; address: string; tel: string; manager: string} = {name: '', address: '', tel: '', manager: ''};

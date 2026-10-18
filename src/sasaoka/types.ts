// 仕切り計算・請求書作成アプリのデータの形。
// 保存はこの端末のブラウザ（IndexedDB）だけ。サーバーへは何も送らない。

/** 部材リスト（メーカーの仕切り表から取り込んだ商品） */
export type Material = {
  id: string;
  name: string; // 商品名
  price: number; // 仕切り価格（円）
  maker: string; // メーカー名
  code: string; // 品番
  unit: string; // 単位（本・個など。空でもよい）
  favorite: boolean; // よく使う（★）
  updatedAt: number;
};

/** 取付手間の単価（笹岡手間）。1箇所あたりの金額 */
export type LaborItem = {
  id: string;
  name: string;
  price: number;
  note: string;
};

export type RowKind = 'material' | 'labor';

/**
 * 箇所の中の1行（部材 または 取付手間）。
 * 品名・単価は選んだときの値を行に書き写して持つので、あとで部材リストや手間の単価を変えても、
 * すでに作った様邸の金額は変わらない。
 */
export type Row = {
  id: string;
  kind: RowKind;
  refId: string | null; // 部材リスト・手間単価のID（手入力の行は null）
  name: string;
  code: string; // 品番（部材だけ）
  maker: string; // メーカー（部材だけ）
  price: number; // 単価
  qty: number; // 数量・箇所数
};

/** 箇所（玄関・トイレなど） */
export type Place = {
  id: string;
  name: string;
  rows: Row[];
};

export type NameSuffix = '様邸' | '様' | '';

/** 1件（○○様邸） */
export type Job = {
  id: string;
  month: string; // 請求する月 'YYYY-MM'
  customer: string; // お客様名（「様邸」は suffix で付ける）
  suffix: NameSuffix;
  staff: string; // 担当（設定の「担当者の候補」から選ぶ。空でもよい）
  date: string; // 施工日 'YYYY-MM-DD'（空でもよい）
  address: string;
  note: string;
  places: Place[];
  createdAt: number;
  updatedAt: number;
};

/**
 * 様邸ごとの⑤消費税の1円未満の扱い。
 * original = 元の仕切り計算表と同じ「(①＋②＋③＋④)×0.1－1」（表示は四捨五入）
 */
export type TaxMode = 'original' | 'floor' | 'round' | 'ceil';

/**
 * 請求書（1か月分）の消費税の出し方。
 * perJob  = 様邸ごとの⑤消費税をそのまま足す（一覧に様邸ごとの消費税・合計を出す）
 * monthly = 1か月の税抜合計に対して1回だけ計算する（インボイス制度の端数処理の考え方）
 */
export type InvoiceTaxMode = 'perJob' | 'monthly';

export type Settings = {
  clientName: string; // 請求先（笹岡工務店）
  company: string; // 発行元の会社名
  officeName: string; // 営業所名
  manager: string; // 所長名（請求書に「○○営業所所長　氏名」と出る）
  postal: string;
  address: string;
  tel: string;
  fax: string;
  person: string; // 請求書の担当者（発行元の欄に出る。様邸ごとの担当とは別）
  regNo: string; // 登録番号（インボイス）
  bank: string; // お振込先（1行）
  subject: string; // 請求書の件名（「○年○月分」のあとに付く）
  invoiceNote: string; // 請求書の備考
  rate: number; // ③部材上乗せ・④諸経費の率（元の表の 0.07）
  taxRate: number; // 消費税率（0.1）
  taxMode: TaxMode;
  invoiceTaxMode: InvoiceTaxMode;
  placePresets: string[]; // 箇所の候補
  staffList: string[]; // 担当者の候補（様邸ごとに選ぶ）
};

export type AppData = {
  materials: Material[];
  labor: LaborItem[];
  jobs: Job[];
  settings: Settings;
};

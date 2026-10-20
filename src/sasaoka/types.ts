// 仕切り計算・請求書作成アプリのデータの形。
// 保存はこの端末のブラウザ（IndexedDB）だけ。サーバーへは何も送らない。

/** 部材リスト（メーカーの仕切り表から取り込んだ商品） */
export type Material = {
  id: string;
  name: string; // 商品名
  price: number; // 仕切り価格（円）
  listPrice: number; // 定価（税抜・円）。見積の単価のもと。分からなければ 0
  pieceLengthM: number; // 1本の長さ（m）。手すりなど切って使う部材。0 なら長さでは数えない
  maker: string; // メーカー名
  code: string; // 品番
  unit: string; // 単位（本・個など。空でもよい）
  favorite: boolean; // お気に入り（★）
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
 * 品名は空でもよい（金額だけ入れた行）。
 */
export type Row = {
  id: string;
  kind: RowKind;
  refId: string | null; // 部材リスト・手間単価のID（手入力の行は null）
  name: string;
  code: string; // 品番（部材だけ）
  maker: string; // メーカー（部材だけ）
  unit: string; // 単位（部材だけ。見積書に出す）
  price: number; // 単価（部材は仕切り価格。仕切り計算表・請求書に使う）
  qty: number; // 数量・箇所数
  // ---- 見積書だけに使う（部材の行）
  listPrice: number; // 定価（税抜）
  lengthCm: number; // 使う長さ（cm）。0 なら長さでは数えない（規格品そのまま）
  pieceLengthM: number; // 1本の長さ（m）。見積の数量＝使う長さ÷1本の長さ（例：60cm÷4m＝0.15本）
  estPrice: number | null; // 見積の単価を手で入れたとき。null なら 定価×掛率
  excluded: boolean; // 介護保険の対象外（見積書の「対象外」の欄に出す）。部材のすぐ下の施工費は部材に合わせる
  // ---- 見積書の欄を手で直したとき（見積書だけに出る。仕切り計算表・請求書は変わらない）。null なら自動
  estText: string | null; // 内容（品名）。施工費のまとまりは、その最初の手間の行に持つ
  estNote: string | null; // 備考（定価等）・算出根拠（改行で2行）
  estAmount: number | null; // 施工費のまとまりの金額（最初の手間の行に持つ。null なら取付手間の合計）
};

/** 箇所（玄関・トイレなど） */
export type Place = {
  id: string;
  name: string;
  rows: Row[];
  // ---- 見積書だけに使う
  kind: number; // 改修の種類（1 手すりの取付・2 段差の解消・3 床材の変更・4 扉の取替・5 便器の取替・6 付帯工事）
  photo: number; // 写真番号（0 なら箇所の順番）
};

export type NameSuffix = '様邸' | '様' | '';

/** 部材＋施工費（常用）（よく使う部材・取付手間の組み合わせ）。箇所に入れると、まとめて行が入る */
export type Kit = {
  id: string;
  name: string;
  rows: Row[];
  updatedAt: number;
};

/**
 * 発注書の1行（何を何個・何本・何枚発注するか）。見積書の部材から作る（order.ts）。
 * 切って使う部材は、1本の長さ（4000mm・2000mm）ごとに1行
 */
export type OrderLine = {
  key: string; // 見積書から作った行の目印（同じ部材・同じ長さ）。発注書で足した行は 'add:' から始まる
  refId: string | null; // 部材リストのID（手入力の行・部材リストにない 2000mm の品は null）
  maker: string;
  code: string; // 品番
  name: string; // 品名
  unit: string; // 単位（本・枚・個など）
  qty: number; // 発注する数
  calc: number; // 見積書から計算した数（発注書で足した行は 0）
  lengthMm: number; // 切って使う部材の1本の長さ（mm）。0 なら長さでは数えない
  price: number; // 仕切価格（1つあたり・税抜）
  listPrice: number; // 定価（1つあたり・税抜）
  warn: string; // 確かめてほしいこと（2000mm の品が部材リストにない など）
};

/** 発注書で手で直したところ。見積書から計算した行に重ねるので、見積書を直しても手で直したところは残る */
export type OrderEdits = {
  qty: Record<string, number>; // 数を直した行（key → 数）
  removed: string[]; // 消した行（key）
  added: OrderLine[]; // 発注書で足した行
  supplier: string; // 発注先
  date: string; // 発注日 'YYYY-MM-DD'（空なら印刷した日）
  note: string; // 備考（発注書のいちばん下に出す）
};

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
  insuredNo: string; // 介護保険被保険者番号（苅田町・行橋市・みやこ町用の見積書に出す）
  insurer?: Insurer | ''; // 保険者（申請書を出す先）。選んであれば見積書の書式はこれで決まる。空なら住所の市町村から
  form: EstimateForm | ''; // 見積書の書式（保険者を選んでいないとき。空なら住所の市町村から決める）
  overhead: number | null; // 見積書の諸経費を手で入れたとき（端数の調整など）。null なら 小計×率
  overheadTarget: number | null; // 介護保険の対象の諸経費を手で入れたとき（対象外の行があるときだけ使う）
  // 笹岡工務店の仕切り計算表・請求書に入れるか。仕切り計算・請求書アプリで作った様邸は入れる。
  // 見積書作成アプリで作った見積書は、「笹岡工務店の請求書に入れる」を選んだものだけ入れる
  shikiri: boolean;
  places: Place[];
  order?: OrderEdits | null; // 発注書で手で直したところ（なければ見積書から計算したまま）
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
 * monthly = すべての様邸の税抜合計に、最後に消費税率をかける（最初はこれ）
 * perJob  = 様邸ごとの⑤消費税をそのまま足す（一覧に様邸ごとの消費税・合計を出す）
 */
export type InvoiceTaxMode = 'perJob' | 'monthly';

/** 合計にかける消費税の1円未満（請求書の1か月分・見積書） */
export type Rounding = 'floor' | 'round' | 'ceil';

/** どちらのアプリで開いているか（部材・部材＋施工費（常用）を選ぶ画面に、仕切価格と見積の単価のどちらを出すか） */
export type AppMode = 'shikiri' | 'estimate';

/**
 * 見積書の書式（市町村で違う）。
 * yukuhashi = 苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」
 * kouiki    = 広域連合用「住宅改修内訳明細書」（福岡県介護保険広域連合の様式）
 */
export type EstimateForm = 'yukuhashi' | 'kouiki';

/**
 * 保険者（介護保険の住宅改修の申請書を出す先）。申請書は保険者ごとに違う。
 * 苅田町・行橋市・みやこ町は見積書が同じ書式（苅田町・行橋市・みやこ町用）、
 * kouiki ＝ 福岡県介護保険広域連合（築上町・豊前市・上毛町・吉富町）は広域連合用の書式
 */
export type Insurer = 'kanda' | 'yukuhashi' | 'miyako' | 'kouiki';

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
  totalTaxRounding: Rounding;
  placePresets: string[]; // 箇所の候補
  staffList: string[]; // 担当者の候補（様邸ごとに選ぶ）
  // ---- 見積書
  estimateRate: number; // 見積の部材の単価＝定価×この率（0.8）
  estimateOverheadRate: number; // 見積書の諸経費＝小計×この率（0.1）
  estimateHourRate: number; // 広域連合用の書式で、施工費を「時間×1時間の単価」で書くときの単価（2,500円）。0 なら「1式」
  estimateForm: EstimateForm; // 住所から市町村が分からないときの見積書の書式
  rev: number; // 設定の版（古い版で保存した設定を読み込むときの直し方に使う）
};

export type AppData = {
  materials: Material[];
  labor: LaborItem[];
  jobs: Job[];
  kits: Kit[];
  settings: Settings;
};

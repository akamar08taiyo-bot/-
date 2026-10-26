// 特定福祉用具 購入申請書・見積もり作成アプリのデータの形。
// 保存はこの端末のブラウザ（IndexedDB）だけ。サーバーへは何も送らない。
// 住宅改修 見積書・請求書アプリ（src/sasaoka）とは別の、独立したアプリ（データも共有しない）。

export type TaxType = '10%' | '8%' | '非課税';

/** 商品マスタの1件（仕切り一覧表から取り込む） */
export type Product = {
  id: string;
  name: string; // 商品名（表に色・規格の列があれば、うしろに付けたもの）
  maker: string; // メーカー名（申請書の「製造事業者名」）
  code: string; // 品番・型番
  tais: string; // TAISコード（5桁-6桁）。なければ空
  jan: string; // JANコード。なければ空
  category: string; // 種目（category.ts の CATEGORIES の名前）。決まらなければ空
  sub: string; // 種目の細目（入浴用いす など）
  categoryByHand: boolean; // 種目を手で選んだ（価格表を取り込み直しても変えない）
  listPrice: number; // 定価（税抜・円）。分からなければ 0
  cost: number; // 仕切（税抜・円）。分からなければ 0
  taxType: TaxType;
  unit: string; // 台・個・本など
  supplier: string; // 仕入先（発注先）：ケアマックス・ウェルファン・メーカーなど
  favorite: boolean; // ★お気に入り
  useCount: number; // 案件で使った回数（★の中でもよく使う順に並べる）
  lastUsedAt: number; // 最後に案件で使った時刻（0 ならまだ）
  source: string; // どの表から取り込んだか（ファイル名）
  updatedAt: number;
};

/**
 * 案件の明細の1行。選んだときの商品マスタの値を書き写して持つ
 * （あとで価格表を新しくしても、作った見積書・申請書の金額は変わらない）。
 */
export type SaleItem = {
  id: string;
  productId: string | null; // 商品マスタのID（手で入れた行は null）
  name: string;
  maker: string;
  code: string;
  tais: string;
  category: string;
  sub: string;
  unit: string;
  supplier: string;
  taxType: TaxType;
  listPrice: number; // 定価（税抜）
  cost: number; // 仕切（税抜）
  qty: number;
  discountRate: number; // 割引率（%）。20 ＝ 2割引き
  unitPrice: number | null; // 販売単価（税抜）を手で入れたとき。null なら 定価×(100−割引率)%
  reason: string; // 福祉用具が必要な理由（申請書の欄。用具ごと）
  // 見積書の税率の右の「備考」（算出根拠）を手で直したとき。null・なしなら自動（「定価28,000円の20%引き」。calc.ts の basisNote）
  basisNote?: string | null;
};

export type BurdenRatio = 1 | 2 | 3;
export type PayMethod = '受領委任払い' | '償還払い';
export type SaleStatus = '見積' | '申請' | '承認' | '納品' | '集金';
export type Gender = '' | '男' | '女';
/** 居宅サービス計画の届出（みやこ町の申請書）。空なら、居宅介護支援事業所が入っていれば「有」とみなす */
export type CarePlan = '' | '有' | '無';

/** 案件（お客様1件の販売） */
export type Sale = {
  id: string;
  customer: string; // お客様名（「様」は付けない）
  kana: string; // フリガナ
  insuredNo: string; // 被保険者番号
  birthDate: string; // 'YYYY-MM-DD'（和暦でも打てる。wareki.ts）
  gender: Gender; // 性別（申請書で丸をつける）
  zip: string; // 郵便番号（住所から自動で入る。zip.ts）
  address: string;
  tel: string;
  careLevel: string; // 要支援1〜要介護5
  insurer: string; // 保険者（defaults.ts の INSURERS の key。そのほかは 'other' と insurerName）
  insurerName: string;
  burdenRatio: BurdenRatio;
  payMethod: PayMethod;
  remaining: number | null; // 今年度の残り（円）。null（空欄）なら限度額（10万円）として計算
  perItem: boolean; // 個別切り上げ（品目ごとに利用者負担を切り上げる。みやこ町）
  welfare: boolean; // 生活保護（利用者のお支払いは 0。負担割合の分は介護扶助）
  staff: string; // 担当（福祉用具専門相談員）
  careOffice: string; // 居宅介護支援事業所
  careManager: string; // 担当ケアマネジャー（申請書の「記載者 事業所・氏名」は 居宅介護支援事業所＋ケアマネジャー）
  carePlan: CarePlan; // 居宅サービス計画の届出（みやこ町）
  quoteNo: string; // 見積番号
  estimateDate: string; // 見積日 'YYYY-MM-DD'
  applyDate: string; // 申請日
  approveDate: string; // 承認日
  deliveryDate: string; // 納品日（＝購入日。事前申請書の購入予定日・支給申請書の購入日・写真の撮影日）
  claimDate: string; // 支給申請日（支給申請書の日付。空なら空欄）
  collectDate: string; // 集金日
  status: SaleStatus;
  note: string; // 見積書の備考に足す文（介護保険の内訳の下に1行ずつ）
  items: SaleItem[];
  createdAt: number;
  updatedAt: number;
  jutakuJob?: string; // 住宅改修のアプリの様邸の画面（🛁 特定福祉用具申請書のタブ）から開いた案件：その様邸の id（jutaku.ts）
  jutakuSync?: JutakuFields; // 前に住宅改修から受け取ったお客様の情報（住宅改修で変わった値だけ入れ直すため）
  showSelfPay?: boolean; // 見積書の明細の最後の商品の2行下から介護保険の内訳（利用者負担＝自己負担額は赤字）を出すか。空なら出す・false なら出さない（見積もりの画面の「自己負担額を表示」。estimateBook.ts の belowItemLines）
  hacchuSentAt?: number; // 販売受注簿へ送った時刻（「📤 販売受注簿に転記」か、状態を承認にしたときの自動。自動で送るのは1回だけ。handoff.ts の queueHacchu）
};

/** 住宅改修のアプリから受け取るお客様の情報（jutaku.ts。案件の項目の名前で。生活保護 welfare は 2026-10-23 から） */
export type JutakuFields = Partial<
  Pick<Sale, 'customer' | 'kana' | 'insuredNo' | 'birthDate' | 'gender' | 'zip' | 'address' | 'tel' | 'careLevel' | 'insurer' | 'burdenRatio' | 'careOffice' | 'careManager' | 'welfare' | 'staff'>
>;

/** 見積書の発行元（営業所） */
export type Office = {
  name: string;
  postal: string;
  address: string;
  tel: string;
  fax: string;
  manager: string;
};

export type Settings = {
  company: string; // 太陽シルバーサービス株式会社
  officeName: string; // 営業所名（行橋営業所）
  postal: string;
  address: string;
  tel: string;
  fax: string;
  manager: string; // 所長
  regNo: string; // 登録番号（インボイス）
  staffList: string[]; // 担当者の候補（フルネーム）
  suppliers: string[]; // 仕入先の候補
  discountRate: number; // 割引率の初期値（20 ＝ 定価の2割引き）
  markupRate: number; // 定価がない商品の上乗せ（25 ＝ 仕切×125%。販売受注簿の利益率と同じ）
  limit: number; // 1年間（4月〜翌年3月）の限度額（100,000円）
  minProfitRate: number; // これより低い利益率は知らせる（20%。販売受注簿の最低利益率と同じ）
  validity: string; // 見積書の「見積有効期限」
  payment: string; // 見積書の「お支払条件」
  delivery: string; // 見積書の「納期」
  remarks: string; // 見積書の備考（はじめの文）
  rev: number; // 設定の版（古い版で保存した設定を読み込むときの直し方に使う）
};

export type AppData = {
  products: Product[];
  sales: Sale[];
  settings: Settings;
};

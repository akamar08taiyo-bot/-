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
  price: number; // 仕切り（笹岡工務店の単価・1箇所あたり）。仕切り計算表・請求書に使う
  estPrice: number | null; // 見積の単価（1箇所あたり。こちらで決める）。null なら 仕切り×見積の施工費の率（1.5）
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
  estPrice: number | null; // 部材：見積の単価を手で入れたとき（null なら 定価×掛率）。手間：見積の単価（取付手間のマスタから。null なら 仕切り×率）
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
  kind: number; // 改修の種類（1 手すりの取り付け・2 段差の解消・3 床材の変更・4 扉の取替・5 便器の取替・6 付帯工事）
  photo: number; // 写真番号（0 なら箇所の順番）
  // ---- 申請書だけに使う
  shinseiText?: string; // 申請書の改修の内容の「そのほか」（寸法のうしろに足す文）
  shinseiLine?: string; // 前の版で申請書の改修の内容を手で直した文。いまは使わない（ユーザーの指示「申請書に書く内容という部分はなくす」2026-10-26 で欄を外した。残っていても消さない）
  dims?: PlaceDims; // 申請書の改修の内容の寸法（mm）：手すりは長さ・高さ、段差の解消は幅・奥行・高さ
  photos?: PlacePhotos; // 写真貼付用紙の写真（この箇所の写真番号の用紙に貼る）
  photoDates?: PlacePhotos; // 写真の撮影日（'YYYY-MM-DD'。改修前・改修後。苅田町の写真の用紙の「撮影日」に書く）
  photoEdits?: PlacePhotoEdits; // 写真の向き・大きさ（なければ そのまま・枠いっぱい。photoEdit.ts）
  photoNote?: string; // 写真貼付用紙の改修前の写真の横（上）に書く内容の追加（手で打つ。1行ずつ。「ベースプレート　L=800mm」）。自動の文（改修の種類・寸法）の下に書く
  photoMarks?: PlacePhotoMarks; // 写真への書き込み（直線・矢印・四角形・楕円・テキストボックス。photoMarks.ts）。写真と一緒に動き、写真を差し替えると消える
};

/** 改修の内容の寸法（mm。打ったまま）：l 長さ（手すり。空なら見積書の使う長さ）・h 高さ・w 幅・d 奥行 */
export type PlaceDims = {l?: string; h?: string; w?: string; d?: string};

/** 箇所の写真：改修前・改修後（写真の中身は端末の IndexedDB に別に持つ。ここは番号＝`photos.ts` の id） */
export type PlacePhotos = {before?: string; after?: string}; // 改修前・改修後（写真の番号か、撮影日）

/**
 * 写真の向き・大きさ・位置（写真貼付用紙の枠の中で）：rot＝右回りの角度（度）、scale＝枠いっぱい（1）に対する大きさ（0.2〜1）、
 * x・y＝位置（ユーザーの指示「写真の位置の調整をおこなえるようにする」2026-10-22）。写真の所の空き（縮めた・縦横の比で余った所）の中で、
 * −1＝左（上）の端・0＝まん中・1＝右（下）の端。空きのない向きには動かない（写真は枠の中だけ）。まん中なら持たない
 */
export type PhotoEdit = {rot: number; scale: number; x?: number; y?: number};
export type PlacePhotoEdits = {before?: PhotoEdit; after?: PhotoEdit};

/** 線の種類（Excel の「図形の枠線 → 実線／点線」と同じ。値は Excel の prstDash） */
export type PhotoMarkDash = 'solid' | 'sysDot' | 'sysDash' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot';

/**
 * 写真への書き込み1つ（ユーザーの指示「申請書の写真に書き込んで、手すりの位置や踏み台の位置など…徹底的にExcelに似せて」2026-10-27）。
 * 位置は写真の見えている四角（向き・大きさを直したあと）の中の割合（0〜1）：直線は始点 x1・y1 と終点 x2・y2、四角形・楕円・テキストボックスは回す前の四角の左上と右下。
 * rot＝右回りの角度（度。四角形・楕円・テキストボックス）。色は 'RRGGBB'（空＝なし）、線の太さ・文字の大きさは紙の上の pt（Excel と同じ）
 */
export type PhotoMark = {
  id: string;
  // pen＝手書きの線（pts の点をつなぐ）、board＝補強板（四角と、pts の斜めの線。2026-10-29 の指示「ベースプレート、木の補強板…四角の斜め」）
  kind: 'line' | 'rect' | 'ellipse' | 'text' | 'pen' | 'board';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  rot?: number;
  line: string; // 枠線（直線）の色。空なら枠線なし
  width: number; // 線の太さ（pt）
  dash: PhotoMarkDash;
  start?: boolean; // 始点に矢印（直線）
  end?: boolean; // 終点に矢印（直線）
  fill: string; // 塗りつぶしの色。空なら塗りつぶしなし
  text?: string; // 図形の中の文字（改行で段落）
  size: number; // 文字の大きさ（pt）
  color: string; // 文字の色
  bold?: boolean;
  font?: string; // 文字のフォント（MARK_FONTS の名前。ないときは前の版の書き込み＝游ゴシックに近いフォント）
  pts?: [number, number][]; // 手書きの線・補強板の斜めの線の点（回す前の四角の中の割合 0〜1）
};
export type PlacePhotoMarks = {before?: PhotoMark[]; after?: PhotoMark[]};

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
  photos: number[]; // どこで使うか：見積書の写真番号（小さい順）。発注書で足した行は空
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
};

/** 1件（○○様邸） */
export type Job = {
  id: string;
  month: string; // 請求する月 'YYYY-MM'
  customer: string; // お客様名（「様邸」は suffix で付ける）
  suffix: NameSuffix;
  staff: string; // 担当（設定の「担当者の候補」から選ぶ。空でもよい）
  date: string; // 施工日 'YYYY-MM-DD'（空でもよい。仕切り計算表・請求書に出す）
  estDate?: string; // 見積もり作成日 'YYYY-MM-DD'（見積書の右上・一覧・Excel）。空なら作った日（estimateDateOf）
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
  shinsei?: ShinseiInfo; // 申請書だけに書く項目（申請書の画面で入れる）
  riyu?: RiyuInfo; // 住宅改修が必要な理由書だけに書く項目（理由書の画面で入れる。riyu.ts）
  // ゴミ箱に移した時刻（ミリ秒）。あればゴミ箱のタブだけに出し、ほかの画面（一覧・請求書・発注書・探す・件数）には出さない（trash.ts）。
  // 元に戻すと持たない。複製には引き継がない
  trashedAt?: number;
  // 申請書の平面図の図（ドロップ・貼り付けした平面図の画像）。写真と同じく、この端末の IndexedDB（photos.ts）の番号だけを持つ。複製では引き継がない
  planPhoto?: string;
  // 平面図の図への書き込み（①②の番号・線など。写真への書き込みと同じ形で、位置は図の見えている四角の中の割合。ユーザーの指示「平面図に①②・線などを書き込める」2026-10-29）。
  // 図を差し替える・消すと消える。複製では引き継がない
  planMarks?: PhotoMark[];
  // 売上見込みの月 'YYYY-MM'（「📈 売上見込みを確認する」で次月に回したとき。なければ請求する月 month。salesPlan.ts）
  salesMonth?: string;
  // 売上伝票発行依頼書（「🧾 売上伝票依頼書」の窓。uriage.ts）で選んだ顧客区分・請求区分。次に出すときに選び直さなくてよいように覚える。複製では引き継がない
  uriage?: {customer?: 'new' | 'existing'; billing?: 'receipt' | 'reimbursement'};
  // 見積書の明細の下に介護保険の内訳（介護保険の対象・利用者負担＝赤字・保険者負担）を書くか（「自己負担額を表示」。careLines.ts）。
  // 空なら書く・false なら書かない（特定福祉用具の販売見積書と同じ。ユーザーの指示「工事見積書にも販売見積書と同様に記載する」2026-10-28）。複製では引き継ぐ
  showSelfPay?: boolean;
  // 取り込んだ申請書・見積書・理由書の Excel（見積書の一覧の「📥 取り込む」。importDocs.ts）。同じファイルを2回取り込まないための目印と、読んだ金額。複製では引き継がない
  imported?: ImportedDoc[];
  // 取り込んだ特定福祉用具の申請書の福祉用具（key は申請書のファイルの目印。特定福祉用具は、同じ key の福祉用具を2回入れない）。複製では引き継がない
  tokuteiImport?: {items: TokuteiImportItem[]; key: string};
  createdAt: number;
  updatedAt: number;
};

/**
 * 取り込んだ書類1つ。hash＝ファイルの中身の目印（同じファイルは2回取り込まない）。
 * 見積書：total・tax＝見積書の合計（税込）と消費税。rows＝明細を様邸の行にしたか（したなら売上は行から計算し、total は使わない）。
 * 申請書の改修費用は申請書の項目（shinsei.cost）に入れる。理由書は金額なし
 */
export type ImportedDoc = {kind: 'shinsei' | 'estimate' | 'riyu' | 'tokutei'; file: string; hash: string; total: number | null; tax: number | null; rows: boolean; at: number};
/**
 * 取り込んだ特定福祉用具の申請書の福祉用具（2026-10-29。importDocs.ts の readTokutei）。🛁 特定福祉用具申請書のタブを開いたとき、
 * 特定福祉用具の案件に福祉用具がまだなければ入れてもらう（tokuteiLink.ts）。amount は申請書の金額（taxIn＝消費税込み。北九州市の概要書は税抜）
 */
export type TokuteiImportItem = {category: string; name: string; code: string; maker: string; amount: number; taxIn: boolean};

/** 申請書で丸で囲む項目（申請書を作るときに選ぶ。空なら丸をつけない）。どの保険者の申請書にどの項目があるかは shinsei.ts の SHINSEI */
export type ShinseiMarks = {
  gender: '' | '男' | '女'; // 性別
  era: '' | '明治' | '大正' | '昭和'; // 生年月日の元号（苅田町・行橋市）
  care: '' | '要支援1' | '要支援2' | '要介護1' | '要介護2' | '要介護3' | '要介護4' | '要介護5'; // 要介護状態区分（苅田町・行橋市）
  renovated: '' | '有' | '無'; // 現在までの改修状況（みやこ町・広域連合）
};

/**
 * 申請書だけに書く項目（申請書の画面で、申請書の順番に入れる）。丸で囲む項目（ShinseiMarks）も入る。
 * 被保険者氏名・住所・被保険者番号・改修の箇所は、見積書と同じ欄（Job の customer・address・insuredNo・places）
 */
export type ShinseiInfo = ShinseiMarks & {
  kana: string; // フリガナ
  birthY: string; // 生年月日（元号の年。元号は era）
  birthM: string;
  birthD: string;
  zip: string; // 郵便番号
  phone: string; // 電話番号
  owner: string; // 住宅の所有者
  relation: string; // 住宅の所有者と本人との関係
  reasonOffice: string; // 住宅改修が必要な理由書の作成者：事業所名（みやこ町・広域連合）
  reasonName: string; // 理由書の作成者：氏名
  start: string; // 着工予定日（みやこ町・広域連合は支給申請書の着工日） 'YYYY-MM-DD'
  end: string; // 完了予定日（みやこ町・広域連合は支給申請書の完成日）
  cost: number | null; // 改修費用を手で入れたとき（null なら見積書の介護保険対象分の合計）
  // 介護保険証から（2026-10-22。理由書・特定福祉用具にも転記する）
  careFrom: string; // 認定の有効期間のはじめ 'YYYY-MM-DD'
  careTo: string; // 認定の有効期間のおわり
  insurerNo: string; // 保険者番号（6けた）
  burden: '' | '1' | '2' | '3'; // 利用者負担の割合（介護保険負担割合証。特定福祉用具に渡す）
  welfare?: boolean; // 生活保護（負担割合の横の「生活保護」のチェック。特定福祉用具に渡す。生活保護でなければ持たない）
};

/** 理由書の「活動」（P2 の4つの段）。① 改善をしようとしている生活動作・② 困難な状況・③ 改修目的と改修の方針 */
export type RiyuAct = {
  items: number[]; // ① の□を■にする項目（RIYU_ACTS の items の番号）
  itemOther: string; // ① のその他（自宅内の移動は ① の全部。先頭の□は items の 0）
  trouble: string; // ② 具体的な困難な状況
  purposes: number[]; // ③ 改修目的・期待効果（RIYU_PURPOSES の番号）
  purposeOther: string; // ③ のその他
  policy: string; // ③ 改修の方針
};
export type RiyuActKey = 'toilet' | 'bath' | 'out' | 'home';

/**
 * 住宅改修が必要な理由書だけの項目（介護支援専門員などが書く国の様式。2026-10-22）。
 * 被保険者番号・氏名・生年月日・性別・要介護・住所・作成者の事業所と氏名は申請書と同じ欄（Job・ShinseiInfo）を使う
 */
export type RiyuInfo = {
  checkDate: string; // 現地確認日 'YYYY-MM-DD'
  madeDate: string; // 作成日
  qualification: string; // 作成者の資格（介護支援専門員でないとき）
  tel: string; // 作成者の連絡先
  housing: '' | '持ち家' | '借家' | '借間' | 'その他'; // 住宅状況
  housingOther: string;
  body: string; // 利用者の身体状況
  care: string; // 介護状況
  wish: string; // 住宅改修により、利用者等は日常生活をどう変えたいか
  equipment: Record<string, {before?: boolean; after?: boolean}>; // 福祉用具の利用状況と住宅改修後の想定（RIYU_EQUIPMENT の名前 → 改修前・改修後）
  equipmentOther: {name: string; before: boolean; after: boolean}[]; // その他（3行）
  acts: Record<RiyuActKey, RiyuAct>;
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
export type Insurer = 'kanda' | 'yukuhashi' | 'miyako' | 'kouiki' | 'fukuoka' | 'kitakyushu';

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
  estimateLaborRate: number; // 見積の単価を入れていない取付手間の、見積の単価＝仕切り（笹岡工務店）×この率（1.5）
  estimateOverheadRate: number; // 見積書の諸経費＝小計×この率（0.1）
  estimateHourRate: number; // 広域連合用の書式で、施工費を「時間×1時間の単価」で書くときの単価（2,500円）。0 なら「1式」
  estimateForm: EstimateForm; // 住所から市町村が分からないときの見積書の書式
  kitExample: boolean; // 部材＋施工費（常用）の例をもう入れたか（消したら入れ直さない）
  laborEst: boolean; // 前に作った見積書の取付手間の行に、見積の単価（取付手間のマスタ）を入れたか
  laborRev: number; // 取付手間の見積の単価を直した版（defaults.ts の LABOR_REV より古ければ、空のままの見積の単価を直す）
  tesuri: boolean; // 前に保存した部材リスト・施工費・常用のセット・見積書の行の名前の「手摺」を「手すり」にしたか（一度だけ。ユーザーの指示）
  // 売上見込みで次月に回した特定福祉用具の案件（案件の id → 'YYYY-MM'）。特定福祉用具のデータは書きかえず、ここに持つ（salesPlan.ts）
  tokuteiSalesMonths: Record<string, string>;
  rev: number; // 設定の版（古い版で保存した設定を読み込むときの直し方に使う）
};

export type AppData = {
  materials: Material[];
  labor: LaborItem[];
  jobs: Job[];
  kits: Kit[];
  settings: Settings;
};

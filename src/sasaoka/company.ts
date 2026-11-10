// 会社ごとの値（太陽シルバーサービス株式会社）：取付手間の単価・担当者・営業所・会社名・登録番号・役所の原本に書いてある営業所の字。
// 今までのアプリはこのファイルをそのまま使う。イヤーズ（株）デモアプリのビルド（vite.years.config.ts）は demo/company.ts に置きかえる
// （ユーザーの指示「申請書、見積もりツールを（株）イヤーズ専用で…今までのアプリは絶対に残しておく」2026-11-10。社内の値をデモのファイルに入れない）
import type {LaborItem} from './types.ts';

/** 会社名（設定の初めの値・見取図の下の段） */
export const COMPANY_NAME = '太陽シルバーサービス株式会社';
/** 見積・提案書作成アプリの御見積書と同じ登録番号 */
/** ポータルの営業所が分からないときの初めの営業所 */
export const DEFAULT_OFFICE = '行橋営業所';
export const REG_NO = 'T1290001044462';

/**
 * 取付手間の単価（「笹岡手間」の表より。1箇所あたり）。
 * 「〃」の行は上の行の項目名を補っている（〃 タイル → 踏台 タイル、〃 部品代 → ウォシュレット 部品代）。
 */
// 取付手間の単価表（笹岡工務店）。price＝仕切り、estPrice＝見積の単価（ユーザーにいただいた表。表になかった踏台 木 は「踏み台は取り付け1箇所2000円で計算」の指示）
export const DEFAULT_LABOR: LaborItem[] = [
  {id: 'l01', name: '木', price: 1000, estPrice: 1500, note: ''},
  {id: 'l02', name: 'タイル', price: 1500, estPrice: 2000, note: ''},
  {id: 'l03', name: 'エルボ・チーズ（屋内）', price: 1000, estPrice: 1500, note: ''},
  {id: 'l04', name: '補強板 2m以下', price: 1500, estPrice: 2500, note: ''},
  {id: 'l05', name: '補強板 2m～3m', price: 3000, estPrice: 4000, note: '元の表：2m～3m'},
  {id: 'l06', name: '補強板 3m以上', price: 4000, estPrice: 5000, note: '元の表：3m以上'},
  {id: 'l07', name: '踏台 木', price: 1500, estPrice: 2000, note: ''},
  {id: 'l08', name: '踏台 タイル', price: 2500, estPrice: 4000, note: '元の表：〃 タイル'},
  {id: 'l09', name: 'コア抜き', price: 5000, estPrice: 6000, note: ''},
  {id: 'l10', name: '基礎工事', price: 6000, estPrice: 9000, note: ''},
  {id: 'l11', name: 'スタンド', price: 3000, estPrice: 4000, note: ''},
  {id: 'l12', name: 'ヤザキステップ台', price: 3000, estPrice: 4000, note: ''},
  {id: 'l13', name: 'レバーハンドル', price: 1500, estPrice: 2500, note: ''},
  {id: 'l14', name: '敷居撤去', price: 12000, estPrice: 15000, note: ''},
  {id: 'l15', name: 'ウォシュレット', price: 8000, estPrice: 10000, note: ''},
  {id: 'l16', name: 'ウォシュレット 部品代', price: 2000, estPrice: 3000, note: '元の表：〃 部品代'},
  {id: 'l17', name: '安寿框手すり', price: 2000, estPrice: 3000, note: ''}, // 元の表：安寿框手摺（「手摺ではなく、手すり」）
];

/**
 * 様邸ごとの担当者の候補（最初の内容。送付状作成アプリと同じ行橋営業所の担当者）。設定で書き換えられる。
 * 見積書にはフルネームで出す（請求書・一覧は名字だけ）
 */
export const DEFAULT_STAFF = ['久保 匠史', '土居 翔太', '宮村 茉莉花', '信田 裕太', '藤田 知美'];

/** 名字だけで保存してある担当者の候補をフルネームにする（設定の版4） */
export const STAFF_FULL_NAMES = new Map([
  ['久保', '久保 匠史'],
  ['土居', '土居 翔太'],
  ['宮村', '宮村 茉莉花'],
  ['信田', '信田 裕太'],
  ['藤田', '藤田 知美'],
]);

// jigyoshoNo：介護保険の事業所番号（10けた。チラシ作成（レンタル）taiyo-chirashi の営業所の一覧 OFFICES の j と同じ）。
// 申請書の事業所番号のマス（広域連合の承認申請書・支給申請書、行橋市の受領委任払の申請書）に、申請書の営業所の番号を書く
// （ユーザーの指示「田川営業所の事業所番号に変えてください」2026-11-05。前は原本の行橋営業所の番号のままだった）
// juryoNo：広域連合の住宅改修の受領委任契約番号（承認申請書・支給申請書のマス）。分かっている営業所だけ（行橋営業所は原本の番号）。
// 分からない営業所は空のマス（ユーザーの答え「今はわからないので空白にしてください」2026-11-05＝田川営業所。原本の行橋営業所の番号を書かない）
export type Office = {name: string; postal: string; address: string; tel: string; fax: string; manager: string; jigyoshoNo: string; juryoNo?: string};

/** 営業所の一覧（見積・提案書作成アプリ taiyo-mitsumori と同じ内容。manager は所長名。事業所番号はチラシ作成（レンタル）の一覧から） */
export const OFFICES: Office[] = [
  {name: '小倉営業所', postal: '802-0011', address: '福岡県北九州市小倉北区重住3丁目11-21', tel: '093-952-1616', fax: '093-952-1627', manager: '森口 賢一', jigyoshoNo: '4070403227'},
  {name: '小倉南営業所', postal: '800-0226', address: '福岡県北九州市小倉南区田原新町1-3-34', tel: '093-474-5670', fax: '093-474-5671', manager: '串山 清彦', jigyoshoNo: '4070503471'},
  {name: '八幡西営業所', postal: '807-0815', address: '福岡県北九州市八幡西区本城東2-4-8', tel: '093-603-3512', fax: '093-601-3593', manager: '福本 浩史', jigyoshoNo: '4070704269'},
  {name: '八幡東営業所', postal: '805-0033', address: '福岡県北九州市八幡東区山路松尾町14-6', tel: '093-654-8515', fax: '093-654-8516', manager: '兼重 陽介', jigyoshoNo: '4070601184'},
  {name: '行橋営業所', postal: '824-0043', address: '福岡県行橋市大字流末1327番地', tel: '0930-26-9640', fax: '0930-26-9641', manager: '久保 匠史', jigyoshoNo: '4072601802', juryoNo: '2012'},
  {name: '田川営業所', postal: '826-0042', address: '福岡県田川市大字川宮1200番地', tel: '0947-44-1895', fax: '0947-44-2372', manager: '早崎 勝', jigyoshoNo: '4071901971'},
  {name: '飯塚営業所', postal: '820-0081', address: '福岡県飯塚市枝国510番地7', tel: '0948-52-6360', fax: '0948-52-6362', manager: '佐藤 正仁', jigyoshoNo: '4071804183'},
  {name: '福岡南営業所', postal: '816-0912', address: '福岡県大野城市御笠川2-10-15', tel: '092-504-9810', fax: '092-504-9811', manager: '神谷 大輔', jigyoshoNo: '4073200620'},
  {name: '福岡西営業所', postal: '814-0032', address: '福岡県福岡市早良区小田部4-11-31', tel: '092-833-0131', fax: '092-833-0132', manager: '佐藤 正利', jigyoshoNo: '4073500615'},
  {name: '福岡東営業所', postal: '812-0064', address: '福岡県福岡市東区松田3丁目25-2', tel: '092-627-1150', fax: '092-627-1151', manager: '岡本 将臣', jigyoshoNo: '4070803954'},
  {name: '久留米営業所', postal: '838-0141', address: '福岡県小郡市小郡97-19', tel: '0942-72-8822', fax: '0942-72-8833', manager: '牟田 知広', jigyoshoNo: '4076700279'},
  {name: '大牟田営業所', postal: '837-0924', address: '福岡県大牟田市歴木446-1', tel: '0944-59-1488', fax: '0944-59-1481', manager: '橋本 浩志', jigyoshoNo: '4071502449'},
  {name: '佐賀営業所', postal: '849-0937', address: '佐賀県佐賀市鍋島5丁目4-15', tel: '0952-34-1224', fax: '0952-34-1225', manager: '江原 諒', jigyoshoNo: '4170103396'},
  {name: '長崎営業所', postal: '851-0122', address: '長崎県長崎市界2丁目2-4', tel: '095-834-0535', fax: '095-834-0536', manager: '吉本 幸治', jigyoshoNo: '4270111638'},
  {name: '大村営業所', postal: '856-0844', address: '長崎県大村市溝陸町643-1', tel: '0957-49-6222', fax: '0957-49-6333', manager: '山口 隆史', jigyoshoNo: '4270501200'},
  {name: '壱岐営業所', postal: '811-5117', address: '長崎県壱岐市郷ノ浦町中触1078', tel: '0920-47-9005', fax: '0920-47-9006', manager: '長岡 計治', jigyoshoNo: '4272100324'},
  {name: '熊本営業所', postal: '862-0945', address: '熊本県熊本市東区画図町大字下無田1432-22', tel: '096-377-7630', fax: '096-377-7631', manager: '城戸 健', jigyoshoNo: '4370106207'},
  {name: '熊本北営業所', postal: '861-5517', address: '熊本県熊本市北区鶴羽田1-10-7', tel: '096-341-5765', fax: '096-341-5766', manager: '高木 伸基', jigyoshoNo: '4370107056'},
  {name: '大分営業所', postal: '870-0953', address: '大分県大分市下郡東1-4-35', tel: '097-504-8001', fax: '097-504-8002', manager: '山下 厚', jigyoshoNo: '4470105265'},
];

/** 役所の原本（苅田町・行橋市・みやこ町）にそのまま書いてある行橋営業所の字（申請書の営業所の字に書きかえる。shinsei.ts の officeCells） */
export const ORIGINAL_OFFICE_TEXTS: {name: string; address: string; tel: string; manager: string} = {name: '行橋営業所', address: '行橋市大字流末1327番地', tel: '0930-26-9640', manager: '久保　匠史'};

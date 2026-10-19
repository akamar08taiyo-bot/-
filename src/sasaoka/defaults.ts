import type {LaborItem, Settings} from './types.ts';

/**
 * 取付手間の単価（「笹岡手間」の表より。1箇所あたり）。
 * 「〃」の行は上の行の項目名を補っている（〃 タイル → 踏台 タイル、〃 部品代 → ウォシュレット 部品代）。
 */
export const DEFAULT_LABOR: LaborItem[] = [
  {id: 'l01', name: '木', price: 1000, note: ''},
  {id: 'l02', name: 'タイル', price: 1500, note: ''},
  {id: 'l03', name: 'エルボ・チーズ（屋内）', price: 1000, note: ''},
  {id: 'l04', name: '補強板 2m以下', price: 1500, note: ''},
  {id: 'l05', name: '補強板 2m～3m', price: 3000, note: '元の表：2m～3m'},
  {id: 'l06', name: '補強板 3m以上', price: 4000, note: '元の表：3m以上'},
  {id: 'l07', name: '踏台 木', price: 1500, note: ''},
  {id: 'l08', name: '踏台 タイル', price: 2500, note: '元の表：〃 タイル'},
  {id: 'l09', name: 'コア抜き', price: 5000, note: ''},
  {id: 'l10', name: '基礎工事', price: 6000, note: ''},
  {id: 'l11', name: 'スタンド', price: 3000, note: ''},
  {id: 'l12', name: 'ヤザキステップ台', price: 3000, note: ''},
  {id: 'l13', name: 'レバーハンドル', price: 1500, note: ''},
  {id: 'l14', name: '敷居撤去', price: 12000, note: ''},
  {id: 'l15', name: 'ウォシュレット', price: 8000, note: ''},
  {id: 'l16', name: 'ウォシュレット 部品代', price: 2000, note: '元の表：〃 部品代'},
  {id: 'l17', name: '安寿框手摺', price: 2000, note: ''},
];

export const DEFAULT_PLACES = [
  '玄関',
  '上がり框',
  '廊下',
  '階段',
  'トイレ',
  '浴室',
  '脱衣所',
  '洗面所',
  '居室',
  '寝室',
  '台所',
  '勝手口',
  '屋外・アプローチ',
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

export type Office = {name: string; postal: string; address: string; tel: string; fax: string; manager: string};

/** 営業所の一覧（見積・提案書作成アプリ taiyo-mitsumori と同じ内容。manager は所長名） */
export const OFFICES: Office[] = [
  {name: '小倉営業所', postal: '802-0011', address: '福岡県北九州市小倉北区重住3丁目11-21', tel: '093-952-1616', fax: '093-952-1627', manager: '森口 賢一'},
  {name: '小倉南営業所', postal: '800-0226', address: '福岡県北九州市小倉南区田原新町1-3-34', tel: '093-474-5670', fax: '093-474-5671', manager: '串山 清彦'},
  {name: '八幡西営業所', postal: '807-0815', address: '福岡県北九州市八幡西区本城東2-4-8', tel: '093-603-3512', fax: '093-601-3593', manager: '福本 浩史'},
  {name: '八幡東営業所', postal: '805-0033', address: '福岡県北九州市八幡東区山路松尾町14-6', tel: '093-654-8515', fax: '093-654-8516', manager: '兼重 陽介'},
  {name: '行橋営業所', postal: '824-0043', address: '福岡県行橋市大字流末1327番地', tel: '0930-26-9640', fax: '0930-26-9641', manager: '久保 匠史'},
  {name: '田川営業所', postal: '826-0042', address: '福岡県田川市大字川宮1200番地', tel: '0947-44-1895', fax: '0947-44-2372', manager: '早崎 勝'},
  {name: '飯塚営業所', postal: '820-0081', address: '福岡県飯塚市枝国510番地7', tel: '0948-52-6360', fax: '0948-52-6362', manager: '佐藤 正仁'},
  {name: '福岡南営業所', postal: '816-0912', address: '福岡県大野城市御笠川2-10-15', tel: '092-504-9810', fax: '092-504-9811', manager: '神谷 大輔'},
  {name: '福岡西営業所', postal: '814-0032', address: '福岡県福岡市早良区小田部4-11-31', tel: '092-833-0131', fax: '092-833-0132', manager: '佐藤 正利'},
  {name: '福岡東営業所', postal: '812-0064', address: '福岡県福岡市東区松田3丁目25-2', tel: '092-627-1150', fax: '092-627-1151', manager: '岡本 将臣'},
  {name: '久留米営業所', postal: '838-0141', address: '福岡県小郡市小郡97-19', tel: '0942-72-8822', fax: '0942-72-8833', manager: '牟田 知広'},
  {name: '大牟田営業所', postal: '837-0924', address: '福岡県大牟田市歴木446-1', tel: '0944-59-1488', fax: '0944-59-1481', manager: '橋本 浩志'},
  {name: '佐賀営業所', postal: '849-0937', address: '佐賀県佐賀市鍋島5丁目4-15', tel: '0952-34-1224', fax: '0952-34-1225', manager: '江原 諒'},
  {name: '長崎営業所', postal: '851-0122', address: '長崎県長崎市界2丁目2-4', tel: '095-834-0535', fax: '095-834-0536', manager: '吉本 幸治'},
  {name: '大村営業所', postal: '856-0844', address: '長崎県大村市溝陸町643-1', tel: '0957-49-6222', fax: '0957-49-6333', manager: '山口 隆史'},
  {name: '壱岐営業所', postal: '811-5117', address: '長崎県壱岐市郷ノ浦町中触1078', tel: '0920-47-9005', fax: '0920-47-9006', manager: '長岡 計治'},
  {name: '熊本営業所', postal: '862-0945', address: '熊本県熊本市東区画図町大字下無田1432-22', tel: '096-377-7630', fax: '096-377-7631', manager: '城戸 健'},
  {name: '熊本北営業所', postal: '861-5517', address: '熊本県熊本市北区鶴羽田1-10-7', tel: '096-341-5765', fax: '096-341-5766', manager: '高木 伸基'},
  {name: '大分営業所', postal: '870-0953', address: '大分県大分市下郡東1-4-35', tel: '097-504-8001', fax: '097-504-8002', manager: '山下 厚'},
];

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
 */
export const SETTINGS_REV = 4;

export function defaultSettings(): Settings {
  const base: Settings = {
    clientName: '笹岡工務店',
    company: '太陽シルバーサービス株式会社',
    officeName: '',
    manager: '',
    postal: '',
    address: '',
    tel: '',
    fax: '',
    person: '',
    // 見積・提案書作成アプリの御見積書と同じ登録番号
    regNo: 'T1290001044462',
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
    estimateOverheadRate: 0.1,
    estimateHourRate: 2500,
    estimateForm: 'yukuhashi',
    rev: SETTINGS_REV,
  };
  return settingsForOffice(base, portalOffice() || '行橋営業所');
}

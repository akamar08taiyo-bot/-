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

export type Office = {name: string; postal: string; address: string; tel: string; fax: string};

/** 営業所の一覧（見積・提案書作成アプリ taiyo-mitsumori と同じ内容） */
export const OFFICES: Office[] = [
  {name: '小倉営業所', postal: '802-0011', address: '福岡県北九州市小倉北区重住3丁目11-21', tel: '093-952-1616', fax: '093-952-1627'},
  {name: '小倉南営業所', postal: '800-0226', address: '福岡県北九州市小倉南区田原新町1-3-34', tel: '093-474-5670', fax: '093-474-5671'},
  {name: '八幡西営業所', postal: '807-0815', address: '福岡県北九州市八幡西区本城東2-4-8', tel: '093-603-3512', fax: '093-601-3593'},
  {name: '八幡東営業所', postal: '805-0033', address: '福岡県北九州市八幡東区山路松尾町14-6', tel: '093-654-8515', fax: '093-654-8516'},
  {name: '行橋営業所', postal: '824-0043', address: '福岡県行橋市大字流末1327番地', tel: '0930-26-9640', fax: '0930-26-9641'},
  {name: '田川営業所', postal: '826-0042', address: '福岡県田川市大字川宮1200番地', tel: '0947-44-1895', fax: '0947-44-2372'},
  {name: '飯塚営業所', postal: '820-0081', address: '福岡県飯塚市枝国510番地7', tel: '0948-52-6360', fax: '0948-52-6362'},
  {name: '福岡南営業所', postal: '816-0912', address: '福岡県大野城市御笠川2-10-15', tel: '092-504-9810', fax: '092-504-9811'},
  {name: '福岡西営業所', postal: '814-0032', address: '福岡県福岡市早良区小田部4-11-31', tel: '092-833-0131', fax: '092-833-0132'},
  {name: '福岡東営業所', postal: '812-0064', address: '福岡県福岡市東区松田3丁目25-2', tel: '092-627-1150', fax: '092-627-1151'},
  {name: '久留米営業所', postal: '838-0141', address: '福岡県小郡市小郡97-19', tel: '0942-72-8822', fax: '0942-72-8833'},
  {name: '大牟田営業所', postal: '837-0924', address: '福岡県大牟田市歴木446-1', tel: '0944-59-1488', fax: '0944-59-1481'},
  {name: '佐賀営業所', postal: '849-0937', address: '佐賀県佐賀市鍋島5丁目4-15', tel: '0952-34-1224', fax: '0952-34-1225'},
  {name: '長崎営業所', postal: '851-0122', address: '長崎県長崎市界2丁目2-4', tel: '095-834-0535', fax: '095-834-0536'},
  {name: '大村営業所', postal: '856-0844', address: '長崎県大村市溝陸町643-1', tel: '0957-49-6222', fax: '0957-49-6333'},
  {name: '壱岐営業所', postal: '811-5117', address: '長崎県壱岐市郷ノ浦町中触1078', tel: '0920-47-9005', fax: '0920-47-9006'},
  {name: '熊本営業所', postal: '862-0945', address: '熊本県熊本市東区画図町大字下無田1432-22', tel: '096-377-7630', fax: '096-377-7631'},
  {name: '熊本北営業所', postal: '861-5517', address: '熊本県熊本市北区鶴羽田1-10-7', tel: '096-341-5765', fax: '096-341-5766'},
  {name: '大分営業所', postal: '870-0953', address: '大分県大分市下郡東1-4-35', tel: '097-504-8001', fax: '097-504-8002'},
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
  return {...base, officeName: o.name, postal: o.postal, address: o.address, tel: o.tel, fax: o.fax};
}

export function defaultSettings(): Settings {
  const base: Settings = {
    clientName: '笹岡工務店',
    company: '太陽シルバーサービス株式会社',
    officeName: '',
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
    invoiceTaxMode: 'perJob',
    placePresets: DEFAULT_PLACES,
  };
  return settingsForOffice(base, portalOffice() || '行橋営業所');
}

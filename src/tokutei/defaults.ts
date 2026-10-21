// 初期値：営業所・担当者・保険者・設定。住宅改修 見積書アプリ（src/sasaoka/defaults.ts）・販売受注簿作成ツールと同じ値にそろえる

import type {Office, Settings} from './types.ts';

/** 営業所（見積書の発行元）。住宅改修 見積書アプリの一覧と同じ */
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

/** 行橋営業所の担当者（住宅改修 見積書アプリと同じフルネーム） */
export const DEFAULT_STAFF = ['久保 匠史', '土居 翔太', '宮村 茉莉花', '信田 裕太', '藤田 知美'];

/** 仕入先（販売受注簿作成ツールの発注先の候補と同じ） */
export const DEFAULT_SUPPLIERS = ['ケアマックス', 'ウェルファン'];

/**
 * 保険者（申請書を出す先）。申請書の様式・端数の決まりは保険者ごとに違う。
 * perItem：個別切り上げ（品目ごとに利用者負担を切り上げる）を最初からオンにするか。
 * 売上伝票発行依頼書の「個別切り上げ」の名前が miyako なので、みやこ町の決まりと考えている（要確認）
 */
export const INSURERS: {key: string; label: string; note?: string; perItem?: boolean}[] = [
  {key: 'yukuhashi', label: '行橋市'},
  {key: 'kanda', label: '苅田町'},
  {key: 'miyako', label: 'みやこ町', perItem: true},
  {key: 'kouiki', label: '福岡県介護保険広域連合', note: '築上町・豊前市・上毛町・吉富町'},
  {key: 'other', label: 'そのほか'},
];

export function insurerLabel(key: string, name = ''): string {
  if (key === 'other') return name.trim();
  return INSURERS.find((i) => i.key === key)?.label ?? '';
}

export const CARE_LEVELS = ['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'];

/** 設定の版。古い版で保存した設定を読み込むときに直す（storage.ts の cleanSettings） */
export const SETTINGS_REV = 1;

export function defaultSettings(): Settings {
  const base: Settings = {
    company: '太陽シルバーサービス株式会社',
    officeName: '',
    postal: '',
    address: '',
    tel: '',
    fax: '',
    manager: '',
    // 販売受注簿作成ツール・住宅改修 見積書アプリと同じ登録番号
    regNo: 'T1290001044462',
    staffList: DEFAULT_STAFF,
    suppliers: DEFAULT_SUPPLIERS,
    discountRate: 20,
    markupRate: 25,
    limit: 100000,
    minProfitRate: 20,
    // 販売受注簿作成ツールの御見積書と同じ見積有効期限・備考。お支払条件・納期は、申請→承認→納品→集金 の流れに合わせた
    validity: 'お見積日より30日間',
    payment: 'お届けの際に集金',
    delivery: '市町村の承認後にお届け',
    remarks: '本見積書の記載金額（合計）は、消費税込みの金額となっております。',
    rev: SETTINGS_REV,
  };
  return settingsForOffice(base, portalOffice() || '行橋営業所');
}

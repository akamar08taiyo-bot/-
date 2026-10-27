import type {SenderInfo} from './storage';

/** 営業所ごとの差出人の情報（営業所を選ぶと、差出人のこれらの欄がまとめて切り替わる） */
export type OfficeInfo = Pick<SenderInfo, 'department' | 'office' | 'postal' | 'address' | 'tel' | 'fax'>;

/**
 * 営業部・営業所の一覧（並びは画面の選択欄の順）。
 * 行橋営業所以外の住所・TEL・FAX は、厚生労働省「介護サービス情報公表システム」の情報を載せている
 * 介護事業所の紹介サイトから写したもの（2026年10月時点）。営業所の実際の番号と違うときは、ここを直す。
 * 見つからなかった項目は空のままにしてあり、画面の「詳しい設定」で入力できる。
 */
export const OFFICES: OfficeInfo[] = [
  // 北九州営業部
  {department: '北九州営業部', office: '小倉営業所', postal: '802-0011', address: '福岡県北九州市小倉北区重住3丁目11-21', tel: '093-952-1616', fax: '093-952-1627'},
  {department: '北九州営業部', office: '小倉南営業所', postal: '', address: '福岡県北九州市小倉南区田原新町1丁目3-34', tel: '', fax: ''},
  {department: '北九州営業部', office: '八幡東営業所', postal: '', address: '福岡県北九州市八幡東区山路松尾町14-6', tel: '', fax: ''},
  {department: '北九州営業部', office: '八幡西営業所', postal: '807-0815', address: '福岡県北九州市八幡西区本城東2-4-8', tel: '093-603-3512', fax: '093-601-3593'},
  // 東九州営業部
  {department: '東九州営業部', office: '行橋営業所', postal: '824-0043', address: '福岡県行橋市大字流末1327番地', tel: '0930-26-9640', fax: '0930-26-9641'},
  {department: '東九州営業部', office: '田川営業所', postal: '826-0042', address: '福岡県田川市大字川宮1200番地', tel: '0947-44-1895', fax: '0947-44-2372'},
  {department: '東九州営業部', office: '飯塚営業所', postal: '820-0081', address: '福岡県飯塚市枝国510番地7', tel: '0948-52-6360', fax: '0948-52-6362'},
  {department: '東九州営業部', office: '久留米営業所', postal: '838-0141', address: '福岡県小郡市小郡97番地19 オフィスパレア小郡Ⅰ(2号室+3号室)', tel: '0942-72-8822', fax: '0942-72-8833'},
  {department: '東九州営業部', office: '大分営業所', postal: '870-0953', address: '大分県大分市下郡東1-4-35', tel: '097-504-8001', fax: '097-504-8002'},
  // 福岡営業部
  {department: '福岡営業部', office: '福岡東営業所', postal: '812-0064', address: '福岡県福岡市東区松田3丁目25-2', tel: '092-627-1150', fax: '092-627-1151'},
  {department: '福岡営業部', office: '福岡西営業所', postal: '814-0032', address: '福岡県福岡市早良区小田部4丁目11-31', tel: '092-833-0131', fax: '092-833-0132'},
  {department: '福岡営業部', office: '福岡南営業所', postal: '816-0912', address: '福岡県大野城市御笠川2-10-15', tel: '092-504-9810', fax: '092-504-9811'},
  {department: '福岡営業部', office: '壱岐営業所', postal: '811-5117', address: '長崎県壱岐市郷ノ浦町田中触1078', tel: '0920-47-9005', fax: '0920-47-9006'},
  // 西・中九州営業部
  {department: '西・中九州営業部', office: '佐賀営業所', postal: '849-0937', address: '佐賀県佐賀市鍋島5丁目4-15', tel: '0952-34-1224', fax: '0952-34-1225'},
  {department: '西・中九州営業部', office: '熊本営業所', postal: '862-0945', address: '熊本県熊本市東区画図町大字下無田1432-22', tel: '096-377-7630', fax: '096-377-7631'},
  {department: '西・中九州営業部', office: '熊本北営業所', postal: '861-5517', address: '熊本県熊本市北区鶴羽田1丁目10番7号', tel: '096-341-5765', fax: '096-341-5766'},
  {department: '西・中九州営業部', office: '長崎営業所', postal: '851-0122', address: '長崎県長崎市界2丁目2番4号', tel: '095-834-0535', fax: '095-834-0536'},
  {department: '西・中九州営業部', office: '大村営業所', postal: '856-0844', address: '長崎県大村市溝陸町643-1', tel: '0957-49-6222', fax: '0957-49-6333'},
  {department: '西・中九州営業部', office: '大牟田営業所', postal: '837-0924', address: '福岡県大牟田市歴木446-1', tel: '0944-59-1488', fax: '0944-59-1481'},
];

export const findOffice = (office: string): OfficeInfo | undefined => OFFICES.find((o) => o.office === office);

/** 選択欄で営業部ごとにまとめるための一覧（営業部の並びは OFFICES に出てくる順） */
export const OFFICE_GROUPS: {department: string; offices: OfficeInfo[]}[] = OFFICES.reduce<
  {department: string; offices: OfficeInfo[]}[]
>((groups, o) => {
  const group = groups.find((g) => g.department === o.department);
  if (group) group.offices.push(o);
  else groups.push({department: o.department, offices: [o]});
  return groups;
}, []);

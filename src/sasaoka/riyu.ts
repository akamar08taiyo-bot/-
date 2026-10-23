// 住宅改修が必要な理由書（国の様式。介護支援専門員などが書く）。ユーザーの指示（2026-10-22）
// 「必要に応じて住宅改修の理由書にも飛べるようにする。入力できる項目を全て転記されるようにする。渡したエクセルシートは２つのタブになっていますが、１つのタブで２ページにする」。
// 原本は src/sasaoka/shinsei/riyu.xltx（P1・P2 の2シートを、スキルの scripts/merge-sheets.py で1シートの2ページにして、前の申請の名残りを消したもの）。
// 申請書と同じ欄（被保険者番号・氏名・住所・郵便番号・生年月日・要介護・理由書の作成者）は申請書の仕組み（SHINSEI と同じ ShinseiMap）で書き、
// 理由書だけの欄（□を■にする所・総合的状況・P2 の活動・④改修項目）は riyuCells で書く（fillFiles の sheet.riyu）

import type {EstimateRates, EstimateSettings} from './calc.ts';
import {circled, eraOf, NO_SHINSEI} from './estimateForms.ts';
import {colName, firstPhotoDay, shinseiValues, workItems} from './shinsei.ts';
import type {MarkCell, ShinseiMap, ShinseiValues} from './shinsei.ts';
import type {RiyuField} from './shinseiPreview.ts';
import type {Job, RiyuAct, RiyuActKey, RiyuInfo, ShinseiInfo} from './types.ts';
import {customerFilePart, todayIso} from './util.ts';

// ---------------------------------------------------------------- 原本の欄（riyu.xltx の番地）

/** 福祉用具の利用状況と住宅改修後の想定（P1 の右。20〜33行目。改修前は AN、改修後は AO） */
export const RIYU_EQUIPMENT = ['車いす', '特殊寝台', '床ずれ防止用具', '体位変換器', '手すり', 'スロープ', '歩行器', '歩行補助つえ', '認知症老人徘徊感知機器', '移動用リフト', '腰掛便座', '特殊尿器', '入浴補助用具', '簡易浴槽'] as const;
const EQUIPMENT_ROW = 20;
/** 福祉用具の「その他」の3行（「・」のうしろに名前） */
const EQUIPMENT_OTHER_ROWS = [36, 38, 40];

/** ③ 改修目的・期待効果（どの活動も同じ6つ。最後は「その他（　）」） */
export const RIYU_PURPOSES = ['できなかったことをできるようにする', '転倒等の防止、安全の確保', '動作の容易性の確保', '利用者の精神的負担や不安の軽減', '介護者の負担の軽減', 'その他'] as const;

/**
 * P2 の4つの活動：① の項目（名前と□の欄。最後の「その他（　）」はかっこの中に書く）、② ③ の方針の欄、③ の□の欄（RIYU_PURPOSES の順）。
 * 自宅内の移動の段は ① に項目がなく、空いた欄（B72）に先頭の□（items の 0 番。押すと■）と書いた文を書く
 */
export const RIYU_ACTS: {key: RiyuActKey; label: string; items: {name: string; cell: string}[]; itemOther: string; trouble: string; policy: string; purposes: string[]}[] = [
  {
    key: 'toilet',
    label: '排泄',
    items: [
      {name: 'トイレまでの移動', cell: 'B45'},
      {name: 'トイレ出入口の出入（扉の開閉を含む）', cell: 'B46'},
      {name: '便器からの立ち座り（移乗を含む）', cell: 'B48'},
      {name: '衣服の着脱', cell: 'B49'},
      {name: '排泄時の姿勢保持', cell: 'B50'},
      {name: '後始末', cell: 'B51'},
    ],
    itemOther: 'B52',
    trouble: 'M45',
    policy: 'AD45',
    purposes: ['X45', 'X47', 'X48', 'X49', 'X51', 'X52'],
  },
  {
    key: 'bath',
    label: '入浴',
    items: [
      {name: '浴室までの移動', cell: 'B53'},
      {name: '衣服の着脱', cell: 'B54'},
      {name: '浴室出入口の出入（扉の開閉を含む）', cell: 'B55'},
      {name: '浴室内での移動（立ち座りを含む）', cell: 'B57'},
      {name: '洗い場での姿勢保持（洗体・洗髪を含む）', cell: 'B58'},
      {name: '浴槽の出入（立ち座りを含む）', cell: 'B60'},
      {name: '浴槽内での姿勢保持', cell: 'B61'},
    ],
    itemOther: 'B62',
    trouble: 'M53',
    policy: 'AD53',
    purposes: ['X53', 'X55', 'X56', 'X57', 'X59', 'X60'],
  },
  {
    key: 'out',
    label: '外出',
    items: [
      {name: '出入口までの屋内移動', cell: 'B63'},
      {name: '上がりかまちの昇降', cell: 'B64'},
      {name: '車いす等、装具の着脱', cell: 'B65'},
      {name: '履物の着脱', cell: 'B66'},
      {name: '出入口の出入（扉の開閉を含む）', cell: 'B67'},
      {name: '出入口から敷地外までの屋外移動', cell: 'B69'},
    ],
    itemOther: 'B71',
    trouble: 'M63',
    policy: 'AD63',
    purposes: ['X63', 'X65', 'X66', 'X67', 'X69', 'X70'],
  },
  {key: 'home', label: 'その他（自宅内の移動）', items: [], itemOther: 'B72', trouble: 'M72', policy: 'AD72', purposes: ['X72', 'X74', 'X75', 'X76', 'X78', 'X79']},
];

/**
 * ④ 改修項目（改修箇所）：改修の種類（KINDS の順＝①手すり ②段差 ③床材 ④扉 ⑤便器 ⑥付帯）ごとの、□の欄と箇所を書く行（かっこの中）。
 * 原本の並びは 手摺取付・段差の解消・引き戸等への扉の取替え・便器の取替え・滑り防止等のための床材の変更・その他
 */
export const RIYU_KINDS: {check: string; lines: string[]}[] = [
  {check: 'AJ47', lines: ['AL48', 'AL50', 'AL52', 'AL54']},
  {check: 'AJ56', lines: ['AL57', 'AL59', 'AL61']},
  {check: 'AJ73', lines: ['AL74', 'AL76']},
  {check: 'AJ63', lines: ['AL64', 'AL66']},
  {check: 'AJ68', lines: ['AL69', 'AL71']},
  {check: 'AJ78', lines: ['AL79', 'AL81', 'AL83']},
];

/** P1 の欄 */
export const RIYU_CELL = {
  age: 'P4', // 「歳」の左
  birth: 'V4', // 生年月日（元号は U4 を丸で囲む）
  male: 'Z4',
  female: 'AA4',
  checkDate: 'AH4', // 現地確認日
  madeDate: 'AN4', // 作成日
  careTerm: 'S7', // 認定有効期間
  qualification: 'AH7',
  tel: 'AK9',
  housing: 'W8', // □ 持ち家　□ 借家　□ 借間
  housingOther: 'W9', // □ その他（　）
  body: 'H18',
  care: 'H24',
  wish: 'H29',
} as const;

/** 2ページ（原本は1枚のシート。プレビューはページごと） */
export const RIYU_PAGES = ['A1:AP40', 'A41:AP84'];

// ---------------------------------------------------------------- 項目

const emptyAct = (): RiyuAct => ({items: [], itemOther: '', trouble: '', purposes: [], purposeOther: '', policy: ''});

export const NO_RIYU: RiyuInfo = {
  checkDate: '',
  madeDate: '',
  qualification: '',
  tel: '',
  housing: '',
  housingOther: '',
  body: '',
  care: '',
  wish: '',
  equipment: {},
  equipmentOther: [],
  acts: {toilet: emptyAct(), bath: emptyAct(), out: emptyAct(), home: emptyAct()},
};

/** 様邸の理由書の項目（入れていない項目は空） */
export function riyuOf(job: Pick<Job, 'riyu'>): RiyuInfo {
  const r = job.riyu;
  if (!r) return NO_RIYU;
  return {...NO_RIYU, ...r, acts: {...NO_RIYU.acts, ...r.acts}};
}

/** 理由書の項目を1つでも入れたか（何も入れていない様邸は残さない。App.tsx の isEmpty） */
export function hasRiyuInfo(r: RiyuInfo | undefined): boolean {
  if (!r) return false;
  const {acts, equipment, equipmentOther, ...rest} = r;
  return (
    Object.values(rest).some((v) => v !== '') ||
    Object.keys(equipment).length > 0 ||
    equipmentOther.some((e) => e.name.trim() || e.before || e.after) ||
    Object.values(acts).some((a) => a.items.length > 0 || a.purposes.length > 0 || a.itemOther || a.trouble || a.purposeOther || a.policy)
  );
}

/**
 * 入れていない項目を、ほかの項目から決めたもの（画面と原本で同じ）：
 * 住宅状況は、申請書の住宅の所有者との関係が「本人」なら持ち家。現地確認日は、改修前の写真の撮影日（写真番号の順で最初のもの。写真の日付がなければ空）。
 * 現地確認日は申請書の改修前日付と同じ箇所から（見積書に出る箇所だけ・写真番号の順。前は箇所の並びの順で、見積書から消した箇所の日付も使っていた）
 */
export function riyuShown(job: Pick<Job, 'riyu' | 'shinsei' | 'places'>, rates: EstimateRates): RiyuInfo {
  const r = riyuOf(job);
  const relation = job.shinsei?.relation ?? '';
  const housing = r.housing || (/本人/.test(relation) ? '持ち家' : '');
  const checkDate = r.checkDate || firstPhotoDay(job, rates, 'before');
  return {...r, housing, checkDate};
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const iso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : '');
const nums = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < max))].sort((a, b) => a - b) : []);
const HOUSING = ['持ち家', '借家', '借間', 'その他'] as const;

/** 読み込んだ理由書の項目をそろえる（storage.ts の cleanJobs） */
export function cleanRiyu(raw: unknown): RiyuInfo {
  const r = isObj(raw) ? raw : {};
  const acts = isObj(r.acts) ? r.acts : {};
  const act = (key: RiyuActKey): RiyuAct => {
    const a = isObj(acts[key]) ? acts[key] : {};
    const def = RIYU_ACTS.find((x) => x.key === key)!;
    return {items: nums(a.items, def.items.length || 1), itemOther: str(a.itemOther), trouble: str(a.trouble), purposes: nums(a.purposes, RIYU_PURPOSES.length), purposeOther: str(a.purposeOther), policy: str(a.policy)};
  };
  const equipment: RiyuInfo['equipment'] = {};
  if (isObj(r.equipment)) {
    for (const name of RIYU_EQUIPMENT) {
      const e = r.equipment[name];
      if (isObj(e) && (e.before === true || e.after === true)) equipment[name] = {...(e.before === true ? {before: true} : {}), ...(e.after === true ? {after: true} : {})};
    }
  }
  return {
    checkDate: iso(r.checkDate),
    madeDate: iso(r.madeDate),
    qualification: str(r.qualification),
    tel: str(r.tel),
    housing: (HOUSING as readonly string[]).includes(str(r.housing)) ? (str(r.housing) as RiyuInfo['housing']) : '',
    housingOther: str(r.housingOther),
    body: str(r.body),
    care: str(r.care),
    wish: str(r.wish),
    equipment,
    equipmentOther: (Array.isArray(r.equipmentOther) ? r.equipmentOther : [])
      .filter(isObj)
      .slice(0, EQUIPMENT_OTHER_ROWS.length)
      .map((e) => ({name: str(e.name), before: e.before === true, after: e.after === true})),
    acts: {toilet: act('toilet'), bath: act('bath'), out: act('out'), home: act('home')},
  };
}

// ---------------------------------------------------------------- 日付・年齢

const ERA_START: Record<string, number> = {明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018};

/** 'YYYY-MM-DD' → 「令和8年10月22日」（平成・昭和も）。なければ '' */
export function warekiText(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const era = isoDate >= '2019-05-01' ? '令和' : isoDate >= '1989-01-08' ? '平成' : isoDate >= '1926-12-25' ? '昭和' : isoDate >= '1912-07-30' ? '大正' : '明治';
  const n = y - ERA_START[era];
  return `${era}${n === 1 ? '元' : n}年${mo}月${d}日`;
}

/** 生年月日（元号の年・月・日）の西暦 'YYYY-MM-DD'。そろっていなければ '' */
export function birthIso(info: Pick<ShinseiInfo, 'era' | 'birthY' | 'birthM' | 'birthD'>): string {
  const n = (v: string) => Number(v.normalize('NFKC').replace(/元/, '1').replace(/\D/g, ''));
  const [y, m, d] = [n(info.birthY), n(info.birthM), n(info.birthD)];
  if (!(y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  return `${ERA_START[eraOf(info)] + y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 満年齢（at の日に。誕生日の前日の終わりに1つ増える＝誕生日に増えるとみなす）。生年月日がそろっていなければ null */
export function ageAt(birth: string, at: string): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(at)) return null;
  const [by, bmd] = [Number(birth.slice(0, 4)), birth.slice(5)];
  const [ay, amd] = [Number(at.slice(0, 4)), at.slice(5)];
  const age = ay - by - (amd < bmd ? 1 : 0);
  return age >= 0 && age < 130 ? age : null;
}

// ---------------------------------------------------------------- 書く内容

/** □の欄に書くこと：pick＝何番目の□を■にするか（null は□のまま）、fill＝かっこの中に書く文字（その他） */
export type RiyuCheck = {pick: number | null; fill?: string};
export type RiyuValues = {cells: Record<string, string>; checks: Record<string, RiyuCheck>};

/**
 * 理由書だけの欄に書く値（申請書と同じ欄＝氏名・住所・番号・郵便番号・生年月日・作成者は ShinseiMap の欄で書く）。
 * 年齢は作成日（なければ today）の満年齢。④改修項目は見積書の箇所から（改修の種類ごとに「①廊下」の形で、行が足りなければ最後の行に「・」でつなぐ）
 */
export function riyuCells(job: Job, s: EstimateSettings, today = todayIso()): RiyuValues {
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const r = riyuShown(job, s);
  const cells: Record<string, string> = {};
  const checks: Record<string, RiyuCheck> = {};
  const age = ageAt(birthIso(info), r.madeDate || today);
  if (age !== null) cells[RIYU_CELL.age] = String(age);
  if (info.gender) checks[info.gender === '男' ? RIYU_CELL.male : RIYU_CELL.female] = {pick: 0};
  if (r.checkDate) cells[RIYU_CELL.checkDate] = warekiText(r.checkDate);
  if (r.madeDate) cells[RIYU_CELL.madeDate] = warekiText(r.madeDate);
  if (info.careFrom || info.careTo) cells[RIYU_CELL.careTerm] = `${warekiText(info.careFrom) || '　　年　月　日'}～${warekiText(info.careTo) || '　　年　月　日'}`;
  if (r.qualification.trim()) cells[RIYU_CELL.qualification] = r.qualification.trim();
  if (r.tel.trim()) cells[RIYU_CELL.tel] = r.tel.normalize('NFKC').trim(); // 「TEL」は原本の AH9
  if (r.housing && r.housing !== 'その他') checks[RIYU_CELL.housing] = {pick: ['持ち家', '借家', '借間'].indexOf(r.housing)};
  if (r.housing === 'その他') checks[RIYU_CELL.housingOther] = {pick: 0, fill: r.housingOther.trim()};
  if (r.body.trim()) cells[RIYU_CELL.body] = r.body.trim();
  if (r.care.trim()) cells[RIYU_CELL.care] = r.care.trim();
  if (r.wish.trim()) cells[RIYU_CELL.wish] = r.wish.trim();
  RIYU_EQUIPMENT.forEach((name, i) => {
    const e = r.equipment[name];
    if (e?.before) checks[`AN${EQUIPMENT_ROW + i}`] = {pick: 0};
    if (e?.after) checks[`AO${EQUIPMENT_ROW + i}`] = {pick: 0};
  });
  r.equipmentOther.forEach((e, i) => {
    const row = EQUIPMENT_OTHER_ROWS[i];
    if (row === undefined) return;
    if (e.name.trim()) cells[`AK${row}`] = `・${e.name.trim()}`;
    if (e.before) checks[`AN${row}`] = {pick: 0};
    if (e.after) checks[`AO${row}`] = {pick: 0};
  });
  for (const a of RIYU_ACTS) {
    const v = r.acts[a.key];
    for (const i of v.items) if (a.items[i]) checks[a.items[i].cell] = {pick: 0};
    // 自宅内の移動は、何も入れていなくても先頭の□を書く（ほかの段と同じく手で■にできる。ユーザーの指示「先頭に空白の四角がない」）
    if (a.items.length === 0) cells[a.itemOther] = `${v.items.includes(0) ? '■' : '□'}${v.itemOther.trim()}`;
    else if (v.itemOther.trim()) checks[a.itemOther] = {pick: 0, fill: v.itemOther.trim()};
    if (v.trouble.trim()) cells[a.trouble] = v.trouble.trim();
    for (const i of v.purposes) if (a.purposes[i] && i < RIYU_PURPOSES.length - 1) checks[a.purposes[i]] = {pick: 0};
    const otherCell = a.purposes[RIYU_PURPOSES.length - 1];
    if (v.purposes.includes(RIYU_PURPOSES.length - 1) || v.purposeOther.trim()) checks[otherCell] = {pick: 0, fill: v.purposeOther.trim()};
    if (v.policy.trim()) cells[a.policy] = v.policy.trim();
  }
  // ④ 改修項目（改修箇所）：見積書の箇所の改修の種類ごと（申請書の改修の内容の行を空にした箇所は、申請書と同じく書かない）
  const byKind = new Map<number, string[]>();
  for (const w of workItems(job, s)) {
    if (!w.name || !w.line) continue;
    byKind.set(w.kind, [...(byKind.get(w.kind) ?? []), `${circled(w.photo)}${w.name}`]);
  }
  RIYU_KINDS.forEach((k, i) => {
    const names = byKind.get(i + 1) ?? [];
    if (names.length === 0) return;
    checks[k.check] = {pick: 0};
    k.lines.forEach((cell, j) => {
      const part = j < k.lines.length - 1 ? names.slice(j, j + 1) : names.slice(j);
      if (part.length) cells[cell] = part.join('・');
    });
  });
  return {cells, checks};
}

// ---------------------------------------------------------------- 原本に書く

/** プレビューで押すと、理由書の一覧のその項目へ行く欄（理由書だけの欄。申請書と同じ欄は ShinseiMap の欄から） */
function riyuLinks(): {ref: string; field: RiyuField | 'birth' | 'gender' | 'works'}[] {
  const out: {ref: string; field: RiyuField | 'birth' | 'gender' | 'works'}[] = [
    {ref: RIYU_CELL.age, field: 'birth'},
    {ref: RIYU_CELL.male, field: 'gender'},
    {ref: RIYU_CELL.female, field: 'gender'},
    {ref: RIYU_CELL.checkDate, field: 'checkDate'},
    {ref: RIYU_CELL.madeDate, field: 'madeDate'},
    {ref: RIYU_CELL.careTerm, field: 'careTerm'},
    {ref: RIYU_CELL.qualification, field: 'qualification'},
    {ref: RIYU_CELL.tel, field: 'tel'},
    {ref: RIYU_CELL.housing, field: 'housing'},
    {ref: RIYU_CELL.housingOther, field: 'housing'},
    {ref: RIYU_CELL.body, field: 'body'},
    {ref: RIYU_CELL.care, field: 'careState'},
    {ref: RIYU_CELL.wish, field: 'wish'},
  ];
  RIYU_EQUIPMENT.forEach((_, i) => out.push({ref: `AN${EQUIPMENT_ROW + i}`, field: 'equipment'}, {ref: `AO${EQUIPMENT_ROW + i}`, field: 'equipment'}, {ref: `AK${EQUIPMENT_ROW + i}`, field: 'equipment'}));
  for (const row of EQUIPMENT_OTHER_ROWS) out.push({ref: `AK${row}`, field: 'equipment'}, {ref: `AN${row}`, field: 'equipment'}, {ref: `AO${row}`, field: 'equipment'});
  for (const a of RIYU_ACTS) {
    const field = `act:${a.key}` as RiyuField;
    for (const ref of [...a.items.map((x) => x.cell), a.itemOther, a.trouble, a.policy, ...a.purposes]) out.push({ref, field});
  }
  for (const k of RIYU_KINDS) for (const ref of [k.check, ...k.lines]) out.push({ref, field: 'works'});
  return out;
}

/**
 * 理由書の原本の欄（申請書と同じ仕組みで書く所）：被保険者番号（C4〜L4 の10マス）・氏名（C6）・住所（C9）・郵便番号（E8）・
 * 生年月日（V4。元号は U4 の「明治／大正／昭和」を丸で囲む）・要介護認定（S6 の数字を丸で囲む）・作成者の所属事業所（AH6）と氏名（AH8）。
 * 理由書だけの欄は riyu（riyuCells）
 */
export const RIYU_MAP: ShinseiMap = {
  title: '住宅改修理由書',
  sheets: [
    {
      sheet: '住宅改修理由書',
      name: 'C6',
      address: 'C9',
      insuredNo: Array.from({length: 10}, (_, i) => `${colName(3 + i)}4`),
      marks: [
        {key: 'era', cell: 'U4', needles: ['明治', '大正', '昭和']},
        // 「要支援 （ １ ・２ ）　要介護 （ 経過的 ・１ ・２ ・３ ・４ ・５ ）」：前の値のうしろから順に探すので、要介護１は「経過的」のうしろの１
        {key: 'care', cell: 'S6', needles: ['１', '２', '１', '２', '３', '４', '５']},
      ] satisfies MarkCell[],
      texts: [
        {cell: 'E8', format: '{zip}'},
        {cell: 'V4', format: '{y}年{m}月{d}日'},
        {cell: 'AH6', format: '{reasonOffice}'},
        {cell: 'AH8', format: '{reasonName}'},
      ],
      oneLine: [RIYU_CELL.age, RIYU_CELL.checkDate, RIYU_CELL.madeDate, RIYU_CELL.careTerm, RIYU_CELL.tel],
      riyu: true,
      pages: RIYU_PAGES,
      links: riyuLinks(),
    },
  ],
};

/** 理由書に書く値（申請書と同じ値に、理由書だけの欄の値を足したもの） */
export function riyuValues(job: Job, s: EstimateSettings, today = todayIso()): ShinseiValues {
  return {...shinseiValues(job, s, today), riyu: riyuCells(job, s, today)};
}

/** ファイル名：「山田花子様住宅改修理由書.xlsx」（申請書・見積書と同じ形） */
export const riyuFileName = (job: Pick<Job, 'customer'>) => `${customerFilePart(job.customer)}住宅改修理由書.xlsx`;

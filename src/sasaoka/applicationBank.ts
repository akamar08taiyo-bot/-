import type {BankAccount, Insurer} from './types.ts';

type BankCells = {
  text: Partial<Record<keyof BankAccount, string>>;
  number?: string[];
  bankCode?: string[];
  branchCode?: string[];
  spillTo?: Record<string, string>;
  type?: Partial<Record<string, [string, string]>>;
};

// 受領委任払いの施工業者用口座欄だけを指定する。
const BANK_SHEETS: Partial<Record<Insurer, Record<string, BankCells>>> = {
  kitakyushu: {'支給申請書': {
    text: {institution: 'AC81', branch: 'BM81', kana: 'BE94'},
    spillTo: {AC81: 'AT', BM81: 'BY'},
    number: ['CJ81', 'CQ81', 'CT81', 'CX81', 'DC81', 'DJ81', 'DN81'],
    bankCode: ['AC92', 'AP92', 'AW92', 'BB92'], branchCode: ['BI92', 'BN92', 'BR92'],
    type: {'普通': ['CC87', '通'], '当座': ['CC90', '座']},
  }},
  fukuoka: {'完了届出書（受領委任用)': {
    text: {institution: 'E31', branch: 'N31', number: 'G33', kana: 'Q33', holder: 'P34'},
    type: {'普通': ['E33', '普通'], '当座': ['E33', '当座']},
  }},
  oita: {'支給申請兼施工承認申請書': {
    text: {institution: 'D47', branch: 'R47', kana: 'J51', holder: 'J52'},
    spillTo: {D47: 'J', R47: 'X'},
    number: ['AL46', 'AN46', 'AP46', 'AR46', 'AT46', 'AV46', 'AX46'],
    bankCode: ['J49', 'L49', 'N49', 'P49'], branchCode: ['Y49', 'AA49', 'AC49'],
    type: {'普通': ['AE46', '普通'], '当座': ['AE46', '当座'], '貯蓄': ['AE46', 'その他']},
  }},
  iizuka: {
    '支給申請書': {
      text: {institution: 'C30', branch: 'K30', holder: 'H35', kana: 'H34'},
      number: ['V31', 'W31', 'X31', 'Y31', 'Z31', 'AA31', 'AB31'],
      bankCode: ['C32', 'E32', 'G32', 'I32'], branchCode: ['K32', 'M32', 'O32'],
      type: {'普通': ['R31', '普通預金'], '当座': ['R32', '当座預金'], '貯蓄': ['R33', 'その他']},
    },
    '請求書': {
      text: {institution: 'G20', branch: 'O20', holder: 'K27', kana: 'K26'},
      number: ['U23', 'V23', 'W23', 'X23', 'Y23', 'Z23', 'AA23'],
      bankCode: ['G25', 'I25', 'K25', 'M25'], branchCode: ['O25', 'P25', 'Q25'],
      type: {'普通': ['R23', '普通預金'], '当座': ['R23', '当座預金']},
    },
  },
  kouiki: {'様式第7号（住宅改修費支給申請書（受領委任払用）': {
    text: {institution: 'H41', branch: 'P41', kana: 'O45'},
    number: ['AA43', 'AB43', 'AC43', 'AD43', 'AE43', 'AF43', 'AG43'],
    bankCode: ['H44', 'J44', 'L44', 'N44'], branchCode: ['P44', 'R44', 'T44'],
    type: {'普通': ['V43', '普通'], '当座': ['V44', '当座']},
  }},
  kurume: {'請求書': {
    text: {institution: 'W57', branch: 'BV57', holder: 'X75'},
    spillTo: {W57: 'AX', BV57: 'CO', X75: 'DF'},
    number: ['Y65', 'AI65', 'AO65', 'AW65', 'BE65', 'BL65', 'BS65'],
    type: {'普通': ['AB62', '普通'], '当座': ['BD62', '当座'], '貯蓄': ['CB62', '貯蓄']},
  }},
};

export const applicationNeedsAccount = (insurer: Insurer | '') => !!(insurer && BANK_SHEETS[insurer]);

export function applicationBankCells(insurer: Insurer | '', sheet: string, account: BankAccount) {
  const mapping = insurer ? BANK_SHEETS[insurer]?.[sheet] : undefined;
  const values = new Map<string, string>();
  if (!mapping) return {values, mark: undefined};
  for (const [field, ref] of Object.entries(mapping.text)) {
    const value = account[field as keyof BankAccount]?.trim();
    if (value) values.set(ref, value);
  }
  for (const key of ['number', 'bankCode', 'branchCode'] as const) {
    const refs = mapping[key];
    const value = account[key];
    if (refs && value && /^\d+$/.test(value) && value.length <= refs.length) {
      [...value.padStart(refs.length, ' ')].forEach((ch, i) => { if (ch !== ' ') values.set(refs[i], ch); });
    }
  }
  if (insurer === 'kurume' && account.kana) {
    const kanaCells = ['Z69','AE69','AK69','AP69','AS69','AZ69','BG69','BK69','BQ69','BT69','CD69','CH69','CK69','CO69','CS69','CW69','DA69','DD69'];
    const chars = [...account.kana.replace(/\s+/g, '')];
    if (chars.length <= kanaCells.length) chars.forEach((ch, i) => values.set(kanaCells[i], ch));
  }
  return {values, spillTo: mapping.spillTo, mark: mapping.type?.[account.type]};
}

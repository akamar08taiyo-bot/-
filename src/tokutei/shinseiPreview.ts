// 申請書のプレビュー：保険者の Excel の原本に書き込んだ申請書を、画面に同じ形で描くための材料
// （ユーザーの指示「特定福祉用具購入の申請書も、住宅改修の申請書と同じくプレビューを見ながら入力することができる」2026-10-22）。
// Excel に保存するときと同じ書き込み（shinsei.ts の fillShinseiFiles）をした原本のシートを読み、列の幅・行の高さ・結合・罫線・塗り・
// 文字（大きさ・字体・配置・表示形式）・図形（丸・かっこ・線）・ヘッダーの文字を画素にして返す。描くのは components/ShinseiPreview.tsx。
// 住宅改修アプリの src/sasaoka/shinseiPreview.ts（2026-10-22 の版）を写して、このアプリの申請書の形にしたもの（独立したアプリなので、そのあとは別々に直す）。
// あわせて、押すと案件の画面のその入れる所へ行く欄（お客様名・商品・理由…）の位置も返す（式で同じ値を出している欄＝支給申請書の氏名なども押せる）

import {strFromU8} from 'fflate';
import {fillShinseiFiles, KOUIKI_SHEETS} from './shinsei.ts';
import type {ShinseiForm, ShinseiKey, ShinseiValues} from './shinsei.ts';
import {attrOf, boxes, colName, colNum, EMU, formulaRef, markLayouts, numOf, sheetLayout, sheetPaths, unesc} from './xlsxEdit.ts';
import type {Files, SheetLayout} from './xlsxEdit.ts';

/** 案件の画面の入れる所（申請書の欄とつなぐ。SaleEditor の data-field と同じ名前） */
export type ShinseiField =
  | 'customer'
  | 'kana'
  | 'insuredNo'
  | 'birthDate'
  | 'gender'
  | 'zip'
  | 'address'
  | 'tel'
  | 'careLevel'
  | 'items'
  | 'reason'
  | 'recorder'
  | 'carePlan'
  | 'staff'
  | 'burdenRatio'
  | 'payMethod'
  | 'applyDate'
  | 'deliveryDate'
  | 'claimDate';

/** 入れる所の名前（プレビューの欄の説明） */
export const FIELD_LABEL: Record<ShinseiField, string> = {
  customer: 'お客様名',
  kana: 'フリガナ',
  insuredNo: '被保険者番号',
  birthDate: '生年月日',
  gender: '性別',
  zip: '郵便番号',
  address: '住所',
  tel: '電話',
  careLevel: '要介護度',
  items: '商品',
  reason: '福祉用具が必要な理由',
  recorder: '居宅介護支援事業所・ケアマネジャー',
  carePlan: '居宅サービス計画の届出',
  staff: '担当',
  burdenRatio: '負担割合（保険給付額）',
  payMethod: '支払方法（受領委任払用・償還払い用）',
  applyDate: '申請日',
  deliveryDate: '納品日（購入日）',
  claimDate: '支給申請日',
};

// ---------------------------------------------------------------- 欄と入れる所（shinsei.ts の SHINSEI と同じ番地。テストで書く欄がもれていないか確かめる）

type SheetLinks = {sheet: string; links: [ShinseiField, string[]][]};
const rows = (cols: string[], rs: number[]) => cols.flatMap((c) => rs.map((r) => `${c}${r}`));

/** 行橋市・苅田町の事前申請書（被保険者番号の行だけちがう） */
const preLinks = (insuredRow: number): [ShinseiField, string[]][] => [
  ['kana', ['F4']],
  ['customer', ['F5']],
  ['insuredNo', boxes('Z', 10, insuredRow)],
  ['birthDate', ['F9']],
  ['gender', ['Y9']],
  ['careLevel', ['F12']],
  ['zip', ['G10']],
  ['address', ['F11']],
  ['tel', ['Y10']],
  ['items', rows(['A', 'L', 'V'], [15, 16, 17])],
  ['deliveryDate', rows(['AB'], [15, 16, 17])],
  ['reason', ['E18']],
  ['recorder', ['L20']],
  ['applyDate', ['C26']],
];
const PROXY: SheetLinks = {
  sheet: '委任状',
  links: [
    ['burdenRatio', ['B23']],
    ['applyDate', ['A29']],
    ['address', ['A32']],
    ['customer', ['A36']],
  ],
};
const PHOTO: SheetLinks = {
  sheet: '完了写真',
  links: [
    ['items', ['B3']],
    ['deliveryDate', ['B4']],
  ],
};
const MIYAKO_ROWS = [12, 14, 16, 18];
const MIYAKO_PHOTOS = ['納品確認写真用紙', '納品確認写真用紙 (2)', '納品確認写真用紙 (3)', '納品確認写真用紙 (4)'];
// 広域連合：結合していない1つの欄に書いて右へはみ出す欄（申請者の住所・氏名など）は、はみ出す先の欄までつなぐ（押せる所を広く）。
// 様式の題名を押すと支払方法へ（受領委任払用・償還払い用のどちらに書くかは支払方法で決まる）
const KOUIKI_JURYO_ROWS = [12, 14, 16];
const KOUIKI_SHOKAN_ROWS = [14, 16, 18];

export const SHINSEI_LINKS: Record<ShinseiKey, SheetLinks[]> = {
  yukuhashi: [{sheet: '用具・受領委任払', links: preLinks(7)}, PROXY, PHOTO],
  kanda: [
    {sheet: '用具・受領委任払', links: [...preLinks(4), ['tel', ['Y10', 'K30']]]},
    // 支給申請書：ほとんどの欄は事前申請書を参照する式（式からつなぐ）。性別・生年月日・要介護度の丸、購入日・申請日
    {
      sheet: '用具・支給申請　受領委任払 (2)',
      links: [
        ['birthDate', ['F9']],
        ['gender', ['Y9']],
        ['careLevel', ['F12']],
        ['deliveryDate', rows(['AB'], [15, 16, 17])],
        ['claimDate', ['C26']],
      ],
    },
    PROXY,
    PHOTO,
  ],
  miyako: [
    {
      sheet: '福祉用具購入受領委任払申請書',
      links: [
        ['kana', ['I4']],
        ['customer', ['I5', 'I34']],
        ['insuredNo', boxes('W', 10, 4)],
        ['birthDate', ['I7']],
        ['gender', ['AA7']],
        ['zip', ['I8']],
        ['address', ['I9']],
        ['tel', ['Z9']],
        ['items', rows(['B', 'I', 'R', 'Y'], MIYAKO_ROWS)],
        ['reason', ['I20']],
        ['applyDate', ['D30', 'F30', 'I30', 'L30']],
        ['staff', ['I36']],
      ],
    },
    {
      sheet: '福祉用具支給申請(受領委任）',
      links: [
        ['gender', ['AA7']],
        ['items', rows(['B', 'I', 'P'], MIYAKO_ROWS)],
        ['deliveryDate', rows(['V'], MIYAKO_ROWS)],
        ['claimDate', ['H25', 'J25', 'M25', 'P25']],
      ],
    },
    ...MIYAKO_PHOTOS.map((sheet) => ({
      sheet,
      links: [
        ['customer', ['J5']],
        ['insuredNo', ['Y5']],
        ['items', ['J7']],
      ] as [ShinseiField, string[]][],
    })),
  ],
  kouiki: [
    {
      sheet: KOUIKI_SHEETS.juryo,
      links: [
        ['payMethod', ['B1']],
        ['kana', ['G2']],
        ['customer', ['G3', ...boxes('L', 20, 38)]], // 委任状の被保険者氏名（L38 に「被保険者氏名　　見本 花子」）
        ['insuredNo', boxes('W', 10, 4)],
        ['birthDate', ['G6']],
        ['gender', ['W6']],
        ['zip', ['G8']],
        ['address', ['G9']],
        ['tel', ['Z9']],
        ['items', [...rows(['B', 'I', 'R'], KOUIKI_JURYO_ROWS), 'R18']],
        ['deliveryDate', rows(['Y'], KOUIKI_JURYO_ROWS)],
        ['reason', ['J20']],
        ['recorder', ['J21']], // 居宅サービス計画の届出（有・無）と居宅の事業所名
        ['applyDate', boxes('C', 11, 27)],
      ],
    },
    {
      sheet: KOUIKI_SHEETS.shokan,
      links: [
        ['payMethod', ['A2']],
        ['kana', boxes('I', 9, 4)],
        ['customer', ['I6', ...boxes('J', 10, 34)]],
        ['insuredNo', boxes('W', 10, 6)],
        ['birthDate', ['I8']],
        ['gender', ['W8']],
        ['zip', ['I10']],
        ['address', ['I11', ...boxes('J', 23, 32)]],
        ['tel', boxes('Y', 8, 34)],
        ['items', [...rows(['B', 'I', 'R'], KOUIKI_SHOKAN_ROWS), 'R20']],
        ['deliveryDate', rows(['Y'], KOUIKI_SHOKAN_ROWS)],
        ['reason', ['I22']],
        ['recorder', ['I23']],
        ['applyDate', boxes('H', 10, 30)],
      ],
    },
    {
      sheet: KOUIKI_SHEETS.photo,
      links: [
        ['customer', ['B3']],
        ['insuredNo', boxes('G', 10, 3)],
        ['items', ['B4']],
      ],
    },
  ],
};

/** まだ入っていない入れる所（プレビューの欄を薄い黄色に。shinsei.ts の shinseiChecks と同じ考え。支給申請日は納品のあと。広域連合は要介護度の欄がなく、届出の有・無がある） */
export function missingFields(v: ShinseiValues, key: ShinseiKey): Set<ShinseiField> {
  const out = new Set<ShinseiField>();
  const need = (ok: unknown, f: ShinseiField) => !ok && out.add(f);
  need(v.name, 'customer');
  need(v.kana, 'kana');
  need(v.insuredNo, 'insuredNo');
  need(v.birth, 'birthDate');
  need(v.gender, 'gender');
  need(v.zip, 'zip');
  need(v.address, 'address');
  need(v.tel, 'tel');
  if (key !== 'kouiki') need(v.care, 'careLevel'); // 広域連合の様式には要介護状態区分の欄がない
  need(v.items.length, 'items');
  need(v.items.length && v.items.every((i) => i.reason), 'reason');
  need(key === 'kouiki' ? v.office : v.recorder, 'recorder'); // 広域連合は居宅の事業所名だけ
  need(v.applyDate, 'applyDate');
  need(v.deliveryDate, 'deliveryDate');
  if (key === 'miyako' || key === 'kouiki') need(v.carePlan, 'carePlan');
  if (key === 'miyako') need(v.staff, 'staff');
  return out;
}

// ---------------------------------------------------------------- 画面に描く材料の形

export type Rect = {x: number; y: number; w: number; h: number}; // 画素（ページの左上から）
export type PvFont = {family: string; size: number; bold: boolean; italic: boolean; underline: boolean; strike: boolean; color: string}; // size は画素
export type PvRun = {text: string; font: PvFont};
/** 欄の文字：rect は文字を置く範囲（となりの空いた欄へはみ出す文字は、その分広げた範囲） */
export type PvText = Rect & {
  ref: string;
  runs: PvRun[];
  align: 'left' | 'center' | 'right' | 'distributed';
  valign: 'top' | 'center' | 'bottom';
  wrap: boolean;
  shrink: boolean; // 縮小して全体を表示する
  vertical: boolean; // 縦書き
  indent: number; // 画素
  // 丸で囲む欄（男・女 など）：1文字ずつの位置（丸の位置と同じ計算。原本の字体のない端末でも丸と文字をそろえる）
  marked?: {chars: {ch: string; x: number; w: number}[]; cy: number; em: number};
};
export type PvLine = {x1: number; y1: number; x2: number; y2: number; width: number; dash: string; color: string; double: boolean};
export type PvShape = Rect & {
  kind: 'ellipse' | 'rect' | 'roundRect' | 'bracketPair' | 'line';
  stroke: string;
  width: number;
  fill: string;
  flipH: boolean;
  flipV: boolean;
  text: string;
  font: PvFont | null;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'center' | 'bottom';
  wrap: boolean;
  inset: {l: number; t: number; r: number; b: number};
};
export type PvHeader = {left: PvRun[]; center: PvRun[]; right: PvRun[]};
/** 押すと案件の画面のその入れる所へ行く欄 */
export type PvField = Rect & {field: ShinseiField; ref: string};
/** 申請書の1枚（原本の1つのシート） */
export type PvPage = {
  sheet: string;
  width: number;
  height: number;
  fills: (Rect & {color: string})[];
  texts: PvText[];
  lines: PvLine[];
  shapes: PvShape[];
  header: PvHeader | null;
  footer: PvHeader | null;
  fields: PvField[];
};

/**
 * 申請書のプレビュー：原本（開いたもの）に書き込んで、書き込むシートごとに1枚（事前申請書・支給申請書・委任状・写真の用紙。
 * みやこ町の納品確認写真用紙は商品の数だけ）。原本はそのまま（{...template} に書き込む）なので、打つたびに呼んでよい
 */
export function shinseiPreview(template: Files, form: ShinseiForm, v: ShinseiValues): PvPage[] {
  const files: Files = {...template};
  fillShinseiFiles(files, form, v);
  const paths = sheetPaths(files);
  const writes = form.sheets(v);
  const sheetLinks = SHINSEI_LINKS[form.key];
  // 'シート名!番地' → 入れる所（式で参照している欄を見分ける）
  const links = new Map<string, ShinseiField>();
  for (const s of sheetLinks) for (const [field, refs] of s.links) for (const ref of refs) links.set(`${s.sheet.trim()}!${ref}`, field);
  const pages: PvPage[] = [];
  const seen = new Set<string>();
  for (const w of writes) {
    if (seen.has(w.sheet)) continue;
    seen.add(w.sheet);
    const path = paths.get(w.sheet);
    if (!path || !files[path] || !template[path]) continue;
    const own = sheetLinks.find((s) => s.sheet === w.sheet)?.links ?? [];
    const marked = w.marks?.length ? markLayouts(files, w.sheet, w.marks) : [];
    pages.push(buildPage(files, path, template[path], w.sheet, own, links, marked));
  }
  return pages;
}

// ---------------------------------------------------------------- 書式（色・字体・罫線・表示形式）

/** 決まった色の番号（indexed）の色。64 は文字・罫線の色（黒）、65 は背景（白） */
const PALETTE =
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333'.split(
    ' ',
  );

/** styles.xml の部品（字体・塗り・罫線・書式・表示形式・色の表） */
type Styles = {fonts: string[]; fills: string[]; borders: string[]; xfs: string[]; numFmts: Map<number, string>; palette: string[]};
const stylesCache = new WeakMap<Uint8Array, Styles>();

function stylesOf(files: Files): Styles {
  const f = files['xl/styles.xml'];
  const cached = f && stylesCache.get(f);
  if (cached) return cached;
  const st = f ? strFromU8(f) : '';
  const list = (outer: string, inner: string) => [...(new RegExp(`<${outer}\\b[^>]*>([\\s\\S]*?)</${outer}>`).exec(st)?.[1] ?? '').matchAll(new RegExp(`<${inner}\\b[^>]*?(?:/>|>[\\s\\S]*?</${inner}>)`, 'g'))].map((m) => m[0]);
  const numFmts = new Map<number, string>();
  for (const m of st.matchAll(/<numFmt\b[^>]*>/g)) numFmts.set(numOf(attrOf(m[0], 'numFmtId'), -1), unesc(attrOf(m[0], 'formatCode') ?? ''));
  const palette = [...(/<indexedColors>([\s\S]*?)<\/indexedColors>/.exec(st)?.[1] ?? '').matchAll(/rgb="([0-9A-Fa-f]{6,8})"/g)].map((m) => m[1].slice(-6));
  const out = {fonts: list('fonts', 'font'), fills: list('fills', 'fill'), borders: list('borders', 'border'), xfs: list('cellXfs', 'xf'), numFmts, palette};
  if (f) stylesCache.set(f, out);
  return out;
}

type Theme = {colors: string[]; lines: number[]};
const themeCache = new WeakMap<Uint8Array, Theme>();

function themeOf(files: Files): Theme {
  const f = files['xl/theme/theme1.xml'];
  const cached = f && themeCache.get(f);
  if (cached) return cached;
  const xml = f ? strFromU8(f) : '';
  const pick = (name: string, d: string) => {
    const body = new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`).exec(xml)?.[1] ?? '';
    return /lastClr="([0-9A-Fa-f]{6})"/.exec(body)?.[1] ?? /srgbClr val="([0-9A-Fa-f]{6})"/.exec(body)?.[1] ?? d;
  };
  const colors = [
    pick('lt1', 'FFFFFF'),
    pick('dk1', '000000'),
    pick('lt2', 'EEECE1'),
    pick('dk2', '1F497D'),
    ...['4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646'].map((d, i) => pick(`accent${i + 1}`, d)),
    pick('hlink', '0000FF'),
    pick('folHlink', '800080'),
  ];
  const lnList = /<a:lnStyleLst>([\s\S]*?)<\/a:lnStyleLst>/.exec(xml)?.[1] ?? '';
  const lines = [...lnList.matchAll(/<a:ln\b[^>]*\sw="(\d+)"/g)].map((m) => Number(m[1]));
  const out = {colors, lines: lines.length ? lines : [9525, 25400, 38100]};
  if (f) themeCache.set(f, out);
  return out;
}

/** 明るさを変える（Excel の tint：-1〜1） */
function tinted(hex: string, tint: number): string {
  if (!tint) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rgb = s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  return rgb.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** 色の書き方（<color rgb=… indexed=… theme=… tint=…/>）→ '#RRGGBB'。なければ fallback */
function colorOf(tag: string | undefined, st: Styles, theme: Theme, fallback: string): string {
  if (!tag) return fallback;
  const rgb = attrOf(tag, 'rgb');
  const indexed = attrOf(tag, 'indexed');
  const th = attrOf(tag, 'theme');
  let hex = '';
  if (rgb) hex = rgb.slice(-6);
  else if (indexed !== undefined) {
    const n = Number(indexed);
    if (n === 64) return fallback;
    hex = n === 65 ? 'FFFFFF' : (st.palette[n] ?? PALETTE[n] ?? '');
  } else if (th !== undefined) hex = theme.colors[Number(th)] ?? '';
  if (!hex) return fallback;
  return `#${tinted(hex.toUpperCase(), numOf(attrOf(tag, 'tint'), 0))}`;
}

/** 字体の名前 → 画面の字体（Windows のパソコンは原本と同じ字体。ないとき＝スマホなどは近い字体） */
export function familyOf(name: string): string {
  const mincho = /明朝|Mincho/i.test(name);
  const fixed = !/[ＰP]/.test(name) && /ＭＳ|MS/.test(name);
  const alias: Record<string, string> = {'ＭＳ Ｐゴシック': 'MS PGothic', 'ＭＳ ゴシック': 'MS Gothic', 'ＭＳ Ｐ明朝': 'MS PMincho', 'ＭＳ 明朝': 'MS Mincho'};
  const near = mincho
    ? '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", serif'
    : `${fixed ? '"BIZ UDGothic", ' : ''}"Yu Gothic", "YuGothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "IPAPGothic", sans-serif`;
  return [name && `"${name}"`, alias[name] && `"${alias[name]}"`, near].filter(Boolean).join(', ');
}

/** 字体の XML（<font> または文字の一部の <rPr>）→ 字体。base にないものを足す */
function fontOf(xml: string, st: Styles, theme: Theme, base?: PvFont): PvFont {
  const name = unesc(/<(?:name|rFont) val="([^"]*)"/.exec(xml)?.[1] ?? '');
  const sz = /<sz val="([\d.]+)"/.exec(xml)?.[1];
  const flag = (tag: string, d: boolean) => {
    const m = new RegExp(`<${tag}(?:\\s+val="([^"]*)")?\\s*/>`).exec(xml);
    return m ? m[1] === undefined || (m[1] !== '0' && m[1] !== 'false' && m[1] !== 'none') : d;
  };
  return {
    family: name ? familyOf(name) : (base?.family ?? familyOf('')),
    size: sz ? (Number(sz) * 4) / 3 : (base?.size ?? (11 * 4) / 3),
    bold: flag('b', base?.bold ?? false),
    italic: flag('i', base?.italic ?? false),
    underline: flag('u', base?.underline ?? false),
    strike: flag('strike', base?.strike ?? false),
    color: /<color\b[^>]*\/>/.test(xml) ? colorOf(/<color\b[^>]*\/>/.exec(xml)?.[0], st, theme, '#000000') : (base?.color ?? '#000000'),
  };
}

type Side = {style: string; color: string};
type Sides = {left?: Side; right?: Side; top?: Side; bottom?: Side};

function bordersOf(xml: string, st: Styles, theme: Theme): Sides {
  const out: Sides = {};
  for (const m of xml.matchAll(/<(left|right|top|bottom|start|end)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
    const style = attrOf(m[2], 'style');
    if (!style || style === 'none') continue;
    const side = m[1] === 'start' ? 'left' : m[1] === 'end' ? 'right' : (m[1] as keyof Sides);
    out[side] = {style, color: colorOf(/<color\b[^>]*\/>/.exec(m[3] ?? '')?.[0], st, theme, '#000000')};
  }
  return out;
}

/** 罫線の種類 → 太さ（画素）と破線 */
const LINE: Record<string, {width: number; dash: string; double?: boolean}> = {
  hair: {width: 1, dash: '1 1'},
  thin: {width: 1, dash: ''},
  medium: {width: 2, dash: ''},
  thick: {width: 3, dash: ''},
  dashed: {width: 1, dash: '3 1'},
  dotted: {width: 1, dash: '1 1'},
  double: {width: 3, dash: '', double: true},
  mediumDashed: {width: 2, dash: '6 2'},
  dashDot: {width: 1, dash: '6 2 2 2'},
  mediumDashDot: {width: 2, dash: '6 2 2 2'},
  dashDotDot: {width: 1, dash: '6 2 2 2 2 2'},
  mediumDashDotDot: {width: 2, dash: '6 2 2 2 2 2'},
  slantDashDot: {width: 2, dash: '6 2 2 2'},
};
const weight = (style: string) => (LINE[style] ?? LINE.thin).width * 10 + (LINE[style]?.dash ? 0 : 1);

/** 書式（cellXfs の1つ）を読んだもの */
type Xf = {font: PvFont; fill: string; sides: Sides; numFmt: string; align: string; valign: string; wrap: boolean; shrink: boolean; vertical: boolean; indent: number};
const xfCache = new WeakMap<Styles, Xf[]>();

function xfsOf(files: Files): Xf[] {
  const st = stylesOf(files);
  const cached = xfCache.get(st);
  if (cached) return cached;
  const theme = themeOf(files);
  const fonts = st.fonts.map((f) => fontOf(f, st, theme));
  const fills = st.fills.map((f) => {
    const p = /<patternFill\b([^>]*)(?:\/>|>([\s\S]*?)<\/patternFill>)/.exec(f);
    const type = p ? (attrOf(p[1], 'patternType') ?? 'none') : 'none';
    if (type === 'none') return '';
    const fg = /<fgColor\b[^>]*\/>/.exec(p?.[2] ?? '')?.[0];
    return colorOf(fg, st, theme, type === 'solid' ? '' : '#D9D9D9');
  });
  const borders = st.borders.map((b) => bordersOf(b, st, theme));
  const out = st.xfs.map((xf): Xf => {
    const align = /<alignment\b[^>]*>/.exec(xf)?.[0] ?? '';
    const id = numOf(attrOf(xf, 'numFmtId'), 0);
    return {
      font: fonts[numOf(attrOf(xf, 'fontId'), 0)] ?? fonts[0],
      fill: fills[numOf(attrOf(xf, 'fillId'), 0)] ?? '',
      sides: borders[numOf(attrOf(xf, 'borderId'), 0)] ?? {},
      numFmt: st.numFmts.get(id) ?? BUILTIN_FMT[id] ?? 'General',
      align: attrOf(align, 'horizontal') ?? 'general',
      valign: attrOf(align, 'vertical') ?? 'bottom',
      wrap: attrOf(align, 'wrapText') === '1' || attrOf(align, 'wrapText') === 'true',
      shrink: attrOf(align, 'shrinkToFit') === '1' || attrOf(align, 'shrinkToFit') === 'true',
      vertical: attrOf(align, 'textRotation') === '255',
      indent: numOf(attrOf(align, 'indent'), 0),
    };
  });
  xfCache.set(st, out);
  return out;
}

/** 決まった表示形式（日本語の Excel） */
const BUILTIN_FMT: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  14: 'yyyy/m/d',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'yyyy/m/d h:mm',
  27: '[$-411]ge.m.d',
  28: '[$-411]ggge"年"m"月"d"日"',
  29: '[$-411]ggge"年"m"月"d"日"',
  30: 'm/d/yy',
  31: 'yyyy"年"m"月"d"日"',
  32: 'h"時"mm"分"',
  33: 'h"時"mm"分"ss"秒"',
  34: 'yyyy"年"m"月"',
  35: 'm"月"d"日"',
  36: '[$-411]ge.m.d',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  49: '@',
  50: '[$-411]ge.m.d',
  51: '[$-411]ggge"年"m"月"d"日"',
  52: 'yyyy"年"m"月"',
  53: 'm"月"d"日"',
  54: '[$-411]ggge"年"m"月"d"日"',
  55: 'yyyy"年"m"月"',
  56: 'm"月"d"日"',
  57: '[$-411]ge.m.d',
  58: '[$-411]ggge"年"m"月"d"日"',
};

/** 書き方を ; で分ける（"…" の中・[…] の中は分けない） */
function sections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = false;
  let bracket = false;
  for (const ch of code) {
    if (ch === '"' && !bracket) quote = !quote;
    else if (ch === '[' && !quote) bracket = true;
    else if (ch === ']' && !quote) bracket = false;
    if (ch === ';' && !quote && !bracket) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 元号（明治〜令和）と元号の年 */
function era(d: Date): {name: string; short: string; year: number} {
  const t = d.getTime();
  const eras: [number, string, string][] = [
    [Date.UTC(2019, 4, 1), '令和', 'R'],
    [Date.UTC(1989, 0, 8), '平成', 'H'],
    [Date.UTC(1926, 11, 25), '昭和', 'S'],
    [Date.UTC(1912, 6, 30), '大正', 'T'],
    [Date.UTC(1868, 0, 1), '明治', 'M'],
  ];
  const e = eras.find(([from]) => t >= from) ?? eras[eras.length - 1];
  return {name: e[1], short: e[2], year: d.getUTCFullYear() - new Date(e[0]).getUTCFullYear() + 1};
}

function formatDate(serial: number, sec: string): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000);
  const e = era(d);
  const tokens = /"[^"]*"|\\.|\[[^\]]*\]|yyyy|yy|ggg|gg|g|ee|e|mmmm|mmm|mm|m|dddd|ddd|dd|d|aaaa|aaa|hh|h|ss|s|AM\/PM|./gi;
  const pad = (n: number) => String(n).padStart(2, '0');
  const parts = [...sec.matchAll(tokens)].map((m) => m[0]);
  let out = '';
  parts.forEach((tok, i) => {
    const low = tok.toLowerCase();
    const minute = () => parts.slice(0, i).some((p) => /^h+$/i.test(p)) || parts.slice(i + 1).some((p) => /^s+$/i.test(p));
    if (tok.startsWith('"')) out += tok.slice(1, -1);
    else if (tok.startsWith('\\')) out += tok.slice(1);
    else if (tok.startsWith('[')) out += '';
    else if (low === 'yyyy') out += d.getUTCFullYear();
    else if (low === 'yy') out += pad(d.getUTCFullYear() % 100);
    else if (low === 'ggg') out += e.name;
    else if (low === 'gg') out += e.name[0];
    else if (low === 'g') out += e.short;
    else if (low === 'ee') out += pad(e.year);
    else if (low === 'e') out += e.year;
    else if (low === 'mmmm' || low === 'mmm') out += d.getUTCMonth() + 1;
    else if (low === 'mm') out += minute() ? pad(d.getUTCMinutes()) : pad(d.getUTCMonth() + 1);
    else if (low === 'm') out += minute() ? d.getUTCMinutes() : d.getUTCMonth() + 1;
    else if (low === 'dddd' || low === 'aaaa') out += `${'日月火水木金土'[d.getUTCDay()]}曜日`;
    else if (low === 'ddd' || low === 'aaa') out += '日月火水木金土'[d.getUTCDay()];
    else if (low === 'dd') out += pad(d.getUTCDate());
    else if (low === 'd') out += d.getUTCDate();
    else if (low === 'hh') out += pad(d.getUTCHours());
    else if (low === 'h') out += d.getUTCHours();
    else if (low === 'ss') out += pad(d.getUTCSeconds());
    else if (low === 's') out += d.getUTCSeconds();
    else if (low === 'am/pm') out += d.getUTCHours() < 12 ? 'AM' : 'PM';
    else if (tok === '_' || tok === '*') out += '';
    else out += tok;
  });
  return out;
}

/** 標準の表示（整数はそのまま、小数は11けたまで） */
const general = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(11))));

/** 数を表示形式で文字にする（金額の 3けた区切り・「円」・日付・元号。ほかは標準） */
export function formatNumber(v: number, code: string): string {
  if (!code || /^general$/i.test(code)) return general(v);
  const secs = sections(code);
  let sec = secs[0];
  let value = v;
  if (v < 0 && secs.length > 1) {
    sec = secs[1];
    value = -v;
  } else if (v === 0 && secs.length > 2) sec = secs[2];
  const plain = sec.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
  if (!/[0#?]/.test(plain) && /[ymdhsge]/i.test(plain) && !/^general$/i.test(plain.trim())) return formatDate(value, sec);
  if (/^general$/i.test(plain.trim())) return general(value);
  const first = plain.search(/[0#?]/);
  if (first < 0) return sec.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/\[[^\]]*\]/g, '');
  const percent = plain.includes('%');
  if (percent) value *= 100;
  const decimals = /\.([0#?]+)/.exec(plain)?.[1].length ?? 0;
  const grouped = /[0#?],[0#?]/.test(plain);
  let num = value.toFixed(decimals);
  if (grouped) {
    const [int, frac] = num.split('.');
    num = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
  }
  const out: string[] = [];
  let placed = false;
  for (const m of sec.matchAll(/"([^"]*)"|\\(.)|\[[^\]]*\]|_.|\*.|([0#?.,%]+)|(.)/g)) {
    if (m[1] !== undefined) out.push(m[1]);
    else if (m[2] !== undefined) out.push(m[2]);
    else if (m[0].startsWith('_')) out.push(' ');
    else if (m[0].startsWith('[') || m[0].startsWith('*')) continue;
    else if (m[3] !== undefined) {
      if (!placed && /[0#?]/.test(m[3])) {
        out.push(num + (percent ? '%' : ''));
        placed = true;
      }
    } else out.push(m[4] ?? '');
  }
  return (v < 0 && secs.length === 1 ? '-' : '') + out.join('');
}

// ---------------------------------------------------------------- 共有の文字（書式つき）

type RichRun = {text: string; rPr: string};
const richCache = new WeakMap<Uint8Array, RichRun[][]>();

/** 共有の文字を、書式の違う所で分けたもの（ふりがな＝rPh は除く） */
function richShared(files: Files): RichRun[][] {
  const f = files['xl/sharedStrings.xml'];
  if (!f) return [];
  const cached = richCache.get(f);
  if (cached) return cached;
  const out = [...strFromU8(f).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    const body = m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    const runs = [...body.matchAll(/<r>([\s\S]*?)<\/r>/g)].map((r) => ({
      text: unesc([...r[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
      rPr: /<rPr>([\s\S]*?)<\/rPr>/.exec(r[1])?.[1] ?? '',
    }));
    if (runs.length) return runs;
    return [{text: unesc([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')), rPr: ''}];
  });
  richCache.set(f, out);
  return out;
}

// ---------------------------------------------------------------- 1枚を作る

type Cell = {s: number | null; t: string; inner: string};
type Range = [number, number, number, number]; // 左の列・上の行・右の列・下の行（1始まり）
const rangeCache = new WeakMap<Uint8Array, Range>();

const cellsRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function readCells(xml: string): Map<string, Cell> {
  const out = new Map<string, Cell>();
  for (const m of xml.matchAll(cellsRe)) {
    const s = attrOf(m[3], 's');
    out.set(`${m[2]},${colNum(m[1])}`, {s: s === undefined ? null : Number(s), t: attrOf(m[3], 't') ?? 'n', inner: m[4] ?? ''});
  }
  return out;
}

const hasValue = (c: Cell) => /<v>[^<]+<\/v>|<t\b[^>]*>[^<]+<\/t>/.test(c.inner);

/** 様式の範囲：罫線・塗りのある欄と、文字のある欄が入る四角（印刷範囲の決まっていないシート） */
function formRange(templateXml: string, xfs: Xf[]): Range {
  let [c1, r1, c2, r2] = [Infinity, Infinity, 0, 0];
  for (const [key, cell] of readCells(templateXml)) {
    const xf = cell.s !== null ? xfs[cell.s] : undefined;
    const styled = !!xf && (xf.fill !== '' || Object.keys(xf.sides).length > 0);
    if (!styled && !hasValue(cell)) continue;
    const [r, c] = key.split(',').map(Number);
    c1 = Math.min(c1, c);
    r1 = Math.min(r1, r);
    c2 = Math.max(c2, c);
    r2 = Math.max(r2, r);
  }
  for (const m of templateXml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
    const [a, b, c, d] = [colNum(m[1]), Number(m[2]), colNum(m[3]), Number(m[4])];
    if (a >= c1 && a <= c2 && b >= r1 && b <= r2) {
      c2 = Math.max(c2, c);
      r2 = Math.max(r2, d);
    }
  }
  return c2 ? [c1, r1, c2, r2] : [1, 1, 1, 1];
}

/** シートの印刷の範囲（ブックの名前の定義 _xlnm.Print_Area。localSheetId はシートの順番） */
function printRange(files: Files, sheetName: string): Range | null {
  const wb = strFromU8(files['xl/workbook.xml']);
  const order = [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => unesc(m[1]));
  const idx = order.indexOf(sheetName);
  for (const m of wb.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)) {
    if (attrOf(m[1], 'name') !== '_xlnm.Print_Area' || Number(attrOf(m[1], 'localSheetId')) !== idx) continue;
    const r = /\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(unesc(m[2]).split(',')[0]);
    if (r) return [colNum(r[1]), Number(r[2]), colNum(r[3]), Number(r[4])];
  }
  return null;
}

function buildPage(
  files: Files,
  path: string,
  templateSheet: Uint8Array,
  sheet: string,
  own: [ShinseiField, string[]][],
  links: Map<string, ShinseiField>,
  marked: {ref: string; chars: {ch: string; x: number; w: number}[]; cy: number; em: number}[],
): PvPage {
  const xml = strFromU8(files[path]);
  const xfs = xfsOf(files);
  const st = stylesOf(files);
  const theme = themeOf(files);
  const lay = sheetLayout(xml);
  // 範囲：印刷の範囲（なければ罫線・文字のある四角）
  let range = rangeCache.get(templateSheet);
  if (!range) {
    range = printRange(files, sheet) ?? formRange(strFromU8(templateSheet), xfs);
    rangeCache.set(templateSheet, range);
  }
  const [c1, r1, c2, r2] = range;
  const xs: number[] = [];
  const ys: number[] = [];
  xs[c1] = 0;
  for (let c = c1; c <= c2; c++) xs[c + 1] = xs[c] + lay.colW(c);
  ys[r1] = 0;
  for (let r = r1; r <= r2; r++) ys[r + 1] = ys[r] + lay.rowH(r);
  let ox = 0;
  for (let c = 1; c < c1; c++) ox += lay.colW(c);
  let oy = 0;
  for (let r = 1; r < r1; r++) oy += lay.rowH(r);

  const cells = readCells(xml);
  const rowStyle = new Map<number, number>();
  for (const m of xml.matchAll(/<row\b[^>]*>/g)) {
    if (attrOf(m[0], 'customFormat') === '1' && attrOf(m[0], 's') !== undefined) rowStyle.set(numOf(attrOf(m[0], 'r'), 0), numOf(attrOf(m[0], 's'), 0));
  }
  const colStyles = [...xml.matchAll(/<col\b[^>]*>/g)].map((m) => ({min: numOf(attrOf(m[0], 'min'), 0), max: numOf(attrOf(m[0], 'max'), 0), s: numOf(attrOf(m[0], 'style'), 0)}));
  const styleAt = (r: number, c: number) => cells.get(`${r},${c}`)?.s ?? rowStyle.get(r) ?? colStyles.find((x) => x.min <= c && c <= x.max)?.s ?? 0;
  // 0 を出さないシート（hideZeros）
  const showZeros = !/<sheetView\b[^>]*showZeros="0"/.test(xml);

  const mergeAt = new Map<string, number[]>();
  for (const m of lay.merges) {
    for (let r = m[1]; r <= m[3]; r++) for (let c = m[0]; c <= m[2]; c++) mergeAt.set(`${r},${c}`, m);
  }
  const inRange = (r: number, c: number) => r >= r1 && r <= r2 && c >= c1 && c <= c2;
  const rectOf = (r: number, c: number): Rect => {
    const m = mergeAt.get(`${r},${c}`) ?? [c, r, c, r];
    const [a, b, cc, d] = [Math.max(m[0], c1), Math.max(m[1], r1), Math.min(m[2], c2), Math.min(m[3], r2)];
    return {x: xs[a], y: ys[b], w: xs[cc + 1] - xs[a], h: ys[d + 1] - ys[b]};
  };
  const refRect = (ref: string): Rect | null => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) return null;
    const [r, c] = [Number(m[2]), colNum(m[1])];
    return inRange(r, c) ? rectOf(r, c) : null;
  };

  // 欄の文字
  const rich = richShared(files);
  const display = (cell: Cell, xf: Xf): PvRun[] => {
    const v = /<v>([\s\S]*?)<\/v>/.exec(cell.inner)?.[1];
    if (cell.t === 's') return (rich[Number(v)] ?? []).map((run) => ({text: run.text, font: run.rPr ? fontOf(run.rPr, st, theme, xf.font) : xf.font}));
    if (cell.t === 'inlineStr') return [{text: unesc([...cell.inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')), font: xf.font}];
    if (v === undefined || v === '') return [];
    if (cell.t === 'str') return [{text: unesc(v), font: xf.font}];
    // 式の答えのまちがい（#VALUE! など。原本の式が空の欄を参照しているとき）は出さない
    if (cell.t === 'e') return [];
    if (cell.t === 'b') return [{text: v === '1' ? 'TRUE' : 'FALSE', font: xf.font}];
    const n = Number(v);
    if (n === 0 && !showZeros) return [];
    return [{text: Number.isFinite(n) ? formatNumber(n, xf.numFmt) : unesc(v), font: xf.font}];
  };
  const textAt = new Map<string, {runs: PvRun[]; xf: Xf; number: boolean}>();
  for (const [key, cell] of cells) {
    const [r, c] = key.split(',').map(Number);
    if (!inRange(r, c)) continue;
    const m = mergeAt.get(key);
    if (m && (m[0] !== c || m[1] !== r)) continue;
    const xf = xfs[cell.s ?? styleAt(r, c)] ?? xfs[0];
    const runs = display(cell, xf).filter((run) => run.text !== '');
    if (runs.length) textAt.set(key, {runs, xf, number: cell.t === 'n' && /<v>/.test(cell.inner)});
  }
  const empty = (r: number, c: number) => !textAt.has(`${r},${c}`) && !mergeAt.has(`${r},${c}`);
  const texts: PvText[] = [];
  for (const [key, {runs, xf, number}] of textAt) {
    const [r, c] = key.split(',').map(Number);
    const merged = mergeAt.has(key);
    let rect = rectOf(r, c);
    const h = xf.align === 'general' ? (number ? 'right' : 'left') : xf.align;
    const wrap = xf.wrap || h === 'distributed' || h === 'justify';
    // 折り返さない欄の文字は、となりの空いた欄へはみ出す（Excel と同じ）
    if (!merged && !wrap && !xf.shrink && !number && !xf.vertical) {
      let left = c;
      let right = c;
      if (h === 'left' || h === 'fill') while (right < c2 && empty(r, right + 1)) right++;
      else if (h === 'right') while (left > c1 && empty(r, left - 1)) left--;
      else if (h === 'center') {
        while (left > c1 && right < c2 && empty(r, left - 1) && empty(r, right + 1)) {
          left--;
          right++;
        }
      } else if (h === 'centerContinuous') {
        while (right < c2 && empty(r, right + 1) && xfs[styleAt(r, right + 1)]?.align === 'centerContinuous') right++;
      }
      rect = {x: xs[left], y: rect.y, w: xs[right + 1] - xs[left], h: rect.h};
    }
    const align: PvText['align'] = h === 'center' || h === 'centerContinuous' ? 'center' : h === 'right' ? 'right' : h === 'distributed' || h === 'justify' ? 'distributed' : 'left';
    const valign: PvText['valign'] = xf.valign === 'top' ? 'top' : xf.valign === 'bottom' ? 'bottom' : 'center';
    const shown = wrap ? runs : runs.map((run) => ({...run, text: run.text.replace(/\r?\n/g, '')}));
    texts.push({...rect, ref: `${colName(c)}${r}`, runs: shown, align, valign, wrap, shrink: xf.shrink && !wrap, vertical: xf.vertical, indent: xf.indent * xf.font.size});
  }

  // 丸で囲む欄は、丸と同じ計算の文字の位置で描く
  for (const m of marked) {
    const t = texts.find((x) => x.ref === m.ref);
    if (t) t.marked = {chars: m.chars.map((c) => ({ch: c.ch, x: c.x - ox, w: c.w})), cy: m.cy - oy, em: m.em};
  }

  // 塗り
  const fills: (Rect & {color: string})[] = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const m = mergeAt.get(`${r},${c}`);
      if (m && (m[0] !== c || m[1] !== r) && inRange(m[1], m[0])) continue;
      const color = xfs[styleAt(r, c)]?.fill ?? '';
      if (color) fills.push({...rectOf(r, c), color});
    }
  }

  // 罫線
  const edges = new Map<string, PvLine & {style: string}>();
  const addEdge = (x1: number, y1: number, x2: number, y2: number, side: Side) => {
    if (x1 === x2 && y1 === y2) return;
    const key = `${x1},${y1},${x2},${y2}`;
    const prev = edges.get(key);
    if (prev && weight(prev.style) >= weight(side.style)) return;
    const l = LINE[side.style] ?? LINE.thin;
    edges.set(key, {x1, y1, x2, y2, width: l.width, dash: l.dash, color: side.color, double: !!l.double, style: side.style});
  };
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const sides = xfs[styleAt(r, c)]?.sides ?? {};
      const m = mergeAt.get(`${r},${c}`);
      if (sides.left && (!m || m[0] === c)) addEdge(xs[c], ys[r], xs[c], ys[r + 1], sides.left);
      if (sides.right && (!m || m[2] === c)) addEdge(xs[c + 1], ys[r], xs[c + 1], ys[r + 1], sides.right);
      if (sides.top && (!m || m[1] === r)) addEdge(xs[c], ys[r], xs[c + 1], ys[r], sides.top);
      if (sides.bottom && (!m || m[3] === r)) addEdge(xs[c], ys[r + 1], xs[c + 1], ys[r + 1], sides.bottom);
    }
  }

  return {
    sheet,
    width: xs[c2 + 1],
    height: ys[r2 + 1],
    fills,
    texts,
    lines: joinLines([...edges.values()]),
    shapes: readShapes(files, path, xml, lay, ox, oy, xs[c2 + 1], ys[r2 + 1], theme),
    header: headerFooter(/<oddHeader>([\s\S]*?)<\/oddHeader>/.exec(xml)?.[1], xfs[0]?.font, sheet),
    footer: headerFooter(/<oddFooter>([\s\S]*?)<\/oddFooter>/.exec(xml)?.[1], xfs[0]?.font, sheet),
    fields: pageFields(sheet, own, cells, links, refRect),
  };
}

/** つながる同じ種類の線（同じ行の横線・同じ列の縦線）を1本にする */
function joinLines(list: (PvLine & {style: string})[]): PvLine[] {
  const same = (a: PvLine & {style: string}, b: PvLine & {style: string}) => a.style === b.style && a.color === b.color;
  const horiz = list.filter((l) => l.y1 === l.y2).sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const vert = list.filter((l) => l.x1 === l.x2).sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
  const out: (PvLine & {style: string})[] = [];
  for (const l of horiz) {
    const last = out[out.length - 1];
    if (last && last.y1 === last.y2 && last.y1 === l.y1 && Math.abs(last.x2 - l.x1) < 0.01 && same(last, l)) last.x2 = l.x2;
    else out.push({...l});
  }
  const start = out.length;
  for (const l of vert) {
    const last = out.length > start ? out[out.length - 1] : undefined;
    if (last && last.x1 === l.x1 && Math.abs(last.y2 - l.y1) < 0.01 && same(last, l)) last.y2 = l.y2;
    else out.push({...l});
  }
  return out.map(({style: _style, ...l}) => l);
}

/** 押すと入れられる欄：書く欄と、それを式で参照している欄。となり合う同じ項目の欄（被保険者番号の10マス）は1つに */
function pageFields(sheet: string, own: [ShinseiField, string[]][], cells: Map<string, Cell>, links: Map<string, ShinseiField>, refRect: (ref: string) => Rect | null): PvField[] {
  const refs: {field: ShinseiField; ref: string}[] = own.flatMap(([field, list]) => list.map((ref) => ({field, ref})));
  const seen = new Set(refs.map((f) => f.ref));
  for (const [key, cell] of cells) {
    const formula = /<f>([^<]*)<\/f>/.exec(cell.inner)?.[1];
    if (!formula) continue;
    const target = formulaRef(formula, sheet);
    const field = target && links.get(`${target.sheet}!${target.ref}`);
    const [r, c] = key.split(',').map(Number);
    const ref = `${colName(c)}${r}`;
    if (field && !seen.has(ref)) {
      refs.push({field, ref});
      seen.add(ref);
    }
  }
  const out: PvField[] = [];
  for (const {field, ref} of refs) {
    const rect = refRect(ref);
    if (!rect) continue;
    if (out.some((f) => f.field === field && f.x === rect.x && f.y === rect.y)) continue;
    const near = out.find((f) => f.field === field && f.y === rect.y && f.h === rect.h && (Math.abs(f.x + f.w - rect.x) < 0.5 || Math.abs(rect.x + rect.w - f.x) < 0.5));
    if (near) {
      const x = Math.min(near.x, rect.x);
      near.w = Math.max(near.x + near.w, rect.x + rect.w) - x;
      near.x = x;
    } else out.push({...rect, field, ref});
  }
  return out;
}

// ---------------------------------------------------------------- 図形（丸・かっこ・四角・線）

function readShapes(files: Files, sheetPath: string, xml: string, lay: SheetLayout, ox: number, oy: number, width: number, height: number, theme: Theme): PvShape[] {
  const rid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(xml)?.[1];
  if (!rid) return [];
  const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const rels = files[relsPath] ? strFromU8(files[relsPath]) : '';
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attrOf(r, 'Id') === rid);
  const target = rel && attrOf(rel, 'Target');
  if (!target) return [];
  const parts = sheetPath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const drawing = files[target.startsWith('/') ? target.slice(1) : parts.join('/')];
  if (!drawing) return [];
  const d = strFromU8(drawing);
  const xAt = (col: number, off: number) => {
    let x = 0;
    for (let c = 1; c <= col; c++) x += lay.colW(c);
    return x + off / EMU;
  };
  const yAt = (row: number, off: number) => {
    let y = 0;
    for (let r = 1; r <= row; r++) y += lay.rowH(r);
    return y + off / EMU;
  };
  const num = (body: string, tag: string) => Number(new RegExp(`<xdr:${tag}>(-?\\d+)</xdr:${tag}>`).exec(body)?.[1] ?? 0);
  const out: PvShape[] = [];
  for (const m of d.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g)) {
    const body = m[2];
    if (/<xdr:clientData\b[^>]*fPrintsWithSheet="0"/.test(body)) continue;
    const sp = /<xdr:(sp|cxnSp)\b[\s\S]*?<\/xdr:\1>/.exec(body)?.[0];
    if (!sp || /<xdr:cNvPr\b[^>]*hidden="1"/.test(sp)) continue;
    const prst = /<a:prstGeom prst="(\w+)"/.exec(sp)?.[1] ?? '';
    const kind: PvShape['kind'] | null =
      prst === 'ellipse' ? 'ellipse' : prst === 'rect' ? 'rect' : prst === 'roundRect' ? 'roundRect' : prst === 'bracketPair' ? 'bracketPair' : /line|Connector/i.test(prst) || sp.startsWith('<xdr:cxnSp') ? 'line' : null;
    if (!kind) continue;
    let x = 0;
    let y = 0;
    let w = 0;
    let h = 0;
    const from = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(body)?.[1];
    const to = /<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(body)?.[1];
    const ext = /<xdr:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body);
    if (from) {
      x = xAt(num(from, 'col'), num(from, 'colOff'));
      y = yAt(num(from, 'row'), num(from, 'rowOff'));
      if (to) {
        w = xAt(num(to, 'col'), num(to, 'colOff')) - x;
        h = yAt(num(to, 'row'), num(to, 'rowOff')) - y;
      } else if (ext) {
        w = Number(ext[1]) / EMU;
        h = Number(ext[2]) / EMU;
      }
    } else {
      const pos = /<xdr:pos\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(body);
      if (!pos || !ext) continue;
      [x, y, w, h] = [Number(pos[1]) / EMU, Number(pos[2]) / EMU, Number(ext[1]) / EMU, Number(ext[2]) / EMU];
    }
    x -= ox;
    y -= oy;
    if (x + w / 2 < 0 || y + h / 2 < 0 || x + w / 2 > width || y + h / 2 > height) continue;
    if (kind === 'line' ? Math.abs(w) < 0.5 && Math.abs(h) < 0.5 : w < 0.5 || h < 0.5) continue;
    const spPr = /<xdr:spPr\b[^>]*>([\s\S]*?)<\/xdr:spPr>/.exec(sp)?.[1] ?? '';
    const style = /<xdr:style>([\s\S]*?)<\/xdr:style>/.exec(sp)?.[1] ?? '';
    const ln = /<a:ln\b([^>]*)(?:\/>|>([\s\S]*?)<\/a:ln>)/.exec(spPr);
    const lnRef = /<a:lnRef idx="(\d+)"[^>]*>([\s\S]*?)<\/a:lnRef>/.exec(style);
    const fillRef = /<a:fillRef idx="(\d+)"[^>]*>([\s\S]*?)<\/a:fillRef>/.exec(style);
    const drawColor = (xmlPart: string | undefined) => {
      if (!xmlPart) return '';
      const srgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xmlPart)?.[1];
      const sys = /<a:sysClr\b[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(xmlPart)?.[1];
      const scheme = /<a:schemeClr val="(\w+)"/.exec(xmlPart)?.[1];
      const idx: Record<string, number> = {lt1: 0, bg1: 0, dk1: 1, tx1: 1, lt2: 2, bg2: 2, dk2: 3, tx2: 3, accent1: 4, accent2: 5, accent3: 6, accent4: 7, accent5: 8, accent6: 9, hlink: 10, folHlink: 11};
      const hex = srgb ?? sys ?? (scheme && theme.colors[idx[scheme] ?? 1]) ?? '';
      const shade = Number(/<a:shade val="(\d+)"/.exec(xmlPart)?.[1] ?? 100000) / 100000;
      return hex ? `#${tinted(hex, shade < 1 ? shade - 1 : 0)}` : '';
    };
    let stroke = '';
    if (ln && /<a:noFill\/>/.test(ln[2] ?? '')) stroke = '';
    else if (ln && /<a:solidFill>/.test(ln[2] ?? '')) stroke = drawColor(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(ln[2] ?? '')?.[1]);
    else if (lnRef && Number(lnRef[1]) > 0) stroke = drawColor(lnRef[2]);
    const lnW = ln && attrOf(ln[0], 'w');
    const strokeWidth = lnW ? Number(lnW) / EMU : lnRef && Number(lnRef[1]) > 0 ? (theme.lines[Number(lnRef[1]) - 1] ?? 9525) / EMU : 1;
    let fill = '';
    const own = spPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, '');
    if (/<a:noFill\/>/.test(own)) fill = '';
    else if (/<a:solidFill>/.test(own)) fill = drawColor(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(own)?.[1]);
    else if (fillRef && Number(fillRef[1]) > 0) fill = drawColor(fillRef[2]);
    const xfrm = /<a:xfrm\b([^>]*)>/.exec(spPr)?.[1] ?? '';
    const paras = [...sp.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => unesc(t[1])).join(''));
    const text = paras.join('\n').replace(/^\n+|\n+$/g, '');
    const sz = /<a:rPr\b[^>]*\ssz="(\d+)"/.exec(sp)?.[1];
    const bodyPr = /<a:bodyPr\b[^>]*>/.exec(sp)?.[0] ?? '';
    const algn = /<a:pPr\b[^>]*\salgn="(\w+)"/.exec(sp)?.[1];
    const anchor = attrOf(bodyPr, 'anchor');
    const ins = (name: string, dflt: number) => numOf(attrOf(bodyPr, name), dflt) / EMU;
    out.push({
      kind,
      x,
      y,
      w,
      h,
      stroke,
      width: strokeWidth,
      fill,
      flipH: attrOf(xfrm, 'flipH') === '1',
      flipV: attrOf(xfrm, 'flipV') === '1',
      text,
      font: text
        ? {
            family: familyOf(''),
            size: ((sz ? Number(sz) / 100 : 11) * 4) / 3,
            bold: /<a:rPr\b[^>]*\sb="1"/.test(sp),
            italic: false,
            underline: false,
            strike: false,
            color: drawColor(/<xdr:txBody>[\s\S]*?<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(sp)?.[1]) || '#000000',
          }
        : null,
      align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left',
      valign: anchor === 'ctr' ? 'center' : anchor === 'b' ? 'bottom' : 'top',
      wrap: attrOf(bodyPr, 'wrap') !== 'none',
      inset: {l: ins('lIns', 91440), t: ins('tIns', 45720), r: ins('rIns', 91440), b: ins('bIns', 45720)},
    });
  }
  return out;
}

// ---------------------------------------------------------------- ヘッダー・フッター

function headerFooter(raw: string | undefined, base: PvFont | undefined, sheetName: string): PvHeader | null {
  if (!raw) return null;
  const text = unesc(raw);
  const out: PvHeader = {left: [], center: [], right: []};
  let part: keyof PvHeader = 'center';
  let font: PvFont = {...(base ?? {family: familyOf(''), size: (11 * 4) / 3, bold: false, italic: false, underline: false, strike: false, color: '#000000'})};
  let buf = '';
  const flush = () => {
    if (buf) out[part].push({text: buf, font: {...font}});
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '&') {
      buf += ch;
      continue;
    }
    const next = text[i + 1] ?? '';
    if (next === '&') {
      buf += '&';
      i++;
    } else if (next === 'L' || next === 'C' || next === 'R') {
      flush();
      part = next === 'L' ? 'left' : next === 'C' ? 'center' : 'right';
      i++;
    } else if (next === '"') {
      flush();
      const end = text.indexOf('"', i + 2);
      const [name, styleName = ''] = text.slice(i + 2, end < 0 ? text.length : end).split(',');
      if (name && name !== '-') font = {...font, family: familyOf(name)};
      font = {...font, bold: /太字|Bold/i.test(styleName), italic: /斜体|Italic/i.test(styleName)};
      i = end < 0 ? text.length : end;
    } else if (/\d/.test(next)) {
      flush();
      const m = /^\d+/.exec(text.slice(i + 1))?.[0] ?? '';
      font = {...font, size: (Number(m) * 4) / 3};
      i += m.length;
    } else if (next === 'B' || next === 'I' || next === 'U' || next === 'S') {
      flush();
      if (next === 'B') font = {...font, bold: !font.bold};
      if (next === 'I') font = {...font, italic: !font.italic};
      if (next === 'U') font = {...font, underline: !font.underline};
      if (next === 'S') font = {...font, strike: !font.strike};
      i++;
    } else if (next === 'K') {
      flush();
      const hex = /^[0-9A-Fa-f]{6}/.exec(text.slice(i + 2))?.[0];
      if (hex) font = {...font, color: `#${hex}`};
      i += 1 + (hex?.length ?? 0);
    } else {
      buf += next === 'P' || next === 'N' ? '1' : next === 'A' ? sheetName : '';
      i++;
    }
  }
  flush();
  return out.left.length || out.center.length || out.right.length ? out : null;
}

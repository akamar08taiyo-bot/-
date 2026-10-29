// 介護保険被保険者証・介護保険負担割合証を読み取った文字から、申請書・理由書・特定福祉用具に入れる項目を取り出す
// （ユーザーの指示「介護保険証をドラッグ＆ドロップで添付したら、全ての情報、特定福祉用具、住宅改修、理由書の入力必要項目が全て入力される」
//   「介護保険番号、振り仮名、名前、認定期間、介護度…全てに転記」2026-10-22）。
// 保険証の様式は国で決まっている：（一）番号・住所・フリガナ・氏名・生年月日・性別・交付年月日・保険者番号と保険者の名称、
// （二）要介護状態区分等・認定年月日・認定の有効期間・区分支給限度基準額、（三）給付制限・居宅介護支援事業者・介護保険施設等。
// 負担割合証は 番号・氏名など と 利用者負担の割合・適用期間。
// 読み取り（tesseract.js）は字を読み違える（令和→念和・信和、0→O など）ので、ここで直してから項目の名前（ラベル）を手がかりに取り出す。
// 決まった形（番号10けた・日付・要介護1〜5）に合わないものは「たしかでない」として、画面で確かめてもらう（cardOcr.ts・CardDialog）。
// 画像・読んだ文字・取り出した値は、どこにも送らず、保存もしない（入れた値だけが様邸に残る）

import {todayIso} from './util.ts';

/** 読み取った1語（画素の位置） */
export type OcrWord = {text: string; x0: number; y0: number; x1: number; y1: number; conf?: number; chars?: {text: string; x0: number; y0: number; x1: number; y1: number}[]};
/** 読み取った1行 */
export type OcrLine = {words: OcrWord[]; doubt?: boolean}; // doubt：読めなかった字がありそう（cardRead.ts の missedStroke）
/** 読み取った1枚（画像の1ページ） */
export type OcrPage = {lines: OcrLine[]; conf?: number; source?: number}; // conf：読み取りの自信（0〜100）。source：何枚目の画像から読んだページか（cardOcr.ts）

export type CardEra = '明治' | '大正' | '昭和' | '平成';
export type CardCare = '' | '要支援1' | '要支援2' | '要介護1' | '要介護2' | '要介護3' | '要介護4' | '要介護5';
export type CardInsurer = '' | 'kanda' | 'yukuhashi' | 'miyako' | 'kouiki' | 'fukuoka' | 'kitakyushu';

/** 保険証から取り出した項目（読めなかった項目は ''） */
export type CardInfo = {
  insuredNo: string; // 被保険者番号（10けた）
  insurerNo: string; // 保険者番号（6けた）
  insurer: CardInsurer; // 保険者（保険者の名称・番号から。分からなければ ''）
  insurerName: string; // 保険者の名称（読めたまま。行橋市・苅田町・みやこ町・福岡県介護保険広域連合 など）
  kana: string; // フリガナ（全角カタカナ。姓と名の間は全角の空白）
  name: string; // 氏名（姓と名の間は全角の空白）
  zip: string; // 郵便番号 '824-0001'
  address: string; // 住所（郵便番号のうしろ）
  era: CardEra | '';
  birthY: string; // 元号の年
  birthM: string;
  birthD: string;
  gender: '' | '男' | '女';
  care: CardCare; // 要介護状態区分等
  careFrom: string; // 認定の有効期間 'YYYY-MM-DD'
  careTo: string;
  office: string; // 居宅介護支援事業者（事業所）の名称
  burden: '' | '1' | '2' | '3'; // 利用者負担の割合（負担割合証）
  burdenFrom: string; // 負担割合の適用期間 'YYYY-MM-DD'
  burdenTo: string;
};
export type CardKey = keyof CardInfo;

/** 取り出した項目と、決まった形に合わない（読み違いがあるかもしれない）項目 */
export type CardRead = {info: CardInfo; unsure: CardKey[]; kinds: ('card' | 'futan')[]};

export const NO_CARD: CardInfo = {
  insuredNo: '',
  insurerNo: '',
  insurer: '',
  insurerName: '',
  kana: '',
  name: '',
  zip: '',
  address: '',
  era: '',
  birthY: '',
  birthM: '',
  birthD: '',
  gender: '',
  care: '',
  careFrom: '',
  careTo: '',
  office: '',
  burden: '',
  burdenFrom: '',
  burdenTo: '',
};

// ---------------------------------------------------------------- 読み違いを直す

const CJK = /[々〆ぁ-ゖァ-ヺー一-鿿]/;
/** 日付の元号のうしろ（「6 年」「元年」）。元号の読み違いは、ここだけ直す */
const ERA_DATE = String.raw`(?=\s*(?:\d{1,2}|元)\s*年)`;
/**
 * 元号の読み違い（令和→念和・信和・今和・合和・令利、昭和→照和・昭利 など）。日付の中（うしろに「6 年」）だけ
 * （氏名・事業所の名前の「河合 和子」「見本 信和」「信和会」を「令和」にしない）。
 * 2字の間の空白はまたぐ（tesseract は漢字を1字ずつの語で返し、読み直した字は語の間を空白でつなぐ＝「念 和 6 年」）
 */
const ERA_FIX: [RegExp, string][] = [
  [new RegExp(`[令今念信合命]\\s*[和利知]${ERA_DATE}`, 'g'), '令和'],
  [new RegExp(`[昭照招哲晒]\\s*[和利知]${ERA_DATE}`, 'g'), '昭和'],
  [new RegExp(`平\\s*[成戌]${ERA_DATE}`, 'g'), '平成'],
  [new RegExp(`大\\s*[正止]${ERA_DATE}`, 'g'), '大正'],
  [new RegExp(`明\\s*[治冶]${ERA_DATE}`, 'g'), '明治'],
];

/** 全角半角をそろえ（半角カナも全角に）、数字のまわりの読み違い（O→0、l・I・|→1）と元号の読み違いを直す */
export function fixOcr(s: string): string {
  // 数字の間の長音・「一」は区切りの「-」（半角の「ｰ」は NFKC で「ー」になるので、そろえたあとで。「〒824ｰ0001」）
  let t = s
    .normalize('NFKC')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/(?<=\d\s?)[ー一](?=\s?\d)/g, '-');
  // 数字にはさまれた・数字のとなりの O o 〇 は 0、l I | は 1（字の中の「ロ」「口」は変えない）
  t = t.replace(/(?<=\d)[Oo〇](?=[\d\s]|$)|(?<=^|[\s\d])[Oo〇](?=\d)/g, '0').replace(/(?<=\d)[lI|](?=\d)|(?<=[\s])[lI|](?=\d{2})/g, '1');
  // 元号は数字を直したあと（うしろの「6 年」で日付と分かる）
  for (const [re, v] of ERA_FIX) t = t.replace(re, v);
  // 「1割」の 1 が ] | l に読めたとき
  t = t.replace(/(?<![\d])[\]\[|lIi!」｣丨亅](?=\s*割(?!合))/g, '1');
  return t;
}

// ---------------------------------------------------------------- 行と欄

/** 1行を、語の間が大きくあいている所で欄（表のます）に分ける */
type Cell = {text: string; x0: number; x1: number; y0: number; y1: number};
function lineCells(line: OcrLine): Cell[] {
  const ws = line.words.filter((w) => w.text.trim());
  if (ws.length === 0) return [];
  const heights = ws.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const h = Math.max(8, heights[Math.floor(heights.length / 2)]);
  const cells: Cell[] = [];
  let cur: Cell = {text: ws[0].text, x0: ws[0].x0, x1: ws[0].x1, y0: ws[0].y0, y1: ws[0].y1};
  for (const w of ws.slice(1)) {
    if (w.x0 - cur.x1 > h * 1.8) {
      cells.push(cur);
      cur = {text: w.text, x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1};
    } else {
      // 日本語の語の間は、間があいていなければ空白を入れない（氏名の姓と名の間・「令和 6年」の数字のまわりは空白）
      const sp = CJK.test(cur.text.slice(-1)) && CJK.test(w.text[0]) && w.x0 - cur.x1 < h * 0.45 ? '' : ' ';
      cur = {text: cur.text + sp + w.text, x0: cur.x0, x1: w.x1, y0: Math.min(cur.y0, w.y0), y1: Math.max(cur.y1, w.y1)};
    }
  }
  cells.push(cur);
  return cells.map((c) => ({...c, text: fixOcr(c.text)}));
}

type Row = {text: string; cells: Cell[]; y0: number; y1: number; words: OcrWord[]; doubt: boolean};

/** 行ごとの文字（欄の区切りはタブ。読み違いは直したもの。テスト・確かめ用） */
export function rowsOf(page: OcrPage): Row[] {
  return page.lines
    .map((l) => {
      const words = l.words.filter((w) => w.text.trim());
      const cells = lineCells(l);
      const ys = words.map((w) => [w.y0, w.y1]);
      return {text: cells.map((c) => c.text).join('\t'), cells, y0: Math.min(...ys.map((y) => y[0])), y1: Math.max(...ys.map((y) => y[1])), words, doubt: !!l.doubt};
    })
    .filter((r) => r.cells.length > 0);
}

// ---------------------------------------------------------------- 位置から（ラベルが読めないとき）

type Char = {c: string; x0: number; y0: number; x1: number; y1: number};
/** 行の字と位置（字ごとの位置がなければ、語の幅を字の数で割る）。字は1字ずつ NFKC */
function charsOf(words: OcrWord[]): Char[] {
  const out: Char[] = [];
  for (const w of words) {
    const cs = w.chars?.length ? w.chars : [...w.text].map((c, i, all) => ({text: c, x0: w.x0 + ((w.x1 - w.x0) * i) / all.length, x1: w.x0 + ((w.x1 - w.x0) * (i + 1)) / all.length, y0: w.y0, y1: w.y1}));
    for (const c of cs) for (const ch of c.text.normalize('NFKC')) if (ch.trim()) out.push({c: ch, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1});
  }
  return out;
}
const boxOf = (cs: Char[]) => ({x0: Math.min(...cs.map((c) => c.x0)), y0: Math.min(...cs.map((c) => c.y0)), x1: Math.max(...cs.map((c) => c.x1)), y1: Math.max(...cs.map((c) => c.y1))});
const textOf = (cs: Char[], lh: number) => cs.map((c, i) => (i > 0 && c.x0 - cs[i - 1].x1 > lh * 0.45 ? ' ' : '') + c.c).join('');

export type ValueKey = 'number' | 'zip' | 'address' | 'kana' | 'name' | 'birth' | 'gender';
/** 位置から見つけた値の行（字の高さ lh・値の欄の左の x・値ごとの字と範囲） */
export type Located = {
  lh: number;
  valueX: number;
  // room：上下のとなりの行との間（切り出すときに、となりの行の字を入れない）
  values: Partial<Record<ValueKey, {text: string; box: {x0: number; y0: number; x1: number; y1: number}; room: {y0: number; y1: number}}>>;
};

const BIRTH_START = /(明治|大正|昭和|平成)\s*(\d{1,2}|元)\s*年/g;

/**
 * 保険証の（一）の面は、値の欄の左がそろっている（番号・〒と住所・フリガナ・氏名・生年月日）。ラベルが読めなくても、
 * 生年月日（明治〜平成の日付は保険証にこれだけ）の行を手がかりに、その左の位置から始まる行を上へたどる：
 * すぐ上が氏名、その上がフリガナ、その上が住所（〒の行とその下）、その上が番号。性別は生年月日の行の右の「男」「女」
 */
export function locateValues(page: OcrPage, today = todayIso()): Located | null {
  const rows = page.lines
    .map((l) => ({chars: charsOf(l.words)}))
    .filter((r) => r.chars.length > 0)
    .map((r) => ({...r, ...boxOf(r.chars)}))
    .sort((a, b) => a.y0 - b.y0);
  let birth: (typeof rows)[number] | undefined;
  let start = -1;
  for (const r of rows) {
    const t = fixOcr(r.chars.map((c) => c.c).join(''));
    // 生年月日のラベルのすぐうしろの日付か、年齢としてありうる日付（古い保険証の（二）の面の認定年月日「平成30年3月1日」を手がかりにしない）
    const m = [...t.matchAll(BIRTH_START)].find((x) => /生年月日.{0,3}$/.test(t.slice(0, x.index)) || plausibleBirth(x[1], x[2], today));
    if (!m) continue;
    // 直したあとの字の位置は、もとの字の位置とほぼ同じ（元号の2字は2字のまま）
    start = Math.min(m.index ?? 0, r.chars.length - 1);
    birth = r;
    break;
  }
  if (!birth) return null;
  const hs = birth.chars.map((c) => c.y1 - c.y0).sort((a, b) => a - b);
  const lh = Math.max(8, hs[Math.floor(hs.length / 2)]);
  const valueX = birth.chars[start].x0;
  /** 行の中の、値の欄の字（左の位置から、大きな間があくまで） */
  const valueChars = (r: (typeof rows)[number]) => {
    const cs = r.chars.filter((c) => c.x0 >= valueX - lh * 0.6);
    const out: Char[] = [];
    for (const c of cs) {
      if (out.length && c.x0 - out[out.length - 1].x1 > lh * 2.2) break;
      out.push(c);
    }
    return out.length && out[0].x0 < valueX + lh * 1.5 ? out : [];
  };
  const values: Located['values'] = {};
  const put = (k: ValueKey, cs: Char[]) => {
    if (!cs.length) return;
    const box = boxOf(cs);
    // 上下のとなりの行（左右が重なる行）の字の端まで
    const others = rows.flatMap((r) => r.chars).filter((c) => c.x1 > box.x0 && c.x0 < box.x1 && !cs.includes(c));
    const up = Math.max(box.y0 - lh, ...others.filter((c) => c.y1 <= box.y0 + 2).map((c) => c.y1));
    const down = Math.min(box.y1 + lh, ...others.filter((c) => c.y0 >= box.y1 - 2).map((c) => c.y0));
    values[k] = {text: fixOcr(textOf(cs, lh)), box, room: {y0: (up + box.y0) / 2, y1: (down + box.y1) / 2}};
  };
  const bc = valueChars(birth);
  // 生年月日の欄は日付まで（性別のますは別）
  const dayEnd = bc.findIndex((c, i) => c.c === '日' && i > 4);
  put('birth', dayEnd > 0 ? bc.slice(0, dayEnd + 1) : bc);
  // 性別：同じ高さの「男」「女」（別の行に読めることもある）で、生年月日より右
  const cy = (birth.y0 + birth.y1) / 2;
  const g = rows.flatMap((r) => r.chars).find((c) => /[男女]/.test(c.c) && Math.abs((c.y0 + c.y1) / 2 - cy) < lh * 0.8 && c.x0 > valueX + lh * 4);
  if (g) put('gender', [g]);
  // 上へたどる（生年月日より上で、値の欄の左から始まる行）。行の高さは値の欄の字で見る
  // （ほかの面の字と1行につながって読めた行は、行全体の高さが値の行とずれるため）
  const by = boxOf(bc.length ? bc : birth.chars);
  const cand = rows
    .filter((r) => r !== birth)
    .map((r) => ({r, cs: valueChars(r)}))
    .filter((x) => x.cs.length > 0)
    .map((x) => ({...x, b: boxOf(x.cs)}))
    .filter((x) => x.b.y1 <= by.y0 + lh * 0.3 && x.b.y0 >= by.y0 - lh * 14)
    .sort((a, b) => b.b.y0 - a.b.y0);
  const txt = (cs: Char[]) => fixOcr(cs.map((c) => c.c).join(''));
  let i = 0;
  const nameAt = cand.findIndex((x) => /[一-鿿々ぁ-ゖァ-ヺ]{1,}.*[一-鿿々ぁ-ゖァ-ヺ]/.test(txt(x.cs)) && !/\d|〒|フリ|ガナ|年月日/.test(txt(x.cs)));
  if (nameAt >= 0 && by.y0 - cand[nameAt].b.y1 < lh * 3.5) {
    put('name', cand[nameAt].cs);
    i = nameAt + 1;
    const k = cand[i];
    if (k && cand[nameAt].b.y0 - k.b.y1 < lh * 3.5 && !/\d|〒/.test(txt(k.cs))) {
      put('kana', k.cs);
      i++;
    }
  }
  for (; i < cand.length; i++) {
    const t = txt(cand[i].cs);
    if (!values.zip && /\d{3}\s*-\s*\d{4}/.test(t)) {
      put('zip', cand[i].cs);
      // 住所は〒の行のうしろ、または〒の行の下（たどっている向きでは1つ前）
      const below = cand[i - 1];
      if (!/[市町村郡]/.test(t.replace(/.*\d{3}\s*-\s*\d{4}/, '')) && below && !values.kana?.text.includes(txt(below.cs)) && below.r !== cand[nameAt]?.r) put('address', below.cs);
      continue;
    }
    if (values.zip && !values.number && digitsOf(t).length >= 8) {
      put('number', cand[i].cs);
      break;
    }
  }
  if (!values.number) {
    const n = cand.find((x) => digitsOf(txt(x.cs)).length >= 8 && !/[年月日〒-]/.test(txt(x.cs)));
    if (n) put('number', n.cs);
  }
  return {lh, valueX, values};
}

// ---------------------------------------------------------------- 項目ごと

const DATE = String.raw`(令和|平成|昭和)\s*(\d{1,2}|元)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?`;
const ERA_BASE: Record<string, number> = {明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018};

/** 元号の最初の日と最後の日（この間にない日付＝昭和73年・令和元年4月1日・令和0年などは読み違い） */
const ERA_SPAN: Record<string, [string, string]> = {
  明治: ['1868-01-01', '1912-07-29'],
  大正: ['1912-07-30', '1926-12-24'],
  昭和: ['1926-12-25', '1989-01-07'],
  平成: ['1989-01-08', '2019-04-30'],
  令和: ['2019-05-01', '9999-12-31'],
};

/** 和暦 → 'YYYY-MM-DD'（ない日付は ''） */
export function warekiIso(era: string, y: string, m: string, d: string): string {
  const base = ERA_BASE[era];
  if (base === undefined) return '';
  const n = y === '元' ? 1 : Number(y);
  if (!(n >= 1)) return '';
  const year = base + n;
  const mm = Number(m);
  const dd = Number(d);
  const at = new Date(year, mm - 1, dd);
  if (!(mm >= 1 && mm <= 12) || at.getMonth() !== mm - 1 || at.getDate() !== dd) return '';
  const iso = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const [start, end] = ERA_SPAN[era];
  return iso >= start && iso <= end ? iso : '';
}

/**
 * 生年月日として、ありうるか：今年で 39〜125 歳（介護保険の被保険者は40歳から）。認定年月日・交付年月日（平成12年から）は生年月日にならない
 * （古い保険証の「平成30年3月1日」を生年月日にしない）
 */
export function plausibleBirth(era: string, y: string, today: string): boolean {
  const base = ERA_BASE[era];
  if (base === undefined) return false;
  const age = Number(today.slice(0, 4)) - base - (y === '元' ? 1 : Number(y));
  return age >= 39 && age <= 125;
}

/**
 * 認定の有効期間として、ありうるか：おわりは月の末日（有効期間は月の末日まで）、長さは3か月〜4年（48か月）。
 * 読み違えた日付（区分支給限度基準額の欄・斜線で消した跡などで）を入れないため
 */
export function plausibleTerm(from: string, to: string): boolean {
  if (!from || !to || from >= to) return false;
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const monthEnd = new Date(y2, m2, 0).getDate() === d2;
  const months = (y2 - y1) * 12 + (m2 - m1) + 1;
  return monthEnd && months >= 3 && months <= 49;
}

/** 文字の中の数字だけ（空白・区切りを除く） */
const digitsOf = (s: string) => s.replace(/[^\d]/g, '');
/** 空白をつめる（「行 橋 市」→「行橋市」） */
const squeeze = (s: string) => s.replace(/\s+/g, '');

const INSURER_NAMES: [RegExp, CardInsurer, string][] = [
  [/広域連合|豊築/, 'kouiki', '福岡県介護保険広域連合'],
  [/苅田町|刈田町/, 'kanda', '苅田町'],
  [/行橋市|行橋/, 'yukuhashi', '行橋市'],
  [/みやこ町/, 'miyako', 'みやこ町'],
  [/豊前市|築上町|上毛町|吉富町/, 'kouiki', '福岡県介護保険広域連合'],
  [/福岡市/, 'fukuoka', '福岡市'],
  [/北九州市/, 'kitakyushu', '北九州市'],
];

/** 保険者の名称から保険者（広域連合の市町は広域連合） */
export function insurerOfName(name: string): {insurer: CardInsurer; name: string} {
  const t = squeeze(name.normalize('NFKC'));
  for (const [re, insurer, label] of INSURER_NAMES) if (re.test(t)) return {insurer, name: label};
  return {insurer: '', name: ''};
}

const CARE_NUM: Record<string, string> = {'1': '1', '2': '2', '3': '3', '4': '4', '5': '5', 一: '1', 二: '2', 三: '3', 四: '4', 五: '5'};

/**
 * 行の欄（タブで分けた字）と、ラベルのある欄の番号。ラベルの字が2つの欄に分かれて読めたとき（「住」と「所」の間があいた）は、その2つを1つの欄にする。
 * 見つからなければ at は -1（行の字全体ではラベルに合っても、欄の中にはない）
 */
function labelCells(text: string, label: RegExp): {cells: string[]; at: number} {
  const cells = text.split('\t');
  let at = cells.findIndex((c) => label.test(c));
  if (at < 0) {
    at = cells.findIndex((c, i) => i + 1 < cells.length && label.test(`${c} ${cells[i + 1]}`));
    if (at >= 0) cells.splice(at, 2, `${cells[at]} ${cells[at + 1]}`);
  }
  return {cells, at};
}

/** 氏名・フリガナの値：ラベル（氏名・フリガナ・被保険者の字）とごみを除き、姓と名の間を全角の空白1つに */
function personName(raw: string, kana: boolean): string {
  const t = raw
    // 被保険者の字は、1字だけ離れているときだけラベル（「保坂 花子」の「保」は名前）
    .replace(/フ\s*リ\s*[ガカ]\s*ナ|氏\s*名|^\s*(?:[被保険者](?:\s+|$))+/g, ' ')
    .replace(kana ? /[^ァ-ヺー\s]/g : /[^々〆ぁ-ゖァ-ヺー一-鿿\s]/g, ' ')
    .replace(/様$/, '')
    .trim();
  const parts = t.split(/\s+/).filter((p) => p.length > 0 && !(kana ? false : /^[被保険者]$/.test(p)));
  return parts.join('　');
}

// ---------------------------------------------------------------- 居宅介護支援事業者

/**
 * 居宅介護支援事業者の欄の名前と届出年月日（ISO。読めなければ ''）と欄の位置。
 * 事業所を替えると、下のますに次の事業所と届出年月日が書かれる（ますは3つ。名前の下か右に「届出年月日」）
 */
export type OfficeEntry = {name: string; date: string; x0: number; x1: number; y0: number; y1: number; dateBox: {x0: number; x1: number; y0: number; y1: number} | null}; // dateBox：届出年月日の欄（読めなかったときも）

const OFFICE_LABEL = /居宅介護|援事業者|介護予防|事業所の|及びその|居宅介護支援事業者/;
const OFFICE_LABEL_TEXT = '居宅介護支援事業者又は介護予防支援事業者及びその事業所の名称';
/** ラベルにしかない言葉（名前の「〜居宅介護支援事業所」とまちがえない） */
const OFFICE_LABEL_STRONG = /居宅介護支援事業者|事業者又|又は介護|介護予防|及びその|の名称/;
const OFFICE_WORD = /(センター|事業所|ケア|プラン|支援|居宅|介護|ステーション|サービス|苑|園|会)/;
const OFFICE_END = /(センター|事業所|ステーション|ケアプラン|支援室|相談所)$/;
const TODOKE = /届\s*出\s*年\s*月\s*日/;
/** 届出年月日でない日付（給付制限の開始・終了、介護保険施設の入所・退所） */
const NOT_TODOKE = /開始|終了|入所|退所|認定|有効|交付|適用/;
/** ここから下は介護保険施設の欄 */
const OFFICE_STOP = /介護保険施設|入所|退所/;

/**
 * 居宅介護支援事業者の欄の名前（上から順に）。ラベルが読めればラベルの行の上下（ラベルはますの縦のまん中にある）の、
 * ラベルから右の欄。読めなければ「〜センター」「〜事業所」などで終わる欄から下。
 * 届出年月日は、すぐ上（または同じ欄の左）の名前のもの
 */
function officesOf(byY: Row[], kind: 'card' | 'futan' | null, useLabel = true): OfficeEntry[] {
  const hs = byY.map((r) => r.y1 - r.y0).sort((a, b) => a - b);
  const lh = Math.max(8, hs[Math.floor(hs.length / 2)] ?? 20);
  // ラベルの欄：ラベルだけの言葉（「事業者又は」「及びその」など）か、居宅介護などで始まって事業所の名前の形で終わらない欄（「〜居宅介護支援事業所」は名前）
  const isLabel = (c: Cell) => {
    const t = squeeze(c.text);
    return OFFICE_LABEL_STRONG.test(t) || (OFFICE_LABEL.test(t) && !OFFICE_END.test(t));
  };
  const labelRow = useLabel ? byY.find((r) => r.cells.some(isLabel)) : undefined;
  const labelCell = labelRow?.cells.find(isLabel);
  const nameOf = (raw: string): string => {
    const t = squeeze(raw);
    if (labelCell) {
      // ラベルと同じ欄に読めたとき（間があいていない）は、ラベルの字を除いた残り
      const n = t.replace(/^.*(?:居宅介護支援事業者|介護予防支援事業者|事業所の名称|名称|事業所の|及びその事業所の)/, '');
      // ラベルの字（の切れはし）は名前にしない。「〜居宅介護支援事業所」のような名前は取る
      const label = OFFICE_LABEL_TEXT.includes(n) || (OFFICE_LABEL.test(n) && !OFFICE_END.test(n));
      return n.length >= 3 && n.length <= 30 && !label && OFFICE_WORD.test(n) && !/届出|年月日|及び|その|名称|又は/.test(n) ? n.replace(/[^々〆ぁ-ゖァ-ヺー一-鿿A-Za-z0-9・]/g, '') : '';
    }
    return OFFICE_END.test(t) && t.length >= 4 && t.length <= 30 && !/年月日|区分|基準|種類|及び|その|名称|又は|予防/.test(t)
      ? t.replace(/^[^一-鿿々ぁ-ゖァ-ヺA-Za-z]*/, '').replace(/[^々〆ぁ-ゖァ-ヺー一-鿿A-Za-z0-9・]/g, '')
      : '';
  };
  let left: number;
  let top: number;
  if (labelRow && labelCell) {
    left = labelCell.x0 - lh;
    top = labelRow.y0 - lh * 4;
  } else {
    if (kind === 'futan') return [];
    const first = byY.flatMap((r) => r.cells).find((c) => nameOf(c.text.split(TODOKE)[0]));
    if (!first) return [];
    left = first.x0 - lh * 3;
    top = first.y0 - lh * 0.5;
  }
  const wordsOf = (r: Row, c: Cell) => r.words.filter((w) => w.x0 >= c.x0 - 1 && w.x1 <= c.x1 + 1);
  // 名前の列の左：ラベルの列の字（読み違えた切れはし）が名前の前に付いて1つの欄に読めることがあるので、
  // ラベルの列より右の「届出年月日」の字の左（名前のうしろに続く届出年月日は数えない）から右の語だけで名前を読む
  let valueX: number | null = null;
  if (labelCell) {
    const xs: number[] = [];
    for (const r of byY) {
      if (r.y1 < top || r.y0 > (labelRow?.y1 ?? 0) + lh * 12) continue;
      for (const c of r.cells.filter((x) => x.x1 > left)) {
        const ws = wordsOf(r, c);
        const i = ws.findIndex((w) => /届|出年月日/.test(w.text));
        if (i >= 0 && ws[i].x0 > labelCell.x0 + lh && !nameOf(ws.slice(0, i).map((w) => w.text).join(''))) xs.push(ws[i].x0);
      }
    }
    xs.sort((a, b) => a - b);
    if (xs.length) valueX = xs[Math.floor(xs.length / 2)];
  }
  const cutAt = (t: string) => {
    const tm = TODOKE.exec(t);
    const dm = new RegExp(DATE).exec(t);
    return tm ? tm.index : dm ? dm.index : t.length;
  };
  const out: OfficeEntry[] = [];
  for (const r of byY) {
    if (r.y1 < top) continue;
    const cells = r.cells.filter((c) => c.x1 > left);
    if (cells.some((c) => OFFICE_STOP.test(squeeze(c.text)))) break;
    const last = out[out.length - 1];
    if (last && r.y0 - Math.max(last.y1, last.dateBox?.y1 ?? 0) > lh * 8) break;
    if (!last && labelRow && r.y0 > labelRow.y1 + lh * 8) break;
    for (const c of cells) {
      // 名前（名前の列の語だけ）と届出年月日（欄の字のまま。届出年月日・日付から右）
      const kept = valueX === null ? wordsOf(r, c) : wordsOf(r, c).filter((w) => w.x0 >= valueX - lh * 0.6);
      const kt = kept.length ? lineCells({words: kept}).map((x) => x.text).join(' ') : '';
      const name = kt ? nameOf(kt.slice(0, cutAt(kt))) : '';
      if (name) out.push({name, date: '', x0: Math.min(...kept.map((w) => w.x0)), x1: c.x1, y0: c.y0, y1: c.y1, dateBox: null});
      const datePart = c.text.slice(cutAt(c.text));
      const e = out[out.length - 1];
      if (!e || e.date || NOT_TODOKE.test(squeeze(datePart)) || !(c.y0 >= e.y0 - lh * 0.5 && c.y0 - e.y1 < lh * 4 && c.x1 > e.x0 - lh * 3)) continue;
      const m = new RegExp(DATE).exec(datePart);
      const iso = m ? warekiIso(m[1], m[2], m[3], m[4]) : '';
      // 日付の字が欠けて読めなかったとき（「令和 6 年 4 月日」）も、届出年月日の所は覚えておく（cardRead.ts がその行だけ読み直す）
      if (iso || (!e.dateBox && /届|出年月/.test(datePart))) e.dateBox = {x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1};
      if (iso) e.date = iso;
    }
  }
  // ラベルのまわりに名前が読めなければ、ラベルなしで（「〜センター」などで終わる欄から）
  if (!out.length && labelCell) return officesOf(byY, kind, false);
  return out;
}

const FUTAN_WORDS = /負担割合証|利用者負担の割合|利用者負担|適用期間/;
const CARD_WORDS = /被保険者証|要介護状態|要介護|認定の有効|有効期間|居宅介護支援|区分支給/;
/** 被保険者証にしかない字（切り出して読んだページに付けるラベルの「認定の有効期間」「居宅介護支援事業者」は、負担割合証の行にも付くことがあるので入れない） */
const CARD_ONLY = /被保険者証|要介護|認定年月日|区分支給/;
type CardKind = 'card' | 'futan';
/** ページに写っているもの（空白をつめた字から）。A4 に被保険者証と負担割合証を並べたスキャンは両方 */
function kindsOf(flat: string): CardKind[] {
  if (FUTAN_WORDS.test(flat)) return CARD_ONLY.test(flat) ? ['card', 'futan'] : ['futan'];
  return CARD_WORDS.test(flat) ? ['card'] : [];
}
/** 負担割合証だけのページ */
const futanOnly = (kinds: CardKind[]) => kinds.includes('futan') && !kinds.includes('card');

/** 読んだページの居宅介護支援事業者の欄（上から順に） */
export function officeEntries(page: OcrPage): OfficeEntry[] {
  const rows = rowsOf(page).sort((a, b) => a.y0 - b.y0);
  const flat = squeeze(rows.map((r) => r.text).join(''));
  return officesOf(rows, futanOnly(kindsOf(flat)) ? 'futan' : 'card');
}

/**
 * いま担当の居宅介護支援事業者：届出年月日がいちばん新しいもの（ユーザーの指示「一番最新の届け出…直近の令和8年4月1日に担当している…」）。
 * 届出年月日が読めなければ、いちばん下（ますは上から順に書かれる）
 */
export function latestOffice(entries: OfficeEntry[]): OfficeEntry | undefined {
  const dated = entries.filter((e) => e.date);
  if (dated.length) return dated.reduce((a, b) => (b.date >= a.date ? b : a));
  return entries[entries.length - 1];
}

/** ページ1枚から取り出す（読めた項目だけ） */
function parsePage(page: OcrPage, today: string): {info: Partial<CardInfo>; unsure: Set<CardKey>; weak: Set<CardKey>; doubt: Set<CardKey>; kinds: CardKind[]; conf: Partial<Record<CardKey, number>>; offices: OfficeEntry[]} {
  const rows = rowsOf(page);
  const all = rows.map((r) => r.text).join('\n');
  const flat = squeeze(all);
  const info: Partial<CardInfo> = {};
  const unsure = new Set<CardKey>();
  // 読めなかった字がありそうな値（同じ値をほかで形どおりに読めても、確かめてもらう）
  const doubtKeys = new Set<CardKey>();
  const kinds = kindsOf(flat);
  const kind = futanOnly(kinds) ? 'futan' : kinds.length ? 'card' : null;

  // 被保険者番号：「番号」の行の10けた（数字の間の空白はつめる）。なければ、どこかの10けた
  const noRow = rows.find((r) => /番\s*号/.test(r.text) && !/保険者番号/.test(squeeze(r.text)) && /\d{4}/.test(r.text));
  // 数字の間の空白（1つ）はつめる。行をまたいだ数字はつながない
  const ten = (s: string) => /(?<![\d-])(\d(?: ?\d){9})(?![\d-])/.exec(s)?.[1];
  const no = (noRow && ten(noRow.text.replace(/.*?番\s*号/, ''))) ?? ten(all);
  if (no) info.insuredNo = digitsOf(no);
  else if (noRow) {
    const d = digitsOf(noRow.text.replace(/.*?番\s*号/, '').split('\t')[0]);
    if (d.length >= 8 && d.length <= 11) {
      info.insuredNo = d;
      unsure.add('insuredNo');
    }
  }

  // 郵便番号と住所：「〒」のうしろ（〒が読めなくても、3けた-4けたは保険証では郵便番号だけ）。
  // 住所は同じ欄の続き、なければ下の行（字の高さ3つ分まで）の、郵便番号と同じくらいの左の位置から始まる欄
  const byY = [...rows].sort((a, b) => a.y0 - b.y0);
  for (const r of byY) {
    if (info.zip) break;
    for (const c of r.cells) {
      const m = /(?<![\d-])(\d{3})\s*-\s*(\d{4})(?![\d-])/.exec(c.text);
      if (!m) continue;
      info.zip = `${m[1]}-${m[2]}`;
      // 高さは欄で見る（ほかの面の字と1行につながった行は、行全体の高さがずれる）
      const lh = Math.max(8, c.y1 - c.y0);
      const rest = c.text.slice(m.index + m[0].length).trim();
      const isAddr = (t: string) => /[市町村郡]|丁目|番地/.test(t) && squeeze(t).replace(/[^一-鿿々ぁ-ゖァ-ヺ]/g, '').length >= 3;
      let addr = isAddr(rest) ? rest : '';
      const zipX = c.x0 + ((c.x1 - c.x0) * m.index) / Math.max(1, c.text.length) - lh * 2;
      const inColumn = (cc: Cell) => cc.x1 > zipX && cc.x0 < zipX + lh * 6;
      let line: Cell | null = addr ? c : null; // 住所の1行目の欄
      if (!addr) {
        const below = byY.flatMap((x) => x.cells).filter((cc) => cc !== c && cc.y0 >= c.y0 + lh * 0.5 && cc.y0 <= c.y1 + lh * 3).sort((a, b) => a.y0 - b.y0);
        for (const cc of below) {
          const cand = inColumn(cc) && isAddr(cc.text) ? cc : null;
          if (cand) {
            addr = cand.text;
            line = cand;
            break;
          }
        }
      }
      // 2行目から（「見本ハイツ 101 号」など）：すぐ下の行の、同じ列から始まる欄を、次の項目のラベル（フリガナ・氏名…）の前まで。
      // 番地・部屋の番号のない行（ラベルの読めなかったフリガナ・氏名の行）と日付の行は入れない
      const lines = addr ? [addr] : [];
      for (let prev = line; prev && lines.length < 3; ) {
        const p0 = prev;
        const next = byY
          .flatMap((x) => x.cells)
          .filter((cc) => cc.y0 >= p0.y0 + lh * 0.5 && cc.y0 <= p0.y1 + lh * 1.5 && (p0 === c ? inColumn(cc) : Math.abs(cc.x0 - p0.x0) < lh * 2))
          .sort((a, b) => a.y0 - b.y0)[0];
        const ok =
          next && !/フ\s*リ|氏\s*名|生\s*年|性\s*別|交\s*付|番\s*号|保険者/.test(next.text) && /\d|号|棟|階|室|丁目|番地/.test(next.text) && !/年\s*\d{1,2}\s*月/.test(next.text);
        if (!ok) break;
        lines.push(next.text);
        prev = next;
      }
      if (addr) {
        // 住所の字の間の空白はつめる（「1 番 1 号」→「1番1号」）。ラベルの字（住所・被・保・険・者）を除く。行の間は全角の空白
        info.address = [squeeze(addr.replace(/住\s*所/, '').replace(/^[被保険者]\s+/, '')).replace(/^[^一-鿿ぁ-ヿ]+/, ''), ...lines.slice(1).map(squeeze)].join('　');
        if (!/[市町村郡]/.test(info.address)) unsure.add('address');
      }
      break;
    }
  }

  // 住所のラベルの行（負担割合証には郵便番号がない）
  if (!info.address) {
    const r = byY.find((x) => /住\s*所/.test(x.text));
    if (r) {
      const {cells, at} = labelCells(r.text, /住\s*所/);
      const rest = at < 0 ? '' : squeeze(cells[at].replace(/.*?住\s*所/, '')) || squeeze(cells[at + 1] ?? '');
      const addr = rest.replace(/^〒?\d{3}-?\d{4}/, '').replace(/^[^一-鿿ぁ-ヿ]+/, '');
      if (/[市町村郡]/.test(addr) && addr.length >= 4) {
        info.address = addr;
        unsure.add('address');
      }
    }
  }

  // フリガナ・氏名：ラベルの行（負担割合証は「フリガナ／氏名」が1つの欄で、値は2行）
  const kanaRow = rows.findIndex((r) => /フ\s*リ\s*[ガカ]\s*ナ/.test(r.text));
  if (kanaRow >= 0) {
    // ラベルのある欄の残り（なければ次の欄）。ほかの面の欄は入れない
    const cellAfter = (text: string, label: RegExp) => {
      const {cells, at} = labelCells(text, label);
      if (at < 0) return '';
      const rest = cells[at].replace(new RegExp('.*?' + label.source), '').trim();
      return rest || cells[at + 1] || '';
    };
    const k = personName(cellAfter(rows[kanaRow].text, /フ\s*リ\s*[ガカ]\s*ナ/), true);
    if (k.replace(/　/g, '').length >= 2) info.kana = k;
  }
  const NAME_LABEL = /[氏民岳氐]\s*名(?!称)/;
  const nameRow = rows.findIndex((r) => NAME_LABEL.test(r.text) && !/名称/.test(r.text));
  if (nameRow >= 0) {
    const {cells, at} = labelCells(rows[nameRow].text, NAME_LABEL);
    const rest = at < 0 ? '' : cells[at].replace(new RegExp('.*?' + NAME_LABEL.source), '').trim();
    const n = at < 0 ? '' : personName((rest || cells[at + 1] || '').split(/(?=生年月日)/)[0], false);
    if (n.replace(/　/g, '').length >= 2) info.name = n;
    else if (kanaRow >= 0 && nameRow === kanaRow && rows[nameRow + 1]) {
      const n2 = personName(rows[nameRow + 1].text, false);
      if (n2.replace(/　/g, '').length >= 2) info.name = n2;
    }
  }
  if (info.name && info.name.replace(/　/g, '').length < 2) delete info.name;

  // 生年月日（明治・大正・昭和・平成）と性別（同じ行の「男」「女」）。ラベルのある行（ラベルのうしろの日付）、なければ年齢としてありうる日付の行
  // （古い保険証の（二）の面の認定年月日「平成30年3月1日」を生年月日にしない）
  const birthRe = /(明治|大正|昭和|平成)\s*(\d{1,2}|元)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/g;
  const BIRTH_LABEL = /生\s*年\s*月\s*日/;
  const birthIn = (r: Row) => {
    const at = r.text.search(BIRTH_LABEL);
    const t = at >= 0 ? r.text.slice(at) : r.text;
    const ms = [...t.matchAll(birthRe)];
    const m = ms.find((x) => plausibleBirth(x[1], x[2], today)) ?? ms[0];
    return m ? {t, m, ok: plausibleBirth(m[1], m[2], today)} : null;
  };
  const labeled = rows.filter((r) => BIRTH_LABEL.test(r.text) && birthIn(r));
  const birthRow = labeled.find((r) => birthIn(r)?.ok) ?? labeled[0] ?? rows.find((r) => birthIn(r)?.ok);
  const birth = birthRow && birthIn(birthRow);
  if (birthRow && birth) {
    const {t, m} = birth;
    if (warekiIso(m[1], m[2], m[3], m[4])) {
      if (birthRow.doubt) for (const k of ['era', 'birthY', 'birthM', 'birthD'] as const) doubtKeys.add(k);
      // ラベルの行でも、年齢としてありえない日付（昭和を平成と読み違えた など）は、たしかでない
      if (!birth.ok) for (const k of ['era', 'birthY', 'birthM', 'birthD'] as const) unsure.add(k);
      info.era = m[1] as CardEra;
      info.birthY = m[2] === '元' ? '1' : String(Number(m[2]));
      info.birthM = String(Number(m[3]));
      info.birthD = String(Number(m[4]));
    }
    const after = t.slice((m.index ?? 0) + m[0].length);
    const g = /男|女/.exec(after) ?? /男|女/.exec(birthRow.text.replace(/生\s*年\s*月\s*日/, ''));
    if (g) info.gender = g[0] as '男' | '女';
  }

  // 要介護状態区分等（「要介護状態区分等」のラベルの字は数字が続かないので取らない）
  // 数字の 1 が l・I・| に読めたときも（斜線の消し跡などで）。たしかでないことにする
  const careM = /要\s*(支\s*援|介\s*護)\s*([1-5一二三四五lI|])(?![\d年])/.exec(all.replace(/要介護状態区分等?/g, ''));
  if (careM) {
    const kindName = squeeze(careM[1]);
    const n = CARE_NUM[careM[2]] ?? '1';
    if (!CARE_NUM[careM[2]]) unsure.add('care');
    if (kindName === '支援' && Number(n) > 2) unsure.add('care');
    else info.care = `要${kindName}${n}` as CardCare;
  }
  if (!info.care && /経過的要介護/.test(flat)) unsure.add('care');

  // 認定の有効期間（「有効期間」の行の日付〜日付。なければ最初の日付〜日付＝区分支給限度基準額の期間で、ふつうは同じ）
  // 間の「～」は読めなかったり「へ」「-」に読めたりする
  const rangeRe = new RegExp(`${DATE}\\s*[^\\d年月日]{0,3}?\\s*${DATE}`);
  // ラベルは「認定の有効／期間」と折り返したり、「有効」が「海効」と読めたりするので、上下の行も見る
  const termLabel = /[有海]\s*効|有\s*効\s*期\s*間|効\s*期\s*間/;
  const ranges = byY
    .map((r, i) => {
      const m = rangeRe.exec(r.text);
      if (!m || /適用/.test(r.text)) return null;
      const from = warekiIso(m[1], m[2], m[3], m[4]);
      const to = warekiIso(m[5], m[6], m[7], m[8]);
      const near = [byY[i - 1], r, byY[i + 1]].some((x) => x && termLabel.test(x.text) && Math.abs(x.y0 - r.y0) < (r.y1 - r.y0) * 2.5);
      return from && to && plausibleTerm(from, to) ? {from, to, near, doubt: r.doubt} : null;
    })
    .filter((x): x is {from: string; to: string; near: boolean; doubt: boolean} => !!x);
  const term = ranges.find((x) => x.near) ?? ranges[0];
  if (term && kind !== 'futan') {
    info.careFrom = term.from;
    info.careTo = term.to;
    // ラベルの近くでなくても、同じ期間が2つ（区分支給限度基準額の期間）あれば、たしか
    const same = ranges.filter((x) => x.from === term.from && x.to === term.to).length;
    if (!term.near && same < 2) unsure.add('careFrom');
    if (term.doubt) doubtKeys.add('careFrom').add('careTo');
  }

  // 居宅介護支援事業者：何件か届け出ていれば、届出年月日がいちばん新しい名前（officesOf）
  const offices = officesOf(byY, kind);
  const office = latestOffice(offices);
  if (office) {
    info.office = office.name;
    unsure.add('office');
  }

  // 利用者負担の割合（「1割」。ラベルの「負担割合」の「割合」は取らない）と適用期間。割合と期間は組で読む（年度の途中で割合が変わると、
  // 2つ目のますにも割合と期間が書かれる）：今日をふくむ期間の組、なければ一番新しい期間の組（終わった期間の割合を入れない）
  if (kinds.includes('futan')) {
    // 開始・終了のラベルのうしろの日付（同じ行に、ほかの面の日付＝区分支給限度基準額の期間などがあっても）
    const START = /開\s*始/;
    const END = /終\s*了/;
    const dateAfter = (r: Row, label: RegExp) => {
      const m = new RegExp(DATE).exec(r.text.slice(Math.max(0, r.text.search(label))));
      return m ? warekiIso(m[1], m[2], m[3], m[4]) : '';
    };
    const hOf = (r: Row) => Math.max(8, r.y1 - r.y0);
    const starts = byY.filter((r) => START.test(r.text) && dateAfter(r, START));
    const ends = byY.filter((r) => END.test(r.text) && dateAfter(r, END));
    // 期間：開始の行と、その行から下（次の開始の行より上）の終了の行
    const periods = starts.length
      ? starts.map((st, i) => {
          const e = ends.find((x) => x.y0 >= st.y0 - hOf(st) * 0.3 && (!starts[i + 1] || x.y0 < starts[i + 1].y0 - hOf(st) * 0.3));
          return {from: dateAfter(st, START), to: e ? dateAfter(e, END) : '', y: (st.y0 + (e ?? st).y1) / 2, burden: '' as CardInfo['burden']};
        })
      : ends.slice(0, 1).map((e) => ({from: '', to: dateAfter(e, END), y: (e.y0 + e.y1) / 2, burden: '' as CardInfo['burden']}));
    const RATIO = {'1': '1', '2': '2', '3': '3', 一: '1', 二: '2', 三: '3'} as const;
    const ratios = byY.flatMap((r) =>
      [...r.text.replace(/負担\s*割\s*合/g, '').matchAll(/([123一二三])\s*割(?!合)/g)].map((m) => ({v: RATIO[m[1] as '1'], y: (r.y0 + r.y1) / 2, h: hOf(r)})),
    );
    if (periods.length > 1) {
      // 割合のますは開始と終了の2行の高さ：割合の行にいちばん近い期間の割合
      for (const r of ratios) {
        const near = periods.reduce((x, y) => (Math.abs(y.y - r.y) < Math.abs(x.y - r.y) ? y : x));
        if (!near.burden && Math.abs(near.y - r.y) < r.h * 4) near.burden = r.v;
      }
    } else if (periods.length === 1) periods[0].burden = ratios[0]?.v ?? '';
    const covers = (x: {from: string; to: string}) => !!x.from && !!x.to && x.from <= today && today <= x.to;
    const chosen = periods.find(covers) ?? [...periods].sort((x, y) => (y.to || y.from).localeCompare(x.to || x.from))[0];
    if (chosen) {
      if (chosen.burden) info.burden = chosen.burden;
      if (chosen.from) info.burdenFrom = chosen.from;
      if (chosen.to) info.burdenTo = chosen.to;
    } else {
      // 期間のないページ（切り出して読んだページ）：割合がみな同じときだけ（ちがう割合がいくつも読めたら、どの期間のものか分からない）
      const vs = [...new Set(ratios.map((r) => r.v))];
      if (vs.length === 1) info.burden = vs[0];
    }
  }

  // ラベルが読めなかった項目は、位置から（生年月日の行から上へ。cardRead.ts で切り出して読み直す前の、全体を読んだページ）
  const loc = locateValues(page, today);
  if (loc) {
    const v = loc.values;
    if (!info.insuredNo && v.number) {
      const d = digitsOf(v.number.text);
      if (d.length >= 9 && d.length <= 11) {
        info.insuredNo = d;
        if (d.length !== 10) unsure.add('insuredNo');
      }
    }
    if (!info.name && v.name) {
      const n = personName(v.name.text, false);
      if (n.replace(/　/g, '').length >= 2) {
        info.name = n;
        unsure.add('name');
      }
    }
    if (!info.kana && v.kana) {
      const raw = v.kana.text.replace(/\s/g, '');
      const k = personName(v.kana.text, true);
      // カタカナがほとんどの行だけ（読みちがえて漢字になった行は入れない）
      if (k.replace(/　/g, '').length >= 2 && k.replace(/　/g, '').length >= raw.length * 0.6) {
        info.kana = k;
        unsure.add('kana');
      }
    }
    if (!info.gender && v.gender) info.gender = v.gender.text as '男' | '女';
    if (!info.address && v.address) {
      info.address = squeeze(v.address.text).replace(/^[^一-鿿ぁ-ヿ]+/, '');
      unsure.add('address');
    }
  }
  // 読み取りの自信が低い語の多い値は、たしかでない
  const lowConf = (re: RegExp) => {
    const r = rows.find((x) => re.test(x.text));
    if (!r) return false;
    const cs = r.words.map((w) => w.conf).filter((c): c is number => typeof c === 'number');
    return cs.length > 0 && cs.reduce((a, b) => a + b, 0) / cs.length < 75;
  };
  // 自信の低い値（weak）：形は合っていても読み違いがあるかもしれない。何回か読んで同じなら、たしか（parseCard）
  const weak = new Set<CardKey>();
  if (info.name && lowConf(/氏\s*名/)) weak.add('name');
  if (info.kana && lowConf(/フ\s*リ\s*[ガカ]\s*ナ/)) weak.add('kana');
  if (info.address && lowConf(/住\s*所|〒/)) weak.add('address');

  // 保険者番号（6けた。ますの数字の間は空白・縦線）と保険者の名称（ラベルの近くの行。なければどこか）
  const insurerRow = rows.findIndex((r) => /保険者番号/.test(squeeze(r.text)));
  if (insurerRow >= 0) {
    for (const r of rows.slice(Math.max(0, insurerRow - 2), insurerRow + 3)) {
      const t = r.text.replace(/保険者番号/, '');
      const m = /(?<![\d])((?:\d[\s|.,]*){6})(?![\d])/.exec(t);
      const d = m ? digitsOf(m[1]) : '';
      // 住所の番地（「1番1号」）・郵便番号の数字は取らない
      if (d.length === 6 && !/番|号|丁目|〒|-/.test(t.slice(Math.max(0, m!.index - 1), m!.index + m![0].length + 2))) {
        info.insurerNo = d;
        break;
      }
    }
  }
  if (!info.insurerNo) {
    // ラベルが読めないとき：数字が6つだけの行（ますの中の数字。ほかの字がほとんどない）
    // 行の先頭から、数字だけの欄をつないで6けた（「40999	9」のように欄が分かれて読めることもある）
    for (const r of byY) {
      let d = '';
      for (const c of r.cells) {
        if (c.text.replace(/[\d\s|.,]/g, '').length > 1) break;
        d += digitsOf(c.text);
      }
      if (d.length === 6) {
        info.insurerNo = d;
        unsure.add('insurerNo');
        break;
      }
    }
  }
  const nameRows = insurerRow >= 0 ? rows.slice(insurerRow, insurerRow + 5) : [];
  const found = [...nameRows, ...rows].map((r) => insurerOfName(r.text.replace(/〒.*$/, ''))).find((x) => x.insurer);
  if (found) {
    info.insurer = found.insurer;
    info.insurerName = found.name;
  }
  // 値ごとの読み取りの自信：その値の字のある行の語の自信の平均（同じ数だけ読めた値のどちらを使うかに）
  const conf: Partial<Record<CardKey, number>> = {};
  for (const [k, v] of Object.entries(info) as [CardKey, string][]) {
    const needle = squeeze(String(v).replace(/　/g, ''));
    if (needle.length < 2) continue;
    const r = rows.find((x) => squeeze(x.text).includes(needle) || (/^\d+$/.test(needle) && digitsOf(x.text).includes(needle)));
    const cs = r?.words.map((w) => w.conf).filter((c): c is number => typeof c === 'number') ?? [];
    if (cs.length) conf[k] = cs.reduce((a, b) => a + b, 0) / cs.length;
  }
  return {info, unsure, weak, doubt: doubtKeys, kinds, conf, offices};
}

/**
 * 何回か読んだ結果（切り出して読んだページ・全体を読んだページ、保険証と負担割合証）をまとめる：項目ごとに、
 * 決まった形に合う値のうち一番多く読めた値（同じ数なら先のページ＝切り出して読んだ方）。形に合う値がなければ、合わない値から同じように。
 * ページの source は何枚目の画像か（1枚の画像から2〜3ページできる。ないときは、ページごとに別の画像とみなす）。today：負担割合の適用期間を選ぶ日
 */
export function parseCard(pages: OcrPage[], today = todayIso()): CardRead {
  const info: CardInfo = {...NO_CARD};
  const unsure = new Set<CardKey>();
  const kinds: CardKind[] = [];
  const parsed = pages.map((pg, i) => ({...parsePage(pg, today), src: pg.source === undefined ? `p${i}` : `s${pg.source}`}));
  type Parsed = (typeof parsed)[number];
  for (const p of parsed) for (const k of p.kinds) if (!kinds.includes(k)) kinds.push(k);
  // 被保険者証を先に（負担割合証の住所・生年月日より、被保険者証の方が欄が分かれていて読みやすい）
  const order = parsed.map((p, i) => ({p, i})).sort((a, b) => Number(futanOnly(a.p.kinds)) - Number(futanOnly(b.p.kinds)) || a.i - b.i);
  const keys = Object.keys(NO_CARD) as CardKey[];
  // 生年月日・有効期間は、項目をばらばらにせず組で選ぶ
  const groups: CardKey[][] = [['era', 'birthY', 'birthM', 'birthD'], ['careFrom', 'careTo'], ['burdenFrom', 'burdenTo'], ['insurer', 'insurerName'], ['zip'], ['address'], ...keys.filter((k) => !['era', 'birthY', 'birthM', 'birthD', 'careFrom', 'careTo', 'burdenFrom', 'burdenTo', 'insurer', 'insurerName', 'zip', 'address'].includes(k)).map((k) => [k])];
  // 居宅介護支援事業者：どれかのページで届出年月日の古い方と分かった名前は選ばない（切り出して読んだページには届出年月日がないことがある）
  const dated = parsed.flatMap((p) => p.offices.filter((e) => e.date));
  const newestDate = dated.reduce((a, e) => (e.date > a ? e.date : a), '');
  const newestNames = new Set(dated.filter((e) => e.date === newestDate).map((e) => e.name));
  const oldNames = new Set(dated.filter((e) => e.date < newestDate && !newestNames.has(e.name)).map((e) => e.name));

  // 被保険者番号は画像ごとに数える（1枚の画像の2〜3ページを何回にも数えない）。被保険者証の画像の番号とちがう、負担割合証だけの画像
  // （ほかの方の負担割合証がまざった）は使わない（負担の割合は、その方の負担割合証が読めないときだけ、たしかでない値として）
  const srcs = [...new Set(parsed.map((p) => p.src))];
  const noOf = new Map<string, string>();
  const top = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const s of srcs) {
    const no = top(parsed.filter((p) => p.src === s && p.info.insuredNo?.length === 10).map((p) => p.info.insuredNo!));
    if (no) noOf.set(s, no);
  }
  const cardSrc = (s: string) => parsed.some((p) => p.src === s && p.kinds.includes('card'));
  const numbered = srcs.filter((s) => noOf.has(s));
  const refNo = top((numbered.some(cardSrc) ? numbered.filter(cardSrc) : numbered).map((s) => noOf.get(s)!));
  const foreign = new Set(numbered.filter((s) => noOf.get(s) !== refNo && !cardSrc(s)));
  const own = (p: Parsed) => !foreign.has(p.src);

  type Vote = {n: number; first: number; sure: boolean; weak: boolean; doubt: boolean; conf: number; values: Partial<CardInfo>; srcs: Set<string>};
  const tally = (g: CardKey[], use: (p: Parsed) => boolean): Vote[] => {
    const votes = new Map<string, Vote>();
    order.forEach(({p}, rank) => {
      if (!use(p) || !g.every((k) => p.info[k])) return;
      if (g[0] === 'office' && oldNames.has(p.info.office ?? '')) return;
      const sure = !g.some((k) => p.unsure.has(k));
      const key = g.map((k) => p.info[k]).join('|') + (sure ? '' : '?');
      const v = votes.get(key) ?? {n: 0, first: rank, sure, weak: true, doubt: false, conf: 0, values: Object.fromEntries(g.map((k) => [k, p.info[k]])), srcs: new Set<string>()};
      v.n++;
      v.srcs.add(p.src);
      if (!g.some((k) => p.weak.has(k))) v.weak = false;
      if (g.some((k) => p.doubt.has(k))) v.doubt = true;
      v.conf = Math.max(v.conf, ...g.map((k) => p.conf[k] ?? 0));
      votes.set(key, v);
    });
    return [...votes.values()];
  };
  // 形に合う値 → 多く読めた値 → 自信の高い値 → 先に読んだ値
  const better = (a: Vote, b: Vote) => Number(b.sure) - Number(a.sure) || b.n - a.n || Math.round(b.conf / 5) - Math.round(a.conf / 5) || a.first - b.first;
  /** 選んだ値を入れる。peers：比べる読み（同じ保険証の読み） */
  const take = (g: CardKey[], best: Vote | undefined, peers: Vote[]) => {
    if (!best) return;
    Object.assign(info, best.values);
    // 1回だけ・自信の低い読みは、たしかでない
    if (!best.sure || (best.weak && best.n < 2) || best.doubt) for (const k of g) unsure.add(k);
    // 同じ値の、読めなかった字がありそうな読み（形の合わない読みとして別にまとめた分も）
    if (peers.some((x) => x.doubt && g.every((k) => x.values[k] === best.values[k]))) for (const k of g) unsure.add(k);
    // ちがう形の合う値が同じ数だけあるときは、たしかでない（どちらが正しいか分からない）
    if (peers.some((v) => v !== best && v.sure === best.sure && v.n === best.n)) for (const k of g) unsure.add(k);
  };
  const vote = (g: CardKey[], use: (p: Parsed) => boolean) => {
    const votes = tally(g, use);
    take(g, [...votes].sort(better)[0], votes);
  };
  /**
   * 期間の組（認定の有効期間・負担割合の適用期間）：同じ保険証の読み（はじめの日が同じか、同じ画像）は多く読めた値（1回の読み違いで、おわりの日だけ
   * ちがう期間を選ばない）。ちがう保険証のあいだ（古い保険証もいっしょに読んだ）は newer で選ぶ
   */
  const pickTerm = (g: CardKey[], newer: (a: Vote, b: Vote) => number, use: (p: Parsed) => boolean) => {
    const cards: Vote[][] = [];
    for (const v of tally(g, use)) {
      const same = cards.filter((c) => c.some((x) => x.values[g[0]] === v.values[g[0]] || [...x.srcs].some((s) => v.srcs.has(s))));
      for (const c of same) cards.splice(cards.indexOf(c), 1);
      cards.push([v, ...same.flat()]);
    }
    const heads = cards.map((c) => [...c].sort(better)[0]);
    const best = heads.sort((a, b) => Number(b.sure) - Number(a.sure) || newer(a, b) || better(a, b))[0];
    take(g, best, cards.find((c) => c.includes(best)) ?? []);
  };
  /** ページが、選んだ期間の保険証のものか（期間の読めなかったページ＝切り出して読んだページは、同じ画像に選んだ期間があるか、ほかの期間がないとき） */
  const belongs = (p: Parsed, g: CardKey[]) => {
    const read = g.filter((k) => p.info[k]);
    if (read.length) return read.every((k) => p.info[k] === info[k]);
    return parsed.some((q) => q.src === p.src && g.every((k) => q.info[k] === info[k])) || !parsed.some((q) => g.some((k) => q.info[k] && q.info[k] !== info[k]));
  };
  const later = (k: CardKey) => (a: Vote, b: Vote) => String(b.values[k]).localeCompare(String(a.values[k]));

  for (const g of groups) {
    if (g[0] === 'care' || g[0] === 'burden' || g[0] === 'burdenFrom') continue; // 期間を選んでから
    if (g[0] === 'careFrom') pickTerm(g, later('careTo'), own);
    else vote(g, own);
  }
  // 要介護度：選んだ有効期間の保険証のページの読みのうち多く読めた値（古い保険証の要介護度を入れない。読みがちがえば、たしかでない）
  const careOf = (p: Parsed) => own(p) && (!info.careTo || belongs(p, ['careFrom', 'careTo']));
  if (tally(['care'], careOf).length) vote(['care'], careOf);
  else {
    vote(['care'], own);
    // 期間のちがう保険証があって、新しい方の要介護度が読めないときは、たしかでない
    if (info.care && parsed.some((p) => p.info.careTo && p.info.careTo !== info.careTo)) unsure.add('care');
  }
  // 負担の割合と適用期間：今日をふくむ期間（なければ一番新しい期間）と、その期間の負担割合証のページの読み
  const covers = (v: Vote) => String(v.values.burdenFrom) <= today && today <= String(v.values.burdenTo);
  const burdenOf = (use: (p: Parsed) => boolean) => {
    pickTerm(['burdenFrom', 'burdenTo'], (a, b) => Number(covers(b)) - Number(covers(a)) || later('burdenTo')(a, b), use);
    vote(['burden'], (p) => use(p) && (!info.burdenTo || belongs(p, ['burdenFrom', 'burdenTo'])));
  };
  burdenOf(own);
  if (!info.burden && !info.burdenTo && foreign.size) {
    burdenOf(() => true);
    for (const k of ['burden', 'burdenFrom', 'burdenTo'] as const) unsure.add(k);
  }
  // 画像ごとの番号がちがうとき（ほかの方の保険証・負担割合証がまざった、または読み違い）は、たしかでない
  if (new Set(noOf.values()).size > 1) unsure.add('insuredNo');
  if (info.insuredNo && info.insuredNo.length !== 10) unsure.add('insuredNo');
  return {info, unsure: keys.filter((k) => unsure.has(k) && info[k]), kinds};
}

/** 読み取りの向きを決めるための点数：保険証のラベルの字がいくつ読めたか */
export function cardScore(text: string): number {
  const t = squeeze(fixOcr(text));
  return ['介護保険', '被保険者', '番号', '住所', 'フリガナ', '氏名', '生年月日', '交付', '要介護', '認定', '有効期間', '居宅', '負担', '割合', '適用期間', '保険者'].filter((k) => t.includes(k)).length;
}

/** 何も読めなかったか */
export const cardEmpty = (info: CardInfo) => Object.values(info).every((v) => !v);

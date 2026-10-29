// 介護ソフト（パソコンの業務ソフト）のお客様の欄のスクリーンショットを読んだ文字から、申請書・理由書・見積書・特定福祉用具に入れる項目を取り出す
// （ユーザーの指示「介護ソフトの中で、その保険番号や名前、振り仮名、住所などが記載されている部分…をスクリーンショットで…切り取り、貼り付けたら、
//   同様の情報が自動的に入力される」「保険単独は１割負担、高額２割、高額３割、生保が種類であるため、保険割合として捉えてください」2026-10-23）。
// 欄の形（上から）：「氏名 様 生年月日生 年齢歳 性別」「部署 営業所 営業 担当」「ﾌﾘｶﾞﾅ（半角）」「氏名 様」「〒 郵便番号 住所」「Tel 電話番号 … 携帯電話 …」、
// 線で区切った行の「居宅情報 委託先居宅 事業所 ケアマネジャー Tel …」「認定情報 要介護N 認定期間 …〜…」「保険者情報 市町 被保険者番号 …」「給付情報 種類 保険給付率 N%」。
// 小さな灰色のラベルは読み違いが多い（委託先居宅→「託先居宅」、給付情報→「給和付情報」など）ので、少しの違いを許して探し、値の形（日付・10けたの番号・要介護N・N%）も手がかりにする。
// 読み取り（tesseract.js）とは分けた純粋な関数（node のテストで確かめる。画像を読むのは careSoftOcr.ts）。画面の画像・読んだ文字は保存せず、どこにも送らない

import {fixOcr, insurerOfName, plausibleTerm, warekiIso} from './hokensho.ts';
import type {CardCare, CardEra, CardInsurer, OcrPage, OcrWord} from './hokensho.ts';

/** 給付情報の種類（ユーザーの話：保険単独＝1割、高額２割、高額３割、生保＝生活保護） */
export type SoftKind = '' | '保険単独' | '高額２割' | '高額３割' | '生保';

/** 介護ソフトの画面から取り出した項目（読めなかった項目は ''） */
export type SoftInfo = {
  name: string; // 氏名（姓と名の間は全角の空白）
  kana: string; // フリガナ（全角カタカナ）
  era: CardEra | '';
  birthY: string;
  birthM: string;
  birthD: string;
  age: string; // 画面の年齢（生年月日の確かめに使う）
  gender: '' | '男' | '女';
  staff: string; // 営業（担当）の名前（読んだまま。担当者の候補と同じときだけ入れる）
  zip: string; // '824-0000'
  address: string;
  phone: string; // 電話番号（なければ携帯電話）。形の分かるものはハイフン付き
  office: string; // 委託先居宅（居宅介護支援事業所。理由書の作成者の事業所）
  manager: string; // ケアマネジャー（理由書の作成者の氏名）
  officeTel: string; // 居宅の電話（理由書の作成者の連絡先）
  care: CardCare;
  careFrom: string; // 認定期間 'YYYY-MM-DD'
  careTo: string;
  insurerName: string; // 保険者の名前（読んだまま）
  insurer: CardInsurer;
  insuredNo: string; // 被保険者番号（10けた）
  kind: SoftKind;
  rate: string; // 保険給付率（'90'・'80'・'70'）
  burden: '' | '1' | '2' | '3'; // 利用者負担の割合
  welfare: '' | 'yes' | 'no'; // 生活保護（給付情報が「生保」）。給付情報が読めなければ ''
};
export type SoftKey = keyof SoftInfo;
/** 数字の欄（字をしぼって切り出して読み直す所。careSoftOcr.ts） */
export type SoftSpot = 'birth' | 'zip' | 'phone' | 'officeTel' | 'careTerm' | 'insuredNo';
type Box = {x0: number; y0: number; x1: number; y1: number};
/**
 * 読んだ結果：項目・たしかでない項目・介護ソフトの画面らしさ（ラベルがいくつ見つかったか）・数字の欄の位置・まとめるときの重み
 * （字をしぼって読み直した数字は、全体を読んだものより重い）
 */
export type SoftRead = {info: SoftInfo; unsure: SoftKey[]; score: number; spots?: Partial<Record<SoftSpot, Box>>; weight?: number};

export const NO_SOFT: SoftInfo = {
  name: '',
  kana: '',
  era: '',
  birthY: '',
  birthM: '',
  birthD: '',
  age: '',
  gender: '',
  staff: '',
  zip: '',
  address: '',
  phone: '',
  office: '',
  manager: '',
  officeTel: '',
  care: '',
  careFrom: '',
  careTo: '',
  insurerName: '',
  insurer: '',
  insuredNo: '',
  kind: '',
  rate: '',
  burden: '',
  welfare: '',
};

// ---------------------------------------------------------------- 読み違いを直す

const CJK = '々〆ぁ-ゖァ-ヺー一-鿿';
const KATA_LIKE: [RegExp, string][] = [
  // カタカナにはさまれた・カタカナのうしろの漢字の読み違い（センタ一→センター、ケア口→ケアロ など）
  [/(?<=[ァ-ヺ])[一―](?=[ァ-ヺ]|$|[^一-鿿])/g, 'ー'],
  [/(?<=[ァ-ヺー])口(?=[ァ-ヺー])/g, 'ロ'],
  [/(?<=[ァ-ヺー])力(?=[ァ-ヺー])/g, 'カ'],
  [/(?<=[ァ-ヺー])工(?=[ァ-ヺー])/g, 'エ'],
  [/(?<=[ァ-ヺー])夕(?=[ァ-ヺー])/g, 'タ'],
  [/(?<=[ァ-ヺー])卜(?=[ァ-ヺー])/g, 'ト'],
];
// 事業所の名前によくある言葉の、濁点・半濁点の読み違い（ケアブラン→ケアプラン など）
const WORD_FIX: [RegExp, string][] = [
  [/ケア[ブフ]ラン/g, 'ケアプラン'],
  [/[ブフ]ラザ/g, 'プラザ'],
  [/サ[ボホ]ート/g, 'サポート'],
  [/ヘル[バハ]ー/g, 'ヘルパー'],
  [/ステーシヨン/g, 'ステーション'],
];

/** 1行の文字をそろえる：全角半角・数字のまわりの読み違い（fixOcr）、数字の間の「ー」「一」はハイフン、「〜」のいろいろ、カタカナの読み違い */
export function fixSoft(s: string): string {
  let t = fixOcr(s).replace(/(?<=\d)\s*[ー一―]\s*(?=\d)/g, '-').replace(/[〜～~]/g, '~');
  for (const [re, v] of KATA_LIKE) t = t.replace(re, v);
  for (const [re, v] of WORD_FIX) t = t.replace(re, v);
  return t;
}

/** 2つの文字の、ちがう字・ぬけた字・よけいな字の数 */
export function editDistance(a: string, b: string): number {
  const d = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return d[b.length];
}

/**
 * つめた文字（空白なし）の中からラベルを探す。少しの読み違い（4・5字は1字、6字からは2字まで）は許す。
 * 一番近い所（同じなら字の数が同じ・左の方）。見つからなければ null
 */
export function findLabel(sq: string, label: string, maxDist = label.length >= 6 ? 2 : label.length >= 4 ? 1 : 0): {start: number; end: number; dist: number} | null {
  let best: {start: number; end: number; dist: number} | null = null;
  const L = label.length;
  for (let i = 0; i < sq.length; i++) {
    for (let len = Math.max(1, L - maxDist); len <= L + maxDist && i + len <= sq.length; len++) {
      // 先頭か最後の字が合わない所は、別の言葉の一部のことが多い（ラベルの字は端まで読めることが多い）
      const w = sq.slice(i, i + len);
      if (maxDist > 0 && w[0] !== label[0] && w[w.length - 1] !== label[L - 1]) continue;
      const dist = editDistance(label, w);
      if (dist > maxDist) continue;
      if (!best || dist < best.dist || (dist === best.dist && Math.abs(len - L) < Math.abs(best.end - best.start - L))) best = {start: i, end: i + len, dist};
    }
  }
  return best;
}

// ---------------------------------------------------------------- 行

/** 画面の1行（読み取りの語を上下の重なりでまとめたもの）。text：大きなすき間はタブ・小さなすき間は空白。sq：空白をつめた文字、at：sq の字の text での位置 */
export type SoftRow = Box & {words: OcrWord[]; h: number; text: string; sq: string; at: number[]};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** 語の間のすき間：字の高さの1倍より大きければタブ（欄の切れ目）、0.3倍より大きければ空白 */
const gapMark = (gap: number, h: number) => (gap > h ? '\t' : gap > h * 0.3 ? ' ' : '');

/** 読み取りの語を、上下の重なりで1行ずつにまとめる（読み取りが1行を2つに分けても、小さなラベルと大きな値が同じ行でも） */
export function softRows(page: OcrPage): SoftRow[] {
  const words = page.lines.flatMap((l) => l.words).filter((w) => w.text.trim() && w.x1 > w.x0 && w.y1 > w.y0);
  words.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const groups: {cy: number; h: number; words: OcrWord[]}[] = [];
  for (const w of words) {
    const cy = (w.y0 + w.y1) / 2;
    const h = w.y1 - w.y0;
    let best: (typeof groups)[number] | null = null;
    for (const g of groups) {
      const d = Math.abs(g.cy - cy);
      if (d < Math.max(g.h, h) * 0.5 && (!best || d < Math.abs(best.cy - cy))) best = g;
    }
    if (!best) {
      groups.push({cy, h, words: [w]});
      continue;
    }
    best.words.push(w);
    best.cy = best.words.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / best.words.length;
    best.h = median(best.words.map((x) => x.y1 - x.y0));
  }
  return groups
    .map((g) => {
      const ws = [...g.words].sort((a, b) => a.x0 - b.x0);
      const h = Math.max(4, g.h);
      const raw = ws.map((w, i) => (i ? gapMark(w.x0 - ws[i - 1].x1, h) : '') + w.text.trim()).join('');
      const text = fixSoft(raw);
      const at: number[] = [];
      let sq = '';
      for (let i = 0; i < text.length; i++)
        if (!/\s/.test(text[i])) {
          sq += text[i];
          at.push(i);
        }
      return {x0: Math.min(...ws.map((w) => w.x0)), y0: Math.min(...ws.map((w) => w.y0)), x1: Math.max(...ws.map((w) => w.x1)), y1: Math.max(...ws.map((w) => w.y1)), words: ws, h, text, sq, at};
    })
    .sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
}

/** つめた文字の位置 → text の位置（end は text のその字のうしろ） */
const textEnd = (r: SoftRow, sqEnd: number) => (sqEnd <= 0 ? 0 : r.at[Math.min(sqEnd, r.at.length) - 1] + 1);
/** つめた文字の位置 → text の位置 */
const textAt = (r: SoftRow, sqIndex: number) => (sqIndex >= r.at.length ? r.text.length : r.at[sqIndex]);
/** つめた文字の位置にある語の番号（語の字を順に数えて） */
function wordAt(r: SoftRow, sqIndex: number): number {
  let n = 0;
  for (let i = 0; i < r.words.length; i++) {
    n += fixSoft(r.words[i].text).replace(/\s/g, '').length;
    if (n > sqIndex) return i;
  }
  return r.words.length - 1;
}

// ---------------------------------------------------------------- 値の形

const BIRTH = /(明治|大正|昭和|平成)(\d{1,2}|元)年(\d{1,2})月(\d{1,2})日/;
const DATE_G = /(令和|平成)(\d{1,2}|元)年(\d{1,2})月(\d{1,2})日/g;
// 郵便番号：電話番号の一部（090-1234-5678 の 090-1234）は除く
const ZIP = /(?<!\d)(?<!\d-)(\d{3})-?(\d{4})(?!\d)(?!-\d)/;
const PHONE_G = /0\d{1,4}-\d{1,4}-\d{3,4}|0\d{9,10}/g;
const CARE = /要\s*(支援|介護)\s*([1-5])/;
const OFFICE_END = /(センター|事業所|ステーション|ケアプラン|支援室|相談所|サービス|ホーム|プラザ|サポート|苑|園|会|所)$/;
const PERSON = new RegExp(`^[${CJK}]{1,6}$`);
const isCjk = (c: string) => new RegExp(`[${CJK}]`).test(c);

/** 電話番号にハイフン：形の分かるものだけ（携帯 090-1234-5678、京築の 0930・0979 は 0930-12-3456、北九州・福岡の 093・092 は 093-123-4567）。ほかは読んだまま */
export function phoneText(raw: string): string {
  const t = raw.normalize('NFKC').replace(/[‐‑‒–—―−ｰー一]/g, '-').replace(/\s/g, '');
  const d = t.replace(/\D/g, '');
  if (t.includes('-')) return t;
  if (/^0[5789]0\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^0(930|979)\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  if (/^09[23]\d{7}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return t;
}
/** 電話番号として形が合うか（0 から始まる 10・11けた） */
const phoneOk = (p: string) => /^0\d{9,10}$/.test(p.replace(/-/g, ''));

/** フリガナ：全角カタカナ（半角・ひらがなも）、姓と名の間は全角の空白。カタカナに似た字の読み違いも直し、カタカナでない字は除く */
export function cleanKana(raw: string): string {
  let t = raw.normalize('NFKC').replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  // 濁点・半濁点が離れて読めたとき（カ゛→ガ）
  t = t.replace(/([ァ-ヺ])\s*[゛゙]/g, (_, c: string) => (c + '゙').normalize('NFC')).replace(/([ァ-ヺ])\s*[゜゚]/g, (_, c: string) => (c + '゚').normalize('NFC'));
  t = t.replace(/[一―-]/g, 'ー').replace(/口/g, 'ロ').replace(/工/g, 'エ').replace(/力/g, 'カ').replace(/夕/g, 'タ').replace(/卜/g, 'ト').replace(/二/g, 'ニ').replace(/八/g, 'ハ');
  // 長音だけの語（となりの行の線・字の端が「ーー」に読めたもの）は除く
  return t
    .replace(/[^ァ-ヺー\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((p) => p && !/^ー+$/.test(p))
    .join('　');
}

/**
 * 切り出して読んだフリガナの行の語から、フリガナの文字（姓と名の間に全角の空白）。splitX：画素で見た姓と名の間の位置（blankSplit）があれば、
 * そこより左の字が姓。なければ字の間で一番大きなすき間。横に引きのばして読むと、字ごとに語に分かれることがあるので、読み取りの空白は使わない
 */
export function kanaOfWords(words: OcrWord[], splitX: number | null = null): string {
  const chars = words
    .flatMap((w) => (w.chars?.length ? w.chars : [{text: w.text, x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1}]))
    .map((c) => ({...c, t: cleanKana(c.text).replace(/　/g, '')}))
    .filter((c) => c.t); // 字の順は読み取りの順のまま（字の四角は前後にはみ出すことがある）
  if (chars.length === 0) return '';
  const text = chars.map((c) => c.t);
  if (splitX !== null) {
    const at = chars.filter((c) => (c.x0 + c.x1) / 2 < splitX).length;
    if (at > 0 && at < chars.length) return `${text.slice(0, at).join('')}　${text.slice(at).join('')}`;
  }
  const gaps = chars.slice(1).map((c, i) => c.x0 - chars[i].x1);
  const order = gaps.map((g, i) => [g, i] as const).sort((a, b) => b[0] - a[0]);
  const h = median(chars.map((c) => c.y1 - c.y0));
  const split = order.length && order[0][0] > h * 0.25 && (order.length === 1 || order[0][0] > Math.max(order[1][0], 0) * 1.6) ? order[0][1] : -1;
  return split < 0 ? text.join('') : `${text.slice(0, split + 1).join('')}　${text.slice(split + 1).join('')}`;
}

/**
 * フリガナの行の、姓と名の間の位置（x）：rect の中で字のない列が一番長く続く所のまん中。ほかの字の間のすき間の 1.6 倍から・3画素から。なければ null。
 * lum：明るさ（1画素1つ）、w：画像の幅。横の線（rect の幅の6割から濃い行）は字に数えない
 */
export function blankSplit(lum: ArrayLike<number>, w: number, rect: Box, dark = 170): number | null {
  const x0 = Math.max(0, Math.floor(rect.x0));
  const x1 = Math.min(w, Math.ceil(rect.x1));
  const y0 = Math.max(0, Math.floor(rect.y0));
  const y1 = Math.min(Math.floor(lum.length / w), Math.ceil(rect.y1));
  const rows: number[] = [];
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (lum[y * w + x] < dark) n++;
    if (n <= (x1 - x0) * 0.6) rows.push(y);
  }
  const ink: boolean[] = [];
  for (let x = x0; x < x1; x++) ink.push(rows.some((y) => lum[y * w + x] < dark));
  const first = ink.indexOf(true);
  const last = ink.lastIndexOf(true);
  if (first < 0) return null;
  const gaps: {at: number; len: number}[] = [];
  for (let i = first; i <= last; i++) {
    if (ink[i]) continue;
    const s0 = i;
    while (i <= last && !ink[i]) i++;
    gaps.push({at: s0, len: i - s0});
  }
  gaps.sort((a, b) => b.len - a.len);
  if (!gaps.length || gaps[0].len < 3 || (gaps[1] && gaps[0].len < gaps[1].len * 1.6)) return null;
  return x0 + gaps[0].at + gaps[0].len / 2;
}

/** フリガナとしてたしかか：姓と名の2つ・どれも2字から（名前のフリガナに長音はまずない） */
const kanaOk = (k: string) => {
  const parts = k.split('　');
  return parts.length === 2 && parts.every((p) => p.length >= 1) && k.replace(/　/g, '').length >= 3 && !k.includes('ー');
};

/**
 * 何回か（下ごしらえ・引きのばし方を変えて）読んだフリガナから、一番多い読みを選ぶ（空白を除いた字でかぞえ、姓と名の分け方はその中で多い方）。
 * たしか：2回から同じで、読んだ回数の半分から・自信の平均が70から・姓と名の2つ。同じ読みがなければ自信の一番高い読み（たしかでない）。
 * 小さな半角カタカナは、似た読み違いを2回することがあるので、自信も見る
 */
export function pickKana(reads: {text: string; conf: number}[]): {kana: string; sure: boolean} {
  const cands = reads.map((r) => ({kana: cleanKana(r.text), conf: r.conf})).filter((r) => r.kana.replace(/　/g, '').length >= 2);
  if (cands.length === 0) return {kana: '', sure: false};
  const groups = new Map<string, {kana: string; conf: number}[]>();
  for (const c of cands) {
    const key = c.kana.replace(/　/g, '');
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const best = [...groups.values()].sort((a, b) => b.length - a.length || b.reduce((s, x) => s + x.conf, 0) - a.reduce((s, x) => s + x.conf, 0))[0];
  if (best.length >= 2) {
    const ways = new Map<string, number>();
    for (const c of best) ways.set(c.kana, (ways.get(c.kana) ?? 0) + (c.kana.includes('　') ? 1.5 : 1));
    const kana = [...ways.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const avg = best.reduce((s, x) => s + x.conf, 0) / best.length;
    return {kana, sure: kanaOk(kana) && best.length >= cands.length / 2 && avg >= 70};
  }
  return {kana: [...cands].sort((a, b) => b.conf - a.conf)[0].kana, sure: false};
}

/** 人の名前を語から：姓と名の間（語の間で一番大きなすき間。ほかより大きいときだけ）を全角の空白1つに。字のほかは除く */
function nameOfWords(words: OcrWord[], h: number): {name: string; clean: boolean} {
  const ws = words.map((w) => ({...w, t: fixSoft(w.text).replace(new RegExp(`[^${CJK}]`, 'g'), '')})).filter((w) => w.t);
  if (ws.length === 0) return {name: '', clean: false};
  const gaps = ws.slice(1).map((w, i) => w.x0 - ws[i].x1);
  const order = gaps.map((g, i) => [g, i] as const).sort((a, b) => b[0] - a[0]);
  const split = order.length && order[0][0] > h * 0.45 && (order.length === 1 || order[0][0] > order[1][0] * 1.8) ? order[0][1] : -1;
  const name = split < 0 ? ws.map((w) => w.t).join('') : `${ws.slice(0, split + 1).map((w) => w.t).join('')}　${ws.slice(split + 1).map((w) => w.t).join('')}`;
  const clean = words.every((w) => !/[A-Za-z0-9!-/:-@[-`{-~]/.test(fixSoft(w.text)));
  return {name, clean};
}

/** 文字の名前（空白で区切った語）：字のほかを除き、2つに分かれていれば全角の空白で */
function nameOfText(raw: string): {name: string; clean: boolean} {
  const parts = raw
    .replace(new RegExp(`[^${CJK}\\s]`, 'g'), ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const clean = !new RegExp(`[^${CJK}\\s]`).test(raw.trim());
  return {name: parts.length === 2 ? parts.join('　') : parts.join(''), clean: clean && parts.length > 0 && parts.length <= 2};
}

// ---------------------------------------------------------------- 小さなラベル・「様」

/** 「様」の読み違い（名前のうしろの小さな灰色の「様」が、似た形の字に読めたもの） */
const SAMA_LIKE = /^[様樣栓疹拓稼椋榛棲標]$/;
/**
 * 小さなラベルの語か：行の語の高さのまんなかの 0.75 倍より低い。
 * 値は大きな字、ラベル（様・居宅・Tel・電話番号など）は小さな灰色の字（2026-10-23 にいただいた2つめの画面の形）
 */
const smallWord = (w: OcrWord, rowH: number) => w.y1 - w.y0 < rowH * 0.75;
/** 読み取りの自信が低い語（小さなラベルが別の字に読めたものに多い）。自信の分からない語は低くない */
const lowConf = (w: OcrWord) => w.conf !== undefined && w.conf < 50;

/**
 * 行の左から、人の名前の語：小さな語（「様」のラベル）・字のない語・大きく離れた語（右のボタン・ご本人の欄）で止める。
 * 「様」から右と、3つめからの1字の「様」の読み違いも除く
 */
function leadNameWords(r: SoftRow, words: OcrWord[] = r.words): OcrWord[] {
  const out: OcrWord[] = [];
  for (const w of words) {
    const t = fixSoft(w.text).replace(/\s/g, '');
    const sama = t.indexOf('様');
    const keep = (sama >= 0 ? t.slice(0, sama) : t).replace(new RegExp(`[^${CJK}]`, 'g'), '');
    // 名前の語のあいだは全角の空白くらいまで。それより離れた語（右のボタン・ご本人の欄）は名前ではない
    if (out.length && w.x0 - out[out.length - 1].x1 > r.h * 1.5) break;
    if (smallWord(w, r.h) || !keep) {
      if (out.length) break;
      continue;
    }
    out.push({...w, text: keep});
    if (sama >= 0) break;
  }
  if (out.length >= 3 && SAMA_LIKE.test(out[out.length - 1].text)) out.pop();
  return out;
}

/** 1行目の、生年月日より左の語（生年月日と同じ語に読めた名前の字も） */
function leftOfBirth(r: SoftRow): OcrWord[] {
  const m = BIRTH.exec(r.sq);
  if (!m) return [];
  const bi = wordAt(r, m.index);
  const bt = fixSoft(r.words[bi].text);
  const pre = bt.slice(0, Math.max(0, bt.search(/明治|大正|昭和|平成/)));
  return [...r.words.slice(0, bi), ...(pre ? [{...r.words[bi], text: pre}] : [])];
}

/** 名前の字が同じくらいか（3字からは1字ちがいまで） */
const nearName = (a: string, b: string) => a.length >= 2 && b.length >= 2 && editDistance(a, b) <= (Math.min(a.length, b.length) >= 3 ? 1 : 0);
/** カタカナ（フリガナ）の多い字か */
const kanaLike = (s: string) => cleanKana(s).replace(/　/g, '').length >= Math.max(2, s.replace(/\s/g, '').length * 0.5);

/** 〒の行：郵便番号（電話番号の一部でない 3けた-4けた）のうしろに住所の字 */
const ZIP_ROW = new RegExp(`${ZIP.source}.*[${CJK}]`);

/** 上の欄の行：1行目・部署・〒・2つめの氏名（とその名前の語）・フリガナ */
type TopRows = {name1?: SoftRow; name1Words: OcrWord[]; busho?: SoftRow; zipRow?: SoftRow; name2?: SoftRow; name2Words: OcrWord[]; kanaRow?: SoftRow};

/**
 * 上の欄の行を見分ける。2つめの氏名は、部署の行より下・〒の行より上で、1行目の名前と同じ（1字ちがいまで）行、
 * なければ「様」のある行、なければ〒のすぐ上の行（右にボタン「レンタル納品」など・ご本人の欄があっても、左の名前だけを見る）
 */
function topRows(rows: SoftRow[]): TopRows {
  const name1 = rows.find((r) => BIRTH.test(r.sq));
  const name1Words = name1 ? leadNameWords(name1, leftOfBirth(name1)) : [];
  const i1 = name1 ? rows.indexOf(name1) : -1;
  // 部署の行：1行目のすぐ下（1行目が読めなければ上の方）
  const busho = rows.slice(i1 + 1, i1 + (i1 < 0 ? 5 : 3)).find((r) => /営業所/.test(r.sq) || findLabel(r.sq, '部署', 0) !== null);
  const above = busho ?? name1;
  const zipRow = rows.find((r) => r !== name1 && r !== busho && (!above || r.y0 > above.y0) && ZIP_ROW.test(r.sq) && !/電話|Tel|TEL/.test(r.sq.slice(0, 6)));
  const name1Flat = name1Words.map((w) => w.text).join('');
  const cands = rows
    .filter((r) => r !== name1 && r !== busho && !BIRTH.test(r.sq) && (!above || r.y0 > above.y0 + above.h * 0.5) && (!zipRow || r.y0 < zipRow.y0))
    .slice(0, zipRow ? undefined : 4)
    .map((r) => {
      const ws = leadNameWords(r);
      return {r, ws, flat: ws.map((w) => w.text).join('')};
    })
    .filter((c) => c.flat.length >= 2 && c.flat.length <= 10 && !kanaLike(c.flat));
  const pick = cands.find((c) => name1Flat && nearName(c.flat, name1Flat)) ?? cands.find((c) => /様/.test(c.r.sq)) ?? (zipRow ? cands[cands.length - 1] : undefined);
  const name2 = pick?.r;
  // フリガナの行：上の行と2つめの氏名の間の、カタカナの多い行
  const kanaRow = name2 ? rows.find((r) => r !== name1 && r !== busho && r.y1 <= name2.y0 + name2.h * 0.3 && (!above || r.y0 >= above.y1 - above.h * 0.3) && kanaLike(r.text)) : undefined;
  return {name1, name1Words, busho, zipRow, name2, name2Words: pick?.ws ?? [], kanaRow};
}

/** 今日の満年齢 */
function ageOn(birthIso: string, today: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthIso);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!b || !t) return null;
  const [by, bm, bd] = b.slice(1).map(Number);
  const [ty, tm, td] = t.slice(1).map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

// ---------------------------------------------------------------- 行の見分け

/** 線で区切った行のラベル（介護ソフトの画面らしさにも使う） */
const INFO_LABELS = ['居宅情報', '委託先居宅', '認定情報', '認定期間', '保険者情報', '被保険者番号', '給付情報', '保険給付率'];
const OTHER_LABELS = ['受注情報', '受注残', '入金情報', '長期滞納', '支払情報', 'モニタリング', '次回予定', '携帯電話', '電話番号'];

type InfoKind = 'kyotaku' | 'nintei' | 'hokensha' | 'kyufu' | 'tel';

/**
 * 給付情報の種類（少しの読み違いは許す）。「高額所得対象２割」は2割負担・「高額所得対象３割」は3割負担（ユーザーの指示「高額所得対象2割の場合は、2割負担
 * 高額所得対象３割の場合は、３割負担として認識する」2026-10-23。前の画面の「高額２割」「高額３割」も同じ）。「N割」の数字を一番の手がかりにして、
 * 「高額」「所得」「対象」の字が読み違えられても割合は取る（「割」が読めなければ、それらの字のすぐうしろの数字）。たしか：「高額」か「所得対象」と「N割」が続けて読めたとき
 */
function kindOf(sq: string): {kind: SoftKind; exact: boolean} {
  const high = /([23])[割剖]/.exec(sq) ?? /(?:高額|所得|対象).{0,4}?([23])(?!\d)/.exec(sq);
  if (high) return {kind: high[1] === '2' ? '高額２割' : '高額３割', exact: /(?:高額|所得対象)[23]割/.test(sq)};
  const single = findLabel(sq, '保険単独');
  if (single) return {kind: '保険単独', exact: single.dist === 0};
  if (/生保/.test(sq)) return {kind: '生保', exact: true};
  if (/[牛主]保/.test(sq) && !/保険/.test(sq.replace(/保険給付率?/, ''))) return {kind: '生保', exact: false};
  if (/(?<!\d)1[割剖]/.test(sq)) return {kind: '保険単独', exact: false};
  return {kind: '', exact: false};
}

/** その行が線で区切った行のどれらしいか（ラベルは2点、値の形は1〜2点） */
function infoScore(r: SoftRow, kind: InfoKind): number {
  const lab = (l: string) => (findLabel(r.sq, l) ? 2 : 0);
  switch (kind) {
    case 'kyotaku':
      return lab('居宅情報') + lab('委託先居宅') + (/0\d{1,4}-\d{1,4}-\d{3,4}/.test(r.sq) ? 1 : 0) + (/センター|ケアプラン|居宅介護|事業所|ステーション/.test(r.sq) ? 1 : 0);
    case 'nintei':
      return lab('認定情報') + lab('認定期間') + (CARE.test(r.sq) ? 2 : 0) + ((r.sq.match(DATE_G) ?? []).length ? 1 : 0);
    case 'hokensha':
      return lab('保険者情報') + lab('被保険者番号') + (insurerFuzzy(r.sq).insurer ? 2 : 0) + (/(?<!\d)\d{10}(?!\d)/.test(r.sq) ? 1 : 0);
    case 'kyufu':
      return lab('給付情報') + lab('保険給付率') + (kindOf(r.sq).kind ? 2 : 0) + (RATE.test(r.sq) ? 1 : 0);
    case 'tel':
      return lab('電話番号') + lab('携帯電話') + (/^Te[lI1]/i.test(r.sq) ? 1 : 0) + (/(?<!\d)0\d{9,10}(?!\d)/.test(r.sq.replace(/-/g, '')) ? 1 : 0);
  }
}

/** 介護ソフトの画面らしさに数えるラベル（介護保険証にもある「被保険者番号」「電話番号」は数えない） */
const SCORE_LABELS = [...INFO_LABELS.filter((l) => l !== '被保険者番号'), ...OTHER_LABELS.filter((l) => !/電話/.test(l))];
/** 介護ソフトの画面らしさ：線で区切った行などのラベルがいくつ見つかったか */
export function softScore(rows: SoftRow[]): number {
  const all = rows.map((r) => r.sq);
  // 上の欄だけのスクリーンショット（ラベルの少ない所）も：1行目の「…日生84歳」（保険証にはない形）は2つ分
  const top = all.some((sq) => /日生\d{1,3}歳/.test(sq)) ? 2 : 0;
  return SCORE_LABELS.filter((l) => all.some((sq) => findLabel(sq, l))).length + top;
}

// ---------------------------------------------------------------- 取り出す

/** 語の番号の範囲を囲む四角（読み直すときに切り出す所） */
function spanBox(r: SoftRow, sqStart: number, sqEnd: number): Box {
  const ws = r.words.slice(wordAt(r, sqStart), wordAt(r, Math.max(sqStart, sqEnd - 1)) + 1);
  return {x0: Math.min(...ws.map((w) => w.x0)), y0: Math.min(...ws.map((w) => w.y0)), x1: Math.max(...ws.map((w) => w.x1)), y1: Math.max(...ws.map((w) => w.y1))};
}

/** 認定期間の行の「令和」の読み違い（針和・付和 など。数字の年が続くとき） */
const reiwa = (sq: string) => sq.replace(/[^\d平昭]和(?=\d{1,2}年)/g, '令和');

/** 保険者の名前（市町）。少しの読み違いも（滴田町→苅田町） */
const MUNICIPALITIES: [string, CardInsurer][] = [
  ['苅田町', 'kanda'],
  ['行橋市', 'yukuhashi'],
  ['みやこ町', 'miyako'],
  ['築上町', 'kouiki'],
  ['豊前市', 'kouiki'],
  ['上毛町', 'kouiki'],
  ['吉富町', 'kouiki'],
  ['福岡市', 'fukuoka'],
];
function insurerFuzzy(sq: string): {insurer: CardInsurer; name: string; exact: boolean} {
  const exact = insurerOfName(sq);
  if (exact.insurer) return {...exact, exact: true};
  for (const [name, insurer] of MUNICIPALITIES) if (findLabel(sq, name, 1)) return {insurer, name: insurerOfName(name).name, exact: false};
  return {insurer: '', name: '', exact: false};
}

/** 行の sq の範囲 [from, to) にかかる語（はみ出す語は、その中の字だけ）と、その sq の位置 */
function wordsIn(r: SoftRow, from: number, to: number): {w: OcrWord; s: number; e: number; t: string}[] {
  const out: {w: OcrWord; s: number; e: number; t: string}[] = [];
  let p = 0;
  for (const w of r.words) {
    const t = fixSoft(w.text).replace(/\s/g, '');
    const [s, e] = [p, p + t.length];
    p = e;
    const [a, b] = [Math.max(s, from), Math.min(e, to, r.sq.length)];
    if (b > a) out.push({w, s: a, e: b, t: t.slice(a - s, b - s)});
  }
  return out;
}

/** 事業所の名前の終わりの言葉（このうしろに支店の名前が続くときは全角の空白を入れる） */
const OFFICE_BREAK = /(サービス|センター|ステーション|事業所|ケアプラン)$/;
const OFFICE_WORD = /サービス|センター|ステーション|事業所|ケアプラン|支援|介護/;
const hasCjk = (s: string) => new RegExp(`[${CJK}]`).test(s);
/** ケアマネジャーの姓・名らしい字（漢字だけ1〜4字。事業所の名前の終わりの言葉でない） */
const kanjiName = (t: string) => /^[一-鿿々〆ヶ]{1,4}$/.test(t) && !OFFICE_END.test(t);

/**
 * 居宅情報の行から、事業所（理由書の作成者の所属事業所）とケアマネジャー（理由書の作成者）を分ける（telAt：居宅の電話の始まり＝sq の位置）。
 * 欄の形：「居宅情報」「居宅」か「委託先居宅」（小さなラベル）・事業所の名前（うしろに支店の名前のこともある）・姓・名・「Tel」・電話。
 * ユーザーの例の形「居宅 ○○介護保険サービス　○○（支店） 姓　名 Tel …」では、事業所は「○○介護保険サービス　○○」、ケアマネジャーは「姓　名」（2026-10-23）
 */
function kyotakuParts(kyo: SoftRow, telAt: number): {office: string; manager: string; officeUnsure: boolean; managerUnsure: boolean} {
  // ラベル：「居宅情報」（読めなければ、はじめの6字の中の「報」まで）と「委託先居宅」
  const reportAt = kyo.sq.slice(0, 6).indexOf('報');
  const head = findLabel(kyo.sq, '居宅情報') ?? (reportAt >= 0 ? {start: 0, end: reportAt + 1, dist: 9} : null);
  const inner = findLabel(kyo.sq, '委託先居宅');
  const from = Math.max(head?.end ?? 0, inner?.end ?? 0);
  let officeUnsure = false;
  // 語ごとに：ラベルのうしろの最初のかたまり（大きなすき間までの語）が小さなラベル（居宅・委託先居宅。小さな字・自信の低いごみ・「先」のある短い字）なら除く。
  // うしろの「Tel」のラベル・ごみも除く
  const ws = wordsIn(kyo, from, telAt);
  const firstGap = ws.findIndex((x, i) => i > 0 && x.w.x0 - ws[i - 1].w.x1 >= kyo.h * 0.7);
  if (firstGap > 0) {
    const seg = ws.slice(0, firstGap);
    const t = seg.map((x) => x.t).join('');
    const tiny = seg.every((x) => smallWord(x.w, kyo.h) || lowConf(x.w) || !hasCjk(x.t));
    if (t.replace(new RegExp(`[^${CJK}]`, 'g'), '').length <= 5 && (tiny || /先/.test(t) || findLabel(t, '居宅', 1) || findLabel(t, '委託先居宅'))) ws.splice(0, firstGap);
  }
  while (ws.length && (smallWord(ws[0].w, kyo.h) || !hasCjk(ws[0].t))) ws.shift();
  while (ws.length && (smallWord(ws[ws.length - 1].w, kyo.h) || !hasCjk(ws[ws.length - 1].t))) ws.pop();
  let region = ws.length ? kyo.text.slice(textAt(kyo, ws[0].s), textEnd(kyo, ws[ws.length - 1].e)) : '';
  region = region.replace(/[\sA-Za-z0-9:：.。、・,'"|]+$/, '').replace(new RegExp(`^[^${CJK}]+`), '');
  // 語に分かれずに残ったラベルの読み違い：「委託先居宅」（放先局・計旗先居宅 など。「先」とそのあとの2字まで）、「居宅」（居才 など。うしろが「介護」の居宅介護支援… は事業所の名前）、
  // 数字・英字のまじったごみ（品5 など）
  const cut = (n: number) => {
    let seen = 0;
    let i = 0;
    while (i < region.length && seen < n) {
      if (!/\s/.test(region[i])) seen++;
      i++;
    }
    region = region.slice(i).replace(/^\s+/, '');
  };
  const flat = () => region.replace(/\s/g, '');
  const sen = inner ? null : /^[^\t]{0,3}?先[居局語記詞導宅字宇上計言證証天]{0,2}/.exec(region.replace(/ /g, ''));
  if (sen) {
    cut(sen[0].length);
    officeUnsure = true;
  }
  const kyoLabel = /^居([宅才老室窄字守宇定它毛モ七])(?!介護|支援)(?=.)/.exec(flat());
  if (kyoLabel) {
    cut(2);
    if (kyoLabel[1] !== '宅') officeUnsure = true;
  }
  const junk = new RegExp(`^[${CJK}]{0,2}[0-9A-Za-z]+(?=[${CJK}])`).exec(flat());
  if (junk) {
    cut(junk[0].length);
    officeUnsure = true;
  }
  const tokens = region
    .split(/\s+/)
    .map((t) => t.replace(new RegExp(`[^${CJK}A-Za-z0-9・()]`, 'g'), ''))
    .filter(hasCjk);
  // ケアマネジャー：うしろから漢字だけの語を2つまで（姓・名。あわせて6字まで）。支店の名前とくっついた姓（おばせ高崎）は分ける
  const tail: string[] = [];
  let k = tokens.length;
  while (k > 0 && tail.length < 2) {
    const t = tokens[k - 1];
    if (kanjiName(t) && tail.join('').length + t.length <= 6) {
      tail.unshift(t);
      k--;
      continue;
    }
    const glued = /^(.*[ぁ-ゖァ-ヺー])([一-鿿々]{1,4})$/.exec(t);
    if (glued && tail.length === 1) {
      tokens[k - 1] = glued[1];
      tail.unshift(glued[2]);
    }
    break;
  }
  let manager = '';
  let managerUnsure = false;
  if (tail.length === 2 && k > 0) manager = tail.join('　');
  else if (tail.length === 2) {
    // 漢字の語が2つだけ：前が事業所、うしろが名前（どちらか分からないので確かめる）
    manager = tail[1];
    k = 1;
    managerUnsure = true;
  } else if (tail.length === 1 && k > 0 && (tail[0].length >= 3 || !kanjiName(tokens[k - 1]))) {
    manager = tail[0];
    managerUnsure = true;
  } else k += tail.length;
  // 事業所：語をつなぐ。事業所の名前の終わりの言葉のうしろに支店の名前（事業所の言葉のない短い語）が続くときだけ全角の空白
  const rest = tokens.slice(0, k);
  let office = rest.map((t, i) => (i && OFFICE_BREAK.test(rest[i - 1]) && !OFFICE_WORD.test(t) && !/^[ァ-ヺー]/.test(t) && t.length <= 8 ? '　' : '') + t).join('');
  // 区切りなしで読めたとき：事業所の名前と名前がくっついている（…サービスおばせ高崎博幸）なら、うしろのかな・漢字の切れ目で名前を分ける
  if (!manager && tail.length === 0) {
    const m = new RegExp(`^(.*[ぁ-ゖァ-ヺー])([一-鿿々]{3,6})$`).exec(office) ?? new RegExp(`^(.*(?:センター|事業所|ステーション|ケアプラン|支援室|相談所|サービス|苑|園))([${CJK}]{2,6})$`).exec(office);
    if (m && m[1].length >= 3) {
      office = m[1];
      manager = m[2];
      managerUnsure = true;
    }
  }
  // 支店の名前（ひらがな）がくっついて読めたとき（…サービスおばせ）も、事業所の名前の終わりの言葉のうしろに全角の空白
  office = office.replace(/(サービス|センター|ステーション|事業所|ケアプラン(?!センター))(?=[ぁ-ゖ][^　]*$)/, (w, _x, at: number, all: string) => (OFFICE_WORD.test(all.slice(at + w.length)) ? w : `${w}　`));
  return {office, manager, officeUnsure, managerUnsure};
}

/** 1回読んだ画面（1ページ）から項目を取り出す。today：年齢の確かめに使う日 'YYYY-MM-DD' */
export function parseSoftPage(page: OcrPage, today: string): SoftRead {
  const rows = softRows(page);
  const info: SoftInfo = {...NO_SOFT};
  const unsure = new Set<SoftKey>();
  const spots: Partial<Record<SoftSpot, Box>> = {};
  const used = new Set<SoftRow>();

  // 上の欄の行：1行目（氏名 様 生年月日生 年齢歳 性別）・部署・フリガナ・2つめの氏名・〒
  const top = topRows(rows);
  const {name1, busho, zipRow, name2, kanaRow} = top;
  let names: {name: string; clean: boolean}[] = [];
  if (name1) {
    used.add(name1);
    const m = BIRTH.exec(name1.sq)!;
    const b = birthOf(name1.sq.slice(m.index), today);
    Object.assign(info, b.info);
    if (!b.sure) for (const k of ['era', 'birthY', 'birthM', 'birthD'] as const) unsure.add(k);
    const after = name1.sq.slice(m.index + m[0].length);
    const g = /歳.{0,2}?([男女])/.exec(after) ?? /([男女])$/.exec(after);
    if (g) info.gender = g[1] as '男' | '女';
    const ageAt = after.search(/歳/);
    spots.birth = spanBox(name1, m.index, m.index + m[0].length + (ageAt >= 0 ? ageAt + 1 : 0));
    // 名前：生年月日より左の語（小さな「様」とその読み違いは除く）
    const n = nameOfWords(top.name1Words, name1.h);
    if (n.name) names.push(n);
  }

  // 部署の行（営業所の名前・営業の担当）
  if (busho) {
    used.add(busho);
    const label = /営業(?!所)/g;
    let last: RegExpExecArray | null = null;
    for (let m = label.exec(busho.sq); m; m = label.exec(busho.sq)) last = m;
    // 「営業」のラベルが読めればそのうしろ、読めなければ最後の欄（大きなすき間のうしろ）。ラベルの残り（業）・ひらがなのごみは除く
    const tail = last ? busho.text.slice(textEnd(busho, last.index + last[0].length)) : (busho.text.split('\t').pop() ?? '');
    const parts = tail
      .replace(new RegExp(`[^${CJK}\\s]`, 'g'), ' ')
      .trim()
      .split(/\s+/)
      .filter((p) => p && !/^[営業]+$/.test(p) && !/^[ぁ-ゖ]{1,2}$/.test(p));
    const s = nameOfText(parts.join(' '));
    const flat = s.name.replace(/　/g, '');
    if (flat.length >= 2 && PERSON.test(flat) && !/営業|部署/.test(flat)) {
      info.staff = s.name;
      if (!s.clean || parts.length > 2) unsure.add('staff');
    }
  }

  // 2つめの氏名（フリガナの下。右にボタン・ご本人の欄があっても、左の名前だけ）と、その上のフリガナの行
  if (name2) {
    used.add(name2);
    const n = nameOfWords(top.name2Words, name2.h);
    if (n.name) names.push(n);
  }
  if (kanaRow) {
    used.add(kanaRow);
    info.kana = cleanKana(kanaRow.text);
  }
  // 氏名：2つ読めて同じならたしか。片方のうしろに1字多い（「様」の読み違い）ときは短い方。ほかにちがえば大きい方（フリガナの下）で、たしかでない
  names = names.filter((n) => n.name.replace(/　/g, '').length >= 2);
  if (names.length) {
    const flatOf = (n: {name: string}) => n.name.replace(/　/g, '');
    const [a, b] = names.length === 2 ? [...names].sort((x, y) => flatOf(x).length - flatOf(y).length) : [names[0], names[0]];
    if (names.length === 2 && flatOf(b).length === flatOf(a).length + 1 && flatOf(b).startsWith(flatOf(a)) && SAMA_LIKE.test(flatOf(b).slice(-1))) names = [a];
    const spaced = names.find((n) => n.name.includes('　'));
    const flat = new Set(names.map(flatOf));
    const pick = names[names.length - 1];
    info.name = spaced && flatOf(spaced) === flatOf(pick) ? spaced.name : pick.name;
    if (flat.size > 1 || !names.every((n) => n.clean)) unsure.add('name');
  }
  // 全体を読んだときのフリガナは字が小さくて読み違いが多いので、いつも確かめてもらう（切り出して読み直したものは parseSoft で）
  if (info.kana) unsure.add('kana');

  // 〒 郵便番号 住所（地図のボタンが字に読めたもの・欄の切れ目のうしろの短いごみは除く）
  if (zipRow) {
    used.add(zipRow);
    const m = ZIP.exec(zipRow.sq)!;
    info.zip = `${m[1]}-${m[2]}`;
    spots.zip = spanBox(zipRow, m.index, m.index + m[0].length);
    let rest = zipRow.text.slice(textEnd(zipRow, m.index + m[0].length));
    rest = rest.split(/[_」「|[\]%@®©◎〇•●▼▲*#$&=+<>?!"'`^\\]/)[0];
    const cells = rest.split('\t').map((c) => c.trim());
    const kept: string[] = [];
    for (const c of cells) {
      if (!c) continue;
      // 欄の切れ目のうしろの、字のない短いもの（地図のボタン）は住所ではない。番地（2-3・101）は住所
      if (kept.length && !new RegExp(`[${CJK}]`).test(c) && (c.replace(/\s/g, '').length <= 2 || !/^[\d-]+$/.test(c.replace(/\s/g, '')))) break;
      kept.push(c);
    }
    info.address = kept
      .join('')
      .replace(/\s+\S$/, '')
      .replace(/\s+/g, '')
      .replace(/(?<=\d)[.・,](?=\d)/g, '-');
    if (!info.address || new RegExp(`[^${CJK}0-9A-Za-z\\-()]`).test(info.address) || !/[都道府県市区町村郡]/.test(info.address)) unsure.add('address');
  }

  // 線で区切った行と電話番号の行：一番それらしい行から
  const rest = rows.filter((r) => !used.has(r));
  const kinds: InfoKind[] = ['kyotaku', 'nintei', 'hokensha', 'kyufu', 'tel'];
  const cands = rest.flatMap((r) => kinds.map((k) => ({r, k, s: infoScore(r, k)}))).filter((c) => c.s >= 2);
  cands.sort((a, b) => b.s - a.s);
  const got = new Map<InfoKind, SoftRow>();
  for (const c of cands) if (!got.has(c.k) && ![...got.values()].includes(c.r)) got.set(c.k, c.r);
  // ラベルが読めずに点の足りない行は、線で区切った行の順番（居宅情報・認定情報・保険者情報・給付情報）で、見つかった行のとなりから
  // （小さな灰色のラベルが読めず、苅田町も別の字に読めると、番号だけでは点が足りなかった。2026-10-23）
  const ORDER: InfoKind[] = ['kyotaku', 'nintei', 'hokensha', 'kyufu'];
  for (let round = 0; round < ORDER.length; round++)
    for (const [p, k] of ORDER.entries()) {
      if (got.has(k)) continue;
      for (const [q, f] of ORDER.entries()) {
        const fr = got.get(f);
        const r = fr ? rows[rows.indexOf(fr) + p - q] : undefined;
        if (r && rest.includes(r) && ![...got.values()].includes(r) && infoScore(r, k) >= 1) {
          got.set(k, r);
          break;
        }
      }
    }
  // 電話番号の行：「Tel」「電話番号」の小さなラベルが読めなくても、〒の行（なければ2つめの氏名）より下・線で区切った行より上の、電話番号の形のある行
  if (!got.has('tel')) {
    const firstInfo = Math.min(Infinity, ...[...got.values()].map((r) => r.y0));
    const after = zipRow ?? name2;
    const r = rest.find((x) => ![...got.values()].includes(x) && (!after || x.y0 > after.y0) && x.y1 <= firstInfo && new RegExp(PHONE_G.source).test(x.sq) && !/[年月日]/.test(x.sq));
    if (r) got.set('tel', r);
  }

  const tel = got.get('tel');
  if (tel) {
    const m = new RegExp(PHONE_G.source).exec(tel.sq);
    if (m) {
      info.phone = phoneText(m[0]);
      if (!phoneOk(info.phone)) unsure.add('phone');
      spots.phone = spanBox(tel, m.index, m.index + m[0].length);
    }
  }

  const kyo = got.get('kyotaku');
  if (kyo) {
    const phones = [...kyo.sq.matchAll(new RegExp(PHONE_G.source, 'g'))];
    const telAt = phones.length ? phones[phones.length - 1] : null;
    if (telAt) {
      info.officeTel = phoneText(telAt[0]);
      if (!phoneOk(info.officeTel)) unsure.add('officeTel');
      spots.officeTel = spanBox(kyo, telAt.index!, telAt.index! + telAt[0].length);
    }
    const parts = kyotakuParts(kyo, telAt ? telAt.index! : kyo.sq.length);
    info.office = parts.office;
    info.manager = parts.manager;
    if (parts.officeUnsure || !info.office || info.office.length < 3 || new RegExp(`[^${CJK}A-Za-z0-9・()　]`).test(info.office)) unsure.add('office');
    if (info.manager && (parts.managerUnsure || info.manager.split('　').length !== 2 || !PERSON.test(info.manager.replace(/　/g, '')))) unsure.add('manager');
  }

  const nin = got.get('nintei');
  if (nin) {
    const sq = reiwa(nin.sq);
    const c = CARE.exec(sq);
    // 要支援は1・2だけ（要支援3〜5は読み違い）
    if (c && !(c[1] === '支援' && Number(c[2]) > 2)) info.care = `要${c[1]}${c[2]}` as CardCare;
    const t = termOf(sq);
    Object.assign(info, t.info);
    if (!t.sure) {
      unsure.add('careFrom');
      unsure.add('careTo');
    }
    // 読み直す所：最初の元号（読めなければ要介護のうしろ）から行の終わりまで（年を読み違えた日付も入れる）
    const era = sq.search(/令和|平成/);
    const from = era >= 0 ? era : c ? c.index + c[0].length : -1;
    if (from >= 0 && from < sq.length - 4) spots.careTerm = spanBox(nin, from, sq.length);
  }

  const hok = got.get('hokensha');
  if (hok) {
    const lab = findLabel(hok.sq, '被保険者番号');
    const re = /\d[\d-]{5,}\d/g;
    const runs = [...(lab ? hok.sq.slice(lab.end) : hok.sq).matchAll(re)].map((x) => ({text: x[0].replace(/-/g, ''), at: x.index! + (lab ? lab.end : 0), len: x[0].length}));
    const no = runs.sort((a, b) => Math.abs(a.text.length - 10) - Math.abs(b.text.length - 10))[0];
    if (no) {
      info.insuredNo = no.text;
      if (no.text.length !== 10) unsure.add('insuredNo');
      spots.insuredNo = spanBox(hok, no.at, no.at + no.len);
    }
    const head = findLabel(hok.sq, '保険者情報');
    const firstDigit = hok.sq.search(/\d/);
    const nameSq = hok.sq.slice(head ? head.end : 0, lab ? lab.start : firstDigit >= 0 ? firstDigit : hok.sq.length);
    const ins = insurerFuzzy(nameSq);
    info.insurer = ins.insurer;
    info.insurerName = ins.name || nameSq.replace(new RegExp(`[^${CJK}]`, 'g'), '');
    if (ins.insurer && !ins.exact) unsure.add('insurer');
  }
  // 住所の市町の読み違い（滴田町）を、保険者の名前と京都郡で直す（直したときは確かめてもらう）
  if (info.address) {
    const fixed = fixMunicipality(info.address, info.insurer);
    if (fixed !== info.address) {
      info.address = fixed;
      unsure.add('address');
    }
  }

  const kyu = got.get('kyufu');
  if (kyu) {
    const head = findLabel(kyu.sq, '給付情報');
    const rateLab = findLabel(kyu.sq, '保険給付率');
    const body = kyu.sq.slice(head ? head.end : 0, rateLab ? rateLab.start : kyu.sq.length);
    const k = kindOf(body.length >= 2 ? body : kyu.sq);
    const r = RATE.exec(rateLab ? kyu.sq.slice(rateLab.end) : kyu.sq) ?? RATE.exec(kyu.sq);
    info.kind = k.kind;
    info.rate = r ? r[1] : '';
    const fromKind = ({保険単独: '1', 高額２割: '2', 高額３割: '3', 生保: '1'} as const)[k.kind as Exclude<SoftKind, ''>] ?? '';
    const fromRate = ({'90': '1', '80': '2', '70': '3'} as Record<string, '1' | '2' | '3'>)[info.rate] ?? '';
    info.burden = fromKind || fromRate;
    // 種類と給付率が合わないとき・種類の字があやしくて給付率もないときは、たしかでない
    if ((fromKind && fromRate && fromKind !== fromRate) || (fromKind && !k.exact && !fromRate)) unsure.add('burden');
    if (k.kind) {
      info.welfare = k.kind === '生保' ? 'yes' : 'no';
      if (!k.exact && !(fromRate && fromRate === fromKind && k.kind !== '生保')) unsure.add('welfare');
    }
  }

  return {info, unsure: (Object.keys(info) as SoftKey[]).filter((k) => unsure.has(k) && info[k]), score: softScore(rows), spots};
}

/** 保険給付率（「80%」の「%」が「96」に読めたときも） */
const RATE = /([1-9]0)(?:\d?%|96(?!\d))/;

/** 生年月日と年齢（「昭和17年5月6日生84歳」）：年齢が生年月日と合えばたしか */
function birthOf(sq: string, today: string): {info: Pick<SoftInfo, 'era' | 'birthY' | 'birthM' | 'birthD' | 'age'>; sure: boolean} {
  const m = BIRTH.exec(sq);
  if (!m) return {info: {era: '', birthY: '', birthM: '', birthD: '', age: ''}, sure: false};
  const out = {era: m[1] as CardEra, birthY: m[2] === '元' ? '1' : String(Number(m[2])), birthM: String(Number(m[3])), birthD: String(Number(m[4])), age: ''};
  const after = sq.slice(m.index + m[0].length);
  // 年齢の「歳」が読めないこともある（切り出して読み直したとき）
  const age = /^生?(\d{1,3})(?:歳|$)/.exec(after) ?? /(\d{1,3})歳/.exec(after);
  if (age) out.age = age[1];
  const iso = warekiIso(out.era, out.birthY, out.birthM, out.birthD);
  const computed = iso ? ageOn(iso, today) : null;
  return {info: out, sure: !!iso && computed !== null && !!out.age && Math.abs(computed - Number(out.age)) <= 1};
}

/** 認定期間（2つの日付）：ありうる期間（月末まで・3か月〜4年）ならたしか */
function termOf(sq: string): {info: Pick<SoftInfo, 'careFrom' | 'careTo'>; sure: boolean} {
  const dates = [...reiwa(sq).matchAll(DATE_G)].map((d) => warekiIso(d[1], d[2] === '元' ? '1' : String(Number(d[2])), d[3], d[4])).filter(Boolean);
  if (!dates.length) return {info: {careFrom: '', careTo: ''}, sure: false};
  const info = {careFrom: dates[0], careTo: dates[1] ?? ''};
  return {info, sure: plausibleTerm(info.careFrom, info.careTo)};
}

/** 住所の市町の読み違いを直す：保険者の市町（1字ちがい）、京都郡の「?田町」は苅田町 */
function fixMunicipality(address: string, insurer: CardInsurer): string {
  let a = address.replace(/京都郡[^苅み]田町/, '京都郡苅田町');
  const names = MUNICIPALITIES.filter(([, i]) => i === insurer).map(([n]) => n);
  for (const name of names) {
    if (a.includes(name)) return a;
    const f = findLabel(a, name, 1);
    if (f && f.start <= 8) a = a.slice(0, f.start) + name + a.slice(f.end);
  }
  return a;
}

/** 切り出して読み直した数字の欄の文字から、その欄の値（形に合わない・たしかでないときは null） */
export function rereadInfo(spot: SoftSpot, text: string, today: string): Partial<SoftInfo> | null {
  const sq = fixSoft(text).replace(/\s+/g, '');
  switch (spot) {
    case 'birth': {
      const b = birthOf(sq, today);
      return b.sure ? b.info : null;
    }
    case 'zip': {
      const m = ZIP.exec(sq);
      return m ? {zip: `${m[1]}-${m[2]}`} : null;
    }
    case 'phone':
    case 'officeTel': {
      const m = new RegExp(PHONE_G.source).exec(sq);
      const p = m ? phoneText(m[0]) : '';
      return p && phoneOk(p) ? {[spot]: p} : null;
    }
    case 'insuredNo': {
      const d = sq.replace(/\D/g, '');
      return d.length === 10 ? {insuredNo: d} : null;
    }
    case 'careTerm': {
      const t = termOf(sq);
      return t.sure ? t.info : null;
    }
  }
}

/** いっしょに決める項目（どれか1つの読みから全部を取る） */
const GROUPS: SoftKey[][] = [
  ['name'],
  ['kana'],
  ['era', 'birthY', 'birthM', 'birthD', 'age'],
  ['gender'],
  ['staff'],
  ['zip'],
  ['address'],
  ['phone'],
  ['office'],
  ['manager'],
  ['officeTel'],
  ['care'],
  ['careFrom', 'careTo'],
  ['insurer', 'insurerName'],
  ['insuredNo'],
  ['kind', 'burden', 'welfare'],
  ['rate'],
];

/**
 * 何回か（ページの分け方・下ごしらえを変えて）読んだ結果をまとめる：項目ごとに、たしかな読み・同じ読みの多い方（重みつき）。
 * 2回以上同じに読めたものはたしか。たしかな読みが2つに分かれたら、たしかでない
 */
export function mergeSoft(reads: SoftRead[]): SoftRead {
  const info: SoftInfo = {...NO_SOFT};
  const unsure = new Set<SoftKey>();
  for (const group of GROUPS) {
    const cands = reads
      .filter((r) => r.info[group[0]] || (group[0] === 'kind' && r.info.burden))
      .map((r) => ({r, sig: JSON.stringify(group.map((k) => r.info[k])), sure: !group.some((k) => r.unsure.includes(k)), w: r.weight ?? 1}));
    if (cands.length === 0) continue;
    const stats = new Map<string, {n: number; sure: number; r: SoftRead}>();
    for (const c of cands) {
      const s = stats.get(c.sig) ?? {n: 0, sure: 0, r: c.r};
      s.n += c.w;
      if (c.sure) s.sure += c.w;
      stats.set(c.sig, s);
    }
    // 事業所・住所：前にラベルの読み違いの字がついた読み（計放先見本ケア…）は、うしろが同じ短い読みの味方にする
    if (group[0] === 'office' || group[0] === 'address')
      for (const [sx, x] of stats)
        for (const [sy, y] of stats) {
          const vx = String(x.r.info[group[0]]);
          const vy = String(y.r.info[group[0]]);
          if (sx !== sy && stats.has(sx) && vx.length >= 4 && vy.endsWith(vx) && vy.length - vx.length <= 7) {
            x.n += y.n;
            x.sure += y.sure;
            stats.delete(sy);
          }
        }
    const ranked = [...stats.values()].sort((a, b) => b.sure - a.sure || b.n - a.n);
    const best = ranked[0];
    for (const k of group) (info as Record<string, unknown>)[k] = best.r.info[k];
    const sureSigs = ranked.filter((s) => s.sure > 0).length;
    if (!((best.sure > 0 || best.n >= 2) && sureSigs <= 1)) for (const k of group) unsure.add(k);
  }
  const spots = Object.assign({}, ...[...reads].reverse().map((r) => r.spots ?? {})) as SoftRead['spots'];
  return {info, unsure: (Object.keys(info) as SoftKey[]).filter((k) => unsure.has(k) && info[k]), score: Math.max(0, ...reads.map((r) => r.score)), spots};
}

/**
 * 何回か読んだページから項目を取り出す（careSoftOcr.ts）。
 * kana：フリガナの行を切り出して読み直したもの、rereads：数字の欄を切り出して字をしぼって読み直したもの
 */
export function parseSoft(pages: OcrPage[], today: string, extra: {kana?: {text: string; conf: number}[]; rereads?: {spot: SoftSpot; text: string}[]} = {}): SoftRead {
  const reads = pages.map((p) => parseSoftPage(p, today));
  for (const r of extra.rereads ?? []) {
    const v = rereadInfo(r.spot, r.text, today);
    if (v) reads.push({info: {...NO_SOFT, ...v}, unsure: [], score: 0, weight: 2});
  }
  const merged = mergeSoft(reads);
  const k = pickKana(extra.kana ?? []);
  if (merged.info.kana && !merged.unsure.includes('kana')) merged.unsure.push('kana');
  if (k.kana) {
    // 切り出して読み直したフリガナがあれば、それを使う（全体を読んだときのフリガナは字が小さくて読み違いが多い）
    merged.info.kana = k.kana;
    merged.unsure = merged.unsure.filter((x) => x !== 'kana');
    if (!k.sure) merged.unsure.push('kana');
  }
  return merged;
}

/**
 * フリガナの行を切り出す所（全体を読んだページの位置で）：2つめの氏名（「様」で終わる行）のすぐ上、上の行（部署の行）との間。
 * 見つからなければ null。careSoftOcr.ts がここを大きくして、カタカナだけにしぼって読み直す
 */
export function kanaRect(page: OcrPage): Box | null {
  const rows = softRows(page);
  const t = topRows(rows);
  const ws = t.name2Words;
  if (!t.name2 || ws.length === 0) return null;
  // 2つめの氏名は名前の語だけで測る（右のボタン・ご本人の欄は入れない）
  const n = {x0: Math.min(...ws.map((w) => w.x0)), y0: Math.min(...ws.map((w) => w.y0)), x1: Math.max(...ws.map((w) => w.x1)), h: Math.max(4, median(ws.map((w) => w.y1 - w.y0)))};
  // 上の行（部署の行、なければ1行目）との間。フリガナの行が別の字に読めても（YYtト 名9 など）その行は入れる。上の行がなければ、フリガナらしい行のさらに上
  const above = t.busho ?? t.name1;
  let top: number;
  if (above) top = Math.max(above.y1 + 1, n.y0 - n.h * 2.4);
  else {
    let upper = rows.indexOf(t.name2) - 1;
    while (upper >= 0 && rows[upper].y0 > n.y0 - n.h * 2.2 && cleanKana(rows[upper].text).replace(/　/g, '').length >= Math.max(1, rows[upper].sq.length * 0.5)) upper--;
    // 上下は、となりの行の字にかからないように（大きな氏名の字の頭が入ると読み違える）
    top = upper >= 0 ? rows[upper].y1 + 1 : Math.max(0, n.y0 - n.h * 1.6);
  }
  const bottom = n.y0 - 1;
  if (bottom - top < n.h * 0.3) return null;
  return {x0: Math.max(0, n.x0 - n.h * 0.3), y0: top, x1: n.x0 + Math.max((n.x1 - n.x0) * 1.6, n.h * 14), y1: bottom};
}

/**
 * 画面の字の行（上下の位置）を、画素の濃さから探す（読み取りに頼らないので、1回目に読めなかった行も切り出せる）。
 * lum：明るさ（0〜255。1画素1つ。色の付いた所は白くしてあるもの）、w・h：画像の幅・高さ。
 * 縦の線（欄の枠。高さの6割から濃い列）と横の線（幅の6割から濃い行）は字に数えない。濃い画素が3つからある行のつながりが字の行（すき間1画素はつなぐ、高さ3画素からの行）
 */
export function inkLines(lum: ArrayLike<number>, w: number, h: number, dark = 170): {y0: number; y1: number}[] {
  const col = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lum[y * w + x] < dark) col[x]++;
  const rowCount = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (col[x] <= h * 0.6 && lum[y * w + x] < dark) n++;
    rowCount[y] = n > w * 0.6 ? 0 : n;
  }
  const need = Math.max(3, Math.round(w * 0.003));
  const runs: {y0: number; y1: number}[] = [];
  for (let y = 0; y < h; y++) {
    if (rowCount[y] < need) continue;
    const last = runs[runs.length - 1];
    if (last && y - last.y1 <= 2) last.y1 = y + 1;
    else runs.push({y0: y, y1: y + 1});
  }
  // 高すぎる行（となりの行と字がふれてつながったもの）は、行の中ほどの一番うすい所で分ける
  const split = (r: {y0: number; y1: number}, med: number): {y0: number; y1: number}[] => {
    if (r.y1 - r.y0 < med * 1.6) return [r];
    let at = -1;
    let max = 0;
    for (let y = r.y0; y < r.y1; y++) max = Math.max(max, rowCount[y]);
    for (let y = r.y0 + Math.round(med * 0.5); y < r.y1 - Math.round(med * 0.5); y++) if (at < 0 || rowCount[y] < rowCount[at]) at = y;
    if (at < 0 || rowCount[at] > max * 0.2) return [r];
    return [...split({y0: r.y0, y1: at}, med), ...split({y0: at + 1, y1: r.y1}, med)];
  };
  const ok = runs.filter((r) => r.y1 - r.y0 >= 3);
  const hs = ok.map((r) => r.y1 - r.y0).sort((a, b) => a - b);
  const med = hs[Math.floor((hs.length - 1) / 2)] ?? 0; // 低い方のまんなか（つながった行は高い）
  return ok.flatMap((r) => split(r, med)).filter((r) => r.y1 - r.y0 >= 3);
}

/**
 * 画面のスクリーンショットらしいか（画素 RGBA）：地の色が平ら（16段にまとめた色で、一番多い色が 35% から・多い3色で 60% から）。
 * スマホで写した保険証の写真は光のむらで色が散らばるので、介護ソフトとしては読まない（すぐに介護保険証として読む）
 */
export function screenLike(rgba: Uint8ClampedArray | Uint8Array): boolean {
  const counts = new Map<number, number>();
  let n = 0;
  for (let i = 0; i + 2 < rgba.length; i += 12) {
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    n++;
  }
  const top = [...counts.values()].sort((a, b) => b - a);
  return n > 0 && top[0] / n >= 0.35 && (top[0] + (top[1] ?? 0) + (top[2] ?? 0)) / n >= 0.6;
}

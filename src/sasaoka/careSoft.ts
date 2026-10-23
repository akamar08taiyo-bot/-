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
function editDistance(a: string, b: string): number {
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
const ZIP = /(?<!\d)(\d{3})-?(\d{4})(?!\d)/;
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
  return t
    .replace(/[^ァ-ヺー\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('　');
}

/**
 * 切り出して読んだフリガナの行の語から、フリガナの文字（姓と名の間＝字の間で一番大きなすき間に全角の空白）。
 * 横に引きのばして読むと、字ごとに語に分かれることがあるので、読み取りの空白ではなく、すき間の大きさで分ける
 */
export function kanaOfWords(words: OcrWord[]): string {
  const chars = words
    .flatMap((w) => (w.chars?.length ? w.chars : [{text: w.text, x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1}]))
    .map((c) => ({...c, t: cleanKana(c.text).replace(/　/g, '')}))
    .filter((c) => c.t); // 字の順は読み取りの順のまま（字の四角は前後にはみ出すことがある）
  if (chars.length === 0) return '';
  const gaps = chars.slice(1).map((c, i) => c.x0 - chars[i].x1);
  const order = gaps.map((g, i) => [g, i] as const).sort((a, b) => b[0] - a[0]);
  const h = median(chars.map((c) => c.y1 - c.y0));
  const split = order.length && order[0][0] > h * 0.25 && (order.length === 1 || order[0][0] > Math.max(order[1][0], 0) * 1.6) ? order[0][1] : -1;
  const text = chars.map((c) => c.t);
  return split < 0 ? text.join('') : `${text.slice(0, split + 1).join('')}　${text.slice(split + 1).join('')}`;
}

/** フリガナとしてたしかか：姓と名の2つ・どれも2字から（名前のフリガナに長音はまずない） */
const kanaOk = (k: string) => {
  const parts = k.split('　');
  return parts.length === 2 && parts.every((p) => p.length >= 1) && k.replace(/　/g, '').length >= 3 && !k.includes('ー');
};

/**
 * 何回か読んだフリガナ（切り出して字をしぼって読んだもの）から1つ選ぶ：同じ読みが2回あり、どちらも自信が高ければ（70から）たしか。
 * なければ自信の高い方（たしかでない）。小さな半角カタカナは、似た読み違いを2回することがあるので、自信も見る
 */
export function pickKana(reads: {text: string; conf: number}[]): {kana: string; sure: boolean} {
  const cands = reads.map((r) => ({kana: cleanKana(r.text), conf: r.conf})).filter((r) => r.kana.replace(/　/g, '').length >= 2);
  if (cands.length === 0) return {kana: '', sure: false};
  for (const c of cands) {
    const same = cands.filter((x) => x.kana === c.kana);
    if (same.length >= 2) return {kana: c.kana, sure: kanaOk(c.kana) && same.every((x) => x.conf >= 70)};
  }
  const best = [...cands].sort((a, b) => b.conf - a.conf)[0];
  return {kana: best.kana, sure: false};
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

/** 給付情報の種類（少しの読み違いは許す） */
function kindOf(sq: string): {kind: SoftKind; exact: boolean} {
  const high = /高.{0,2}?([23２３])割/.exec(sq);
  if (high) return {kind: high[1] === '2' || high[1] === '２' ? '高額２割' : '高額３割', exact: /高額[23]割/.test(sq)};
  const single = findLabel(sq, '保険単独');
  if (single) return {kind: '保険単独', exact: single.dist === 0};
  if (/生保/.test(sq)) return {kind: '生保', exact: true};
  if (/[牛主]保/.test(sq) && !/保険/.test(sq.replace(/保険給付率?/, ''))) return {kind: '生保', exact: false};
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
      return lab('保険者情報') + lab('被保険者番号') + (insurerOfName(r.sq).insurer ? 2 : 0) + (/(?<!\d)\d{10}(?!\d)/.test(r.sq) ? 1 : 0);
    case 'kyufu':
      return lab('給付情報') + lab('保険給付率') + (kindOf(r.sq).kind ? 2 : 0) + (/[1-9]0%/.test(r.sq) ? 1 : 0);
    case 'tel':
      return lab('電話番号') + lab('携帯電話') + (/^Te[lI1]/i.test(r.sq) ? 1 : 0) + (/(?<!\d)0\d{9,10}(?!\d)/.test(r.sq.replace(/-/g, '')) ? 1 : 0);
  }
}

/** 介護ソフトの画面らしさに数えるラベル（介護保険証にもある「被保険者番号」「電話番号」は数えない） */
const SCORE_LABELS = [...INFO_LABELS.filter((l) => l !== '被保険者番号'), ...OTHER_LABELS.filter((l) => !/電話/.test(l))];
/** 介護ソフトの画面らしさ：線で区切った行などのラベルがいくつ見つかったか */
export function softScore(rows: SoftRow[]): number {
  const all = rows.map((r) => r.sq);
  return SCORE_LABELS.filter((l) => all.some((sq) => findLabel(sq, l))).length;
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
];
function insurerFuzzy(sq: string): {insurer: CardInsurer; name: string; exact: boolean} {
  const exact = insurerOfName(sq);
  if (exact.insurer) return {...exact, exact: true};
  for (const [name, insurer] of MUNICIPALITIES) if (findLabel(sq, name, 1)) return {insurer, name: insurerOfName(name).name, exact: false};
  return {insurer: '', name: '', exact: false};
}

/** 1回読んだ画面（1ページ）から項目を取り出す。today：年齢の確かめに使う日 'YYYY-MM-DD' */
export function parseSoftPage(page: OcrPage, today: string): SoftRead {
  const rows = softRows(page);
  const info: SoftInfo = {...NO_SOFT};
  const unsure = new Set<SoftKey>();
  const spots: Partial<Record<SoftSpot, Box>> = {};
  const used = new Set<SoftRow>();

  // 1行目：氏名 様 生年月日生 年齢歳 性別
  const name1 = rows.find((r) => BIRTH.test(r.sq));
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
    // 名前：生年月日より左の語（生年月日と同じ語に読めた名前の字も。「様」から右は除く）
    const bi = wordAt(name1, m.index);
    const bt = fixSoft(name1.words[bi].text);
    const pre = bt.slice(0, Math.max(0, bt.search(/明治|大正|昭和|平成/)));
    const left = [...name1.words.slice(0, bi), ...(pre ? [{...name1.words[bi], text: pre}] : [])];
    const n = nameOfWords(left.map((w) => ({...w, text: fixSoft(w.text).replace(/様.*$/, '')})).filter((w) => w.text.trim()), name1.h);
    if (n.name) names.push(n);
  }

  // 部署の行（営業所の名前・営業の担当）：1行目のすぐ下（1行目が読めなければ上の方）
  const i1 = name1 ? rows.indexOf(name1) : -1;
  const busho = rows.slice(i1 + 1, i1 + (i1 < 0 ? 5 : 3)).find((r) => /営業所/.test(r.sq) || findLabel(r.sq, '部署', 0) !== null);
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

  // 2つめの氏名（フリガナの下。「様」で終わる）と、その上のフリガナの行
  const name2 = rows.find((r) => !used.has(r) && (!name1 || r.y0 > name1.y0) && /様$/.test(r.sq) && !BIRTH.test(r.sq) && r.sq.length <= 14);
  if (name2) {
    used.add(name2);
    const n = nameOfWords(name2.words.map((w) => ({...w, text: fixSoft(w.text).replace(/様.*$/, '')})), name2.h);
    if (n.name) names.push(n);
    const above = rows.filter((r) => !used.has(r) && r.y1 <= name2.y0 + name2.h * 0.3 && (!busho || r.y0 >= busho.y1 - busho.h * 0.3) && (!name1 || r.y0 >= name1.y1 - name1.h * 0.3));
    const kanaRow = above.find((r) => cleanKana(r.text).replace(/　/g, '').length >= 2);
    if (kanaRow) {
      used.add(kanaRow);
      info.kana = cleanKana(kanaRow.text);
    }
  }
  // 氏名：2つ読めて同じならたしか。ちがえば大きい方（フリガナの下）で、たしかでない
  names = names.filter((n) => n.name.replace(/　/g, '').length >= 2);
  if (names.length) {
    const spaced = names.find((n) => n.name.includes('　'));
    const flat = new Set(names.map((n) => n.name.replace(/　/g, '')));
    const pick = names[names.length - 1];
    info.name = spaced && spaced.name.replace(/　/g, '') === pick.name.replace(/　/g, '') ? spaced.name : pick.name;
    if (flat.size > 1 || !names.every((n) => n.clean)) unsure.add('name');
  }
  // 全体を読んだときのフリガナは字が小さくて読み違いが多いので、いつも確かめてもらう（切り出して読み直したものは parseSoft で）
  if (info.kana) unsure.add('kana');

  // 〒 郵便番号 住所（地図のボタンが字に読めたもの・欄の切れ目のうしろの短いごみは除く）
  const zipRow = rows.find((r) => !used.has(r) && ZIP.test(r.sq) && new RegExp(`\\d{4}.*[${CJK}]`).test(r.sq) && !/電話|Tel|TEL/.test(r.sq.slice(0, 6)));
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
    const head = findLabel(kyo.sq, '居宅情報');
    const inner = findLabel(kyo.sq, '委託先居宅');
    const ends = [head, inner].filter((x): x is NonNullable<typeof x> => !!x).map((l) => l.end);
    const from = ends.length ? textEnd(kyo, Math.max(...ends)) : 0;
    let region = kyo.text.slice(from, telAt ? textAt(kyo, telAt.index!) : kyo.text.length);
    // 「Tel」のラベル（読み違えて rs・ra・Te1 など）と、まわりのごみ
    region = region.replace(/[\sA-Za-z0-9:：.。、・,'"|]+$/, '').replace(new RegExp(`^[^${CJK}]+`), '');
    // 「委託先居宅」のラベルが読めなかったとき（放先局・計旗先居宅 などに読めた）：「先」とそのあとの2字までがラベル
    if (!inner) {
      const lab = /^[^\t]{0,3}?先[居局語記詞導宅字宇上計言證証]{0,2}/.exec(region.replace(/ /g, ''));
      if (lab) {
        let n = 0;
        let cut = 0;
        while (cut < region.length && n < lab[0].length) {
          if (region[cut] !== ' ') n++;
          cut++;
        }
        region = region.slice(cut).replace(/^\s+/, '');
        unsure.add('office');
      }
    }
    const cells = region
      .split('\t')
      .map((c) => c.trim())
      .filter(Boolean);
    let office = region;
    let manager = '';
    const last = cells.length >= 2 ? nameOfText(cells[cells.length - 1]) : null;
    if (last && last.name && PERSON.test(last.name.replace(/　/g, '')) && !OFFICE_END.test(last.name)) {
      manager = last.name;
      office = cells.slice(0, -1).join(' ');
    } else {
      // 欄の切れ目がないとき：事業所の名前の終わりの言葉（センター・事業所…）のうしろが名前
      const tokens = region.split(/\s+/).filter(Boolean);
      const at = tokens.map((t) => OFFICE_END.test(t)).lastIndexOf(true);
      if (at >= 0 && at < tokens.length - 1) {
        office = tokens.slice(0, at + 1).join(' ');
        manager = nameOfText(tokens.slice(at + 1).join(' ')).name;
      } else {
        const flat = region.replace(/\s+/g, '');
        const m = new RegExp(`^(.*(?:センター|事業所|ステーション|ケアプラン|支援室|相談所|サービス|苑|園))([${CJK}]{2,6})$`).exec(flat);
        if (m) {
          office = m[1];
          manager = m[2];
          unsure.add('manager');
        }
      }
    }
    info.office = office.replace(/\s+/g, '');
    info.manager = manager;
    if (!info.office || info.office.length < 3 || new RegExp(`[^${CJK}A-Za-z0-9・()]`).test(info.office)) unsure.add('office');
    if (info.manager && (info.manager.split('　').length !== 2 || !PERSON.test(info.manager.replace(/　/g, '')))) unsure.add('manager');
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

const RATE = /([1-9]0)\d?%/;

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
  const name1 = rows.findIndex((r) => BIRTH.test(r.sq));
  const name2 = rows.findIndex((r, i) => i > name1 && /様$/.test(r.sq) && !BIRTH.test(r.sq) && r.sq.length <= 14);
  if (name2 < 0) return null;
  const n2 = rows[name2];
  // 上の行：フリガナらしい行（2つめの氏名のすぐ上でカタカナの多い行）があればそのさらに上
  let upper = name2 - 1;
  while (upper >= 0 && upper > name1 && rows[upper].y0 > n2.y0 - n2.h * 2.2 && cleanKana(rows[upper].text).replace(/　/g, '').length >= Math.max(1, rows[upper].sq.length * 0.5)) upper--;
  // 上下は、となりの行の字にかからないように（大きな氏名の字の頭が入ると読み違える）。左は欄の線が入らないように少しだけ
  const top = upper >= 0 ? rows[upper].y1 + 1 : Math.max(0, n2.y0 - n2.h * 1.6);
  const bottom = n2.y0 - 1;
  if (bottom - top < n2.h * 0.3) return null;
  return {x0: Math.max(0, n2.x0 - n2.h * 0.3), y0: top, x1: n2.x0 + Math.max((n2.x1 - n2.x0) * 1.6, n2.h * 14), y1: bottom};
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

// 申請書：保険者ごとにいただいた Excel の原本（苅田町・行橋市・みやこ町・広域連合＝築上町など）に、見積書の内容を転記する（ユーザーの指示）。
// 転記するのは 被保険者氏名・住所・被保険者番号（10マス。空いたマスは0）・改修の内容・箇所及び規模（「①玄関　手すりの取付　L=600mm」。内訳明細書・平面図も同じ書き方）と、
// 申請書の画面で入れた フリガナ・生年月日・郵便番号・電話番号・住宅の所有者・理由書作成者・完了の日・改修費用（なければ見積書から）。着工予定日は書かない（空白）。
// 改修の内容は①②（写真番号）ごとに1行。性別・元号・要介護状態区分・改修状況は、選んだものを丸（楕円の図形）で囲む。
// 原本のほかのシート（事後申請書・承諾書・委任状・平面図・写真）・空欄・罫線・図形はそのまま残す（決めた欄の文字だけを書きかえる。足すのは丸・平面図の工事内容・写真）。
// 事後申請書など、転記した欄を参照する式は、Excel で開いたときに計算し直す（保存しておく答えも同じ値にしておく）。
// 書き込んだ申請書（Excel）から 氏名・住所・被保険者番号・改修の箇所 を読むこともできる（readShinsei。いまはテストで使う）。

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {estimateTotals, isBlankRow} from './calc.ts';
import type {EstimateRates, EstimateSettings} from './calc.ts';
import {circled, jobInsurer, KINDS, MARK_INFO, MARK_KEYS, NO_MARKS, NO_SHINSEI, photoNumbers, reiwa} from './estimateForms.ts';
import type {Insurer, Job, Place, ShinseiInfo, ShinseiMarks} from './types.ts';

/** 申請書の原本の、1つのシートで転記する欄（番地）。ないものは書かない */
export type ShinseiSheet = {
  sheet: string; // シートの名前
  name?: string; // 被保険者氏名
  nameFormat?: string; // 氏名の欄に入れる文字（{name} を氏名にする。平面図の表題「　山田　様　邸　平面図」）
  address?: string; // 住所
  insuredNo?: string[]; // 被保険者番号の10マス（左から）
  works?: string; // 改修の内容・箇所及び規模（折り返しの欄。1行に1箇所）
  kinds?: {places: string; works: string}[]; // 改修の種類（①手すりの取付〜⑥付帯工事）ごとの行の、箇所の欄と工事内容の欄（住宅改修内訳明細書）
  // 写真貼付用紙：原本の写真番号の欄（①・写真番号①・№①）を読み、その写真番号の改修場所を改修箇所の欄（place）に入れ、
  // その写真番号の箇所の写真を改修前・改修後の枠（番地の範囲。before・after）に貼る（同じ写真番号の用紙が2枚あれば、最初の用紙だけ）
  photoPlace?: {photo: string; place?: string; before?: string; after?: string};
  // 平面図：写真番号の順の工事内容（改修の内容と同じ行「玄関① 木製L字手すり L=600×850㎜」）を空いた所に書く（ユーザーの指示）。
  // cell＝折り返しの欄に書く（みやこ町の下の欄）、box＝その範囲にテキストボックスを置く（前の申請の平面図と同じ）。平面図そのものはユーザーが Excel で描く
  legend?: {cell?: string; box?: string};
  marks?: MarkCell[]; // 丸で囲む欄（性別「男　　・　　女」など）
  texts?: TextCell[]; // 申請書の画面で入れた項目（フリガナ・生年月日・電話番号など）を書く欄と書き方
};

/** 申請書の画面で入れた項目の文字（書き方の {名前} に入れる値） */
export type ShinseiTexts = Record<'kana' | 'zip' | 'phone' | 'owner' | 'relation' | 'reasonOffice' | 'reasonName' | 'era' | 'y' | 'm' | 'd' | 'start' | 'end' | 'cost', string>;

/**
 * 申請書の画面で入れた項目を書く欄：format の {名前}（ShinseiTexts）に値を入れて書く（「本人との関係（{relation}）」）。
 * format の値がどれも空なら原本の文字のまま。as：number＝数で書く（改修費用。表示形式のある欄）、date＝Excel の日付で書く
 */
export type TextCell = {cell: string; format: string; as?: 'number' | 'date'};
const T = (cell: string, format: string, as?: TextCell['as']): TextCell => (as ? {cell, format, as} : {cell, format});

/**
 * 丸で囲む欄：key の値（MARK_INFO の options）を、cell の文字の中から探して囲む。
 * needles は options と同じ順の、原本の書き方（「要支援１」）。前の値のうしろから順に探す
 */
export type MarkCell = {key: keyof ShinseiMarks; cell: string; needles: string[]};

/** 申請書の原本の、転記する欄。最初のシートで、どの保険者の申請書かを見分ける */
export type ShinseiMap = {
  title: string; // ファイル名に使う（苅田町申請書）
  sheets: ShinseiSheet[];
};

/** 列の番号（A＝1） */
export const colNum = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n: number): string => (n <= 0 ? '' : colName(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)));
/** 横に並んだマス（start から n 個） */
const boxes = (start: string, n: number, row: number) => Array.from({length: n}, (_, i) => `${colName(colNum(start) + i)}${row}`);
/** 丸数字（①〜⑳）→ 番号 */
const circledNum = (ch: string) => ch.charCodeAt(0) - 0x2460 + 1;

/** 広域連合の写真貼付用紙（10枚。被保険者氏名と番号の欄がある） */
const KOUIKI_PHOTO_SHEETS = ['写真貼付用紙', ...[6, 2, 7, 3, 8, 4, 9, 5, 10].map((n) => `写真貼付用紙 (${n})`)];
/** 住宅改修内訳明細書（様式第2号別紙）の改修の種類の行（①14行目〜⑥24行目）：箇所はその下の行の D、工事内容は K（2行分） */
const KIND_ROWS = [14, 16, 18, 20, 22, 24].map((r) => ({places: `D${r + 1}`, works: `K${r}`}));
/** 写真貼付用紙（みやこ町・広域連合）：被保険者氏名（B4）・被保険者番号（D4〜M4）・写真番号（R4）・改修箇所（B5）・改修前の写真（A9:S31）・改修後（A34:S58） */
const PHOTO_SHEET = {name: 'B4', insuredNo: boxes('D', 10, 4), photoPlace: {photo: 'R4', place: 'B5', before: 'A9:S31', after: 'A34:S58'}};
/** 苅田町の写真の用紙（「1 」「1  (3)」…。写真番号①〜⑨は G42 の「写真番号①」）：改修前の写真（A7:H22）・改修後（A24:H40）。改修箇所はチェックの欄なので書かない */
const KANDA_PHOTO_SHEETS = ['1 ', '1  (3)', '1  (2)', ...[4, 5, 6, 7, 8, 9].map((n) => `1  (${n})`)];
const KANDA_PHOTO = {photoPlace: {photo: 'G42', before: 'A7:H22', after: 'A24:H40'}};
/** 行橋市の写真添付用紙（№①〜⑧は M2）：改修場所（E4。「改 修 場 所 ：」のうしろ）・改修前の写真（B7:O28）・改修後（B30:O51） */
const YUKUHASHI_PHOTO_SHEETS = ['住改・写真 ①', '住改・写真②', '住改・写真③', '住改・写真④', '住改・写真④ (3)', '住改・写真④ (4)', '住改・写真④ (5)', '住改・写真④ (2)'];
const YUKUHASHI_PHOTO = {photoPlace: {photo: 'M2', place: 'E4', before: 'B7:O28', after: 'B30:O51'}};
// 丸で囲む欄（原本の書き方）
const GENDER = (cell: string): MarkCell => ({key: 'gender', cell, needles: ['男', '女']});
const ERA = (cell: string): MarkCell => ({key: 'era', cell, needles: ['明', '大', '昭']});
const RENOVATED = (cell: string): MarkCell => ({key: 'renovated', cell, needles: ['有', '無']});
/** 要介護状態区分。行橋市は「要支援　１・２」と書いてあるので、要支援は数字だけを囲む */
const CARE = (cell: string, support = ['要支援１', '要支援２']): MarkCell => ({key: 'care', cell, needles: [...support, '要介護１', '要介護２', '要介護３', '要介護４', '要介護５']});

/**
 * 保険者ごとの申請書の原本と、転記する欄（原本を見て決めた）。
 * 苅田町：「事前申請書」のシート。事後申請書は事前申請書を参照する式なので、同じ内容になる（丸は事後申請書にもつける）
 * 行橋市：「住改・受領委任払」のシート
 * 丸：苅田町・行橋市は 元号（明・大・昭）・性別・要介護状態区分。みやこ町・広域連合は 性別・現在までの改修状況（承認と支給の申請書の両方）
 * みやこ町：承認届出書の氏名・住所・番号（支給申請書・内訳明細書の氏名・番号・住所は承認届出書を参照する式。支給申請書の氏名だけは式でないので書く）。
 *   改修の内容は「様式第２号別紙参照」なので、住宅改修内訳明細書の改修の種類の行に 箇所（玄関・トイレ）と工事内容を書く。平面図の表題・写真（1）〜（4）も
 * 広域連合（築上町など。福岡県介護保険広域連合の住宅改修申請関係様式集）：承認申請書（様式第2号）・支給申請書（受領委任払用・様式第7号）の
 *   氏名・住所・番号。改修の内容は「別紙参照」なので、住宅改修内訳明細書（様式第2号別紙）の改修の種類の行に 箇所（玄関・トイレ）と工事内容を書く。
 *   平面図の表題と写真貼付用紙（10枚）の氏名・番号・改修箇所も入れる。償還払い用・取下げ・承諾書・理由書（介護支援専門員が書く）は書かない
 */
export const SHINSEI: Partial<Record<Insurer, ShinseiMap>> = {
  kanda: {
    title: '苅田町申請書',
    sheets: [
      {
        sheet: '事前申請書',
        name: 'J7',
        address: 'J11',
        insuredNo: boxes('X', 10, 6),
        works: 'J14',
        marks: [ERA('J9'), GENDER('W9'), CARE('J12')],
        texts: [
          T('J6', '{kana}'),
          T('J9', '明　・　大　・　昭　{y}年{m}月{d}日生'),
          T('J10', '〒{zip}'),
          T('AB11', '{phone}'),
          T('J13', '{owner}'),
          T('W13', '本人との関係（{relation}）'),
          T('Y16', '{end}'), // 着工予定日（Y15）は書かない（ユーザーの指示「申請書の着工予定日は空白にする」）
          T('J17', '{cost}円'),
        ],
      },
      {sheet: '事後申請書', marks: [ERA('I9'), GENDER('V9'), CARE('I12')]},
      // 平面図の表題は「（氏名）　様邸　平面図」（氏名は C2:AB6、「様邸　平面図」は原本の AC2）。工事内容は下の空いた所にテキストボックスで
      {sheet: '平面図  (2)', name: 'C2', nameFormat: '{name}', legend: {box: 'C54:AQ68'}},
      ...KANDA_PHOTO_SHEETS.map((sheet) => ({sheet, ...KANDA_PHOTO})),
    ],
  },
  yukuhashi: {
    title: '行橋市申請書',
    sheets: [
      {
        sheet: '住改・受領委任払',
        name: 'F5',
        address: 'F11',
        insuredNo: boxes('Z', 10, 7),
        works: 'F14',
        marks: [ERA('F9'), GENDER('Y9'), CARE('F12', ['１', '２'])],
        texts: [
          T('F4', '{kana}'),
          T('F9', '明・大・昭　{y}年{m}月{d}日生'),
          T('G10', '{zip}'), // 「〒」は原本の F10
          T('Y10', '{phone}'),
          T('F13', '{owner}'),
          T('V13', '本人との関係（{relation}）'),
          T('AB18', '{end}'), // 着工予定日（AB16）は書かない（ユーザーの指示）
          T('F20', '{cost}', 'number'),
        ],
      },
      {sheet: '平面図  (2)', name: 'C2', nameFormat: '{name}', legend: {box: 'C54:AQ68'}},
      ...YUKUHASHI_PHOTO_SHEETS.map((sheet) => ({sheet, ...YUKUHASHI_PHOTO})),
    ],
  },
  miyako: {
    title: 'みやこ町申請書',
    sheets: [
      {
        sheet: '住宅改修承認届出書',
        name: 'I5',
        address: 'I9',
        insuredNo: boxes('W', 10, 4),
        marks: [GENDER('AA7'), RENOVATED('X23')],
        texts: [
          T('I4', '{kana}'),
          T('I7', '{era}　{y}年{m}月{d}日生'), // 原本は「昭和」と書いてある
          T('I8', '〒{zip}'),
          T('Z9', '{phone}'),
          T('I10', '{owner}　　　　本人との関係（{relation}）'),
          T('N11', '{reasonOffice}'),
          T('N12', '{reasonName}'),
          T('I23', '{cost}', 'number'),
        ],
      },
      // フリガナ・生年月日・住所・住宅の所有者・改修費用は承認届出書を参照する式。電話番号と着工日・完成日（日付の欄）は書く
      {sheet: '住宅改修費支給申請書(受領委任払用)', name: 'J6', marks: [GENDER('AB8'), RENOVATED('X18')], texts: [T('AA10', '{phone}'), T('J16', '{start}', 'date'), T('X16', '{end}', 'date')]},
      {sheet: '住宅改修内訳明細書', kinds: KIND_ROWS},
      {sheet: '平面図', name: 'A1', nameFormat: '{name}　邸　平面図', legend: {cell: 'M48'}}, // 下の M48:AW48 は左上にそろえて折り返す空いた欄
      ...[1, 2, 3, 4].map((n) => ({sheet: `写真 (${n})`, ...PHOTO_SHEET})),
    ],
  },
  kouiki: {
    title: '広域連合申請書',
    sheets: [
      {
        sheet: '様式第2号（住宅改修承認申請書）',
        name: 'J6',
        address: 'J9',
        insuredNo: boxes('X', 10, 7),
        marks: [GENDER('AB8'), RENOVATED('Y22')],
        texts: [
          T('J5', '{kana}'),
          T('J8', '{era}　{y}年{m}月{d}日生'),
          T('J11', '{owner}　　　　本人との関係（{relation}）'),
          T('O13', '{reasonOffice}'),
          T('O14', '{reasonName}'),
          T('J22', '{cost}円'),
        ],
      },
      {
        sheet: '様式第7号（住宅改修費支給申請書（受領委任払用）',
        name: 'J6',
        address: 'J9',
        insuredNo: boxes('X', 10, 7),
        marks: [GENDER('AB8'), RENOVATED('X16')],
        texts: [
          T('J5', '{kana}'),
          T('J8', '{era}　{y}年{m}月{d}日生'),
          T('AA10', '{phone}'),
          T('J11', '{owner}　　　　本人との関係（{relation}）'),
          T('X12', '{start}'),
          T('X14', '{end}'),
          T('J16', '{cost}'), // 「円」は原本の R16
          T('J18', '{reasonOffice}　{reasonName}'), // 理由書作成者名及び事業所名（前の申請の書き方：事業所名　氏名）
        ],
      },
      {sheet: '様式第2号別紙（住宅改修内訳明細書）', name: 'I6', insuredNo: boxes('W', 10, 7), kinds: KIND_ROWS, texts: [T('I5', '{kana}')]},
      {sheet: '平面図 (2)', name: 'A1', nameFormat: '　{name}　様　邸　平面図', legend: {box: 'B37:H52'}}, // 前の申請と同じく、平面図の下にテキストボックス
      ...KOUIKI_PHOTO_SHEETS.map((sheet) => ({sheet, ...PHOTO_SHEET})),
    ],
  },
};

// ---------------------------------------------------------------- 転記する内容

/** 改修の種類（①手すりの取付〜⑥付帯工事）ごとの 箇所（玄関・トイレ）と工事内容の行 */
export type ShinseiKind = {places: string; works: string[]};
export type ShinseiValues = {
  name: string;
  address: string;
  insuredNo: string;
  works: string[];
  kinds: ShinseiKind[];
  photos: Record<number, string>; // 写真番号 → 改修場所（写真貼付用紙の改修箇所）
  marks: ShinseiMarks; // 丸で囲む値
  texts: ShinseiTexts; // 申請書の画面で入れた項目の文字（書き方の {名前} の値）
  cost: number | null; // 改修費用（数で書く欄。なければ null）
  start: string; // 着工・完了の日（'YYYY-MM-DD'。日付で書く欄）
  end: string;
  photoImages?: Record<number, PhotoImages>; // 写真番号 → 写真貼付用紙に貼る写真（Excel に保存するときだけ。画面のプレビューは写真を別に重ねる）
};

/** 写真貼付用紙に貼る写真（JPEG のバイト列と、縦横の画素） */
export type PhotoImage = {bytes: Uint8Array; w: number; h: number};
export type PhotoImages = {before?: PhotoImage; after?: PhotoImage};

/** 見積書に出る箇所ごとの、改修の内容の行と改修の種類（1〜6）・改修場所。見積書に出ない箇所（行のない箇所）は入れない */
function workLines(job: Pick<Job, 'places'>, rates: EstimateRates): {kind: number; name: string; line: string}[] {
  const photos = photoNumbers(job, rates);
  const out: {kind: number; name: string; line: string}[] = [];
  for (const p of job.places) {
    const photo = photos.get(p.id);
    if (photo !== undefined) out.push({kind: p.kind, name: p.name.trim(), line: workLine(p, photo)});
  }
  return out;
}

const BASE_PLATE = /ベースプレート|補強板|取付板/;

/**
 * 改修の内容の1行（4つの保険者の申請書の改修の内容・内訳明細書の工事内容・平面図の工事内容。どれも同じ書き方）。
 * ユーザーの指示（2026-10-21）「①玄関　手すりの取付（項目名）L=600mm と表記する」：写真番号・改修場所、改修の種類の名前、寸法を全角のすき間で区切る。
 * 寸法は申請書のタブで入れる（`Place.dims`）：手すりは長さ（L=）と高さ（H=。任意）、段差の解消は幅・奥行・高さ（「W600mm D350mm H150mm」）
 */
function workLine(p: Place, photo: number): string {
  return [`${circled(photo)}${p.name.trim()}`, workText(p)].filter(Boolean).join('　');
}

/**
 * 寸法（mm）の数：打ったまま（全角は半角、うしろの mm は外す）。長さ（many）は区切り（, 、 x * すき間）を「×」に。
 * ただし「1,600」のような3けた区切り（前が1〜2けた）は区切りにしない
 */
function mmText(v: string | undefined, many = false): string {
  const t = (v ?? '').normalize('NFKC').trim().replace(/\s*mm$/i, '');
  return many
    ? t
        .replace(/(^|\D)(\d{1,2}),(\d{3})(?!\d)/g, '$1$2$3')
        .replace(/\s*[,、xX*×\s]+\s*/g, '×')
    : t;
}

/** 見積書の手すりの使う長さ（mm。切って使う部材など長さの入った部材。補強板・ベースプレートはのぞく。2本以上は「600×850」） */
export function estimateLength(p: Pick<Place, 'rows'>): string {
  const mm: string[] = [];
  for (const r of p.rows) {
    if (r.kind !== 'material' || isBlankRow(r) || !(r.lengthCm > 0) || !(r.qty > 0) || BASE_PLATE.test(`${r.estText ?? ''} ${r.name}`)) continue;
    for (let i = 0; i < Math.max(1, Math.round(r.qty)); i++) mm.push(String(Math.round(r.lengthCm * 10)));
  }
  return mm.join('×');
}

/** 改修の内容の寸法：手すりは「L=600mm H=800mm」（長さを入れていなければ見積書の使う長さ）、段差の解消は「W600mm D350mm H150mm」。ほかの種類はなし */
function dimsText(p: Pick<Place, 'kind' | 'rows' | 'dims'>): string {
  const d = p.dims ?? {};
  if (p.kind === 1) {
    const l = mmText(d.l, true) || estimateLength(p);
    const h = mmText(d.h);
    return [l && `L=${l}mm`, h && `H=${h}mm`].filter(Boolean).join(' ');
  }
  if (p.kind !== 2) return '';
  return (
    [
      ['W', d.w],
      ['D', d.d],
      ['H', d.h],
    ] as const
  )
    .map(([k, v]) => (mmText(v) ? `${k}${mmText(v)}mm` : ''))
    .filter(Boolean)
    .join(' ');
}

/** 改修の内容の文（写真番号・改修場所のうしろ）：改修の種類の名前・寸法・そのほか（`Place.shinseiText`。うしろに足す）。「手すりの取付　L=600mm H=800mm」 */
export function workText(p: Pick<Place, 'kind' | 'rows' | 'dims' | 'shinseiText'>): string {
  return [KINDS[p.kind - 1] ?? '', dimsText(p), p.shinseiText?.trim() ?? ''].filter(Boolean).join('　');
}

/** 改修の内容・箇所及び規模（苅田町・行橋市の申請書の欄）・平面図の工事内容：箇所ごとに1行「①玄関　手すりの取付　L=600mm」。写真番号・改修場所は見積書と同じ */
export function shinseiWorks(job: Pick<Job, 'places'>, rates: EstimateRates): string[] {
  return workLines(job, rates).map((w) => w.line);
}

/** 改修の種類ごと（6行。内訳明細書）：箇所は改修場所を「・」でつなぐ（同じ名前は1つ）。工事内容は申請書と同じ「①玄関　手すりの取付　L=600mm」の書き方 */
export function shinseiKinds(job: Pick<Job, 'places'>, rates: EstimateRates): ShinseiKind[] {
  const lines = workLines(job, rates);
  return KINDS.map((_, i) => {
    const mine = lines.filter((w) => w.kind === i + 1);
    return {places: [...new Set(mine.map((w) => w.name).filter(Boolean))].join('・'), works: mine.map((w) => w.line)};
  });
}

/** 写真番号 → 改修場所（見積書に出る箇所だけ） */
export function shinseiPhotos(job: Pick<Job, 'places'>, rates: EstimateRates): Record<number, string> {
  const photos = photoNumbers(job, rates);
  const out: Record<number, string> = {};
  for (const p of job.places) {
    const n = photos.get(p.id);
    if (n !== undefined && out[n] === undefined) out[n] = p.name.trim();
  }
  return out;
}

/**
 * 改修費用は見積書の金額と連動する（ユーザーの指示「改修予定費用のところが、自分で作った見積もりの金額が連動するように」）。
 * 苅田町・行橋市の申請書は「改修予定費用」＝見積書の合計（税込）。みやこ町・広域連合は「改修費用（介護保険対象分）」＝見積書の介護保険対象分の合計（税込）
 */
export const costIsTotal = (insurer: Insurer | '') => insurer === 'kanda' || insurer === 'yukuhashi';

/** 改修費用：手で入れた金額、なければ見積書の金額（costIsTotal）。見積書がなければ null */
export function shinseiCost(job: Job, s: EstimateSettings): number | null {
  if (job.shinsei?.cost != null) return job.shinsei.cost;
  const t = estimateTotals(job, s);
  return (costIsTotal(jobInsurer(job)) ? t.all.total : t.target.total) || null;
}

/** 日付 → 「令和8年11月5日」（申請書の日付の欄） */
export function reiwaText(iso: string): string {
  const r = reiwa(iso);
  return r ? `令和${r.y === 1 ? '元' : r.y}年${r.m}月${r.d}日` : '';
}

export function shinseiValues(job: Job, s: EstimateSettings): ShinseiValues {
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const cost = shinseiCost(job, s);
  const t = (v: string) => v.normalize('NFKC').trim();
  return {
    name: job.customer.trim(),
    address: job.address.trim(),
    insuredNo: job.insuredNo,
    works: shinseiWorks(job, s),
    kinds: shinseiKinds(job, s),
    photos: shinseiPhotos(job, s),
    marks: {gender: info.gender, era: info.era, care: info.care, renovated: info.renovated},
    texts: {
      kana: info.kana.trim(),
      zip: t(info.zip),
      phone: t(info.phone),
      owner: info.owner.trim(),
      relation: info.relation.trim(),
      reasonOffice: info.reasonOffice.trim(),
      reasonName: info.reasonName.trim(),
      era: info.era,
      y: t(info.birthY),
      m: t(info.birthM),
      d: t(info.birthD),
      start: reiwaText(info.start),
      end: reiwaText(info.end),
      cost: cost ? cost.toLocaleString('en-US') : '',
    },
    cost,
    start: info.start,
    end: info.end,
  };
}

/** この保険者の申請書で丸で囲む項目（申請書を作るときに選んでもらう） */
export function shinseiMarkKeys(insurer: Insurer): (keyof ShinseiMarks)[] {
  const keys = new Set((SHINSEI[insurer]?.sheets ?? []).flatMap((s) => (s.marks ?? []).map((m) => m.key)));
  return MARK_KEYS.filter((k) => keys.has(k));
}

/**
 * 被保険者番号を確定したとき（Enter・欄を離れたとき）の番号：数字だけにして右に詰め、空いた左は 0 で10けたに
 * （ユーザーの指示「確定をおこなったら、番号はみぎずめで、自動的に0がはいる」）。数字がなければ打ったまま、10けたより長ければ数字のまま
 */
export function padInsuredNo(v: string, n = 10): string {
  const digits = v.normalize('NFKC').replace(/\D/g, '');
  if (!digits) return v.trim();
  return digits.length >= n ? digits : digits.padStart(n, '0');
}

/** 被保険者番号を10マスに（数字だけ。右に寄せ、空いた左のマスは 0。10けたなら全部のマス） */
export function insuredBoxes(insuredNo: string, n = 10): string[] {
  const digits = insuredNo.normalize('NFKC').replace(/\D/g, '').slice(-n);
  // 空いた左のマスは 0 で埋める（ユーザーの指示「5桁なら、残りの空白部分は0でうめる」）。番号がなければ空のまま
  return digits ? [...digits.padStart(n, '0')] : Array.from({length: n}, () => '');
}

/** ファイル名：苅田町申請書_山田様_2026-10-21.xlsx */
export function shinseiFileName(map: Pick<ShinseiMap, 'title'>, job: Pick<Job, 'customer'>, date: string): string {
  const who = job.customer.trim().replace(/[\\/:*?"<>|]/g, '_') || 'お客様';
  return `${map.title}_${who}様${date ? `_${date}` : ''}.xlsx`;
}

// ---------------------------------------------------------------- Excel（xlsx）の中身を書きかえる

/** 開いた xlsx の中身（ファイルの名前 → 中身）。書きかえるときは中身を置きかえる（もとの Uint8Array は変えない＝原本を覚えておいて何度も使える） */
export type Files = Record<string, Uint8Array>;

// 改行は &#10; で書く（そのままの改行は LibreOffice などが読み飛ばし、1行につながる。Excel はどちらでも改行する）
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '&#10;');
export const unesc = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (m, name: string, dec?: string, hex?: string) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({lt: '<', gt: '>', quot: '"', apos: "'", amp: '&'} as Record<string, string>)[name.toLowerCase()] ?? m,
  );

// 原本から読んだもの（シートの場所・共有の文字・書式）は、ファイルの中身ごとに覚えておく（プレビューで打つたびに読み直さない）
const pathCache = new WeakMap<Uint8Array, Map<string, string>>();
const sharedCache = new WeakMap<Uint8Array, string[]>();

/** シート名 → シートのファイル（xl/worksheets/sheet1.xml） */
export function sheetPaths(files: Files): Map<string, string> {
  const key = files['xl/workbook.xml'];
  if (!key) return new Map();
  const cached = pathCache.get(key);
  if (cached) return cached;
  const out = readSheetPaths(files);
  pathCache.set(key, out);
  return out;
}

function readSheetPaths(files: Files): Map<string, string> {
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const id = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const path = id ? targets.get(id) : undefined;
    if (name !== undefined && path) out.set(unesc(name), path);
  }
  return out;
}

const cellRe = (ref: string) => new RegExp(`<c r="${ref}"(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);

/** 欄に入れる値：文字、または数（金額・日付の数。欄の表示形式で出る） */
type CellValue = string | number;

/** 欄に文字（数）を入れる（書式＝s はそのまま。空なら値を消す）。欄がなければ、その行に列の順で足す */
export function setCell(xml: string, ref: string, text: CellValue): string {
  const style = (attrs: string) => /\ss="\d+"/.exec(attrs)?.[0] ?? '';
  const make = (attrs: string) =>
    typeof text === 'number'
      ? `<c r="${ref}"${style(attrs)}><v>${text}</v></c>`
      : text === ''
        ? `<c r="${ref}"${style(attrs)}/>`
        : `<c r="${ref}"${style(attrs)} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  const found = cellRe(ref).exec(xml);
  if (found) return xml.slice(0, found.index) + make(found[1]) + xml.slice(found.index + found[0].length);
  const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref) ?? [];
  const cell = make('');
  const rowRe = new RegExp(`<row r="${row}"(?=[\\s/>])([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const r = rowRe.exec(xml);
  if (r) {
    if (r[2] === '/>') return xml.slice(0, r.index) + `<row r="${row}"${r[1]}>${cell}</row>` + xml.slice(r.index + r[0].length);
    const inner = r[3] ?? '';
    const after = [...inner.matchAll(/<c r="([A-Z]+)\d+"/g)].find((c) => colNum(c[1]) > colNum(col));
    const at = after?.index ?? inner.length;
    const head = r.index + r[0].indexOf('>') + 1;
    return xml.slice(0, head + at) + cell + xml.slice(head + at);
  }
  // 行もない：行の番号の順に足す
  const rows = [...xml.matchAll(/<row r="(\d+)"/g)];
  const next = rows.find((m) => Number(m[1]) > Number(row));
  const newRow = `<row r="${row}">${cell}</row>`;
  if (next?.index !== undefined) return xml.slice(0, next.index) + newRow + xml.slice(next.index);
  if (xml.includes('<sheetData/>')) return xml.replace('<sheetData/>', `<sheetData>${newRow}</sheetData>`);
  return xml.replace('</sheetData>', `${newRow}</sheetData>`);
}

/**
 * 転記した欄をそのまま参照する式（=J7、=事前申請書!J7 など）の、保存しておく答えを同じ値にする
 * （Excel は開いたときに計算し直すが、スマホのプレビューなどは保存してある答えを出すため）
 */
/**
 * 欄をそのまま参照する式（=J7、=事前申請書!J7、空なら空にする =IF(承認届出書!I5="","",承認届出書!I5)（みやこ町））の、参照する先のシートと番地。
 * name は式のあるシート。そのほかの式は null
 */
export function formulaRef(formula: string, name: string): {sheet: string; ref: string; iff: boolean} | null {
  const text0 = unesc(formula).trim();
  const iff = /^IF\((.+?)="","",(.+)\)$/.exec(text0);
  const refText = iff && iff[1].trim() === iff[2].trim() ? iff[1].trim() : text0;
  const m = /^(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$?(\d+)$/.exec(refText);
  return m ? {sheet: (m[1] ?? name).trim(), ref: `${m[2]}${m[3]}`, iff: !!iff} : null;
}

function updateRefs(files: Files, paths: Map<string, string>, sheet: string, values: Map<string, CellValue>) {
  for (const [name, path] of paths) {
    const xml = files[path] ? strFromU8(files[path]) : null;
    if (xml === null) continue;
    let changed = false;
    const next = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)>(<f>([^<]*)<\/f>)(?:<v>[^<]*<\/v>|<v\/>)?<\/c>/g, (all, ref: string, attrs: string, f: string, formula: string) => {
      const m = formulaRef(formula, name);
      const iff = m?.iff;
      const target = m && m.sheet === sheet.trim() ? m.ref : null;
      if (!target || !values.has(target)) return all;
      const text = values.get(target) ?? '';
      changed = true;
      const rest = attrs.replace(/\st="[^"]*"/, '');
      if (typeof text === 'number') return `<c r="${ref}"${rest}>${f}<v>${text}</v></c>`;
      if (text === '') return iff ? `<c r="${ref}"${rest} t="str">${f}<v></v></c>` : `<c r="${ref}"${rest}>${f}<v>0</v></c>`;
      return `<c r="${ref}"${rest} t="str">${f}<v>${esc(text)}</v></c>`;
    });
    if (changed) files[path] = strToU8(next);
  }
}

/** 欄に入れる値（番地 → 文字）を、原本のシートに書き込む。式の答え・Excel で開いたときの計算も合わせる */
function writeCells(files: Files, sheet: string, values: Map<string, CellValue>): void {
  const paths = sheetPaths(files);
  const path = paths.get(sheet);
  if (!path || !files[path]) throw new Error(`原本に「${sheet}」のシートがありません`);
  let xml = strFromU8(files[path]);
  for (const [ref, text] of values) xml = setCell(xml, ref, text);
  files[path] = strToU8(xml);
  updateRefs(files, paths, sheet, values);
}

/** 原本のシートの欄の文字を読む（写真貼付用紙の写真番号） */
function readCell(files: Files, sheet: string, ref: string): string {
  const path = sheetPaths(files).get(sheet);
  return path && files[path] ? cellText(strFromU8(files[path]), ref, sharedStrings(files)).trim() : '';
}

/** 写真番号の欄の文字（①・1・(1)）→ 番号。なければ 0 */
function photoNumberOf(text: string): number {
  const c = /[①-⑳]/.exec(text);
  if (c) return circledNum(c[0]);
  const d = /\d{1,2}/.exec(text.normalize('NFKC'));
  return d ? Number(d[0]) : 0;
}

/** 1つのシートで欄に入れる値（番地 → 文字）。photo は写真貼付用紙の原本の写真番号 */
export function shinseiCells(sheet: ShinseiSheet, v: ShinseiValues, photo = 0): Map<string, CellValue> {
  const out = new Map<string, CellValue>();
  // 表題（平面図）は、氏名のないときは原本のまま
  if (sheet.name && !(sheet.nameFormat && !v.name)) out.set(sheet.name, sheet.nameFormat ? sheet.nameFormat.replace('{name}', v.name) : v.name);
  if (sheet.address) out.set(sheet.address, v.address);
  if (sheet.insuredNo) {
    const digits = insuredBoxes(v.insuredNo, sheet.insuredNo.length);
    sheet.insuredNo.forEach((ref, i) => out.set(ref, digits[i]));
  }
  if (sheet.works) out.set(sheet.works, v.works.join('\n'));
  sheet.kinds?.forEach((k, i) => {
    out.set(k.places, v.kinds[i]?.places ?? '');
    out.set(k.works, v.kinds[i]?.works.join('\n') ?? '');
  });
  if (sheet.photoPlace?.place) out.set(sheet.photoPlace.place, (photo > 0 && v.photos[photo]) || '');
  if (sheet.legend?.cell) out.set(sheet.legend.cell, v.works.join('\n'));
  for (const t of sheet.texts ?? []) {
    const keys = placeholders(t.format);
    // 何も入れていなければ原本の文字のまま（「本人との関係（　　　）」など）
    if (!keys.some((k) => v.texts[k])) continue;
    if (t.as === 'number') {
      if (v.cost !== null) out.set(t.cell, v.cost);
    } else if (t.as === 'date') {
      const serial = excelDate(keys.includes('end') ? v.end : v.start);
      if (serial) out.set(t.cell, serial);
    } else out.set(t.cell, t.format.replace(/\{(\w+)\}/g, (_, k: keyof ShinseiTexts) => v.texts[k] || BLANK[k] || ''));
  }
  return out;
}

/** 書き方の中の {名前} */
export const placeholders = (format: string) => [...format.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as keyof ShinseiTexts);
/** 生年月日の一部だけ入れたときの空き（「昭和　23年　　月　　日生」） */
const BLANK: Partial<ShinseiTexts> = {y: '　　', m: '　　', d: '　　'};

/** 日付（'YYYY-MM-DD'）→ Excel の日付の数（1900年1月1日＝1）。なければ 0 */
function excelDate(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000) : 0;
}

/** Excel の日付の数 → 'YYYY-MM-DD' */
function fromExcelDate(n: number): string {
  return n > 0 ? new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10) : '';
}

/** 何も書いていない値（原本の欄を消すとき） */
export const EMPTY_SHINSEI: ShinseiValues = {
  name: '',
  address: '',
  insuredNo: '',
  works: [],
  kinds: KINDS.map(() => ({places: '', works: []})),
  photos: {},
  marks: NO_MARKS,
  texts: {kana: '', zip: '', phone: '', owner: '', relation: '', reasonOffice: '', reasonName: '', era: '', y: '', m: '', d: '', start: '', end: '', cost: ''},
  cost: null,
  start: '',
  end: '',
};

/**
 * 原本（.xltx／.xlsx のバイト列）に転記した申請書（.xlsx）を作る。
 * 決めた欄のほかは原本のまま（シートを消したり、空欄を詰めたりしない）。テンプレート（.xltx）はふつうのブック（.xlsx）にする
 */
export function fillShinsei(template: Uint8Array, map: ShinseiMap, v: ShinseiValues): Uint8Array {
  return fillShinseiFiles(unzipSync(template), map, v);
}

/** 開いた原本（unzipSync したもの）に転記して、申請書（.xlsx）のバイト列にする。files は書きかえる（覚えておいた原本なら {...files} を渡す） */
export function fillShinseiFiles(files: Files, map: ShinseiMap, v: ShinseiValues): Uint8Array {
  fillFiles(files, map, v);
  // Excel で開いたときに式を計算し直す（事後申請書など）
  const wb = strFromU8(files['xl/workbook.xml']);
  if (/<calcPr\b(?![^>]*fullCalcOnLoad)/.test(wb)) files['xl/workbook.xml'] = strToU8(wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"'));
  const ct = strFromU8(files['[Content_Types].xml']);
  files['[Content_Types].xml'] = strToU8(ct.replace('spreadsheetml.template.main+xml', 'spreadsheetml.sheet.main+xml'));
  return zipSync(files, {level: 6});
}

/**
 * 開いた原本（unzipSync したもの）のシートに転記する（Excel に保存するときと、画面のプレビューで同じ書き込みをする）。
 * ファイルの中身は置きかえるだけなので、原本を開いたものを {...files} で写してから渡せば、原本は何度でも使える
 */
export function fillFiles(files: Files, map: ShinseiMap, v: ShinseiValues): void {
  const pasted = new Set<number>(); // 写真を貼った写真番号（同じ番号の用紙が2枚＝広域連合なら、最初の用紙だけに貼る）
  for (const sheet of map.sheets) {
    const photo = sheet.photoPlace ? photoNumberOf(readCell(files, sheet.sheet, sheet.photoPlace.photo)) : 0;
    writeCells(files, sheet.sheet, shinseiCells(sheet, v, photo));
    wrapKinds(files, sheet, v);
    drawMarks(files, sheet, v.marks);
    if (sheet.legend?.box) drawLegend(files, sheet, v.works);
    const images = photo > 0 && v.photos[photo] !== undefined && !pasted.has(photo) ? v.photoImages?.[photo] : undefined; // 箇所のある写真番号だけ
    if (images && (images.before || images.after)) {
      pasted.add(photo);
      drawPhotos(files, sheet, images);
    }
  }
}

/** 写真貼付用紙の写真番号 → 写真を貼る用紙（原本の写真番号の欄を読む。同じ番号の用紙が2枚あれば最初の用紙） */
export function photoSheets(files: Files, map: ShinseiMap): Map<number, ShinseiSheet> {
  const out = new Map<number, ShinseiSheet>();
  for (const sheet of map.sheets) {
    if (!sheet.photoPlace?.before) continue;
    const n = photoNumberOf(readCell(files, sheet.sheet, sheet.photoPlace.photo));
    if (n > 0 && !out.has(n)) out.set(n, sheet);
  }
  return out;
}

/** 原本に残っていた被保険者番号などを消した原本（アプリに入れる原本を作るとき。転記する欄を空にする。ほかは原本のまま） */
export function blankShinsei(template: Uint8Array, map: ShinseiMap): Uint8Array {
  const files = unzipSync(template);
  for (const sheet of map.sheets) writeCells(files, sheet.sheet, shinseiCells(sheet, EMPTY_SHINSEI));
  return zipSync(files, {level: 6});
}

/**
 * 改修の種類の行（内訳明細書）の工事内容・箇所の欄を、①の行と同じ書式（左上にそろえて折り返す）にする。
 * 原本の②〜⑥の行は折り返さない書式（均等割り付けなど）なので、2つ目からの行（勝手口② など）が1行につながって見えた
 */
function wrapKinds(files: Files, sheet: ShinseiSheet, v: ShinseiValues): void {
  const [first, ...rest] = sheet.kinds ?? [];
  const path = sheetPaths(files).get(sheet.sheet);
  if (!first || !path || !files[path]) return;
  let xml = strFromU8(files[path]);
  const styleOf = (ref: string) => /\ss="(\d+)"/.exec(cellRe(ref).exec(xml)?.[1] ?? '')?.[1];
  const works = styleOf(first.works);
  const places = styleOf(first.places);
  rest.forEach((k, i) => {
    const kind = v.kinds[i + 1];
    if (works && kind?.works.length) xml = setStyle(xml, k.works, works);
    if (places && kind?.places) xml = setStyle(xml, k.places, places);
  });
  files[path] = strToU8(xml);
}

/** 欄の書式（s）を替える（欄があるときだけ） */
function setStyle(xml: string, ref: string, style: string): string {
  const found = cellRe(ref).exec(xml);
  if (!found) return xml;
  const attrs = /\ss="\d+"/.test(found[1]) ? found[1].replace(/\ss="\d+"/, ` s="${style}"`) : ` s="${style}"${found[1]}`;
  const head = `<c r="${ref}"`;
  return xml.slice(0, found.index) + head + attrs + found[0].slice(head.length + found[1].length) + xml.slice(found.index + found[0].length);
}

// ---------------------------------------------------------------- 丸で囲む（性別・元号・要介護状態区分・改修状況）
// 欄の文字の位置を、列の幅・行の高さ・文字の大きさ・横の配置（中央・左）から計算して、楕円の図形を置く（前の申請の手書きの丸と同じ図形）。
// 画素は Excel の画面（100%）と同じ数え方：列の幅は標準の文字の数字の幅（8画素。4つの原本の図形の位置で確かめた）から、文字は 11pt＝15画素。

export const EMU = 9525; // 1画素
const MDW = 8;
/** 列の幅（Excel の文字数）→ 画素 */
const colPx = (width: number) => Math.trunc(((256 * width + Math.trunc(128 / MDW)) / 256) * MDW);
export const attrOf = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
export const numOf = (text: string | undefined, d: number) => (text !== undefined && text !== '' && Number.isFinite(Number(text)) ? Number(text) : d);

export type SheetLayout = {colW: (c: number) => number; rowH: (r: number) => number; merges: number[][]};

/** シートの列の幅・行の高さ（画素。1始まり）と結合した欄 */
export function sheetLayout(xml: string): SheetLayout {
  const fmt = /<sheetFormatPr\b[^>]*>/.exec(xml)?.[0] ?? '';
  const defW = colPx(numOf(attrOf(fmt, 'defaultColWidth'), 9));
  const defH = (numOf(attrOf(fmt, 'defaultRowHeight'), 13.5) * 4) / 3;
  const cols = [...xml.matchAll(/<col\b[^>]*>/g)].map((m) => ({
    min: numOf(attrOf(m[0], 'min'), 0),
    max: numOf(attrOf(m[0], 'max'), 0),
    px: attrOf(m[0], 'hidden') === '1' ? 0 : colPx(numOf(attrOf(m[0], 'width'), 9)),
  }));
  const rows = new Map<number, number>();
  for (const m of xml.matchAll(/<row\b[^>]*>/g)) {
    const ht = attrOf(m[0], 'ht');
    if (attrOf(m[0], 'hidden') === '1') rows.set(numOf(attrOf(m[0], 'r'), 0), 0);
    else if (ht !== undefined) rows.set(numOf(attrOf(m[0], 'r'), 0), (numOf(ht, 0) * 4) / 3);
  }
  const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map((m) => [colNum(m[1]), Number(m[2]), colNum(m[3]), Number(m[4])]);
  return {colW: (c) => cols.find((x) => x.min <= c && c <= x.max)?.px ?? defW, rowH: (r) => rows.get(r) ?? defH, merges};
}

type CellStyle = {size: number; font: string; horizontal: string; vertical: string; shrink: boolean; indent: number};

/** styles.xml の中身（字体・塗り・罫線・書式の XML を番号の順に。表示形式の番号 → 書き方。決まった色の番号の色を替えていればその色） */
export type StyleParts = {fonts: string[]; fills: string[]; borders: string[]; xfs: string[]; numFmts: Map<number, string>; palette: string[]};
const styleCache = new WeakMap<Uint8Array, StyleParts>();

/** styles.xml を項目ごとに分ける（ファイルの中身ごとに覚えておく） */
export function styleParts(files: Files): StyleParts {
  const f = files['xl/styles.xml'];
  const cached = f && styleCache.get(f);
  if (cached) return cached;
  const st = f ? strFromU8(f) : '';
  const list = (outer: string, inner: string) => [...(new RegExp(`<${outer}\\b[^>]*>([\\s\\S]*?)</${outer}>`).exec(st)?.[1] ?? '').matchAll(new RegExp(`<${inner}\\b[^>]*?(?:/>|>[\\s\\S]*?</${inner}>)`, 'g'))].map((m) => m[0]);
  const numFmts = new Map<number, string>();
  for (const m of st.matchAll(/<numFmt\b[^>]*>/g)) numFmts.set(numOf(attrOf(m[0], 'numFmtId'), -1), unesc(attrOf(m[0], 'formatCode') ?? ''));
  const palette = [...(/<indexedColors\b[^>]*>([\s\S]*?)<\/indexedColors>/.exec(st)?.[1] ?? '').matchAll(/<rgbColor rgb="([0-9A-Fa-f]{6,8})"/g)].map((m) => m[1].slice(-6));
  const out: StyleParts = {fonts: list('fonts', 'font'), fills: list('fills', 'fill'), borders: list('borders', 'border'), xfs: list('cellXfs', 'xf'), numFmts, palette};
  if (f) styleCache.set(f, out);
  return out;
}

/** 欄の文字の大きさ・字体・配置（styles.xml の書式） */
function cellStyle(files: Files, xml: string, ref: string): CellStyle {
  const {fonts, xfs} = styleParts(files);
  const xf = xfs[numOf(attrOf(cellRe(ref).exec(xml)?.[1] ?? '', 's'), 0)] ?? '';
  const font = fonts[numOf(attrOf(xf, 'fontId'), 0)] ?? '';
  const align = /<alignment\b[^>]*>/.exec(xf)?.[0] ?? '';
  return {
    size: numOf(/<sz val="([\d.]+)"/.exec(font)?.[1], 11),
    font: unesc(/<name val="([^"]*)"/.exec(font)?.[1] ?? ''),
    horizontal: attrOf(align, 'horizontal') ?? 'general',
    vertical: attrOf(align, 'vertical') ?? 'bottom',
    shrink: attrOf(align, 'shrinkToFit') === '1',
    indent: numOf(attrOf(align, 'indent'), 0),
  };
}

/**
 * プロポーショナルの字体（ＭＳ Ｐゴシック・ＭＳ Ｐ明朝）で全角と幅の違う文字（全角＝1。同じ幅の IPA Pゴシックで測った）。
 * 全角のすき間（　）は、前の申請で手で書いた丸の位置（苅田町の性別・要介護状態区分、みやこ町・広域連合の改修状況）に合わせて 0.75
 */
const P_WIDTH: Record<string, number> = {'　': 0.75, ' ': 0.27, '・': 0.5, '０': 0.68, '１': 0.49, '２': 0.66, '３': 0.64, '４': 0.68, '５': 0.66, '６': 0.66, '７': 0.61, '８': 0.68, '９': 0.66};
/** 文字の幅（全角＝1） */
function charWidth(ch: string, proportional: boolean): number {
  if (proportional && P_WIDTH[ch] !== undefined) return P_WIDTH[ch];
  const c = ch.charCodeAt(0);
  const half = c < 0x2000 || (c >= 0xff61 && c <= 0xff9f);
  return half ? (proportional ? 0.6 : 0.5) : 1;
}

export type Box = {x: number; y: number; w: number; h: number}; // 画素（シートの左上から）

/** 欄（結合した範囲）の text の start〜end 文字目の位置：左・幅・まん中の高さ・文字の大きさ（画素）と、欄の高さ */
type Span = {tx: number; tw: number; cy: number; em: number; height: number};

function textSpan(lay: SheetLayout, st: CellStyle, ref: string, text: string, start: number, end: number): Span {
  const {xs, ws, cy, em, height} = textLayout(lay, st, ref, text);
  const tx = start < xs.length ? xs[start] : (xs[xs.length - 1] ?? 0) + (ws[ws.length - 1] ?? 0);
  const tw = ws.slice(start, end).reduce((a, b) => a + b, 0);
  return {tx, tw, cy, em, height};
}

/** 欄の文字の1文字ずつの左の位置と幅（画素。シートの左上から）、まん中の高さ・文字の大きさ・欄の高さ（Excel の画面と同じ数え方） */
function textLayout(lay: SheetLayout, st: CellStyle, ref: string, text: string): {xs: number[]; ws: number[]; cy: number; em: number; height: number} {
  const [, col = 'A', row = '1'] = /^([A-Z]+)(\d+)$/.exec(ref) ?? [];
  const c0 = colNum(col);
  const r0 = Number(row);
  const [c1, r1, c2, r2] = lay.merges.find((m) => m[0] === c0 && m[1] === r0) ?? [c0, r0, c0, r0];
  const sum = (from: number, to: number, size: (i: number) => number) => {
    let t = 0;
    for (let i = from; i <= to; i++) t += size(i);
    return t;
  };
  const left = sum(1, c1 - 1, lay.colW);
  const width = sum(c1, c2, lay.colW);
  const top = sum(1, r1 - 1, lay.rowH);
  const height = sum(r1, r2, lay.rowH);
  const pad = 2; // 罫線と文字のあいだ
  const proportional = /[ＰP]/.test(st.font);
  const widths = text.split('').map((ch) => charWidth(ch, proportional) * Math.round((st.size * 4) / 3));
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = st.shrink && total > width - 2 * pad ? (width - 2 * pad) / total : 1; // 縮小して全体を表示する
  const em = Math.round((st.size * 4) / 3) * scale;
  const x0 =
    st.horizontal === 'center' || st.horizontal === 'centerContinuous' || st.horizontal === 'distributed'
      ? left + (width - total * scale) / 2
      : st.horizontal === 'right'
        ? left + width - pad - total * scale
        : left + pad + st.indent * em;
  const xs: number[] = [];
  let x = x0;
  for (const w of widths) {
    xs.push(x);
    x += w * scale;
  }
  const cy = st.vertical === 'center' ? top + height / 2 : st.vertical === 'top' ? top + pad + em * 0.6 : top + height - pad - em * 0.6;
  return {xs, ws: widths.map((w) => w * scale), cy, em, height};
}

/** 欄（結合した範囲）の text の start〜end 文字目を囲む楕円の位置 */
function markBox(lay: SheetLayout, st: CellStyle, ref: string, text: string, start: number, end: number): Box {
  const {tx, tw, cy, em, height} = textSpan(lay, st, ref, text, start, end);
  // 高さは欄に収まるだけ（文字の2倍まで）。幅は文字の四すみが入るだけ（左右に文字の半分はあける）
  const b = Math.max(em * 0.6, Math.min(height - 4, em * 2) / 2);
  const inner = Math.min(0.9, ((em * 0.42) / b) ** 2);
  const a = Math.max((tw / 2 + em * 0.2) / Math.sqrt(1 - inner), tw / 2 + em * 0.5);
  return {x: tx + tw / 2 - a, y: cy - b, w: 2 * a, h: 2 * b};
}

/** 画素 → 列（行）の番号（0始まり）とその中の位置（EMU） */
function anchorAt(px: number, size: (i: number) => number): [number, number] {
  let i = 1;
  let acc = 0;
  while (i < 16384 && acc + size(i) <= px) acc += size(i++);
  return [i - 1, Math.max(0, Math.round((px - acc) * EMU))];
}

/** 図形の置き場所（左上と右下の欄と、その中の位置） */
function fromTo(lay: SheetLayout, box: Box): string {
  const [c1, co1] = anchorAt(box.x, lay.colW);
  const [r1, ro1] = anchorAt(box.y, lay.rowH);
  const [c2, co2] = anchorAt(box.x + box.w, lay.colW);
  const [r2, ro2] = anchorAt(box.y + box.h, lay.rowH);
  return (
    `<xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>${co1}</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>${ro1}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>${co2}</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>${ro2}</xdr:rowOff></xdr:to>`
  );
}

const emu = (px: number) => Math.round(px * EMU);
const xfrm = (box: Box) => `<a:xfrm><a:off x="${emu(box.x)}" y="${emu(box.y)}"/><a:ext cx="${emu(box.w)}" cy="${emu(box.h)}"/></a:xfrm>`;

/** 楕円の図形（前の申請の丸と同じ：塗りなし・黒の線） */
function ellipseXml(lay: SheetLayout, box: Box, id: number): string {
  return (
    `<xdr:twoCellAnchor>${fromTo(lay, box)}` +
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="楕円 ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr>${xfrm(box)}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:noFill/>` +
    `<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`
  );
}

/** 相対の場所（../drawings/drawing1.xml）→ ファイルの名前（xl/drawings/drawing1.xml） */
function resolvePath(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const REL_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';

/** シートの図形のファイル（xl/drawings/drawing1.xml）。なければ作る（図形のないシート：みやこ町の支給申請書・行橋市の申請書） */
function drawingOf(files: Files, sheetPath: string): string {
  const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  let rels = files[relsPath] ? strFromU8(files[relsPath]) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let sheetXml = strFromU8(files[sheetPath]);
  const rid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheetXml)?.[1];
  const rel = rid ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attrOf(r, 'Id') === rid) : undefined;
  const target = rel && attrOf(rel, 'Target');
  if (rid) return target ? resolvePath(sheetPath, target) : ''; // 図形のつながりが壊れていたら足さない（<drawing> は1つだけ）
  let n = 1;
  while (files[`xl/drawings/drawing${n}.xml`]) n++;
  const path = `xl/drawings/drawing${n}.xml`;
  files[path] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>',
  );
  let k = 1;
  while (rels.includes(`Id="rId${k}"`)) k++;
  rels = rels.replace('</Relationships>', `<Relationship Id="rId${k}" Type="${REL_DRAWING}" Target="../drawings/drawing${n}.xml"/></Relationships>`);
  files[relsPath] = strToU8(rels);
  // <drawing> は pageSetup などのうしろ、legacyDrawing・tableParts などの前（Excel の決まった順）
  const tag = `<drawing r:id="rId${k}"/>`;
  const next = /<(?:legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sheetXml);
  sheetXml = next ? sheetXml.slice(0, next.index) + tag + sheetXml.slice(next.index) : sheetXml.replace('</worksheet>', `${tag}</worksheet>`);
  if (!/xmlns:r=/.test(/<worksheet\b[^>]*>/.exec(sheetXml)?.[0] ?? '')) sheetXml = sheetXml.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  files[sheetPath] = strToU8(sheetXml);
  const ct = strFromU8(files['[Content_Types].xml']);
  files['[Content_Types].xml'] = strToU8(ct.replace('</Types>', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`));
  return path;
}

/** needles を順に探して、i 番目の文字の位置（start〜end）。見つからなければ null */
function findNeedle(text: string, needles: string[], i: number): [number, number] | null {
  let from = 0;
  for (let k = 0; k <= i && k < needles.length; k++) {
    const at = text.indexOf(needles[k], from);
    if (at < 0) return null;
    if (k === i) return [at, at + needles[k].length];
    from = at + needles[k].length;
  }
  return null;
}

/** 範囲（'A9:S31'。結合した欄の左上だけでもよい）の位置と大きさ（画素。シートの左上から） */
export function rangeBox(lay: SheetLayout, range: string): Box {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range);
  if (!m) return {x: 0, y: 0, w: 0, h: 0};
  let [c1, r1, c2, r2] = [colNum(m[1]), Number(m[2]), colNum(m[3] ?? m[1]), Number(m[4] ?? m[2])];
  const merged = lay.merges.find((x) => x[0] === c1 && x[1] === r1);
  if (!m[3] && merged) [c1, r1, c2, r2] = merged;
  const sum = (from: number, to: number, size: (i: number) => number) => {
    let t = 0;
    for (let i = from; i <= to; i++) t += size(i);
    return t;
  };
  return {x: sum(1, c1 - 1, lay.colW), y: sum(1, r1 - 1, lay.rowH), w: sum(c1, c2, lay.colW), h: sum(r1, r2, lay.rowH)};
}

/** 図形のファイルの次の番号（cNvPr の id） */
const nextShapeId = (d: string) => Math.max(1, ...[...d.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => Number(m[1]))) + 1;

/**
 * 平面図の工事内容：範囲いっぱいのテキストボックス（線・塗りなし、12pt、1行に1箇所）。前の申請の平面図と同じ形で、Excel で動かしたり直したりできる。
 * 行が多くて枠からあふれても隠さない（切り取らない）。平面図そのもの（横棒＝横手すり、丸＝縦手すり、番号）はユーザーが Excel で描く
 */
function drawLegend(files: Files, sheet: ShinseiSheet, lines: string[]): void {
  const range = sheet.legend?.box;
  const path = sheetPaths(files).get(sheet.sheet);
  if (!range || lines.length === 0 || !path || !files[path]) return;
  const lay = sheetLayout(strFromU8(files[path]));
  const box = rangeBox(lay, range);
  const drawing = drawingOf(files, path);
  const d = drawing && files[drawing] ? strFromU8(files[drawing]) : '';
  if (!d.includes('</xdr:wsDr>')) return;
  const id = nextShapeId(d);
  const paras = lines.map((l) => `<a:p><a:r><a:rPr lang="ja-JP" altLang="en-US" sz="1200"/><a:t>${esc(l)}</a:t></a:r></a:p>`).join('');
  const xml =
    `<xdr:twoCellAnchor>${fromTo(lay, box)}<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="工事内容 ${id}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>` +
    `<xdr:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="9525"><a:noFill/></a:ln></xdr:spPr>` +
    `<xdr:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="t"/><a:lstStyle/>${paras}</xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;
  files[drawing] = strToU8(d.replace('</xdr:wsDr>', `${xml}</xdr:wsDr>`));
}

const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** 写真の枠（範囲）に写真を置く位置：縦横の比はそのまま、枠に収まるだけ大きく、まん中に（まわりに 4画素あける） */
export function photoFit(frame: Box, w: number, h: number): Box {
  const pad = 4;
  const k = Math.max(0, Math.min((frame.w - 2 * pad) / Math.max(w, 1), (frame.h - 2 * pad) / Math.max(h, 1)));
  const [pw, ph] = [w * k, h * k];
  return {x: frame.x + (frame.w - pw) / 2, y: frame.y + (frame.h - ph) / 2, w: pw, h: ph};
}

/** 写真貼付用紙の改修前・改修後の枠に写真を貼る（xl/media に JPEG を入れ、図形のファイルに写真の図形を足す） */
function drawPhotos(files: Files, sheet: ShinseiSheet, images: PhotoImages): void {
  const place = sheet.photoPlace;
  const path = sheetPaths(files).get(sheet.sheet);
  if (!place || !path || !files[path]) return;
  const lay = sheetLayout(strFromU8(files[path]));
  const drawing = drawingOf(files, path);
  let d = drawing && files[drawing] ? strFromU8(files[drawing]) : '';
  if (!drawing || !d.includes('</xdr:wsDr>')) return;
  const relsPath = drawing.replace(/([^/]+)$/, '_rels/$1.rels');
  let rels = files[relsPath] ? strFromU8(files[relsPath]) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let id = nextShapeId(d);
  const pics: string[] = [];
  for (const slot of ['before', 'after'] as const) {
    const img = images[slot];
    const range = place[slot];
    if (!img || !range) continue;
    const box = photoFit(rangeBox(lay, range), img.w, img.h);
    let n = 1;
    while (files[`xl/media/image${n}.jpeg`]) n++;
    files[`xl/media/image${n}.jpeg`] = img.bytes;
    let k = 1;
    while (rels.includes(`Id="rId${k}"`)) k++;
    rels = rels.replace('</Relationships>', `<Relationship Id="rId${k}" Type="${REL_IMAGE}" Target="../media/image${n}.jpeg"/></Relationships>`);
    const name = slot === 'before' ? '改修前' : '改修後';
    pics.push(
      `<xdr:twoCellAnchor editAs="oneCell">${fromTo(lay, box)}<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${name} ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="rId${k}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`,
    );
    id++;
  }
  if (pics.length === 0) return;
  files[relsPath] = strToU8(rels);
  const root = /<xdr:wsDr\b[^>]*>/.exec(d)?.[0] ?? '';
  if (root && !/\sxmlns:r=/.test(root)) d = d.replace(root, root.replace('<xdr:wsDr', `<xdr:wsDr xmlns:r="${NS_R}"`));
  files[drawing] = strToU8(d.replace('</xdr:wsDr>', `${pics.join('')}</xdr:wsDr>`));
  const ct = strFromU8(files['[Content_Types].xml']);
  if (!/<Default\b[^>]*Extension="jpeg"/i.test(ct)) files['[Content_Types].xml'] = strToU8(ct.replace(/(<Types\b[^>]*>)/, '$1<Default Extension="jpeg" ContentType="image/jpeg"/>'));
}

/** 選んだ値（性別の「女」など）を丸で囲む：原本のシートの図形に楕円を足す */
function drawMarks(files: Files, sheet: ShinseiSheet, marks: ShinseiMarks): void {
  const path = sheetPaths(files).get(sheet.sheet);
  if (!path || !files[path]) return;
  const xml = strFromU8(files[path]);
  const lay = sheetLayout(xml);
  const shared = sharedStrings(files);
  const boxes: Box[] = [];
  for (const m of sheet.marks ?? []) {
    const i = (MARK_INFO[m.key].options as string[]).indexOf(marks[m.key]);
    const text = i < 0 ? '' : cellText(xml, m.cell, shared);
    const at = text ? findNeedle(text, m.needles, i) : null;
    if (at) boxes.push(markBox(lay, cellStyle(files, xml, m.cell), m.cell, text, at[0], at[1]));
  }
  if (boxes.length === 0) return;
  const drawing = drawingOf(files, path);
  const d = drawing && files[drawing] ? strFromU8(files[drawing]) : '';
  if (!d.includes('</xdr:wsDr>')) return;
  const id = nextShapeId(d);
  files[drawing] = strToU8(d.replace('</xdr:wsDr>', `${boxes.map((b, k) => ellipseXml(lay, b, id + k)).join('')}</xdr:wsDr>`));
}

/**
 * 丸で囲む欄の文字の1文字ずつの位置（画素・シートの左上から）。丸の位置と同じ計算なので、画面のプレビューでこの位置に文字を置けば、
 * 原本の字体のない端末（スマホなど）でも丸と文字がずれない
 */
export type MarkText = {ref: string; chars: {ch: string; x: number; w: number}[]; cy: number; em: number};

export function markTexts(files: Files, sheet: ShinseiSheet): MarkText[] {
  const path = sheetPaths(files).get(sheet.sheet);
  if (!path || !files[path] || !sheet.marks?.length) return [];
  const xml = strFromU8(files[path]);
  const lay = sheetLayout(xml);
  const shared = sharedStrings(files);
  return sheet.marks.flatMap((m) => {
    const text = cellText(xml, m.cell, shared);
    if (!text) return [];
    const {xs, ws, cy, em} = textLayout(lay, cellStyle(files, xml, m.cell), m.cell, text);
    return [{ref: m.cell, chars: text.split('').map((ch, i) => ({ch, x: xs[i], w: ws[i]})), cy, em}];
  });
}

/** 丸で囲む欄の、選べる値（男・女 など）の文字の位置（画面のプレビューで、押して丸をつける所。画素・シートの左上から） */
export type MarkOption = {key: keyof ShinseiMarks; option: string; box: Box};

export function markOptions(files: Files, sheet: ShinseiSheet): MarkOption[] {
  const path = sheetPaths(files).get(sheet.sheet);
  if (!path || !files[path] || !sheet.marks?.length) return [];
  const xml = strFromU8(files[path]);
  const lay = sheetLayout(xml);
  const shared = sharedStrings(files);
  const out: MarkOption[] = [];
  for (const m of sheet.marks) {
    const text = cellText(xml, m.cell, shared);
    const st = cellStyle(files, xml, m.cell);
    (MARK_INFO[m.key].options as string[]).forEach((option, i) => {
      const at = text ? findNeedle(text, m.needles, i) : null;
      if (!at) return;
      // 文字のまわり（上下は文字の高さの7割、左右は文字の1/4ずつ広く）。となりの値と重ならない
      const {tx, tw, cy, em} = textSpan(lay, st, m.cell, text, at[0], at[1]);
      out.push({key: m.key, option, box: {x: tx - em * 0.25, y: cy - em * 0.7, w: tw + em * 0.5, h: em * 1.4}});
    });
  }
  return out;
}

// ---------------------------------------------------------------- 書き込んだ申請書から読む（申請書から見積書を作る）

/** 共有の文字（ふりがな＝rPh は除く） */
export function sharedStrings(files: Files): string[] {
  const f = files['xl/sharedStrings.xml'];
  if (!f) return [];
  const cached = sharedCache.get(f);
  if (cached) return cached;
  const out = [...strFromU8(f).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc([...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
  sharedCache.set(f, out);
  return out;
}

export function cellText(xml: string, ref: string, shared: string[]): string {
  const m = cellRe(ref).exec(xml);
  if (!m) return '';
  const t = /\st="([^"]+)"/.exec(m[1])?.[1];
  const inner = m[2] ?? '';
  if (t === 'inlineStr') return unesc([...inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (v === undefined) return '';
  if (t === 's') return shared[Number(v)] ?? '';
  if (/<f\b/.test(inner) && (v === '0' || t === 'e')) return ''; // 空の欄を参照した式（0）
  return unesc(v);
}

/** 申請書から読んだ箇所（写真番号・改修場所・改修の種類 1〜6・改修の内容の文） */
export type ShinseiPlace = {photo: number; name: string; kind: number; text: string};
export type ShinseiRead = {insurer: Insurer; name: string; address: string; insuredNo: string; places: ShinseiPlace[]; info: Partial<ShinseiInfo>};

/** 読むときの {名前} の形（年月日は数字、元号は 明治・大正・昭和。ほかは何でも） */
const READ_AS: Partial<Record<keyof ShinseiTexts, string>> = {y: '([0-9０-９]*)', m: '([0-9０-９]*)', d: '([0-9０-９]*)', era: '(明治|大正|昭和|)'};

/** 何でもの {名前} が、すき間だけをはさんで2つ並ぶ書き方（「{reasonOffice}　{reasonName}」）。どこで分けるか分からないので読まない */
const ambiguous = (format: string) => [...format.matchAll(/\{(\w+)\}[\s　]*\{(\w+)\}/g)].some((m) => !READ_AS[m[1] as keyof ShinseiTexts] && !READ_AS[m[2] as keyof ShinseiTexts]);

/** 書き方（format）にあてはめて、欄の文字から {名前} の値を読む（すき間の数は問わない）。合わなければ null */
function unformat(format: string, text: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = format
    .split(/(\{\w+\})/)
    .map((part) => {
      const k = /^\{(\w+)\}$/.exec(part);
      if (k) {
        keys.push(k[1]);
        return READ_AS[k[1] as keyof ShinseiTexts] ?? '(.*?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s　]+/g, '[\\s　]*');
    })
    .join('');
  const m = new RegExp(`^[\\s　]*${re}[\\s　]*$`).exec(text);
  return m ? Object.fromEntries(keys.map((k, i) => [k, (m[i + 1] ?? '').trim()])) : null;
}

/** 「令和8年11月5日」→ '2026-11-05' */
function fromReiwaText(text: string): string {
  const m = /^令和(元|\d+)年(\d+)月(\d+)日$/.exec(text.normalize('NFKC').replace(/\s/g, ''));
  if (!m) return '';
  const pad = (n: string) => n.padStart(2, '0');
  return `${2018 + (m[1] === '元' ? 1 : Number(m[1]))}-${pad(m[2])}-${pad(m[3])}`;
}

const TEXT_FIELDS: Partial<Record<keyof ShinseiTexts, keyof ShinseiInfo>> = {
  kana: 'kana',
  zip: 'zip',
  phone: 'phone',
  owner: 'owner',
  relation: 'relation',
  reasonOffice: 'reasonOffice',
  reasonName: 'reasonName',
  y: 'birthY',
  m: 'birthM',
  d: 'birthD',
};

/** 申請書の画面で入れる項目を、書いた欄から読む（まだ読んでいない項目だけ）。数の欄（改修費用）と、すき間だけで区切った書き方は読まない */
function readTexts(sheet: ShinseiSheet, get: (ref: string) => string, info: Partial<ShinseiInfo>): void {
  const put = (key: keyof ShinseiInfo, v: string) => {
    if (v && !info[key]) (info as Record<string, string>)[key] = v;
  };
  for (const t of sheet.texts ?? []) {
    if (t.as === 'number' || ambiguous(t.format)) continue;
    const key = placeholders(t.format).includes('end') ? 'end' : 'start';
    if (t.as === 'date') {
      put(key, fromExcelDate(Number(get(t.cell)) || 0));
      continue;
    }
    const got = unformat(t.format, get(t.cell));
    if (!got) continue;
    for (const [k, v] of Object.entries(got)) {
      if (k === 'start' || k === 'end') put(k, fromReiwaText(v));
      else if (k === 'era') {
        if (got.y && (MARK_INFO.era.options as string[]).includes(v)) put('era', v); // 年を書いていないときの「昭和」は原本の文字
      } else if (TEXT_FIELDS[k as keyof ShinseiTexts]) put(TEXT_FIELDS[k as keyof ShinseiTexts]!, k === 'y' || k === 'm' || k === 'd' ? v.normalize('NFKC') : v);
    }
  }
}

const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * 書き込んだ申請書（Excel）から読む。どの保険者の申請書かは最初のシートの名前で見分ける。申請書でなければ null。
 * 見積もりの入口の「申請書（Excel）から作る」はユーザーの指示（「不要」2026-10-21）で外したので、いまは書いた申請書を読み戻すテストで使う
 */
export function readShinsei(bytes: Uint8Array): ShinseiRead | null {
  let files: Files;
  try {
    files = unzipSync(bytes);
  } catch {
    return null;
  }
  if (!files['xl/workbook.xml']) return null;
  const paths = sheetPaths(files);
  const shared = sharedStrings(files);
  for (const [insurer, map] of Object.entries(SHINSEI) as [Insurer, ShinseiMap][]) {
    const first = paths.get(map.sheets[0]?.sheet ?? '');
    if (!first || !files[first]) continue;
    const out: ShinseiRead = {insurer, name: '', address: '', insuredNo: '', places: [], info: {}};
    for (const sheet of map.sheets) {
      const path = paths.get(sheet.sheet);
      if (!path || !files[path]) continue;
      const xml = strFromU8(files[path]);
      const get = (ref: string) => cellText(xml, ref, shared).trim();
      // 氏名・住所・番号は、書いてある最初のシートから（平面図の表題のような書式つきの欄は読まない）
      if (!out.name && sheet.name && !sheet.nameFormat) out.name = get(sheet.name);
      if (!out.address && sheet.address) out.address = get(sheet.address);
      if (!out.insuredNo && sheet.insuredNo) out.insuredNo = sheet.insuredNo.map((ref) => get(ref).normalize('NFKC').replace(/\D/g, '')).join('');
      if (out.places.length === 0 && sheet.works) out.places = linesOf(get(sheet.works)).map((l) => parseWorkLine(l));
      if (out.places.length === 0 && sheet.kinds) {
        // 改修の種類の行ごと：工事内容の行から読む。工事内容が空で箇所だけ書いてあれば、箇所の名前から
        sheet.kinds.forEach((k, i) => {
          const lines = linesOf(get(k.works));
          if (lines.length > 0) out.places.push(...lines.map((l) => parseWorkLine(l, i + 1)));
          else
            out.places.push(
              ...get(k.places)
                .split(/[・、，,\s　]+/)
                .filter(Boolean)
                .map((name) => ({photo: 0, name: name.normalize('NFKC'), kind: i + 1, text: ''})),
            );
        });
      }
      readTexts(sheet, get, out.info);
    }
    return out;
  }
  return null;
}


/**
 * 改修の内容の1行（「玄関① 木製L字手すり L=600×850㎜」、前の版の「①浴室　手すりの取付　長さ60cm」「(3) 玄関 段差の解消」）から、写真番号・改修場所・改修の種類・改修の内容の文を読む。
 * kind（改修の種類の行に書いてあったとき）があればそれ。なければ文から見分ける
 */
export function parseWorkLine(line: string, kind?: number): ShinseiPlace {
  let rest = line.trim();
  let photo = 0;
  const lead = /^([①-⑳])\s*/.exec(rest);
  const paren = /^[(（]([0-9０-９]{1,2})[)）]\s*/.exec(rest);
  if (lead) {
    photo = circledNum(lead[1]);
    rest = rest.slice(lead[0].length);
  } else if (paren) {
    photo = Number(paren[1].normalize('NFKC'));
    rest = rest.slice(paren[0].length);
  }
  const first = rest.split(/\s+/)[0] ?? '';
  // 「玄関①」のように改修場所のうしろに写真番号を書いたもの（広域連合の内訳明細書の書き方）
  const trail = /^(.+?)([①-⑳])$/.exec(first);
  const name = (trail ? trail[1] : first).normalize('NFKC');
  if (trail && photo === 0) photo = circledNum(trail[2]);
  // うしろの文は書いたまま（続いたすき間は1つに。全角のすき間「①玄関　手すり取り付け　L=600㎜」は全角のまま）
  const text = rest
    .slice(first.length)
    .trim()
    .replace(/\s+/g, (gap) => (gap.includes('　') ? '　' : ' '));
  const work = text.normalize('NFKC');
  const guess = /手[すスず摺]/.test(work) ? 1 : /段差|スロープ|踏台|踏み台|ステップ|敷居/.test(work) ? 2 : /床/.test(work) ? 3 : /扉|引[き]?戸|ドア/.test(work) ? 4 : /便器/.test(work) ? 5 : work ? 6 : 1;
  return {photo, name, kind: kind ?? guess, text};
}

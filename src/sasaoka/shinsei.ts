// 申請書：保険者ごとにいただいた Excel の原本（苅田町・行橋市・みやこ町・広域連合＝築上町など）に、見積書の内容を転記する（ユーザーの指示）。
// 転記するのは 被保険者氏名・住所・被保険者番号（10マス）・改修の内容・箇所及び規模（前の申請と同じ書き方「玄関① 木製L字手すり L=600×850㎜」）だけ。
// 原本のほかのシート（事後申請書・承諾書・委任状・平面図・写真）・空欄・罫線・図形はそのまま残す（決めた欄の文字だけを書きかえる）。
// 事後申請書など、転記した欄を参照する式は、Excel で開いたときに計算し直す（保存しておく答えも同じ値にしておく）。
// 逆に、書き込んだ申請書（Excel）から 氏名・住所・被保険者番号・改修の箇所 を読んで、見積書を作ることもできる（readShinsei）。

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {isBlankRow} from './calc.ts';
import type {EstimateRates} from './calc.ts';
import {circled, KINDS, photoNumbers} from './estimateForms.ts';
import type {Insurer, Job, Place} from './types.ts';

/** 申請書の原本の、1つのシートで転記する欄（番地）。ないものは書かない */
export type ShinseiSheet = {
  sheet: string; // シートの名前
  name?: string; // 被保険者氏名
  nameFormat?: string; // 氏名の欄に入れる文字（{name} を氏名にする。平面図の表題「　山田　様　邸　平面図」）
  address?: string; // 住所
  insuredNo?: string[]; // 被保険者番号の10マス（左から）
  works?: string; // 改修の内容・箇所及び規模（折り返しの欄。1行に1箇所）
  kinds?: {places: string; works: string}[]; // 改修の種類（①手すりの取付〜⑥付帯工事）ごとの行の、箇所の欄と工事内容の欄（住宅改修内訳明細書）
  photoPlace?: {photo: string; place: string}; // 写真貼付用紙：原本の写真番号の欄（①）を読み、その写真番号の改修場所を改修箇所の欄に入れる
};

/** 申請書の原本の、転記する欄。最初のシートで、どの保険者の申請書かを見分ける */
export type ShinseiMap = {
  title: string; // ファイル名に使う（苅田町申請書）
  sheets: ShinseiSheet[];
};

/** 列の番号（A＝1） */
const colNum = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number): string => (n <= 0 ? '' : colName(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)));
/** 横に並んだマス（start から n 個） */
const boxes = (start: string, n: number, row: number) => Array.from({length: n}, (_, i) => `${colName(colNum(start) + i)}${row}`);
/** 丸数字（①〜⑳）→ 番号 */
const circledNum = (ch: string) => ch.charCodeAt(0) - 0x2460 + 1;

/** 広域連合の写真貼付用紙（10枚。被保険者氏名と番号の欄がある） */
const KOUIKI_PHOTO_SHEETS = ['写真貼付用紙', ...[6, 2, 7, 3, 8, 4, 9, 5, 10].map((n) => `写真貼付用紙 (${n})`)];
/** 住宅改修内訳明細書（様式第2号別紙）の改修の種類の行（①14行目〜⑥24行目）：箇所はその下の行の D、工事内容は K（2行分） */
const KIND_ROWS = [14, 16, 18, 20, 22, 24].map((r) => ({places: `D${r + 1}`, works: `K${r}`}));
/** 写真貼付用紙：被保険者氏名（B4）・被保険者番号（D4〜M4）・写真番号（R4）・改修箇所（B5） */
const PHOTO_SHEET = {name: 'B4', insuredNo: boxes('D', 10, 4), photoPlace: {photo: 'R4', place: 'B5'}};

/**
 * 保険者ごとの申請書の原本と、転記する欄（原本を見て決めた）。
 * 苅田町：「事前申請書」のシート。事後申請書は事前申請書を参照する式なので、同じ内容になる
 * 行橋市：「住改・受領委任払」のシート
 * みやこ町：承認届出書の氏名・住所・番号（支給申請書・内訳明細書の氏名・番号・住所は承認届出書を参照する式。支給申請書の氏名だけは式でないので書く）。
 *   改修の内容は「様式第２号別紙参照」なので、住宅改修内訳明細書の改修の種類の行に 箇所（玄関・トイレ）と工事内容を書く。平面図の表題・写真（1）〜（4）も
 * 広域連合（築上町など。福岡県介護保険広域連合の住宅改修申請関係様式集）：承認申請書（様式第2号）・支給申請書（受領委任払用・様式第7号）の
 *   氏名・住所・番号。改修の内容は「別紙参照」なので、住宅改修内訳明細書（様式第2号別紙）の改修の種類の行に 箇所（玄関・トイレ）と工事内容を書く。
 *   平面図の表題と写真貼付用紙（10枚）の氏名・番号・改修箇所も入れる。償還払い用・取下げ・承諾書・理由書（介護支援専門員が書く）は書かない
 */
export const SHINSEI: Partial<Record<Insurer, ShinseiMap>> = {
  kanda: {title: '苅田町申請書', sheets: [{sheet: '事前申請書', name: 'J7', address: 'J11', insuredNo: boxes('X', 10, 6), works: 'J14'}]},
  yukuhashi: {title: '行橋市申請書', sheets: [{sheet: '住改・受領委任払', name: 'F5', address: 'F11', insuredNo: boxes('Z', 10, 7), works: 'F14'}]},
  miyako: {
    title: 'みやこ町申請書',
    sheets: [
      {sheet: '住宅改修承認届出書', name: 'I5', address: 'I9', insuredNo: boxes('W', 10, 4)},
      {sheet: '住宅改修費支給申請書(受領委任払用)', name: 'J6'},
      {sheet: '住宅改修内訳明細書', kinds: KIND_ROWS},
      {sheet: '平面図', name: 'A1', nameFormat: '{name}　邸　平面図'},
      ...[1, 2, 3, 4].map((n) => ({sheet: `写真 (${n})`, ...PHOTO_SHEET})),
    ],
  },
  kouiki: {
    title: '広域連合申請書',
    sheets: [
      {sheet: '様式第2号（住宅改修承認申請書）', name: 'J6', address: 'J9', insuredNo: boxes('X', 10, 7)},
      {sheet: '様式第7号（住宅改修費支給申請書（受領委任払用）', name: 'J6', address: 'J9', insuredNo: boxes('X', 10, 7)},
      {sheet: '様式第2号別紙（住宅改修内訳明細書）', name: 'I6', insuredNo: boxes('W', 10, 7), kinds: KIND_ROWS},
      {sheet: '平面図 (2)', name: 'A1', nameFormat: '　{name}　様　邸　平面図'},
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
};

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

// 品名から見当をつける言葉（内訳明細書の工事内容）
const WOOD = /木|アッシュ|オーク|ウッド|ヒノキ|桧|ナラ|ブナ|メープル|ウォールナット/;
const L_SHAPE = /L型|Lタイプ|L字|コーナー/i;
const I_SHAPE = /I型|Iタイプ|I字/i;
const BASE_PLATE = /ベースプレート|補強板|取付板/;

/**
 * 改修の内容（苅田町・行橋市）・内訳明細書の工事内容（みやこ町・広域連合）の1行。前の申請と同じ書き方にする（ユーザーの指示）：「玄関① 木製L字手すり L=600×850㎜」
 * （改修場所・写真番号、品名、切って使う部材の使う長さ）。高さ（H=850mm）は見積書にないので手で入れてもらう。
 * 品名は部材の品名から見当をつける：手すりは 浴室用／木製・L字（L型・コーナーの部材があるとき）、段差の解消は 木製踏台・スロープ・敷居撤去。
 * 長さは部材ごと（補強板・ベースプレートは「補強板L=1,700㎜」）。2本以上は「×」でつなぐ
 */
function workLine(p: Place, photo: number): string {
  const mats = p.rows.filter((r) => r.kind === 'material' && !isBlankRow(r));
  const text = mats.map((r) => `${r.estText ?? ''} ${r.name} ${r.code}`).join(' ');
  const labor = p.rows.filter((r) => r.kind === 'labor').map((r) => `${r.estText ?? ''} ${r.name}`).join(' ');
  const wood = WOOD.test(text);
  let item = KINDS[p.kind - 1] ?? '';
  if (p.kind === 1) item = `${/浴室|風呂/.test(p.name) ? '浴室用' : wood ? '木製' : ''}${L_SHAPE.test(text) ? 'L字' : I_SHAPE.test(text) ? 'I字' : ''}手すり`;
  else if (p.kind === 2) {
    if (/踏台|踏み台|ステップ/.test(text + labor)) item = `${wood ? '木製' : ''}踏台`;
    else if (/スロープ/.test(text)) item = 'スロープ';
    else if (/敷居/.test(text + labor)) item = '敷居撤去';
  }
  const groups = new Map<string, {name: string; mm: string[]}>();
  for (const r of mats) {
    if (!(r.lengthCm > 0) || !(r.qty > 0)) continue;
    const key = r.refId ?? `${r.code}|${r.name}`;
    const g = groups.get(key) ?? {name: `${r.estText ?? ''} ${r.name}`, mm: []};
    for (let i = 0; i < Math.max(1, Math.round(r.qty)); i++) g.mm.push(Math.round(r.lengthCm * 10).toLocaleString('en-US'));
    groups.set(key, g);
  }
  const sizes = [...groups.values()].map((g) => `${BASE_PLATE.test(g.name) ? '補強板' : ''}L=${g.mm.join('×')}㎜`);
  return [`${p.name.trim()}${circled(photo)}`, item, ...sizes].filter(Boolean).join(' ');
}

/** 改修の内容・箇所及び規模（苅田町・行橋市の申請書の欄）：箇所ごとに1行「玄関① 木製L字手すり L=600×850㎜」。写真番号・改修場所は見積書と同じ */
export function shinseiWorks(job: Pick<Job, 'places'>, rates: EstimateRates): string[] {
  return workLines(job, rates).map((w) => w.line);
}

/** 改修の種類ごと（6行）：箇所は改修場所を「・」でつなぐ（同じ名前は1つ）。工事内容は「玄関① 木製L字手すり L=600×850㎜」の書き方 */
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

export function shinseiValues(job: Job, rates: EstimateRates): ShinseiValues {
  return {
    name: job.customer.trim(),
    address: job.address.trim(),
    insuredNo: job.insuredNo,
    works: shinseiWorks(job, rates),
    kinds: shinseiKinds(job, rates),
    photos: shinseiPhotos(job, rates),
  };
}

/** 被保険者番号を10マスに（数字だけ。右に寄せる：10けたなら全部のマス） */
export function insuredBoxes(insuredNo: string, n = 10): string[] {
  const digits = insuredNo.normalize('NFKC').replace(/\D/g, '').slice(-n);
  return Array.from({length: n}, (_, i) => digits[digits.length - n + i] ?? '');
}

/** ファイル名：苅田町申請書_山田様_2026-10-21.xlsx */
export function shinseiFileName(map: Pick<ShinseiMap, 'title'>, job: Pick<Job, 'customer'>, date: string): string {
  const who = job.customer.trim().replace(/[\\/:*?"<>|]/g, '_') || 'お客様';
  return `${map.title}_${who}様${date ? `_${date}` : ''}.xlsx`;
}

// ---------------------------------------------------------------- Excel（xlsx）の中身を書きかえる

type Files = Record<string, Uint8Array>;

// 改行は &#10; で書く（そのままの改行は LibreOffice などが読み飛ばし、1行につながる。Excel はどちらでも改行する）
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '&#10;');
const unesc = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (m, name: string, dec?: string, hex?: string) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({lt: '<', gt: '>', quot: '"', apos: "'", amp: '&'} as Record<string, string>)[name.toLowerCase()] ?? m,
  );

/** シート名 → シートのファイル（xl/worksheets/sheet1.xml） */
function sheetPaths(files: Files): Map<string, string> {
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

/** 欄に文字を入れる（書式＝s はそのまま。空なら値を消す）。欄がなければ、その行に列の順で足す */
export function setCell(xml: string, ref: string, text: string): string {
  const style = (attrs: string) => /\ss="\d+"/.exec(attrs)?.[0] ?? '';
  const make = (attrs: string) => (text === '' ? `<c r="${ref}"${style(attrs)}/>` : `<c r="${ref}"${style(attrs)} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`);
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
function updateRefs(files: Files, paths: Map<string, string>, sheet: string, values: Map<string, string>) {
  for (const [name, path] of paths) {
    const xml = files[path] ? strFromU8(files[path]) : null;
    if (xml === null) continue;
    let changed = false;
    const next = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)>(<f>([^<]*)<\/f>)(?:<v>[^<]*<\/v>|<v\/>)?<\/c>/g, (all, ref: string, attrs: string, f: string, formula: string) => {
      // =J7・=事前申請書!J7、または空なら空にする式 =IF(承認届出書!I5="","",承認届出書!I5)（みやこ町）
      const text0 = unesc(formula).trim();
      const iff = /^IF\((.+?)="","",(.+)\)$/.exec(text0);
      const refText = iff && iff[1].trim() === iff[2].trim() ? iff[1].trim() : text0;
      const m = /^(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$?(\d+)$/.exec(refText);
      if (!m) return all;
      const target = (m[1] ?? name).trim() === sheet.trim() ? `${m[2]}${m[3]}` : null;
      if (!target || !values.has(target)) return all;
      const text = values.get(target) ?? '';
      changed = true;
      const rest = attrs.replace(/\st="[^"]*"/, '');
      if (text === '') return iff ? `<c r="${ref}"${rest} t="str">${f}<v></v></c>` : `<c r="${ref}"${rest}>${f}<v>0</v></c>`;
      return `<c r="${ref}"${rest} t="str">${f}<v>${esc(text)}</v></c>`;
    });
    if (changed) files[path] = strToU8(next);
  }
}

/** 欄に入れる値（番地 → 文字）を、原本のシートに書き込む。式の答え・Excel で開いたときの計算も合わせる */
function writeCells(files: Files, sheet: string, values: Map<string, string>): void {
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
export function shinseiCells(sheet: ShinseiSheet, v: ShinseiValues, photo = 0): Map<string, string> {
  const out = new Map<string, string>();
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
  if (sheet.photoPlace) out.set(sheet.photoPlace.place, (photo > 0 && v.photos[photo]) || '');
  return out;
}

/** 何も書いていない値（原本の欄を消すとき） */
export const EMPTY_SHINSEI: ShinseiValues = {name: '', address: '', insuredNo: '', works: [], kinds: KINDS.map(() => ({places: '', works: []})), photos: {}};

/**
 * 原本（.xltx／.xlsx のバイト列）に転記した申請書（.xlsx）を作る。
 * 決めた欄のほかは原本のまま（シートを消したり、空欄を詰めたりしない）。テンプレート（.xltx）はふつうのブック（.xlsx）にする
 */
export function fillShinsei(template: Uint8Array, map: ShinseiMap, v: ShinseiValues): Uint8Array {
  const files = unzipSync(template);
  for (const sheet of map.sheets) {
    const photo = sheet.photoPlace ? photoNumberOf(readCell(files, sheet.sheet, sheet.photoPlace.photo)) : 0;
    writeCells(files, sheet.sheet, shinseiCells(sheet, v, photo));
  }
  // Excel で開いたときに式を計算し直す（事後申請書など）
  const wb = strFromU8(files['xl/workbook.xml']);
  if (/<calcPr\b(?![^>]*fullCalcOnLoad)/.test(wb)) files['xl/workbook.xml'] = strToU8(wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"'));
  const ct = strFromU8(files['[Content_Types].xml']);
  files['[Content_Types].xml'] = strToU8(ct.replace('spreadsheetml.template.main+xml', 'spreadsheetml.sheet.main+xml'));
  return zipSync(files, {level: 6});
}

/** 原本に残っていた被保険者番号などを消した原本（アプリに入れる原本を作るとき。転記する欄を空にする。ほかは原本のまま） */
export function blankShinsei(template: Uint8Array, map: ShinseiMap): Uint8Array {
  const files = unzipSync(template);
  for (const sheet of map.sheets) writeCells(files, sheet.sheet, shinseiCells(sheet, EMPTY_SHINSEI));
  return zipSync(files, {level: 6});
}

// ---------------------------------------------------------------- 書き込んだ申請書から読む（申請書から見積書を作る）

/** 共有の文字（ふりがな＝rPh は除く） */
function sharedStrings(files: Files): string[] {
  const f = files['xl/sharedStrings.xml'];
  if (!f) return [];
  return [...strFromU8(f).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc([...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
}

function cellText(xml: string, ref: string, shared: string[]): string {
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

/** 申請書から読んだ箇所（写真番号・改修場所・改修の種類 1〜6） */
export type ShinseiPlace = {photo: number; name: string; kind: number};
export type ShinseiRead = {insurer: Insurer; name: string; address: string; insuredNo: string; places: ShinseiPlace[]};

const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** 書き込んだ申請書（Excel）から読む。どの保険者の申請書かは最初のシートの名前で見分ける。申請書でなければ null */
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
    const out: ShinseiRead = {insurer, name: '', address: '', insuredNo: '', places: []};
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
                .map((name) => ({photo: 0, name: name.normalize('NFKC'), kind: i + 1})),
            );
        });
      }
    }
    return out;
  }
  return null;
}


/**
 * 改修の内容の1行（「玄関① 木製L字手すり L=600×850㎜」、前の版の「①浴室　手すりの取付　長さ60cm」「(3) 玄関 段差の解消」）から、写真番号・改修場所・改修の種類を読む。
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
  const [first = '', ...others] = rest.split(/[\s　]+/).filter(Boolean);
  // 「玄関①」のように改修場所のうしろに写真番号を書いたもの（広域連合の内訳明細書の書き方）
  const trail = /^(.+?)([①-⑳])$/.exec(first);
  const name = (trail ? trail[1] : first).normalize('NFKC');
  if (trail && photo === 0) photo = circledNum(trail[2]);
  const work = others.join(' ').normalize('NFKC');
  const guess = /手[すスず摺]/.test(work) ? 1 : /段差|スロープ|踏台|踏み台|ステップ|敷居/.test(work) ? 2 : /床/.test(work) ? 3 : /扉|引[き]?戸|ドア/.test(work) ? 4 : /便器/.test(work) ? 5 : work ? 6 : 1;
  return {photo, name, kind: kind ?? guess};
}

// Excel（xlsx・xltx）の中身を直接書きかえる部品。申請書の原本の、決めた欄だけに書き込む（shinsei.ts）。
// 住宅改修 見積書アプリの src/sasaoka/shinsei.ts（2026-10-22 の版）の「欄に書く・式の答えを合わせる・文字を小さくして欄に収める・
// 選んだものを楕円で囲む」部分を写して、このアプリで使う形にしたもの（独立したアプリなので、そのあとは別々に直す）。
// 足したこと：何行もある欄の中の丸（みやこ町の「居宅サービス計画の届出　有・無」）・式の欄を値にしたときの calcChain の始末・
// 0 を出さないシート（式が空の欄を参照すると 0 と出るため）。
// 原本のシート・空欄・罫線・図形は消さない（ユーザーの指示）。書くのは決めた欄だけ。

import {strFromU8, strToU8, zipSync} from 'fflate';

/** 開いた xlsx の中身（ファイルの名前 → 中身）。書きかえるときは中身を置きかえる（もとの Uint8Array は変えない＝原本を何度も使える） */
export type Files = Record<string, Uint8Array>;
/** 欄に入れる値：文字、または数（金額・日付の数。欄の表示形式で出る） */
export type CellValue = string | number;

// 改行は &#10; で書く（そのままの改行は LibreOffice などが読み飛ばし、1行につながる。Excel はどちらでも改行する）
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '&#10;');
export const unesc = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (m, name: string, dec?: string, hex?: string) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({lt: '<', gt: '>', quot: '"', apos: "'", amp: '&'} as Record<string, string>)[name.toLowerCase()] ?? m,
  );

/** 列の番号（A＝1） */
export const colNum = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n: number): string => (n <= 0 ? '' : colName(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)));
/** 横に並んだマス（start から n 個） */
export const boxes = (start: string, n: number, row: number) => Array.from({length: n}, (_, i) => `${colName(colNum(start) + i)}${row}`);

export const attrOf = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
export const numOf = (text: string | undefined, d: number) => (text !== undefined && text !== '' && Number.isFinite(Number(text)) ? Number(text) : d);

// ---------------------------------------------------------------- シート・欄を読む・書く

/** シート名 → シートのファイル（xl/worksheets/sheet1.xml） */
export function sheetPaths(files: Files): Map<string, string> {
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attrOf(m[0], 'Id');
    const target = attrOf(m[0], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attrOf(m[0], 'name');
    const id = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const path = id ? targets.get(id) : undefined;
    if (name !== undefined && path) out.set(unesc(name), path);
  }
  return out;
}

export function sheetPath(files: Files, sheet: string): string {
  const path = sheetPaths(files).get(sheet);
  if (!path || !files[path]) throw new Error(`原本に「${sheet}」のシートがありません`);
  return path;
}

export const cellRe = (ref: string) => new RegExp(`<c r="${ref}"(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);

/**
 * 欄に文字（数）を入れる（書式＝s はそのまま。空なら値を消す。式の欄なら式も消して値にする）。
 * 欄がなければ、その行に列の順で足す（style があればその書式で）
 */
export function setCell(xml: string, ref: string, text: CellValue, style?: string): string {
  const styleOf = (attrs: string) => (style !== undefined ? ` s="${style}"` : (/\ss="\d+"/.exec(attrs)?.[0] ?? ''));
  const make = (attrs: string) =>
    typeof text === 'number'
      ? `<c r="${ref}"${styleOf(attrs)}><v>${text}</v></c>`
      : text === ''
        ? `<c r="${ref}"${styleOf(attrs)}/>`
        : `<c r="${ref}"${styleOf(attrs)} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  const found = cellRe(ref).exec(xml);
  if (found) return xml.slice(0, found.index) + make(found[1]) + xml.slice(found.index + found[0].length);
  const [, col = 'A', row = '1'] = /^([A-Z]+)(\d+)$/.exec(ref) ?? [];
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
 * 欄をそのまま参照する式（=F5、=用具・受領委任払!F5、空なら空にする =IF(申請書!I5="","",申請書!I5)（みやこ町））の、参照する先のシートと番地。
 * name は式のあるシート。そのほかの式は null
 */
export function formulaRef(formula: string, name: string): {sheet: string; ref: string; iff: boolean} | null {
  const text0 = unesc(formula).trim();
  const iff = /^IF\((.+?)="","",(.+)\)$/.exec(text0);
  const refText = iff && iff[1].trim() === iff[2].trim() ? iff[1].trim() : text0;
  const m = /^(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$?(\d+)$/.exec(refText);
  return m ? {sheet: (m[1] ?? name).trim(), ref: `${m[2]}${m[3]}`, iff: !!iff} : null;
}

/**
 * 書いた欄をそのまま参照する式（支給申請書・写真の用紙）の、保存しておく答えを同じ値にする
 * （Excel は開いたときに計算し直すが、スマホのプレビューや LibreOffice は保存してある答えを出すことがある）
 */
function updateRefs(files: Files, paths: Map<string, string>, sheet: string, values: Map<string, CellValue>) {
  for (const [name, path] of paths) {
    const xml = files[path] ? strFromU8(files[path]) : null;
    if (xml === null) continue;
    let changed = false;
    const next = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)>(<f>([^<]*)<\/f>)(?:<v>[^<]*<\/v>|<v\/>)?<\/c>/g, (all, ref: string, attrs: string, f: string, formula: string) => {
      const m = formulaRef(formula, name);
      const target = m && m.sheet === sheet.trim() ? m.ref : null;
      if (!target || !values.has(target)) return all;
      const text = values.get(target) ?? '';
      changed = true;
      const rest = attrs.replace(/\st="[^"]*"/, '');
      if (typeof text === 'number') return `<c r="${ref}"${rest}>${f}<v>${text}</v></c>`;
      if (text === '') return m.iff ? `<c r="${ref}"${rest} t="str">${f}<v></v></c>` : `<c r="${ref}"${rest}>${f}<v>0</v></c>`;
      return `<c r="${ref}"${rest} t="str">${f}<v>${esc(text)}</v></c>`;
    });
    if (changed) files[path] = strToU8(next);
  }
}

/** 欄に入れる値（番地 → 値）を原本のシートに書く。styles は欄がないときに足す書式（番地 → 書式の番号）。式の答えも合わせる */
export function writeCells(files: Files, sheet: string, values: Map<string, CellValue>, styles: Map<string, string> = new Map()): void {
  const paths = sheetPaths(files);
  const path = sheetPath(files, sheet);
  let xml = strFromU8(files[path]);
  for (const [ref, text] of values) xml = setCell(xml, ref, text, cellRe(ref).test(xml) ? undefined : styles.get(ref));
  files[path] = strToU8(xml);
  updateRefs(files, paths, sheet, values);
}

/** 共有の文字（ふりがな＝rPh は除く） */
export function sharedStrings(files: Files): string[] {
  const f = files['xl/sharedStrings.xml'];
  if (!f) return [];
  return [...strFromU8(f).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc([...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
}

/** 欄の文字（式の欄は保存してある答え） */
export function cellText(xml: string, ref: string, shared: string[]): string {
  const m = cellRe(ref).exec(xml);
  if (!m) return '';
  const t = attrOf(m[1], 't');
  const inner = m[2] ?? '';
  if (t === 'inlineStr') return unesc([...inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (v === undefined) return '';
  if (t === 's') return shared[Number(v)] ?? '';
  // 空の欄を参照した式の答え（数の 0）は空。文字の「0」（t="str"。被保険者番号の0のマスを参照した式）はそのまま
  if (/<f\b/.test(inner) && ((v === '0' && t !== 'str') || t === 'e')) return '';
  return unesc(v);
}

export function readCell(files: Files, sheet: string, ref: string): string {
  return cellText(strFromU8(files[sheetPath(files, sheet)]), ref, sharedStrings(files));
}

/** 欄の式（なければ空） */
export function cellFormula(files: Files, sheet: string, ref: string): string {
  const m = cellRe(ref).exec(strFromU8(files[sheetPath(files, sheet)]));
  return unesc(/<f\b[^>]*>([\s\S]*?)<\/f>/.exec(m?.[2] ?? '')?.[1] ?? '');
}

// ---------------------------------------------------------------- 書式（文字の大きさ・配置）

export type StyleParts = {fonts: string[]; xfs: string[]};

export function styleParts(files: Files): StyleParts {
  const st = files['xl/styles.xml'] ? strFromU8(files['xl/styles.xml']) : '';
  const list = (outer: string, inner: string) => [...(new RegExp(`<${outer}\\b[^>]*>([\\s\\S]*?)</${outer}>`).exec(st)?.[1] ?? '').matchAll(new RegExp(`<${inner}\\b[^>]*?(?:/>|>[\\s\\S]*?</${inner}>)`, 'g'))].map((m) => m[0]);
  return {fonts: list('fonts', 'font'), xfs: list('cellXfs', 'xf')};
}

export type CellStyle = {size: number; font: string; horizontal: string; vertical: string; wrap: boolean; shrink: boolean; indent: number};

/** 欄の文字の大きさ・字体・配置（styles.xml の書式） */
export function cellStyle(files: Files, xml: string, ref: string): CellStyle {
  const {fonts, xfs} = styleParts(files);
  const xf = xfs[numOf(attrOf(cellRe(ref).exec(xml)?.[1] ?? '', 's'), 0)] ?? '';
  const font = fonts[numOf(attrOf(xf, 'fontId'), 0)] ?? '';
  const align = /<alignment\b[^>]*>/.exec(xf)?.[0] ?? '';
  return {
    size: numOf(/<sz val="([\d.]+)"/.exec(font)?.[1], 11),
    font: unesc(/<name val="([^"]*)"/.exec(font)?.[1] ?? ''),
    horizontal: attrOf(align, 'horizontal') ?? 'general',
    vertical: attrOf(align, 'vertical') ?? 'bottom',
    wrap: attrOf(align, 'wrapText') === '1' || attrOf(align, 'wrapText') === 'true',
    shrink: attrOf(align, 'shrinkToFit') === '1',
    indent: numOf(attrOf(align, 'indent'), 0),
  };
}

/**
 * 書式（cellXfs の番号）の文字の大きさ（pt）・配置（alignment の XML）だけを替えた書式を足して、その番号を返す（同じものがあればそれ）。
 * 罫線・塗り・表示形式はもとの書式のまま
 */
function variantStyle(files: Files, style: number, change: {pt?: number; alignment?: string}): number {
  const {fonts, xfs} = styleParts(files);
  const xf = xfs[style];
  if (xf === undefined) return style;
  let xml = strFromU8(files['xl/styles.xml']);
  const count = (tag: string, n: number) => (xml = xml.replace(new RegExp(`<${tag}\\b([^>]*?)\\scount="\\d+"`), `<${tag}$1 count="${n}"`));
  let next = xf;
  if (change.pt !== undefined) {
    const font = fonts[numOf(attrOf(xf, 'fontId'), 0)] ?? '<font/>';
    const sized = /<sz\b[^>]*\/>/.test(font)
      ? font.replace(/<sz\b[^>]*\/>/, `<sz val="${change.pt}"/>`)
      : font.replace(/^<font\b([^>]*?)\s*(\/?)>/, (_, a: string, close: string) => `<font${a}><sz val="${change.pt}"/>${close ? '</font>' : ''}`);
    let fontId = fonts.indexOf(sized);
    if (fontId < 0) {
      fontId = fonts.length;
      xml = xml.replace('</fonts>', `${sized}</fonts>`);
      count('fonts', fonts.length + 1);
    }
    next = /\sfontId=/.test(next) ? next.replace(/\sfontId="\d+"/, ` fontId="${fontId}"`) : next.replace(/^<xf\b/, `<xf fontId="${fontId}"`);
    next = /\sapplyFont=/.test(next) ? next.replace(/\sapplyFont="[^"]*"/, ' applyFont="1"') : next.replace(/^<xf\b/, '<xf applyFont="1"');
  }
  if (change.alignment !== undefined) {
    const body = /\/>$/.test(next) ? '' : (/^<xf\b[^>]*>([\s\S]*)<\/xf>$/.exec(next)?.[1] ?? '');
    const head = (/^<xf\b[^>]*?(?=\/?>)/.exec(next)?.[0] ?? '<xf');
    const rest = body.replace(/<alignment\b[^>]*?(?:\/>|>[\s\S]*?<\/alignment>)/, '');
    const withHead = /\sapplyAlignment=/.test(head) ? head.replace(/\sapplyAlignment="[^"]*"/, ' applyAlignment="1"') : `${head} applyAlignment="1"`;
    next = `${withHead}>${change.alignment}${rest}</xf>`;
  }
  let id = xfs.indexOf(next);
  if (id < 0) {
    id = xfs.length;
    xml = xml.replace('</cellXfs>', `${next}</cellXfs>`);
    count('cellXfs', xfs.length + 1);
  }
  files['xl/styles.xml'] = strToU8(xml);
  return id;
}

/** 欄の書式の配置（alignment の XML。なければ空） */
function alignmentOf(files: Files, xml: string, ref: string): string {
  const {xfs} = styleParts(files);
  const xf = xfs[numOf(attrOf(cellRe(ref).exec(xml)?.[1] ?? '', 's'), 0)] ?? '';
  return /<alignment\b[^>]*?(?:\/>|>[\s\S]*?<\/alignment>)/.exec(xf)?.[0] ?? '';
}

/** 欄の書式（s）を替える（欄があるときだけ） */
export function setStyle(xml: string, ref: string, style: string): string {
  const found = cellRe(ref).exec(xml);
  if (!found) return xml;
  const attrs = /\ss="\d+"/.test(found[1]) ? found[1].replace(/\ss="\d+"/, ` s="${style}"`) : ` s="${style}"${found[1]}`;
  const head = `<c r="${ref}"`;
  return xml.slice(0, found.index) + head + attrs + found[0].slice(head.length + found[1].length) + xml.slice(found.index + found[0].length);
}

/** 欄の書式の番号（なければ undefined） */
export function styleIdOf(files: Files, sheet: string, ref: string): string | undefined {
  return attrOf(cellRe(ref).exec(strFromU8(files[sheetPath(files, sheet)]))?.[1] ?? '', 's');
}

// ---------------------------------------------------------------- 欄の位置と大きさ（画素。Excel の画面 100% と同じ数え方）
// 列の幅は標準の文字の数字の幅（8画素。住宅改修アプリで4つの原本の図形の位置から確かめた）から、文字は 11pt＝15画素

export const EMU = 9525; // 1画素
const MDW = 8;
/** 列の幅（Excel の文字数）→ 画素 */
const colPx = (width: number) => Math.trunc(((256 * width + Math.trunc(128 / MDW)) / 256) * MDW);

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

export type Box = {x: number; y: number; w: number; h: number}; // 画素（シートの左上から）

/** 範囲（'A9:S31'。結合した欄の左上だけでもよい）の位置と大きさ */
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

// ---------------------------------------------------------------- 欄に入りきらない文字は小さくする
// 住宅改修アプリと同じ（ユーザーの指示「はみ出さないようにする」）：欄の大きさは原本のまま、入るまで文字を小さくする

/** 折り返しの行の高さ（文字の大きさの倍） */
export const LINE_K = 1.25;
/** 文字の幅（全角＝1、半角＝0.55。プロポーショナルの字体でも、はみ出さない方に数える） */
export const emOf = (s: string) => [...s].reduce((n, ch) => n + (/[ -~｡-ﾟ]/.test(ch) ? 0.55 : 1), 0);

/**
 * 幅 w・高さ h（画素）の欄に lines を入れる文字の大きさ（pt）。base で入ればそのまま。入らなければ 0.5pt ずつ小さくする。
 * wrap（折り返す欄）なら、欄の幅より長い行は折り返した行数で数える。折り返さない欄は、どの行も幅に入る大きさにする
 */
export function fitSize(lines: string[], w: number, h: number, base: number, wrap: boolean, minPt = 4.5): number {
  for (let pt = base; pt > minPt; pt -= 0.5) {
    const px = (pt * 4) / 3;
    const inner = Math.max(1, w - 6);
    const tooWide = !wrap && lines.some((l) => emOf(l) * px > inner);
    const rows = lines.reduce((n, l) => n + (wrap ? Math.max(1, Math.ceil((emOf(l) * px) / inner)) : 1), 0);
    if (!tooWide && rows * px * LINE_K <= h - 4) return pt;
  }
  return minPt;
}

/** 欄の文字の大きさを pt にする（同じ書式で大きさだけ違う書式を足して使う） */
export function sizeCell(files: Files, sheet: string, ref: string, pt: number): void {
  const path = sheetPath(files, sheet);
  const xml = strFromU8(files[path]);
  const found = cellRe(ref).exec(xml);
  if (!found) return;
  files[path] = strToU8(setStyle(xml, ref, String(variantStyle(files, numOf(attrOf(found[1], 's'), 0), {pt}))));
}

/**
 * 明細の行の欄をそろえる（原本は行ごとに文字の大きさ・配置がちがう：みやこ町の支給申請書の2行目からは均等割り付け、など）。
 * refs の最初の欄の配置にそろえ、文字の大きさはいちばん小さいものにそろえる（罫線はそれぞれの欄のまま）
 */
export function sameStyle(files: Files, sheet: string, refs: string[]): void {
  const path = sheetPath(files, sheet);
  let xml = strFromU8(files[path]);
  const [model] = refs;
  if (!model || !cellRe(model).test(xml)) return;
  const alignment = alignmentOf(files, xml, model);
  const pt = Math.min(...refs.filter((r) => cellRe(r).test(xml)).map((r) => cellStyle(files, xml, r).size));
  for (const ref of refs) {
    const found = cellRe(ref).exec(xml);
    if (!found) continue;
    const st = numOf(attrOf(found[1], 's'), 0);
    const id = variantStyle(files, st, {pt, alignment: ref === model ? undefined : alignment});
    if (id !== st) xml = setStyle(xml, ref, String(id));
  }
  files[path] = strToU8(xml);
}

/** 欄の大きさ（画素）と書式 */
export function cellBox(files: Files, sheet: string, ref: string): {box: Box; style: CellStyle} {
  const xml = strFromU8(files[sheetPath(files, sheet)]);
  return {box: rangeBox(sheetLayout(xml), ref), style: cellStyle(files, xml, ref)};
}

/** 欄（結合した範囲）に今の文字が入るように、文字を小さくした書式にする（入るときはそのまま）。小さくしたら pt を返す */
export function fitCell(files: Files, sheet: string, ref: string): number | null {
  const xml = strFromU8(files[sheetPath(files, sheet)]);
  const text = cellText(xml, ref, sharedStrings(files));
  if (!cellRe(ref).test(xml) || !text.trim()) return null;
  const box = rangeBox(sheetLayout(xml), ref);
  const st = cellStyle(files, xml, ref);
  const pt = fitSize(text.split('\n'), box.w, box.h, st.size, st.wrap);
  if (pt >= st.size) return null;
  sizeCell(files, sheet, ref, pt);
  return pt;
}

/**
 * 折り返しの欄に入れる文を、欄の幅で行に分ける（Excel の折り返しにまかせると、丸をつける行の位置が分からないため）。
 * pt の文字で1行に入る長さで切る（句読点の前では切らない）
 */
export function wrapText(text: string, widthPx: number, pt: number): string[] {
  const px = (pt * 4) / 3;
  const max = Math.max(1, (widthPx - 6) / px);
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of [...para]) {
      if (line && emOf(line + ch) > max && !/^[、。，．）」』]$/.test(ch)) {
        out.push(line);
        line = '';
      }
      line += ch;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------- 丸で囲む（性別・元号・要介護状態区分・居宅サービス計画の届出）
// 欄の文字の位置を、列の幅・行の高さ・文字の大きさ・配置から計算して、楕円の図形を置く（手書きの丸と同じ：塗りなし・黒の線）

/**
 * 丸で囲むもの：cell の文字の中で needles を順に探し（after があれば、その文字のうしろから）、pick 番目（0始まり）を囲む。
 * pick が -1 なら囲まない
 */
export type Mark = {cell: string; needles: string[]; pick: number; after?: string};

/**
 * プロポーショナルの字体（ＭＳ Ｐゴシック・ＭＳ Ｐ明朝）で全角と幅の違う文字（全角＝1）。
 * 全角のすき間（　）は、前の申請で手で書いた丸の位置に合わせて 0.75（住宅改修アプリで確かめた値）
 */
const P_WIDTH: Record<string, number> = {'　': 0.75, ' ': 0.27, '・': 0.5, '０': 0.68, '１': 0.49, '２': 0.66, '３': 0.64, '４': 0.68, '５': 0.66, '６': 0.66, '７': 0.61, '８': 0.68, '９': 0.66};
function charWidth(ch: string, proportional: boolean): number {
  if (proportional && P_WIDTH[ch] !== undefined) return P_WIDTH[ch];
  const c = ch.charCodeAt(0);
  const half = c < 0x2000 || (c >= 0xff61 && c <= 0xff9f);
  return half ? (proportional ? 0.6 : 0.5) : 1;
}

type CharBox = {x: number; w: number; cy: number};

/** 欄の文字の1文字ずつの位置（改行は null）。何行もある欄は、行ごとに配置する */
function charBoxes(lay: SheetLayout, st: CellStyle, ref: string, text: string): {chars: (CharBox | null)[]; em: number; lineH: number; lines: number; height: number} {
  const box = rangeBox(lay, ref);
  const pad = 2; // 罫線と文字のあいだ
  const proportional = /[ＰP]/.test(st.font);
  const unit = Math.round((st.size * 4) / 3);
  const lines = text.split('\n');
  // 1文字ずつ（UTF-16 の単位で数える。indexOf で探した位置と合わせるため）
  const widths = lines.map((l) => l.split('').map((ch) => charWidth(ch, proportional) * unit));
  const totals = widths.map((ws) => ws.reduce((a, b) => a + b, 0));
  // 縮小して全体を表示する（1行の欄だけ）
  const scale = st.shrink && lines.length === 1 && totals[0] > box.w - 2 * pad ? (box.w - 2 * pad) / totals[0] : 1;
  const em = unit * scale;
  const lineH = lines.length > 1 ? em * LINE_K : em;
  const blockH = lines.length * lineH;
  const y0 =
    lines.length === 1
      ? st.vertical === 'center'
        ? box.y + box.h / 2 - lineH / 2
        : st.vertical === 'top'
          ? box.y + pad + em * 0.1
          : box.y + box.h - pad - em * 1.1
      : st.vertical === 'center'
        ? box.y + (box.h - blockH) / 2
        : st.vertical === 'top'
          ? box.y + pad
          : box.y + box.h - pad - blockH;
  const chars: (CharBox | null)[] = [];
  lines.forEach((line, li) => {
    if (li > 0) chars.push(null);
    const total = totals[li] * scale;
    const x0 =
      st.horizontal === 'center' || st.horizontal === 'centerContinuous' || st.horizontal === 'distributed'
        ? box.x + (box.w - total) / 2
        : st.horizontal === 'right'
          ? box.x + box.w - pad - total
          : box.x + pad + st.indent * em;
    const cy = y0 + lineH * li + lineH / 2;
    let x = x0;
    line.split('').forEach((_, ci) => {
      const w = widths[li][ci] * scale;
      chars.push({x, w, cy});
      x += w;
    });
  });
  return {chars, em, lineH, lines: lines.length, height: box.h};
}

/** needles を順に探して、i 番目の文字の位置（start〜end。from の位置から探す）。見つからなければ null */
export function findNeedle(text: string, needles: string[], i: number, from = 0): [number, number] | null {
  let at0 = from;
  for (let k = 0; k <= i && k < needles.length; k++) {
    const at = text.indexOf(needles[k], at0);
    if (at < 0) return null;
    if (k === i) return [at, at + needles[k].length];
    at0 = at + needles[k].length;
  }
  return null;
}

/** 欄の text の start〜end 文字目を囲む楕円の位置 */
function markBox(lay: SheetLayout, st: CellStyle, ref: string, text: string, start: number, end: number): Box | null {
  const {chars, em, lines, height} = charBoxes(lay, st, ref, text);
  // 文字の番号 → 改行を数えた位置（chars は改行の分も1つ持つ）
  const span = chars.slice(start, end).filter((c): c is CharBox => c !== null);
  if (span.length === 0) return null;
  const tx = span[0].x;
  const tw = span.reduce((n, c) => n + c.w, 0);
  const cy = span[0].cy;
  // 高さは欄に収まるだけ（1行の欄は文字の2倍まで。何行もある欄はとなりの行にかからない大きさ）。幅は文字の四すみが入るだけ
  const b = lines > 1 ? em * 0.72 : Math.max(em * 0.6, Math.min(height - 4, em * 2) / 2);
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

/** 楕円の図形（塗りなし・黒の線） */
function ellipseXml(lay: SheetLayout, box: Box, id: number): string {
  return (
    `<xdr:twoCellAnchor>${fromTo(lay, box)}` +
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="楕円 ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr><a:xfrm><a:off x="${emu(box.x)}" y="${emu(box.y)}"/><a:ext cx="${emu(box.w)}" cy="${emu(box.h)}"/></a:xfrm>` +
    `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:noFill/>` +
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

/** シートの図形のファイル（xl/drawings/drawing1.xml）。なければ作る */
function drawingOf(files: Files, sheetPath: string): string {
  const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  let rels = files[relsPath]
    ? strFromU8(files[relsPath])
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let sheetXml = strFromU8(files[sheetPath]);
  const rid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheetXml)?.[1];
  const rel = rid ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attrOf(r, 'Id') === rid) : undefined;
  const target = rel && attrOf(rel, 'Target');
  if (rid) return target ? resolvePath(sheetPath, target) : ''; // 図形のつながりが壊れていたら足さない
  let n = 1;
  while (files[`xl/drawings/drawing${n}.xml`]) n++;
  const path = `xl/drawings/drawing${n}.xml`;
  files[path] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>',
  );
  if (rels.includes('<Relationships') && rels.trimEnd().endsWith('/>')) rels = rels.replace(/\/>\s*$/, '></Relationships>');
  let k = 1;
  while (rels.includes(`Id="rId${k}"`)) k++;
  rels = rels.replace('</Relationships>', `<Relationship Id="rId${k}" Type="${REL_DRAWING}" Target="../drawings/drawing${n}.xml"/></Relationships>`);
  files[relsPath] = strToU8(rels);
  // <drawing> は pageSetup などのうしろ、legacyDrawing・tableParts などの前（Excel の決まった順）
  const tag = `<drawing r:id="rId${k}"/>`;
  const next = /<(?:legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sheetXml);
  sheetXml = next ? sheetXml.slice(0, next.index) + tag + sheetXml.slice(next.index) : sheetXml.replace('</worksheet>', `${tag}</worksheet>`);
  if (!/xmlns:r=/.test(/<worksheet\b[^>]*>/.exec(sheetXml)?.[0] ?? '')) {
    sheetXml = sheetXml.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  }
  files[sheetPath] = strToU8(sheetXml);
  const ct = strFromU8(files['[Content_Types].xml']);
  files['[Content_Types].xml'] = strToU8(ct.replace('</Types>', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`));
  return path;
}

/** 図形のファイルの次の番号（cNvPr の id） */
const nextShapeId = (d: string) => Math.max(1, ...[...d.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => Number(m[1]))) + 1;

/** 選んだもの（性別の「女」など）を丸で囲む：シートの図形に楕円を足す。囲んだ数を返す */
export function drawMarks(files: Files, sheet: string, marks: Mark[]): number {
  const path = sheetPath(files, sheet);
  const xml = strFromU8(files[path]);
  const lay = sheetLayout(xml);
  const shared = sharedStrings(files);
  const found: Box[] = [];
  for (const m of marks) {
    if (m.pick < 0) continue;
    const text = cellText(xml, m.cell, shared);
    const from = m.after ? text.indexOf(m.after) : 0;
    if (from < 0) continue;
    const at = findNeedle(text, m.needles, m.pick, m.after ? from + m.after.length : 0);
    const b = at && markBox(lay, cellStyle(files, xml, m.cell), m.cell, text, at[0], at[1]);
    if (b) found.push(b);
  }
  if (found.length === 0) return 0;
  const drawing = drawingOf(files, path);
  const d = drawing && files[drawing] ? strFromU8(files[drawing]) : '';
  if (!d.includes('</xdr:wsDr>')) return 0;
  const id = nextShapeId(d);
  files[drawing] = strToU8(d.replace('</xdr:wsDr>', `${found.map((b, k) => ellipseXml(lay, b, id + k)).join('')}</xdr:wsDr>`));
  return found.length;
}

/** シートの図形の楕円の数（テスト用） */
export function ellipseCount(files: Files, sheet: string): number {
  const path = sheetPath(files, sheet);
  const relsPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
  const rid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(strFromU8(files[path]))?.[1];
  if (!rid || !files[relsPath]) return 0;
  const rel = [...strFromU8(files[relsPath]).matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attrOf(r, 'Id') === rid);
  const target = rel && attrOf(rel, 'Target');
  const drawing = target ? resolvePath(path, target) : '';
  return drawing && files[drawing] ? (strFromU8(files[drawing]).match(/prst="ellipse"/g) ?? []).length : 0;
}

// ---------------------------------------------------------------- ブックの仕上げ

/** シートで 0 を出さない（式が空の欄を参照すると 0 と出るため。使っていない明細の行に「0」「0円」が並ばないように） */
export function hideZeros(files: Files, sheet: string): void {
  const path = sheetPath(files, sheet);
  const xml = strFromU8(files[path]);
  files[path] = strToU8(xml.replace(/<sheetView\b(?![^>]*showZeros)/, '<sheetView showZeros="0"'));
}

/**
 * 計算の順番の表（calcChain.xml）を外す。式の欄を値にしたとき（写真の用紙の「納品名」）に表が古いままだと、
 * Excel が「修復しました」と出すため。表がなくても Excel は開いたときに作り直す
 */
export function dropCalcChain(files: Files): void {
  if (!files['xl/calcChain.xml']) return;
  delete files['xl/calcChain.xml'];
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  files['xl/_rels/workbook.xml.rels'] = strToU8(rels.replace(/<Relationship\b[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/, ''));
  const ct = strFromU8(files['[Content_Types].xml']);
  files['[Content_Types].xml'] = strToU8(ct.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
}

/** 書き終えたブックを xlsx のバイト列にする：開いたときに式を計算し直す・雛形（.xltx）はふつうのブック（.xlsx）にする */
export function finishWorkbook(files: Files): Uint8Array {
  const wb = strFromU8(files['xl/workbook.xml']);
  if (/<calcPr\b(?![^>]*fullCalcOnLoad)/.test(wb)) files['xl/workbook.xml'] = strToU8(wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"'));
  const ct = strFromU8(files['[Content_Types].xml']);
  files['[Content_Types].xml'] = strToU8(ct.replace('spreadsheetml.template.main+xml', 'spreadsheetml.sheet.main+xml'));
  return zipSync(files, {level: 6});
}

// Excel（.xlsx）を書き出す小さな部品。ブラウザの中で xlsx を組み立てる（サーバーへは送らない）。
// zip は fflate（取り込みでも使っているもの）、書式・結合セル・計算式・A4 の印刷設定は Office Open XML を直接書く。
// 見積・提案書作成（taiyo-mitsumori）・消耗品売上管理の Excel 保存と同じ作り（このアプリは独立しているので写して使う）。

import {strToU8, zipSync} from 'fflate';

export const XL_MINCHO = 'BIZ UDP明朝 Medium'; // 印刷の BIZ UDP明朝 と同じ書体（Windows 10 以降に標準）。無い PC では Excel が近い明朝体で表示する
export const XL_GOTHIC = 'BIZ UDPゴシック'; // 印刷の見出し（BIZ UDPゴシック）と同じ書体
export const XL_PT_MM = 72 / 25.4; // 1mm は何 pt か
const MDW = 10; // 標準フォント（BIZ UDP明朝 Medium 11pt）の数字1文字の幅(px)。列幅の mm → Excel の幅 の換算に使う
const PX_MM = 96 / 25.4;
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const XLSX_MIME = CT + 'spreadsheetml.sheet';

export type XlFont = {name?: string; sz?: number; b?: boolean; color?: string};
/** 罫線は 'thin:C1D9EF' のような「線種:色」 */
export type XlBorder = {l?: string; r?: string; t?: string; b?: string};
export type XlAlign = {h?: 'left' | 'center' | 'right'; v?: 'top' | 'center' | 'bottom'; wrap?: boolean; indent?: number; shrink?: boolean};
export type XlStyle = {font?: XlFont; fill?: string; border?: XlBorder; align?: XlAlign; fmt?: string};
/** 1つのセルの中で大きさ・色を変える文字 */
export type XlRich = {rich: {t: string; font?: XlFont}[]};
/** 計算式と、開いた時点に見せる値（Excel が計算し直すまでの値） */
export type XlFormula = {f: string; v?: number | string};
export type XlValue = number | string | XlRich | XlFormula | null;

// XML に書けない制御文字を除いてエスケープ
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const colName = (c: number) => {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
/** 0 始まりの行・列 → "A1"（abs で "$A$1"） */
export const xlRef = (r: number, c: number, abs = false) => (abs ? `$${colName(c)}$${r + 1}` : `${colName(c)}${r + 1}`);
export const xlRange = (r1: number, c1: number, r2: number, c2: number, abs = false) => `${xlRef(r1, c1, abs)}:${xlRef(r2, c2, abs)}`;
const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();
const num = (n: number) => (Number.isFinite(n) ? String(Number(n.toPrecision(15))) : '0'); // Excel と同じ有効15桁
// mm → Excel の列幅（標準フォントの数字幅単位。パディング込みの値をそのまま書く）
const colWidth = (mm: number) => Math.max(0.5, Math.round(((mm * PX_MM) / MDW) * 256) / 256);

// 文字幅（em）の見積り。列幅と行の高さ（折り返し行数）を決めるのに使う。
// 半角英数は BIZ UDP明朝 の実際の字幅（0x20〜0x7E、1/100 em）、かなは少し広めに見積もる
const ASCII_EM = [
  33, 38, 49, 86, 68, 100, 87, 30, 47, 47, 50, 84, 33, 50, 33, 50, 68, 52, 68, 68, 68, 68, 68, 68, 68, 68, 33, 33, 84, 84, 84, 70, 98, 84, 74, 81, 80, 72, 66, 84, 80, 38, 50,
  79, 63, 96, 84, 84, 70, 86, 75, 70, 70, 82, 76, 98, 80, 76, 72, 50, 50, 50, 50, 31, 50, 62, 64, 58, 63, 63, 46, 66, 67, 33, 40, 65, 33, 92, 66, 62, 65, 64, 46, 54, 42, 64,
  61, 86, 66, 64, 55, 51, 44, 51, 50,
];
export function xlTextEm(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp < 0x7f) w += ASCII_EM[cp - 0x20] / 100;
    else if (cp === 0xa5) w += 0.68; // ¥
    else if (cp >= 0xff61 && cp <= 0xff9f) w += 0.5; // 半角カナ
    else if ('（）「」【】・：'.includes(ch)) w += 0.5;
    else if ('、。'.includes(ch)) w += 0.6;
    else if (ch === '　') w += 0.667; // 全角スペース（BIZ UDP明朝 は 2/3 em）
    else if (cp >= 0x3041 && cp <= 0x30ff) w += 0.95; // かな（プロポーショナル）
    else w += 1;
  }
  return w;
}
/** 文字列の幅(mm) */
export const xlTextMm = (s: string, pt: number) => (xlTextEm(s) * pt) / XL_PT_MM;
/**
 * 幅 widthMm の枠に sizePt の文字を折り返したときの行数。
 * 書体が置き換わって少し広く見える PC でも文字が切れないよう、使える幅は1割弱少なめに見積もる
 */
export function xlLineCount(text: string, widthMm: number, sizePt: number): number {
  const usable = Math.max(4, widthMm * 0.93);
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil((xlTextEm(line) * sizePt) / XL_PT_MM / usable - 0.02)), 0);
}

type Cell = {v: XlValue; s: number};
type Row = {ht: number | null; cells: Map<number, Cell>};
type Page = {margins: {l: number; r: number; t: number; b: number; h: number; f: number}; fitWidth: number; fitHeight: number; printArea: [number, number, number, number] | null};

export type XlSheet = {
  name: string;
  page: Page;
  /** 列幅（mm） */
  setCols: (mm: number[]) => void;
  /** 行の高さ（pt）。Excel の上限 409pt まで */
  height: (r: number, pt: number) => void;
  /** 結合セル。外枠の罫線を周りのセルに振り分け、塗りは全部のセルに入れる */
  box: (r1: number, c1: number, r2: number, c2: number, v: XlValue, st?: XlStyle) => void;
};

export function createXlsxBook() {
  const familyOf = (name: string) => (/明朝|Mincho/i.test(name) ? 1 : 3);
  // --- スタイル（フォント・塗り・罫線・表示形式・配置）を重複なく登録 ---
  const fonts: string[] = [];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const numFmts: string[] = [];
  const xfs: string[] = [];
  const idx = {font: new Map<string, number>(), fill: new Map<string, number>(), border: new Map<string, number>(), numFmt: new Map<string, number>(), xf: new Map<string, number>()};
  const intern = (map: Map<string, number>, list: string[], key: string, make: () => string) => {
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    list.push(make());
    map.set(key, list.length - 1);
    return list.length - 1;
  };
  const fontBody = (f: XlFont, tag: string) => {
    const name = f.name || XL_MINCHO;
    return `${f.b ? '<b/>' : ''}<sz val="${num(f.sz || 11)}"/><color rgb="${argb(f.color || '000000')}"/><${tag} val="${esc(name)}"/><family val="${familyOf(name)}"/><charset val="128"/>`;
  };
  const fontId = (f: XlFont = {}) => intern(idx.font, fonts, JSON.stringify([f.name || '', f.sz || 0, !!f.b, f.color || '']), () => `<font>${fontBody(f, 'name')}</font>`);
  fontId({});
  const fillId = (hex?: string) =>
    hex ? intern(idx.fill, fills, hex, () => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
  const edge = (tag: string, spec?: string) => {
    if (!spec) return `<${tag}/>`;
    const [st, col] = spec.split(':');
    return `<${tag} style="${st}"><color rgb="${argb(col || '000000')}"/></${tag}>`;
  };
  const borderId = (b?: XlBorder) =>
    !b || !(b.l || b.r || b.t || b.b)
      ? 0
      : intern(idx.border, borders, [b.l, b.r, b.t, b.b].join('|'), () => `<border>${edge('left', b.l)}${edge('right', b.r)}${edge('top', b.t)}${edge('bottom', b.b)}<diagonal/></border>`);
  const BUILTIN_FMT: Record<string, number> = {General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '@': 49};
  const numFmtId = (code?: string) => (!code ? 0 : (BUILTIN_FMT[code] ?? 164 + intern(idx.numFmt, numFmts, code, () => code)));
  const style = (st: XlStyle = {}) => {
    const key = JSON.stringify(st);
    const hit = idx.xf.get(key);
    if (hit !== undefined) return hit;
    const al = st.align || {};
    const alignXml =
      al.h || al.v || al.wrap || al.indent || al.shrink
        ? `<alignment${al.h ? ` horizontal="${al.h}"` : ''}${al.v ? ` vertical="${al.v}"` : ''}${al.wrap ? ' wrapText="1"' : ''}${al.indent ? ` indent="${al.indent}"` : ''}${al.shrink && !al.wrap ? ' shrinkToFit="1"' : ''}/>`
        : '';
    xfs.push(
      `<xf numFmtId="${numFmtId(st.fmt)}" fontId="${fontId(st.font)}" fillId="${fillId(st.fill)}" borderId="${borderId(st.border)}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignXml}</xf>`,
    );
    idx.xf.set(key, xfs.length - 1);
    return xfs.length - 1;
  };
  style({}); // 0 番 = 既定

  // --- 共有文字列（リッチテキストにも対応） ---
  const sst: string[] = [];
  const sstIdx = new Map<string, number>();
  let sstRefs = 0;
  // 先頭・末尾の空白や改行を残すときだけ xml:space="preserve" を付ける（Excel と同じ）
  const tXml = (t: string) => `<t${/^\s|\s$|[\n\t]/.test(t) ? ' xml:space="preserve"' : ''}>${esc(t)}</t>`;
  const stringId = (v: string | XlRich) => {
    sstRefs++;
    const key = typeof v === 'string' ? 's:' + v : 'r:' + JSON.stringify(v);
    const hit = sstIdx.get(key);
    if (hit !== undefined) return hit;
    const xml =
      typeof v === 'string'
        ? `<si>${tXml(v)}</si>`
        : `<si>${v.rich
            .filter((r) => r.t !== '')
            .map((r) => `<r><rPr>${fontBody(r.font || {}, 'rFont')}</rPr>${tXml(r.t)}</r>`)
            .join('')}</si>`;
    sst.push(xml);
    sstIdx.set(key, sst.length - 1);
    return sst.length - 1;
  };

  const sheets: (XlSheet & {cols: number[]; rows: Map<number, Row>; merges: string[]})[] = [];
  const addSheet = (name: string, page: Partial<Page> = {}): XlSheet => {
    const rows = new Map<number, Row>();
    const rowOf = (r: number) => {
      let row = rows.get(r);
      if (!row) rows.set(r, (row = {ht: null, cells: new Map()}));
      return row;
    };
    const merges: string[] = [];
    const ws = {
      name: (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet1').slice(0, 31),
      page: {margins: {l: 15, r: 15, t: 12, b: 12, h: 6, f: 6}, fitWidth: 1, fitHeight: 0, printArea: null, ...page},
      cols: [] as number[],
      rows,
      merges,
      setCols: (mm: number[]) => {
        ws.cols = mm.map(colWidth);
      },
      height: (r: number, pt: number) => {
        const row = rowOf(r);
        row.ht = Math.min(409, Math.max(row.ht || 0, Math.round(pt * 4) / 4));
      },
      box: (r1: number, c1: number, r2: number, c2: number, v: XlValue, st: XlStyle = {}) => {
        const b = st.border || {};
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            const s = style({...st, border: {l: c === c1 ? b.l : undefined, r: c === c2 ? b.r : undefined, t: r === r1 ? b.t : undefined, b: r === r2 ? b.b : undefined}});
            const cur = rowOf(r).cells.get(c);
            rowOf(r).cells.set(c, {v: r === r1 && c === c1 ? v : (cur?.v ?? null), s});
          }
        }
        if (r1 !== r2 || c1 !== c2) merges.push(xlRange(r1, c1, r2, c2));
      },
    };
    sheets.push(ws);
    return ws;
  };

  const cellXml = (r: number, c: number, {v, s}: Cell) => {
    const at = xlRef(r, c);
    const sa = s ? ` s="${s}"` : '';
    if (v === null || v === '') return `<c r="${at}"${sa}/>`;
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${at}"${sa}><v>${num(v)}</v></c>` : `<c r="${at}"${sa}/>`;
    if (typeof v === 'object' && 'f' in v) {
      if (typeof v.v === 'string') return `<c r="${at}"${sa} t="str"><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>`;
      return `<c r="${at}"${sa}><f>${esc(v.f)}</f>${typeof v.v === 'number' && Number.isFinite(v.v) ? `<v>${num(v.v)}</v>` : ''}</c>`;
    }
    return `<c r="${at}"${sa} t="s"><v>${stringId(v)}</v></c>`;
  };
  const mm2in = (mm: number) => num(Math.round((mm / 25.4) * 1000) / 1000);
  const sheetXml = (ws: (typeof sheets)[number], i: number) => {
    let maxR = 0;
    let maxC = 0;
    const sd = [...ws.rows.keys()]
      .sort((a, b) => a - b)
      .map((r) => {
        const row = ws.rows.get(r)!;
        maxR = Math.max(maxR, r);
        const cells = [...row.cells.keys()]
          .sort((a, b) => a - b)
          .map((c) => {
            maxC = Math.max(maxC, c);
            return cellXml(r, c, row.cells.get(c)!);
          })
          .join('');
        return `<row r="${r + 1}"${row.ht ? ` ht="${num(row.ht)}" customHeight="1"` : ''}>${cells}</row>`;
      })
      .join('');
    const p = ws.page;
    const m = p.margins;
    return (
      XML_HEAD +
      `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
      (p.fitWidth || p.fitHeight ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
      `<dimension ref="A1:${xlRef(maxR, Math.max(maxC, ws.cols.length - 1))}"/>` +
      `<sheetViews><sheetView showGridLines="0"${i === 0 ? ' tabSelected="1"' : ''} zoomScale="100" zoomScaleNormal="100" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>` +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (ws.cols.length ? `<cols>${ws.cols.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${num(w)}" customWidth="1"/>`).join('')}</cols>` : '') +
      `<sheetData>${sd}</sheetData>` +
      (ws.merges.length ? `<mergeCells count="${ws.merges.length}">${ws.merges.map((x) => `<mergeCell ref="${x}"/>`).join('')}</mergeCells>` : '') +
      '<printOptions horizontalCentered="1"/>' +
      `<pageMargins left="${mm2in(m.l)}" right="${mm2in(m.r)}" top="${mm2in(m.t)}" bottom="${mm2in(m.b)}" header="${mm2in(m.h)}" footer="${mm2in(m.f)}"/>` +
      `<pageSetup paperSize="9" orientation="portrait"${p.fitWidth || p.fitHeight ? ` fitToWidth="${p.fitWidth}" fitToHeight="${p.fitHeight}"` : ''}/>` +
      '</worksheet>'
    );
  };

  const toBytes = (title = ''): Uint8Array => {
    const files: Record<string, Uint8Array> = {};
    // [Content_Types].xml を先頭に置く（一部の読み込み側が先頭を期待するため）。中身はほかを書いたあとで入れる
    files['[Content_Types].xml'] = new Uint8Array();
    const ct: string[] = [];
    const wbRels: string[] = [];
    sheets.forEach((ws, i) => {
      files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(ws, i));
      ct.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}spreadsheetml.worksheet+xml"/>`);
      wbRels.push(`<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
    });
    wbRels.push(`<Relationship Id="rId${sheets.length + 1}" Type="${NS_R}/styles" Target="styles.xml"/>`);
    wbRels.push(`<Relationship Id="rId${sheets.length + 2}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/>`);
    const names = sheets
      .map((ws, i) => {
        const a = ws.page.printArea;
        return a ? `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${esc(`'${ws.name.replace(/'/g, "''")}'!${xlRange(a[0], a[1], a[2], a[3], true)}`)}</definedName>` : '';
      })
      .join('');
    // スタイル・共有文字列はシートの XML を作る途中で登録されるので、シートのあとに書き出す
    files['xl/styles.xml'] = strToU8(
      XML_HEAD +
        `<styleSheet xmlns="${NS_MAIN}">` +
        (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((code, k) => `<numFmt numFmtId="${164 + k}" formatCode="${esc(code)}"/>`).join('')}</numFmts>` : '') +
        `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
        `<fills count="${fills.length}">${fills.join('')}</fills>` +
        `<borders count="${borders.length}">${borders.join('')}</borders>` +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
        '<cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    );
    files['xl/sharedStrings.xml'] = strToU8(XML_HEAD + `<sst xmlns="${NS_MAIN}" count="${sstRefs}" uniqueCount="${sst.length}">${sst.join('')}</sst>`);
    files['xl/workbook.xml'] = strToU8(
      XML_HEAD +
        `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>` +
        `<sheets>${sheets.map((ws, i) => `<sheet name="${esc(ws.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        (names ? `<definedNames>${names}</definedNames>` : '') +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    );
    files['xl/_rels/workbook.xml.rels'] = strToU8(XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files['docProps/core.xml'] = strToU8(
      XML_HEAD +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${esc(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    );
    files['docProps/app.xml'] = strToU8(
      XML_HEAD +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application></Properties>',
    );
    files['_rels/.rels'] = strToU8(
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>` +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        `<Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    );
    files['[Content_Types].xml'] = strToU8(
      XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/xl/workbook.xml" ContentType="${CT}spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="${CT}spreadsheetml.styles+xml"/>` +
        `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT}spreadsheetml.sharedStrings+xml"/>` +
        ct.join('') +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        `<Override PartName="/docProps/app.xml" ContentType="${CT}extended-properties+xml"/></Types>`,
    );
    return zipSync(files, {level: 6});
  };

  return {addSheet, toBytes};
}

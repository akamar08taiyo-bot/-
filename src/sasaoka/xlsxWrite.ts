// Excel（.xlsx）の書き出し。見積書を元の Excel と同じ形で保存するために、罫線・文字の大きさ・結合・列の幅・行の高さ・
// 印刷の設定（A4横・余白・ヘッダー・フッター・倍率・改ページ）と、金額の式を書く。
// .xlsx は XML のファイルを ZIP にまとめたもの（読み取りの xlsx.ts と同じ fflate を使う）

import {strToU8, zipSync} from 'fflate';

export type XLine = 'thin' | 'medium';
export type XBorder = {l?: XLine; r?: XLine; t?: XLine; b?: XLine};
export type XStyle = {
  font?: string; // フォント名（ＭＳ Ｐゴシック など）
  size?: number; // 文字の大きさ（pt）
  bold?: boolean;
  color?: string; // 文字の色（'C00000' など。RGB の16進数6けた。なければ黒）
  h?: 'left' | 'center' | 'right';
  v?: 'top' | 'center' | 'bottom';
  wrap?: boolean; // 折り返して全体を表示（改行も）
  shrink?: boolean; // 縮小して全体を表示
  numFmt?: string; // 表示形式（'#,##0' など）
  border?: XBorder;
};
/** マスの中身。f は式（先頭の = はつけない）。式のときの v は計算済みの値（開いてすぐ見える数字） */
export type XCell = {v?: string | number | null; f?: string; s?: XStyle};
export type XRow = {h: number; cells: Map<number, XCell>}; // h：行の高さ（mm）。cells：列（0から）→ 中身
export type XSheet = {
  name: string;
  cols: number[]; // 列の幅（mm）
  rows: XRow[];
  merges: [number, number, number, number][]; // [上の行, 左の列, 下の行, 右の列]（0から）
  breaks: number[]; // この行（0から）のうしろで改ページ
  landscape: boolean;
  scale?: number; // 印刷の倍率（%）
  margins: {l: number; r: number; t: number; b: number; header: number; footer: number}; // mm
  header?: string; // ヘッダー・フッター（Excel の書き方。&L 左・&C 中・&R 右・&P ページ・&N ページ数・&9 文字の大きさ）
  footer?: string;
  font: {name: string; size: number}; // ふだんの文字（列の幅の単位もこの文字で決まる）
  images?: XImage[]; // 貼る画像（平面図の見取図。madori/xlsx.ts）
  // 1ページに合わせて印刷する（改ページのないシートだけ。Excel は「1ページに合わせる」にすると手動の改ページを使わない）。
  // 字体のちがう PC（LibreOffice など）で列が広くなっても1枚に収まる（見取図。madori/xlsx.ts）
  fitPage?: boolean;
};

/** 貼る画像（PNG）。位置と大きさはシートの左上（A1 の角）からの mm（列の幅・行の高さの mm で、どのマスの上かを決める） */
export type XImage = {png: Uint8Array; x: number; y: number; w: number; h: number; name?: string};

// XML に書けない制御文字は消す（Word・PowerPoint の Shift+Enter の改行 U+000B・改ページ U+000C は改行にする）。
// 残すと Excel が「修復しますか」と聞いて、その欄の中身を捨てる（申請書の shinsei.ts の esc と同じ決まり）
const esc = (s: string) =>
  s
    .replace(/[\v\f]/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 列の番号（0から）→ A, B, …, Z, AA … */
export function colName(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** マスの名前（G12 など）。r・c は0から */
export const cellRef = (r: number, c: number) => `${colName(c)}${r + 1}`;

const PX_PER_MM = 96 / 25.4;
const PT_PER_MM = 72 / 25.4;
// ファイルに書く列の幅の単位は「ふだんの文字の数字1つの幅」（左右の余白込み）。ＭＳ Ｐゴシック 11pt では 8px
// （日本語の Excel のふつうの幅 8.38 ＝ 72px が、ファイルでは 9 になる）
const DIGIT_PX = 8;
const colWidth = (mm: number) => Math.max(0.5, Math.round(((mm * PX_PER_MM) / DIGIT_PX) * 100) / 100);

/** 書式の一覧（同じ書式は1つにまとめ、番号で指す） */
class Styles {
  fonts: string[] = [];
  borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  numFmts: string[] = [];
  xfs: string[] = [];
  private index(list: string[], xml: string) {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }
  private base: {name: string; size: number};
  constructor(base: {name: string; size: number}) {
    this.base = base;
    this.font({});
    this.xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
  }
  private font(s: XStyle) {
    return this.index(
      this.fonts,
      `<font>${s.bold ? '<b/>' : ''}<sz val="${s.size ?? this.base.size}"/>${s.color ? `<color rgb="FF${s.color}"/>` : ''}<name val="${esc(s.font ?? this.base.name)}"/><family val="3"/><charset val="128"/></font>`,
    );
  }
  xf(s: XStyle | undefined): number {
    if (!s) return 0;
    const fontId = this.font(s);
    const b = s.border ?? {};
    const side = (tag: string, l?: XLine) => (l ? `<${tag} style="${l}"><color indexed="64"/></${tag}>` : `<${tag}/>`);
    const borderId = this.index(this.borders, `<border>${side('left', b.l)}${side('right', b.r)}${side('top', b.t)}${side('bottom', b.b)}<diagonal/></border>`);
    let numFmtId = 0;
    if (s.numFmt === '#,##0') numFmtId = 3;
    else if (s.numFmt) numFmtId = 164 + this.index(this.numFmts, s.numFmt);
    const align = `<alignment${s.h ? ` horizontal="${s.h}"` : ''} vertical="${s.v ?? 'center'}"${s.wrap ? ' wrapText="1"' : ''}${s.shrink && !s.wrap ? ' shrinkToFit="1"' : ''}/>`;
    return this.index(
      this.xfs,
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="0" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">${align}</xf>`,
    );
  }
  xml(): string {
    const numFmts = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>`
      : '';
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      numFmts +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

function cellXml(ref: string, cell: XCell, styles: Styles): string {
  const s = styles.xf(cell.s);
  const sAttr = s ? ` s="${s}"` : '';
  const num = typeof cell.v === 'number' && Number.isFinite(cell.v);
  if (cell.f) return `<c r="${ref}"${sAttr}><f>${esc(cell.f)}</f>${num ? `<v>${cell.v}</v>` : ''}</c>`;
  if (num) return `<c r="${ref}"${sAttr}><v>${cell.v}</v></c>`;
  if (typeof cell.v === 'string' && cell.v !== '') return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
  return `<c r="${ref}"${sAttr}/>`;
}

function sheetXml(sh: XSheet, styles: Styles): string {
  const cols = sh.cols.map((mm, i) => `<col min="${i + 1}" max="${i + 1}" width="${colWidth(mm)}" customWidth="1"/>`).join('');
  const rows = sh.rows
    .map((row, r) => {
      const cells = [...row.cells.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([c, cell]) => cellXml(cellRef(r, c), cell, styles))
        .join('');
      return `<row r="${r + 1}" ht="${Math.round(row.h * PT_PER_MM * 100) / 100}" customHeight="1">${cells}</row>`;
    })
    .join('');
  const merges = sh.merges.length
    ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(([r0, c0, r1, c1]) => `<mergeCell ref="${cellRef(r0, c0)}:${cellRef(r1, c1)}"/>`).join('')}</mergeCells>`
    : '';
  const inch = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;
  const m = sh.margins;
  const hf =
    sh.header || sh.footer
      ? `<headerFooter>${sh.header ? `<oddHeader>${esc(sh.header)}</oddHeader>` : ''}${sh.footer ? `<oddFooter>${esc(sh.footer)}</oddFooter>` : ''}</headerFooter>`
      : '';
  const breaks = sh.breaks.length
    ? `<rowBreaks count="${sh.breaks.length}" manualBreakCount="${sh.breaks.length}">${sh.breaks.map((r) => `<brk id="${r + 1}" max="16383" man="1"/>`).join('')}</rowBreaks>`
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    (sh.fitPage ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="100"/></sheetViews>' +
    `<sheetFormatPr defaultRowHeight="13.5"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${merges}` +
    `<pageMargins left="${inch(m.l)}" right="${inch(m.r)}" top="${inch(m.t)}" bottom="${inch(m.b)}" header="${inch(m.header)}" footer="${inch(m.footer)}"/>` +
    // A4（9）。倍率を決めて、改ページは書いたとおりにする（「1ページに合わせる」にすると、Excel は改ページを使わない）
    `<pageSetup paperSize="9" scale="${sh.scale ?? 100}"${sh.fitPage ? ' fitToWidth="1" fitToHeight="1"' : ''} orientation="${sh.landscape ? 'landscape' : 'portrait'}"/>` +
    hf +
    breaks +
    (sh.images?.length ? '<drawing r:id="rId1"/>' : '') +
    '</worksheet>'
  );
}

const EMU_PER_MM = 36000;

/** mm の位置 → マスと、そのマスの左上からのずれ（EMU）。列・行の境目は sheetXml と同じ mm */
function cellAt(sizes: number[], v: number): {i: number; off: number} {
  let start = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (v < start + sizes[i] || i === sizes.length - 1) return {i, off: Math.max(0, Math.round((v - start) * EMU_PER_MM))};
    start += sizes[i];
  }
  return {i: 0, off: 0};
}

/** 画像を置く図形の XML（画像1つにつき1つ。マスの大きさを変えても画像の大きさは変わらない＝editAs oneCell） */
function drawingXml(sh: XSheet): string {
  const colsMm = sh.cols;
  const rowsMm = sh.rows.map((r) => r.h);
  const pics = (sh.images ?? []).map((im, k) => {
    const id = k + 2;
    const a = {c: cellAt(colsMm, im.x), r: cellAt(rowsMm, im.y)};
    const b = {c: cellAt(colsMm, im.x + im.w), r: cellAt(rowsMm, im.y + im.h)};
    const name = esc(im.name ?? `画像 ${id}`);
    return (
      `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${a.c.i}</xdr:col><xdr:colOff>${a.c.off}</xdr:colOff><xdr:row>${a.r.i}</xdr:row><xdr:rowOff>${a.r.off}</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>${b.c.i}</xdr:col><xdr:colOff>${b.c.off}</xdr:colOff><xdr:row>${b.r.i}</xdr:row><xdr:rowOff>${b.r.off}</xdr:rowOff></xdr:to>` +
      `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm><a:off x="${Math.round(im.x * EMU_PER_MM)}" y="${Math.round(im.y * EMU_PER_MM)}"/><a:ext cx="${Math.round(im.w * EMU_PER_MM)}" cy="${Math.round(im.h * EMU_PER_MM)}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`
    );
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    pics.join('') +
    '</xdr:wsDr>'
  );
}

/** シートを .xlsx（ZIP）にする */
export function writeXlsx(sheets: XSheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error('シートがありません');
  const styles = new Styles(sheets[0].font);
  const files: Record<string, Uint8Array> = {};
  const drawings: number[] = []; // 画像のあるシート（何番目か）
  let media = 0;
  sheets.forEach((sh, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sh, styles));
    if (!sh.images?.length) return;
    const d = drawings.length + 1;
    drawings.push(i);
    files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${d}.xml"/>` +
        '</Relationships>',
    );
    files[`xl/drawings/drawing${d}.xml`] = strToU8(drawingXml(sh));
    const rels = sh.images.map((im, k) => {
      media++;
      files[`xl/media/image${media}.png`] = im.png;
      return `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${media}.png"/>`;
    });
    files[`xl/drawings/_rels/drawing${d}.xml.rels`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>',
    );
  });
  const sheetName = (s: string) => esc(s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      (media ? '<Default Extension="png" ContentType="image/png"/>' : '') +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      drawings.map((_, d) => `<Override PartName="/xl/drawings/drawing${d + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('') +
      '</Types>',
  );
  files['_rels/.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  );
  files['xl/workbook.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>' +
      `<sheets>${sheets.map((sh, i) => `<sheet name="${sheetName(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
      '</workbook>',
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
  );
  files['xl/styles.xml'] = strToU8(styles.xml());
  return zipSync(files, {level: 6});
}

/** 罫線の指定：ふつうの線・太い線、hidden はその線を消す（となりのマスに線があっても引かない） */
export type XEdge = XLine | 'hidden';
export type XEdges = {l?: XEdge; r?: XEdge; t?: XEdge; b?: XEdge};
const EDGE_RANK: Record<XEdge, number> = {thin: 1, medium: 2, hidden: 3};

/**
 * シートを組み立てる道具。マスに書き、罫線は HTML の表（border-collapse）と同じく、となり合うマスの線を
 * 1本にまとめる（hidden ＞ 太い線 ＞ ふつうの線）。結合したマスは外まわりの線だけを引く
 */
export class SheetBuilder {
  rows: XRow[] = [];
  merges: [number, number, number, number][] = [];
  breaks: number[] = [];
  private across = new Map<string, XEdge>(); // r 行の上の横線（c 列）
  private down = new Map<string, XEdge>(); // c 列の左の縦線（r 行）
  private edge(map: Map<string, XEdge>, key: string, e: XEdge | undefined) {
    if (!e) return;
    const cur = map.get(key);
    if (!cur || EDGE_RANK[e] > EDGE_RANK[cur]) map.set(key, e);
  }
  row(h: number): number {
    this.rows.push({h, cells: new Map()});
    return this.rows.length - 1;
  }
  /** r 行 c 列に書く。rs・cs は結合する行数・列数。edges は結合したマスの外まわりの線。f は式 */
  put(r: number, c: number, v: string | number | null, s: XStyle = {}, edges: XEdges = {}, rs = 1, cs = 1, f?: string) {
    for (let i = 0; i < rs; i++) {
      for (let j = 0; j < cs; j++) {
        const first = i === 0 && j === 0;
        this.rows[r + i].cells.set(c + j, first ? {v, f, s} : {v: null, s});
      }
    }
    for (let j = 0; j < cs; j++) {
      this.edge(this.across, `${r},${c + j}`, edges.t);
      this.edge(this.across, `${r + rs},${c + j}`, edges.b);
    }
    for (let i = 0; i < rs; i++) {
      this.edge(this.down, `${r + i},${c}`, edges.l);
      this.edge(this.down, `${r + i},${c + cs}`, edges.r);
    }
    if (rs > 1 || cs > 1) this.merges.push([r, c, r + rs - 1, c + cs - 1]);
  }
  /** ここまでの行のうしろで改ページ */
  pageBreak() {
    this.breaks.push(this.rows.length - 1);
  }
  /** 線をそれぞれのマスの書式にしてシートにする（となり合う両方のマスに同じ線を書く） */
  sheet(opts: Omit<XSheet, 'rows' | 'merges' | 'breaks'>): XSheet {
    const line = (e: XEdge | undefined): XLine | undefined => (e === 'hidden' ? undefined : e);
    const rows = this.rows.map((row, r) => {
      const cells = new Map<number, XCell>();
      for (const [c, cell] of row.cells) {
        const border: XBorder = {
          l: line(this.down.get(`${r},${c}`)),
          r: line(this.down.get(`${r},${c + 1}`)),
          t: line(this.across.get(`${r},${c}`)),
          b: line(this.across.get(`${r + 1},${c}`)),
        };
        cells.set(c, {...cell, s: {...cell.s, border}});
      }
      return {h: row.h, cells};
    });
    return {...opts, rows, merges: this.merges, breaks: this.breaks};
  }
}

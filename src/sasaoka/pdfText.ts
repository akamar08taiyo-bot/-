// PDFの仕切り表から文字を読み取る（文字情報のあるPDFのみ。スキャンした画像だけのPDFは読めない）。
// pdf.js はPDFを読むときにだけ読み込む。作業用の別スレッド（worker）は使わず、この画面の中で読む
// （1ファイルのアプリにまとめるため。仕切り表くらいの大きさなら数秒で終わる）。

type TextItem = {str: string; transform: number[]; width: number; height: number};

// 日本語のPDFで文字を正しく読むための対応表（CMap）。アプリに同梱して、ネットにつながなくても読めるようにする
const CMAP_FILES = import.meta.glob(
  [
    '/node_modules/pdfjs-dist/cmaps/Adobe-Japan1-*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/UniJIS*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/*RKSJ*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/{78-EUC-H,78-EUC-V,78-H,78-V,EUC-H,EUC-V,H,V,Add-H,Add-V,Ext-H,Ext-V,NWP-H,NWP-V,Hankaku,Hiragana,Katakana,Roman,WP-Symbol}.bcmap',
  ],
  {query: '?inline', import: 'default'},
) as Record<string, () => Promise<string>>;

// スキャンした PDF の白黒の画像（JBIG2・CCITT＝複合機・FAX の圧縮）と JPEG 2000 を描く部品（WebAssembly）。
// 同梱しないと、その画像だけ描けずにページが真っ白になり、介護保険証などのスキャンを読めなかった（ユーザーの報告「保険証などが上手く取り込めないケースがあった」2026-10-29）
const WASM_FILES = import.meta.glob(['/node_modules/pdfjs-dist/wasm/{jbig2,openjpeg}.wasm'], {query: '?inline', import: 'default'}) as Record<string, () => Promise<string>>;

async function bundledBytes(files: Record<string, () => Promise<string>>, fileName: string): Promise<Uint8Array> {
  const key = Object.keys(files).find((k) => k.endsWith('/' + fileName));
  if (!key) throw new Error('not bundled: ' + fileName);
  const dataUrl = await files[key]();
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** pdf.js が CMap・画像を描く部品を取りに来たときに、同梱したものを渡す */
class BundledDataFactory {
  constructor(_opts: unknown) {}
  async fetch({kind, filename}: {kind: string; filename: string}): Promise<Uint8Array> {
    if (kind === 'cMapUrl') return bundledBytes(CMAP_FILES, filename);
    if (kind === 'wasmUrl') return bundledBytes(WASM_FILES, filename);
    throw new Error(`${kind} は同梱していません`);
  }
}

export class NoTextError extends Error {
  constructor() {
    super('NO_TEXT');
  }
}

/**
 * PDFの文字を、見た目の行ごとにまとめて返す。
 * 同じ行の中で間が大きくあいている所（表の列の区切り）はタブ（\t）でつなぐ。
 */
/** 1語ごとの文字と左右の位置（表の列をそろえるのに使う） */
export type PdfWord = {s: string; x0: number; x1: number};

/** PDF を開く（画面の中で処理する。文字を読むときも、ページを画像にするときも同じ） */
async function openPdf(data: Uint8Array) {
  // worker の本体を先に読み込んでおくと、pdf.js はそれを使って画面の中で処理する。
  // 新しい版の pdf.js は最新のブラウザにしかない機能（Map.getOrInsertComputed など）を使うため、
  // 足りない機能を補ってある legacy 版を使う（会社のパソコンのブラウザが少し古くても読める）
  await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.min.mjs')) as typeof import('pdfjs-dist');
  return pdfjs.getDocument({
    data,
    cMapUrl: 'bundled://cmaps/',
    cMapPacked: true,
    wasmUrl: 'bundled://wasm/',
    useWorkerFetch: false,
    // pdf.js の型定義にはないが、CMap の取り寄せ方を差し替えられる
    BinaryDataFactory: BundledDataFactory,
    isEvalSupported: false,
    disableFontFace: true,
  } as Parameters<typeof pdfjs.getDocument>[0]);
}

/**
 * PDF の各ページを画像（JPEG。長い辺 maxSide 画素）にする。写真の枠に PDF をそのまま入れられるように
 * （ユーザーの指示「PDFファイルをドラッグ＆ドロップでそのまま添付できるようにする」2026-10-22。スキャンした写真・PDF で届いた写真など）
 */
export async function pdfToImages(data: Uint8Array, maxSide = 1600, maxPages = 20): Promise<Blob[]> {
  const task = await openPdf(data);
  const out: Blob[] = [];
  try {
    const doc = await task.promise;
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const base = page.getViewport({scale: 1});
      const viewport = page.getViewport({scale: Math.min(4, maxSide / Math.max(base.width, base.height, 1))});
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.fillStyle = '#fff'; // 透明な所は白（紙と同じ）
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({canvas, canvasContext: ctx, viewport}).promise;
      out.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF を画像にできませんでした'))), 'image/jpeg', 0.9)));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return out;
}

export async function pdfToLines(data: Uint8Array): Promise<{lines: string[]; words: PdfWord[][]; pages: number}> {
  const task = await openPdf(data);
  const doc = await task.promise;

  const lines: string[] = [];
  const words: PdfWord[][] = [];
  let textItems = 0;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as TextItem[]).filter((it) => typeof it.str === 'string' && it.str.trim() !== '');
      textItems += items.length;
      for (const row of groupRows(items)) {
        lines.push(row.text);
        words.push(row.words);
      }
    }
  } finally {
    await task.destroy();
  }
  if (textItems === 0) throw new NoTextError();
  return {lines, words, pages: doc.numPages};
}

/** 見た目の行ごとにまとめる。行の文字（列の区切りはタブ）と、1語ずつの位置を返す */
function groupRows(items: TextItem[]): {text: string; words: PdfWord[]}[] {
  const rows: {y: number; h: number; items: TextItem[]}[] = [];
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  for (const it of sorted) {
    const y = it.transform[5];
    const h = Math.abs(it.transform[3]) || it.height || 10;
    const row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, Math.min(r.h, h) * 0.5));
    if (row) row.items.push(it);
    else rows.push({y, h, items: [it]});
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const its = r.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let out = '';
    let prevEnd: number | null = null;
    let prevCharW = 5;
    const words: PdfWord[] = [];
    for (const it of its) {
      const x = it.transform[4];
      const charW = it.str.length ? it.width / it.str.length : prevCharW;
      if (prevEnd !== null) {
        const gap = x - prevEnd;
        const unit = Math.max(1, Math.min(prevCharW, charW || prevCharW));
        if (gap > unit * 1.8) out += '\t';
        else if (gap > unit * 0.3) out += ' ';
      }
      out += it.str;
      // 1つの文字のかたまりの中の空白で語に分け、位置は文字数の割合で見積もる
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      const n = Math.max(1, it.str.length);
      while ((m = re.exec(it.str))) {
        words.push({s: m[0], x0: x + (it.width * m.index) / n, x1: x + (it.width * (m.index + m[0].length)) / n});
      }
      prevEnd = x + it.width;
      prevCharW = charW || prevCharW;
    }
    // 間をあけずに続いている語（「手すり」「I型」が別々の文字のかたまりになっているときなど）はつなげない。列の判定は語ごとに行う
    return {text: out.replace(/\s*\t\s*/g, '\t').trim(), words};
  });
}

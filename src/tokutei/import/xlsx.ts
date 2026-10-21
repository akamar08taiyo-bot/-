// Excel（.xlsx）の表の文字・数字だけを読む小さな読み取り部品。
// 住宅改修 見積書アプリの src/sasaoka/xlsx.ts（2026-10-20 の版）を写したもの（このアプリは独立しているので、写したあとは別々に直す）。
// 書式・数式は使わず、セルに表示されている値（数式なら計算済みの値）を表として取り出す。
// .xls（古い形式）は読めないので、Excelで .xlsx として保存し直してもらう。

import {strFromU8, unzipSync} from 'fflate';
import type {Grid} from './priceImport.ts';

export type Sheet = {name: string; rows: Grid};

const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : '';
};

/** <si> などの中の文字。ふりがな（<rPh>）は除く */
function textOf(xml: string): string {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<phoneticPr\b[^>]*\/?>/g, '');
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out += decodeXml(m[1]);
  return out;
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** 指数表記や 3799.9999999 のような誤差を、表示どおりの数字に近づける */
const numText = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
};

export function isXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"（zip）
}

export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes, {filter: (f) => f.name.startsWith('xl/')});
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '');

  const shared: string[] = [];
  const sst = read('xl/sharedStrings.xml');
  if (sst) {
    const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sst))) shared.push(m[1] ? textOf(m[1]) : '');
  }

  const rels = new Map<string, string>();
  const relXml = read('xl/_rels/workbook.xml.rels');
  for (const tag of relXml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const target = attr(tag, 'Target');
    rels.set(attr(tag, 'Id'), target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, ''));
  }

  const sheets: Sheet[] = [];
  const wb = read('xl/workbook.xml');
  for (const tag of wb.match(/<sheet\b[^>]*>/g) ?? []) {
    // 隠してあるシート（計算用・社内用など）は読まない
    if (/hidden/i.test(attr(tag, 'state'))) continue;
    const name = attr(tag, 'name');
    const rid = attr(tag, 'r:id');
    const path = rels.get(rid);
    const xml = path ? read(path) : '';
    if (!xml) continue;
    sheets.push({name, rows: readSheet(xml, shared)});
  }
  return sheets;
}

function readSheet(sheetXml: string, shared: string[]): Grid {
  // 中身のない行（<row r="5"/>）は先に除く。残すと次の行と混ざって1行ずれる
  const xml = sheetXml.replace(/<row\b[^>]*\/>/g, '');
  const grid: Grid = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  let nextRow = 0;
  while ((rm = rowRe.exec(xml))) {
    const rAttr = attr(`<row${rm[1]}>`, 'r');
    const r = rAttr ? Number(rAttr) - 1 : nextRow;
    nextRow = r + 1;
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let nextCol = 0;
    while ((cm = cellRe.exec(rm[2]))) {
      const head = `<c${cm[1]}>`;
      const ref = attr(head, 'r');
      const c = ref ? colIndex(ref) : nextCol;
      nextCol = c + 1;
      const t = attr(head, 't');
      const inner = cm[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (t === 's') value = v !== undefined ? (shared[Number(v)] ?? '') : '';
      else if (t === 'inlineStr') value = textOf(inner);
      else if (t === 'str' || t === 'e') value = v !== undefined ? decodeXml(v) : '';
      else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v !== undefined ? numText(decodeXml(v)) : '';
      while (cells.length < c) cells.push('');
      cells[c] = value;
    }
    while (grid.length < r) grid.push([]);
    grid[r] = cells;
  }
  return grid.filter((row) => row.some((c) => c.trim() !== ''));
}

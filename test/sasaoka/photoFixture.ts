// 写真の取り込み（photoImport.ts）のテストで使う、架空の方（見本 二郎）の申請書（苅田町）。このアプリの書き出しに、Excel で足したような図形
// （同じ枠の2枚目の写真・黄色の線のフリーフォーム・テキストボックス・文字のないテキストボックス）を足す。写真はテストで作った色の四角
import {readFileSync} from 'node:fs';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {newPlace, manualRow} from '../../src/sasaoka/rows.ts';
import {fillShinsei, SHINSEI, shinseiValues, sheetPaths} from '../../src/sasaoka/shinsei.ts';
import type {Job, PhotoMark} from '../../src/sasaoka/types.ts';

const RATES = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateOverheadRate: 0.1, taxRate: 0.1};
const KANDA = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/kanda.xltx', import.meta.url)));

/** シート「1 」の図形のファイルに、Excel で足したような図形を足す（2枚目の写真は1枚目と同じ画像を90°回して・黄色の線のフリーフォーム・テキストボックス・文字のないテキストボックス） */
export function withExcelShapes(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  const sheet = sheetPaths(files).get('1 ')!;
  const rels = strFromU8(files[sheet.replace(/([^/]+)$/, '_rels/$1.rels')]);
  const drawing = `xl/drawings/${/Target="\.\.\/drawings\/([^"]+)"/.exec(rels)![1]}`;
  let d = strFromU8(files[drawing]);
  const rid = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(d)![1];
  const two = (c1: number, r1: number, c2: number, r2: number) =>
    `<xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`;
  const pic = `<xdr:twoCellAnchor editAs="oneCell">${two(4, 8, 6, 18)}<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="901" name="図 900"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:srcRect l="10000"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm rot="5400000"><a:off x="2000000" y="2200000"/><a:ext cx="1600000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  const free = `<xdr:twoCellAnchor>${two(0, 12, 4, 14)}<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="902" name="フリーフォーム: 図形 901"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="500000" y="3400000"/><a:ext cx="3500000" cy="400000"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst><a:gd name="csX0" fmla="*/ 0 w 3500000"/><a:gd name="csY0" fmla="*/ 400000 h 400000"/><a:gd name="csX1" fmla="*/ 1000000 w 3500000"/><a:gd name="csY1" fmla="*/ 0 h 400000"/><a:gd name="csX2" fmla="*/ 3500000 w 3500000"/><a:gd name="csY2" fmla="*/ 300000 h 400000"/></a:gdLst><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="3500000" h="400000"><a:moveTo><a:pt x="csX0" y="csY0"/></a:moveTo><a:lnTo><a:pt x="csX1" y="csY1"/></a:lnTo><a:lnTo><a:pt x="csX2" y="csY2"/></a:lnTo></a:path></a:pathLst></a:custGeom><a:noFill/><a:ln w="38100"><a:solidFill><a:srgbClr val="FFFF00"/></a:solidFill></a:ln></xdr:spPr><xdr:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></xdr:style></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;
  const txt = (id: number, text: string) =>
    `<xdr:oneCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>11</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="2000000" cy="500000"/><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="テキスト ボックス ${id}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="5000000" y="3400000"/><a:ext cx="2000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr><xdr:style><a:lnRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap="none"/><a:lstStyle/><a:p>${text ? `<a:r><a:rPr lang="ja-JP" sz="1600"/><a:t>${text}</a:t></a:r>` : ''}<a:endParaRPr lang="ja-JP" sz="1100"/></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:oneCellAnchor>`;
  d = d.replace('</xdr:wsDr>', `${pic}${free}${txt(903, '見本 L=600mm')}${txt(904, '')}</xdr:wsDr>`);
  files[drawing] = strToU8(d);
  return zipSync(files);
}

/** 写真入りの申請書：①浴室の改修前に写真 a（書き込み4つ＋Excel で足した図形）、②玄関の改修前に写真 b。a・b は JPEG（w×h） */
export function photoShinsei(a: {bytes: Uint8Array; w: number; h: number}, b: {bytes: Uint8Array; w: number; h: number}): Uint8Array {
  const base = {line: 'FF0000', width: 2.25, dash: 'solid', fill: '', size: 11, color: '000000'} as const;
  const marks: PhotoMark[] = [
    {...base, id: 'a', kind: 'line', x1: 0.1, y1: 0.9, x2: 0.6, y2: 0.2, end: true, line: '0070C0', width: 4.5},
    {...base, id: 'b', kind: 'ellipse', x1: 0.7, y1: 0.6, x2: 0.9, y2: 0.8},
  ];
  const job: Job = {
    id: 'j-photo',
    month: '2026-10',
    customer: '見本 二郎',
    suffix: '様邸',
    staff: '',
    date: '',
    address: '福岡県京都郡苅田町富久町1-1',
    note: '',
    insuredNo: '0000000002',
    insurer: 'kanda',
    form: 'yukuhashi',
    overhead: null,
    overheadTarget: null,
    shikiri: false,
    places: [
      {...newPlace('浴室', [manualRow('material', {name: '見本の手すり', unit: '本', listPrice: 10000, qty: 1})]), photo: 1, dims: {l: '700×1100×2000'}},
      {...newPlace('玄関', [manualRow('material', {name: '見本の手すり', unit: '本', listPrice: 10000, qty: 1})]), photo: 2},
    ],
    createdAt: 1,
    updatedAt: 1,
  };
  return withExcelShapes(fillShinsei(KANDA, SHINSEI.kanda!, {...shinseiValues(job, RATES), photoImages: {1: {before: {...a, marks}}, 2: {before: b}}}));
}

// 取り込みのブラウザのテスト（e2e-import-docs.mjs）で使う、架空の方の申請書・見積書・理由書の Excel を、このアプリの書き出しで作る。
// 名前・番号・住所はどれも見本（見本 花子・見本 太郎・試作 一郎。番号は 0000…）
import {readFileSync} from 'node:fs';
import {zipSync, strToU8} from 'fflate';
import {DEFAULT_LABOR, defaultSettings} from '../../src/sasaoka/defaults.ts';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {estimateTotals} from '../../src/sasaoka/calc.ts';
import {estimateXlsx} from '../../src/sasaoka/estimateXlsx.ts';
import {NO_RIYU, RIYU_MAP, riyuValues} from '../../src/sasaoka/riyu.ts';
import {laborRow, manualRow, newPlace} from '../../src/sasaoka/rows.ts';
import {fillShinsei, SHINSEI, shinseiValues} from '../../src/sasaoka/shinsei.ts';
import type {Job} from '../../src/sasaoka/types.ts';

const S = defaultSettings();
const tmpl = (name: string) => new Uint8Array(readFileSync(new URL(`../../src/sasaoka/shinsei/${name}.xltx`, import.meta.url)));

function sample(extra: Partial<Job> = {}): Job {
  const labor = laborRow(DEFAULT_LABOR[0], 2);
  return {
    id: 'j-fixture',
    month: '2026-10',
    customer: '見本 花子',
    suffix: '様邸',
    staff: '',
    date: '',
    estDate: '2026-10-21',
    address: '福岡県行橋市中央1-1',
    note: '',
    insuredNo: '0000366989',
    insurer: 'yukuhashi',
    form: '',
    overhead: null,
    overheadTarget: null,
    shikiri: true,
    places: [
      {...newPlace('玄関', [manualRow('material', {name: '木の手すり 35φ 4m', unit: '本', listPrice: 20000, qty: 1, lengthCm: 60, pieceLengthM: 4}), labor]), photo: 1},
      {...newPlace('トイレ', [manualRow('material', {name: 'L型手すり', unit: '本', listPrice: 11000, qty: 1})]), photo: 2},
    ],
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

/** ほかの工務店の形の見積書（このアプリの形ではない。お客様名・工事場所・見積日・合計だけ） */
function otherEstimate(): Uint8Array {
  const rows = [
    ['御見積書', '', '', '見本工務店株式会社'],
    ['試作 一郎 様', '', '', '見積日', '令和8年10月10日'],
    ['工事場所', '福岡県京都郡苅田町富久町1-1'],
    ['品名', '数量', '単価', '金額'],
    ['手すり取付工事', '1', '50,000', '50,000'],
    ['小計', '', '', '50,000'],
    ['消費税（10％）', '', '', '5,000'],
    ['合計', '', '', '55,000'],
  ];
  const xml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((r, i) => `<row r="${i + 1}">${r.map((v, c) => (v === '' ? '' : `<c r="${String.fromCharCode(65 + c)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)).join('')}</row>`)
    .join('')}</sheetData></worksheet>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="見積" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(xml),
  });
}

/** 取り込むファイル（名前・中身）と、確かめる金額 */
export function importFiles(): {files: {name: string; bytes: Uint8Array}[]; estimateTotal: number; applicationCost: number; otherTotal: number} {
  const est = sample();
  const app = sample({customer: '見本 太郎', places: [{...newPlace('浴室', [manualRow('material')]), kind: 1, photo: 1, dims: {l: '800'}}], shinsei: {...NO_SHINSEI, kana: 'ミホン　タロウ', cost: 30000}});
  const riyu = sample({shinsei: {...NO_SHINSEI, reasonOffice: '見本居宅介護支援事業所', reasonName: '見本 次郎'}, riyu: {...NO_RIYU, body: '右片麻痺がある。'}});
  return {
    files: [
      {name: '見本花子様住宅改修見積書.xlsx', bytes: estimateXlsx(est, S, '2026-10-21').bytes},
      {name: '見本太郎様住宅改修申請書.xlsx', bytes: fillShinsei(tmpl('yukuhashi'), SHINSEI.yukuhashi!, shinseiValues(app, S))},
      {name: '見本花子様住宅改修理由書.xlsx', bytes: fillShinsei(tmpl('riyu'), RIYU_MAP, riyuValues(riyu, S, '2026-10-20'))},
      {name: '試作様見積書.xlsx', bytes: otherEstimate()},
      {name: '古い形式.xls', bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])},
    ],
    estimateTotal: estimateTotals(est, S).all.total,
    applicationCost: 30000,
    otherTotal: 55000,
  };
}

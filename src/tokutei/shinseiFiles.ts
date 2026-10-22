// 申請書の原本（アプリの中に入れておく。src/tokutei/shinsei/）を開いて書き込み、Excel のファイルとして保存する。
// 原本は、いただいた様式から前の方の記入・写真・丸だけを消したもの（シート・様式・会社の欄はそのまま。DESIGN.md の 5.2）。
// 原本を替えるときは src/tokutei/shinsei/ のファイルを置きかえる（書く欄は shinsei.ts の SHINSEI）。

import {unzipSync} from 'fflate';
import kanda from './shinsei/kanda.xltx?inline';
import miyako from './shinsei/miyako.xlsx?inline';
import yukuhashi from './shinsei/yukuhashi.xltx?inline';
import {fillShinsei, shinseiFileName, shinseiForm, shinseiValues} from './shinsei.ts';
import type {ShinseiKey} from './shinsei.ts';
import type {Sale, Settings} from './types.ts';
import {downloadBlob} from './util.ts';

const TEMPLATES: Record<ShinseiKey, string> = {kanda, yukuhashi, miyako};
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 申請書（Excel）を作って保存する。保存したファイル名を返す */
export async function saveShinsei(sale: Sale, s: Settings): Promise<string> {
  const form = shinseiForm(sale.insurer);
  if (!form) throw new Error('この保険者の申請書の原本がまだありません');
  const buf = await (await fetch(TEMPLATES[form.key])).arrayBuffer();
  const bytes = fillShinsei(unzipSync(new Uint8Array(buf)), form, shinseiValues(sale, s));
  const name = shinseiFileName(sale);
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), name);
  return name;
}

// 申請書の原本（アプリの中に入れておく。src/tokutei/shinsei/）を開いて書き込み、Excel のファイルとして保存する。
// 原本は、いただいた様式から前の方の記入・写真・丸だけを消したもの（シート・様式・会社の欄はそのまま。DESIGN.md の 5.2）。
// 原本を替えるときは src/tokutei/shinsei/ のファイルを置きかえる（書く欄は shinsei.ts の SHINSEI）。

import {unzipSync} from 'fflate';
import {useEffect, useState} from 'react';
import fukuoka from './shinsei/fukuoka.xlsx?inline';
import kanda from './shinsei/kanda.xltx?inline';
import kitakyushu from './shinsei/kitakyushu.xlsx?inline';
import kouiki from './shinsei/kouiki.xlsx?inline';
import miyako from './shinsei/miyako.xlsx?inline';
import yukuhashi from './shinsei/yukuhashi.xltx?inline';
import {fillShinsei, shinseiFileName, shinseiForm, shinseiValues} from './shinsei.ts';
import type {ShinseiKey} from './shinsei.ts';
import type {Sale, Settings} from './types.ts';
import type {Files} from './xlsxEdit.ts';
import {downloadBlob} from './util.ts';

const TEMPLATES: Record<ShinseiKey, string> = {kanda, yukuhashi, miyako, kouiki, fukuoka, kitakyushu};
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 開いた原本（保険者ごとに1回だけ開いて覚えておく。書き込むときは {...files} に書く） */
const opened = new Map<ShinseiKey, Promise<Files>>();
export function openTemplate(key: ShinseiKey): Promise<Files> {
  let p = opened.get(key);
  if (!p) {
    p = fetch(TEMPLATES[key])
      .then((r) => r.arrayBuffer())
      .then((buf) => unzipSync(new Uint8Array(buf)));
    p.catch(() => opened.delete(key));
    opened.set(key, p);
  }
  return p;
}

/** 開いた原本（プレビュー用。開くまでは null） */
export function useTemplate(key: ShinseiKey | null): Files | null {
  const [files, setFiles] = useState<{key: ShinseiKey; files: Files} | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void openTemplate(key).then((f) => live && setFiles({key, files: f}));
    return () => {
      live = false;
    };
  }, [key]);
  return files && files.key === key ? files.files : null;
}

/** 申請書（Excel）を作る（ファイル名と中身。住宅改修の「まとめて保存」にも渡す） */
export async function shinseiBook(sale: Sale, s: Settings): Promise<{name: string; bytes: Uint8Array}> {
  const form = shinseiForm(sale.insurer);
  if (!form) throw new Error('この保険者の申請書の原本がまだありません');
  return {name: shinseiFileName(sale), bytes: fillShinsei({...(await openTemplate(form.key))}, form, shinseiValues(sale, s))};
}

/** 申請書（Excel）を作って保存する。保存したファイル名を返す */
export async function saveShinsei(sale: Sale, s: Settings): Promise<string> {
  const {name, bytes} = await shinseiBook(sale, s);
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), name);
  return name;
}

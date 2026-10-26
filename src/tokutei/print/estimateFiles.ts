// 販売見積書の原本（会社の見積書の Excel。mitsumori.xltx）を開いて、書き込んだ Excel を保存する（書く欄は estimateBook.ts）

import {unzipSync} from 'fflate';
import {useEffect, useState} from 'react';
import {estimateFileName, fillEstimate} from '../estimateBook.ts';
import type {Sale, Settings} from '../types.ts';
import {downloadBlob} from '../util.ts';
import type {Files} from '../xlsxEdit.ts';
import mitsumori from './mitsumori.xltx?inline';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 開いた原本（1回だけ開いて覚えておく。書き込むときは {...files} に書く） */
let opened: Promise<Files> | null = null;
export function openEstimateTemplate(): Promise<Files> {
  if (!opened) {
    opened = fetch(mitsumori)
      .then((r) => r.arrayBuffer())
      .then((buf) => unzipSync(new Uint8Array(buf)));
    opened.catch(() => {
      opened = null;
    });
  }
  return opened;
}

/** 開いた原本（プレビュー用。開くまでは null。on が false のあいだは開かない） */
export function useEstimateTemplate(on: boolean): Files | null {
  const [files, setFiles] = useState<Files | null>(null);
  useEffect(() => {
    if (!on || files) return;
    let live = true;
    void openEstimateTemplate().then((f) => live && setFiles(f));
    return () => {
      live = false;
    };
  }, [on, files]);
  return files;
}

/** 販売見積書（Excel）を保存する。名前は「御見積書_山田 花子様.xlsx」（印刷の PDF と同じ） */
export async function saveEstimateBook(sale: Sale, s: Settings): Promise<string> {
  const {name, bytes} = await estimateBook(sale, s);
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), name);
  return name;
}

/** 見積書（Excel）を作る（ファイル名と中身。住宅改修の「まとめて保存」にも渡す） */
export async function estimateBook(sale: Sale, s: Settings): Promise<{name: string; bytes: Uint8Array}> {
  return {name: estimateFileName(sale), bytes: fillEstimate(await openEstimateTemplate(), sale, s)};
}

// 申請書の原本（アプリの中に入れておく）。いただいた原本から、前の申請の名残り（被保険者の氏名・番号・電話・工事内容・写真・平面図・
// 性別などの丸）だけを消したもの（シート・様式・会社の情報はそのまま）。原本を替えるときは src/sasaoka/shinsei/ のファイルを置きかえる（転記する欄は shinsei.ts の SHINSEI）

import {unzipSync} from 'fflate';
import {useEffect, useState} from 'react';
import {downloadBlob} from '../util.ts';
import {XLSX_TYPE} from '../estimateXlsx.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {fillShinseiFiles, SHINSEI, shinseiFileName, shinseiValues} from '../shinsei.ts';
import type {Files} from '../shinsei.ts';
import type {Insurer, Job, Settings} from '../types.ts';
import kanda from '../shinsei/kanda.xltx?inline';
import kouiki from '../shinsei/kouiki.xltx?inline';
import miyako from '../shinsei/miyako.xltx?inline';
import yukuhashi from '../shinsei/yukuhashi.xltx?inline';

const TEMPLATES: Partial<Record<Insurer, string>> = {kanda, yukuhashi, miyako, kouiki};

/** この保険者の申請書を作れるか（原本をいただいた保険者だけ） */
export const canMakeShinsei = (insurer: Insurer | '') => !!insurer && !!TEMPLATES[insurer] && !!SHINSEI[insurer];

const opened = new Map<Insurer, Promise<Files>>();

/** 原本を開いたもの（はじめの1回だけ開いて覚えておく。プレビューで打つたびに開き直さない） */
export function openTemplate(insurer: Insurer): Promise<Files> {
  const url = TEMPLATES[insurer];
  if (!url) return Promise.reject(new Error('この保険者の申請書の原本がありません'));
  let p = opened.get(insurer);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => unzipSync(new Uint8Array(b)));
    p.catch(() => opened.delete(insurer)); // 開けなかったら次にもう一度
    opened.set(insurer, p);
  }
  return p;
}

/** 原本を開いたもの（開くまでは null） */
export function useTemplate(insurer: Insurer | ''): Files | null {
  const [got, setGot] = useState<{insurer: Insurer; files: Files} | null>(null);
  useEffect(() => {
    if (!insurer || !TEMPLATES[insurer]) return;
    let alive = true;
    openTemplate(insurer).then(
      (files) => alive && setGot({insurer, files}),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [insurer]);
  return got && got.insurer === insurer ? got.files : null;
}

/** 見積書の内容を転記した申請書（Excel）を保存する（ダウンロード）。保存したファイル名を返す */
export async function saveShinsei(job: Job, insurer: Insurer, s: Settings): Promise<string> {
  const map = SHINSEI[insurer];
  if (!map) throw new Error('この保険者の申請書の原本がありません');
  const bytes = fillShinseiFiles({...(await openTemplate(insurer))}, map, shinseiValues(job, s));
  const fileName = shinseiFileName(map, job, estimateDateOf(job));
  downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), fileName);
  return fileName;
}

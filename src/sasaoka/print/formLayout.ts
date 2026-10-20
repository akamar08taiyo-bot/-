// 見積書の2つの書式の寸法と決まった文。印刷（EstimateForms.tsx）と Excel の保存（estimateXlsx.ts）で同じものを使う。
// 列の幅・行の高さは、いただいた Excel の比のまま（mm）。

import type {EstimateTotals} from '../calc.ts';
import type {Job, Settings} from '../types.ts';
import {staffFull} from '../util.ts';

// ================================================================ 苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」
// 列 A〜M の幅（mm）。A 改修内容／B 改修場所（写真No.）／C 内容（規格・範囲）／D・E 数量と単位／F 単価／G 金額／
// H〜K 介護保険対象部分（数量・単位・単価・金額）／L 介護保険対象外金額／M 備考（定価等）
export const YK = {A: 31.1, B: 24.9, C: 48.1, D: 7.1, E: 7.1, F: 15.5, G: 22.3, H: 7.1, I: 7.1, J: 15.5, K: 25.2, L: 22.9, M: 32.2};
export const YK_ROW = 5.77; // 明細の1行（元の 16.35pt）

/** 苅田町・行橋市・みやこ町用の右上の施工業者（1ページ目だけ） */
export function issuerLines(job: Pick<Job, 'staff'>, s: Settings): string[] {
  return [
    `住　　　所　${s.address}`,
    `施工業者名　${s.company.replace('株式会社', '(株)')}${s.officeName}`,
    `代表者名　${s.officeName}所長　${s.manager}`,
    `担当者・電話番号　担当： ${staffFull(job.staff, s.staffList) || s.person}　${s.tel}`,
  ];
}

// ================================================================ 広域連合用「住宅改修内訳明細書」（福岡県介護保険広域連合の様式）
// 列 A〜R の幅（mm）。E・J は区切りの二重線のすき間。
// A 改修箇所（室名）／B 改修箇所毎工事名称／C 材・手／D 部材・仕様／F〜I 全改修工事部分（数量・単位・単価・金額）／
// K 写真番号／L 改修の種類／M〜P 対象工事部分（数量・単位・単価・金額）／Q・R 算出根拠
export const KK = {
  A: 14.76,
  B: 38.58,
  C: 5.44,
  D: 38.58,
  E: 1.2,
  F: 11.39,
  G: 7.77,
  H: 15.02,
  I: 20.46,
  J: 1.2,
  K: 7.77,
  L: 22.79,
  M: 11.39,
  N: 7.77,
  O: 15.02,
  P: 18.9,
  Q: 13.72,
  R: 14.24,
};
// 明細の14行の高さ（mm）。元の 30pt×10行と、合計の入る下の4行（27.75・24.75・26.25・24.75pt）を、A4横に入るよう縮めたもの
export const KK_ROWS = [...Array(10).fill(9.67), 8.95, 7.98, 8.46, 7.98];
export const KK_LEFT = KK.A + KK.B + KK.C + KK.D + KK.E + KK.F + KK.G + KK.H + KK.I + KK.J + KK.K; // A〜K
export const KK_RIGHT = KK.L + KK.M + KK.N + KK.O + KK.P + KK.Q + KK.R; // L〜R
export const NOTE_PHOTO = '※写真番号は、写真貼り付け用紙の写真番号と同じに';
export const NOTE_MARK = '※材料費と施工費を工事項目毎に明記。　※「改修箇所毎工事名称」欄記入の時は、材料費は（材）、施工費は（手）を名称の前に明記。';
export const NOTE_KIND = '※改修の種類は、該当する番号だけを記入';
export const KK_NOTE_1 = '※介護保険対象にならない部分は、全改修工事部分の欄に記入。';
export const KK_NOTE_2 = '※介護保険対象にならない部分を含む時は、全改修工事部分に記入、対象部分を抽出し対象工事部分に記入（算出根拠を）';
export const KK_FOOT = ['福岡県介護保険広域連合', '2021.4'];

/** 合計の欄の4行（小計・諸経費・消費税・合計）。[名前, 全体, 介護保険の対象] */
export function totalRows(t: EstimateTotals): [string, number, number][] {
  return [
    ['小計', t.all.subtotal, t.target.subtotal],
    ['諸経費', t.all.overhead, t.target.overhead],
    ['消費税', t.all.tax, t.target.tax],
    ['合計', t.all.total, t.target.total],
  ];
}

import {useState} from 'react';
import {shinseiChecks, shinseiForm} from '../shinsei.ts';
import {saveShinsei} from '../shinseiFiles.ts';
import type {Sale, Settings} from '../types.ts';
import {useToast} from './ui.tsx';

/**
 * 申請書（保険者の Excel の原本に書き込んだもの）を作る。1つのファイルに 事前申請書・支給申請書・委任状・写真の用紙 が入る
 * （納品のあとに作り直すと、購入日・撮影日も入る。広域連合は支給申請書と写真の用紙）。まだ入っていない欄は空欄のまま作る
 * （入っていない欄はプレビューの薄い黄色で分かる）。ボタンは案件の上の段（SaleEditor.tsx。住宅改修の申請書のタブと同じ所）
 */
export function useShinseiExcel(sale: Sale, settings: Settings): {make: () => Promise<void>; busy: boolean} {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const name = await saveShinsei(sale, settings);
      toast(`${name} を保存しました`);
    } catch (e) {
      toast(`申請書を作れませんでした：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return {make, busy};
}

/**
 * 申請書の様式の行に入らない商品の知らせ（入るときは何も出さない）。原本のない保険者（そのほか）も出さない。
 * 前はここに「📄 申請書（Excel）を作る」「🖨 印刷」「📖 カタログを印刷」も並べていたが、
 * ユーザーの指示「特定福祉用具の印刷ボタンなどの位置を住宅改修などと統一する」（2026-10-27）で上の段（名前の右）に移した
 */
export function ShinseiPanel({sale, settings}: {sale: Sale; settings: Settings}) {
  if (!shinseiForm(sale.insurer)) return null;
  const {overflow} = shinseiChecks(sale, settings);
  return overflow ? <p className="rounded-md bg-rose-50 p-2 text-xs font-bold text-rose-700">{overflow}</p> : null;
}

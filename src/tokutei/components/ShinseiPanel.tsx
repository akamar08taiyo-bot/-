import {useState} from 'react';
import {shinseiChecks, shinseiForm} from '../shinsei.ts';
import {saveShinsei} from '../shinseiFiles.ts';
import type {Sale, Settings} from '../types.ts';
import {Btn, useToast} from './ui.tsx';

/**
 * 申請書（保険者の Excel の原本に書き込んだもの）を作る。作る前に、様式の行に入らない商品を出す（まだ入っていない欄は空欄のまま作る。「未入力」の一覧は
 * ユーザーの指示「全体的にシンプルにしたいので、今回はなくしてください。すべて」2026-10-26 で外した。入っていない欄はプレビューの薄い黄色で分かる）。
 * 1つのファイルに 事前申請書・支給申請書・委任状・写真の用紙 が入る（納品のあとに作り直すと、購入日・撮影日も入る。広域連合は支給申請書と写真の用紙）。
 * 原本のない保険者（そのほか）は出さない。画面に説明文は置かない（ユーザーの好み。説明は README とタイルの使い方の文）
 */
export function ShinseiPanel({sale, settings}: {sale: Sale; settings: Settings}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const form = shinseiForm(sale.insurer);
  if (!form) return null;
  const {overflow} = shinseiChecks(sale, settings);
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
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <h3 className="mb-2 font-bold text-teal-800">📄 申請書（{form.title}）</h3>
      <Btn color="excel" className="w-full" onClick={make} disabled={busy}>
        {busy ? '作っています…' : '📄 申請書（Excel）を作る'}
      </Btn>
      {overflow && <p className="mt-2 rounded-md bg-rose-50 p-2 text-xs font-bold text-rose-700">{overflow}</p>}
    </section>
  );
}

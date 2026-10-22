import {useState} from 'react';
import {insurerLabel} from '../defaults.ts';
import {shinseiChecks, shinseiForm} from '../shinsei.ts';
import {saveShinsei} from '../shinseiFiles.ts';
import type {Sale, Settings} from '../types.ts';
import {Btn, useToast} from './ui.tsx';

/**
 * 申請書（保険者の Excel の原本に書き込んだもの）を作る。作る前に、まだ入っていない欄と、様式の行に入らない商品を出す（空欄のまま作ってもよい）。
 * 1つのファイルに 事前申請書・支給申請書・委任状・写真の用紙 が入る（納品のあとに作り直すと、購入日・撮影日も入る）
 */
export function ShinseiPanel({sale, settings}: {sale: Sale; settings: Settings}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const form = shinseiForm(sale.insurer);
  const label = insurerLabel(sale.insurer, sale.insurerName);
  if (!form) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <h3 className="mb-1 font-bold text-teal-800">📄 申請書</h3>
        <p className="text-slate-600">
          {label ? `${label}の申請書の原本はまだアプリに入っていません。原本（Excel）をいただければ、同じように自動で書き込めるようにします。` : '保険者を選ぶと、その保険者の申請書を作れます（行橋市・苅田町・みやこ町）。'}
        </p>
      </section>
    );
  }
  const {missing, overflow} = shinseiChecks(sale, settings);
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
    <section className="rounded-xl border border-blue-200 bg-white p-4 text-sm shadow-sm">
      <h3 className="mb-2 font-bold text-teal-800">📄 申請書（{form.title}）</h3>
      <Btn color="blue" className="w-full" onClick={make} disabled={busy}>
        {busy ? '作っています…' : '📄 申請書（Excel）を作る'}
      </Btn>
      <p className="mt-2 text-[11px] text-slate-500">
        事前申請書・支給申請書・委任状・写真の用紙が1つのファイルに入ります。見積もりの内容（お客様・商品・金額・理由・日付）がそのまま入り、性別・元号・要介護度は丸で囲みます。
      </p>
      {overflow && <p className="mt-2 rounded-md bg-rose-50 p-2 text-xs font-bold text-rose-700">{overflow}</p>}
      {missing.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <div className="font-bold">まだ入っていない欄（空欄のまま作ります）</div>
          <div>{missing.join('・')}</div>
        </div>
      )}
    </section>
  );
}

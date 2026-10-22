import {useState} from 'react';
import {insurerLabel} from '../defaults.ts';
import {customerLabel, pastCustomers} from '../sales.ts';
import type {Sale} from '../types.ts';
import {matchesAll} from '../util.ts';
import {Modal, TextInput} from './ui.tsx';

/**
 * 前の見積もりのお客様を選ぶ（2回目からのお客様は、氏名・番号・住所・介護保険・ケアマネジャーを打ち直さない）。
 * 選ぶと、その方のいちばん新しい見積もりの内容を写す（商品・日付は写さない）
 */
export function CustomerPicker({sales, current, onPick, onClose}: {sales: Sale[]; current: Sale; onPick: (from: Sale) => void; onClose: () => void}) {
  const [q, setQ] = useState('');
  const list = pastCustomers(sales, current).filter((s) => matchesAll(`${s.customer} ${s.kana} ${s.insuredNo} ${s.address} ${s.careManager}`, q));
  return (
    <Modal title="前の見積もりのお客様から入れる" onClose={onClose}>
      <TextInput value={q} onChange={setQ} placeholder="名前・フリガナ・番号で探す" className="mb-3 w-full" aria-label="お客様を探す" autoFocus />
      {list.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">{q ? '見つかりません。' : 'まだ前の見積もりがありません。'}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {list.slice(0, 50).map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick(s)} className="grid w-full gap-0.5 px-3 py-2 text-left hover:bg-teal-50">
                <span className="font-bold text-slate-800">
                  {customerLabel(s)}
                  {s.kana && <span className="ml-2 text-xs font-normal text-slate-500">{s.kana}</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {[insurerLabel(s.insurer, s.insurerName), s.careLevel, s.insuredNo && `番号 ${s.insuredNo}`, s.careManager && `ケアマネ ${s.careManager}`].filter(Boolean).join('　')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">お客様・介護保険（保険者・負担割合）・居宅介護支援事業所・ケアマネジャーを写します。商品・日付は写しません。</p>
    </Modal>
  );
}

import {DEFAULT_LABOR} from '../defaults.ts';
import type {AppData, LaborItem} from '../types.ts';
import type {Update} from '../useStore.ts';
import {uid} from '../util.ts';
import {Btn, NumberInput, TextInput, useToast} from './ui.tsx';

export function LaborPage({data, update}: {data: AppData; update: Update}) {
  const toast = useToast();
  const set = (id: string, patch: Partial<LaborItem>) => update('labor', (list) => list.map((l) => (l.id === id ? {...l, ...patch} : l)));
  const move = (i: number, d: number) =>
    update('labor', (list) => {
      const k = i + d;
      if (k < 0 || k >= list.length) return list;
      const next = [...list];
      [next[i], next[k]] = [next[k], next[i]];
      return next;
    });

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-[#0c315e]">取付手間の単価（笹岡手間・1箇所あたり）</h1>
        <div className="ml-auto flex gap-2">
          <Btn color="emerald" onClick={() => update('labor', (list) => [...list, {id: uid('l'), name: '', price: 0, note: ''}])}>
            ＋ 項目を追加
          </Btn>
          <Btn
            color="white"
            onClick={() => {
              if (!confirm('取付手間の単価を、最初の「笹岡手間」の表の内容に戻します。追加・変更した項目は消えます。よろしいですか？')) return;
              update('labor', () => DEFAULT_LABOR.map((l) => ({...l})));
              toast('最初の単価表に戻しました');
            }}
          >
            最初の単価表に戻す
          </Btn>
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        様邸の画面で「取付手間」を押すと、ここの項目が並び、箇所数を数えるだけで「単価×箇所数」が入ります。単価を変えても、すでに作った様邸の金額は変わりません。
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600">
            <tr>
              <th className="w-12 px-2 py-2">No.</th>
              <th className="px-2 py-2 text-left">項目</th>
              <th className="w-36 px-2 py-2 pr-4 text-right">単価（1箇所）</th>
              <th className="px-2 py-2 text-left">メモ</th>
              <th className="w-28 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.labor.map((l, i) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-2 text-center tabular-nums">{i + 1}</td>
                <td className="px-2 py-1">
                  <TextInput value={l.name} onChange={(name) => set(l.id, {name})} className="w-full font-bold" placeholder="項目名" />
                </td>
                <td className="px-2 py-1 text-right">
                  <NumberInput value={l.price} onChange={(price) => set(l.id, {price})} className="w-28" ariaLabel={`${l.name}の単価`} />
                </td>
                <td className="px-2 py-1">
                  <TextInput value={l.note} onChange={(note) => set(l.id, {note})} className="w-full text-xs" />
                </td>
                <td className="whitespace-nowrap px-2 text-right">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="上へ">
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={i === data.labor.length - 1}
                    onClick={() => move(i, 1)}
                    className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    title="下へ"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => update('labor', (list) => list.filter((x) => x.id !== l.id))}
                    className="rounded px-1.5 text-rose-600 hover:bg-rose-50"
                    title="削除"
                    aria-label={`${l.name}を削除`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

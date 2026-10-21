import {useMemo, useState} from 'react';
import {saleTotals} from '../calc.ts';
import {INSURERS, insurerLabel} from '../defaults.ts';
import {copySale, customerLabel, newSale} from '../sales.ts';
import type {AppData, Sale, SaleStatus} from '../types.ts';
import type {Update} from '../useStore.ts';
import {dateLabel, matchesAll, yen} from '../util.ts';
import {Btn, TextInput, useToast} from './ui.tsx';

const STATUS_COLOR: Record<SaleStatus, string> = {
  見積: 'bg-slate-100 text-slate-700',
  申請: 'bg-amber-100 text-amber-800',
  承認: 'bg-sky-100 text-sky-800',
  納品: 'bg-emerald-100 text-emerald-800',
  集金: 'bg-teal-600 text-white',
};

/** 見積もりの最初の画面：新しく作る（保険者を選ぶ）と、作った見積もりの一覧 */
export function SalesPage({data, update, onOpen, onPrint}: {data: AppData; update: Update; onOpen: (id: string) => void; onPrint: (id: string) => void}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SaleStatus | ''>('');

  const create = (insurer: string) => {
    const sale = newSale(data.sales, data.settings, insurer);
    update('sales', (list) => [...list, sale]);
    onOpen(sale.id);
  };

  const shown = useMemo(
    () =>
      [...data.sales]
        .filter(
          (x) =>
            (status === '' || x.status === status) &&
            matchesAll(`${x.customer} ${x.kana} ${x.quoteNo} ${insurerLabel(x.insurer, x.insurerName)} ${x.items.map((i) => i.name).join(' ')} ${x.careManager} ${x.careOffice}`, query),
        )
        .sort((a, b) => (b.estimateDate || '').localeCompare(a.estimateDate || '') || b.createdAt - a.createdAt),
    [data.sales, query, status],
  );

  const remove = (sale: Sale) => {
    if (!window.confirm(`「${customerLabel(sale)}」の見積もりを消します。元に戻せません。よろしいですか？`)) return;
    update('sales', (list) => list.filter((x) => x.id !== sale.id));
    toast('消しました');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-teal-800">新しい見積もりを作る（保険者を選ぶ）</h2>
        <div className="flex flex-wrap gap-2">
          {INSURERS.map((i) => (
            <Btn key={i.key} color="emerald" onClick={() => create(i.key)} title={i.note}>
              ＋ {i.key === 'kouiki' ? '広域連合' : i.label}
            </Btn>
          ))}
        </div>
        {data.products.length === 0 && <p className="mt-2 text-xs text-amber-700">商品マスタが空です。先に「📦 商品マスタ」で仕切り一覧表を取り込むと、★から商品を選べます。</p>}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <TextInput value={query} onChange={setQuery} placeholder="お客様名・商品名・ケアマネで検索" className="w-64" aria-label="見積もりを検索" />
        <select value={status} onChange={(e) => setStatus(e.target.value as SaleStatus | '')} className="h-9 rounded-md border border-slate-300 px-2 text-sm" aria-label="状態で絞る">
          <option value="">すべての状態</option>
          {(Object.keys(STATUS_COLOR) as SaleStatus[]).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-slate-500">{shown.length}件</span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{data.sales.length === 0 ? 'まだ見積もりがありません。' : '見つかりませんでした。'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((x) => {
            const t = saleTotals(x, data.settings);
            const first = x.items[0]?.name ?? '';
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <button type="button" onClick={() => onOpen(x.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${STATUS_COLOR[x.status]}`}>{x.status}</span>
                    <span className="font-bold text-slate-800">{customerLabel(x)}</span>
                    <span className="text-xs text-slate-500">{insurerLabel(x.insurer, x.insurerName)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {dateLabel(x.estimateDate)}　{first ? `${first}${x.items.length > 1 ? ` ほか${x.items.length - 1}点` : ''}` : '商品なし'}
                  </div>
                </button>
                <div className="text-right">
                  <div className="font-bold tabular-nums text-slate-900">{yen(t.total)}円</div>
                  <div className="text-[11px] tabular-nums text-slate-500">
                    利用者 {yen(t.userPay)}円・{x.burdenRatio}割
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Btn small color="teal" onClick={() => onOpen(x.id)}>
                    開く
                  </Btn>
                  <Btn small color="sky" onClick={() => onPrint(x.id)}>
                    印刷
                  </Btn>
                  <Btn
                    small
                    color="white"
                    onClick={() => {
                      const c = copySale(x, data.sales);
                      update('sales', (list) => [...list, c]);
                      toast('複製しました');
                    }}
                  >
                    複製
                  </Btn>
                  <Btn small color="white" onClick={() => remove(x)} aria-label={`${customerLabel(x)}を消す`}>
                    ✕
                  </Btn>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import {useEffect, useMemo, useState} from 'react';
import {saleTotals} from '../calc.ts';
import {INSURERS, insurerLabel} from '../defaults.ts';
import {customerLabel, newSale} from '../sales.ts';
import type {AppData, Sale, SaleStatus} from '../types.ts';
import type {Update} from '../useStore.ts';
import {dateLabel, matchesAll, yen} from '../util.ts';
import {Btn, TextInput, useToast} from './ui.tsx';

const STATUS_COLOR: Record<SaleStatus, string> = {
  見積: 'bg-slate-100 text-slate-700',
  申請: 'bg-amber-100 text-amber-800',
  承認: 'bg-sky-100 text-sky-800',
  納品: 'bg-emerald-100 text-emerald-800',
  集金: 'bg-teal-200 text-teal-900',
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
  // 先頭のチェックで選んで、まとめて消す（ユーザーの指示「一括で削除ボタンをつくる」2026-10-26。住宅改修の見積もりの一覧の「N件を選んでいます…削除する」と同じ形）。
  // 消す前にいつも確かめる（元に戻せない）。検索・状態の絞りを変えたら選んだものは外す
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  useEffect(() => setChecked(new Set()), [query, status]);
  const picked = shown.filter((x) => checked.has(x.id));
  const allChecked = shown.length > 0 && picked.length === shown.length;
  const toggle = (id: string) =>
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const removeChecked = () => {
    const ids = new Set(picked.map((x) => x.id));
    if (ids.size === 0 || !window.confirm(`${ids.size}件の見積もりを消します。元に戻せません。よろしいですか？`)) return;
    update('sales', (list) => list.filter((x) => !ids.has(x.id)));
    setChecked(new Set());
    toast(`${ids.size}件を消しました`);
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
        {shown.length > 0 && (
          <label className="flex items-center gap-1.5 px-1 text-sm text-slate-600">
            <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((x) => x.id)))} className="h-4 w-4" aria-label="すべて選ぶ" />
            すべて
          </label>
        )}
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
      {picked.length > 0 && (
        <div role="status" aria-label="選んだ見積もり" className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span className="font-bold">{picked.length}件を選んでいます</span>
          <Btn small color="white" onClick={removeChecked}>
            まとめて削除
          </Btn>
          <Btn small color="white" onClick={() => setChecked(new Set())}>
            やめる
          </Btn>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{data.sales.length === 0 ? 'まだ見積もりがありません。' : '見つかりませんでした。'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((x) => {
            const t = saleTotals(x, data.settings);
            const first = x.items[0]?.name ?? '';
            return (
              <li key={x.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 shadow-sm ${checked.has(x.id) ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'}`}>
                <input type="checkbox" checked={checked.has(x.id)} onChange={() => toggle(x.id)} className="h-4 w-4 shrink-0" aria-label={`${customerLabel(x)}を選ぶ`} />
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

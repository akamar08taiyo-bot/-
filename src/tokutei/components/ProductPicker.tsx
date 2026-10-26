import {useMemo, useState} from 'react';
import {categoryLabel, categoryTab} from '../category.ts';
import type {Product, Settings} from '../types.ts';
import {matchesAll, yen} from '../util.ts';
import {productPrice, sortProducts} from './ProductsPage.tsx';
import {Btn, Modal, Star, TextInput} from './ui.tsx';

type View = 'fav' | 'recent' | 'all';

/**
 * 案件に入れる商品を選ぶ画面。★お気に入り → 最近使った → すべて（検索）の順。種目のタブで絞れる。
 * 「入れる」を押すたびに明細に1行入る（閉じるまで続けて選べる）
 */
export function ProductPicker({
  products,
  settings,
  onPick,
  onToggleFavorite,
  onClose,
}: {
  products: Product[];
  settings: Settings;
  onPick: (p: Product) => void;
  onToggleFavorite: (p: Product) => void;
  onClose: () => void;
}) {
  const favCount = products.filter((p) => p.favorite).length;
  const [view, setView] = useState<View>(favCount > 0 ? 'fav' : 'all');
  const [tab, setTab] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, number>>({});

  const base = useMemo(() => {
    if (view === 'fav') return sortProducts(products.filter((p) => p.favorite));
    if (view === 'recent') return [...products].filter((p) => p.lastUsedAt > 0).sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, 50);
    return sortProducts(products);
  }, [products, view]);
  const tabs = useMemo(() => [...new Set(base.map((p) => categoryTab(p.category)))], [base]);
  const shown = base.filter((p) => (tab === '' || categoryTab(p.category) === tab) && matchesAll(`${p.name} ${p.maker} ${p.code} ${p.category} ${p.sub}`, query)).slice(0, 200);

  return (
    <Modal
      wide
      title="商品を選ぶ"
      onClose={onClose}
      footer={
        <Btn color="blue" onClick={onClose}>
          閉じる
        </Btn>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(
              [
                ['fav', `★お気に入り（${favCount}）`],
                ['recent', '最近使った'],
                ['all', `すべて（${products.length}）`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setView(id);
                  setTab('');
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-bold ${view === id ? 'bg-teal-100 text-teal-900 ring-1 ring-inset ring-teal-300' : 'text-slate-600 hover:bg-teal-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <TextInput value={query} onChange={setQuery} placeholder="商品名・メーカー・品番で検索" className="w-64" aria-label="商品を検索" autoFocus />
        </div>
        {tabs.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {['', ...tabs].map((t) => (
              <button
                key={t || 'all'}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${tab === t ? 'border-teal-400 bg-teal-100 text-teal-900' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {t || 'すべての種目'}
              </button>
            ))}
          </div>
        )}
        {products.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">商品マスタが空です。「📦 商品マスタ」から仕切り一覧表を取り込んでください。</p>
        ) : shown.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {view === 'fav' && favCount === 0 ? 'まだ★の商品がありません。「すべて」から選んで ☆ を押すと★になります。' : '見つかりませんでした。'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {shown.map((p) => {
              const {price} = productPrice(p, settings);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 sm:flex-nowrap">
                  <Star on={p.favorite} onClick={() => onToggleFavorite(p)} label={`${p.name}を★に`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-slate-800">{p.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {[categoryLabel(p.category, p.sub) || '種目なし', p.maker, p.code].filter(Boolean).join('　')}
                    </div>
                  </div>
                  <div className="text-right text-xs tabular-nums text-slate-500">
                    {p.listPrice > 0 && <div>定価 {yen(p.listPrice)}</div>}
                    <div className="text-sm font-bold text-slate-800">{price > 0 ? `${yen(price)}円` : '価格なし'}</div>
                  </div>
                  <Btn
                    small
                    color="emerald"
                    onClick={() => {
                      onPick(p);
                      setPicked((m) => ({...m, [p.id]: (m[p.id] ?? 0) + 1}));
                    }}
                    aria-label={`${p.name}を入れる`}
                  >
                    ＋ 入れる{picked[p.id] ? `（${picked[p.id]}）` : ''}
                  </Btn>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

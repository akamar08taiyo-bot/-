import {useMemo, useState} from 'react';
import {categoryTab, sortSubs, subShort} from '../category.ts';
import type {Product, Settings} from '../types.ts';
import {matchesAll, yen} from '../util.ts';
import {productPrice, sortProducts} from './ProductsPage.tsx';
import {Btn, Modal, Star, TextInput} from './ui.tsx';

type View = 'fav' | 'recent' | 'all';

/**
 * 案件に入れる商品を選ぶ画面。★お気に入り → 最近使った → すべて（検索）の順。種目のタブで絞れる。
 * 商品の欄の定価の横の「★ お気に入りから入力」で開き、「入れる」を押すとその欄の商品になって閉じる（SaleEditor の pickFavorite）。
 * ★お気に入りは品目（シャワーチェア・浴槽台など）ごとに分けて出し、「削除」でお気に入りから外せる（ユーザーの指示「一度入力した商品は、今後お気に入りの中に、
 * 項目ごとにいれる（シャワーチェアや浴槽台等）当然削除する事もできる」2026-11-03。入れた商品は SaleEditor が自動でお気に入りに入れる）。
 * 開いた商品の欄に種目があれば、その種目のタブで開く（お気に入りにその種目の商品があるとき）
 */
export function ProductPicker({
  title = '商品を選ぶ',
  products,
  settings,
  onPick,
  onToggleFavorite,
  onClose,
  focus,
}: {
  title?: string;
  products: Product[];
  settings: Settings;
  onPick: (p: Product) => void;
  onToggleFavorite: (p: Product) => void;
  onClose: () => void;
  focus?: {category: string}; // 開いた商品の欄の種目（その種目のタブで開く）
}) {
  const favCount = products.filter((p) => p.favorite).length;
  const [view, setView] = useState<View>(favCount > 0 ? 'fav' : 'all');
  const [tab, setTab] = useState(() => (focus?.category && products.some((p) => p.favorite && categoryTab(p.category) === categoryTab(focus.category)) ? categoryTab(focus.category) : ''));
  const [sub, setSub] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, number>>({});

  const base = useMemo(() => {
    if (view === 'fav') return sortProducts(products.filter((p) => p.favorite));
    if (view === 'recent') return [...products].filter((p) => p.lastUsedAt > 0).sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, 50);
    return sortProducts(products);
  }, [products, view]);
  const tabs = useMemo(() => [...new Set(base.map((p) => categoryTab(p.category)))], [base]);
  const inTab = base.filter((p) => tab === '' || categoryTab(p.category) === tab);
  // 種目のタブの中の品目（シャワーチェア・浴槽台など）。選ぶとその品目の商品だけ（ユーザーの指示「シャワーチェアを選んだら、シャワーチェアの一覧のみ」2026-11-01）
  // 種目のタブがない（商品の種目が1つだけ）ときも、その種目の品目を出す
  const subs = tab || tabs.length === 1 ? sortSubs([...new Set(inTab.map((p) => p.sub).filter(Boolean))]) : [];
  const shown = inTab.filter((p) => (!sub || p.sub === sub) && matchesAll(`${p.name} ${p.maker} ${p.code} ${p.category} ${p.sub} ${subShort(p.sub)}`, query)).slice(0, 200);

  // ★お気に入りは品目ごと（シャワーチェア・浴槽台など）に分けて出す。ほかの見方・さがしているときは1つの一覧
  const groups: {key: string; label: string; items: Product[]}[] = (() => {
    if (view !== 'fav') return [{key: 'all', label: '', items: shown}];
    const by = new Map<string, Product[]>();
    for (const p of shown) {
      const k = p.sub || p.category || '';
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    const subsSorted = sortSubs([...by.keys()].filter(Boolean));
    const keys = [...subsSorted, ...(by.has('') ? [''] : [])];
    return keys.map((k) => ({key: k || 'none', label: k ? subShort(k) : '品目なし', items: by.get(k) ?? []}));
  })();
  const row = (p: Product) => {
    const {price} = productPrice(p, settings);
    return (
      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 sm:flex-nowrap">
        <Star on={p.favorite} onClick={() => onToggleFavorite(p)} label={`${p.name}を★に`} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-slate-800">{p.name}</div>
          <div className="truncate text-xs text-slate-500">
            {[p.category ? `${p.category}（${subShort(p.sub, p.category)}）` : '種目なし', p.maker, p.code].filter(Boolean).join('　')}
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
        {view === 'fav' && (
          // お気に入りから外す（ユーザーの指示「当然削除する事もできる」）。商品の一覧には残るので、「すべて」で ☆ を押せばまた入る（住宅改修の部材と同じ）
          <Btn small color="white" onClick={() => onToggleFavorite(p)} aria-label={`${p.name}をお気に入りから削除`}>
            削除
          </Btn>
        )}
      </li>
    );
  };
  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <Btn color="white" onClick={onClose}>
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
                  setSub('');
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
                onClick={() => {
                  setTab(t);
                  setSub('');
                }}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${tab === t ? 'border-teal-400 bg-teal-100 text-teal-900' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {t || 'すべての種目'}
              </button>
            ))}
          </div>
        )}
        {subs.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="品目">
            {['', ...subs].map((sb) => (
              <button
                key={sb || 'all'}
                type="button"
                aria-pressed={sub === sb}
                onClick={() => setSub(sb)}
                className={`rounded-md border px-2.5 py-1 text-xs ${sub === sb ? 'border-sky-500 bg-sky-100 font-bold text-sky-900' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {sb ? subShort(sb) : 'すべての品目'}
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
          <div className="space-y-3">
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label || '商品'}>
                {g.label && (
                  <h3 className="mb-1 text-sm font-bold text-teal-900">
                    {g.label}
                    <span className="ml-1 font-normal text-slate-500">{g.items.length}</span>
                  </h3>
                )}
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{g.items.map((p) => row(p))}</ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

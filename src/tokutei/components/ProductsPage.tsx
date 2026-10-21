import {useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {unitPriceOf} from '../calc.ts';
import {CATEGORIES, categoryLabel} from '../category.ts';
import {productsCsv} from '../storage.ts';
import type {AppData, Product, Settings, TaxType} from '../types.ts';
import type {Update} from '../useStore.ts';
import {downloadBlob, matchesAll, todayIso, uid, yen} from '../util.ts';
import {CategorySelect} from './CategorySelect.tsx';
import {ImportDialog} from './ImportDialog.tsx';
import {Btn, Modal, NumberInput, Star, TextInput, useToast} from './ui.tsx';

const PAGE = 200;
const TAX_TYPES: TaxType[] = ['10%', '8%', '非課税'];

/** 商品の並び：★ → よく使う順 → 種目 → 商品名 */
export function sortProducts(list: Product[]): Product[] {
  const order = new Map(CATEGORIES.map((c, i) => [c.name, i]));
  return [...list].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      b.useCount - a.useCount ||
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.name.localeCompare(b.name, 'ja'),
  );
}

/** 販売単価（定価の2割引き。定価がなければ仕切×1.25）と利益率（販売単価に対する） */
export function productPrice(p: Product, s: Settings): {price: number; rate: number | null} {
  const {price} = unitPriceOf({unitPrice: null, listPrice: p.listPrice, cost: p.cost, discountRate: s.discountRate}, s);
  return {price, rate: price > 0 && p.cost > 0 ? (price - p.cost) / price : null};
}

export function ProductsPage({data, update}: {data: AppData; update: Update}) {
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [cat, setCat] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const s = data.settings;

  const shown = useMemo(
    () =>
      sortProducts(
        data.products.filter(
          (p) =>
            (!favOnly || p.favorite) &&
            (cat === '' || (cat === '-' ? !p.category : p.category === cat)) &&
            matchesAll(`${p.name} ${p.maker} ${p.code} ${p.tais} ${p.category} ${p.sub} ${p.supplier}`, query),
        ),
      ),
    [data.products, favOnly, cat, query],
  );
  const favCount = data.products.filter((p) => p.favorite).length;
  const noCat = data.products.filter((p) => !p.category).length;

  const patch = (id: string, change: Partial<Product>) =>
    update('products', (list) => list.map((p) => (p.id === id ? {...p, ...change, updatedAt: Date.now()} : p)));

  const remove = (p: Product) => {
    if (!window.confirm(`「${p.name}」を商品マスタから消します。よろしいですか？（作った見積書の明細は消えません）`)) return;
    update('products', (list) => list.filter((x) => x.id !== p.id));
    toast('消しました');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-bold text-slate-800">商品マスタ</h2>
        <Btn color="purple" onClick={() => setImporting(true)}>
          📄 仕切り一覧表を取り込む
        </Btn>
        <Btn
          color="emerald"
          onClick={() =>
            setEditing({
              id: '',
              name: '',
              maker: '',
              code: '',
              tais: '',
              jan: '',
              category: '',
              sub: '',
              categoryByHand: false,
              listPrice: 0,
              cost: 0,
              taxType: '10%',
              unit: '台',
              supplier: '',
              favorite: false,
              useCount: 0,
              lastUsedAt: 0,
              source: '',
              updatedAt: 0,
            })
          }
        >
          ＋ 商品を手で足す
        </Btn>
        <Btn
          color="teal"
          disabled={data.products.length === 0}
          onClick={() => downloadBlob(new Blob([productsCsv(sortProducts(data.products))], {type: 'text/csv'}), `商品マスタ_${todayIso()}.csv`)}
        >
          ⬇ CSVで書き出す
        </Btn>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <TextInput value={query} onChange={setQuery} placeholder="商品名・メーカー・品番で検索" className="w-64" aria-label="商品を検索" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="種目で絞る" className="h-9 rounded-md border border-slate-300 px-2 text-sm">
          <option value="">すべての種目</option>
          {CATEGORIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value="-">種目なし（{noCat}件）</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm font-bold text-amber-700">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />★だけ（{favCount}件）
        </label>
        <span className="ml-auto text-sm text-slate-500">
          {shown.length}件 ／ 全{data.products.length}件
        </span>
      </div>

      {data.products.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          <p className="font-bold">まだ商品がありません。</p>
          <p className="mt-1 text-sm">「📄 仕切り一覧表を取り込む」から、メーカー・問屋の価格表（Excel・CSV・PDF）を読み込んでください。</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 px-1 py-2">★</th>
                <th className="w-64 px-2 py-2 text-left">種目</th>
                <th className="px-2 py-2 text-left">商品名・メーカー・品番</th>
                <th className="w-28 px-2 py-2 pr-4 text-right">定価（税抜）</th>
                <th className="w-28 px-2 py-2 pr-4 text-right">仕切（税抜）</th>
                <th className="w-28 px-2 py-2 text-right">販売単価</th>
                <th className="w-20 px-2 py-2">税</th>
                <th className="w-24 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((p) => {
                const {price, rate} = productPrice(p, s);
                const low = rate !== null && rate * 100 < s.minProfitRate;
                return (
                  <tr key={p.id} className="border-t border-slate-100 align-top">
                    <td className="px-1 py-1 text-center">
                      <Star on={p.favorite} onClick={() => patch(p.id, {favorite: !p.favorite})} label={`${p.name}を★に`} />
                    </td>
                    <td className="px-2 py-1">
                      <CategorySelect
                        category={p.category}
                        sub={p.sub}
                        onChange={(category, sub) => patch(p.id, {category, sub, categoryByHand: true})}
                        className="w-full"
                        ariaLabel={`${p.name}の種目`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <TextInput value={p.name} onChange={(name) => patch(p.id, {name})} className="w-full min-w-[16rem]" aria-label="商品名" />
                      <div className="mt-0.5 px-1 text-[11px] text-slate-500">
                        {[p.maker, p.code, p.tais && `TAIS ${p.tais}`, p.supplier && `仕入先 ${p.supplier}`].filter(Boolean).join('　') || '—'}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <NumberInput value={p.listPrice} onChange={(listPrice) => patch(p.id, {listPrice})} min={0} blankZero className="w-24" ariaLabel="定価" />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <NumberInput value={p.cost} onChange={(cost) => patch(p.id, {cost})} min={0} blankZero className="w-24" ariaLabel="仕切" />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {price > 0 ? yen(price) : '—'}
                      {rate !== null && <div className={`text-[11px] ${low ? 'font-bold text-rose-600' : 'text-slate-500'}`}>利益率 {Math.round(rate * 100)}%</div>}
                      {p.cost <= 0 && <div className="text-[11px] text-amber-700">仕切なし</div>}
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={p.taxType}
                        onChange={(e) => patch(p.id, {taxType: e.target.value as TaxType})}
                        aria-label="税区分"
                        className="h-9 rounded-md border border-slate-300 px-1 text-sm"
                      >
                        {TAX_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t === '10%' ? '課税' : t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      <Btn small color="white" onClick={() => setEditing(p)}>
                        詳しく
                      </Btn>
                      <button type="button" onClick={() => remove(p)} className="ml-1 rounded px-1.5 py-1 text-rose-500 hover:bg-rose-50" aria-label={`${p.name}を消す`} title="消す">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length > limit && (
            <div className="border-t border-slate-100 p-2 text-center">
              <Btn small color="white" onClick={() => setLimit((n) => n + PAGE)}>
                もっと表示する（あと{shown.length - limit}件）
              </Btn>
            </div>
          )}
        </div>
      )}

      {importing && <ImportDialog products={data.products} settings={s} onDone={(list) => update('products', () => list)} onClose={() => setImporting(false)} />}
      {editing && (
        <ProductEditModal
          product={editing}
          settings={s}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            update('products', (list) => (p.id && list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, {...p, id: uid('p')}]));
            toast('保存しました');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Field({label, children}: {label: string; children: ReactNode}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-bold text-slate-600">
      {label}
      {children}
    </label>
  );
}

/** 商品の全部の項目を直す（手で足すときも） */
export function ProductEditModal({product, settings, onSave, onClose}: {product: Product; settings: Settings; onSave: (p: Product) => void; onClose: () => void}) {
  const [p, setP] = useState(product);
  const set = (change: Partial<Product>) => setP((x) => ({...x, ...change}));
  const {price, rate} = productPrice(p, settings);
  return (
    <Modal
      title={product.id ? '商品を直す' : '商品を手で足す'}
      onClose={onClose}
      footer={
        <>
          <Btn color="white" onClick={onClose}>
            やめる
          </Btn>
          <Btn color="blue" disabled={!p.name.trim()} onClick={() => onSave({...p, name: p.name.trim(), updatedAt: Date.now()})}>
            保存する
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="商品名">
            <TextInput value={p.name} onChange={(name) => set({name})} className="w-full" />
          </Field>
        </div>
        <Field label="メーカー名（製造事業者名）">
          <TextInput value={p.maker} onChange={(maker) => set({maker})} />
        </Field>
        <Field label="品番・型番">
          <TextInput value={p.code} onChange={(code) => set({code})} />
        </Field>
        <Field label="TAISコード">
          <TextInput value={p.tais} onChange={(tais) => set({tais})} placeholder="00000-000000" />
        </Field>
        <Field label="JANコード">
          <TextInput value={p.jan} onChange={(jan) => set({jan})} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="種目">
            <CategorySelect category={p.category} sub={p.sub} onChange={(category, sub) => set({category, sub, categoryByHand: true})} />
          </Field>
          {p.category && <p className="mt-1 text-xs text-slate-500">申請書・見積書には「{categoryLabel(p.category, p.sub)}」と書きます。</p>}
        </div>
        <Field label="定価（税抜）">
          <NumberInput value={p.listPrice} onChange={(listPrice) => set({listPrice})} min={0} blankZero />
        </Field>
        <Field label="仕切（税抜）">
          <NumberInput value={p.cost} onChange={(cost) => set({cost})} min={0} blankZero />
        </Field>
        <Field label="税区分">
          <select value={p.taxType} onChange={(e) => set({taxType: e.target.value as TaxType})} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
            {TAX_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === '10%' ? '課税（10%）' : t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="単位">
          <TextInput value={p.unit} onChange={(unit) => set({unit})} placeholder="台" />
        </Field>
        <Field label="仕入先（発注先）">
          <select value={p.supplier} onChange={(e) => set({supplier: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
            <option value="">（なし）</option>
            {[...new Set([...settings.suppliers, p.supplier].filter(Boolean))].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold text-amber-700">
          <input type="checkbox" checked={p.favorite} onChange={(e) => set({favorite: e.target.checked})} />★お気に入り
        </label>
        <p className="text-sm text-slate-600 sm:col-span-2">
          販売単価 <b className="tabular-nums">{price > 0 ? `${yen(price)}円` : '—'}</b>
          {p.listPrice > 0 ? `（定価×${(100 - settings.discountRate) / 100}）` : p.cost > 0 ? `（定価がないので 仕切×${(100 + settings.markupRate) / 100}）` : ''}
          {rate !== null && `　利益率 ${Math.round(rate * 100)}%`}
        </p>
        {p.source && <p className="text-xs text-slate-400 sm:col-span-2">取り込んだ表：{p.source}</p>}
      </div>
    </Modal>
  );
}

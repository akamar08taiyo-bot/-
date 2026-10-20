import {useMemo, useState} from 'react';
import {guessPieceLengthM} from '../priceImport.ts';
import type {AppData, Material} from '../types.ts';
import type {Update} from '../useStore.ts';
import {matchesAll, uid} from '../util.ts';
import {ImportDialog} from './ImportDialog.tsx';
import {Btn, NumberInput, Star, TextInput, useToast} from './ui.tsx';

const SHOW_LIMIT = 300;

export function MaterialsPage({data, update}: {data: AppData; update: Update}) {
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [maker, setMaker] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [noPriceOnly, setNoPriceOnly] = useState(false);
  const [draft, setDraft] = useState({name: '', code: '', maker: '', price: 0, listPrice: 0, pieceLengthM: 0});
  const [limit, setLimit] = useState(SHOW_LIMIT);

  const makers = useMemo(
    () => [...new Set(data.materials.map((m) => m.maker).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')),
    [data.materials],
  );
  const list = useMemo(
    () =>
      data.materials.filter(
        (m) =>
          (!favOnly || m.favorite) &&
          (!noPriceOnly || !(m.price > 0)) &&
          (!maker || m.maker === maker) &&
          matchesAll(`${m.name} ${m.code} ${m.maker}`, query),
      ),
    [data.materials, favOnly, noPriceOnly, maker, query],
  );
  const favCount = data.materials.filter((m) => m.favorite).length;
  const noPriceCount = data.materials.filter((m) => !(m.price > 0)).length;

  const setMat = (id: string, patch: Partial<Material>) =>
    update('materials', (all) => all.map((m) => (m.id === id ? {...m, ...patch, updatedAt: Date.now()} : m)));
  const setMany = (ids: Set<string>, patch: Partial<Material>) =>
    update('materials', (all) => all.map((m) => (ids.has(m.id) ? {...m, ...patch} : m)));

  const addDraft = () => {
    if (!draft.name.trim()) return;
    const m: Material = {
      id: uid('m'),
      name: draft.name.trim(),
      code: draft.code.trim(),
      maker: draft.maker.trim(),
      price: draft.price,
      listPrice: draft.listPrice,
      pieceLengthM: draft.pieceLengthM || guessPieceLengthM(draft.name),
      unit: '',
      favorite: true,
      updatedAt: Date.now(),
    };
    update('materials', (all) => [m, ...all]);
    setDraft({name: '', code: '', maker: draft.maker, price: 0, listPrice: 0, pieceLengthM: 0});
    toast(`「${m.name}」をお気に入り（★）で追加しました`);
  };

  const removeShown = () => {
    if (list.length === 0) return;
    const what = query || maker || favOnly || noPriceOnly ? `表示中の${list.length}件` : `部材リストの全${list.length}件`;
    if (!confirm(`${what}を部材リストから削除します。すでに作った様邸の金額は変わりません。よろしいですか？`)) return;
    const ids = new Set(list.map((m) => m.id));
    update('materials', (all) => all.filter((m) => !ids.has(m.id)));
    toast(`${ids.size}件を削除しました`);
  };
  // メーカーの仕切り表を入れ直すとき：仕切価格が空欄のものだけ、または全部を消す（取付手間の単価・一式は消さない）
  const removeNoPrice = () => {
    if (!confirm(`仕切価格が空欄の${noPriceCount}件を部材リストから削除します。すでに作った見積書・様邸の金額は変わりません。よろしいですか？`)) return;
    update('materials', (all) => all.filter((m) => m.price > 0));
    toast(`仕切価格が空欄の${noPriceCount}件を削除しました`);
  };
  const removeAll = () => {
    if (!confirm(`部材リストの全${data.materials.length}件（★お気に入りも）を削除して、0件にします。工賃（取付手間の単価）・一式・すでに作った見積書と様邸は消えません。よろしいですか？`)) return;
    update('materials', () => []);
    toast('部材リストを空にしました（0件）。メーカーの仕切り表を取り込んでください。');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-[#0c315e]">部材リスト（メーカーの仕切り）</h1>
        <span className="text-sm text-slate-500">
          全{data.materials.length}件・★お気に入り {favCount}件{noPriceCount > 0 && `・仕切価格が空欄 ${noPriceCount}件`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {noPriceCount > 0 && (
            <Btn color="white" className="!text-rose-700" onClick={removeNoPrice}>
              仕切価格が空欄の{noPriceCount}件を消す
            </Btn>
          )}
          {data.materials.length > 0 && (
            <Btn color="rose" onClick={removeAll}>
              🗑 部材リストを空にする
            </Btn>
          )}
          <Btn color="purple" onClick={() => setImporting(true)}>
            📥 メーカーの仕切り表を取り込む
          </Btn>
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        ★（お気に入り）を付けた部材は、部材を選ぶ画面や見積書の品名の候補で最初に出ます。仕切価格は仕切り計算表・請求書に、定価は見積書の単価（定価×{data.settings.estimateRate}）に使います。
        この部材リストは、見積書（見積もりを作成する）と請求書（請求書を確認する）の両方で使います。
        「1本の長さ」は手すりなど切って使う部材の長さで、見積で使う長さを入れると 数量＝使う長さ÷1本の長さ（例：60cm÷4m＝0.15本）になります（商品名の「4m」「2000mm」などから自動で入ります）。
        仕切価格・定価を変えても、すでに作った様邸・見積書の金額は変わりません（選んだときの単価で計算します）。
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 text-xs font-bold text-slate-600">手入力で1件追加（お気に入り★で入ります）</div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addDraft();
          }}
        >
          <TextInput value={draft.name} onChange={(name) => setDraft({...draft, name})} placeholder="商品名" className="min-w-[16rem] flex-1" />
          <TextInput value={draft.code} onChange={(code) => setDraft({...draft, code})} placeholder="品番" className="w-32" />
          <TextInput value={draft.maker} onChange={(m) => setDraft({...draft, maker: m})} placeholder="メーカー" className="w-36" list="maker-list" />
          <datalist id="maker-list">
            {makers.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            定価
            <NumberInput value={draft.listPrice} onChange={(listPrice) => setDraft({...draft, listPrice})} className="w-28" ariaLabel="定価" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            仕切価格
            <NumberInput value={draft.price} onChange={(price) => setDraft({...draft, price})} className="w-28" ariaLabel="仕切価格" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            1本の長さ
            <NumberInput
              value={draft.pieceLengthM}
              onChange={(pieceLengthM) => setDraft({...draft, pieceLengthM})}
              className="w-16"
              ariaLabel="1本の長さ（m）"
              blankZero
              min={0}
              placeholder={guessPieceLengthM(draft.name) ? String(guessPieceLengthM(draft.name)) : '—'}
            />
            m
          </label>
          <Btn small color="emerald" type="submit" disabled={!draft.name.trim()}>
            ＋ 追加
          </Btn>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TextInput value={query} onChange={setQuery} placeholder="商品名・品番・メーカーで検索" className="w-72" />
        <select value={maker} onChange={(e) => setMaker(e.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
          <option value="">メーカー：すべて</option>
          {makers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
          ★お気に入りだけ表示
        </label>
        {noPriceCount > 0 && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={noPriceOnly} onChange={(e) => setNoPriceOnly(e.target.checked)} />
            仕切価格が空欄のものだけ
          </label>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn small color="amber" disabled={list.length === 0} onClick={() => setMany(new Set(list.map((m) => m.id)), {favorite: true})}>
            表示中を★に
          </Btn>
          <Btn small color="white" disabled={list.length === 0} onClick={() => setMany(new Set(list.map((m) => m.id)), {favorite: false})}>
            表示中の★を外す
          </Btn>
          <Btn small color="rose" disabled={list.length === 0} onClick={removeShown}>
            表示中を削除
          </Btn>
        </div>
      </div>

      {data.materials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-purple-300 bg-white p-6 text-sm leading-7 text-slate-600">
          <p className="font-bold text-slate-800">部材リストはまだ空です。</p>
          <p>
            「📥 メーカーの仕切り表を取り込む」から、メーカーの仕切り表（Excel・CSV・PDF）を読み込みます。商品が多い表でも、よく使うものだけチェックして取り込んだり、お気に入り（★）を付けたりできます。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-slate-100 text-xs text-slate-600">
              <tr>
                <th className="w-10 px-1 py-2">★</th>
                <th className="px-2 py-2 text-left">メーカー</th>
                <th className="px-2 py-2 text-left">品番</th>
                <th className="px-2 py-2 text-left">商品名</th>
                <th className="w-20 px-2 py-2 text-left">単位</th>
                <th className="w-32 px-2 py-2 pr-4 text-right">定価</th>
                <th className="w-32 px-2 py-2 pr-4 text-right">仕切価格</th>
                <th className="w-28 px-2 py-2 pr-4 text-right">1本の長さ(m)</th>
                <th className="w-24 px-2 py-2 text-left">更新日</th>
                <th className="w-10 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-1 text-center">
                    <Star on={m.favorite} onClick={() => setMany(new Set([m.id]), {favorite: !m.favorite})} label={`${m.name}をお気に入りに`} />
                  </td>
                  <td className="px-2 py-1">
                    <TextInput value={m.maker} onChange={(v) => setMat(m.id, {maker: v})} className="w-32" list="maker-list" />
                  </td>
                  <td className="px-2 py-1">
                    <TextInput value={m.code} onChange={(v) => setMat(m.id, {code: v})} className="w-32" />
                  </td>
                  <td className="px-2 py-1">
                    <TextInput value={m.name} onChange={(v) => setMat(m.id, {name: v})} className="w-full min-w-[16rem]" />
                  </td>
                  <td className="px-2 py-1">
                    <TextInput value={m.unit} onChange={(v) => setMat(m.id, {unit: v})} className="w-16" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <NumberInput value={m.listPrice} onChange={(listPrice) => setMat(m.id, {listPrice})} className="w-28" ariaLabel="定価" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <NumberInput value={m.price} onChange={(price) => setMat(m.id, {price})} className="w-28" ariaLabel="仕切価格" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <NumberInput
                      value={m.pieceLengthM}
                      onChange={(pieceLengthM) => setMat(m.id, {pieceLengthM: Math.max(0, pieceLengthM)})}
                      className="w-20"
                      ariaLabel="1本の長さ（m）"
                      blankZero
                      min={0}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-2 py-1 text-xs text-slate-500">{new Date(m.updatedAt).toLocaleDateString('ja-JP')}</td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      className="rounded px-1.5 text-rose-600 hover:bg-rose-50"
                      title="削除"
                      aria-label={`${m.name}を削除`}
                      onClick={() => update('materials', (all) => all.filter((x) => x.id !== m.id))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > limit && (
            <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              {list.length}件のうち{limit}件を表示しています。
              <Btn small color="white" onClick={() => setLimit(limit + SHOW_LIMIT)}>
                さらに表示
              </Btn>
            </div>
          )}
          {list.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">条件に合う部材がありません。</p>}
          <p className="border-t border-slate-100 px-3 py-2 text-right text-xs text-slate-500">
            表示中 {list.length}件・定価・仕切価格は税抜の金額です
          </p>
        </div>
      )}

      {importing && <ImportDialog materials={data.materials} onDone={(next) => update('materials', () => next)} onClose={() => setImporting(false)} />}
    </div>
  );
}

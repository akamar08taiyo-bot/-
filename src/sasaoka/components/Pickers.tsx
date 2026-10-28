import {useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {estimateUnitPrice, rounddown} from '../calc.ts';
import type {EstimateRates} from '../calc.ts';
import {guessPieceLengthM} from '../priceImport.ts';
import {laborCount, manualRow, materialRow, setLaborCount} from '../rows.ts';
import type {AppMode, LaborItem, Material, Place, Row} from '../types.ts';
import {matchesAll, num, uid, yen} from '../util.ts';
import {Btn, Modal, NumberInput, Star, Stepper, TextInput} from './ui.tsx';

const SHOW_LIMIT = 200;

/**
 * 部材を選ぶ画面。★お気に入り／すべて を切り替えて検索し、「追加」を押すと箇所に1行入る（続けて選べる）。
 * 見積書作成アプリで開いたときは、定価×掛率（見積の単価）も並べる。
 */
export function MaterialPicker({
  place,
  materials,
  mode,
  rates,
  onAdd,
  onRemoveOne,
  onToggleFavorite,
  onAddToMaster,
  onClose,
}: {
  place: Place;
  materials: Material[];
  mode: AppMode;
  rates: EstimateRates; // 見積の単価（定価×率）を出すとき
  onAdd: (row: Row) => void;
  onRemoveOne: (refId: string) => void; // − で1つ減らす（0 で行を消す）
  onToggleFavorite: (id: string) => void;
  onAddToMaster: (m: Material) => void;
  onClose: () => void;
}) {
  const favCount = materials.filter((m) => m.favorite).length;
  const [tab, setTab] = useState<'fav' | 'all'>(favCount > 0 ? 'fav' : 'all');
  const [query, setQuery] = useState('');
  const [maker, setMaker] = useState('');
  const [manual, setManual] = useState({name: '', price: 0, listPrice: 0, qty: 1, save: true});
  const estimate = mode === 'estimate';
  const makers = useMemo(() => [...new Set(materials.map((m) => m.maker).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')), [materials]);

  const list = useMemo(() => {
    const base = materials.filter((m) => (tab === 'fav' ? m.favorite : true) && (!maker || m.maker === maker));
    return base.filter((m) => matchesAll(`${m.name} ${m.code} ${m.maker}`, query));
  }, [materials, tab, maker, query]);

  const addedCount = (id: string) => place.rows.filter((r) => r.refId === id).reduce((n, r) => n + r.qty, 0);

  // 商品名は空でもよい（金額だけの行）。名前があるときだけ部材リストにも登録できる
  const canAddManual = manual.name.trim() !== '' || manual.price > 0 || manual.listPrice > 0;
  const addManual = () => {
    if (!canAddManual) return;
    const name = manual.name.trim();
    const save = manual.save && name !== '';
    const m: Material = {
      id: uid('m'),
      name,
      price: manual.price,
      listPrice: manual.listPrice,
      pieceLengthM: guessPieceLengthM(name),
      maker: '',
      code: '',
      unit: '',
      favorite: true,
      updatedAt: Date.now(),
    };
    if (save) onAddToMaster(m);
    onAdd({...materialRow(m, manual.qty), refId: save ? m.id : null});
    setManual({name: '', price: 0, listPrice: 0, qty: 1, save: manual.save});
  };

  return (
    <Modal
      wide
      title={
        <>
          「{place.name || '箇所'}」に部材を追加
          <span className="ml-2 text-xs font-normal text-slate-500">「追加」を押すと入ります。入れたあとは ＋／− で数量を変えられます（続けて選べます）</span>
        </>
      }
      onClose={onClose}
      footer={
        <Btn color="white" onClick={onClose}>
          選び終わったら閉じる
        </Btn>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 p-0.5">
          {(
            [
              ['fav', `★ お気に入り（${favCount}）`],
              ['all', `すべて（${materials.length}）`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${tab === id ? 'bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-300' : 'text-slate-600 hover:bg-violet-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <TextInput autoFocus value={query} onChange={setQuery} placeholder="商品名・品番で検索（空白で区切ると両方を含むもの）" className="min-w-[16rem] flex-1" />
        {makers.length > 1 && (
          <select value={maker} onChange={(e) => setMaker(e.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
            <option value="">メーカー：すべて</option>
            {makers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {materials.length === 0 ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          部材リストがまだありません。上のタブの「部材リスト（メーカー仕切り）」でメーカーの仕切り表を取り込むか、下の「手入力で追加」を使ってください（金額だけでも入れられます）。
        </p>
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {tab === 'fav' && !query ? 'お気に入り（★）の部材がありません。「すべて」から探して★を付けると、次からここに出ます。' : '見つかりませんでした。'}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 px-1 py-1.5" />
                <th className="px-2 py-1.5 text-left">商品名</th>
                <th className="px-2 py-1.5 text-left">品番</th>
                <th className="px-2 py-1.5 text-left">メーカー</th>
                <th className="px-2 py-1.5 text-right">定価</th>
                <th className="px-2 py-1.5 text-right">仕切価格</th>
                {estimate && <th className="px-2 py-1.5 text-right text-indigo-700">見積の単価（定価×{rates.estimateRate}）</th>}
                <th className={`${tab === 'fav' ? 'w-44' : 'w-32'} px-2 py-1.5`} />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, SHOW_LIMIT).map((m) => {
                const n = addedCount(m.id);
                return (
                  <tr key={m.id} className="border-t border-slate-100 hover:bg-purple-50/50">
                    <td className="px-1 text-center">
                      <Star on={m.favorite} onClick={() => onToggleFavorite(m.id)} label={`${m.name}をお気に入りに`} />
                    </td>
                    <td className="px-2 py-1.5 font-bold text-slate-800">{m.name}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{m.code}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{m.maker}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.listPrice > 0 ? yen(m.listPrice) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {/* 仕切価格が空欄でも、定価からは計算しない（仕切りの率はメーカーごとに違う） */}
                      {m.price > 0 ? yen(m.price) : <span className="text-xs font-bold text-amber-700">空欄</span>}
                    </td>
                    {estimate && (
                      <td className="px-2 py-1.5 text-right font-bold tabular-nums text-indigo-800">
                        {m.listPrice > 0 || m.price > 0 ? yen(estimateUnitPrice(materialRow(m), rates)) : <span className="text-xs font-normal text-amber-700">定価なし</span>}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      {n > 0 ? (
                        // 入れた部材は ＋／− で数量を変える（0 にすると行を消す）
                        <span className="inline-flex items-center gap-1">
                          <Btn small color="white" className="!px-3 !text-sm" onClick={() => onRemoveOne(m.id)} aria-label={`${m.name}を1つ減らす`}>
                            −
                          </Btn>
                          <span className="min-w-[2.5rem] text-center text-base font-bold tabular-nums text-emerald-800" aria-label={`${m.name}の数量`}>
                            {num(n)}
                          </span>
                          <Btn small color="emerald" className="!px-3 !text-sm" onClick={() => onAdd(materialRow(m))} aria-label={`${m.name}を1つ増やす`}>
                            ＋
                          </Btn>
                        </span>
                      ) : (
                        <Btn small color="emerald" onClick={() => onAdd(materialRow(m))}>
                          ＋ 追加
                        </Btn>
                      )}
                      {tab === 'fav' && (
                        // お気に入りから外す（ユーザーの指示）。部材リストには残るので、「すべて」で★を押せばまた入る
                        <Btn small color="white" className="ml-1.5" onClick={() => onToggleFavorite(m.id)} aria-label={`${m.name}をお気に入りから削除`}>
                          削除
                        </Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length > SHOW_LIMIT && (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              {list.length}件のうち最初の{SHOW_LIMIT}件を表示しています。検索で絞り込んでください。
            </p>
          )}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-bold text-slate-600">リストにない部材を手入力で追加（商品名は空でも、金額だけでも入れられます）</div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput value={manual.name} onChange={(name) => setManual({...manual, name})} placeholder="商品名（なくてもよい）" className="min-w-[14rem] flex-1" />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            定価
            <NumberInput value={manual.listPrice} onChange={(listPrice) => setManual({...manual, listPrice})} className="w-28" ariaLabel="手入力の定価" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            仕切価格
            <NumberInput value={manual.price} onChange={(price) => setManual({...manual, price})} className="w-28" ariaLabel="手入力の仕切価格" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            数量
            <NumberInput value={manual.qty} onChange={(qty) => setManual({...manual, qty})} className="w-16" min={0} ariaLabel="手入力の数量" />
          </label>
          <label className={`flex items-center gap-1 text-xs ${manual.name.trim() ? 'text-slate-600' : 'text-slate-400'}`}>
            <input
              type="checkbox"
              checked={manual.save && manual.name.trim() !== ''}
              disabled={!manual.name.trim()}
              onChange={(e) => setManual({...manual, save: e.target.checked})}
            />
            部材リストにもお気に入り（★）で登録
          </label>
          <Btn small color="emerald" disabled={!canAddManual} onClick={addManual}>
            ＋ 追加
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 取付手間を数える画面。木 −／＋ のように箇所数を数えると、行が増減する。
 * rows は数える範囲（箇所の行すべて、または部材のすぐ下の手間の行＝見積の「同上施工費」）。
 */
export function LaborCounter({
  title,
  rows,
  labor,
  laborRate,
  onChange,
  onClose,
}: {
  title: ReactNode;
  rows: Row[];
  labor: LaborItem[];
  laborRate: number; // 見積の単価を入れていない手間の、見積の単価＝仕切り×この率
  onChange: (rows: Row[]) => void;
  onClose: () => void;
}) {
  const [manual, setManual] = useState({name: '', price: 0, qty: 1});
  // 工事内容の名前は空でもよい（金額だけ）
  const canAddManual = manual.name.trim() !== '' || manual.price > 0;
  const addManual = () => {
    if (!canAddManual) return;
    onChange([...rows, manualRow('labor', {name: manual.name.trim(), price: manual.price, qty: manual.qty})]);
    setManual({name: '', price: 0, qty: 1});
  };

  return (
    <Modal
      wide
      title={
        <>
          {title}
          <span className="ml-2 text-xs font-normal text-slate-500">箇所数を ＋／− で数えます（例：木 2箇所＝2,000円）</span>
        </>
      }
      onClose={onClose}
      footer={
        <Btn color="white" onClick={onClose}>
          数え終わったら閉じる
        </Btn>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {labor.map((item) => {
          const n = laborCount(rows, item.id);
          const est = item.estPrice ?? rounddown(item.price * laborRate); // 見積の単価
          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${n > 0 ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-800">{item.name}</div>
                <div className="text-xs tabular-nums text-slate-500">
                  1箇所 仕切り {yen(item.price)}円・見積 {yen(est)}円
                  {n > 0 && (
                    <span className="ml-2 font-bold text-sky-800">
                      ＝ {yen(item.price * n)}円・見積 {yen(rounddown(est * n))}円
                    </span>
                  )}
                </div>
              </div>
              <Stepper value={n} onChange={(v) => onChange(setLaborCount(rows, item, v))} ariaLabel={`${item.name}の箇所数`} />
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-bold text-slate-600">単価表にない工事を手入力で追加（工事内容は空でも、金額だけでも入れられます）</div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput value={manual.name} onChange={(name) => setManual({...manual, name})} placeholder="工事内容（なくてもよい）" className="min-w-[14rem] flex-1" />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            単価
            <NumberInput value={manual.price} onChange={(price) => setManual({...manual, price})} className="w-28" ariaLabel="手入力の手間の単価" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            箇所数
            <NumberInput value={manual.qty} onChange={(qty) => setManual({...manual, qty})} className="w-16" min={0} ariaLabel="手入力の手間の箇所数" />
          </label>
          <Btn small color="emerald" disabled={!canAddManual} onClick={addManual}>
            ＋ 追加
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

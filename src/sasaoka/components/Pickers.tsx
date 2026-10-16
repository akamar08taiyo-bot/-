import {useMemo, useState} from 'react';
import type {LaborItem, Material, Place, Row} from '../types.ts';
import {matchesAll, uid, yen} from '../util.ts';
import {Btn, Modal, NumberInput, Star, Stepper, TextInput} from './ui.tsx';

const SHOW_LIMIT = 200;

export function materialRow(m: Material, qty = 1): Row {
  return {id: uid('r'), kind: 'material', refId: m.id, name: m.name, code: m.code, maker: m.maker, price: m.price, qty};
}

/** 部材を選ぶ画面。★よく使う／すべて を切り替えて検索し、「追加」を押すと箇所に1行入る（続けて選べる） */
export function MaterialPicker({
  place,
  materials,
  onAdd,
  onToggleFavorite,
  onAddToMaster,
  onClose,
}: {
  place: Place;
  materials: Material[];
  onAdd: (row: Row) => void;
  onToggleFavorite: (id: string) => void;
  onAddToMaster: (m: Material) => void;
  onClose: () => void;
}) {
  const favCount = materials.filter((m) => m.favorite).length;
  const [tab, setTab] = useState<'fav' | 'all'>(favCount > 0 ? 'fav' : 'all');
  const [query, setQuery] = useState('');
  const [maker, setMaker] = useState('');
  const [manual, setManual] = useState({name: '', price: 0, qty: 1, save: true});
  const makers = useMemo(() => [...new Set(materials.map((m) => m.maker).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')), [materials]);

  const list = useMemo(() => {
    const base = materials.filter((m) => (tab === 'fav' ? m.favorite : true) && (!maker || m.maker === maker));
    return base.filter((m) => matchesAll(`${m.name} ${m.code} ${m.maker}`, query));
  }, [materials, tab, maker, query]);

  const addedCount = (id: string) => place.rows.filter((r) => r.refId === id).reduce((n, r) => n + r.qty, 0);

  const addManual = () => {
    if (!manual.name.trim()) return;
    const m: Material = {
      id: uid('m'),
      name: manual.name.trim(),
      price: manual.price,
      maker: '',
      code: '',
      unit: '',
      favorite: true,
      updatedAt: Date.now(),
    };
    if (manual.save) onAddToMaster(m);
    onAdd({...materialRow(m, manual.qty), refId: manual.save ? m.id : null});
    setManual({name: '', price: 0, qty: 1, save: manual.save});
  };

  return (
    <Modal
      wide
      title={
        <>
          「{place.name || '箇所'}」に部材を追加
          <span className="ml-2 text-xs font-normal text-slate-500">「追加」を押すと1行入ります（続けて選べます）</span>
        </>
      }
      onClose={onClose}
      footer={
        <Btn color="blue" onClick={onClose}>
          選び終わったら閉じる
        </Btn>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 p-0.5">
          {(
            [
              ['fav', `★ よく使う（${favCount}）`],
              ['all', `すべて（${materials.length}）`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${tab === id ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-purple-50'}`}
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
          部材リストがまだありません。上のタブの「部材リスト（メーカー仕切り）」でメーカーの仕切り表を取り込むか、下の「手入力で追加」を使ってください。
        </p>
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {tab === 'fav' && !query ? '★の付いた部材がありません。「すべて」から探して★を付けると、次からここに出ます。' : '見つかりませんでした。'}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 px-1 py-1.5" />
                <th className="px-2 py-1.5 text-left">商品名</th>
                <th className="px-2 py-1.5 text-left">品番</th>
                <th className="px-2 py-1.5 text-left">メーカー</th>
                <th className="px-2 py-1.5 text-right">仕切価格</th>
                <th className="w-32 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, SHOW_LIMIT).map((m) => {
                const n = addedCount(m.id);
                return (
                  <tr key={m.id} className="border-t border-slate-100 hover:bg-purple-50/50">
                    <td className="px-1 text-center">
                      <Star on={m.favorite} onClick={() => onToggleFavorite(m.id)} label={`${m.name}をよく使うに`} />
                    </td>
                    <td className="px-2 py-1.5 font-bold text-slate-800">{m.name}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{m.code}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{m.maker}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{yen(m.price)}</td>
                    <td className="px-2 py-1 text-right">
                      <Btn small color="emerald" onClick={() => onAdd(materialRow(m))}>
                        ＋ 追加
                      </Btn>
                      {n > 0 && <span className="ml-1.5 text-xs font-bold text-emerald-700">×{n}</span>}
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
        <div className="mb-2 text-xs font-bold text-slate-600">リストにない部材を手入力で追加</div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput value={manual.name} onChange={(name) => setManual({...manual, name})} placeholder="商品名" className="min-w-[14rem] flex-1" />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            単価
            <NumberInput value={manual.price} onChange={(price) => setManual({...manual, price})} className="w-28" ariaLabel="手入力の単価" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            数量
            <NumberInput value={manual.qty} onChange={(qty) => setManual({...manual, qty})} className="w-16" min={0} ariaLabel="手入力の数量" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={manual.save} onChange={(e) => setManual({...manual, save: e.target.checked})} />
            部材リストにも★で登録
          </label>
          <Btn small color="emerald" disabled={!manual.name.trim()} onClick={addManual}>
            ＋ 追加
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/** 取付手間を数える画面。木 −／＋ のように箇所数を数えると、その箇所の行が増減する */
export function LaborCounter({
  place,
  labor,
  onChange,
  onClose,
}: {
  place: Place;
  labor: LaborItem[];
  onChange: (rows: Row[]) => void;
  onClose: () => void;
}) {
  const [manual, setManual] = useState({name: '', price: 0});
  const count = (id: string) => place.rows.filter((r) => r.kind === 'labor' && r.refId === id).reduce((n, r) => n + r.qty, 0);

  const setCount = (item: LaborItem, n: number) => {
    const rows = place.rows;
    const idx = rows.findIndex((r) => r.kind === 'labor' && r.refId === item.id);
    if (n <= 0) {
      onChange(rows.filter((r) => !(r.kind === 'labor' && r.refId === item.id)));
    } else if (idx < 0) {
      onChange([...rows, {id: uid('r'), kind: 'labor', refId: item.id, name: item.name, code: '', maker: '', price: item.price, qty: n}]);
    } else {
      // 同じ手間が複数行あるときは1行にまとめる
      const others = rows.filter((r, i) => i === idx || !(r.kind === 'labor' && r.refId === item.id));
      onChange(others.map((r) => (r.id === rows[idx].id ? {...r, qty: n} : r)));
    }
  };

  const addManual = () => {
    if (!manual.name.trim()) return;
    onChange([...place.rows, {id: uid('r'), kind: 'labor', refId: null, name: manual.name.trim(), code: '', maker: '', price: manual.price, qty: 1}]);
    setManual({name: '', price: 0});
  };

  return (
    <Modal
      wide
      title={
        <>
          「{place.name || '箇所'}」の取付手間
          <span className="ml-2 text-xs font-normal text-slate-500">箇所数を ＋／− で数えます（例：木 2箇所＝2,000円）</span>
        </>
      }
      onClose={onClose}
      footer={
        <Btn color="blue" onClick={onClose}>
          数え終わったら閉じる
        </Btn>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {labor.map((item) => {
          const n = count(item.id);
          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${n > 0 ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-800">{item.name}</div>
                <div className="text-xs tabular-nums text-slate-500">
                  1箇所 {yen(item.price)}円{n > 0 && <span className="ml-2 font-bold text-sky-800">＝ {yen(item.price * n)}円</span>}
                </div>
              </div>
              <Stepper value={n} onChange={(v) => setCount(item, v)} ariaLabel={`${item.name}の箇所数`} />
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-bold text-slate-600">単価表にない手間を手入力で追加</div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput value={manual.name} onChange={(name) => setManual({...manual, name})} placeholder="項目名" className="min-w-[14rem] flex-1" />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            単価
            <NumberInput value={manual.price} onChange={(price) => setManual({...manual, price})} className="w-28" ariaLabel="手入力の手間の単価" />
          </label>
          <Btn small color="emerald" disabled={!manual.name.trim()} onClick={addManual}>
            ＋ 追加
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

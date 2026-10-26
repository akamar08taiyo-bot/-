// 部材・施工費マスタの「部材＋施工費（常用）」：よく使う部材と施工費（工務店の取付手間）の組み合わせ（セット）を登録・直す。
// 見積書・請求書の「＋ 部材＋施工費（常用）から入れる」で、まとめて1回で入れられる（入れるときは部材リスト・施工費の今の単価）。
// 部材は「📋 部材リストから入れる」で選び、部材の行の「🔧 施工費」で数えた手間はその部材のすぐ下に入り、見積書ではその部材の「同上施工費」になる。

import {useLayoutEffect, useRef, useState} from 'react';
import {estimateAmount, estimatePlaceLines, estimateUnitPrice, placeTotals, rowAmount, shikiriPrice} from '../calc.ts';
import {addMaterial, copyRows, kitRows, removeOneMaterial} from '../rows.ts';
import type {AppData, Kit, Material, Place, Row} from '../types.ts';
import type {Update} from '../useStore.ts';
import {uid, yen} from '../util.ts';
import {LaborPickerFor} from './JobTools.tsx';
import {MaterialPicker} from './Pickers.tsx';
import {Btn, KindBadge, Stepper, TextInput, useToast} from './ui.tsx';

type Picker = {kitId: string; kind: 'material'} | {kitId: string; kind: 'labor'; rowId: string | null};

/** 部材を選ぶ画面・施工費を数える画面は箇所に向けて作ってあるので、セットを箇所に見立てて渡す */
const asPlace = (kit: Kit): Place => ({id: kit.id, name: kit.name.trim() || 'セット', rows: kit.rows, kind: 1, photo: 0});

export function KitsPage({data, update}: {data: AppData; update: Update}) {
  const toast = useToast();
  const s = data.settings;
  const [picker, setPicker] = useState<Picker | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth < 720);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setKit = (id: string, fn: (k: Kit) => Kit) => update('kits', (list) => list.map((k) => (k.id === id ? {...fn(k), updatedAt: Date.now()} : k)));
  const setRows = (id: string, fn: (rows: Row[]) => Row[]) => setKit(id, (k) => ({...k, rows: fn(k.rows)}));
  const add = () => {
    const k: Kit = {id: uid('k'), name: '', rows: [], updatedAt: Date.now()};
    update('kits', (list) => [k, ...list]);
    setFocusId(k.id);
  };
  const duplicate = (kit: Kit) => {
    const c: Kit = {...kit, id: uid('k'), name: `${kit.name}（コピー）`, rows: copyRows(kit.rows), updatedAt: Date.now()};
    update('kits', (list) => {
      const i = list.findIndex((k) => k.id === kit.id);
      return [...list.slice(0, i + 1), c, ...list.slice(i + 1)];
    });
    setFocusId(c.id);
    toast('複製しました。名前と中身を直してください。');
  };
  const remove = (kit: Kit) => {
    if (!confirm(`「${kit.name.trim() || '名前なし'}」を削除します。すでに入れた見積書・様邸の行はそのまま残ります。よろしいですか？`)) return;
    update('kits', (list) => list.filter((k) => k.id !== kit.id));
  };
  const toggleFavorite = (id: string) => update('materials', (list) => list.map((m) => (m.id === id ? {...m, favorite: !m.favorite} : m)));
  const addToMaster = (m: Material) => update('materials', (list) => [...list, m]);
  const pickKit = picker ? data.kits.find((k) => k.id === picker.kitId) : undefined;

  return (
    <div ref={mainRef} className={`max-w-5xl space-y-4 ${narrow ? 'rows-narrow' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-[#3b1f6b]">部材＋施工費（常用）のセット</h1>
        <Btn color="emerald" className="ml-auto" onClick={add}>
          ＋ 新しいセットを登録
        </Btn>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        よく使う部材と施工費（工務店の取付手間）の組み合わせを登録しておくと、見積書・請求書の「＋ 部材＋施工費（常用）から入れる」で、まとめて1回で入れられます。
        部材の行の「🔧 施工費」で数えた手間は、見積書ではその部材の「同上施工費」になります。入れるときの単価は、部材リスト・施工費の今の単価です。
      </p>
      {data.kits.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm leading-6 text-slate-500">
          まだ登録していません。「＋ 新しいセットを登録」で作れます（請求書を確認するの様邸で「この箇所を部材＋施工費（常用）に登録」を押しても登録できます）。
        </p>
      )}
      {data.kits.map((kit) => (
        <KitCard
          key={kit.id}
          kit={kit}
          data={data}
          autoFocus={kit.id === focusId}
          onName={(name) => setKit(kit.id, (k) => ({...k, name}))}
          onRows={(fn) => setRows(kit.id, fn)}
          onPickMaterial={() => setPicker({kitId: kit.id, kind: 'material'})}
          onPickLabor={(rowId) => setPicker({kitId: kit.id, kind: 'labor', rowId})}
          onDuplicate={() => duplicate(kit)}
          onRemove={() => remove(kit)}
        />
      ))}

      {picker && pickKit && picker.kind === 'material' && (
        <MaterialPicker
          place={asPlace(pickKit)}
          materials={data.materials}
          mode="estimate"
          rates={s}
          onAdd={(row) => setRows(pickKit.id, (rows) => addMaterial(rows, row))}
          onRemoveOne={(refId) => setRows(pickKit.id, (rows) => removeOneMaterial(rows, refId))}
          onToggleFavorite={toggleFavorite}
          onAddToMaster={addToMaster}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && pickKit && picker.kind === 'labor' && (
        <LaborPickerFor place={asPlace(pickKit)} rowId={picker.rowId} data={data} onRows={(rows) => setRows(pickKit.id, () => rows)} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

function KitCard({
  kit,
  data,
  autoFocus,
  onName,
  onRows,
  onPickMaterial,
  onPickLabor,
  onDuplicate,
  onRemove,
}: {
  kit: Kit;
  data: AppData;
  autoFocus: boolean;
  onName: (name: string) => void;
  onRows: (fn: (rows: Row[]) => Row[]) => void;
  onPickMaterial: () => void;
  onPickLabor: (rowId: string | null) => void; // rowId：その部材の同上施工費。null：セットの最後に
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const rates = data.settings;
  // 今の単価（部材リスト・施工費の単価が変わっていれば、入れるときはそちら）。kit.rows と同じ並び
  const current = kitRows(kit, data.materials, data.labor);
  const estimate = estimatePlaceLines({rows: current}, rates).reduce((n, l) => n + l.amount, 0);
  const shikiri = placeTotals({rows: current}).total;
  const name = kit.name.trim() || '名前なし';
  const setRow = (id: string, patch: Partial<Row>) => onRows((rows) => rows.map((r) => (r.id === id ? {...r, ...patch} : r)));
  const move = (i: number, d: number) =>
    onRows((rows) => {
      const k = i + d;
      if (k < 0 || k >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[k]] = [next[k], next[i]];
      return next;
    });

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={`セット「${name}」`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-white px-4 py-2.5">
        <TextInput
          value={kit.name}
          onChange={onName}
          placeholder="セットの名前（例：玄関 I型手すり）"
          className="min-w-[14rem] flex-1 text-base font-bold text-[#3b1f6b]"
          aria-label="セットの名前"
          autoFocus={autoFocus}
        />
        <span className="text-sm tabular-nums text-slate-600">
          見積 <b className="text-base text-slate-900">{yen(estimate)}円</b>（税抜）・仕切り {yen(shikiri)}円
        </span>
        <div className="flex gap-1">
          <button type="button" onClick={onDuplicate} className="rounded px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100">
            複製
          </button>
          <button type="button" onClick={onRemove} className="rounded px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50" aria-label={`セット「${name}」を削除`}>
            削除
          </button>
        </div>
      </div>

      {kit.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="rows-table w-full min-w-[720px] text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="w-14 px-2 py-1.5 text-left">区分</th>
                <th className="px-2 py-1.5 text-left">品名</th>
                <th className="w-28 px-2 py-1.5 text-right">単価（見積）</th>
                <th className="w-36 px-2 py-1.5 text-center">数量・箇所</th>
                <th className="w-28 px-2 py-1.5 text-right">金額（見積）</th>
                <th className="w-40 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {kit.rows.map((r, i) => {
                const cur = current[i] ?? r;
                const label = r.name || (r.kind === 'labor' ? '工事' : '部材');
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-middle">
                    <td data-cell="kind" className="px-2 py-1.5">
                      <KindBadge kind={r.kind} label="施工費" />
                    </td>
                    <td data-cell="name" className="px-2 py-1.5">
                      <div className="font-bold text-slate-800">{label}</div>
                      {(r.maker || r.code) && <div className="text-[11px] text-slate-500">{[r.maker, r.code].filter(Boolean).join('　')}</div>}
                    </td>
                    <td data-cell="price" data-label="単価" className="px-2 py-1.5 text-right tabular-nums">
                      {yen(estimateUnitPrice(cur, rates))}
                      {r.kind === 'material' && (
                        <div className={`text-[11px] ${shikiriPrice(cur) > 0 ? 'text-slate-500' : 'font-bold text-amber-700'}`}>仕切 {shikiriPrice(cur) > 0 ? yen(shikiriPrice(cur)) : '空欄'}</div>
                      )}
                    </td>
                    <td data-cell="qty" data-label="数量・箇所" className="px-2 py-1.5 text-center">
                      {/* 部材の数を空けておけるように（例：手すりの本数は見積ごとに入れる）、0 は空にして出す */}
                      <Stepper value={r.qty} onChange={(qty) => setRow(r.id, {qty})} ariaLabel={`${label}の数量`} blankZero={r.kind === 'material'} />
                    </td>
                    <td data-cell="amount" data-label="金額（見積）" className="px-2 py-1.5 text-right font-bold tabular-nums">
                      {yen(estimateAmount(cur, rates))}
                      {r.kind === 'material' && <div className="text-[11px] font-normal text-slate-500">仕切 {yen(rowAmount(cur))}</div>}
                    </td>
                    <td data-cell="ops" className="whitespace-nowrap px-1 py-1.5 text-right">
                      {r.kind === 'material' && (
                        <button
                          type="button"
                          onClick={() => onPickLabor(r.id)}
                          className="mr-1 rounded border border-sky-300 px-1.5 py-0.5 text-xs font-bold text-sky-800 hover:bg-sky-50"
                          title="この部材の施工費（工務店の取付手間）を数える。見積書では「同上施工費」"
                          aria-label={`${label}の施工費を数える`}
                        >
                          🔧 施工費
                        </button>
                      )}
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="上へ">
                        ▲
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === kit.rows.length - 1} className="rounded px-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="下へ">
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => onRows((rows) => rows.filter((x) => x.id !== r.id))}
                        className="rounded px-1.5 text-rose-600 hover:bg-rose-50"
                        title="この行を削除"
                        aria-label={`${label}の行を削除`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 見積書のツールバーと同じく大きめ（ユーザーの指示「この部分もう少し大きくする」、2026-10-21） */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Btn color="emerald" onClick={onPickMaterial} className="!px-4 !text-base">
          📋 部材リストから入れる
        </Btn>
        <Btn color="sky" onClick={() => onPickLabor(null)} className="!px-4 !text-base">
          🔧 施工費を入れる
        </Btn>
        {kit.rows.length === 0 && <span className="text-sm text-slate-500">部材を入れてから、部材の行の「🔧 施工費」で取付手間を数えます。</span>}
      </div>
    </section>
  );
}

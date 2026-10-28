// 発注書：見積書に入っている部材を、何を何個（何本・何枚）発注するかにまとめて並べる（計算は order.ts）。
// 数は ＋／− で増やす・減らす、✕ で消す（消した行は下の「消した行」から戻せる）。部材リストから足すこともできる。
// 印刷（A4縦の発注書）と、販売受注簿作成ツールへの転記ができる。

import {useMemo, useState} from 'react';
import type {MouseEvent} from 'react';
import {jobName} from '../calc.ts';
import type {EstimateRates} from '../calc.ts';
import {MaterialPicker} from '../components/Pickers.tsx';
import {Btn, Stepper, TextInput, useToast} from '../components/ui.tsx';
import {
  addOrderLine,
  applyOrderEdits,
  bumpOrderQty,
  emptyOrderEdits,
  HACCHU_IMPORT_KEY,
  HACCHU_PATH,
  hacchuImport,
  orderBaseLines,
  orderedLines,
  photoLabel,
  removedLines,
  removeOneOrderLine,
  removeOrderLine,
  restoreOrderLine,
  setOrderQty,
  unitTotals,
} from '../order.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {manualRow} from '../rows.ts';
import type {AppData, Job, Material, OrderEdits, OrderLine, Place} from '../types.ts';
import type {Update} from '../useStore.ts';
import {num, todayIso} from '../util.ts';

/** 販売受注簿作成ツールの場所（太陽ポータルと同じサイト。同じサイトなので、部材はこの端末の localStorage で渡せる） */
export function hacchuUrl(): string {
  try {
    return new URL(`${HACCHU_PATH}?from=jutaku`, location.origin).href;
  } catch {
    // ファイルを開いたとき（file://）に origin が "null" になるブラウザ（Firefox など）では URL にできず、画面ごと消えていた。となりのフォルダの販売受注簿にする
    return '../taiyo-hacchu-scan/?from=jutaku';
  }
}

/** 見積書から作った発注書の行と、手で直したところを重ねたもの */
export function useOrderLines(job: Job, materials: Material[], rates: EstimateRates) {
  const base = useMemo(() => orderBaseLines(job, materials, rates), [job.places, materials, rates]);
  return {base, lines: applyOrderEdits(base, job.order), removed: removedLines(base, job.order)};
}

export function OrderPage({
  job,
  data,
  update,
  onBack,
  onPrint,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void; // 見積書へ戻る
  onPrint: (r: PrintRequest) => void;
}) {
  const toast = useToast();
  const {lines, removed} = useOrderLines(job, data.materials, data.settings);
  const edits = job.order ?? emptyOrderEdits();
  const [picking, setPicking] = useState(false);
  const name = jobName(job);
  const ordered = orderedLines(lines);
  // No. は印刷と同じく発注する行（数が 0 でない行）だけに付ける
  let n = 0;
  const nos = lines.map((l) => (l.qty > 0 ? ++n : 0));

  const setEdits = (fn: (e: OrderEdits) => OrderEdits) =>
    update('jobs', (list) => list.map((j) => (j.id === job.id ? {...j, order: fn(j.order ?? emptyOrderEdits()), updatedAt: Date.now()} : j)));
  const edited = !!job.order && (Object.keys(job.order.qty).length > 0 || job.order.removed.length > 0 || job.order.added.length > 0);

  const reset = () => {
    if (!confirm('発注書で直した数・消した行・足した行をやめて、見積書から計算した数に戻します。よろしいですか？')) return;
    setEdits((e) => ({...e, qty: {}, removed: [], added: []}));
    toast('見積書から計算した数に戻しました');
  };
  const remove = (l: OrderLine) => {
    setEdits((e) => removeOrderLine(e, l));
    toast(l.key.startsWith('add:') ? '行を消しました' : '行を消しました（下の「消した行」から戻せます）');
  };

  // 販売受注簿作成ツールを新しいタブで開く（リンクなので、ポップアップを止める設定でも開く）。開く前に部材を置いておく
  const transfer = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (ordered.length === 0) {
      ev.preventDefault();
      toast('発注する部材がありません', 'error');
      return;
    }
    try {
      localStorage.setItem(HACCHU_IMPORT_KEY, JSON.stringify(hacchuImport(job, lines, edits)));
    } catch {
      ev.preventDefault();
      toast('部材を販売受注簿へ渡せませんでした（この端末のブラウザに保存できません）', 'error');
      return;
    }
    toast(`販売受注簿を開きました（部材 ${ordered.length}点）。開いた画面で「受注簿に入れる」を押してください`);
  };

  // 部材を選ぶ画面は箇所に向けて作ってあるので、発注書で足した行を箇所の行に見立てて渡す（入れた数を出すため）
  const pickPlace: Place = {
    id: 'order',
    name: '発注書',
    rows: edits.added.map((l) => manualRow('material', {refId: l.refId, name: l.name, code: l.code, maker: l.maker, unit: l.unit, qty: l.qty})),
    kind: 1,
    photo: 0,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 見積書へ戻る
        </Btn>
        <h1 className="text-lg font-bold text-[#14532d]">発注書　{name}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn color="softSky" onClick={() => onPrint({kind: 'order', jobId: job.id})} disabled={ordered.length === 0}>
            🖨 発注書を印刷
          </Btn>
          <a
            href={hacchuUrl()}
            target="_blank"
            onClick={transfer}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            📤 販売受注簿に転記
          </a>
        </div>
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="grid min-w-[12rem] flex-1 gap-1 text-xs font-bold text-slate-600">
          発注先
          <TextInput value={edits.supplier} onChange={(supplier) => setEdits((e) => ({...e, supplier}))} placeholder="例：ケアマックス" className="w-full min-w-0 text-sm font-normal" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          発注日
          <input
            type="date"
            value={edits.date || todayIso()}
            onChange={(ev) => setEdits((e) => ({...e, date: ev.target.value}))}
            className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
            aria-label="発注日"
          />
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="発注する部材">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-bold text-slate-700">発注する部材</h2>
          <span className="text-sm text-slate-600" data-testid="order-total">
            {ordered.length}品目{ordered.length > 0 && `（${unitTotals(ordered)}）`}
          </span>
          {edited && (
            <span className="ml-auto text-xs text-blue-700">
              発注書で数を直しています
              <button type="button" onClick={reset} className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-50">
                見積書の数に戻す
              </button>
            </span>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">見積書に部材が入っていません。見積書に部材を入れると、ここに発注する数が出ます。</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <OrderRow
                key={l.key}
                no={nos[i]}
                line={l}
                onQty={(q) => setEdits((e) => setOrderQty(e, l, q))}
                onReset={() => setEdits((e) => setOrderQty(e, l, l.calc))}
                onRemove={() => remove(l)}
              />
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
          <Btn small color="emerald" onClick={() => setPicking(true)}>
            ＋ 部材リストから足す
          </Btn>
          {removed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              消した行：
              {removed.map((l) => (
                <span key={l.key} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                  {l.code || l.name} {num(l.calc, 3)}
                  {l.unit}
                  <button type="button" onClick={() => setEdits((e) => restoreOrderLine(e, l.key))} className="font-bold text-blue-700 hover:underline">
                    戻す
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {picking && (
        <MaterialPicker
          place={pickPlace}
          materials={data.materials}
          mode="estimate"
          rates={data.settings}
          // 見積書から作った行にある部材は、その行の数を増やす（同じ部材が2行に分かれないように）
          onAdd={(row) => {
            const same = row.refId ? lines.find((l) => l.refId === row.refId && !l.key.startsWith('add:')) : undefined;
            setEdits((e) => (same ? bumpOrderQty(e, same, row.qty) : addOrderLine(e, row)));
            if (same) toast(`「${same.name || same.code}」の発注する数を増やしました`);
          }}
          onRemoveOne={(refId) => setEdits((e) => removeOneOrderLine(e, refId))}
          onToggleFavorite={(id) => update('materials', (list) => list.map((m) => (m.id === id ? {...m, favorite: !m.favorite} : m)))}
          onAddToMaster={(m) => update('materials', (list) => [...list, m])}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function OrderRow({line: l, no, onQty, onReset, onRemove}: {line: OrderLine; no: number; onQty: (q: number) => void; onReset: () => void; onRemove: () => void}) {
  const label = l.name || l.code || '部材';
  const changed = !l.key.startsWith('add:') && Math.abs(l.qty - l.calc) > 1e-6;
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto] sm:items-center ${l.qty > 0 ? '' : 'bg-slate-50'}`}>
      <div className="hidden text-sm tabular-nums text-slate-400 sm:block">{no > 0 ? no : ''}</div>
      <div className="min-w-0">
        <div className="break-words text-[15px] font-bold leading-snug text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">
          {[l.maker, l.code && `品番 ${l.code}`, l.lengthMm > 0 && `1${l.unit} ${l.lengthMm}mm`].filter(Boolean).join('　')}
          {l.photos.length > 0 && <span className="ml-2 inline-block whitespace-nowrap font-bold text-slate-700">写真番号 {photoLabel(l.photos)}</span>}
          {l.key.startsWith('add:') && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">発注書で足した行</span>}
        </div>
        {l.warn && <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">⚠ {l.warn}</div>}
        {changed && (
          <div className="mt-1 text-xs text-blue-700">
            見積書から計算した数は {num(l.calc, 3)}
            {l.unit}
            <button type="button" onClick={onReset} className="ml-2 font-bold underline">
              戻す
            </button>
          </div>
        )}
        {l.qty === 0 && <div className="mt-1 text-xs font-bold text-slate-500">0 なので発注しません</div>}
      </div>
      <div className="col-start-1 flex items-center gap-2 sm:col-start-auto">
        <Stepper value={l.qty} onChange={onQty} ariaLabel={`${label}の発注する数`} />
        <span className="min-w-[2em] text-lg font-bold text-slate-800">{l.unit}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label}を発注書から消す`}
        className="col-start-2 row-start-1 h-9 w-9 self-start rounded-md border border-slate-300 bg-white text-lg font-bold text-rose-600 hover:bg-rose-50 sm:col-start-auto sm:row-start-auto sm:self-center"
      >
        ✕
      </button>
    </li>
  );
}

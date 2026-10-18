import {useState} from 'react';
import {jobName, jobTotals, placeTotals, rowAmount} from '../calc.ts';
import type {JobTotals} from '../calc.ts';
import type {AppData, Job, Material, NameSuffix, Place, Row, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {uid, yen} from '../util.ts';
import {LaborCounter, MaterialPicker} from './Pickers.tsx';
import {Btn, KindBadge, NumberInput, Stepper, TextInput, useToast} from './ui.tsx';

export function copyJob(job: Job): Job {
  const now = Date.now();
  return {
    ...job,
    id: uid('j'),
    customer: job.customer + '（コピー）',
    places: job.places.map((p) => ({...p, id: uid('p'), rows: p.rows.map((r) => ({...r, id: uid('r')}))})),
    createdAt: now,
    updatedAt: now,
  };
}

export function JobEditor({
  job,
  data,
  update,
  onBack,
  onOpen,
  onPrint,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  onOpen: (id: string) => void;
  onPrint: (jobId: string) => void;
}) {
  const toast = useToast();
  const [picker, setPicker] = useState<{placeId: string; kind: 'material' | 'labor'} | null>(null);
  const [newPlace, setNewPlace] = useState('');
  const totals = jobTotals(job, data.settings);

  const setJob = (fn: (j: Job) => Job) =>
    update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setPlace = (placeId: string, fn: (p: Place) => Place) =>
    setJob((j) => ({...j, places: j.places.map((p) => (p.id === placeId ? fn(p) : p))}));

  const addPlace = (name: string) => {
    const p: Place = {id: uid('p'), name: name.trim(), rows: []};
    setJob((j) => ({...j, places: [...j.places, p]}));
    setNewPlace('');
  };
  const movePlace = (placeId: string, delta: number) =>
    setJob((j) => {
      const i = j.places.findIndex((p) => p.id === placeId);
      const k = i + delta;
      if (i < 0 || k < 0 || k >= j.places.length) return j;
      const places = [...j.places];
      [places[i], places[k]] = [places[k], places[i]];
      return {...j, places};
    });
  const copyPlace = (place: Place) =>
    setJob((j) => {
      const i = j.places.findIndex((p) => p.id === place.id);
      const c: Place = {...place, id: uid('p'), name: place.name + '（コピー）', rows: place.rows.map((r) => ({...r, id: uid('r')}))};
      const places = [...j.places];
      places.splice(i + 1, 0, c);
      return {...j, places};
    });
  const removePlace = (place: Place) => {
    if (place.rows.length > 0 && !confirm(`「${place.name || '箇所'}」と、その中の${place.rows.length}行を削除します。よろしいですか？`)) return;
    setJob((j) => ({...j, places: j.places.filter((p) => p.id !== place.id)}));
  };

  const removeJob = () => {
    if (!confirm(`「${jobName(job)}」を削除します。元に戻せません。よろしいですか？`)) return;
    update('jobs', (list) => list.filter((j) => j.id !== job.id));
    toast(`「${jobName(job)}」を削除しました`);
    onBack();
  };
  const duplicate = () => {
    const c = copyJob(job);
    update('jobs', (list) => [...list, c]);
    toast('複製しました。お客様名などを書き換えてください。');
    onOpen(c.id);
  };

  const toggleFavorite = (id: string) =>
    update('materials', (list) => list.map((m) => (m.id === id ? {...m, favorite: !m.favorite} : m)));
  const addToMaster = (m: Material) => update('materials', (list) => [...list, m]);

  const pickPlace = picker ? job.places.find((p) => p.id === picker.placeId) : undefined;
  const presets = data.settings.placePresets;
  const used = new Set(job.places.map((p) => p.name));
  // 候補から消した人が担当の様邸でも、その名前は選んだまま残す
  const staffList = data.settings.staffList;
  const staffOptions = !job.staff || staffList.includes(job.staff) ? staffList : [...staffList, job.staff];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 一覧へ戻る
        </Btn>
        <h1 className="text-lg font-bold text-[#0c315e]">{jobName(job)}</h1>
        {job.staff && <span className="text-sm font-bold text-slate-500">担当 {job.staff}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn color="sky" onClick={() => onPrint(job.id)}>
            🖨 この様邸の明細を印刷
          </Btn>
          <Btn color="white" onClick={duplicate}>
            複製
          </Btn>
          <Btn color="rose" onClick={removeJob}>
            削除
          </Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* min-w-0：表が広くても画面からはみ出さず、表の中で横に動かせるようにする */}
        <div className="min-w-0 space-y-4">
          <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
            {/* 担当はお客様名の横。狭い画面で入りきらないときは下の行に回る */}
            <div className="flex flex-wrap items-end gap-x-3 gap-y-3 sm:col-span-2">
              <label className="grid min-w-0 flex-[1_1_14rem] gap-1 text-xs font-bold text-slate-600">
                お客様名
                <div className="flex gap-2">
                  <TextInput
                    value={job.customer}
                    onChange={(customer) => setJob((j) => ({...j, customer}))}
                    placeholder="例：山田"
                    className="w-0 min-w-0 flex-1 text-base font-bold"
                    autoFocus={!job.customer}
                  />
                  <select
                    value={job.suffix}
                    onChange={(e) => setJob((j) => ({...j, suffix: e.target.value as NameSuffix}))}
                    className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                    aria-label="敬称"
                  >
                    <option value="様邸">様邸</option>
                    <option value="様">様</option>
                    <option value="">（付けない）</option>
                  </select>
                </div>
              </label>
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                担当
                <select
                  value={job.staff}
                  onChange={(e) => setJob((j) => ({...j, staff: e.target.value}))}
                  className={`h-9 min-w-[6.5rem] rounded-md border px-2 text-sm ${
                    job.staff ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'
                  }`}
                >
                  <option value="">（選ぶ）</option>
                  {staffOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              施工日
              <input
                type="date"
                value={job.date}
                onChange={(e) => setJob((j) => ({...j, date: e.target.value}))}
                className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              請求する月
              <input
                type="month"
                value={job.month}
                onChange={(e) => e.target.value && setJob((j) => ({...j, month: e.target.value}))}
                className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">
              住所（任意）
              <TextInput value={job.address} onChange={(address) => setJob((j) => ({...j, address}))} />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">
              備考（任意・明細に印刷されます）
              <TextInput value={job.note} onChange={(note) => setJob((j) => ({...j, note}))} />
            </label>
          </section>

          {job.places.map((place, i) => (
            <PlaceCard
              key={place.id}
              place={place}
              first={i === 0}
              last={i === job.places.length - 1}
              presets={presets}
              onRename={(name) => setPlace(place.id, (p) => ({...p, name}))}
              onRows={(rows) => setPlace(place.id, (p) => ({...p, rows}))}
              onMove={(d) => movePlace(place.id, d)}
              onCopy={() => copyPlace(place)}
              onRemove={() => removePlace(place)}
              onPickMaterial={() => setPicker({placeId: place.id, kind: 'material'})}
              onPickLabor={() => setPicker({placeId: place.id, kind: 'labor'})}
            />
          ))}

          <section className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-4">
            <div className="mb-2 text-sm font-bold text-emerald-800">
              ＋ 箇所を追加{job.places.length === 0 && '（まず玄関・トイレなどの箇所を作り、その中に部材と取付手間を入れます）'}
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => addPlace(name)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                    used.has(name) ? 'border-slate-200 bg-white text-slate-400 hover:text-slate-600' : 'border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  {name}
                </button>
              ))}
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newPlace.trim()) addPlace(newPlace);
                }}
              >
                <TextInput value={newPlace} onChange={setNewPlace} placeholder="ほかの箇所名" className="w-36" />
                <Btn small color="emerald" type="submit" disabled={!newPlace.trim()}>
                  追加
                </Btn>
              </form>
            </div>
          </section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-3 lg:self-start">
          <SummaryBox totals={totals} settings={data.settings} />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            ①〜⑦は元の「仕切り計算表」と同じ式です。③④⑤は1円単位にしてから足しているので、表の数字は縦にも横にも合います。
          </p>
        </aside>
      </div>

      {picker && pickPlace && picker.kind === 'material' && (
        <MaterialPicker
          place={pickPlace}
          materials={data.materials}
          onAdd={(row) =>
            setPlace(pickPlace.id, (p) => {
              // 同じ部材をもう一度選んだら、行を増やさずに数量を足す
              const same = row.refId ? p.rows.find((r) => r.kind === 'material' && r.refId === row.refId) : undefined;
              if (!same) return {...p, rows: [...p.rows, row]};
              return {...p, rows: p.rows.map((r) => (r.id === same.id ? {...r, qty: r.qty + row.qty} : r))};
            })
          }
          onToggleFavorite={toggleFavorite}
          onAddToMaster={addToMaster}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && pickPlace && picker.kind === 'labor' && (
        <LaborCounter
          place={pickPlace}
          labor={data.labor}
          onChange={(rows) => setPlace(pickPlace.id, (p) => ({...p, rows}))}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function PlaceCard({
  place,
  first,
  last,
  presets,
  onRename,
  onRows,
  onMove,
  onCopy,
  onRemove,
  onPickMaterial,
  onPickLabor,
}: {
  place: Place;
  first: boolean;
  last: boolean;
  presets: string[];
  onRename: (name: string) => void;
  onRows: (rows: Row[]) => void;
  onMove: (delta: number) => void;
  onCopy: () => void;
  onRemove: () => void;
  onPickMaterial: () => void;
  onPickLabor: () => void;
}) {
  const t = placeTotals(place);
  const listId = `places-${place.id}`;
  const setRow = (id: string, patch: Partial<Row>) => onRows(place.rows.map((r) => (r.id === id ? {...r, ...patch} : r)));
  const moveRow = (i: number, d: number) => {
    const k = i + d;
    if (k < 0 || k >= place.rows.length) return;
    const rows = [...place.rows];
    [rows[i], rows[k]] = [rows[k], rows[i]];
    onRows(rows);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white px-4 py-2.5">
        <span className="text-xs font-bold text-slate-500">箇所</span>
        <input
          value={place.name}
          onChange={(e) => onRename(e.target.value)}
          list={listId}
          placeholder="箇所名（玄関など）"
          className="h-9 w-48 rounded-md border border-slate-300 bg-white px-2 text-base font-bold text-[#0c315e]"
        />
        <datalist id={listId}>
          {presets.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <span className="ml-auto text-sm tabular-nums text-slate-600">
          部材 {yen(t.material)} ＋ 手間 {yen(t.labor)} ＝ <b className="text-base text-slate-900">{yen(t.total)}円</b>
        </span>
        <div className="flex gap-1">
          <button type="button" disabled={first} onClick={() => onMove(-1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="上へ">
            ▲
          </button>
          <button type="button" disabled={last} onClick={() => onMove(1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="下へ">
            ▼
          </button>
          <button type="button" onClick={onCopy} className="rounded px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100" title="この箇所を複製">
            複製
          </button>
          <button type="button" onClick={onRemove} className="rounded px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50" title="この箇所を削除">
            削除
          </button>
        </div>
      </div>

      {place.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="w-14 px-2 py-1.5 text-left">区分</th>
                <th className="px-2 py-1.5 text-left">品名</th>
                <th className="w-28 px-2 py-1.5 pr-4 text-right">単価</th>
                <th className="w-36 px-2 py-1.5 text-center">数量・箇所</th>
                <th className="w-28 px-2 py-1.5 text-right">金額</th>
                <th className="w-20 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {place.rows.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100 align-middle">
                  <td className="px-2 py-1.5">
                    <KindBadge kind={r.kind} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.name}
                      onChange={(e) => setRow(r.id, {name: e.target.value})}
                      className="h-9 w-full min-w-[14rem] rounded-md border border-transparent px-2 font-bold text-slate-800 hover:border-slate-300 focus:border-blue-500"
                      aria-label="品名"
                    />
                    {(r.code || r.maker) && (
                      <div className="px-2 text-[11px] text-slate-500">
                        {[r.maker, r.code].filter(Boolean).join('　')}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <NumberInput value={r.price} onChange={(price) => setRow(r.id, {price})} className="w-24" ariaLabel="単価" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Stepper value={r.qty} onChange={(qty) => setRow(r.id, {qty})} ariaLabel={`${r.name}の数量`} />
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">{yen(rowAmount(r))}</td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right">
                    <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} className="rounded px-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="上へ">
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(i, 1)}
                      disabled={i === place.rows.length - 1}
                      className="rounded px-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      title="下へ"
                    >
                      ▼
                    </button>
                    <button type="button" onClick={() => onRows(place.rows.filter((x) => x.id !== r.id))} className="rounded px-1.5 text-rose-600 hover:bg-rose-50" title="この行を削除" aria-label="この行を削除">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2 px-4 py-3">
        <Btn small color="emerald" onClick={onPickMaterial}>
          ＋ 部材を追加
        </Btn>
        <Btn small color="sky" onClick={onPickLabor}>
          ＋ 取付手間（箇所数を数える）
        </Btn>
        {place.rows.length === 0 && <span className="self-center text-xs text-slate-500">部材リストから部材を選び、取付手間を数えます。</span>}
      </div>
    </section>
  );
}

export function SummaryBox({totals: t, settings: s}: {totals: JobTotals; settings: Settings}) {
  const rate = String(s.rate); // 元の表と同じく「×0.07」と書く
  const rows: [string, string, number, boolean][] = [
    ['①', '部材代合計', t.material, false],
    ['②', '取付手間合計', t.labor, false],
    ['③', `部材上乗せ（①×${rate}）`, t.markup, false],
    ['④', `諸経費（①＋②＋③）×${rate}`, t.overhead, false],
    ['⑤', `消費税（⑦×${s.taxRate}${s.taxMode === 'original' ? '－1' : ''}）`, t.tax, false],
    ['⑥', '合計', t.total, true],
    ['⑦', '税抜合計', t.subtotal, true],
  ];
  return (
    <div className="overflow-hidden rounded-xl border-2 border-slate-800 bg-white">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([no, label, value, strong]) => (
            <tr key={no} className="border-b border-slate-800 last:border-b-0">
              <td className={`w-9 border-r border-slate-800 py-2 text-center ${strong ? 'font-bold' : ''}`}>{no}</td>
              <td className={`border-r border-slate-800 px-2 py-2 ${strong ? 'bg-[#9dc3e6] font-bold' : ''}`}>{label}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${strong ? 'text-base font-bold' : ''}`}>{yen(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {cutToLength, jobName, jobTotals, placeTotals, rowAmount, taxFormula} from '../calc.ts';
import type {JobTotals} from '../calc.ts';
import {cutCalc} from '../estimateForms.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {addMaterial, copyRows, kitFromRows, manualRow, newPlace as makePlace, removeOneMaterial} from '../rows.ts';
import type {AppData, Job, Kit, Material, NameSuffix, Place, Row, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {staffFull, uid, yen} from '../util.ts';
import {copyJob, LaborPickerFor} from './JobTools.tsx';
import {KitPicker} from './Kits.tsx';
import {MaterialPicker} from './Pickers.tsx';
import {Btn, KindBadge, NumberInput, Stepper, TextInput, useToast} from './ui.tsx';

type Picker = {placeId: string; kind: 'material'} | {placeId: string; kind: 'labor'} | {placeId: string; kind: 'kit'};

export function JobEditor({
  job,
  data,
  update,
  onBack,
  onOpen,
  onOpenEstimate,
  onBackToEstimate,
  onPrint,
  onManageKits,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  onOpen: (id: string) => void;
  onOpenEstimate: (id: string) => void; // 「見積もり・申請書を作成する」で同じ様邸の見積書を開く
  onBackToEstimate: () => void; // 左上の「← 見積もりへ戻る」：この様邸の見積書を開く（請求書のタブは一覧に戻しておく）
  onPrint: (r: PrintRequest) => void;
  onManageKits?: () => void; // 部材・施工費マスタの「部材＋施工費（常用）」を開く
}) {
  const toast = useToast();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [newPlace, setNewPlace] = useState('');
  // 「金額だけ入れる」で足した行の金額の欄に、すぐ打ち込めるようにする（入れた直後の1回だけ）
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRowId) return;
    const t = window.setTimeout(() => setFocusRowId(null), 0);
    return () => window.clearTimeout(t);
  }, [focusRowId]);
  const s = data.settings;
  // 入力の欄の幅が狭いとき（スマホなど）は、行を縦に並べる
  const mainRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
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
  const totals = jobTotals(job, s);

  const setJob = (fn: (j: Job) => Job) =>
    update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setPlace = (placeId: string, fn: (p: Place) => Place) =>
    setJob((j) => ({...j, places: j.places.map((p) => (p.id === placeId ? fn(p) : p))}));

  const addPlace = (name: string) => {
    const p = makePlace(name);
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
  // 複製は名前はそのまま（見積書の写真番号は付け直す）
  const copyPlace = (place: Place) =>
    setJob((j) => {
      const i = j.places.findIndex((p) => p.id === place.id);
      const places = [...j.places];
      places.splice(i + 1, 0, {...place, id: uid('p'), rows: copyRows(place.rows), photo: 0});
      return {...j, places};
    });
  const removePlace = (place: Place) => {
    if (place.rows.length > 0 && !confirm(`「${place.name || '箇所'}」と、その中の${place.rows.length}行を削除します。よろしいですか？`)) return;
    setJob((j) => ({...j, places: j.places.filter((p) => p.id !== place.id)}));
  };
  const removeJob = () => {
    if (
      !confirm(
        `「${jobName(job)}」を削除します。見積書からも消えます。元に戻せません。よろしいですか？\n（この請求書に入れないだけなら「請求書から外す」を押してください）`,
      )
    )
      return;
    update('jobs', (list) => list.filter((j) => j.id !== job.id));
    toast(`「${jobName(job)}」を削除しました`);
    onBack();
  };
  // 見積書は残して、この請求書にだけ入れない
  const leaveInvoice = () => {
    setJob((j) => ({...j, shikiri: false}));
    toast(`「${jobName(job)}」を請求書から外しました（見積書は「見積もり・申請書を作成する」に残っています）`);
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

  const addBlank = (place: Place, kind: 'material' | 'labor') => {
    const row = manualRow(kind);
    setPlace(place.id, (p) => ({...p, rows: [...p.rows, row]}));
    setFocusRowId(row.id);
  };
  const saveKit = (place: Place) => {
    const name = prompt('部材＋施工費（常用）の名前（例：玄関 I型手すり）', `${place.name || '箇所'}の部材＋施工費`);
    if (name === null || !name.trim()) return;
    update('kits', (list) => [...list, kitFromRows(name, place.rows)]);
    toast(`部材＋施工費（常用）「${name.trim()}」を登録しました。ほかの箇所・様邸でも「＋ 部材＋施工費（常用）から入れる」で使えます。`);
  };
  const removeKit = (kit: Kit) => {
    if (!confirm(`部材＋施工費（常用）「${kit.name}」を削除します。すでに入れた様邸の行はそのまま残ります。よろしいですか？`)) return;
    update('kits', (list) => list.filter((k) => k.id !== kit.id));
  };

  const pickPlace = picker ? job.places.find((p) => p.id === picker.placeId) : undefined;
  const presets = data.settings.placePresets;
  const used = new Map<string, number>();
  for (const p of job.places) used.set(p.name, (used.get(p.name) ?? 0) + 1);
  // 候補から消した人が担当の様邸でも、その名前は選んだまま残す。名字だけで入っている様邸は、候補のフルネームにして見せる
  const staffList = data.settings.staffList;
  const staff = staffFull(job.staff, staffList);
  const staffOptions = !staff || staffList.includes(staff) ? staffList : [...staffList, staff];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* 一覧へは上の「🧾 請求書を確認する」のタブで戻る（ユーザーの指示：「一覧へ戻るではなく、見積もりへ戻るへ変更」） */}
        <Btn color="white" onClick={onBackToEstimate}>
          ← 見積もりへ戻る
        </Btn>
        <h1 className="text-lg font-bold text-[#0c315e]">{jobName(job)}</h1>
        {staff && <span className="text-sm font-bold text-slate-500">担当 {staff}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn color="softSky" onClick={() => onPrint({kind: 'job', jobId: job.id})}>
            🖨 この様邸の明細を印刷
          </Btn>
          <Btn color="white" onClick={() => onOpenEstimate(job.id)} title="同じ入力から作る見積書を「見積もり・申請書を作成する」で開きます">
            📝 見積書を開く
          </Btn>
          <Btn color="white" onClick={duplicate}>
            複製
          </Btn>
          <Btn color="white" onClick={leaveInvoice}>
            請求書から外す
          </Btn>
          <Btn color="white" onClick={removeJob}>
            削除
          </Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* min-w-0：表が広くても画面からはみ出さず、表の中で横に動かせるようにする */}
        <div ref={mainRef} className={`min-w-0 space-y-4 ${narrow ? 'rows-narrow' : ''}`}>
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
                  value={staff}
                  onChange={(e) => setJob((j) => ({...j, staff: e.target.value}))}
                  className={`h-9 min-w-[6.5rem] rounded-md border px-2 text-sm ${staff ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
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
              <TextInput value={job.address} onChange={(address) => setJob((j) => ({...j, address}))} className="w-full min-w-0 text-sm font-normal text-slate-800" aria-label="住所" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">
              備考（任意・明細に印刷されます）
              <TextInput value={job.note} onChange={(note) => setJob((j) => ({...j, note}))} className="w-full min-w-0 text-sm font-normal text-slate-800" />
            </label>
          </section>

          {job.places.map((place, i) => (
            <PlaceCard
              key={place.id}
              place={place}
              first={i === 0}
              last={i === job.places.length - 1}
              presets={presets}
              focusRowId={focusRowId}
              onRename={(name) => setPlace(place.id, (p) => ({...p, name}))}
              onRows={(rows) => setPlace(place.id, (p) => ({...p, rows}))}
              onMove={(d) => movePlace(place.id, d)}
              onCopy={() => copyPlace(place)}
              onRemove={() => removePlace(place)}
              onPickMaterial={() => setPicker({placeId: place.id, kind: 'material'})}
              onPickLabor={() => setPicker({placeId: place.id, kind: 'labor'})}
              onPickKit={() => setPicker({placeId: place.id, kind: 'kit'})}
              onSaveKit={() => saveKit(place)}
              onAddBlank={(kind) => addBlank(place, kind)}
            />
          ))}

          <section className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-4">
            <div className="mb-2 text-sm font-bold text-emerald-800">
              ＋ 箇所を追加{job.places.length === 0 && '（まず玄関・トイレなどの箇所を作り、その中に部材と取付手間を入れます）'}
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((name) => {
                // もうある箇所も押せる（同じ箇所を写真番号ごとに別々に入れる）。いくつあるかを小さく出す
                const n = used.get(name) ?? 0;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addPlace(name)}
                    title={n > 0 ? `もう1つ「${name}」を足します` : undefined}
                    className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    {name}
                    {n > 0 && (
                      <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-700" aria-hidden="true">
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
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
          <SummaryBox totals={totals} settings={s} />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            ①〜⑦は元の「仕切り計算表」と同じ式です。③④⑤は1円単位にしてから足しているので、表の数字は縦にも横にも合います。
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            見積書は「見積もり・申請書を作成する」で、この様邸と同じ入力から作ります（どちらで部材・取付手間を直しても、もう片方も変わります）。
          </p>
        </aside>
      </div>

      {picker && pickPlace && picker.kind === 'material' && (
        <MaterialPicker
          place={pickPlace}
          materials={data.materials}
          mode="shikiri"
          rates={s}
          onAdd={(row) => setPlace(pickPlace.id, (p) => ({...p, rows: addMaterial(p.rows, row)}))}
          onRemoveOne={(refId) => setPlace(pickPlace.id, (p) => ({...p, rows: removeOneMaterial(p.rows, refId)}))}
          onToggleFavorite={toggleFavorite}
          onAddToMaster={addToMaster}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && pickPlace && picker.kind === 'labor' && (
        <LaborPickerFor place={pickPlace} rowId={null} data={data} onRows={(rows) => setPlace(pickPlace.id, (p) => ({...p, rows}))} onClose={() => setPicker(null)} />
      )}
      {picker && pickPlace && picker.kind === 'kit' && (
        <KitPicker
          kits={data.kits}
          materials={data.materials}
          labor={data.labor}
          mode="shikiri"
          rates={s}
          placeName={pickPlace.name}
          onInsert={(rows) => {
            setPlace(pickPlace.id, (p) => ({...p, rows: [...p.rows, ...rows]}));
            setPicker(null);
            toast(`部材＋施工費（常用）の${rows.length}行を「${pickPlace.name || '箇所'}」に入れました`);
          }}
          onRename={(id, name) => update('kits', (list) => list.map((k) => (k.id === id ? {...k, name, updatedAt: Date.now()} : k)))}
          onRemove={removeKit}
          onManage={
            onManageKits &&
            (() => {
              setPicker(null);
              onManageKits();
            })
          }
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
  focusRowId,
  onRename,
  onRows,
  onMove,
  onCopy,
  onRemove,
  onPickMaterial,
  onPickLabor,
  onPickKit,
  onSaveKit,
  onAddBlank,
}: {
  place: Place;
  first: boolean;
  last: boolean;
  presets: string[];
  focusRowId: string | null;
  onRename: (name: string) => void;
  onRows: (rows: Row[]) => void;
  onMove: (delta: number) => void;
  onCopy: () => void;
  onRemove: () => void;
  onPickMaterial: () => void;
  onPickLabor: () => void;
  onPickKit: () => void;
  onSaveKit: () => void;
  onAddBlank: (kind: 'material' | 'labor') => void;
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white px-4 py-2.5">
        <label className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">箇所</span>
          <input
            value={place.name}
            onChange={(e) => onRename(e.target.value)}
            list={listId}
            placeholder="箇所名（玄関など）"
            className="h-9 w-48 rounded-md border border-slate-300 bg-white px-2 text-base font-bold text-[#0c315e]"
          />
        </label>
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
          {/* rows-table：スマホでは1行を縦に並べる（sasaoka.css） */}
          <table className="rows-table w-full min-w-[720px] text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="w-14 px-2 py-1.5 text-left">区分</th>
                <th className="px-2 py-1.5 text-left">品名</th>
                <th className="w-32 px-2 py-1.5 pr-4 text-right">単価</th>
                <th className="w-36 px-2 py-1.5 text-center">数量・箇所</th>
                <th className="w-28 px-2 py-1.5 text-right">金額</th>
                <th className="w-20 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {place.rows.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100 align-middle">
                  <td data-cell="kind" className="px-2 py-1.5">
                    <KindBadge kind={r.kind} />
                  </td>
                  <td data-cell="name" className="px-2 py-1.5">
                    <input
                      value={r.name}
                      onChange={(e) => setRow(r.id, {name: e.target.value})}
                      placeholder={r.kind === 'labor' ? '（工事内容なし）' : '（品名なし）'}
                      className="h-9 w-full min-w-[14rem] rounded-md border border-slate-200 px-2 font-bold text-slate-800 hover:border-slate-300 focus:border-blue-500"
                      aria-label="品名"
                    />
                    {(r.code || r.maker) && <div className="px-2 text-[11px] text-slate-500">{[r.maker, r.code].filter(Boolean).join('　')}</div>}
                  </td>
                  <td data-cell="price" data-label="単価" className="px-2 py-1.5 text-right">
                    {r.kind === 'material' && r.price === 0 ? (
                      // 仕切価格が空欄の部材（定価からは計算しない）。打ち込めば、その仕切価格で計算する
                      <NumberInput value={0} blankZero placeholder="空欄" onChange={(price) => setRow(r.id, {price})} className="w-24" ariaLabel="単価" autoFocus={r.id === focusRowId} />
                    ) : (
                      <NumberInput value={r.price} onChange={(price) => setRow(r.id, {price})} className="w-24" ariaLabel="単価" autoFocus={r.id === focusRowId} />
                    )}
                  </td>
                  <td data-cell="qty" data-label="数量・箇所" className="px-2 py-1.5 text-center">
                    <Stepper value={r.qty} onChange={(qty) => setRow(r.id, {qty})} ariaLabel={`${r.name || '金額だけの行'}の数量`} />
                    {/* 切って使う部材（見積書で長さを入れたもの）は 使う長さ÷1本の長さ の本数で計算する */}
                    {cutToLength(r) && <div className="mt-0.5 text-[11px] text-slate-500">{cutCalc(r)}本</div>}
                  </td>
                  <td data-cell="amount" data-label="金額" className="px-2 py-1.5 text-right font-bold tabular-nums">
                    {yen(rowAmount(r))}
                  </td>
                  <td data-cell="ops" className="whitespace-nowrap px-1 py-1.5 text-right">
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

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Btn small color="emerald" onClick={onPickMaterial}>
          ＋ 部材を追加
        </Btn>
        <Btn small color="sky" onClick={onPickLabor}>
          ＋ 取付手間（箇所数を数える）
        </Btn>
        <Btn small color="white" onClick={() => onAddBlank('material')}>
          ＋ 部材を金額だけ入れる
        </Btn>
        <Btn small color="white" onClick={() => onAddBlank('labor')}>
          ＋ 工事を金額だけ入れる
        </Btn>
        <Btn small color="white" onClick={onPickKit}>
          ＋ 部材＋施工費（常用）から入れる
        </Btn>
        {place.rows.length > 0 && (
          <Btn small color="white" onClick={onSaveKit}>
            この箇所を部材＋施工費（常用）に登録
          </Btn>
        )}
        {place.rows.length === 0 && <span className="text-xs text-slate-500">部材リストから部材を選び、取付手間を数えます。</span>}
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
    ['⑤', `消費税（${taxFormula(s)}）`, t.tax, false],
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

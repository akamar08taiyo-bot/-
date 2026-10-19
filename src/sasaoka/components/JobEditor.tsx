import {useEffect, useState} from 'react';
import {
  cutToLength,
  estimateAmount,
  estimatePlaceLines,
  estimateQty,
  estimateTotals,
  estimateUnitPrice,
  jobName,
  jobTotals,
  overheadAuto,
  placeTotals,
  rowAmount,
} from '../calc.ts';
import type {EstimateLine, EstimateTotals, JobTotals} from '../calc.ts';
import {circled, FORM_IDS, FORM_INFO, formForAddress, jobForm, KINDS, photoNumbers, placeWork, workHours} from '../estimateForms.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {copyRows, kitFromRows, manualRow, newPlace as makePlace, replaceRange, workRange} from '../rows.ts';
import type {AppData, AppMode, EstimateForm, Job, Kit, Material, NameSuffix, Place, Row, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {num, staffFull, uid, yen} from '../util.ts';
import {KitPicker} from './Kits.tsx';
import {LaborCounter, MaterialPicker} from './Pickers.tsx';
import {Btn, KindBadge, NumberInput, Stepper, TextInput, useToast} from './ui.tsx';

export function copyJob(job: Job): Job {
  const now = Date.now();
  return {
    ...job,
    id: uid('j'),
    customer: job.customer + '（コピー）',
    places: job.places.map((p) => ({...p, id: uid('p'), rows: copyRows(p.rows)})),
    insuredNo: '',
    overhead: null,
    overheadTarget: null,
    createdAt: now,
    updatedAt: now,
  };
}

type Picker =
  | {placeId: string; kind: 'material'}
  // rowId があれば、その部材のすぐ下の手間（見積書の「同上施工費」）だけを数える
  | {placeId: string; kind: 'labor'; rowId: string | null}
  | {placeId: string; kind: 'kit'};

export function JobEditor({
  job,
  data,
  mode,
  update,
  onBack,
  onOpen,
  onPrint,
}: {
  job: Job;
  data: AppData;
  mode: AppMode;
  update: Update;
  onBack: () => void;
  onOpen: (id: string) => void;
  onPrint: (r: PrintRequest) => void;
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
  const estimate = mode === 'estimate';
  const totals = jobTotals(job, s);
  const est = estimateTotals(job, s);
  const form = jobForm(job, s);
  const photos = photoNumbers(job, s.estimateRate);

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
  const copyPlace = (place: Place) =>
    setJob((j) => {
      const i = j.places.findIndex((p) => p.id === place.id);
      // 写真番号は付け直す（同じ番号が2つにならないように）
      const c: Place = {...place, id: uid('p'), name: place.name + '（コピー）', rows: copyRows(place.rows), photo: 0};
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

  const addBlank = (place: Place, kind: 'material' | 'labor') => {
    const row = manualRow(kind);
    setPlace(place.id, (p) => ({...p, rows: [...p.rows, row]}));
    setFocusRowId(row.id);
  };
  const saveKit = (place: Place) => {
    const name = prompt('一式の名前（例：玄関 I型手すり一式）', `${place.name || '箇所'}の一式`);
    if (name === null || !name.trim()) return;
    update('kits', (list) => [...list, kitFromRows(name, place.rows)]);
    toast(`一式「${name.trim()}」を登録しました。ほかの箇所・様邸でも「＋ 一式から入れる」で使えます。`);
  };
  const removeKit = (kit: Kit) => {
    if (!confirm(`一式「${kit.name}」を削除します。すでに入れた様邸の行はそのまま残ります。よろしいですか？`)) return;
    update('kits', (list) => list.filter((k) => k.id !== kit.id));
  };

  const pickPlace = picker ? job.places.find((p) => p.id === picker.placeId) : undefined;
  const presets = data.settings.placePresets;
  const used = new Set(job.places.map((p) => p.name));
  // 候補から消した人が担当の様邸でも、その名前は選んだまま残す。名字だけで入っている様邸は、候補のフルネームにして見せる
  const staffList = data.settings.staffList;
  const staff = staffFull(job.staff, staffList);
  const staffOptions = !staff || staffList.includes(staff) ? staffList : [...staffList, staff];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 一覧へ戻る
        </Btn>
        <h1 className="text-lg font-bold text-[#0c315e]">{jobName(job)}</h1>
        {staff && <span className="text-sm font-bold text-slate-500">担当 {staff}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {estimate ? (
            <>
              <Btn color="sky" onClick={() => onPrint({kind: 'estimate', jobId: job.id})}>
                🖨 見積書を印刷
              </Btn>
              <Btn color="white" onClick={() => onPrint({kind: 'job', jobId: job.id})}>
                仕切り明細を印刷
              </Btn>
            </>
          ) : (
            <>
              <Btn color="sky" onClick={() => onPrint({kind: 'job', jobId: job.id})}>
                🖨 この様邸の明細を印刷
              </Btn>
              <Btn color="white" onClick={() => onPrint({kind: 'estimate', jobId: job.id})}>
                見積書を印刷
              </Btn>
            </>
          )}
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
                  value={staff}
                  onChange={(e) => setJob((j) => ({...j, staff: e.target.value}))}
                  className={`h-9 min-w-[6.5rem] rounded-md border px-2 text-sm ${
                    staff ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'
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
            {estimate && (
              <>
                <label className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">
                  見積書の書式
                  <select
                    value={job.form}
                    onChange={(e) => setJob((j) => ({...j, form: e.target.value as EstimateForm | ''}))}
                    className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                    aria-label="見積書の書式"
                  >
                    <option value="">住所の市町村で決める（今は {FORM_INFO[formForAddress(job.address) ?? s.estimateForm].name}）</option>
                    {FORM_IDS.map((f) => (
                      <option key={f} value={f}>
                        {FORM_INFO[f].name}「{FORM_INFO[f].title}」
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">
                  介護保険被保険者番号{form === 'kouiki' && <span className="font-normal text-slate-500">（みやこ町・築上町用の書式には出ません）</span>}
                  <TextInput value={job.insuredNo} onChange={(insuredNo) => setJob((j) => ({...j, insuredNo}))} placeholder="例：0000366989" inputMode="numeric" />
                </label>
              </>
            )}
          </section>

          {estimate && (
            <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-900">
              見積作成（{FORM_INFO[form].name}「{FORM_INFO[form].title}」）：部材の単価は <b>定価×{s.estimateRate}</b> で入ります（手で直せます）。
              手すりなどを切って使うときは「使う長さ」を入れると、数量が <b>使う長さ÷1本の長さ</b>（例：60cm÷4m＝0.15本）になります。
              取付手間は、部材のすぐ下に「<b>同上施工費</b>」として足し上げます（部材の「＋ この部材の施工費」で数えます）。
              金額は元の見積書と同じく1円未満を切り捨て、諸経費は小計×{num(s.estimateOverheadRate * 100)}%です。
            </p>
          )}

          {job.places.map((place, i) => (
            <PlaceCard
              key={place.id}
              place={place}
              first={i === 0}
              last={i === job.places.length - 1}
              presets={presets}
              mode={mode}
              rate={s.estimateRate}
              form={form}
              photo={photos.get(place.id) ?? 0}
              hourRate={s.estimateHourRate}
              onPlace={(patch) => setPlace(place.id, (p) => ({...p, ...patch}))}
              focusRowId={focusRowId}
              onRename={(name) => setPlace(place.id, (p) => ({...p, name}))}
              onRows={(rows) => setPlace(place.id, (p) => ({...p, rows}))}
              onMove={(d) => movePlace(place.id, d)}
              onCopy={() => copyPlace(place)}
              onRemove={() => removePlace(place)}
              onPickMaterial={() => setPicker({placeId: place.id, kind: 'material'})}
              onPickLabor={(rowId) => setPicker({placeId: place.id, kind: 'labor', rowId})}
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
          {estimate ? (
            <>
              <EstimateSummaryBox job={job} totals={est} settings={s} form={form} onOverhead={(patch) => setJob((j) => ({...j, ...patch}))} />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                見積書の金額です。部材は 定価×{s.estimateRate}×数量（切って使う部材の数量は 使う長さ÷1本の長さ）、施工費は取付手間の合計。
                小計に諸経費（{num(s.estimateOverheadRate * 100)}%）を足し、消費税をかけます。どれも1円未満は切り捨てです。
                諸経費は端数の調整などで金額を直せます（↺で小計×{num(s.estimateOverheadRate * 100)}%に戻ります）。
              </p>
            </>
          ) : (
            <>
              <SummaryBox totals={totals} settings={s} />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                ①〜⑦は元の「仕切り計算表」と同じ式です。③④⑤は1円単位にしてから足しているので、表の数字は縦にも横にも合います。
              </p>
            </>
          )}
        </aside>
      </div>

      {picker && pickPlace && picker.kind === 'material' && (
        <MaterialPicker
          place={pickPlace}
          materials={data.materials}
          mode={mode}
          rate={s.estimateRate}
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
        <LaborPickerFor place={pickPlace} rowId={picker.rowId} data={data} onRows={(rows) => setPlace(pickPlace.id, (p) => ({...p, rows}))} onClose={() => setPicker(null)} />
      )}
      {picker && pickPlace && picker.kind === 'kit' && (
        <KitPicker
          kits={data.kits}
          materials={data.materials}
          labor={data.labor}
          mode={mode}
          rate={s.estimateRate}
          placeName={pickPlace.name}
          onInsert={(rows) => {
            setPlace(pickPlace.id, (p) => ({...p, rows: [...p.rows, ...rows]}));
            setPicker(null);
            toast(`一式の${rows.length}行を「${pickPlace.name || '箇所'}」に入れました`);
          }}
          onRename={(id, name) => update('kits', (list) => list.map((k) => (k.id === id ? {...k, name, updatedAt: Date.now()} : k)))}
          onRemove={removeKit}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/** 取付手間を数える画面を、箇所全体（rowId なし）か、ある部材の施工費（rowId の部材のすぐ下の手間）に向けて開く */
function LaborPickerFor({
  place,
  rowId,
  data,
  onRows,
  onClose,
}: {
  place: Place;
  rowId: string | null;
  data: AppData;
  onRows: (rows: Row[]) => void;
  onClose: () => void;
}) {
  const rows = place.rows;
  const at = rowId ? rows.findIndex((r) => r.id === rowId) : -1;
  const range: [number, number] = at >= 0 ? workRange(rows, at) : [0, rows.length];
  const target = at >= 0 ? rows[at] : null;
  return (
    <LaborCounter
      title={target ? `「${target.name || '部材'}」の施工費（見積書の「同上施工費」）` : `「${place.name || '箇所'}」の取付手間`}
      rows={rows.slice(range[0], range[1])}
      labor={data.labor}
      onChange={(next) => onRows(replaceRange(rows, range, next))}
      onClose={onClose}
    />
  );
}

function PlaceCard({
  place,
  first,
  last,
  presets,
  mode,
  rate,
  form,
  photo,
  hourRate,
  onPlace,
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
  mode: AppMode;
  rate: number;
  form: EstimateForm;
  photo: number; // 見積書の写真番号（入れていなければ自動の番号）
  hourRate: number;
  onPlace: (patch: Partial<Pick<Place, 'kind' | 'photo' | 'work'>>) => void;
  focusRowId: string | null;
  onRename: (name: string) => void;
  onRows: (rows: Row[]) => void;
  onMove: (delta: number) => void;
  onCopy: () => void;
  onRemove: () => void;
  onPickMaterial: () => void;
  onPickLabor: (rowId: string | null) => void;
  onPickKit: () => void;
  onSaveKit: () => void;
  onAddBlank: (kind: 'material' | 'labor') => void;
}) {
  const estimate = mode === 'estimate';
  const t = placeTotals(place);
  const lines = estimatePlaceLines(place, rate);
  const estMaterial = lines.reduce((n, l) => (l.kind === 'material' ? n + l.amount : n), 0);
  const estWork = lines.reduce((n, l) => (l.kind === 'work' ? n + l.amount : n), 0);
  // 見積：手間の行がどの「同上施工費」に入るか（まとまりの最後の行のうしろに小計を出す）
  const workEnd = new Map<string, Extract<EstimateLine, {kind: 'work'}>>();
  for (const l of lines) if (l.kind === 'work') workEnd.set(l.rows[l.rows.length - 1].id, l);
  const listId = `places-${place.id}`;
  const setRow = (id: string, patch: Partial<Row>) => onRows(place.rows.map((r) => (r.id === id ? {...r, ...patch} : r)));
  const moveRow = (i: number, d: number) => {
    const k = i + d;
    if (k < 0 || k >= place.rows.length) return;
    const rows = [...place.rows];
    [rows[i], rows[k]] = [rows[k], rows[i]];
    onRows(rows);
  };
  const cols = estimate ? 8 : 6;

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
          {estimate ? (
            <>
              見積 部材 {yen(estMaterial)} ＋ 施工費 {yen(estWork)} ＝ <b className="text-base text-indigo-900">{yen(estMaterial + estWork)}円</b>
            </>
          ) : (
            <>
              部材 {yen(t.material)} ＋ 手間 {yen(t.labor)} ＝ <b className="text-base text-slate-900">{yen(t.total)}円</b>
            </>
          )}
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
      {estimate && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-slate-100 bg-indigo-50/40 px-4 py-2 text-xs font-bold text-slate-600">
          <label className="grid gap-1">
            改修の種類
            <select
              value={place.kind}
              onChange={(e) => onPlace({kind: Number(e.target.value)})}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal"
              aria-label="改修の種類"
            >
              {KINDS.map((k, i) => (
                <option key={k} value={i + 1}>
                  {circled(i + 1)}
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            写真番号
            <NumberInput
              value={place.photo}
              onChange={(n) => onPlace({photo: Math.max(0, Math.round(n))})}
              className="h-8 w-20 text-center font-normal"
              ariaLabel="写真番号"
              blankZero
              min={0}
              placeholder={photo > 0 ? `${circled(photo)}（自動）` : '自動'}
            />
          </label>
          <label className="grid min-w-[12rem] flex-1 gap-1">
            {form === 'kouiki' ? '改修箇所毎工事名称' : '改修内容'}（空なら改修の種類から）
            <TextInput value={place.work} onChange={(work) => onPlace({work})} placeholder={placeWork({...place, work: ''}, form)} className="h-8 font-normal" aria-label="工事名称" />
          </label>
        </div>
      )}

      {place.rows.length > 0 && (
        <div className="overflow-x-auto">
          {/* rows-table：スマホでは1行を縦に並べる（sasaoka.css） */}
          <table className={`rows-table w-full text-sm ${estimate ? 'estimate min-w-[980px]' : 'min-w-[720px]'}`}>
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="w-14 px-2 py-1.5 text-left">区分</th>
                <th className="px-2 py-1.5 text-left">品名</th>
                {estimate && <th className="w-28 px-2 py-1.5 pr-4 text-right">定価</th>}
                {estimate && <th className="w-36 px-2 py-1.5 pr-4 text-right">長さ（使う／1本）</th>}
                <th className="w-32 px-2 py-1.5 pr-4 text-right">{estimate ? '見積の単価' : '単価'}</th>
                <th className="w-36 px-2 py-1.5 text-center">数量・箇所</th>
                <th className="w-28 px-2 py-1.5 text-right">{estimate ? '見積金額' : '金額'}</th>
                <th className="w-20 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {place.rows.map((r, i) => {
                const isWork = estimate && r.kind === 'labor';
                const group = workEnd.get(r.id);
                return [
                  <tr key={r.id} className={`border-t border-slate-100 align-middle ${isWork ? 'bg-sky-50/40' : ''} ${estimate && r.kind === 'material' && r.excluded ? 'bg-slate-100/80' : ''}`}>
                    <td data-cell="kind" className={`px-2 py-1.5 ${isWork ? 'pl-5' : ''}`}>
                      <KindBadge kind={r.kind} label={estimate ? '施工費' : undefined} />
                    </td>
                    <td data-cell="name" className="px-2 py-1.5">
                      <input
                        value={r.name}
                        onChange={(e) => setRow(r.id, {name: e.target.value})}
                        placeholder={r.kind === 'labor' ? '（工事内容なし）' : '（品名なし）'}
                        className={`h-9 w-full rounded-md border border-slate-200 px-2 font-bold text-slate-800 hover:border-slate-300 focus:border-blue-500 ${
                          estimate ? 'min-w-[12rem]' : 'min-w-[14rem]'
                        }`}
                        aria-label="品名"
                      />
                      {(r.code || r.maker) && <div className="px-2 text-[11px] text-slate-500">{[r.maker, r.code].filter(Boolean).join('　')}</div>}
                      {estimate && r.kind === 'material' && (
                        <div className="flex flex-wrap items-center gap-x-2">
                          <button type="button" onClick={() => onPickLabor(r.id)} className="mt-0.5 rounded px-2 py-0.5 text-[11px] font-bold text-sky-700 hover:bg-sky-50">
                            ＋ この部材の施工費
                          </button>
                          <ExcludedToggle on={r.excluded} onChange={(excluded) => setRow(r.id, {excluded})} />
                        </div>
                      )}
                    </td>
                    {estimate && (
                      <td data-cell="list" data-label={r.kind === 'material' ? '定価' : undefined} className="px-2 py-1.5 text-right">
                        {r.kind === 'material' && (
                          <NumberInput value={r.listPrice} onChange={(listPrice) => setRow(r.id, {listPrice})} className="w-24" ariaLabel="定価" blankZero placeholder="定価" />
                        )}
                      </td>
                    )}
                    {estimate && (
                      <td data-cell="len" data-label={r.kind === 'material' ? '長さ（切って使うとき）' : undefined} className="px-2 py-1.5 text-right">
                        {r.kind === 'material' && (
                          <div className="grid justify-items-end gap-1 text-[11px] text-slate-500">
                            <label className="flex items-center gap-1">
                              使う
                              <NumberInput
                                value={r.lengthCm}
                                onChange={(lengthCm) => setRow(r.id, {lengthCm: Math.max(0, lengthCm)})}
                                className="w-16 text-sm"
                                ariaLabel="使う長さ（cm）"
                                blankZero
                                min={0}
                                placeholder="—"
                              />
                              cm
                            </label>
                            <label className="flex items-center gap-1">
                              1本
                              <NumberInput
                                value={r.pieceLengthM}
                                onChange={(pieceLengthM) => setRow(r.id, {pieceLengthM: Math.max(0, pieceLengthM)})}
                                className={`w-16 text-sm ${r.lengthCm > 0 && !(r.pieceLengthM > 0) ? 'border-amber-400 bg-amber-50' : ''}`}
                                ariaLabel="1本の長さ（m）"
                                blankZero
                                min={0}
                                placeholder="—"
                              />
                              m
                            </label>
                          </div>
                        )}
                      </td>
                    )}
                    <td data-cell="price" data-label={estimate && r.kind === 'material' ? '見積の単価' : '単価'} className="px-2 py-1.5 text-right">
                      {estimate && r.kind === 'material' ? (
                        <EstPriceCell row={r} rate={rate} autoFocus={r.id === focusRowId} onChange={(estPrice) => setRow(r.id, {estPrice})} />
                      ) : (
                        <NumberInput value={r.price} onChange={(price) => setRow(r.id, {price})} className="w-24" ariaLabel="単価" autoFocus={r.id === focusRowId} />
                      )}
                    </td>
                    <td data-cell="qty" data-label={estimate && r.lengthCm > 0 ? '本数（同じ長さのもの）' : '数量・箇所'} className="px-2 py-1.5 text-center">
                      <Stepper value={r.qty} onChange={(qty) => setRow(r.id, {qty})} ariaLabel={`${r.name || '金額だけの行'}の数量`} />
                      {estimate && cutToLength(r) && (
                        <div className="mt-0.5 text-[11px] font-bold tabular-nums text-indigo-800">
                          ＝ {num(estimateQty(r), 3)}本（{num(r.lengthCm)}cm÷{num(r.pieceLengthM)}m{r.qty !== 1 ? `×${num(r.qty)}` : ''}）
                        </div>
                      )}
                      {estimate && r.kind === 'material' && r.lengthCm > 0 && !(r.pieceLengthM > 0) && (
                        <div className="mt-0.5 text-[11px] font-bold text-amber-700">1本の長さを入れてください</div>
                      )}
                      {estimate && r.kind === 'material' && (
                        <label className="mt-1 flex items-center justify-center gap-1 text-[11px] text-slate-500">
                          単位
                          {cutToLength(r) ? (
                            <span className="font-bold text-slate-700">本</span>
                          ) : (
                            <input
                              value={r.unit}
                              onChange={(e) => setRow(r.id, {unit: e.target.value})}
                              placeholder="例：個"
                              className="h-7 w-14 rounded border border-slate-200 px-1 text-center text-xs text-slate-800"
                              aria-label="単位"
                            />
                          )}
                        </label>
                      )}
                    </td>
                    <td data-cell="amount" data-label={estimate ? '見積金額' : '金額'} className="px-2 py-1.5 text-right font-bold tabular-nums">
                      {yen(estimate ? estimateAmount(r, rate) : rowAmount(r))}
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
                  </tr>,
                  estimate && group && (
                    <tr key={`${r.id}-work`} className="work-sum border-t border-dashed border-sky-200 bg-sky-50/60 text-xs">
                      <td colSpan={cols - 2} className="px-2 py-1 text-right font-bold text-sky-900">
                        {!group.afterMaterial && (
                          <span className="mr-3 inline-block align-middle">
                            <ExcludedToggle
                              on={group.excluded}
                              onChange={(excluded) => onRows(place.rows.map((x) => (group.rows.some((g) => g.id === x.id) ? {...x, excluded} : x)))}
                            />
                          </span>
                        )}
                        {group.afterMaterial ? '同上施工費' : '施工費'}
                        {form === 'kouiki' && workHours(group.amount, hourRate) !== null && (
                          <span className="font-normal">（{num(workHours(group.amount, hourRate) ?? 0)}時間×{yen(hourRate)}円）</span>
                        )}
                        （見積書ではこの1行{group.afterMaterial && group.excluded ? '・部材と同じく介護保険の対象外' : ''}）
                      </td>
                      <td className="px-2 py-1 text-right text-sm font-bold tabular-nums text-sky-900">{yen(group.amount)}</td>
                      <td />
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Btn small color="emerald" onClick={onPickMaterial}>
          ＋ 部材を追加
        </Btn>
        <Btn small color="sky" onClick={() => onPickLabor(null)}>
          ＋ 取付手間（箇所数を数える）
        </Btn>
        <Btn small color="white" onClick={() => onAddBlank('material')}>
          ＋ 部材を金額だけ入れる
        </Btn>
        <Btn small color="white" onClick={() => onAddBlank('labor')}>
          ＋ 工事を金額だけ入れる
        </Btn>
        <Btn small color="white" onClick={onPickKit}>
          ＋ 一式から入れる
        </Btn>
        {place.rows.length > 0 && (
          <Btn small color="white" onClick={onSaveKit}>
            この箇所を一式に登録
          </Btn>
        )}
        {place.rows.length === 0 && <span className="text-xs text-slate-500">部材リストから部材を選び、取付手間を数えます。</span>}
      </div>
    </section>
  );
}

/** 見積の単価の欄。何も入れなければ 定価×掛率。手で入れたら黄色になり、↺ で自動に戻せる */
function EstPriceCell({row, rate, autoFocus, onChange}: {row: Row; rate: number; autoFocus: boolean; onChange: (v: number | null) => void}) {
  const auto = row.estPrice === null;
  const how = row.listPrice > 0 ? `定価×${rate}` : auto ? '定価がありません' : '';
  return (
    <div className="grid justify-items-end gap-0.5">
      <div className="flex items-center gap-1">
        {!auto && (
          <button type="button" onClick={() => onChange(null)} className="rounded px-1 text-sm text-amber-700 hover:bg-amber-100" title="定価×掛率に戻す" aria-label="見積の単価を自動に戻す">
            ↺
          </button>
        )}
        <NumberInput
          value={estimateUnitPrice(row, rate)}
          onChange={(n) => onChange(n)}
          className={`w-24 ${auto ? 'bg-indigo-50' : 'border-amber-400 bg-amber-50'}`}
          ariaLabel="見積の単価"
          autoFocus={autoFocus}
        />
      </div>
      <div className={`text-[10px] ${auto && row.listPrice <= 0 ? 'font-bold text-amber-700' : 'text-slate-500'}`}>{auto ? how : `手入力（${how || '定価なし'}）`}</div>
    </div>
  );
}

/** 介護保険の対象外にするチェック（見積書では「対象外」の欄に出す） */
function ExcludedToggle({on, onChange}: {on: boolean; onChange: (v: boolean) => void}) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold ${on ? 'bg-slate-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5" />
      介護保険の対象外
    </label>
  );
}

/** 見積書の諸経費の欄。何も入れなければ 小計×率。手で入れたら黄色になり、↺ で自動に戻せる（端数の調整など） */
function OverheadCell({value, auto, label, onChange}: {value: number | null; auto: number; label: string; onChange: (v: number | null) => void}) {
  const manual = value !== null;
  return (
    <div className="grid justify-items-end gap-0.5">
      <div className="flex items-center gap-1">
        {manual && (
          <button type="button" onClick={() => onChange(null)} className="rounded px-1 text-sm text-amber-700 hover:bg-amber-100" title="小計×率に戻す" aria-label={`${label}を自動に戻す`}>
            ↺
          </button>
        )}
        <NumberInput
          value={value ?? auto}
          onChange={(n) => onChange(Math.round(n))}
          className={`w-24 ${manual ? 'border-amber-400 bg-amber-50' : 'bg-indigo-50'}`}
          ariaLabel={label}
        />
      </div>
      {manual && <div className="text-[10px] font-bold text-amber-700">手入力（自動なら {yen(auto)}）</div>}
    </div>
  );
}

export function EstimateSummaryBox({
  job,
  totals: t,
  settings: s,
  form,
  onOverhead,
}: {
  job: Pick<Job, 'overhead' | 'overheadTarget'>;
  totals: EstimateTotals;
  settings: Settings;
  form: EstimateForm;
  onOverhead: (patch: Partial<Pick<Job, 'overhead' | 'overheadTarget'>>) => void;
}) {
  const pctOf = (r: number) => `${num(Math.round(r * 1000) / 10)}%`;
  const split = t.excluded !== 0;
  const line = (label: string, value: number, target: number | null, strong: boolean) => (
    <tr key={label} className="border-b border-indigo-200 last:border-b-0">
      <td className={`px-3 py-2 ${strong ? 'bg-indigo-50 font-bold' : ''}`}>{label}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${strong ? 'text-base font-bold' : ''}`}>{yen(value)}</td>
      {split && <td className={`px-3 py-2 text-right tabular-nums ${strong ? 'font-bold' : ''}`}>{target === null ? '' : yen(target)}</td>}
    </tr>
  );
  return (
    <div className="overflow-hidden rounded-xl border-2 border-indigo-900 bg-white">
      <div className="bg-indigo-900 px-3 py-1.5 text-sm font-bold text-white">
        見積書の金額
        <span className="ml-1 text-xs font-normal text-indigo-100">（{FORM_INFO[form].name}）</span>
      </div>
      <table className="w-full text-sm">
        {split && (
          <thead className="bg-indigo-50 text-[11px] text-indigo-900">
            <tr>
              <th />
              <th className="px-3 py-1 text-right">全体</th>
              <th className="px-3 py-1 text-right">介護保険の対象</th>
            </tr>
          </thead>
        )}
        <tbody>
          {line(`部材（定価×${s.estimateRate}）`, t.material, null, false)}
          {line('施工費', t.work, null, false)}
          {line('小計', t.all.subtotal, t.target.subtotal, true)}
          <tr className="border-b border-indigo-200">
            <td className="px-3 py-2">諸経費（{pctOf(s.estimateOverheadRate)}）</td>
            <td className="px-2 py-1.5 text-right">
              <OverheadCell value={job.overhead} auto={overheadAuto(t.all.subtotal, s)} label="諸経費" onChange={(overhead) => onOverhead({overhead})} />
            </td>
            {split && (
              <td className="px-2 py-1.5 text-right">
                <OverheadCell
                  value={job.overheadTarget}
                  auto={overheadAuto(t.target.subtotal, s)}
                  label="介護保険の対象の諸経費"
                  onChange={(overheadTarget) => onOverhead({overheadTarget})}
                />
              </td>
            )}
          </tr>
          {line(`消費税（${pctOf(s.taxRate)}）`, t.all.tax, t.target.tax, false)}
          {line('合計', t.all.total, t.target.total, true)}
        </tbody>
      </table>
      {split && <div className="border-t border-indigo-200 px-3 py-1.5 text-xs text-slate-600">介護保険の対象外：{yen(t.excluded)}円（小計）</div>}
    </div>
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

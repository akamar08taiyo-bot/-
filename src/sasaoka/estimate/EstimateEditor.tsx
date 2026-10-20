import {useState} from 'react';
import {jobName, jobTotals} from '../calc.ts';
import {EstimateSheet} from '../components/EstimateSheet.tsx';
import {LaborPickerFor, missingShikiri, ShikiriPriceDialog} from '../components/JobTools.tsx';
import {KitPicker} from '../components/Kits.tsx';
import {MaterialPicker} from '../components/Pickers.tsx';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {FORM_IDS, FORM_INFO, formForAddress, jobForm} from '../estimateForms.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {addMaterial, newPlace as makePlace, removeOneMaterial} from '../rows.ts';
import type {AppData, EstimateForm, Job, Kit, Material, NameSuffix, Place} from '../types.ts';
import type {Update} from '../useStore.ts';
import {monthLabel, staffFull, thisMonth, yen} from '../util.ts';
import {duplicateEstimate, removeEstimate} from './EstimateList.tsx';

type Picker =
  | {placeId: string; kind: 'material'}
  // rowId の部材のすぐ下の手間（見積書の「同上施工費」）だけを数える
  | {placeId: string; kind: 'labor'; rowId: string | null}
  | {placeId: string; kind: 'kit'};

export function EstimateEditor({
  job,
  data,
  update,
  onBack,
  onOpen,
  onOpenInvoice,
  onPrint,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  onOpen: (id: string) => void;
  onOpenInvoice: (id: string) => void; // 「請求書を確認する」で同じ様邸の仕切り計算表を開く
  onPrint: (r: PrintRequest) => void;
}) {
  const toast = useToast();
  const s = data.settings;
  const form = jobForm(job, s);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [fixPrices, setFixPrices] = useState(false);

  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setPlace = (placeId: string, fn: (p: Place) => Place) =>
    setJob((j) => ({
      ...j,
      places: j.places.map((p) => (p.id === placeId ? fn(p) : p)),
    }));
  /** 箇所を選んでいないとき（いちばん下の行）は、新しい箇所を作ってそこに入れる */
  const placeFor = (placeId: string | null): string => {
    if (placeId) return placeId;
    const p = makePlace('');
    setJob((j) => ({...j, places: [...j.places, p]}));
    return p.id;
  };

  const name = job.customer.trim() ? jobName(job) : '新しい見積書';
  const removeJob = () => {
    if (removeEstimate(job, name, update, toast)) onBack();
  };
  const duplicate = () => onOpen(duplicateEstimate(job, update, toast).id);

  const toggleFavorite = (id: string) => update('materials', (list) => list.map((m) => (m.id === id ? {...m, favorite: !m.favorite} : m)));
  const addToMaster = (m: Material) => update('materials', (list) => [...list, m]);
  const removeKit = (kit: Kit) => {
    if (!confirm(`一式「${kit.name}」を削除します。すでに入れた見積書の行はそのまま残ります。よろしいですか？`)) return;
    update('kits', (list) => list.filter((k) => k.id !== kit.id));
  };

  // 候補から消した人が担当の見積書でも、その名前は選んだまま残す。名字だけで入っているものは、候補のフルネームにして見せる
  const staffList = s.staffList;
  const staff = staffFull(job.staff, staffList);
  const staffOptions = !staff || staffList.includes(staff) ? staffList : [...staffList, staff];
  const pickPlace = picker ? job.places.find((p) => p.id === picker.placeId) : undefined;
  // 工事場所の市町村の書式と違うときは知らせる（打っている途中で書式が勝手に変わらないように、変えるのはボタンで）
  const byAddress = formForAddress(job.address);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 一覧へ戻る
        </Btn>
        <h1 className="text-lg font-bold text-[#14532d]">{name}</h1>
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
          {FORM_INFO[form].name}「{FORM_INFO[form].title}」
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn color="sky" onClick={() => onPrint({kind: 'estimate', jobId: job.id})}>
            🖨 見積書を印刷
          </Btn>
          <Btn color="white" onClick={duplicate}>
            複製
          </Btn>
          <Btn color="rose" onClick={removeJob}>
            削除
          </Btn>
        </div>
      </div>

      {/* 見積書の欄にないものだけ（苅田町・行橋市・みやこ町用は、お客様名・被保険者番号・工事場所・作成日を見積書の欄に打ち込む） */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {form === 'kouiki' && (
          <>
            <label className="grid min-w-[14rem] flex-[2_1_0%] gap-1 text-xs font-bold text-slate-600">
              お客様名（この書式には出ません。一覧と印刷のファイル名に使います）
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
                  onChange={(e) =>
                    setJob((j) => ({
                      ...j,
                      suffix: e.target.value as NameSuffix,
                    }))
                  }
                  className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                  aria-label="敬称"
                >
                  <option value="様邸">様邸</option>
                  <option value="様">様</option>
                  <option value="">（付けない）</option>
                </select>
              </div>
            </label>
            <label className="grid min-w-[14rem] flex-[2_1_0%] gap-1 text-xs font-bold text-slate-600">
              工事場所（住所）
              <TextInput
                value={job.address}
                onChange={(address) => setJob((j) => ({...j, address}))}
                className="w-full min-w-0 text-sm font-normal text-slate-800"
                aria-label="住所"
              />
            </label>
          </>
        )}
        <label className="grid min-w-[12rem] gap-1 text-xs font-bold text-slate-600">
          見積書の書式
          <select
            value={form}
            onChange={(e) => setJob((j) => ({...j, form: e.target.value as EstimateForm}))}
            className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm"
            aria-label="見積書の書式"
          >
            {FORM_IDS.map((f) => (
              <option key={f} value={f}>
                {FORM_INFO[f].name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          担当
          <select
            value={staff}
            onChange={(e) => setJob((j) => ({...j, staff: e.target.value}))}
            className={`h-9 min-w-[8rem] rounded-md border px-2 text-sm ${staff ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
          >
            <option value="">（選ぶ）</option>
            {staffOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {form === 'yukuhashi' && (
          <p className="min-w-[16rem] flex-1 pb-1 text-[11px] leading-4 text-slate-500">
            お客様名・介護保険被保険者番号・工事場所（住所）・作成日は、下の見積書の欄に直接打ち込みます。
          </p>
        )}
        {byAddress && byAddress !== form && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
            工事場所の市町村は「{FORM_INFO[byAddress].name}」の書式です。
            <Btn small color="white" onClick={() => setJob((j) => ({...j, form: byAddress}))}>
              {FORM_INFO[byAddress].name}にする
            </Btn>
          </div>
        )}
      </section>

      {/* 笹岡工務店の請求書に入る金額は、見積書に打ち込むとすぐ変わる（見積書の上に出して、打ちながら見えるように） */}
      <ShikiriPanel job={job} data={data} setJob={setJob} onFix={() => setFixPrices(true)} onOpenInvoice={() => onOpenInvoice(job.id)} />

      <EstimateSheet
        job={job}
        settings={s}
        form={form}
        materials={data.materials}
        setJob={setJob}
        onPickMaterial={(placeId) => setPicker({placeId: placeFor(placeId), kind: 'material'})}
        onPickLabor={(placeId, rowId) => setPicker({placeId: placeFor(placeId), kind: 'labor', rowId})}
        onPickKit={(placeId) => setPicker({placeId: placeFor(placeId), kind: 'kit'})}
        onPrint={() => onPrint({kind: 'estimate', jobId: job.id})}
      />

      {fixPrices && <ShikiriPriceDialog job={job} materials={data.materials} setJob={setJob} update={update} onClose={() => setFixPrices(false)} />}
      {picker && pickPlace && picker.kind === 'material' && (
        <MaterialPicker
          place={pickPlace}
          materials={data.materials}
          mode="estimate"
          rate={s.estimateRate}
          onAdd={(row) => setPlace(pickPlace.id, (p) => ({...p, rows: addMaterial(p.rows, row)}))}
          onRemoveOne={(refId) => setPlace(pickPlace.id, (p) => ({...p, rows: removeOneMaterial(p.rows, refId)}))}
          onToggleFavorite={toggleFavorite}
          onAddToMaster={addToMaster}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && pickPlace && picker.kind === 'labor' && (
        <LaborPickerFor
          place={pickPlace}
          rowId={picker.rowId}
          data={data}
          onRows={(rows) => setPlace(pickPlace.id, (p) => ({...p, rows}))}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && pickPlace && picker.kind === 'kit' && (
        <KitPicker
          kits={data.kits}
          materials={data.materials}
          labor={data.labor}
          mode="estimate"
          rate={s.estimateRate}
          placeName={pickPlace.name}
          onInsert={(rows) => {
            setPlace(pickPlace.id, (p) => ({
              ...p,
              rows: [...p.rows, ...rows],
            }));
            setPicker(null);
            toast(`一式の${rows.length}行を「${pickPlace.name || '箇所'}」に入れました`);
          }}
          onRename={(id, n) => update('kits', (list) => list.map((k) => (k.id === id ? {...k, name: n, updatedAt: Date.now()} : k)))}
          onRemove={removeKit}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/**
 * 笹岡工務店の請求書：選ぶと、この見積書の部材（仕切価格）と施工費が、仕切り計算・請求書作成アプリの仕切り計算表と請求書（請求する月の分）に入る。
 * 見積書と同じ入力から作るので、入れ直さなくてよい（見積書を直すと請求書も変わる）
 */
function ShikiriPanel({
  job,
  data,
  setJob,
  onFix,
  onOpenInvoice,
}: {
  job: Job;
  data: AppData;
  setJob: (fn: (j: Job) => Job) => void;
  onFix: () => void;
  onOpenInvoice: () => void;
}) {
  const t = jobTotals(job, data.settings);
  const missing = missingShikiri(job);
  const client = data.settings.clientName || '笹岡工務店';
  return (
    <section
      className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${job.shikiri ? 'border-[#0c315e]/40 bg-white' : 'border-slate-200 bg-white'}`}
      aria-label={`${client}の請求書`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex cursor-pointer items-center gap-2 font-bold text-[#0c315e]">
          <input
            type="checkbox"
            checked={job.shikiri}
            onChange={(e) => {
              const on = e.target.checked;
              // 前の月に作った見積書を入れるときは、今月の請求書に入れる（あとで月は直せる）
              setJob((j) => ({
                ...j,
                shikiri: on,
                month: on && j.month < thisMonth() ? thisMonth() : j.month,
              }));
            }}
            className="h-4 w-4"
          />
          {client}の請求書に入れる
        </label>
        {job.shikiri ? (
          <>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
              請求する月
              <input
                type="month"
                value={job.month}
                onChange={(e) => e.target.value && setJob((j) => ({...j, month: e.target.value}))}
                className="h-8 rounded-md border border-slate-300 px-2 text-sm font-normal"
                aria-label="請求する月"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
              施工日
              <input
                type="date"
                value={job.date}
                onChange={(e) => setJob((j) => ({...j, date: e.target.value}))}
                className="h-8 rounded-md border border-slate-300 px-2 text-sm font-normal"
                aria-label="施工日"
              />
            </label>
            <Btn small color="white" className="ml-auto" onClick={onOpenInvoice}>
              🧾 請求書（仕切り計算表）で見る →
            </Btn>
          </>
        ) : (
          <span className="text-xs text-slate-500">
            この見積書は{client}の請求書に入れていません（{client}の工事でないとき）。チェックを入れると、部材（仕切価格）と施工費が
            「請求書を確認する」の仕切り計算表と請求書に入り、自動で計算されます。
          </span>
        )}
      </div>
      {job.shikiri && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
            <span className="text-xs text-slate-500">{monthLabel(job.month)}分の請求書に入る金額：</span>
            <span className="tabular-nums">①部材代（仕切価格） {yen(t.material)}</span>
            <span className="tabular-nums">②取付手間 {yen(t.labor)}</span>
            <span className="tabular-nums">⑦税抜合計 {yen(t.subtotal)}</span>
            <span className="tabular-nums">
              ⑥合計 <b>{yen(t.total)}</b>円
            </span>
          </div>
          {missing.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              仕切価格が入っていない部材が {missing.length} 行あります（請求書では、その部材代が0円になります）。
              <Btn small color="white" onClick={onFix}>
                仕切価格を入れる
              </Btn>
            </div>
          )}
        </>
      )}
    </section>
  );
}

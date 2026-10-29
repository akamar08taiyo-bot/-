import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {hasEstimateRows, jobName, startEstimate} from '../calc.ts';
import {JobHeader, JobTitle, RemoveJobButton} from './JobHeader.tsx';
import {EstimateSheet} from '../components/EstimateSheet.tsx';
import {LaborPickerFor, missingShikiri, ShikiriPriceDialog} from '../components/JobTools.tsx';
import {KitPicker} from '../components/Kits.tsx';
import {MaterialPicker} from '../components/Pickers.tsx';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {FORM_INFO, INSURER_IDS, INSURER_INFO, insurerForAddress, jobForm, jobInsurer, NO_SHINSEI} from '../estimateForms.ts';
import {CARE_RED, careLines, showsCareLines} from '../careLines.ts';
import {BurdenPicker} from './ShinseiEditor.tsx';
import {estimateDateOf} from '../print/docMeta.ts';
import type {PrintRequest} from '../print/PrintView.tsx';
import {fillAdded, withBrackets} from '../cutLink.ts';
import {addMaterial, insertRowsAt, newPlace as makePlace, removeOneMaterial} from '../rows.ts';
import {jutakuSalesMonth, withBillMonth, withSalesMonth} from '../salesPlan.ts';
import type {AppData, Insurer, Job, Kit, Material, NameSuffix, Place, ShinseiInfo} from '../types.ts';
import type {Update} from '../useStore.ts';
import {staffFull, thisMonth, todayIso} from '../util.ts';
import {duplicateEstimate, saveEstimateExcel} from './EstimateList.tsx';
import {UriageDialog} from './UriageDialog.tsx';

// at：見積書で選んでいた（タップしていた）行。部材・部材＋施工費（常用）はそこに入れる（`insertRowsAt`）
type Picker =
  | {placeId: string; kind: 'material'; at: string | null}
  // rowId：見積書で選んでいた行。施工費はそこに入れる（部材ならその同上施工費、空白の行ならその行。`laborSpot`）
  | {placeId: string; kind: 'labor'; rowId: string | null}
  | {placeId: string; kind: 'kit'; at: string | null};

export function EstimateEditor({
  job,
  data,
  update,
  onBack,
  onOpen,
  onOpenInvoice,
  onOpenOrder,
  tabs,
  batch,
  onPrint,
  onSave,
  onManageKits,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  onOpen: (id: string) => void;
  onOpenInvoice: (id: string) => void; // 「工務店請求書を確認する」で同じ様邸の仕切り計算表を開く
  onOpenOrder: () => void; // この見積書の部材の発注書を開く
  tabs: ReactNode; // 申請書・見積書のタブ（氏名・番号・住所・改修の箇所・金額は申請書と同じ）
  batch?: ReactNode; // 「📦 まとめて保存」（保存・Excel・印刷と並べる。App.tsx の BatchSave）
  onPrint: (r: PrintRequest) => void;
  onSave: () => Promise<boolean>; // まだ保存していない変更をすぐ保存する（保存できたら true）
  onManageKits?: () => void; // 部材・施工費マスタの「部材＋施工費（常用）」を開く
}) {
  const toast = useToast();
  const s = data.settings;
  const form = jobForm(job, s);
  const insurer = jobInsurer(job);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [fixPrices, setFixPrices] = useState(false);
  const [uriageOpen, setUriageOpen] = useState(false);

  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? startEstimate(j, {...fn(j), updatedAt: Date.now()}) : j)));
  // 負担割合・生活保護（申請書の項目。住宅改修申請書のタブ・特定福祉用具と同じ値）
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const setInfo = (patch: Partial<ShinseiInfo>) => setJob((j) => ({...j, shinsei: {...NO_SHINSEI, ...j.shinsei, ...patch}}));
  const care = careLines(job, s);
  const setPlace = (placeId: string, fn: (p: Place) => Place) =>
    setJob((j) => ({
      ...j,
      places: j.places.map((p) => (p.id === placeId ? fn(p) : p)),
    }));
  /**
   * 箇所がまだないとき（null）だけ、新しい箇所を作ってそこに入れる。箇所があれば見積書が入れる箇所を決めて渡す（`toolPlace`。
   * 前は欄を選んでいないと新しい箇所を作り、上の部材と同じ箇所に入れたい施工費が②になった）
   */
  const created = useRef<string | null>(null);
  const placeFor = (placeId: string | null): string => {
    if (placeId) return placeId;
    const p = makePlace('');
    created.current = p.id;
    setJob((j) => ({...j, places: [...j.places, p]}));
    return p.id;
  };
  // 作った箇所に何も入れずに閉じたら、その箇所は消す（空の箇所を残すと、いちばん下の行がその箇所になる）
  const closePicker = () => {
    const id = created.current;
    created.current = null;
    setPicker(null);
    const unused = (p: Place) => p.id === id && p.rows.length === 0 && !p.name.trim();
    if (id && job.places.some(unused)) setJob((j) => ({...j, places: j.places.filter((p) => !unused(p))}));
  };

  const name = job.customer.trim() ? jobName(job) : '新しい見積書';
  // 発注書・笹岡工務店の請求書は、見積書を作ったとき（行を入れたとき）だけ（ユーザーの指示「見積もりを作成した時のみ、その利用者の請求書…発注書の作成をできるように」。
  // 申請書だけの様邸＝ほかの工務店の工事は、見積書が向こうから来るので、ここでは作らない）
  const estimated = hasEstimateRows(job);
  // 保存：打ち込むたびに自動で保存しているが、ボタン（と Ctrl+S）でもすぐ保存できる。
  // 見積書の欄に打ち込んでいる途中なら、欄から離れて値を入れてから保存する
  const save = () => {
    const el = document.activeElement as HTMLElement | null;
    el?.blur?.();
    window.setTimeout(() => {
      if (el?.matches('textarea, input')) el.focus({preventScroll: true}); // Ctrl+S のあとも続けて打ち込めるように
      void onSave().then((ok) => {
        if (ok) toast('保存しました');
        else toast('保存できませんでした。画面の上の表示を見てください。', 'error');
      });
    }, 0);
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault(); // ブラウザの「ページを保存」ではなく、見積書を保存する
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // 白紙に戻すは外した（ユーザーの指示「削除（白紙に戻すは不要）」2026-10-28）
  const duplicate = () => onOpen(duplicateEstimate(job, update, toast).id);

  const toggleFavorite = (id: string) => update('materials', (list) => list.map((m) => (m.id === id ? {...m, favorite: !m.favorite} : m)));
  const addToMaster = (m: Material) => update('materials', (list) => [...list, m]);
  const removeKit = (kit: Kit) => {
    if (!confirm(`部材＋施工費（常用）「${kit.name}」を削除します。すでに入れた見積書の行はそのまま残ります。よろしいですか？`)) return;
    update('kits', (list) => list.filter((k) => k.id !== kit.id));
  };

  // 候補から消した人が担当の見積書でも、その名前は選んだまま残す。名字だけで入っているものは、候補のフルネームにして見せる
  const staffList = s.staffList;
  const staff = staffFull(job.staff, staffList);
  const staffOptions = !staff || staffList.includes(staff) ? staffList : [...staffList, staff];
  const pickPlace = picker ? job.places.find((p) => p.id === picker.placeId) : undefined;
  // 保険者を選ぶと、見積書の書式も決まる（苅田町・行橋市・みやこ町は同じ書式、広域連合は広域連合用）
  const setInsurer = (i: Insurer) => setJob((j) => ({...j, insurer: i, form: INSURER_INFO[i].form}));
  // 工事場所の市町村が保険者と違うときは知らせる（打っている途中で勝手に変わらないように、変えるのはボタンで）
  const byAddress = insurerForAddress(job.address);

  // 保険者・担当・作成日・請求書の行。見積書の枠の中の「部材リストから入れる」などの行のすぐ下に出す（EstimateSheet の between）
  const settingsRow = (
    <>
      {/* 見積書の欄にないものだけ（苅田町・行橋市・みやこ町用は、お客様名・被保険者番号・工事場所・作成日を見積書の欄に打ち込む）。
          説明の文は置かない（ユーザーの指示）。笹岡工務店の請求書に入れるかも同じ枠に並べる。
          欄・文字はほかの画面より大きめ（ユーザーの指示「ここの部分はもう少し大きくする」、2026-10-21） */}
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-4 py-3" role="group" aria-label="保険者・担当・作成日・請求書">
        {form === 'kouiki' && (
          <>
            <label className="grid min-w-[14rem] flex-[2_1_0%] gap-1 text-sm font-bold text-slate-600">
              お客様名
              <div className="flex gap-2">
                <TextInput
                  value={job.customer}
                  onChange={(customer) => setJob((j) => ({...j, customer}))}
                  placeholder="例：山田"
                  className="!h-11 w-0 min-w-0 flex-1 text-base font-bold"
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
                  className="h-11 rounded-md border border-slate-300 px-2 text-base"
                  aria-label="敬称"
                >
                  <option value="様邸">様邸</option>
                  <option value="様">様</option>
                  <option value="">（付けない）</option>
                </select>
              </div>
            </label>
            <label className="grid min-w-[14rem] flex-[2_1_0%] gap-1 text-sm font-bold text-slate-600">
              工事場所（住所）
              <TextInput
                value={job.address}
                onChange={(address) => setJob((j) => ({...j, address}))}
                className="!h-11 w-full min-w-0 text-base font-normal text-slate-800"
                aria-label="住所"
              />
            </label>
          </>
        )}
        <label className="grid min-w-[10rem] gap-1 text-sm font-bold text-slate-600">
          保険者
          <select
            value={insurer}
            onChange={(e) => e.target.value && setInsurer(e.target.value as Insurer)}
            className={`h-11 w-full min-w-0 rounded-md border px-2 text-base ${insurer ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
            aria-label="保険者"
          >
            {!insurer && <option value="">（選ぶ）</option>}
            {INSURER_IDS.map((i) => (
              <option key={i} value={i}>
                {INSURER_INFO[i].name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold text-slate-600">
          担当
          <select
            value={staff}
            onChange={(e) => setJob((j) => ({...j, staff: e.target.value}))}
            className={`h-11 min-w-[9rem] rounded-md border px-2 text-base ${staff ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
          >
            <option value="">（選ぶ）</option>
            {staffOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold text-slate-600">
          見積もり作成日
          <input
            type="date"
            value={estimateDateOf(job)}
            onChange={(e) => setJob((j) => ({...j, estDate: e.target.value || todayIso()}))} // 消したら当日
            className="h-11 rounded-md border border-slate-300 px-2 text-base font-normal"
            aria-label="見積もり作成日"
          />
        </label>
        {/* 負担割合（住宅改修申請書のタブ・特定福祉用具と同じ値）と「自己負担額を表示」：見積書の明細の下に介護保険の内訳（介護保険の対象・利用者負担＝赤字・保険者負担）を書くか
            （ユーザーの指示「工事見積書にも販売見積書と同様に記載する。記載する、記載しないは販売見積もりと同様に選択できるようにする」2026-10-28。初めは書く。careLines.ts） */}
        <div className="grid gap-1 text-sm font-bold text-slate-600" role="group" aria-label="負担割合・自己負担額">
          負担割合
          <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 font-normal">
            <BurdenPicker info={info} setInfo={setInfo} />
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={showsCareLines(job)} onChange={(e) => setJob((j) => ({...j, showSelfPay: e.target.checked ? undefined : false}))} />
              自己負担額を表示
            </label>
            {showsCareLines(job) && care.red >= 0 && (
              <span className="tabular-nums" style={{color: CARE_RED}}>
                {care.lines[care.red]}
              </span>
            )}
          </div>
        </div>
        {(estimated || job.shikiri) && <ShikiriFields job={job} data={data} setJob={setJob} onFix={() => setFixPrices(true)} onOpenInvoice={() => onOpenInvoice(job.id)} />}
        {byAddress && byAddress !== insurer && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">
            工事場所の住所は「{INSURER_INFO[byAddress].name}」です{INSURER_INFO[byAddress].form !== form ? `（見積書は${FORM_INFO[INSURER_INFO[byAddress].form].name}）` : ''}。
            <Btn small color="white" onClick={() => setInsurer(byAddress)}>
              保険者を{INSURER_INFO[byAddress].name}にする
            </Btn>
          </div>
        )}
      </div>

    </>
  );

  return (
    <div className="space-y-3">
      {/* 上の段はどのタブでも同じ形（JobHeader.tsx）：2段目は 見積書をExcelで保存・見積書を印刷・削除、3段目は まとめて保存・保存・売上伝票依頼書・発注書を作成・複製
          （ユーザーの指示「基本的な並びは、申請書をEXCELで保存、申請書（見積書を印刷）、削除（白紙に戻すは不要）それ以外の独自の機能（例えば、売上伝票発行依頼書や
          発注書を作成、カタログを印刷など）は行を変えて、真下に統一して設置する」2026-10-28）。複製は一度外したが「やはり残してください」2026-10-26 で戻した。
          名前の横は保険者だけ（「苅田町「工事費見積書兼工事費内訳書」」の書式の名前は「この部分の説明は不要」2026-10-27）。
          介護保険証の欄とカタログのボタン（CardFill）は出さない（ユーザーの指示「工事費見積書作成のときは、このカタログ部分や介護保険証貼り付け部分は不要なのでなくす」2026-10-27） */}
      <JobHeader
        onBack={onBack}
        tabs={tabs}
        title={<JobTitle name={name} badge={insurer ? INSURER_INFO[insurer].name : FORM_INFO[form].name} />}
        primary={
          <>
            <Btn color="softGreen" onClick={() => saveEstimateExcel(job, s, toast)}>
              <span>📗 見積書を<span className="whitespace-nowrap">Excelで保存</span></span>
            </Btn>
            <Btn color="softSky" onClick={() => onPrint({kind: 'estimate', jobId: job.id})}>
              🖨 見積書を印刷
            </Btn>
          </>
        }
        remove={(className) => <RemoveJobButton job={job} settings={s} update={update} onBack={onBack} className={className} />}
        secondary={
          <>
            {batch}
            <Btn color="softBlue" onClick={save}>
              💾 保存
            </Btn>
            {/* 売上伝票発行依頼書（足りない所は窓で入れてから開く。UriageDialog.tsx）。名前は「売上伝票依頼書」（ユーザーの指示「売上伝票ではなく、売上伝票を依頼書に変更」2026-10-27） */}
            <Btn color="white" onClick={() => setUriageOpen(true)}>
              🧾 売上伝票依頼書
            </Btn>
            <Btn color="white" onClick={onOpenOrder} disabled={!estimated} title={estimated ? undefined : '見積書に部材を入れると作れます'}>
              🛒 発注書を作成
            </Btn>
            <Btn color="white" onClick={duplicate}>
              複製
            </Btn>
          </>
        }
      />

      <EstimateSheet
        job={job}
        settings={s}
        form={form}
        materials={data.materials}
        setJob={setJob}
        onPickMaterial={(placeId, rowId) => setPicker({placeId: placeFor(placeId), kind: 'material', at: placeId ? rowId : null})}
        onPickLabor={(placeId, rowId) => setPicker({placeId: placeFor(placeId), kind: 'labor', rowId})}
        onPickKit={(placeId, rowId) => setPicker({placeId: placeFor(placeId), kind: 'kit', at: placeId ? rowId : null})}
        onPrint={() => onPrint({kind: 'estimate', jobId: job.id})}
        between={settingsRow}
      />

      {fixPrices && <ShikiriPriceDialog job={job} materials={data.materials} setJob={setJob} update={update} onClose={() => setFixPrices(false)} />}
      {uriageOpen && <UriageDialog job={job} s={s} setJob={setJob} onClose={() => setUriageOpen(false)} />}
      {picker && pickPlace && picker.kind === 'material' && (
        <MaterialPicker
          place={pickPlace}
          materials={data.materials}
          mode="estimate"
          rates={s}
          onAdd={(row) => {
            const at = picker.at;
            // 長さの分かっている箇所に入れた手すり・ベースプレートは、その長さにする（`fillAdded`）。中間のブラケットの数も（`withBrackets`）
            setPlace(pickPlace.id, (p) => withBrackets(p, fillAdded({...p, rows: addMaterial(p.rows, row, at)}, new Set([row.id])), data.materials));
            // 続けて選んだ部材は、いま入れた行のすぐ下に（同じ部材なら数が増えるだけなので、そのまま）
            if (!pickPlace.rows.some((r) => r.kind === 'material' && r.refId === row.refId)) setPicker((pk) => (pk && pk.kind === 'material' ? {...pk, at: row.id} : pk));
          }}
          onRemoveOne={(refId) => setPlace(pickPlace.id, (p) => ({...p, rows: removeOneMaterial(p.rows, refId)}))}
          onToggleFavorite={toggleFavorite}
          onAddToMaster={addToMaster}
          onClose={closePicker}
        />
      )}
      {picker && pickPlace && picker.kind === 'labor' && (
        <LaborPickerFor
          place={pickPlace}
          rowId={picker.rowId}
          data={data}
          onRows={(rows) => setPlace(pickPlace.id, (p) => ({...p, rows}))}
          onClose={closePicker}
        />
      )}
      {picker && pickPlace && picker.kind === 'kit' && (
        <KitPicker
          kits={data.kits}
          materials={data.materials}
          labor={data.labor}
          mode="estimate"
          rates={s}
          placeName={pickPlace.name}
          onInsert={(rows) => {
            const at = picker.at;
            setPlace(pickPlace.id, (p) => withBrackets(p, fillAdded({...p, rows: insertRowsAt(p.rows, rows, at)}, new Set(rows.map((r) => r.id))), data.materials));
            created.current = null; // 行を入れたので、作った箇所は残す
            setPicker(null); // 入れた行は見積書に見えるので、お知らせは出さない（ユーザーの指示「行を消しましたという文言は不要」2026-10-26）
          }}
          onRename={(id, n) => update('kits', (list) => list.map((k) => (k.id === id ? {...k, name: n, updatedAt: Date.now()} : k)))}
          onRemove={removeKit}
          onManage={
            onManageKits &&
            (() => {
              closePicker();
              onManageKits();
            })
          }
          onClose={closePicker}
        />
      )}
    </div>
  );
}

/**
 * 笹岡工務店の請求書：選ぶと、この見積書の部材（仕切価格）と施工費が、仕切り計算・請求書作成アプリの仕切り計算表と請求書（請求する月の分）に入る。
 * 見積書と同じ入力から作るので、入れ直さなくてよい（見積書を直すと請求書も変わる）。
 * 入力の画面がごちゃごちゃしないように、請求書に入る金額や説明の文は出さない（ユーザーの指示。金額は「請求書を見る」で）。
 * 仕切価格が空欄の部材があるときだけ知らせる（請求書でその部材代が0円になるため）
 */
function ShikiriFields({
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
  const missing = missingShikiri(job);
  // 請求先は設定の名前（笹岡工務店に決め打ちしない。ユーザーの指示「笹岡工務店を使っているところ以外でも一緒にみんなが使えるように」2026-10-26）
  const client = data.settings.clientName || '工務店';
  return (
    <>
      <label className="inline-flex h-11 cursor-pointer items-center gap-2 text-base font-bold text-[#0c315e]">
        <input
          type="checkbox"
          checked={job.shikiri}
          onChange={(e) => {
            const on = e.target.checked;
            // 前の月に作った見積書を入れるときは、今月の請求書に入れる（あとで月は直せる）
            // 見積もり作成日も決める（このあと行を入れても、選んだとおりのまま）
            setJob((j) => ({
              ...j,
              estDate: j.estDate || todayIso(),
              shikiri: on,
              month: on && j.month < thisMonth() ? thisMonth() : j.month,
            }));
          }}
          className="h-5 w-5"
        />
        {client}の請求書に入れる
      </label>
      {job.shikiri && (
        <>
          <label className="grid gap-1 text-sm font-bold text-slate-600">
            請求する月
            <input
              type="month"
              value={job.month}
              onChange={(e) => e.target.value && setJob((j) => withBillMonth(j, e.target.value))}
              className="h-11 rounded-md border border-slate-300 px-2 text-base font-normal"
              aria-label="請求する月"
            />
          </label>
          {/* 売上月（受注残・売上見込みの月）：初めは請求する月と同じで、請求する月を変えると一緒に変わる。まれにちがう月にするときだけ直す
              （ユーザーの話「請求月と販売月は基本的には同じです。まれに違うことがあります」2026-10-26。ちがうときは薄い黄色） */}
          <label className="grid gap-1 text-sm font-bold text-slate-600">
            売上月
            <input
              type="month"
              value={jutakuSalesMonth(job)}
              onChange={(e) => e.target.value && setJob((j) => withSalesMonth(j, e.target.value))}
              className={`h-11 rounded-md border px-2 text-base font-normal ${jutakuSalesMonth(job) !== job.month ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}
              aria-label="売上月"
              title={jutakuSalesMonth(job) !== job.month ? '請求する月とちがう月です' : '請求する月と同じ（請求する月を変えると一緒に変わります）'}
            />
          </label>
          <Btn color="white" onClick={onOpenInvoice} className="!h-11 !text-base">
            🧾 請求書を見る
          </Btn>
          {missing.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">
              仕切価格が空欄の部材が {missing.length} 行あります
              <Btn small color="white" onClick={onFix}>
                仕切価格を入れる
              </Btn>
            </div>
          )}
        </>
      )}
    </>
  );
}

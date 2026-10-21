import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {DEFAULT_PLACES, DEFAULT_STAFF, OFFICES, settingsForOffice} from '../defaults.ts';
import {hasSamples, withoutSamples} from '../samples.ts';
import {backupJson, cleanList, masterJson, mergeById, parseBackup} from '../storage.ts';
import {FORM_IDS, FORM_INFO} from '../estimateForms.ts';
import type {AppData, EstimateForm, InvoiceTaxMode, Rounding, Settings, TaxMode} from '../types.ts';
import type {Update} from '../useStore.ts';
import {downloadBlob, todayIso} from '../util.ts';
import {Btn, NumberInput, TextInput, useToast} from './ui.tsx';

function Section({title, children, note}: {title: string; children: ReactNode; note?: ReactNode}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-bold text-[#0c315e]">{title}</h2>
      {note && <p className="-mt-1 mb-3 text-xs leading-5 text-slate-500">{note}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({label, children, wide = false}: {label: string; children: ReactNode; wide?: boolean}) {
  return (
    <label className={`grid gap-1 text-xs font-bold text-slate-600 ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      {children}
    </label>
  );
}

/**
 * 1行に1つずつ書く候補の欄。打っている途中の改行・空行は文字のまま持ち、
 * 空でない行だけを候補として反映する（反映した候補から書き戻すと、改行を打てなくなるため）
 */
function ListArea({value, onChange, rows, label}: {value: string[]; onChange: (v: string[]) => void; rows: number; label: string}) {
  const [text, setText] = useState(() => value.join('\n'));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value.join('\n'));
  }, [value]);
  return (
    <textarea
      value={text}
      aria-label={label}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value.join('\n'));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(cleanList(e.target.value.split('\n')));
      }}
      rows={rows}
      className="w-full rounded-md border border-slate-300 p-2 text-sm font-normal"
    />
  );
}

/** 設定（見積書・請求書の両方） */
export function SettingsPage({data, update}: {data: AppData; update: Update}) {
  const toast = useToast();
  const s = data.settings;
  const set = (patch: Partial<Settings>) => update('settings', (prev) => ({...prev, ...patch}));
  const text = (key: keyof Settings, placeholder = '') => (
    <TextInput value={String(s[key] ?? '')} onChange={(v) => set({[key]: v} as Partial<Settings>)} className="w-full" placeholder={placeholder} />
  );
  const [pending, setPending] = useState<{
    name: string;
    data: Partial<AppData>;
  } | null>(null);

  const exportAll = () => downloadBlob(new Blob([backupJson(data)], {type: 'application/json'}), `見積書・仕切り計算・請求書_バックアップ_${todayIso()}.json`);
  const exportMaster = () =>
    downloadBlob(new Blob([masterJson(data)], {type: 'application/json'}), `部材リスト・手間単価・部材＋施工費（常用）_${todayIso()}.json`);

  const readBackup = async (f: File) => {
    try {
      const parsed = parseBackup(await f.text());
      setPending({name: f.name, data: parsed});
    } catch (e) {
      toast(`読み込めませんでした：${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };
  const applyBackup = (replace: boolean) => {
    if (!pending) return;
    const d = pending.data;
    if (d.materials) update('materials', (cur) => (replace ? d.materials! : mergeById(cur, d.materials!)));
    if (d.labor) update('labor', (cur) => (replace ? d.labor! : mergeById(cur, d.labor!)));
    if (d.jobs && (replace || d.jobs.length > 0)) update('jobs', (cur) => (replace ? d.jobs! : mergeById(cur, d.jobs!)));
    if (d.kits) update('kits', (cur) => (replace ? d.kits! : mergeById(cur, d.kits!)));
    if (d.settings && replace) update('settings', () => d.settings!);
    setPending(null);
    toast(replace ? 'バックアップの内容に置き換えました' : 'バックアップの内容を足しました');
  };

  return (
    <div className="max-w-5xl space-y-4">
      <Section title="請求先">
        <Field label="請求先（工務店）の名前　※請求書には「○○　御中」と出ます">{text('clientName', '笹岡工務店')}</Field>
      </Section>

      <Section
        title="自社の情報（請求書の発行元・見積書の施工業者）"
        note="営業所を選ぶと住所・電話番号・所長名が入ります。太陽ポータルから開くと、ポータルで選んだ営業所が最初から入ります。"
      >
        <Field label="営業所">
          <select
            value={OFFICES.some((o) => o.name === s.officeName) ? s.officeName : ''}
            onChange={(e) => e.target.value && update('settings', (prev) => settingsForOffice(prev, e.target.value))}
            className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
          >
            <option value="">（選んでください）</option>
            {OFFICES.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="会社名">{text('company')}</Field>
        <Field label="営業所名（請求書・見積書の施工業者名に出る名前）">{text('officeName')}</Field>
        <Field label="所長名（請求書に「○○営業所所長　氏名」、見積書の代表者名に出ます）">
          {text('manager', '例：久保 匠史')}
        </Field>
        <Field label="郵便番号">{text('postal')}</Field>
        <Field label="住所" wide>
          {text('address')}
        </Field>
        <Field label="電話番号">{text('tel')}</Field>
        <Field label="FAX番号">{text('fax')}</Field>
        <Field label="登録番号（インボイス）">{text('regNo', 'T＋13桁')}</Field>
        <Field label="請求書の担当者（任意・様邸ごとの担当とは別）">{text('person', '例：山本')}</Field>
      </Section>

      <Section title="請求書">
        <Field label="お振込先（1行で）" wide>
          {text('bank', '例：○○銀行 ○○支店 普通 1234567 口座名義 ○○○○')}
        </Field>
        <Field label="件名（「○年○月分」のあとに付く言葉）">{text('subject', '工事代金')}</Field>
        <Field label="備考（請求書の下に出ます）" wide>
          <textarea
            value={s.invoiceNote}
            onChange={(e) => set({invoiceNote: e.target.value})}
            rows={3}
            className="w-full rounded-md border border-slate-300 p-2 text-sm font-normal"
            placeholder="例：恐れ入りますが、振込手数料は貴社にてご負担ください。"
          />
        </Field>
      </Section>

      <Section
        title="計算のしかた"
        note={
          <>
            ①部材代・②取付手間・③部材上乗せ（①×率）・④諸経費（（①＋②＋③）×率）・⑦税抜合計（①〜④）・⑤消費税・⑥合計（⑦＋⑤）は、元の「仕切り計算表」と同じ式です。
          </>
        }
      >
        <Field label="③部材上乗せ・④諸経費の率（元の表は 0.07）">
          <NumberInput value={s.rate} onChange={(rate) => set({rate})} className="w-28" min={0} ariaLabel="率" />
        </Field>
        <Field label="消費税率（0.1＝10%）">
          <NumberInput value={s.taxRate} onChange={(taxRate) => set({taxRate})} className="w-28" min={0} ariaLabel="消費税率" />
        </Field>
        <Field label="請求書（1か月分）の消費税">
          <select
            value={s.invoiceTaxMode}
            onChange={(e) => set({invoiceTaxMode: e.target.value as InvoiceTaxMode})}
            className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
          >
            <option value="monthly">すべての様邸の税抜合計に、最後に消費税率をかける</option>
            <option value="perJob">様邸ごとの⑤消費税を足す（一覧に様邸ごとの消費税・合計を出す）</option>
          </select>
        </Field>
        <Field label="合計にかける消費税の1円未満（請求書）">
          <select
            value={s.totalTaxRounding}
            onChange={(e) => set({totalTaxRounding: e.target.value as Rounding})}
            className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
          >
            <option value="floor">切り捨て</option>
            <option value="round">四捨五入</option>
            <option value="ceil">切り上げ</option>
          </select>
        </Field>
        <Field label="様邸ごとの仕切り計算表の⑤消費税の1円未満">
          <select
            value={s.taxMode}
            onChange={(e) => set({taxMode: e.target.value as TaxMode})}
            className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
          >
            <option value="original">元の表と同じ（⑦×0.1－1円・四捨五入）</option>
            <option value="floor">切り捨て</option>
            <option value="round">四捨五入</option>
            <option value="ceil">切り上げ</option>
          </select>
        </Field>
      </Section>

      <Section
        title="見積書"
        note="書式は、苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」と、広域連合用「住宅改修内訳明細書」の2つです（見積書ごとに選び直せます）。部材の単価は定価×率、手すりなどを切って使うときの数量は 使う長さ÷1本の長さ（例：60cm÷4m＝0.15本）、部材のすぐ下の取付手間は「同上施工費」の1行です。金額は元の見積書と同じく、どれも1円未満を切り捨てます。"
      >
        <Field label="部材の単価＝定価×この率（0.8＝定価の8割）">
          <NumberInput value={s.estimateRate} onChange={(estimateRate) => set({estimateRate})} className="w-28" min={0} ariaLabel="見積の率" />
        </Field>
        <Field label="見積の単価が空欄の施工費＝取付手間（仕切り）×この率（1.5＝1,500円の手間なら2,250円）">
          <NumberInput value={s.estimateLaborRate} onChange={(estimateLaborRate) => set({estimateLaborRate})} className="w-28" min={0} ariaLabel="施工費の率" />
        </Field>
        <Field label="諸経費＝小計×この率（0.1＝10%）">
          <NumberInput
            value={s.estimateOverheadRate}
            onChange={(estimateOverheadRate) => set({estimateOverheadRate})}
            className="w-28"
            min={0}
            ariaLabel="諸経費の率"
          />
        </Field>
        <Field label="広域連合用：施工費を「時間×1時間の単価」で書くときの単価（円・0なら「1式」）">
          <NumberInput value={s.estimateHourRate} onChange={(estimateHourRate) => set({estimateHourRate})} className="w-28" min={0} ariaLabel="1時間の単価" />
        </Field>
        <Field label="住所から市町村が分からないときの書式（仕切り計算・請求書アプリで作った様邸の見積書）">
          <select
            value={s.estimateForm}
            onChange={(e) => set({estimateForm: e.target.value as EstimateForm})}
            className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
          >
            {FORM_IDS.map((f) => (
              <option key={f} value={f}>
                {FORM_INFO[f].name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="箇所の候補" note="様邸の画面の「＋ 箇所を追加」に並ぶ名前です。1行に1つずつ書きます。">
        <div className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">
          <ListArea label="箇所の名前" value={s.placePresets} onChange={(placePresets) => set({placePresets})} rows={5} />
          <span>
            <Btn small color="white" onClick={() => set({placePresets: DEFAULT_PLACES})}>
              最初の候補に戻す
            </Btn>
          </span>
        </div>
      </Section>

      <Section
        title="担当者の候補"
        note="見積書・様邸の画面の「担当」から選ぶ名前です。1行に1つずつ書きます。見積書にはフルネーム、請求書と明細のお客様名の横には名字が出ます。"
      >
        <div className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">
          <ListArea label="担当者の名前" value={s.staffList} onChange={(staffList) => set({staffList})} rows={5} />
          <span>
            <Btn small color="white" onClick={() => set({staffList: DEFAULT_STAFF})}>
              最初の候補に戻す（{DEFAULT_STAFF.join('・')}）
            </Btn>
          </span>
        </div>
      </Section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-base font-bold text-[#0c315e]">データ（この端末のブラウザに保存）</h2>
        <p className="mb-3 text-xs leading-5 text-slate-500">
          入力した内容は、このパソコンのこのブラウザにだけ保存されます（サーバーには送りません）。ほかのパソコンでは見えないので、ときどきバックアップを保存してください。
          見積書と請求書は同じ保存場所です。
          部材リスト・手間単価・部材＋施工費（常用）だけを保存したファイルは、ほかの人に渡して読み込んでもらえます。
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn color="blue" onClick={exportAll}>
            バックアップを保存（すべて）
          </Btn>
          <Btn color="teal" onClick={exportMaster}>
            部材リスト・手間単価・部材＋施工費（常用）だけ保存（ほかの人に渡す用）
          </Btn>
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            保存したファイルを読み込む
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readBackup(f);
                e.target.value = '';
              }}
            />
          </label>
          {hasSamples(data) && (
            <Btn
              color="white"
              onClick={() => {
                const r = withoutSamples(data);
                update('materials', () => r.materials);
                update('jobs', () => r.jobs);
                update('kits', () => r.kits);
                toast('サンプルの部材・様邸・部材＋施工費（常用）を消しました');
              }}
            >
              サンプルを消す
            </Btn>
          )}
        </div>
        {pending && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
            <p className="font-bold text-slate-800">「{pending.name}」の中身</p>
            <p className="text-slate-600">
              部材 {pending.data.materials?.length ?? 0}件・取付手間 {pending.data.labor?.length ?? 0}件・様邸（見積書）
              {pending.data.jobs?.length ?? 0}件・部材＋施工費（常用） {pending.data.kits?.length ?? 0}件{pending.data.settings ? '・設定' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn small color="blue" onClick={() => applyBackup(false)}>
                今のデータに足す（同じものは上書き）
              </Btn>
              <Btn
                small
                color="rose"
                onClick={() => {
                  if (confirm('今のデータを消して、読み込んだファイルの内容に置き換えます。よろしいですか？')) applyBackup(true);
                }}
              >
                今のデータを置き換える
              </Btn>
              <Btn small color="white" onClick={() => setPending(null)}>
                やめる
              </Btn>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

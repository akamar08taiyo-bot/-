import {useRef} from 'react';
import type {ReactNode} from 'react';
import {OFFICES, settingsForOffice} from '../defaults.ts';
import {backupJson, mergeById, parseBackup, productsJson} from '../storage.ts';
import type {AppData, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {downloadBlob, todayIso} from '../util.ts';
import {Btn, NumberInput, TextInput, useToast} from './ui.tsx';

function Card({title, children}: {title: string; children: ReactNode}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-teal-800">{title}</h3>
      {children}
    </section>
  );
}

function Field({label, children, wide = false}: {label: string; children: ReactNode; wide?: boolean}) {
  return (
    // 入力欄は欄いっぱい（幅を決めていないと、字の大きさで決まる幅になって隣の欄に重なった。2026-10-26 のデバッグ）
    <label className={`grid min-w-0 content-start gap-1 text-xs font-bold text-slate-600 [&>input]:w-full [&>input]:min-w-0 [&>select]:w-full ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      {children}
    </label>
  );
}

/** 1行に1つの候補（担当者・仕入先） */
function LinesInput({value, onChange, label}: {value: string[]; onChange: (v: string[]) => void; label: string}) {
  return (
    <textarea
      aria-label={label}
      defaultValue={value.join('\n')}
      onBlur={(e) =>
        onChange(
          e.target.value
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean),
        )
      }
      rows={Math.max(3, value.length + 1)}
      className="rounded-md border border-slate-300 p-2 text-sm font-normal outline-none focus:border-blue-500"
    />
  );
}

export function SettingsPage({data, update}: {data: AppData; update: Update}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const set = (patch: Partial<Settings>) => update('settings', (prev) => ({...prev, ...patch}));

  const restore = async (f: File) => {
    try {
      const b = parseBackup(await f.text());
      const counts = [b.products && `商品 ${b.products.length}件`, b.sales && `見積もり ${b.sales.length}件`, b.settings && '設定'].filter(Boolean).join('・');
      if (!window.confirm(`バックアップ（${counts}）を読み込みます。同じものは読み込んだ方で上書きし、ないものは足します。よろしいですか？`)) return;
      if (b.products) update('products', (list) => mergeById(list, b.products!));
      if (b.sales) update('sales', (list) => mergeById(list, b.sales!));
      if (b.settings) update('settings', () => b.settings!);
      toast('読み込みました');
    } catch (e) {
      toast(`読み込めませんでした：${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="見積書の発行元">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="営業所">
            <select value={s.officeName} onChange={(e) => update('settings', (prev) => settingsForOffice(prev, e.target.value))} className="h-9 rounded-md border border-slate-300 px-2 text-sm" aria-label="営業所">
              {!OFFICES.some((o) => o.name === s.officeName) && <option value={s.officeName}>{s.officeName || '—'}</option>}
              {OFFICES.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="会社名">
            <TextInput value={s.company} onChange={(company) => set({company})} />
          </Field>
          <Field label="郵便番号">
            <TextInput value={s.postal} onChange={(postal) => set({postal})} />
          </Field>
          <Field label="所長">
            <TextInput value={s.manager} onChange={(manager) => set({manager})} />
          </Field>
          <Field label="住所" wide>
            <TextInput value={s.address} onChange={(address) => set({address})} />
          </Field>
          <Field label="TEL">
            <TextInput value={s.tel} onChange={(tel) => set({tel})} />
          </Field>
          <Field label="FAX">
            <TextInput value={s.fax} onChange={(fax) => set({fax})} />
          </Field>
          <Field label="登録番号（インボイス）">
            <TextInput value={s.regNo} onChange={(regNo) => set({regNo})} />
          </Field>
          {/* 福岡市の支給申請書の受任者の欄（特定（介護予防）福祉用具販売事業者番号）に書く */}
          <Field label="事業者番号（特定福祉用具販売）">
            <TextInput value={s.providerNo ?? ''} onChange={(providerNo) => set({providerNo})} inputMode="numeric" placeholder="10けた" />
          </Field>
        </div>
      </Card>

      <Card title="金額の決まり">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="割引率（%）：販売単価＝定価×(100−割引率)%">
            <NumberInput value={s.discountRate} onChange={(discountRate) => set({discountRate: Math.min(100, discountRate)})} min={0} ariaLabel="割引率" />
          </Field>
          <Field label="定価がない商品の上乗せ（%）：仕切×(100＋上乗せ)%">
            <NumberInput value={s.markupRate} onChange={(markupRate) => set({markupRate})} min={0} ariaLabel="上乗せ" />
          </Field>
          <Field label="1年間（4月〜翌年3月）の限度額（円）">
            <NumberInput value={s.limit} onChange={(limit) => set({limit})} min={0} ariaLabel="限度額" />
          </Field>
          <Field label="これより低い利益率は知らせる（%）">
            <NumberInput value={s.minProfitRate} onChange={(minProfitRate) => set({minProfitRate})} min={0} ariaLabel="最低利益率" />
          </Field>
        </div>
      </Card>

      <Card title="見積書の条件・備考">
        <div className="grid gap-3">
          <Field label="見積有効期限">
            <TextInput value={s.validity} onChange={(validity) => set({validity})} />
          </Field>
          <Field label="お支払条件">
            <TextInput value={s.payment} onChange={(payment) => set({payment})} />
          </Field>
          <Field label="納期">
            <TextInput value={s.delivery} onChange={(delivery) => set({delivery})} />
          </Field>
          <Field label="備考（見積書の備考のはじめの文）">
            <textarea value={s.remarks} onChange={(e) => set({remarks: e.target.value})} rows={2} className="rounded-md border border-slate-300 p-2 text-sm font-normal outline-none focus:border-blue-500" />
          </Field>
        </div>
      </Card>

      <Card title="候補">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="担当者（1行に1人）">
            <LinesInput value={s.staffList} onChange={(staffList) => set({staffList})} label="担当者" />
          </Field>
          <Field label="仕入先（1行に1つ）">
            <LinesInput value={s.suppliers} onChange={(suppliers) => set({suppliers})} label="仕入先" />
          </Field>
        </div>
      </Card>

      <Card title="バックアップ（この端末だけに保存しています）">
        <div className="flex flex-wrap gap-2">
          <Btn color="softBlue" onClick={() => downloadBlob(new Blob([backupJson(data)], {type: 'application/json'}), `特定福祉用具_バックアップ_${todayIso()}.json`)}>
            ⬇ すべてをファイルに保存
          </Btn>
          <Btn color="softBlue" disabled={data.products.length === 0} onClick={() => downloadBlob(new Blob([productsJson(data.products)], {type: 'application/json'}), `特定福祉用具_商品マスタ_${todayIso()}.json`)}>
            ⬇ 商品マスタだけ保存（ほかの端末へ）
          </Btn>
          <Btn color="white" onClick={() => fileRef.current?.click()}>
            ⬆ ファイルから読み込む
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="バックアップのファイル"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = '';
            }}
          />
        </div>
      </Card>
    </div>
  );
}

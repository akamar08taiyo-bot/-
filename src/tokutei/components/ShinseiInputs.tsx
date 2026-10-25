// 申請書の画面の左の入れる所：申請書の上からの順に1行ずつ（住宅改修の申請書のタブと同じ形。ユーザーの指示「住宅改修と同様に、申請書のページをメインに大きくおいてください」2026-10-23）。
// 右のプレビュー（ShinseiPreview.tsx）の欄を押すと、ここのその行へ（data-field）。まだ入っていない行は薄い黄色。
// 値は案件（Sale）のまま（見積書と同じ値。金額は見積書の側で入れる。ここでは購入金額を出すだけ）
import {useMemo} from 'react';
import type {ReactNode, RefObject} from 'react';
import type {FocusEvent} from 'react';
import type {Line} from '../calc.ts';
import {CARE_LEVELS, INSURERS} from '../defaults.ts';
import {frequentValues, makerChoices} from '../sales.ts';
import {carePlanOf, padInsuredNo} from '../shinsei.ts';
import type {ShinseiKey} from '../shinsei.ts';
import type {ShinseiField} from '../shinseiPreview.ts';
import type {AppData, BurdenRatio, CarePlan, Gender, PayMethod, Sale, SaleItem} from '../types.ts';
import {yen} from '../util.ts';
import {zipLabel} from '../zip.ts';
import type {ZipHit} from '../zip.ts';
import {BirthInput} from './BirthInput.tsx';
import {CategorySelect} from './CategorySelect.tsx';
import {MakerInput} from './MakerInput.tsx';
import {ReasonField} from './ReasonField.tsx';
import {Suggest} from './Suggest.tsx';
import {Btn, Segmented, TextInput} from './ui.tsx';

const dateInput = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-blue-500';

export function ShinseiInputs({
  sale,
  data,
  formKey,
  lines,
  missing,
  active,
  inputsRef,
  onFocusField,
  change,
  changeItem,
  changeAddress,
  changeZip,
  zips,
  onPickProduct,
  onScan,
  onAddItem,
  onPickCustomer,
}: {
  sale: Sale;
  data: AppData;
  formKey: ShinseiKey | null;
  lines: Line[];
  missing: Set<ShinseiField>;
  active: ShinseiField | null;
  inputsRef: RefObject<HTMLDivElement | null>;
  onFocusField: (e: FocusEvent<HTMLElement>) => void;
  change: (patch: Partial<Sale>) => void;
  changeItem: (id: string, patch: Partial<SaleItem>) => void;
  changeAddress: (address: string) => void;
  changeZip: (zip: string) => void;
  zips: ZipHit[];
  onPickProduct: () => void;
  onScan: () => void; // 「📷 スクショから自動認識」の窓を開く（scanItem.ts）
  onAddItem: () => void;
  onPickCustomer: () => void;
}) {
  const makers = useMemo(() => makerChoices(data.products, data.sales), [data.products, data.sales]);
  const s = data.settings;
  /** 1行（左に申請書の言葉、右に入れる所。field があればプレビューの欄とつなぐ） */
  const row = (label: ReactNode, children: ReactNode, field?: ShinseiField, warn = field ? missing.has(field) : false) => (
    <div
      data-field={field}
      className={`border-b border-slate-300 last:border-b-0 sm:grid sm:grid-cols-[8.5rem_1fr] ${field && active === field ? 'relative z-[1] outline outline-2 -outline-offset-2 outline-sky-500' : ''}`}
    >
      <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">{label}</div>
      <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 ${warn ? 'bg-amber-50' : ''}`}>{children}</div>
    </div>
  );
  const kouiki = formKey === 'kouiki';
  return (
    <div ref={inputsRef} onFocusCapture={onFocusField} className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" small onClick={onPickCustomer}>
          👤 前のお客様から入れる
        </Btn>
      </div>
      <div role="form" aria-label="申請書に入れる所" className="overflow-hidden rounded-xl border-2 border-slate-400 bg-white shadow-sm">
        {row(
          '保険者',
          <select
            value={sale.insurer}
            onChange={(e) => {
              const key = e.target.value;
              change({insurer: key, perItem: INSURERS.find((i) => i.key === key)?.perItem ?? false});
            }}
            className={`h-9 w-full min-w-0 rounded-md border px-2 text-sm ${sale.insurer ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}
            aria-label="保険者"
          >
            <option value="">選んでください</option>
            {INSURERS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
                {i.note ? `（${i.note}）` : ''}
              </option>
            ))}
          </select>,
        )}
        {row('フリガナ', <TextInput value={sale.kana} onChange={(kana) => change({kana})} placeholder="ヤマダ ハナコ" className="w-full" aria-label="フリガナ" />, 'kana')}
        {row('被保険者氏名', <TextInput value={sale.customer} onChange={(customer) => change({customer})} placeholder="山田 花子" className="w-full" aria-label="お客様名" />, 'customer')}
        {row(
          '被保険者番号',
          <TextInput
            value={sale.insuredNo}
            onChange={(insuredNo) => change({insuredNo: insuredNo.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 10)})}
            onBlur={() => sale.insuredNo && sale.insuredNo !== padInsuredNo(sale.insuredNo) && change({insuredNo: padInsuredNo(sale.insuredNo)})}
            inputMode="numeric"
            placeholder="10けた（足りない分は左に0）"
            className="w-56"
            aria-label="被保険者番号"
          />,
          'insuredNo',
        )}
        {row('生年月日', <BirthInput value={sale.birthDate} onChange={(birthDate) => change({birthDate})} />, 'birthDate')}
        {row(
          '性別',
          <Segmented<Gender>
            ariaLabel="性別"
            value={sale.gender}
            onChange={(gender) => change({gender})}
            options={[
              ['男', '男'],
              ['女', '女'],
            ]}
          />,
          'gender',
        )}
        {row(
          '郵便番号',
          <>
            <TextInput value={sale.zip} onChange={changeZip} onBlur={() => sale.zip && change({zip: zipLabel(sale.zip)})} inputMode="numeric" placeholder="824-0043" className="w-32" aria-label="郵便番号" />
            {zips.length > 1 &&
              zips.map((z) => (
                <button key={z.zip} type="button" onClick={() => change({zip: z.zip})} className="text-[11px] text-slate-500 underline decoration-dotted hover:text-teal-700">
                  {z.zip}（{z.label}）
                </button>
              ))}
            {zips.length === 1 && sale.zip && zipLabel(sale.zip) !== zips[0].zip && (
              <button type="button" onClick={() => change({zip: zips[0].zip})} className="text-[11px] text-amber-700 underline hover:text-teal-700">
                住所からは {zips[0].zip}（{zips[0].label}）
              </button>
            )}
          </>,
          'zip',
        )}
        {row('住所', <TextInput value={sale.address} onChange={changeAddress} placeholder="行橋市大字流末1327番地" className="w-full" aria-label="住所" />, 'address')}
        {row('電話番号', <TextInput value={sale.tel} onChange={(tel) => change({tel})} inputMode="tel" className="w-44" aria-label="電話" />, 'tel')}
        {!kouiki &&
          row(
            '要介護状態区分',
            <select value={sale.careLevel} onChange={(e) => change({careLevel: e.target.value})} className="h-9 w-40 min-w-0 rounded-md border border-slate-300 px-2 text-sm" aria-label="要介護度">
              <option value="">—</option>
              {CARE_LEVELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>,
            'careLevel',
          )}
        {row(
          '負担割合',
          <Segmented<BurdenRatio>
            ariaLabel="負担割合"
            value={sale.burdenRatio}
            onChange={(burdenRatio) => change({burdenRatio})}
            options={[
              [1, '1割'],
              [2, '2割'],
              [3, '3割'],
            ]}
          />,
          'burdenRatio',
        )}
        {row(
          '支払方法',
          <Segmented<PayMethod>
            ariaLabel="支払方法"
            value={sale.payMethod}
            onChange={(payMethod) => change({payMethod})}
            options={[
              ['受領委任払い', '受領委任払い'],
              ['償還払い', '償還払い'],
            ]}
          />,
          'payMethod',
        )}
        {(formKey === 'miyako' || kouiki) &&
          row(
            '居宅サービス計画の届出',
            <Segmented<CarePlan>
              ariaLabel="居宅サービス計画の届出"
              value={carePlanOf(sale)}
              onChange={(carePlan) => change({carePlan})}
              options={[
                ['有', '有'],
                ['無', '無'],
              ]}
            />,
            'carePlan',
          )}
        {row(
          '福祉用具',
          <div className="w-full space-y-2">
            {lines.map((l, idx) => {
              const i = l.item;
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{idx + 1}</span>
                  <TextInput value={i.name} onChange={(name) => changeItem(i.id, {name})} placeholder="商品名" className="min-w-0 flex-1" aria-label="商品名" />
                  <CategorySelect category={i.category} sub={i.sub} onChange={(category, sub) => changeItem(i.id, {category, sub})} ariaLabel="種目" />
                  {i.productId === null ? (
                    <MakerInput value={i.maker} onChange={(maker) => changeItem(i.id, {maker})} choices={makers} className="w-56" />
                  ) : (
                    i.maker && <span className="text-xs text-slate-500">{i.maker}</span>
                  )}
                  <span className="ml-auto text-sm font-bold tabular-nums text-slate-800">{yen(l.total)}円</span>
                  <button
                    type="button"
                    onClick={() => change({items: sale.items.filter((x) => x.id !== i.id)})}
                    className="rounded px-2 py-1 text-rose-500 hover:bg-rose-50"
                    aria-label={`${i.name || '商品'}を消す`}
                    title="消す"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Btn color="teal" small onClick={onPickProduct}>
                ★ 商品を選ぶ
              </Btn>
              <Btn color="purple" small onClick={onScan}>
                📷 スクショから自動認識
              </Btn>
              <Btn color="white" small onClick={onAddItem}>
                ＋ 手で入れる
              </Btn>
            </div>
          </div>,
          'items',
        )}
        {row(
          '福祉用具が必要な理由',
          <div className="w-full space-y-2">
            {lines.map((l) => (
              <div key={l.item.id} className={`grid min-w-0 gap-1 rounded-sm text-xs font-bold text-slate-600 ${l.item.reason.trim() ? '' : 'bg-amber-50 outline outline-4 outline-amber-50'}`}>
                {l.item.name || '商品'}
                <ReasonField item={l.item} sales={data.sales} saleId={sale.id} onChange={(reason) => changeItem(l.item.id, {reason})} />
              </div>
            ))}
          </div>,
          'reason',
        )}
        {row(
          kouiki ? '居宅介護支援事業所' : '記載者（事業所・氏名）',
          <div className="grid w-full gap-2 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1">
              <TextInput value={sale.careOffice} onChange={(careOffice) => change({careOffice})} placeholder="居宅介護支援事業所" className="w-full" aria-label="居宅介護支援事業所" />
              <Suggest values={frequentValues(data.sales, (x) => x.careOffice)} current={sale.careOffice} onPick={(careOffice) => change({careOffice})} />
            </div>
            <div className="grid min-w-0 gap-1">
              <TextInput value={sale.careManager} onChange={(careManager) => change({careManager})} placeholder="ケアマネジャー" className="w-full" aria-label="ケアマネジャー" />
              <Suggest
                values={frequentValues(data.sales, (x) => x.careManager, (x) => !sale.careOffice.trim() || x.careOffice.trim() === sale.careOffice.trim())}
                current={sale.careManager}
                onPick={(careManager) => change({careManager})}
              />
            </div>
          </div>,
          'recorder',
        )}
        {row(
          '担当',
          <select value={sale.staff} onChange={(e) => change({staff: e.target.value})} className="h-9 w-44 min-w-0 rounded-md border border-slate-300 px-2 text-sm" aria-label="担当">
            <option value="">—</option>
            {[...new Set([...s.staffList, sale.staff].filter(Boolean))].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>,
          'staff',
        )}
        {row('申請日', <input type="date" value={sale.applyDate} onChange={(e) => change({applyDate: e.target.value})} className={dateInput} aria-label="申請日" />, 'applyDate')}
        {row('納品日（購入日）', <input type="date" value={sale.deliveryDate} onChange={(e) => change({deliveryDate: e.target.value})} className={dateInput} aria-label="納品日" />, 'deliveryDate')}
        {row('支給申請日', <input type="date" value={sale.claimDate} onChange={(e) => change({claimDate: e.target.value})} className={dateInput} aria-label="支給申請日" />, 'claimDate')}
      </div>
    </div>
  );
}

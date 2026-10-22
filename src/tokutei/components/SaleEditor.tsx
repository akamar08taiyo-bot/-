import {useDeferredValue, useMemo, useRef, useState} from 'react';
import type {FocusEvent, MouseEvent, ReactNode} from 'react';
import {priceNote, saleTotals} from '../calc.ts';
import {docLabel} from '../category.ts';
import {CARE_LEVELS, INSURERS, insurerLabel} from '../defaults.ts';
import {HACCHU_IMPORT_KEY, hacchuImport, hacchuUrl} from '../handoff.ts';
import {blankItem, copySale, customerLabel, customerPatch, frequentValues, itemFromProduct, markUsed, sameYearSales, saleWarnings} from '../sales.ts';
import {carePlanOf, padInsuredNo, shinseiForm, shinseiValues} from '../shinsei.ts';
import {useTemplate} from '../shinseiFiles.ts';
import {FIELD_LABEL, missingFields, shinseiPreview} from '../shinseiPreview.ts';
import type {PvPage, ShinseiField} from '../shinseiPreview.ts';
import type {AppData, BurdenRatio, CarePlan, Gender, PayMethod, Sale, SaleItem, SaleStatus, TaxType} from '../types.ts';
import type {Update} from '../useStore.ts';
import {todayIso, yen} from '../util.ts';
import {fiscalYearOf} from '../wareki.ts';
import {addressOfZip, zipCandidates, zipLabel} from '../zip.ts';
import {saveEstimateXlsx} from '../print/estimateXlsx.ts';
import {BirthInput} from './BirthInput.tsx';
import {CategorySelect} from './CategorySelect.tsx';
import {CustomerPicker} from './CustomerPicker.tsx';
import {ProductPicker} from './ProductPicker.tsx';
import {ReasonField} from './ReasonField.tsx';
import {ShinseiPanel} from './ShinseiPanel.tsx';
import {ShinseiPages} from './ShinseiPreview.tsx';
import {Suggest} from './Suggest.tsx';
import {Btn, btnClass, NumberInput, OptionalNumberInput, Segmented, Stepper, TextInput, useToast} from './ui.tsx';

const STATUSES: SaleStatus[] = ['見積', '申請', '承認', '納品', '集金'];
// 状態を進めたとき、その日付が空なら今日を入れる
const STATUS_DATE: Partial<Record<SaleStatus, keyof Sale>> = {申請: 'applyDate', 承認: 'approveDate', 納品: 'deliveryDate', 集金: 'collectDate'};

function Card({title, children, right, field, warn = false}: {title: string; children: ReactNode; right?: ReactNode; field?: ShinseiField; warn?: boolean}) {
  return (
    <section className={`rounded-xl border bg-white p-4 shadow-sm ${warn ? 'border-amber-300' : 'border-slate-200'}`} data-field={field}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-teal-800">{title}</h3>
        {right && <div className="ml-auto flex flex-wrap gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** 入れる所。field は申請書のプレビューの欄とつなぐ名前（申請書の画面で、まだ入っていなければ薄い黄色＝warn） */
function Field({label, children, wide = false, field, warn = false}: {label: string; children: ReactNode; wide?: boolean; field?: ShinseiField; warn?: boolean}) {
  return (
    <label
      className={`grid min-w-0 content-start gap-1 rounded-sm text-xs font-bold text-slate-600 ${wide ? 'sm:col-span-2' : ''} ${warn ? 'bg-amber-50 outline outline-4 outline-amber-50' : ''}`}
      data-field={field}
    >
      {label}
      {children}
    </label>
  );
}

const dateInput = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-blue-500';

export function SaleEditor({
  sale,
  data,
  update,
  onBack,
  onOpen,
  onPrint,
}: {
  sale: Sale;
  data: AppData;
  update: Update;
  onBack: () => void;
  onOpen: (id: string) => void;
  onPrint: (id: string) => void;
}) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  // 住所から自動で入れた郵便番号（手で直した番号は、住所を直しても変えない）
  const autoZip = useRef('');
  const s = data.settings;
  const t = saleTotals(sale, s);
  const warnings = saleWarnings(sale);
  const zips = zipCandidates(sale.address);
  // 今年度の残り：このアプリの記録にある、同じ方の今年度の申請（ほかの事業所で買った分は入らない）
  const prevYear = sameYearSales(data.sales, sale);
  const usedYear = prevYear.reduce((n, x) => n + saleTotals(x, s).covered, 0);
  const fy = fiscalYearOf(sale.deliveryDate || sale.applyDate || sale.estimateDate);

  // 見積もりの画面と、申請書の画面（左で入れながら、右で申請書の原本の形のまま見る。住宅改修の申請書と同じ）
  const form = shinseiForm(sale.insurer);
  const [view, setView] = useState<'quote' | 'shinsei'>('quote');
  const onShinsei = view === 'shinsei' && !!form;
  const template = useTemplate(onShinsei && form ? form.key : null);
  // 打つたびに作り直す（打つのを待たせないように少し遅れてよい）
  const shown = useDeferredValue(sale);
  const values = useMemo(() => shinseiValues(shown, s), [shown, s]);
  const pages = useMemo((): PvPage[] | null => {
    if (!onShinsei || !template || !form) return null;
    try {
      return shinseiPreview(template, form, values);
    } catch {
      return []; // 描けないとき（原本がこわれているなど）は入れる所だけ
    }
  }, [onShinsei, template, form, values]);
  const missing = useMemo(() => (form ? missingFields(shinseiValues(sale, s), form.key) : new Set<ShinseiField>()), [form, sale, s]);
  const warn = (f: ShinseiField) => onShinsei && missing.has(f);
  const [active, setActive] = useState<ShinseiField | null>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  /** 入れている所（プレビューのその欄を囲む） */
  const onFocusField = (e: FocusEvent<HTMLElement>) => {
    const f = (e.target as HTMLElement).closest('[data-field]')?.getAttribute('data-field');
    if (f) setActive(f as ShinseiField);
  };
  /** プレビューの欄を押したとき：左のその入れる所へ（見える所まで動かして、打てるように） */
  const goField = (f: ShinseiField) => {
    const el = inputsRef.current?.querySelector<HTMLElement>(`[data-field="${f}"]`);
    if (!el) return;
    setActive(f);
    el.scrollIntoView({behavior: 'smooth', block: 'center'});
    el.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]), select, textarea, [role="radio"], button')?.focus({preventScroll: true});
  };

  const change = (patch: Partial<Sale>) =>
    update('sales', (list) => list.map((x) => (x.id === sale.id ? {...x, ...patch, updatedAt: Date.now()} : x)));
  const changeItem = (id: string, patch: Partial<SaleItem>) => change({items: sale.items.map((i) => (i.id === id ? {...i, ...patch} : i))});

  /** 住所を打つと、郵便番号が1つに決まれば入れる（郵便番号が空か、前に自動で入れた番号のとき） */
  const changeAddress = (address: string) => {
    const hits = zipCandidates(address);
    const zipNow = zipLabel(sale.zip);
    if (hits.length === 1 && (!zipNow || zipNow === autoZip.current)) {
      autoZip.current = hits[0].zip;
      change({address, zip: hits[0].zip});
    } else change({address});
  };
  /** 郵便番号を先に打つと、住所が空なら住所の頭（市区町村・町域）を入れる */
  const changeZip = (zip: string) => {
    const head = sale.address.trim() ? '' : addressOfZip(zip);
    autoZip.current = '';
    change(head ? {zip, address: head} : {zip});
  };

  const pickCustomer = (from: Sale) => {
    if (sale.customer.trim() && !window.confirm(`今入っているお客様の欄を「${customerLabel(from)}」の内容に置きかえます。よろしいですか？`)) return;
    change(customerPatch(from));
    setPickingCustomer(false);
    toast(`${customerLabel(from)} の内容を入れました`);
  };

  const setStatus = (status: SaleStatus) => {
    const key = STATUS_DATE[status];
    change({status, ...(key && !sale[key] ? {[key]: todayIso()} : {})});
  };

  const remove = () => {
    if (!window.confirm(`「${customerLabel(sale)}」の見積もりを消します。元に戻せません。よろしいですか？`)) return;
    update('sales', (list) => list.filter((x) => x.id !== sale.id));
    toast('消しました');
    onBack();
  };

  const duplicate = () => {
    const c = copySale(sale, data.sales);
    update('sales', (list) => [...list, c]);
    toast('複製しました');
    onOpen(c.id);
  };

  // 販売受注簿作成ツールを新しいタブで開く（リンクなので、ポップアップを止める設定でも開く）。開く前に商品を置いておく（handoff.ts）
  const transfer = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (sale.items.length === 0) {
      ev.preventDefault();
      toast('商品がありません', 'error');
      return;
    }
    try {
      localStorage.setItem(HACCHU_IMPORT_KEY, JSON.stringify(hacchuImport(sale, s)));
    } catch {
      ev.preventDefault();
      toast('販売受注簿へ渡せませんでした（この端末のブラウザに保存できません）', 'error');
      return;
    }
    toast(`販売受注簿を開きました（商品 ${sale.items.length}点）。開いた画面で「受注簿に入れる」を押してください`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 見積もりの一覧へ
        </Btn>
        <h2 className="text-lg font-bold text-slate-800">{customerLabel(sale)}</h2>
        <span className="text-sm text-slate-500">{insurerLabel(sale.insurer, sale.insurerName) || '保険者未選択'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn color="sky" onClick={() => onPrint(sale.id)}>
            🖨 見積書を印刷
          </Btn>
          <Btn color="excel" onClick={() => saveEstimateXlsx(sale, data.settings)}>
            📗 Excelで保存
          </Btn>
          {form && (
            <Btn color="white" onClick={() => setView('shinsei')}>
              📄 申請書
            </Btn>
          )}
          <a href={hacchuUrl()} target="_blank" onClick={transfer} className={btnClass('white')}>
            📤 販売受注簿に転記
          </a>
          <Btn color="white" onClick={duplicate}>
            複製
          </Btn>
          <Btn color="rose" onClick={remove}>
            削除
          </Btn>
        </div>
      </div>

      {form && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="見積もり・申請書">
          {(
            [
              ['quote', '📋 見積もり'],
              ['shinsei', `📄 申請書（${form.title}）`],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-bold ${view === id ? 'border-teal-700 bg-white text-teal-800 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/60 hover:text-teal-700'}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className={`grid gap-4 ${onShinsei ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}>
        <div ref={inputsRef} className="min-w-0 space-y-4" onFocusCapture={onShinsei ? onFocusField : undefined}>
          <Card
            title="お客様"
            right={
              <Btn color="white" small onClick={() => setPickingCustomer(true)}>
                👤 前のお客様から入れる
              </Btn>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="お客様名（様は付けない）" field="customer" warn={warn('customer')}>
                <TextInput value={sale.customer} onChange={(customer) => change({customer})} placeholder="例：山田 花子" aria-label="お客様名" />
              </Field>
              <Field label="フリガナ" field="kana" warn={warn('kana')}>
                <TextInput value={sale.kana} onChange={(kana) => change({kana})} placeholder="ヤマダ ハナコ" aria-label="フリガナ" />
              </Field>
              <Field label="被保険者番号" field="insuredNo" warn={warn('insuredNo')}>
                <TextInput
                  value={sale.insuredNo}
                  onChange={(insuredNo) => change({insuredNo: insuredNo.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 10)})}
                  onBlur={() => sale.insuredNo && sale.insuredNo !== padInsuredNo(sale.insuredNo) && change({insuredNo: padInsuredNo(sale.insuredNo)})}
                  inputMode="numeric"
                  placeholder="10けた（足りない分は左に0）"
                  aria-label="被保険者番号"
                />
              </Field>
              <Field label="生年月日" field="birthDate" warn={warn('birthDate')}>
                <BirthInput value={sale.birthDate} onChange={(birthDate) => change({birthDate})} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="性別" field="gender" warn={warn('gender')}>
                  <Segmented<Gender>
                    ariaLabel="性別"
                    value={sale.gender}
                    onChange={(gender) => change({gender})}
                    options={[
                      ['男', '男'],
                      ['女', '女'],
                    ]}
                  />
                </Field>
                <Field label="要介護度" field="careLevel" warn={warn('careLevel')}>
                  <select value={sale.careLevel} onChange={(e) => change({careLevel: e.target.value})} className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm" aria-label="要介護度">
                    <option value="">—</option>
                    {CARE_LEVELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="郵便番号" field="zip" warn={warn('zip')}>
                <TextInput value={sale.zip} onChange={changeZip} onBlur={() => sale.zip && change({zip: zipLabel(sale.zip)})} inputMode="numeric" placeholder="824-0043" aria-label="郵便番号" />
                {zips.length > 1 && (
                  <span className="text-[11px] font-normal text-slate-500">
                    この住所の郵便番号：
                    {zips.map((z) => (
                      <button key={z.zip} type="button" onClick={() => change({zip: z.zip})} className="mr-1 underline decoration-dotted hover:text-teal-700">
                        {z.zip}（{z.label}）
                      </button>
                    ))}
                  </span>
                )}
                {zips.length === 1 && sale.zip && zipLabel(sale.zip) !== zips[0].zip && (
                  <span className="text-[11px] font-normal text-amber-700">
                    住所からは {zips[0].zip}（{zips[0].label}）
                    <button type="button" onClick={() => change({zip: zips[0].zip})} className="ml-1 underline hover:text-teal-700">
                      こちらにする
                    </button>
                  </span>
                )}
              </Field>
              <Field label="住所" wide field="address" warn={warn('address')}>
                <TextInput value={sale.address} onChange={changeAddress} placeholder="行橋市大字流末1327番地" aria-label="住所" />
              </Field>
              <Field label="電話" field="tel" warn={warn('tel')}>
                <TextInput value={sale.tel} onChange={(tel) => change({tel})} inputMode="tel" aria-label="電話" />
              </Field>
            </div>
          </Card>

          <Card title="介護保険">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="保険者（申請書を出す先）">
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
                </select>
              </Field>
              {sale.insurer === 'other' ? (
                <Field label="保険者の名前">
                  <TextInput value={sale.insurerName} onChange={(insurerName) => change({insurerName})} aria-label="保険者の名前" />
                </Field>
              ) : (
                <div />
              )}
              <Field label="負担割合（介護保険負担割合証）" field="burdenRatio">
                <Segmented<BurdenRatio>
                  ariaLabel="負担割合"
                  value={sale.burdenRatio}
                  onChange={(burdenRatio) => change({burdenRatio})}
                  options={[
                    [1, '1割'],
                    [2, '2割'],
                    [3, '3割'],
                  ]}
                />
              </Field>
              <Field label="支払方法">
                <Segmented<PayMethod>
                  ariaLabel="支払方法"
                  value={sale.payMethod}
                  onChange={(payMethod) => change({payMethod})}
                  options={[
                    ['受領委任払い', '受領委任払い'],
                    ['償還払い', '償還払い'],
                  ]}
                />
              </Field>
              <Field label={`今年度の残り（空欄なら ${yen(s.limit)}円）`}>
                <OptionalNumberInput value={sale.remaining} onChange={(remaining) => change({remaining})} placeholder={`空欄＝${yen(s.limit)}円`} ariaLabel="今年度の残り" />
                {prevYear.length > 0 && (
                  <span className="text-[11px] font-normal text-slate-600">
                    {fy ?? ''}年度の申請 {prevYear.length}件・{yen(usedYear)}円 → 残り {yen(Math.max(0, s.limit - usedYear))}円
                    {sale.remaining !== Math.max(0, s.limit - usedYear) && (
                      <button type="button" onClick={() => change({remaining: Math.max(0, s.limit - usedYear)})} className="ml-1 font-bold text-teal-700 underline">
                        入れる
                      </button>
                    )}
                  </span>
                )}
              </Field>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pb-2 text-sm text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={sale.perItem} onChange={(e) => change({perItem: e.target.checked})} />
                  個別切り上げ（品目ごと）
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={sale.welfare} onChange={(e) => change({welfare: e.target.checked})} />
                  生活保護
                </label>
              </div>
              {sale.insurer === 'miyako' && (
                <Field label="居宅サービス計画の届出（みやこ町の申請書）" field="carePlan" warn={warn('carePlan')}>
                  <Segmented<CarePlan>
                    ariaLabel="居宅サービス計画の届出"
                    value={carePlanOf(sale)}
                    onChange={(carePlan) => change({carePlan})}
                    options={[
                      ['有', '有'],
                      ['無', '無'],
                    ]}
                  />
                </Field>
              )}
            </div>
          </Card>

          <Card
            title="商品"
            field="items"
            warn={warn('items')}
            right={
              <>
                <Btn color="teal" onClick={() => setPicking(true)}>
                  ★ 商品を選ぶ
                </Btn>
                <Btn color="white" onClick={() => change({items: [...sale.items, blankItem(s)]})}>
                  ＋ 手で入れる
                </Btn>
              </>
            }
          >
            {sale.items.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">「★ 商品を選ぶ」から商品を入れてください。</p>
            ) : (
              <div className="space-y-3">
                {t.lines.map((l, idx) => {
                  const i = l.item;
                  const manual = i.productId === null;
                  return (
                    <div key={i.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="mt-2 grid h-6 w-6 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{idx + 1}</span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <TextInput value={i.name} onChange={(name) => changeItem(i.id, {name})} placeholder="商品名" className="w-full" aria-label="商品名" />
                          <div className="flex flex-wrap items-center gap-2">
                            <CategorySelect category={i.category} sub={i.sub} onChange={(category, sub) => changeItem(i.id, {category, sub})} ariaLabel="種目" />
                            {manual ? (
                              <>
                                <TextInput value={i.maker} onChange={(maker) => changeItem(i.id, {maker})} placeholder="メーカー" className="w-36" aria-label="メーカー" />
                                <TextInput value={i.code} onChange={(code) => changeItem(i.id, {code})} placeholder="品番" className="w-28" aria-label="品番" />
                              </>
                            ) : (
                              <span className="text-xs text-slate-500">{[i.maker, i.code, i.tais && `TAIS ${i.tais}`].filter(Boolean).join('　')}</span>
                            )}
                          </div>
                        </div>
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
                      <div className="mt-2 flex flex-wrap items-end gap-3 pl-8 text-xs font-bold text-slate-600">
                        <label className="grid gap-1">
                          数量
                          <Stepper value={i.qty} onChange={(qty) => changeItem(i.id, {qty: Math.max(1, Math.round(qty))})} ariaLabel={`${i.name}の数量`} />
                        </label>
                        <label className="grid gap-1">
                          定価（税抜）
                          <NumberInput value={i.listPrice} onChange={(listPrice) => changeItem(i.id, {listPrice})} min={0} blankZero className="w-24" ariaLabel="定価" />
                        </label>
                        <label className="grid gap-1">
                          割引（%）
                          <NumberInput value={i.discountRate} onChange={(discountRate) => changeItem(i.id, {discountRate: Math.min(100, discountRate)})} min={0} className="w-16" ariaLabel="割引率" />
                        </label>
                        <label className="grid gap-1">
                          販売単価（税抜）
                          <div className="flex items-center gap-1">
                            <NumberInput
                              value={l.unitPrice}
                              onChange={(unitPrice) => changeItem(i.id, {unitPrice})}
                              min={0}
                              className={`w-24 ${i.unitPrice !== null ? 'bg-amber-50' : ''}`}
                              ariaLabel="販売単価"
                            />
                            {i.unitPrice !== null && (
                              <button type="button" onClick={() => changeItem(i.id, {unitPrice: null})} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100" title="定価×割引に戻す" aria-label="販売単価を自動に戻す">
                                ↺
                              </button>
                            )}
                          </div>
                        </label>
                        {manual && (
                          <label className="grid gap-1">
                            仕切（税抜）
                            <NumberInput value={i.cost} onChange={(cost) => changeItem(i.id, {cost})} min={0} blankZero className="w-24" ariaLabel="仕切" />
                          </label>
                        )}
                        <label className="grid gap-1">
                          税
                          <select value={i.taxType} onChange={(e) => changeItem(i.id, {taxType: e.target.value as TaxType})} className="h-9 rounded-md border border-slate-300 px-1 text-sm" aria-label="税区分">
                            <option value="10%">課税</option>
                            <option value="8%">8%</option>
                            <option value="非課税">非課税</option>
                          </select>
                        </label>
                        <div className="ml-auto text-right text-sm font-normal text-slate-700">
                          <div className="tabular-nums">
                            金額 {yen(l.amount)}円 ＋ 税 {yen(l.tax)}円
                          </div>
                          <div className="text-base font-bold tabular-nums text-slate-900">購入金額 {yen(l.total)}円</div>
                          <div className="text-[11px] text-slate-500">{[priceNote(l), docLabel(i.category, i.sub)].filter(Boolean).join('　')}</div>
                        </div>
                      </div>
                      <div
                        className={`mt-2 grid min-w-0 grid-cols-1 gap-1 pl-8 text-xs font-bold text-slate-600 ${onShinsei && !i.reason.trim() ? 'rounded-sm bg-amber-50 outline outline-4 outline-amber-50' : ''}`}
                        data-field="reason"
                      >
                        福祉用具が必要な理由
                        <ReasonField item={i} sales={data.sales} saleId={sale.id} onChange={(reason) => changeItem(i.id, {reason})} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="担当・日付">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="担当（福祉用具専門相談員）" field="staff" warn={warn('staff')}>
                <select value={sale.staff} onChange={(e) => change({staff: e.target.value})} className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm" aria-label="担当">
                  <option value="">—</option>
                  {[...new Set([...s.staffList, sale.staff].filter(Boolean))].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="居宅介護支援事業所" field="recorder" warn={warn('recorder') && !sale.careOffice.trim()}>
                <TextInput value={sale.careOffice} onChange={(careOffice) => change({careOffice})} aria-label="居宅介護支援事業所" />
                <Suggest values={frequentValues(data.sales, (x) => x.careOffice)} current={sale.careOffice} onPick={(careOffice) => change({careOffice})} />
              </Field>
              <Field label="ケアマネジャー" field="recorder" warn={warn('recorder') && !sale.careManager.trim()}>
                <TextInput value={sale.careManager} onChange={(careManager) => change({careManager})} aria-label="ケアマネジャー" />
                <Suggest
                  values={frequentValues(data.sales, (x) => x.careManager, (x) => !sale.careOffice.trim() || x.careOffice.trim() === sale.careOffice.trim())}
                  current={sale.careManager}
                  onPick={(careManager) => change({careManager})}
                />
              </Field>
              <Field label="見積番号">
                <TextInput value={sale.quoteNo} onChange={(quoteNo) => change({quoteNo})} aria-label="見積番号" />
              </Field>
              <Field label="見積日">
                <input type="date" value={sale.estimateDate} onChange={(e) => change({estimateDate: e.target.value})} className={dateInput} aria-label="見積日" />
              </Field>
              <Field label="状態">
                <Segmented<SaleStatus> ariaLabel="状態" value={sale.status} onChange={setStatus} options={STATUSES.map((x) => [x, x] as const)} />
              </Field>
              <Field label="申請日" field="applyDate" warn={warn('applyDate')}>
                <input type="date" value={sale.applyDate} onChange={(e) => change({applyDate: e.target.value})} className={dateInput} aria-label="申請日" />
              </Field>
              <Field label="承認日">
                <input type="date" value={sale.approveDate} onChange={(e) => change({approveDate: e.target.value})} className={dateInput} aria-label="承認日" />
              </Field>
              <Field label="納品日（購入日）" field="deliveryDate" warn={warn('deliveryDate')}>
                <input type="date" value={sale.deliveryDate} onChange={(e) => change({deliveryDate: e.target.value})} className={dateInput} aria-label="納品日" />
              </Field>
              <Field label="支給申請日" field="claimDate">
                <input type="date" value={sale.claimDate} onChange={(e) => change({claimDate: e.target.value})} className={dateInput} aria-label="支給申請日" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="見積書の備考に足す文（デモ機など）">
                <textarea
                  value={sale.note}
                  onChange={(e) => change({note: e.target.value})}
                  rows={2}
                  className="rounded-md border border-slate-300 p-2 text-sm font-normal outline-none focus:border-blue-500"
                  aria-label="備考"
                />
              </Field>
            </div>
          </Card>
        </div>

        {onShinsei ? (
          <div className="min-w-0 space-y-3 lg:sticky lg:top-3 lg:self-start">
            <ShinseiPanel sale={sale} settings={s} />
            <div ref={previewBox} className="min-w-0 rounded-xl bg-slate-200/70 p-2 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto" style={{scrollbarGutter: 'stable'}}>
              {pages === null ? (
                <p className="p-6 text-center text-sm text-slate-500">申請書を開いています…</p>
              ) : (
                <ShinseiPages pages={pages} missing={missing} active={active} label={(f) => FIELD_LABEL[f]} onOpen={goField} scrollBox={previewBox} />
              )}
            </div>
          </div>
        ) : (
          <aside className="space-y-3 lg:sticky lg:top-3 lg:self-start">
            <section className="rounded-xl border border-teal-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-500">購入金額（税込）</div>
              <div className="text-3xl font-bold tabular-nums text-slate-900">{yen(t.total)}円</div>
              <div className="mt-1 text-xs tabular-nums text-slate-500">
                金額 {yen(t.amount)}円 ＋ 消費税 {yen(t.tax)}円
              </div>
              <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                <Row label="介護保険の対象" value={t.covered} />
                <Row label={`利用者負担（${t.ratio}割）`} value={t.userBurden} />
                {t.aid > 0 && <Row label={`介護扶助（${t.ratio}割）`} value={t.aid} />}
                <Row label={`保険者負担（${10 - t.ratio}割）`} value={t.insurerBurden} />
                {t.excess > 0 && <Row label="限度額を超えた分" value={t.excess} warn />}
                <div className="mt-2 flex items-baseline justify-between rounded-lg bg-amber-50 px-2 py-1.5">
                  <dt className="font-bold text-slate-700">{sale.payMethod === '償還払い' ? 'いったんお支払い' : 'お客様のお支払い'}</dt>
                  <dd className="text-lg font-bold tabular-nums text-slate-900">{yen(sale.payMethod === '償還払い' ? t.total : t.userPay)}円</dd>
                </div>
                {sale.payMethod === '償還払い' && <p className="text-xs text-slate-500">あとで保険者から {yen(t.insurerBurden)}円 が払い戻されます。</p>}
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">
                {t.remainingBlank ? `今年度の残りは空欄なので ${yen(t.limit)}円 として計算` : `今年度の残り ${yen(t.remaining)}円`}
                {t.perItemApplied && '・個別切り上げ'}
              </p>
              <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                <Row label="仕切の合計" value={t.costTotal} />
                <div className="flex items-baseline justify-between">
                  <dt className="text-slate-600">利益</dt>
                  <dd className={`tabular-nums ${t.lowProfit ? 'font-bold text-rose-600' : 'text-slate-800'}`}>
                    {yen(t.profit)}円（{t.amount > 0 ? Math.round(t.profitRate * 100) : 0}%）
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <Btn color="sky" className="w-full" onClick={() => onPrint(sale.id)}>
                  🖨 見積書を印刷
                </Btn>
              </div>
            </section>
            <div id="shinsei-panel">
              <ShinseiPanel sale={sale} settings={s} />
            </div>
            {warnings.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <ul className="list-disc space-y-1 pl-4">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>

      {pickingCustomer && <CustomerPicker sales={data.sales} current={sale} onPick={pickCustomer} onClose={() => setPickingCustomer(false)} />}
      {picking && (
        <ProductPicker
          products={data.products}
          settings={s}
          onClose={() => setPicking(false)}
          onToggleFavorite={(p) => update('products', (list) => list.map((x) => (x.id === p.id ? {...x, favorite: !x.favorite, updatedAt: Date.now()} : x)))}
          onPick={(p) => {
            update('sales', (list) => list.map((x) => (x.id === sale.id ? {...x, items: [...x.items, itemFromProduct(p, s)], updatedAt: Date.now()} : x)));
            update('products', (list) => markUsed(list, p.id));
          }}
        />
      )}
    </div>
  );
}

function Row({label, value, warn = false}: {label: string; value: number; warn?: boolean}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`tabular-nums ${warn ? 'font-bold text-rose-600' : 'text-slate-800'}`}>{yen(value)}円</dd>
    </div>
  );
}

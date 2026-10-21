import {useState} from 'react';
import type {ReactNode} from 'react';
import {priceNote, saleTotals} from '../calc.ts';
import {categoryLabel} from '../category.ts';
import {CARE_LEVELS, INSURERS, insurerLabel} from '../defaults.ts';
import {blankItem, copySale, customerLabel, itemFromProduct, markUsed, saleWarnings} from '../sales.ts';
import type {AppData, BurdenRatio, PayMethod, Sale, SaleItem, SaleStatus, TaxType} from '../types.ts';
import type {Update} from '../useStore.ts';
import {todayIso, yen} from '../util.ts';
import {saveEstimateXlsx} from '../print/estimateXlsx.ts';
import {CategorySelect} from './CategorySelect.tsx';
import {ProductPicker} from './ProductPicker.tsx';
import {Btn, NumberInput, OptionalNumberInput, Segmented, Stepper, TextInput, useToast} from './ui.tsx';

const STATUSES: SaleStatus[] = ['見積', '申請', '承認', '納品', '集金'];
// 状態を進めたとき、その日付が空なら今日を入れる
const STATUS_DATE: Partial<Record<SaleStatus, keyof Sale>> = {申請: 'applyDate', 承認: 'approveDate', 納品: 'deliveryDate', 集金: 'collectDate'};

function Card({title, children, right}: {title: string; children: ReactNode; right?: ReactNode}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-teal-800">{title}</h3>
        {right && <div className="ml-auto flex flex-wrap gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({label, children, wide = false}: {label: string; children: ReactNode; wide?: boolean}) {
  return (
    <label className={`grid min-w-0 content-start gap-1 text-xs font-bold text-slate-600 ${wide ? 'sm:col-span-2' : ''}`}>
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
  const s = data.settings;
  const t = saleTotals(sale, s);
  const warnings = saleWarnings(sale);

  const change = (patch: Partial<Sale>) =>
    update('sales', (list) => list.map((x) => (x.id === sale.id ? {...x, ...patch, updatedAt: Date.now()} : x)));
  const changeItem = (id: string, patch: Partial<SaleItem>) => change({items: sale.items.map((i) => (i.id === id ? {...i, ...patch} : i))});

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
          <Btn color="white" onClick={duplicate}>
            複製
          </Btn>
          <Btn color="rose" onClick={remove}>
            削除
          </Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card title="お客様">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="お客様名（様は付けない）">
                <TextInput value={sale.customer} onChange={(customer) => change({customer})} placeholder="例：山田 花子" aria-label="お客様名" />
              </Field>
              <Field label="フリガナ">
                <TextInput value={sale.kana} onChange={(kana) => change({kana})} placeholder="ヤマダ ハナコ" aria-label="フリガナ" />
              </Field>
              <Field label="被保険者番号">
                <TextInput
                  value={sale.insuredNo}
                  onChange={(insuredNo) => change({insuredNo: insuredNo.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 10)})}
                  inputMode="numeric"
                  placeholder="10けた"
                  aria-label="被保険者番号"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="生年月日">
                  <input type="date" value={sale.birthDate} onChange={(e) => change({birthDate: e.target.value})} className={dateInput} aria-label="生年月日" />
                </Field>
                <Field label="要介護度">
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
              <Field label="住所" wide>
                <TextInput value={sale.address} onChange={(address) => change({address})} placeholder="福岡県行橋市…" aria-label="住所" />
              </Field>
              <Field label="電話">
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
              <Field label="負担割合（介護保険負担割合証）">
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
            </div>
          </Card>

          <Card
            title="商品"
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
                          <div className="text-[11px] text-slate-500">{[priceNote(l), categoryLabel(i.category, i.sub)].filter(Boolean).join('　')}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="担当・日付">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="担当（福祉用具専門相談員）">
                <select value={sale.staff} onChange={(e) => change({staff: e.target.value})} className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm" aria-label="担当">
                  <option value="">—</option>
                  {[...new Set([...s.staffList, sale.staff].filter(Boolean))].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="居宅介護支援事業所">
                <TextInput value={sale.careOffice} onChange={(careOffice) => change({careOffice})} aria-label="居宅介護支援事業所" />
              </Field>
              <Field label="ケアマネジャー">
                <TextInput value={sale.careManager} onChange={(careManager) => change({careManager})} aria-label="ケアマネジャー" />
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
              <Field label="申請日">
                <input type="date" value={sale.applyDate} onChange={(e) => change({applyDate: e.target.value})} className={dateInput} aria-label="申請日" />
              </Field>
              <Field label="承認日">
                <input type="date" value={sale.approveDate} onChange={(e) => change({approveDate: e.target.value})} className={dateInput} aria-label="承認日" />
              </Field>
              <Field label="納品日（購入日）">
                <input type="date" value={sale.deliveryDate} onChange={(e) => change({deliveryDate: e.target.value})} className={dateInput} aria-label="納品日" />
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
      </div>

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

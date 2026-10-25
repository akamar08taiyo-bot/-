import {useDeferredValue, useMemo, useRef, useState} from 'react';
import type {FocusEvent, MouseEvent} from 'react';
import {saleTotals} from '../calc.ts';
import {insurerLabel} from '../defaults.ts';
import {HACCHU_IMPORT_KEY, hacchuImport, hacchuUrl, queueHacchu} from '../handoff.ts';
import {blankItem, copySale, customerLabel, customerPatch, itemFromProduct, makerChoices, markUsed, sameYearSales, saleWarnings} from '../sales.ts';
import {shinseiForm, shinseiValues} from '../shinsei.ts';
import {useTemplate} from '../shinseiFiles.ts';
import {FIELD_LABEL, missingFields, shinseiPreview} from '../shinseiPreview.ts';
import type {PvPage, ShinseiField} from '../shinseiPreview.ts';
import type {AppData, Sale, SaleItem, SaleStatus} from '../types.ts';
import type {Update} from '../useStore.ts';
import {todayIso, yen} from '../util.ts';
import {fiscalYearOf} from '../wareki.ts';
import {addressOfZip, zipCandidates, zipLabel} from '../zip.ts';
import {ESTIMATE_CAPACITY, ESTIMATE_LABEL, estimateNoteOverflow, estimateOverflow, estimatePreview} from '../estimateBook.ts';
import type {EstimateField} from '../estimateBook.ts';
import {saveEstimateBook, useEstimateTemplate} from '../print/estimateFiles.ts';
import {CustomerPicker} from './CustomerPicker.tsx';
import {EstimateInputs} from './EstimateInputs.tsx';
import {ProductPicker} from './ProductPicker.tsx';
import {ScanDialog} from './ScanDialog.tsx';
import {ShinseiInputs} from './ShinseiInputs.tsx';
import {ShinseiPanel} from './ShinseiPanel.tsx';
import {ShinseiPages} from './ShinseiPreview.tsx';
import {Btn, btnClass, useToast} from './ui.tsx';

// 状態を進めたとき、その日付が空なら今日を入れる
const STATUS_DATE: Partial<Record<SaleStatus, keyof Sale>> = {申請: 'applyDate', 承認: 'approveDate', 納品: 'deliveryDate', 集金: 'collectDate'};

export function SaleEditor({
  sale,
  data,
  update,
  onBack,
  onOpen,
  onPrint,
  fixedView,
}: {
  sale: Sale;
  data: AppData;
  update: Update;
  onBack: () => void;
  onOpen: (id: string) => void;
  onPrint: (id: string) => void;
  // 住宅改修のタブの中：申請書だけ（🛁 特定福祉用具申請書のタブ）・見積書だけ（販売見積書のタブ）。見積もり・申請書のタブは出さない
  fixedView?: 'quote' | 'shinsei';
}) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  // 「📷 スクショから自動認識」の窓（scanItem.ts）
  const [scanning, setScanning] = useState(false);
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

  // 見積もりの画面と、申請書の画面（左に申請書の順の入れる所、右に申請書の原本の形のままの大きいプレビュー。住宅改修の申請書と同じ）
  const form = shinseiForm(sale.insurer);
  const [view, setView] = useState<'quote' | 'shinsei'>(fixedView ?? 'quote');
  // 申請書だけの画面は、原本のない保険者でも入れる所を出す（保険者を選び直せるように）
  const onShinsei = view === 'shinsei' && (!!form || fixedView === 'shinsei');
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

  // 見積書の画面：右に会社の見積書の原本の形のままのプレビュー（ユーザーの指示「見積書の原本はこのような形にする。プレビューを見ながら入力」）
  const estTemplate = useEstimateTemplate(!onShinsei);
  const estPages = useMemo(() => (!onShinsei && estTemplate ? estimatePreview(estTemplate, shown, s) : null), [onShinsei, estTemplate, shown, s]);
  const estMissing = useMemo(() => {
    const out = new Set<EstimateField>();
    if (!sale.customer.trim()) out.add('customer');
    if (sale.items.length === 0) out.add('items');
    if (!sale.staff) out.add('staff');
    return out;
  }, [sale.customer, sale.items.length, sale.staff]);
  const [estActive, setEstActive] = useState<EstimateField | null>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const estBox = useRef<HTMLElement>(null);
  const onFocusEstimate = (e: FocusEvent<HTMLElement>) => {
    const f = (e.target as HTMLElement).closest('[data-field]')?.getAttribute('data-field');
    if (f && f in ESTIMATE_LABEL) setEstActive(f as EstimateField);
  };
  const goEstField = (f: EstimateField) => {
    const el = quoteRef.current?.querySelector<HTMLElement>(`[data-field="${f}"]`);
    if (!el) return;
    setEstActive(f);
    el.scrollIntoView({behavior: 'smooth', block: 'center'});
    el.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]), select, textarea, button')?.focus({preventScroll: true});
  };
  const saveExcel = () =>
    void saveEstimateBook(sale, s).then(
      (name) => toast(`${name} を保存しました`),
      (e: unknown) => toast(`見積書を保存できませんでした：${e instanceof Error ? e.message : String(e)}`, 'error'),
    );

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
    const patch: Partial<Sale> = {status, ...(key && !sale[key] ? {[key]: todayIso()} : {})};
    // 承認（か納品）にしたら、販売受注簿へ自動で送る（ユーザーの指示「販売受注簿にも自動で転記する」。1回だけ。受注簿ツールを開くと「受注簿に入れる」が出る）
    if ((status === '承認' || status === '納品') && !sale.hacchuSentAt && sale.items.length > 0) {
      try {
        if (queueHacchu({...sale, ...patch}, s)) {
          patch.hacchuSentAt = Date.now();
          toast('販売受注簿へ送りました');
        }
      } catch {
        toast('販売受注簿へ送れませんでした（この端末のブラウザに保存できません）', 'error');
      }
    }
    change(patch);
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
      change({hacchuSentAt: Date.now()}); // 承認にしたときに、もう一度自動で送らない
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
        {/* 申請書だけの画面（住宅改修の申請書のタブの中）には、見積書のボタンを出さない（販売見積書のタブにある） */}
        {fixedView !== 'shinsei' && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Btn color="sky" onClick={() => onPrint(sale.id)}>
              🖨 見積書を印刷
            </Btn>
            <Btn color="excel" onClick={saveExcel}>
              📗 Excelで保存
            </Btn>
            {form && !fixedView && (
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
        )}
      </div>

      {form && !fixedView && (
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

      {onShinsei ? (
        // 申請書の画面：左に申請書の順の入れる所（狭く）、右に申請書のプレビュー（大きく。画面の高さで止まり中だけ動く）
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
          <ShinseiInputs
            sale={sale}
            data={data}
            formKey={form?.key ?? null}
            lines={t.lines}
            missing={missing}
            active={active}
            inputsRef={inputsRef}
            onFocusField={onFocusField}
            change={change}
            changeItem={changeItem}
            changeAddress={changeAddress}
            changeZip={changeZip}
            zips={zips}
            onPickProduct={() => setPicking(true)}
            onScan={() => setScanning(true)}
            onAddItem={() => change({items: [...sale.items, blankItem(s)]})}
            onPickCustomer={() => setPickingCustomer(true)}
          />
          <div className="min-w-0 space-y-3 lg:sticky lg:top-3 lg:self-start">
            <ShinseiPanel sale={sale} settings={s} />
            <div ref={previewBox} className="min-w-0 rounded-xl bg-slate-200/70 p-2 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto" style={{scrollbarGutter: 'stable'}}>
              {!form ? (
                <p className="p-6 text-center text-sm text-slate-500">この保険者の申請書の原本はまだありません</p>
              ) : pages === null ? (
                <p className="p-6 text-center text-sm text-slate-500">申請書を開いています…</p>
              ) : (
                <ShinseiPages pages={pages} missing={missing} active={active} label={(f) => FIELD_LABEL[f]} onOpen={goField} scrollBox={previewBox} />
              )}
            </div>
          </div>
        </div>
      ) : (
        // 見積書の画面：左に見積書の順の入れる所（申請書の画面と同じ形。狭く）、右に見積書のプレビュー（大きく。画面の高さで止まり中だけ動く）と金額のまとめ
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
          <EstimateInputs
            sale={sale}
            data={data}
            totals={t}
            missing={estMissing}
            active={estActive}
            inputsRef={quoteRef}
            onFocusField={onFocusEstimate}
            change={change}
            changeItem={changeItem}
            changeAddress={changeAddress}
            changeZip={changeZip}
            zips={zips}
            setStatus={setStatus}
            usedYear={prevYear.length ? {count: prevYear.length, used: usedYear, label: `${fy ?? ''}年度`} : null}
            onPickProduct={() => setPicking(true)}
            onScan={() => setScanning(true)}
            onAddItem={() => change({items: [...sale.items, blankItem(s)]})}
            onPickCustomer={() => setPickingCustomer(true)}
            withShinsei={fixedView !== 'quote'}
          />

            <aside ref={estBox} className="min-w-0 space-y-3 lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)] lg:self-start lg:overflow-y-auto" style={{scrollbarGutter: 'stable'}}>
              <section className="rounded-xl bg-slate-200/70 p-2">
                {estimateOverflow(sale) > 0 && <p className="mb-2 rounded-md bg-rose-50 p-2 text-xs font-bold text-rose-700">見積書の明細は3ページ・{ESTIMATE_CAPACITY}点までです（{estimateOverflow(sale)}点が入りません）</p>}
                {estimateNoteOverflow(sale, s) > 0 && (
                  <p className="mb-2 rounded-md bg-rose-50 p-2 text-xs font-bold text-rose-700">見積書の備考は3行までです（介護保険の内訳とあわせて。{estimateNoteOverflow(sale, s)}行が入りません）</p>
                )}
                {estPages === null ? (
                  <p className="p-6 text-center text-sm text-slate-500">見積書を開いています…</p>
                ) : (
                  <ShinseiPages<EstimateField> pages={estPages} missing={estMissing} active={estActive} label={(f) => ESTIMATE_LABEL[f]} onOpen={goEstField} scrollBox={estBox} title="見積書のプレビュー" tone="green" />
                )}
              </section>
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
              {fixedView !== 'quote' && (
                <div id="shinsei-panel">
                  <ShinseiPanel sale={sale} settings={s} />
                </div>
              )}
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
      )}

      {scanning && (
        <ScanDialog
          settings={s}
          makers={makerChoices(data.products, data.sales)}
          onAdd={(item) => update('sales', (list) => list.map((x) => (x.id === sale.id ? {...x, items: [...x.items, item], updatedAt: Date.now()} : x)))}
          onClose={() => setScanning(false)}
        />
      )}
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

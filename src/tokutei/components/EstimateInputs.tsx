// 見積書の画面の左の入れる所：見積書の上からの順に1行ずつ（申請書の画面の ShinseiInputs と同じ形。ユーザーの指示「見積書は、住宅改修申請書や、特定福祉用具申請書みたいに、
// プレビューも見ながら入力しやすいようにする。入力の感じはにせる」「入力項目も、行を見やすくして、入力しやすいようにする」2026-10-25）。
// 右の見積書のプレビューの欄を押すと、ここのその行へ（data-field）。まだ入っていない行・入れている行は薄い黄色（見積書の水色と分かれるよう。
// ユーザーの指示「見積もりが水色で…わかりづらい」「入力欄では、緑ではなく薄い黄色。特定福祉用具や住宅改修と同様」2026-10-26。前は緑の枠）。見出しの地は申請書と同じ薄い灰色。
// 下の「お客様・申請」の行は見積書には出ないが、申請書と販売受注簿に使う（申請書の画面と同じ値）
import {useMemo, useState} from 'react';
import type {FocusEvent, ReactNode, RefObject} from 'react';
import {basisNote, lineOf, priceNote} from '../calc.ts';
import type {Line, Totals} from '../calc.ts';
import {CARE_LEVELS, INSURERS} from '../defaults.ts';
import {showsSelfPay, userBurdenLine} from '../estimateBook.ts';
import type {EstimateField} from '../estimateBook.ts';
import {blankItem, makerChoices, suggestValues, unregisteredItems} from '../sales.ts';
import {carePlanOf} from '../shinsei.ts';
import type {AppData, BurdenRatio, CarePlan, Gender, PayMethod, Sale, SaleItem, SaleStatus, TaxType} from '../types.ts';
import {yen} from '../util.ts';
import {zipLabel} from '../zip.ts';
import type {ZipHit} from '../zip.ts';
import {CategorySelect} from './CategorySelect.tsx';
import {MakerInput} from './MakerInput.tsx';
import {ReasonField} from './ReasonField.tsx';
import {AddItemButton, CatalogSearch, Circles, EraBirthInput, InsuredNoInput, KanaInput} from './ShinseiParts.tsx';
import {SuggestInput} from './Suggest.tsx';
import {Btn, NumberInput, OptionalNumberInput, Stepper, TextInput} from './ui.tsx';

const dateInput = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-blue-500';
const STATUSES: SaleStatus[] = ['見積', '申請', '承認', '納品', '集金'];

export function EstimateInputs({
  sale,
  data,
  totals: t,
  missing,
  active,
  inputsRef,
  onFocusField,
  change,
  changeItem,
  changeAddress,
  changeZip,
  zips,
  setStatus,
  usedYear,
  onPickProduct,
  onScan,
  onCatalog,
  onAddItem,
  onPickCustomer,
  onFavorite,
  onHideSuggest,
  withShinsei,
}: {
  sale: Sale;
  data: AppData;
  totals: Totals;
  missing: Set<EstimateField>;
  active: EstimateField | null;
  inputsRef: RefObject<HTMLDivElement | null>;
  onFocusField: (e: FocusEvent<HTMLElement>) => void;
  change: (patch: Partial<Sale>) => void;
  changeItem: (id: string, patch: Partial<SaleItem>) => void;
  changeAddress: (address: string) => void;
  changeZip: (zip: string) => void;
  zips: ZipHit[];
  setStatus: (status: SaleStatus) => void;
  usedYear: {count: number; used: number; label: string} | null; // 今年度の申請（このアプリの記録）
  onPickProduct: () => void;
  onScan: () => void; // 「📷 スクショから自動認識」の窓を開く（scanItem.ts）
  onCatalog: (query: string) => void; // 右にカタログの窓を開く（print/CatalogViewer.tsx）
  onAddItem: (item?: SaleItem) => void; // 手で入れる商品を足す（item があればその商品＝最初から開いている欄に打ったもの）
  onPickCustomer?: () => void; // 住宅改修の様邸のタブの中では渡さない（お客様の情報は様邸から入る。ユーザーの指示「赤枠の部分は不要です」2026-10-28）
  onFavorite: (itemId: string) => void; // 手で入れた商品を商品マスタの★お気に入りに
  onHideSuggest: (v: string) => void; // 居宅介護支援事業所・ケアマネジャーの▼のリストから消す（設定の hiddenSuggest）
  withShinsei: boolean; // 下の「お客様・申請」の行も出す（住宅改修の販売見積書のタブの中では、お客様の情報は住宅改修と特定福祉用具申請書のタブで入れるので出さない）
}) {
  const makers = useMemo(() => makerChoices(data.products, data.sales), [data.products, data.sales]);
  const s = data.settings;
  /** 1行（左に見積書の言葉、右に入れる所。field があればプレビューの欄とつなぐ） */
  const row = (label: ReactNode, children: ReactNode, field?: EstimateField, warn = field ? missing.has(field) : false) => (
    <div
      data-field={field}
      className={`border-b border-slate-300 last:border-b-0 sm:grid sm:grid-cols-[8.5rem_1fr] ${field && active === field ? 'relative z-[1] bg-amber-50/60 outline outline-2 -outline-offset-2 outline-amber-300' : ''}`}
    >
      <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">{label}</div>
      <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 ${warn ? 'bg-amber-50' : ''}`}>{children}</div>
    </div>
  );
  /** 見出しの行（まとまりの区切り） */
  const head = (text: string) => <div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold tracking-wide text-slate-600">{text}</div>;
  const left = Math.max(0, s.limit - (usedYear?.used ?? 0));
  // 商品がないときも、手で入れる欄を1つ開いておく（申請書のタブと同じ。ユーザーの指示「基本は手で入れるのがデフォルトなので開いておく　２商品名以降は追加する」）
  const [draft] = useState(() => blankItem(s));
  const unregistered = new Set(unregisteredItems(sale, data.products).map((i) => i.id));
  return (
    <div ref={inputsRef} onFocusCapture={onFocusField} className="min-w-0 space-y-2">
      {onPickCustomer && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn color="white" small onClick={onPickCustomer}>
            👤 前のお客様から入れる
          </Btn>
        </div>
      )}
      <div role="form" aria-label="見積書に入れる所" className="overflow-hidden rounded-xl border-2 border-slate-400 bg-white shadow-sm">
        {row(
          '宛名（お客様名）',
          <>
            <TextInput value={sale.customer} onChange={(customer) => change({customer})} placeholder="山田 花子" className="min-w-0 flex-1" aria-label="お客様名" />
            <span className="text-sm text-slate-600">様</span>
          </>,
          'customer',
        )}
        {row('見積番号', <TextInput value={sale.quoteNo} onChange={(quoteNo) => change({quoteNo})} className="w-48" aria-label="見積番号" />, 'quoteNo')}
        {row('見積日', <input type="date" value={sale.estimateDate} onChange={(e) => change({estimateDate: e.target.value})} className={dateInput} aria-label="見積日" />, 'estimateDate')}
        {row(
          '担当',
          <select value={sale.staff} onChange={(e) => change({staff: e.target.value})} className="h-9 w-48 min-w-0 rounded-md border border-slate-300 px-2 text-sm" aria-label="担当">
            <option value="">—</option>
            {[...new Set([...s.staffList, sale.staff].filter(Boolean))].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>,
          'staff',
        )}
        {row(
          '商品',
          <div className="w-full space-y-3">
            {t.lines.map((l, idx) => (
              <ItemBlock
                key={l.item.id}
                line={l}
                no={idx + 1}
                makers={makers}
                change={(patch) => changeItem(l.item.id, patch)}
                remove={() => change({items: sale.items.filter((x) => x.id !== l.item.id)})}
                favorite={unregistered.has(l.item.id) ? () => onFavorite(l.item.id) : undefined}
              />
            ))}
            {t.lines.length === 0 && <ItemBlock key={draft.id} line={lineOf(draft, s)} no={1} makers={makers} change={(patch) => onAddItem({...draft, ...patch})} />}
            {t.lines.length > 0 && (
              <AddItemButton
                next={t.lines.length + 1}
                noun="商品"
                onAdd={() => {
                  const item = blankItem(s);
                  onAddItem(item);
                  return item.id;
                }}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Btn color="teal" small onClick={onPickProduct}>
                ★ 商品を選ぶ
              </Btn>
              <Btn color="purple" small onClick={onScan}>
                📷 スクショから自動認識
              </Btn>
              <CatalogSearch onOpen={onCatalog} />
            </div>
          </div>,
          'items',
        )}
        {head('介護保険（見積書の備考に内訳）')}
        {row(
          '保険者',
          <>
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
            {sale.insurer === 'other' && <TextInput value={sale.insurerName} onChange={(insurerName) => change({insurerName})} placeholder="保険者の名前" className="w-full" aria-label="保険者の名前" />}
          </>,
        )}
        {row(
          '負担割合',
          <Circles<BurdenRatio>
            label="負担割合"
            value={sale.burdenRatio}
            onPick={(burdenRatio) => burdenRatio && change({burdenRatio})}
            options={[
              [1, '1割'],
              [2, '2割'],
              [3, '3割'],
            ]}
          />,
          undefined,
          sale.burdenRatio === null, // 未選択なら薄い黄色（選ぶまで自己負担額は出さない）
        )}
        {row(
          '支払方法',
          <Circles<PayMethod>
            label="支払方法"
            value={sale.payMethod}
            onPick={(payMethod) => payMethod && change({payMethod})}
            options={[
              ['受領委任払い', '受領委任払い'],
              ['償還払い', '償還払い'],
            ]}
          />,
        )}
        {row(
          '今年度の残り',
          <div className="grid w-full gap-1">
            <OptionalNumberInput value={sale.remaining} onChange={(remaining) => change({remaining})} placeholder={`空欄＝${yen(s.limit)}円`} ariaLabel="今年度の残り" className="w-40" />
            {usedYear && usedYear.count > 0 && (
              <span className="text-[11px] text-slate-600">
                {usedYear.label}の申請 {usedYear.count}件・{yen(usedYear.used)}円 → 残り {yen(left)}円
                {sale.remaining !== left && (
                  <button type="button" onClick={() => change({remaining: left})} className="ml-1 font-bold text-teal-700 underline">
                    入れる
                  </button>
                )}
              </span>
            )}
          </div>,
        )}
        {row(
          '計算のしかた',
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={sale.perItem} onChange={(e) => change({perItem: e.target.checked})} />
              個別切り上げ（品目ごと）
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={sale.welfare} onChange={(e) => change({welfare: e.target.checked})} />
              生活保護
            </label>
          </div>,
        )}
        {/* オンにすると、見積書の明細の最後の商品の2行下から介護保険の内訳（介護保険の対象・利用者負担＝赤字・保険者負担）を1行ずつ（ユーザーの指示「自己負担額を表示のオンオフっていうチェック項目を入れ」
            「この部分のみ記載する形で良い　利用者負担額の部分のみ赤字で記載する」2026-10-26）。初めはオン */}
        {row(
          '自己負担額',
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={sale.showSelfPay !== false} onChange={(e) => change({showSelfPay: e.target.checked})} />
              自己負担額を表示
            </label>
            {showsSelfPay(sale) && t.covered > 0 && t.ratioSet && <span className="tabular-nums text-red-600">{userBurdenLine(t)}</span>}
          </div>,
          'selfPay',
        )}
        {row(
          '備考に足す文',
          <textarea
            value={sale.note}
            onChange={(e) => change({note: e.target.value})}
            rows={2}
            className="w-full rounded-md border border-slate-300 p-2 text-sm font-normal outline-none focus:border-blue-500"
            aria-label="備考"
          />,
          'note',
        )}
        {head('状態')}
        {row('状態', <Circles<SaleStatus> label="状態" value={sale.status} onPick={(x) => x && setStatus(x)} options={STATUSES.map((x) => [x, x] as const)} />)}
        {row('納品日（購入日）', <input type="date" value={sale.deliveryDate} onChange={(e) => change({deliveryDate: e.target.value})} className={dateInput} aria-label="納品日" />)}
        {withShinsei && (
          <>
            {head('お客様・申請（申請書と販売受注簿に使う）')}
            {row(
              <span>
                フリガナ
                <span className="block text-xs font-normal text-slate-500">（ひらがなで入力してもカタカナになります）</span>
              </span>,
              <KanaInput value={sale.kana} onChange={(kana) => change({kana})} placeholder="ヤマダ　ハナコ" className="w-full" aria-label="フリガナ" />,
            )}
            {row('被保険者番号', <InsuredNoInput value={sale.insuredNo} onChange={(insuredNo) => change({insuredNo})} />)}
            {row('生年月日', <EraBirthInput value={sale.birthDate} onChange={(birthDate) => change({birthDate})} />)}
            {row(
              '性別',
              <Circles<Gender>
                label="性別"
                value={sale.gender}
                onPick={(gender) => change({gender})}
                clearable
                options={[
                  ['男', '男'],
                  ['女', '女'],
                ]}
              />,
            )}
            {row('要介護状態区分', <Circles<string> label="要介護状態区分" value={sale.careLevel} onPick={(careLevel) => change({careLevel})} clearable options={CARE_LEVELS.map((c) => [c, c] as const)} />)}
            {row(
              '郵便番号',
              <>
                <span className="inline-flex items-center gap-1">
                  〒
                  <TextInput value={sale.zip} onChange={changeZip} onBlur={() => sale.zip && change({zip: zipLabel(sale.zip)})} inputMode="numeric" placeholder="824-0000" className="w-32" aria-label="郵便番号" />
                </span>
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
            )}
            {row('住所', <TextInput value={sale.address} onChange={changeAddress} placeholder="行橋市大字流末1327番地" className="w-full" aria-label="住所" />)}
            {row('電話', <TextInput value={sale.tel} onChange={(tel) => change({tel})} inputMode="tel" className="w-44" aria-label="電話" />)}
            {(sale.insurer === 'miyako' || sale.insurer === 'kouiki') &&
              row(
                '居宅サービス計画の届出',
                <Circles<CarePlan>
                  label="居宅サービス計画の届出"
                  value={carePlanOf(sale)}
                  onPick={(carePlan) => carePlan && change({carePlan})}
                  options={[
                    ['有', '有'],
                    ['無', '無'],
                  ]}
                />,
              )}
            {row(
              // 見出しは「・」の後ろで折り返す（前は「居宅・ケアマネジ／ャー」と折れていた）。事業所名は行いっぱい、ケアマネジャーはその下（申請書のタブと同じ）
              <span>
                居宅・<wbr />
                ケアマネジャー
              </span>,
              <div className="grid w-full gap-2">
                <SuggestInput
                  value={sale.careOffice}
                  onChange={(careOffice) => change({careOffice})}
                  values={suggestValues(data.sales, data.settings.hiddenSuggest, (x) => x.careOffice)}
                  onHide={onHideSuggest}
                  placeholder="居宅介護支援事業所"
                  label="居宅介護支援事業所"
                />
                <div className="min-w-0 sm:w-64">
                  <SuggestInput
                    value={sale.careManager}
                    onChange={(careManager) => change({careManager})}
                    values={suggestValues(data.sales, data.settings.hiddenSuggest, (x) => x.careManager, (x) => !sale.careOffice.trim() || x.careOffice.trim() === sale.careOffice.trim())}
                    onHide={onHideSuggest}
                    placeholder="ケアマネジャー"
                    label="ケアマネジャー"
                  />
                </div>
              </div>,
            )}
            {row(
              '福祉用具が必要な理由',
              <div className="w-full space-y-2">
                {t.lines.length === 0 && <span className="text-xs text-slate-500">商品を入れると、商品ごとに書けます。</span>}
                {t.lines.map((l) => (
                  <div key={l.item.id} className="grid min-w-0 gap-1 text-xs font-bold text-slate-600">
                    {l.item.name || '商品'}
                    <ReasonField item={l.item} sales={data.sales} saleId={sale.id} onChange={(reason) => changeItem(l.item.id, {reason})} />
                  </div>
                ))}
              </div>,
            )}
            {row('申請日', <input type="date" value={sale.applyDate} onChange={(e) => change({applyDate: e.target.value})} className={dateInput} aria-label="申請日" />)}
            {row('承認日', <input type="date" value={sale.approveDate} onChange={(e) => change({approveDate: e.target.value})} className={dateInput} aria-label="承認日" />)}
            {row('支給申請日', <input type="date" value={sale.claimDate} onChange={(e) => change({claimDate: e.target.value})} className={dateInput} aria-label="支給申請日" />)}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 商品1点。申請書のタブの福祉用具の欄と同じ形にそろえる：1行目に番号・種目・✕、その下に商品名（横いっぱい）、メーカー・品番、
 * 左に見出し・右に入れる所の表（定価・割引率・単価・数量と単位・税率・備考（算出根拠）・仕切）、いちばん下に金額。
 * 前は見積書の明細の1行と同じ並びを4列に詰めていて、定価（135,000）・税率（10%）・品番が欄の幅で切れ、「定価（税抜）」の見出しが2行に折れていた（2026-10-26 のデバッグで見つけた）
 */
function ItemBlock({
  line: l,
  no,
  makers,
  change,
  remove,
  favorite,
}: {
  line: Line;
  no: number;
  makers: string[];
  change: (patch: Partial<SaleItem>) => void;
  remove?: () => void;
  favorite?: () => void; // 手で入れた商品を★お気に入りに（まだ商品マスタにないときだけ）
}) {
  const i = l.item;
  const manual = i.productId === null;
  const auto = basisNote(l);
  return (
    <div data-item={i.id} className="grid gap-2 rounded-md border border-slate-200 bg-white p-2">
      {/* 種目 → 商品名の順（申請書のタブと同じ。ユーザーの指示「入力順は、種目、商品名の順」2026-10-26）。消すのは右上 */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{no}</span>
        <CategorySelect category={i.category} sub={i.sub} onChange={(category, sub) => change({category, sub})} ariaLabel="種目" className="w-48" />
        {remove && (
          <button type="button" onClick={remove} className="ml-auto rounded px-2 py-1 text-rose-500 hover:bg-rose-50" aria-label={`${i.name || '商品'}を消す`} title="消す">
            ✕
          </button>
        )}
      </div>
      <TextInput value={i.name} onChange={(name) => change({name})} placeholder="商品名" className="ml-8 min-w-0" aria-label="商品名" />
      <div className="flex min-w-0 flex-wrap items-center gap-2 pl-8 text-xs text-slate-500">
        {manual ? (
          <>
            <MakerInput value={i.maker} onChange={(maker) => change({maker})} choices={makers} className="w-56" />
            <TextInput value={i.code} onChange={(code) => change({code})} placeholder="品番" className="w-48" aria-label="品番" />
          </>
        ) : (
          <span>{[i.maker, i.code, i.tais && `TAIS ${i.tais}`].filter(Boolean).join('　')}</span>
        )}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 pl-8 text-xs font-bold text-slate-500">
        定価（税抜）
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <NumberInput value={i.listPrice} onChange={(listPrice) => change({listPrice})} min={0} blankZero className="w-28" ariaLabel="定価" />
          {favorite && (
            <Btn color="white" small onClick={favorite} aria-label={`${i.name}をお気に入りに登録`}>
              ☆ お気に入りに登録
            </Btn>
          )}
        </div>
        割引率
        <div className="flex items-center gap-1">
          <NumberInput value={i.discountRate} onChange={(discountRate) => change({discountRate: Math.min(100, discountRate)})} min={0} className="w-16" ariaLabel="割引率" />%
        </div>
        単価（税抜）
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <NumberInput value={l.unitPrice} onChange={(unitPrice) => change({unitPrice})} min={0} className={`w-28 ${i.unitPrice !== null ? 'bg-amber-50' : ''}`} ariaLabel="販売単価" />
          {i.unitPrice !== null && (
            <button type="button" onClick={() => change({unitPrice: null})} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100" title="定価×割引に戻す" aria-label="販売単価を自動に戻す">
              ↺
            </button>
          )}
        </div>
        数量
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Stepper value={i.qty} onChange={(qty) => change({qty: Math.max(1, Math.round(qty))})} ariaLabel={`${i.name}の数量`} />
          <TextInput value={i.unit} onChange={(unit) => change({unit})} placeholder="台" className="w-16" aria-label="単位" />
        </div>
        税率
        <select value={i.taxType} onChange={(e) => change({taxType: e.target.value as TaxType})} className="h-9 w-28 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800" aria-label="税区分">
          <option value="10%">10%</option>
          <option value="8%">軽減 8%</option>
          <option value="非課税">非課税</option>
        </select>
        {manual && (
          <>
            仕切（税抜・任意）
            <NumberInput value={i.cost} onChange={(cost) => change({cost})} min={0} blankZero className="w-28" ariaLabel="仕切" />
          </>
        )}
      </div>
      {/* 備考（算出根拠）は横いっぱい（表の右の列だとスマホの幅で「定価135,000円の20%引き」が切れた） */}
      <div className="grid gap-0.5 pl-8 text-xs font-bold text-slate-500">
        備考（算出根拠）
        <div className="flex min-w-0 items-center gap-1">
          <TextInput
            value={typeof i.basisNote === 'string' ? i.basisNote : auto}
            onChange={(v) => change({basisNote: v === auto ? null : v})}
            placeholder="定価28,000円の20%引き"
            className="min-w-0 flex-1"
            aria-label="算出根拠"
          />
          {typeof i.basisNote === 'string' && (
            <button type="button" onClick={() => change({basisNote: null})} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100" title="定価と割引から書き直す" aria-label="算出根拠を自動に戻す">
              ↺
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 pl-8 tabular-nums">
        <span className="text-[11px] text-slate-500">{priceNote(l)}</span>
        <span className="text-xs text-slate-500">
          金額 {yen(l.amount)}円 ＋ 税 {yen(l.tax)}円
        </span>
        <span className="text-base font-bold text-slate-900">{yen(l.total)}円</span>
      </div>
    </div>
  );
}

// 申請書の画面の左の入れる所：申請書の上からの順に1行ずつ（住宅改修の申請書のタブと同じ形。ユーザーの指示「住宅改修と同様に、申請書のページをメインに大きくおいてください」2026-10-23）。
// 入れ方・色も住宅改修と同じ（ユーザーの指示「生年月日なども含め、入力の仕方や色など、住宅改修と同じ入力方法にする」2026-10-26。ShinseiParts.tsx）：
// 上に保険者と申請書の名前、選ぶ所は丸のボタン、フリガナはカタカナに、被保険者番号は10マス、生年月日は元号と年月日、Enter で次の欄。
// 右のプレビュー（ShinseiPreview.tsx）の欄を押すと、ここのその行へ（data-field）。まだ入っていない行は薄い黄色。
// 値は案件（Sale）のまま（見積書と同じ値。金額は見積書の側で入れる。ここでは購入金額を出すだけ）
import {useMemo, useState} from 'react';
import type {ReactNode, RefObject} from 'react';
import type {FocusEvent} from 'react';
import {lineOf, unitPricePatch} from '../calc.ts';
import type {Line} from '../calc.ts';
import {CARE_LEVELS, INSURERS} from '../defaults.ts';
import {blankItem, makerChoices, suggestValues, unregisteredItems} from '../sales.ts';
import {carePlanOf, shinseiForm} from '../shinsei.ts';
import type {ShinseiKey} from '../shinsei.ts';
import type {ShinseiField} from '../shinseiPreview.ts';
import type {AppData, BurdenRatio, CarePlan, Gender, PayMethod, Sale, SaleItem} from '../types.ts';
import {yen} from '../util.ts';
import {zipLabel} from '../zip.ts';
import type {ZipHit} from '../zip.ts';
import {CategorySelect} from './CategorySelect.tsx';
import {MakerInput} from './MakerInput.tsx';
import {ReasonField} from './ReasonField.tsx';
import {AddItemButton, CatalogSearch, Circles, EraBirthInput, InsuredNoInput, KanaInput, nextOnEnter} from './ShinseiParts.tsx';
import {SuggestInput} from './Suggest.tsx';
import {Btn, NumberInput, Stepper, TextInput} from './ui.tsx';

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
  onCatalog,
  onAddItem,
  onPickCustomer,
  onFavorite,
  onHideSuggest,
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
  onCatalog: (query: string) => void; // 右にカタログの窓を開く（print/CatalogViewer.tsx）
  onAddItem: (item?: SaleItem) => void; // 手で入れる商品を足す（item があればその商品＝最初から開いている欄に打ったもの）
  onPickCustomer?: () => void; // 住宅改修の様邸のタブの中では渡さない（お客様の情報は様邸から入る。ユーザーの指示「赤枠の部分は不要です」2026-10-28）
  onFavorite: (itemId: string) => void; // 手で入れた商品を商品マスタの★お気に入りに
  onHideSuggest: (v: string) => void; // 居宅介護支援事業所・ケアマネジャーの▼のリストから消す（設定の hiddenSuggest）
}) {
  const makers = useMemo(() => makerChoices(data.products, data.sales), [data.products, data.sales]);
  const s = data.settings;
  /** 1行（左に申請書の言葉、右に入れる所。field があればプレビューの欄とつなぐ） */
  const row = (label: ReactNode, children: ReactNode, field?: ShinseiField, warn = field ? missing.has(field) : false) => (
    <div
      data-field={field}
      className={`border-b border-slate-300 last:border-b-0 sm:grid sm:grid-cols-[9.5rem_1fr] ${field && active === field ? 'relative z-[1] outline outline-2 -outline-offset-2 outline-sky-500' : ''}`}
    >
      <div className="flex flex-wrap items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">{label}</div>
      <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 ${warn ? 'bg-amber-50' : ''}`}>{children}</div>
    </div>
  );
  const kouiki = formKey === 'kouiki';
  // 商品がないときも、手で入れる欄を1つ開いておく（ふだんは手で入れるので。ユーザーの指示「手でいれるではなく、基本は手で入れるのがデフォルトなので開いておく
  // ２商品名以降は追加する」2026-10-26）。打つとその商品ができる（id を同じにして、打っている欄から外れないように）
  const [draft] = useState(() => blankItem(s));
  const rows: Line[] = lines.length ? lines : [lineOf(draft, s)];
  const changeRow = (id: string, patch: Partial<SaleItem>) => (lines.length ? changeItem(id, patch) : onAddItem({...draft, ...patch}));
  const unregistered = new Set(unregisteredItems(sale, data.products).map((i) => i.id));
  const title = shinseiForm(sale.insurer)?.title;
  const insurerName = INSURERS.find((i) => i.key === sale.insurer)?.label;
  return (
    <div ref={inputsRef} onFocusCapture={onFocusField} className="min-w-0 space-y-2">
      {onPickCustomer && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn color="white" small onClick={onPickCustomer}>
            👤 前のお客様から入れる
          </Btn>
        </div>
      )}
      <div role="form" aria-label="申請書に入れる所" onKeyDown={nextOnEnter} className="overflow-hidden rounded-lg border-2 border-slate-700 bg-white shadow-sm">
        {title && (
          <div className="border-b-2 border-slate-700 px-4 py-2.5 text-center text-base font-bold text-slate-800">
            {insurerName}　{title}
          </div>
        )}
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
        {row(
          <span>
            フリガナ
            {/* 住宅改修と同じ注記（ユーザーの指示「振り仮名の横に括弧で、ひらがな入力でも自動的にカタカナに変換…を記載する」）。見出しが縦に並ばないよう下の行に */}
            <span className="block text-xs font-normal text-slate-500">（ひらがなで入力してもカタカナになります）</span>
          </span>,
          <KanaInput value={sale.kana} onChange={(kana) => change({kana})} placeholder="ヤマダ　ハナコ" className="w-full max-w-md" aria-label="フリガナ" data-nav />,
          'kana',
        )}
        {row('被保険者氏名', <TextInput value={sale.customer} onChange={(customer) => change({customer})} placeholder="山田　花子" className="w-full max-w-md text-base font-bold" aria-label="お客様名" data-nav />, 'customer')}
        {row('被保険者番号', <InsuredNoInput value={sale.insuredNo} onChange={(insuredNo) => change({insuredNo})} />, 'insuredNo')}
        {row('生年月日', <EraBirthInput value={sale.birthDate} onChange={(birthDate) => change({birthDate})} />, 'birthDate')}
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
          'gender',
        )}
        {row(
          '郵便番号',
          <>
            <span className="inline-flex items-center gap-1">
              〒
              <TextInput value={sale.zip} onChange={changeZip} onBlur={() => sale.zip && change({zip: zipLabel(sale.zip)})} inputMode="numeric" placeholder="824-0000" className="w-32" aria-label="郵便番号" data-nav />
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
          'zip',
        )}
        {row('住所', <TextInput value={sale.address} onChange={changeAddress} placeholder="福岡県…" className="w-full" aria-label="住所" data-nav />, 'address')}
        {row('電話番号', <TextInput type="tel" value={sale.tel} onChange={(tel) => change({tel})} placeholder="0930-00-0000" className="w-48" aria-label="電話" data-nav />, 'tel')}
        {!kouiki &&
          row(
            '要介護状態区分',
            <Circles<string> label="要介護状態区分" value={sale.careLevel} onPick={(careLevel) => change({careLevel})} clearable options={CARE_LEVELS.map((c) => [c, c] as const)} />,
            'careLevel',
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
          'burdenRatio',
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
          'payMethod',
        )}
        {(formKey === 'miyako' || kouiki) &&
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
            'carePlan',
          )}
        {row(
          '福祉用具',
          <div className="w-full space-y-2">
            {rows.map((l, idx) => {
              const i = l.item;
              const changeItem = changeRow;
              return (
                <div key={i.id} data-item={i.id} className="grid gap-2 rounded-md border border-slate-200 p-2">
                  {/* 1行目：種目 → 商品名（申請書の「種目名及び商品名」と同じ順。ユーザーの指示「入力順は、種目、商品名の順」2026-10-26）。その下にメーカー、定価・割引率・販売金額 */}
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{idx + 1}</span>
                    <CategorySelect category={i.category} sub={i.sub} onChange={(category, sub) => changeItem(i.id, {category, sub})} ariaLabel="種目" className="w-48" />
                    {/* 消すのは右上（販売見積書と同じ。金額の横だとスマホの幅で1段下に落ちた） */}
                    {lines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => change({items: sale.items.filter((x) => x.id !== i.id)})}
                        className="ml-auto rounded px-2 py-1 text-rose-500 hover:bg-rose-50"
                        aria-label={`${i.name || '商品'}を消す`}
                        title="消す"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <TextInput value={i.name} onChange={(name) => changeItem(i.id, {name})} placeholder="商品名" className="ml-8 min-w-0" aria-label="商品名" data-nav />
                  <div className="flex min-w-0 flex-wrap items-center gap-2 pl-8">
                    {i.productId === null ? <MakerInput value={i.maker} onChange={(maker) => changeItem(i.id, {maker})} choices={makers} className="w-56" /> : i.maker && <span className="text-xs text-slate-500">{i.maker}</span>}
                  </div>
                  {/* 定価の下に割引率と販売金額（ユーザーの指示「定価の下に、販売金額を記載する」「定価の下に割引率を表示、変更できるようにする」2026-10-26）。
                      販売金額は 定価×(100−割引率)%（打ち直したら薄い黄色で、↺ で戻す。販売見積書の単価と同じ値）。割引率を変えたら販売金額は計算し直す。
                      その下に数量（− ＋。ユーザーの指示「数量を追加」2026-10-26。販売見積書の数量と同じ値）。右の金額は 販売金額×数量＋税（申請書の購入予定金額） */}
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 pl-8 text-xs font-bold text-slate-500">
                    定価（税抜）
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {i.productId === null ? (
                        <NumberInput value={i.listPrice} onChange={(listPrice) => changeItem(i.id, {listPrice})} min={0} blankZero className="w-28" ariaLabel="定価" />
                      ) : (
                        <span className="text-sm tabular-nums text-slate-700">{yen(i.listPrice)}円</span>
                      )}
                      {unregistered.has(i.id) && (
                        <Btn color="white" small onClick={() => onFavorite(i.id)} aria-label={`${i.name}をお気に入りに登録`}>
                          ☆ お気に入りに登録
                        </Btn>
                      )}
                    </div>
                    割引率
                    <div className="flex items-center gap-1">
                      <NumberInput value={i.discountRate} onChange={(discountRate) => changeItem(i.id, {discountRate: Math.min(100, discountRate), unitPrice: null})} min={0} className="w-16" ariaLabel="割引率" />%
                    </div>
                    販売金額（税抜）
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <NumberInput value={l.unitPrice} onChange={(unitPrice) => changeItem(i.id, unitPricePatch(i, unitPrice))} min={0} className={`w-28 ${i.unitPrice !== null ? 'bg-amber-50' : ''}`} ariaLabel="販売金額" />
                      {i.unitPrice !== null && (
                        <button type="button" onClick={() => changeItem(i.id, {unitPrice: null})} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100" title="定価×割引率に戻す" aria-label="販売金額を自動に戻す">
                          ↺
                        </button>
                      )}
                    </div>
                    数量
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Stepper value={i.qty} onChange={(qty) => changeItem(i.id, {qty: Math.max(1, Math.round(qty))})} ariaLabel={`${i.name}の数量`} />
                        {i.unit}
                      </div>
                      <span className="ml-auto pr-1 text-sm font-bold tabular-nums text-slate-800">{yen(l.total)}円</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {lines.length > 0 && (
              <AddItemButton
                next={lines.length + 1}
                noun="福祉用具"
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
          // 事業所名は長い（「社会福祉法人○○会 ○○居宅介護支援事業所」）ので行いっぱい、ケアマネジャーはその下（前は横に並べて事業所名が切れていた。2026-10-26 のデバッグ）
          <div className="grid w-full gap-2">
            <SuggestInput
              value={sale.careOffice}
              onChange={(careOffice) => change({careOffice})}
              values={suggestValues(data.sales, data.settings.hiddenSuggest, (x) => x.careOffice)}
              onHide={onHideSuggest}
              placeholder="居宅介護支援事業所"
              label="居宅介護支援事業所" data-nav
            />
            <div className="min-w-0 sm:w-64">
              <SuggestInput
                value={sale.careManager}
                onChange={(careManager) => change({careManager})}
                values={suggestValues(data.sales, data.settings.hiddenSuggest, (x) => x.careManager, (x) => !sale.careOffice.trim() || x.careOffice.trim() === sale.careOffice.trim())}
                onHide={onHideSuggest}
                placeholder="ケアマネジャー"
                label="ケアマネジャー" data-nav
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
        {row('申請日', <input type="date" value={sale.applyDate} onChange={(e) => change({applyDate: e.target.value})} className={dateInput} aria-label="申請日" data-nav />, 'applyDate')}
        {row('納品日（購入日）', <input type="date" value={sale.deliveryDate} onChange={(e) => change({deliveryDate: e.target.value})} className={dateInput} aria-label="納品日" data-nav />, 'deliveryDate')}
        {row('支給申請日', <input type="date" value={sale.claimDate} onChange={(e) => change({claimDate: e.target.value})} className={dateInput} aria-label="支給申請日" data-nav />, 'claimDate')}
      </div>
    </div>
  );
}

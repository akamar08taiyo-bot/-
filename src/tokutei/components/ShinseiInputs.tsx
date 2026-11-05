// 申請書の画面の左の入れる所：申請書の上からの順に1行ずつ（住宅改修の申請書のタブと同じ形。ユーザーの指示「住宅改修と同様に、申請書のページをメインに大きくおいてください」2026-10-23）。
// 入れ方・色も住宅改修と同じ（ユーザーの指示「生年月日なども含め、入力の仕方や色など、住宅改修と同じ入力方法にする」2026-10-26。ShinseiParts.tsx）：
// 上に保険者と申請書の名前、選ぶ所は丸のボタン、フリガナはカタカナに、被保険者番号は10マス、生年月日は元号と年月日、Enter で次の欄。
// 右のプレビュー（ShinseiPreview.tsx）の欄を押すと、ここのその行へ（data-field）。まだ入っていない行は薄い黄色。
// 値は案件（Sale）のまま（見積書と同じ値。金額は見積書の側で入れる。ここでは購入金額を出すだけ）
import {areaLabel, insurerAreaName, insurerAreas, insurerNoOf} from '../insurerNumbers.ts';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode, RefObject} from 'react';
import type {FocusEvent} from 'react';
import {categoryTaxPatch, lineOf} from '../calc.ts';
import type {Line} from '../calc.ts';
import {CARE_LEVELS, INSURERS, OFFICES, settingsForOffice} from '../defaults.ts';
import {blankItem, makerChoices, suggestValues} from '../sales.ts';
import {carePlanOf, shinseiForm, shinseiSettings} from '../shinsei.ts';
import {shinseiOfficeGroup} from '../shinseiOffice.ts';
import type {ShinseiKey} from '../shinsei.ts';
import type {OpenCatalog} from '../catalog.ts';
import type {ShinseiField} from '../shinseiPreview.ts';
import type {AppData, BurdenRatio, CarePlan, Gender, PayMethod, Sale, SaleItem, Settings} from '../types.ts';
import {telWithHyphens} from '../tel.ts';
import {zipLabel} from '../zip.ts';
import type {ZipHit} from '../zip.ts';
import {CategorySelect} from './CategorySelect.tsx';
import {CatalogPicker} from './CatalogPicker.tsx';
import {CodeLookup} from './CodeLookup.tsx';
import {PriceFields} from './PriceFields.tsx';
import {ReasonField} from './ReasonField.tsx';
import {AddItemButton, Circles, EraBirthInput, FavoriteButton, InsuredNoInput, KanaInput, nextOnEnter} from './ShinseiParts.tsx';
import {SuggestInput} from './Suggest.tsx';
import {Btn, TextInput} from './ui.tsx';

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
  onPickFavorite,
  onCatalog,
  onAddItem,
  onPickCustomer,
  onCatalogPicked,
  onHideSuggest,
  changeSettings,
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
  onPickFavorite: (itemId: string) => void; // 定価の横の「★ お気に入りから入力」：商品マスタから選んで、その欄の商品にする
  onCatalog: OpenCatalog; // 右にカタログの窓を開く（print/CatalogViewer.tsx。商品検索のときは絞ったページだけ）
  onAddItem: (item?: SaleItem) => void; // 手で入れる商品を足す（item があればその商品＝最初から開いている欄に打ったもの）
  onPickCustomer?: () => void; // 住宅改修の様邸のタブの中では渡さない（お客様の情報は様邸から入る。ユーザーの指示「赤枠の部分は不要です」2026-10-28）
  onCatalogPicked: (item: SaleItem) => void; // カタログの商品の一覧から選んだ（カタログの窓を閉じる・お気に入りに入れる。SaleEditor）
  onHideSuggest: (v: string) => void; // 居宅介護支援事業所・ケアマネジャーの▼のリストから消す（設定の hiddenSuggest）
  changeSettings: (f: (s: Settings) => Settings) => void; // 福岡市・北九州市の受任者（販売事業者）の営業所・事業者番号（設定のまま。見積書の発行元も同じ営業所）
}) {
  const makers = useMemo(() => makerChoices(data.products, data.sales), [data.products, data.sales]);
  const s = data.settings;
  // 保険者を選んだら、続けて区・市町村（保険者番号）を選ぶ所へ（ユーザーの指示「保険者を選んだ後に、〇〇区を選んで、保険者番号を確定させる」2026-10-29）
  const areaRef = useRef<HTMLSelectElement>(null);
  const [focusArea, setFocusArea] = useState(false);
  useEffect(() => {
    if (!focusArea) return;
    areaRef.current?.focus();
    setFocusArea(false);
  }, [focusArea, sale.insurer]);
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
  // 福岡市・北九州市・久留米市・大分市：販売事業者（受任者）の営業所・事業者番号を書く（久留米市は受領委任払取扱事業所登録番号も）。
  // 要介護状態区分の欄は、広域連合・福岡市・北九州市・久留米市（市の記入欄だけ）の様式にない
  const seller = formKey === 'fukuoka' || formKey === 'kitakyushu' || formKey === 'kurume' || formKey === 'oita';
  const noCare = kouiki || formKey === 'fukuoka' || formKey === 'kitakyushu' || formKey === 'kurume';
  // 商品がないときも、手で入れる欄を1つ開いておく（ふだんは手で入れるので。ユーザーの指示「手でいれるではなく、基本は手で入れるのがデフォルトなので開いておく
  // ２商品名以降は追加する」2026-10-26）。打つとその商品ができる（id を同じにして、打っている欄から外れないように）
  const [draft] = useState(() => blankItem(s));
  const rows: Line[] = lines.length ? lines : [lineOf(draft, s)];
  const changeRow = (id: string, patch: Partial<SaleItem>) => (lines.length ? changeItem(id, patch) : onAddItem({...draft, ...patch}));
  const title = shinseiForm(sale.insurer)?.title;
  // 申請書に書く営業所（大分市は大分営業所など。shinseiOffice.ts）。設定の営業所とちがうときは、選ぶ欄・事業者番号はその営業所のもの
  const sellerS = shinseiSettings(sale, s);
  const sellerOffices = shinseiOfficeGroup(sale.insurer, insurerAreaName(sale.insurer, insurerNoOf(sale.insurer, sale.address, sale.insurerNo ?? '')));
  const ownOffice = sellerS.officeName === s.officeName;
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
        {/* 保険者を選んだら、そのすぐ下で区・市町村を選んで保険者番号を決める（InsurerNoSelect。プレビューの保険者番号のマスを押してもこの行へ） */}
        {row(
          '保険者',
          <>
            <select
              value={sale.insurer}
              onChange={(e) => {
                const key = e.target.value;
                change({insurer: key, perItem: INSURERS.find((i) => i.key === key)?.perItem ?? false});
                // 区・市町村を選ぶ保険者なら、続けてその選ぶ所へ
                if (areaLabel(key)) setFocusArea(true);
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
            <InsurerNoSelect sale={sale} onChange={(insurerNo) => change({insurerNo})} selectRef={areaRef} />
          </>,
          'insurerNo',
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
            <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              〒
              <TextInput value={sale.zip} onChange={changeZip} onBlur={() => sale.zip && change({zip: zipLabel(sale.zip)})} inputMode="numeric" placeholder="8240000" className="w-32" aria-label="郵便番号" data-nav />
              {/* ユーザーの指示「郵便番号の記入欄は、ハイフンなしで記入することを注意書き」「住所を入れたら自動的に郵便番号が入ることもわかるように、簡潔に」2026-10-30（打ち終わると 824-0043 の形になる。zipLabel） */}
              <span className="w-full text-[13px] leading-tight text-slate-500">ハイフンなしで入力（住所を入れると自動で入ります）</span>
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
        {row('電話番号', <TextInput type="tel" value={telWithHyphens(sale.tel)} onChange={(tel) => change({tel: telWithHyphens(tel)})} placeholder="0930-00-0000" className="w-48" aria-label="電話" data-nav />, 'tel')}
        {!noCare &&
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
                <div key={i.id} data-item={i.id} className="relative grid gap-2 rounded-md border border-slate-200 p-2">
                  {/* 1行目：種目とメーカー（ユーザーの指示「入力順は、種目、商品名の順」2026-10-26、「少し行数が長い」2026-11-03 で同じ行に。狭い幅ではメーカーが下に折れる） */}
                  <div className="flex min-w-0 flex-wrap items-center gap-2 pr-7">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{idx + 1}</span>
                    <CategorySelect category={i.category} sub={i.sub} onChange={(category, sub) => changeItem(i.id, {category, sub, ...categoryTaxPatch(i, category)})} ariaLabel="種目" className="w-40 min-w-0 shrink" />
                    {/* 手で入れる商品のメーカーは、下のカタログの枠のプルダウン（ユーザーの指示「入浴補助用具の右側のリストは不要」2026-11-03） */}
                    {i.productId !== null && (i.maker || i.code) && <span className="min-w-0 text-xs text-slate-500">{[i.maker, i.code].filter(Boolean).join('　')}</span>}
                    {/* 消すのは右上（販売見積書と同じ。金額の横だとスマホの幅で1段下に落ちた） */}
                    {lines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => change({items: sale.items.filter((x) => x.id !== i.id)})}
                        className="absolute right-1 top-1.5 rounded px-2 py-1 text-rose-500 hover:bg-rose-50"
                        aria-label={`${i.name || '商品'}を消す`}
                        title="消す"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {/* 種目の下に、品目・メーカーのプルダウンと、その下に「📖 カタログから商品検索」（絞ったカタログを開く）・右に品番と「🔢 型番から検索」
                      （ユーザーの指示「品目はプルダウン形式。品目を選んだら、該当のメーカーをプルダウンから選ぶ。その真下に、カタログから商品検索をもってくる。
                      右側に型番から検索をもってくる」2026-11-03。CatalogPicker.tsx・CodeLookup.tsx） */}
                  {/* 商品名（字はほかの欄と同じ 14px）の右に品番の欄（「🔢 型番から検索」で読む欄。見積書の品名の3行目「【品番】…」） */}
                  {i.productId === null ? (
                    <CodeLookup item={i} products={data.products} onPick={(patch) => changeRow(i.id, patch)} onPicked={onCatalogPicked}>
                      {(code) => (
                        <>
                          <CatalogPicker
                            item={i}
                            onPick={(patch) => changeRow(i.id, patch)}
                            onCatalog={onCatalog}
                            onPicked={onCatalogPicked}
                            makerChoices={makers}
                            code={
                              <>
                                {code.button}
                                <FavoriteButton onClick={() => onPickFavorite(i.id)} className="!h-auto min-h-9 w-full !px-1.5 !py-1 !text-sm leading-tight" />
                              </>
                            }
                            codeNote={code.note}
                          />
                          <div className="flex min-w-0 items-center gap-2 sm:ml-8">
                            <TextInput value={i.name} onChange={(name) => changeItem(i.id, {name})} placeholder="商品名" className="min-w-0 flex-1 text-sm" aria-label="商品名" data-nav />
                            {code.input}
                          </div>
                        </>
                      )}
                    </CodeLookup>
                  ) : (
                    <TextInput value={i.name} onChange={(name) => changeItem(i.id, {name})} placeholder="商品名" className="min-w-0 text-sm sm:ml-8" aria-label="商品名" data-nav />
                  )}
                  {/* 定価・割引率（ユーザーの指示「定価の下に割引率を表示、変更できるようにする」2026-10-26）／販売金額（税抜）と税込（打つと割引率が変わる。割引率を打つと計算し直す。
                      ユーザーの指示 2026-11-03）／数量（− ＋。「数量を追加」2026-10-26。販売見積書の数量と同じ値）。部品は PriceFields.tsx（販売見積書と同じ）。
                      税込×数量が申請書の購入予定金額（数量が2つ以上なら下にその金額） */}
                  <PriceFields
                    line={l}
                    change={(patch) => changeItem(i.id, patch)}
                    listEditable={i.productId === null}
                    onPickFavorite={i.productId === null ? undefined : () => onPickFavorite(i.id)}
                    priceLabel="販売金額"
                    priceAria="販売金額"
                  />
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
            {/* 下の「★ 商品を選ぶ」「📷 スクショから自動認識」は外した（ユーザーの指示「商品を選ぶとスクショから認識はなくす」2026-11-02）。
                お気に入りは定価の横、カタログから検索は種目・メーカーの下（商品の欄ごと） */}
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
        {/* 福岡市・北九州市・久留米市・大分市の受任者（販売事業者）：申請書に書く営業所（住所・電話・所長）と事業者番号。
            その市の営業所だけを選べる（ユーザーの指示「こちらの該当営業所と所長にする」2026-11-05）。ここで替えると設定も替わる。
            設定とちがう営業所の事業者番号は、その営業所の番号として覚える（providerNos。見積書の発行元＝設定の営業所は変えない） */}
        {seller &&
          row(
            '販売事業者（受任者）',
            <div className="flex w-full flex-wrap items-center gap-2">
              <select
                value={sellerS.officeName}
                onChange={(e) => changeSettings((prev) => settingsForOffice(prev, e.target.value))}
                className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm"
                aria-label="販売事業者の営業所"
              >
                {!OFFICES.some((o) => o.name === sellerS.officeName) && <option value={sellerS.officeName}>{sellerS.officeName || '—'}</option>}
                {OFFICES.filter((o) => !sellerOffices.length || sellerOffices.includes(o.name)).map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
                事業者番号
                <TextInput
                  value={sellerS.providerNo ?? ''}
                  onChange={(providerNo) =>
                    changeSettings((prev) =>
                      ownOffice ? {...prev, providerNo} : {...prev, providerNos: {...prev.providerNos, [sellerS.officeName]: providerNo}},
                    )
                  }
                  inputMode="numeric"
                  placeholder="10けた"
                  className="w-36 text-sm font-normal text-slate-800"
                  aria-label="事業者番号"
                  data-nav
                />
              </span>
              {/* 久留米市の受領委任払取扱事業所登録番号（市から届く8けた。設定と同じ。住宅改修のアプリの設定にも同じ欄がある） */}
              {formKey === 'kurume' && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
                  受領委任払取扱事業所登録番号
                  <TextInput
                    value={s.entrustRegNo ?? ''}
                    onChange={(entrustRegNo) => changeSettings((prev) => ({...prev, entrustRegNo}))}
                    inputMode="numeric"
                    placeholder="8けた"
                    className="w-28 text-sm font-normal text-slate-800"
                    aria-label="受領委任払取扱事業所登録番号"
                    data-nav
                  />
                </span>
              )}
            </div>,
            'seller',
          )}
        {/* 申請日・納品日（購入日）・支給申請日の欄は外した（申請書には書かない。Excel に保存してから手で入れる。shinsei.ts の shinseiValues）。
            ユーザーの指示「特定福祉用具申請書の赤枠部分は、連動すると都合が悪いため、すべてなくす。入力が必要なときは、EXCELにおとして、手入力します」2026-10-28 */}
      </div>
    </div>
  );
}

/**
 * 保険者番号：保険者のすぐ下で、北九州市・福岡市は区、広域連合は構成市町村（築上町・豊前市・上毛町・吉富町）を選んで決める
 * （ユーザーの指示「北九州市や福岡市では、保険者を選んだ後に、〇〇区を選んで、保険者番号を確定させる、住宅改修、特定福祉用具申請書どちらも。
 * 広域連合の場合は、広域連合を選択したら、その後に、同様に保険者を選択する（築上町、豊前市など）」2026-10-29。前は被保険者番号の下の行）。
 * 初めは住所の区・市町村から（insurerNumbers.ts）。区・市町村が1つの保険者は番号を出すだけ。住宅改修から受け取った一覧にない番号もそのまま出す
 */
function InsurerNoSelect({sale, onChange, selectRef}: {sale: Sale; onChange: (no: string) => void; selectRef: RefObject<HTMLSelectElement | null>}) {
  const areas = insurerAreas(sale.insurer);
  const cur = insurerNoOf(sale.insurer, sale.address, sale.insurerNo ?? '');
  const odd = !!cur && !areas.some((a) => a.no === cur);
  const unit = areaLabel(sale.insurer);
  if (!unit && !odd) return cur ? <span className="text-sm text-slate-600">保険者番号 <span className="font-mono text-slate-800">{cur}</span></span> : null;
  return (
    <label className="flex w-full min-w-0 items-center gap-2 text-sm font-bold text-slate-600">
      <span className="shrink-0">{unit || '保険者番号'}</span>
      <select
        ref={selectRef}
        value={cur}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-full min-w-0 rounded-md border px-2 text-sm font-normal text-slate-800 ${cur ? 'border-slate-300 bg-white' : 'border-amber-300 bg-amber-50'}`}
        aria-label="保険者番号"
        // Enter では飛ばす（住所から選ぶので、打ち込む流れを止めない）
      >
        {!cur && <option value="">選んでください</option>}
        {odd && <option value={cur}>{cur}（介護保険証の番号）</option>}
        {areas.map((a) => (
          <option key={a.no} value={a.no}>
            {a.name}　{a.no}
          </option>
        ))}
      </select>
    </label>
  );
}

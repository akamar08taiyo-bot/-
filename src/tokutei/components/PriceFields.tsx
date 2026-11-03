// 商品の欄の金額（申請書のタブ・販売見積書のタブで同じ入れ方）：定価・割引率／販売金額（単価）と税込・非課税／仕切・利益率。
// ユーザーの指示（2026-11-03。販売見積書の商品の欄のスクリーンショット）：「数字や文字の大きさは均一にする」「税込の合計金額は、税抜きの横にしっかりとわかりやすくする」
// 「税抜き金額、税込み金額を変更すると、自動的に割引率が変わるようにする。また、逆もしかり」「少し行数が長い」。
//   税抜・税込のどちらを打っても、販売単価（手で入れた値。薄い黄色・↺ で定価×割引率に戻す）と割引率（定価からの割引。ちょうどでなければ小数1けた）が変わる。
//   割引率を打つと、税抜・税込は定価×(100−割引率)% から計算し直す。
// 同じ日の続きの指示：
//   「念のため、税込み金額の横に非課税ボタンを設置。販売見積書も全く同様の入力方法にする」→ 税込の右に「非課税」（押すと非課税⇔10%。押した商品は taxByHand）。
//     販売見積書の税率（10%・軽減8%・非課税）・単位の欄はなくし、申請書のタブと同じ並びにした（単位は商品マスタ・カタログの値。初めは「台」）。
//   「単価（税抜き）と書いてある場所も非課税に書き換える。非課税商品の場合」→ 非課税の商品は「定価（非課税）」「単価（非課税）」。
//   「仕切りの部分を入力したら、右側に利益率を表示、利益率をいじると、販売金額が自動的に変わる」「当然備考の部分も連動して数字が変わる」
//     → 仕切の右に利益率（販売単価に対する率。calc.ts の marginRate）。利益率を打つと 仕切÷(1−利益率) の単価（手で入れた単価と同じ扱い）になり、
//       割引率・税込・見積書の備考（算出根拠。calc.ts の basisNote）も変わる。
//   数量（− ＋）は外した（「台数は２台にすることがないので、数量機能は不要」。数量は1）
import {actualDiscount, marginRate, priceFromMargin, priceFromTaxIncluded, taxIncluded, unitPricePatch} from '../calc.ts';
import type {Line} from '../calc.ts';
import type {SaleItem} from '../types.ts';
import {yen} from '../util.ts';
import {FavoriteButton} from './ShinseiParts.tsx';
import {NumberInput} from './ui.tsx';

/** 行の見出し（左の列。どの行も同じ幅でそろえ、長い見出しは2行に）と、行の中の2つ目からの見出し。見出しと欄の組は途中で折り返さない（狭い幅では組ごと次の行へ） */
// 見出しは 3.5rem（「定価」「（税抜）」のように言葉の切れ目で2行。欄の高さの中に入る）。申請書のタブの左の欄（346px）で、税抜・税込・非課税を1行に入れるため
const LABEL = 'w-14 shrink-0 text-xs font-bold leading-tight text-slate-500';
const LABEL2 = 'shrink-0 text-xs font-bold text-slate-500';
const ROW = 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1';
const PAIR = 'flex shrink-0 items-center gap-1';

/** 割引率の欄に出す値：手で入れた単価なら定価からの実際の割引率（0〜100%。前の版で入れて割引率が古いままの案件も）、ほかは割引率の欄の値 */
export function shownDiscount(line: Line): number {
  if (line.basis !== 'manual' || !(line.item.listPrice > 0)) return line.item.discountRate;
  return Math.min(100, Math.max(0, actualDiscount(line)));
}

export function PriceFields({
  line,
  change,
  listEditable,
  onPickFavorite,
  priceLabel,
  priceAria,
}: {
  line: Line;
  change: (patch: Partial<SaleItem>) => void;
  listEditable: boolean; // 定価を打てるか（商品マスタにつながった商品は文字だけ）
  onPickFavorite?: () => void; // 定価の横の「★ お気に入りから入力」（商品マスタの商品の欄だけ。手で入れる欄は「🔢 型番から検索」の右＝CatalogPicker）
  priceLabel: string; // 「単価」（販売見積書）・「販売金額」（申請書）
  priceAria: string; // 税抜の欄の名前（「販売単価」・「販売金額」）
}) {
  const i = line.item;
  const manual = i.unitPrice !== null;
  const free = i.taxType === '非課税';
  const taxIn = taxIncluded(line.unitPrice, i.taxType);
  // 非課税の商品は「（税抜）」ではなく「（非課税）」と書く
  const taxWord = free ? '非課税' : '税抜';
  const margin = marginRate(line.unitPrice, i.cost);
  return (
    <div className="grid min-w-0 gap-1.5 sm:pl-8">
      {/* 1行目：定価・割引率・★ お気に入りから入力（大事な定価を左に。ユーザーの指示「重要項目は行の左にもってくる」2026-11-03） */}
      <div className={ROW}>
        <span className={PAIR}>
          <span className={LABEL}>
            <span className="inline-block">定価</span>
            <span className="inline-block">（{taxWord}）</span>
          </span>
          {listEditable ? (
            <NumberInput value={i.listPrice} onChange={(listPrice) => change({listPrice})} min={0} blankZero className="w-24" ariaLabel="定価" />
          ) : (
            <span className="w-24 text-right text-sm tabular-nums text-slate-700">{yen(i.listPrice)}円</span>
          )}
        </span>
        <span className={PAIR}>
          <span className={LABEL2}>割引率</span>
          {/* 割引率を変えたら単価は定価×割引に戻す（税抜・税込も計算し直す） */}
          <NumberInput value={shownDiscount(line)} onChange={(discountRate) => change({discountRate: Math.min(100, discountRate), unitPrice: null})} min={0} className="w-14" ariaLabel="割引率" />
          <span className="text-xs font-bold text-slate-500">%</span>
        </span>
        {/* 商品マスタの商品の欄だけ、定価の横に「★ お気に入りから入力」（手で入れる欄は「🔢 型番から検索」の右。ユーザーの指示「お気に入りから入力は、型番検索の右にもってくる」2026-11-03） */}
        {onPickFavorite && <FavoriteButton onClick={onPickFavorite} />}
      </div>
      {/* 2行目：税抜（非課税）と、すぐ横に税込（打つと税抜と割引率が変わる）・非課税のボタン。字の大きさは同じ。税込は見出しの色と欄の枠を少し濃くして見つけやすく。
          申請書のタブの左の欄（幅 346px）でも1行に入るよう、ボタンは 13px（スマホでは税込と非課税が下の行へ）。欄は 5.75rem・左右の余白 6px で「188,800」まで入る
          （前の 5.25rem・余白 8px は「108,000」の最後の字が欄に隠れていた。2026-11-03 の全体のデバッグで測って見つけた） */}
      <div className={ROW}>
        <span className={PAIR}>
          {/* 「販売金額（税抜）」は欄の見出しの幅に入らないので、「販売金額」「（税抜）」の切れ目で2行に（前は「（税」「抜）」で切れていた） */}
          <span className={LABEL}>
            <span className="inline-block">{priceLabel}</span>
            <span className="inline-block">（{taxWord}）</span>
          </span>
          <NumberInput value={line.unitPrice} onChange={(unitPrice) => change(unitPricePatch(i, unitPrice))} min={0} className={`w-[5.75rem] !px-1.5 ${manual ? 'bg-amber-50' : ''}`} ariaLabel={priceAria} />
        </span>
        <span className={PAIR}>
          <span className={`${LABEL2} !text-teal-800`}>税込</span>
          <NumberInput
            value={taxIn}
            onChange={(t) => change(unitPricePatch(i, priceFromTaxIncluded(t, i.taxType)))}
            min={0}
            className={`w-[5.75rem] !px-1.5 !border-teal-400 ${manual ? 'bg-amber-50' : ''}`}
            ariaLabel={`${priceAria}（税込）`}
          />
          {/* 非課税（歩行器・多点杖などは種目・カタログから自動で非課税。念のため手でも切りかえられる。押した商品は種目を変えても自動で戻さない） */}
          <button
            type="button"
            aria-pressed={free}
            onClick={() => change({taxType: free ? '10%' : '非課税', taxByHand: true})}
            className={`h-9 shrink-0 rounded-md border px-1.5 text-[13px] font-bold transition ${free ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'}`}
            title={free ? '非課税（押すと課税 10%）' : '課税 10%（押すと非課税）'}
          >
            {free ? '✓ 非課税' : '非課税'}
          </button>
          {manual && (
            <button type="button" onClick={() => change({unitPrice: null})} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100" title="定価×割引率に戻す" aria-label={`${priceAria}を自動に戻す`}>
              ↺
            </button>
          )}
        </span>
      </div>
      {/* 3行目：仕切（任意）と、仕切を入れたら右に利益率（打つと販売金額が変わる） */}
      <div className={ROW}>
        <span className={PAIR}>
          <span className={LABEL}>
            <span className="inline-block">仕切</span>
            <span className="inline-block">（任意）</span>
          </span>
          <NumberInput value={i.cost} onChange={(cost) => change({cost})} min={0} blankZero className="w-24" ariaLabel="仕切" />
        </span>
        {i.cost > 0 && (
          <span className={PAIR}>
            <span className={LABEL2}>利益率</span>
            <NumberInput
              value={margin ?? Number.NaN}
              onChange={(rate) => {
                const price = priceFromMargin(i.cost, Math.min(99, rate));
                if (price !== null) change(unitPricePatch(i, price));
              }}
              className={`w-16 ${margin !== null && margin < 0 ? '!text-rose-600' : ''}`}
              ariaLabel="利益率"
            />
            <span className="text-xs font-bold text-slate-500">%</span>
          </span>
        )}
      </div>
      {/* 前の版で数量を2つ以上にした商品だけ、その数量の金額（字の大きさはそろえる） */}
      {i.qty !== 1 && (
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 text-sm tabular-nums text-slate-700" aria-label="数量分の金額">
          <span>
            {i.qty}
            {i.unit || '台'}の金額（{taxWord}）{yen(line.amount)}円
          </span>
          <span className="text-teal-800">税込 {yen(line.total)}円</span>
        </div>
      )}
    </div>
  );
}

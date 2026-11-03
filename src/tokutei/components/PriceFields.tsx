// 商品の欄の金額（申請書のタブ・販売見積書のタブで同じ）：定価・割引率／販売単価（税抜）と税込／数量。
// ユーザーの指示（2026-11-03。販売見積書の商品の欄のスクリーンショット）：「数字や文字の大きさは均一にする」「税込の合計金額は、税抜きの横にしっかりとわかりやすくする」
// 「税抜き金額、税込み金額を変更すると、自動的に割引率が変わるようにする。また、逆もしかり」「少し行数が長い」。
//   税抜・税込のどちらを打っても、販売単価（手で入れた値。薄い黄色・↺ で定価×割引率に戻す）と割引率（定価からの割引。ちょうどでなければ小数1けた）が変わる。
//   割引率を打つと、税抜・税込は定価×(100−割引率)% から計算し直す。前は 定価・割引率・単価・数量・税率・仕切 を1つずつ別の行に並べ、
//   税込は下の「金額 ○円 ＋ 税 ○円」の小さな字の横に大きな字で出していた。いまは 定価と割引率・税抜と税込・数量と税率 を同じ行に並べ、
//   数量が2つ以上のときだけ、下にその数量の金額（税抜・税込）を同じ大きさの字で出す（1つなら税込の欄と同じ値なので出さない）
import type {ReactNode} from 'react';
import {actualDiscount, priceFromTaxIncluded, taxIncluded, unitPricePatch} from '../calc.ts';
import type {Line} from '../calc.ts';
import type {SaleItem} from '../types.ts';
import {yen} from '../util.ts';
import {FavoriteButton} from './ShinseiParts.tsx';
import {NumberInput, Stepper} from './ui.tsx';

/** 行の見出し（左の列。どの行も同じ幅でそろえ、長い見出しは2行に）と、行の中の2つ目からの見出し。見出しと欄の組は途中で折り返さない（狭い幅では組ごと次の行へ） */
const LABEL = 'w-[4.5rem] shrink-0 text-xs font-bold leading-tight text-slate-500';
const LABEL2 = 'shrink-0 text-xs font-bold text-slate-500';
const ROW = 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1';
const PAIR = 'flex shrink-0 items-center gap-1.5';

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
  unit,
  extra,
}: {
  line: Line;
  change: (patch: Partial<SaleItem>) => void;
  listEditable: boolean; // 定価を打てるか（商品マスタにつながった商品は文字だけ）
  onPickFavorite: () => void;
  priceLabel: string; // 「単価」（販売見積書）・「販売金額」（申請書）
  priceAria: string; // 税抜の欄の名前（「販売単価」・「販売金額」）
  unit: ReactNode; // 数量の右（販売見積書は単位の欄、申請書は単位の字）
  extra?: ReactNode; // 数量の行の右（販売見積書の税率・仕切）
}) {
  const i = line.item;
  const manual = i.unitPrice !== null;
  const taxIn = taxIncluded(line.unitPrice, i.taxType);
  return (
    <div className="grid min-w-0 gap-1.5 sm:pl-8">
      {/* 1行目：定価・割引率・★ お気に入りから入力（大事な定価を左に。ユーザーの指示「重要項目は行の左にもってくる」2026-11-03） */}
      <div className={ROW}>
        <span className={PAIR}>
          <span className={LABEL}>定価（税抜）</span>
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
        {/* 定価の横に「★ お気に入りから入力」（ユーザーの指示「お気に入りから入力をこの辺にもってくる」2026-11-02） */}
        <FavoriteButton onClick={onPickFavorite} />
      </div>
      {/* 2行目：税抜と、すぐ横に税込（打つと税抜と割引率が変わる）。字の大きさは同じ。税込は見出しの色と欄の枠を少し濃くして見つけやすく */}
      <div className={ROW}>
        <span className={PAIR}>
          <span className={LABEL}>{priceLabel}（税抜）</span>
          <NumberInput value={line.unitPrice} onChange={(unitPrice) => change(unitPricePatch(i, unitPrice))} min={0} className={`w-24 ${manual ? 'bg-amber-50' : ''}`} ariaLabel={priceAria} />
        </span>
        <span className={PAIR}>
          <span className={`${LABEL2} !text-teal-800`}>税込</span>
          <NumberInput
            value={taxIn}
            onChange={(t) => change(unitPricePatch(i, priceFromTaxIncluded(t, i.taxType)))}
            min={0}
            className={`w-24 !border-teal-400 ${manual ? 'bg-amber-50' : ''}`}
            ariaLabel={`${priceAria}（税込）`}
          />
          {manual && (
            <button type="button" onClick={() => change({unitPrice: null})} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100" title="定価×割引率に戻す" aria-label={`${priceAria}を自動に戻す`}>
              ↺
            </button>
          )}
        </span>
      </div>
      {/* 3行目：数量（と単位）・販売見積書は税率・仕切 */}
      <div className={ROW}>
        <span className={PAIR}>
          <span className={LABEL}>数量</span>
          <Stepper value={i.qty} onChange={(qty) => change({qty: Math.max(1, Math.round(qty))})} ariaLabel={`${i.name}の数量`} />
          {unit}
        </span>
        {extra}
      </div>
      {/* 数量が2つ以上のときだけ、その数量の金額（字の大きさはそろえる） */}
      {i.qty !== 1 && (
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 text-sm tabular-nums text-slate-700" aria-label="数量分の金額">
          <span>
            {i.qty}
            {i.unit || '台'}の金額（税抜）{yen(line.amount)}円
          </span>
          <span className="text-teal-800">税込 {yen(line.total)}円</span>
        </div>
      )}
    </div>
  );
}

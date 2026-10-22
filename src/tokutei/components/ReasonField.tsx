import {pastReasons, reasonExamples} from '../reasons.ts';
import type {Sale, SaleItem} from '../types.ts';

/**
 * 「福祉用具が必要な理由」（申請書の欄。用具ごと）。種目ごとの文例・前に同じ種目で書いた理由を、押すだけで入れられる。
 * 住宅改修から開いた案件は、住宅改修の理由書の「利用者の身体状況」「介護状況」も先に出す（`hints`。ユーザーの答え「申請書の理由の欄のこと」2026-10-22）。
 * 入れたあとで、その方に合わせて直す
 */
export function ReasonField({
  item,
  sales,
  saleId,
  hints = [],
  onChange,
}: {
  item: SaleItem;
  sales: Sale[];
  saleId: string;
  hints?: {label: string; text: string}[];
  onChange: (reason: string) => void;
}) {
  const examples = reasonExamples(item.category, item.sub);
  const past = pastReasons(sales, item.category, item.sub, saleId);
  const options = [
    ...hints.map((h) => ({text: h.text.trim(), label: h.label})).filter((o) => o.text),
    ...examples.map((text) => ({text, label: '文例'})),
    ...past.map((text) => ({text, label: '前に書いた理由'})),
  ].filter((o) => o.text !== item.reason.trim());
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1">
      <textarea
        value={item.reason}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={examples[0] ? `例：${examples[0]}` : '種目を選ぶと文例が出ます'}
        aria-label={`${item.name || '商品'}が必要な理由`}
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {options.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1">
          {options.slice(0, 4).map((o) => (
            <button
              key={o.text}
              type="button"
              onClick={() => onChange(o.text)}
              className="max-w-full truncate rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-left text-[11px] font-normal text-teal-800 hover:bg-teal-100"
              title={o.text}
            >
              {o.label}：{o.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

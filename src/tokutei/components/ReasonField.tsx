import {pastReasons, reasonExamples} from '../reasons.ts';
import type {Sale, SaleItem} from '../types.ts';

/**
 * 「福祉用具が必要な理由」（申請書の欄。用具ごと）。用具ごとの文例（シャワーチェア・浴槽台・ポータブルトイレ（夜間のみ）など見出しごとに。約100字）と、
 * 前に同じ種目で書いた理由を、プルダウンから選んで入れられる。入れたあとで、その方に合わせて直す。手で入れた商品は、商品名から細目を見て文例を出す
 */
export function ReasonField({item, sales, saleId, onChange}: {item: SaleItem; sales: Sale[]; saleId: string; onChange: (reason: string) => void}) {
  const groups = reasonExamples(item.category, item.sub, item.name);
  const count = groups.reduce((n, g) => n + g.texts.length, 0);
  const first = groups[0]?.texts[0];
  const past = pastReasons(sales, item.category, item.sub, saleId);
  const label = `${item.name || '商品'}が必要な理由`;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1">
      <textarea
        value={item.reason}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={first ? `例：${first}` : '種目を選ぶと文例が出ます'}
        aria-label={label}
        className="min-h-[6rem] w-full resize-y rounded-md border border-slate-300 bg-white p-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {count + past.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label={`${label}の文例`}
          className="h-9 w-full min-w-0 rounded-md border border-teal-200 bg-teal-50 px-2 text-xs font-normal text-teal-900"
        >
          <option value="">文例から入れる（{count + past.length}）</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.texts.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          ))}
          {past.length > 0 && (
            <optgroup label="前に書いた理由">
              {past.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </div>
  );
}

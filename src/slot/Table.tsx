import {useState} from 'react';
import type {ReactNode} from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** 並べ替えに使う値。省略すると並べ替え不可 */
  sort?: (row: T) => number | string;
  align?: 'left' | 'right';
}

/** 見出しをタップで並べ替えできる表。スマホでは横スクロールする */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  limit,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: {key: string; desc: boolean};
  limit?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [expanded, setExpanded] = useState(false);
  const col = columns.find((c) => c.key === sort?.key);
  const sorted =
    col?.sort && sort
      ? [...rows].sort((a, b) => {
          const va = col.sort!(a);
          const vb = col.sort!(b);
          const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ja');
          return sort.desc ? -c : c;
        })
      : rows;
  const shown = limit && !expanded ? sorted.slice(0, limit) : sorted;

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-max text-sm tabular-nums">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`whitespace-nowrap px-2 py-2 font-medium ${c.align === 'left' ? 'text-left' : 'text-right'}`}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      className="hover:text-slate-800"
                      onClick={() =>
                        setSort((s) => (s?.key === c.key ? {key: c.key, desc: !s.desc} : {key: c.key, desc: true}))
                      }
                    >
                      {c.label}
                      {sort?.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)} className="border-b border-slate-100 last:border-0">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-2 py-1.5 ${c.align === 'left' ? 'text-left' : 'text-right'}`}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && rows.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-sky-700 hover:underline"
        >
          {expanded ? '折りたたむ' : `すべて表示（${rows.length}件）`}
        </button>
      )}
    </div>
  );
}

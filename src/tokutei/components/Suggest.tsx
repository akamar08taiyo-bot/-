/** 入力欄の下の候補（前に入れた値）。押すとその値を入れる（datalist は使わない：スマホで出し方がまちまちなため） */
export function Suggest({values, current, onPick}: {values: string[]; current: string; onPick: (v: string) => void}) {
  const list = values.filter((v) => v !== current.trim());
  if (list.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {list.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-normal text-slate-600 hover:border-teal-300 hover:bg-teal-50"
          title={v}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

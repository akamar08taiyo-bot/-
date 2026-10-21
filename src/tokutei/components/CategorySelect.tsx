import {CATEGORIES, categoryLabel} from '../category.ts';

/** 種目（と細目）を選ぶ欄。入浴補助用具は細目まで選ぶ（申請書に「入浴補助用具（入浴用いす）」と書くため） */
export function CategorySelect({
  category,
  sub,
  onChange,
  className = '',
  ariaLabel = '種目',
}: {
  category: string;
  sub: string;
  onChange: (category: string, sub: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const value = category ? `${category}|${sub}` : '';
  const known = CATEGORIES.some((c) => c.name === category && (sub === '' ? c.name !== '入浴補助用具' : c.subs.includes(sub)));
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        const [c, s] = e.target.value.split('|');
        onChange(c ?? '', s ?? '');
      }}
      className={`h-9 min-w-0 max-w-full rounded-md border px-1.5 text-sm outline-none focus:border-blue-500 ${category ? 'border-slate-300 bg-white' : 'border-amber-300 bg-amber-50 text-amber-900'} ${className}`}
    >
      <option value="">種目を選ぶ</option>
      {category && !known && <option value={value}>{categoryLabel(category, sub)}</option>}
      {CATEGORIES.map((c) =>
        c.subs.length === 0 ? (
          <option key={c.name} value={`${c.name}|`}>
            {c.name}
          </option>
        ) : (
          <optgroup key={c.name} label={c.name}>
            {c.name !== '入浴補助用具' && <option value={`${c.name}|`}>{c.name}</option>}
            {c.subs.map((s) => (
              <option key={s} value={`${c.name}|${s}`}>
                {categoryLabel(c.name, s)}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </select>
  );
}

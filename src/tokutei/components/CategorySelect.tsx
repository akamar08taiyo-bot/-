import {CATEGORIES} from '../category.ts';

/**
 * 種目を選ぶ欄。候補は種目だけ（入浴補助用具・腰掛便座など）。前は入浴補助用具・腰掛便座の細目（入浴用いす など）まで並べていたが、
 * ユーザーの指示「リストはシンプルに、入浴補助用具、腰掛便座などシンプルで良い」（2026-10-26）で種目だけにした（申請書・見積書にも種目だけを書く＝docLabel）。
 * 細目は商品名から自動で決めたもの（guessCategory）を残し、理由の頭の呼び名と文例に使う。種目を選び直したら細目は空にする
 */
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
  const known = CATEGORIES.some((c) => c.name === category);
  return (
    <select
      aria-label={ariaLabel}
      value={category}
      onChange={(e) => {
        const c = e.target.value;
        onChange(c, c === category ? sub : '');
      }}
      className={`h-9 min-w-0 max-w-full rounded-md border px-1.5 text-sm outline-none focus:border-blue-500 ${category ? 'border-slate-300 bg-white' : 'border-amber-300 bg-amber-50 text-amber-900'} ${className}`}
      data-nav
    >
      <option value="">種目を選ぶ</option>
      {category && !known && <option value={category}>{category}</option>}
      {CATEGORIES.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

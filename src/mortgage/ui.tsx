import {useId, useState} from 'react';
import type {ReactNode} from 'react';

export function Card({children, className = ''}: {children: ReactNode; className?: string}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({children, note}: {children: ReactNode; note?: ReactNode}) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-slate-800">{children}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>}
    </div>
  );
}

/** 見出し数値のタイル。グラフにしない「1つの数字」はこちらで見せる */
export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {accent && <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor: accent}} />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500 tabular-nums">{sub}</div>}
    </div>
  );
}

/**
 * スライダーと数値入力を組にしたフィールド。
 *
 * 数値欄は入力中の文字列をそのまま保持し、範囲内の値になったときだけ親へ通知する。
 * 1文字ごとに最小値・最大値へ丸めると、打っている途中で勝手に値が跳ね上がってしまうため、
 * 範囲外のまま確定した場合（フォーカスが外れた / Enter）にだけ丸める。
 */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  format,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
  hint?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // 入力途中の文字列（未確定）。null なら親の値をそのまま表示する
  const [draft, setDraft] = useState<string | null>(null);
  const inputId = useId();

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed));
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor={inputId}>
          {label}
        </label>
        <div className="flex items-baseline gap-1">
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            value={draft ?? String(value)}
            min={min}
            max={max}
            step={step}
            // タップしてすぐ打ち直せるよう、フォーカス時に全選択する
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              const parsed = Number(raw);
              // 範囲内になった時点だけ反映する（範囲外は確定時に丸める）
              if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
                onChange(parsed);
              }
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm font-semibold text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
          />
          <span className="text-xs text-slate-500">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(null);
          onChange(clamp(Number(e.target.value)));
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-sky-600"
      />
      <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
        <span>{format ? format(min) : `${min}${unit}`}</span>
        {hint ? <span className="text-slate-500">{hint}</span> : null}
        <span>{format ? format(max) : `${max}${unit}`}</span>
      </div>
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-sky-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

/** 排他選択のセグメントコントロール */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: {value: T; label: string}[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 系列の凡例（色だけに頼らないよう、ラベルを必ず添える） */
export function Legend({items}: {items: {color: string; label: string; dashed?: boolean}[]}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className="inline-block h-0.5 w-4 rounded-full"
            style={
              it.dashed
                ? {backgroundImage: `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)`}
                : {backgroundColor: it.color}
            }
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

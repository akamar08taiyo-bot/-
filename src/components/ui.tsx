import type {ReactNode} from 'react';

export function Card({children, className = ''}: {children: ReactNode; className?: string}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({children}: {children: ReactNode}) {
  return <h2 className="mb-3 text-lg font-bold text-slate-800">{children}</h2>;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  step = 0.1,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-600">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={value ?? ''}
          placeholder="未入力"
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none"
        />
        {unit && <span className="text-slate-400">{unit}</span>}
      </div>
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-600">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none"
      />
    </label>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <h3 className="mb-2 text-base font-bold text-slate-800">{title}</h3>
        <div className="mb-4 text-sm text-slate-600">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            確定
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ComingSoon({label}: {label: string}) {
  return (
    <Card className="text-center text-slate-500">
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-sm">この機能は次フェーズで実装予定です（MVP範囲外）。</p>
    </Card>
  );
}

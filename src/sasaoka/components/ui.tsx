import {createContext, useContext, useEffect, useRef, useState} from 'react';
import type {ButtonHTMLAttributes, InputHTMLAttributes, ReactNode} from 'react';

// 色は機能ごとに1色（見積・提案書作成アプリのデザイン規約と同じ使い分け）
const COLORS = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white', // 新規・追加
  blue: 'bg-blue-600 hover:bg-blue-700 text-white', // 保存・決定
  rose: 'bg-rose-600 hover:bg-rose-700 text-white', // 削除
  sky: 'bg-sky-600 hover:bg-sky-700 text-white', // 印刷
  cyan: 'bg-cyan-800 hover:bg-cyan-900 text-white', // まとめて印刷
  teal: 'bg-teal-600 hover:bg-teal-700 text-white', // 一覧・管理
  purple: 'bg-purple-600 hover:bg-purple-700 text-white', // メーカー・取り込み
  amber: 'bg-amber-500 hover:bg-amber-600 text-white',
  white: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
} as const;

export type BtnColor = keyof typeof COLORS;

export function Btn({
  color = 'blue',
  small = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {color?: BtnColor; small?: boolean}) {
  const size = small ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2.5 text-sm';
  return (
    <button
      type="button"
      className={`${COLORS[color]} ${size} inline-flex items-center justify-center gap-1.5 rounded-md font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 数字の入力欄。打っている途中（空・「1.」など）は文字のまま持ち、数字として読めたときだけ反映する */
export function NumberInput({
  value,
  onChange,
  className = '',
  min,
  ariaLabel,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  min?: number;
  ariaLabel?: string;
  placeholder?: string;
}) {
  // 入力していないときは「3,360」のように桁区切りで見せ、入力を始めたら「3360」のまま直せるようにする
  const show = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ja-JP', {maximumFractionDigits: 2}) : '');
  const [text, setText] = useState(() => show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(show(value));
  }, [value]);
  const commit = (t: string) => {
    const n = Number(t.normalize('NFKC').replace(/[,，\s¥円]/g, ''));
    if (t.trim() !== '' && Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, n) : n);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        setText(Number.isFinite(value) ? String(value) : '');
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onBlur={() => {
        focused.current = false;
        setText(show(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      className={`h-9 rounded-md border border-slate-300 bg-white px-2 text-right tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`}
    />
  );
}

/** −／＋ で数える欄（取付手間の箇所数・部材の数量） */
export function Stepper({value, onChange, ariaLabel}: {value: number; onChange: (n: number) => void; ariaLabel?: string}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label={`${ariaLabel ?? '数量'}を1減らす`}
        onClick={() => onChange(Math.max(0, roundQty(value - 1)))}
        className="h-9 w-8 rounded-md border border-slate-300 bg-white text-lg font-bold text-slate-600 hover:bg-slate-100"
      >
        −
      </button>
      <NumberInput value={value} onChange={(n) => onChange(roundQty(n))} min={0} ariaLabel={ariaLabel} className="w-14 text-center" />
      <button
        type="button"
        aria-label={`${ariaLabel ?? '数量'}を1増やす`}
        onClick={() => onChange(roundQty(value + 1))}
        className="h-9 w-8 rounded-md border border-slate-300 bg-white text-lg font-bold text-slate-600 hover:bg-slate-100"
      >
        ＋
      </button>
    </div>
  );
}

const roundQty = (n: number) => Math.round(n * 100) / 100;

export function TextInput({
  value,
  onChange,
  className = '',
  ...rest
}: {value: string; onChange: (s: string) => void; className?: string} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-md border border-slate-300 bg-white px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`}
      {...rest}
    />
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[calc(100vh-24px)] w-full flex-col rounded-xl bg-white shadow-2xl sm:max-h-[calc(100vh-48px)] ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- お知らせ（画面下に数秒出す）

type Toast = {id: number; text: string; tone: 'ok' | 'error'};
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {});

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = (text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), {id, text, tone}]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-lg rounded-lg border px-4 py-2.5 text-sm font-bold shadow-lg ${
              t.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function KindBadge({kind}: {kind: 'material' | 'labor'}) {
  // 元の仕切り計算表の色（商品＝黄、施工費＝青）に合わせる
  return kind === 'labor' ? (
    <span className="inline-block rounded bg-sky-500 px-1.5 py-0.5 text-[11px] font-bold text-white">手間</span>
  ) : (
    <span className="inline-block rounded bg-yellow-300 px-1.5 py-0.5 text-[11px] font-bold text-slate-800">部材</span>
  );
}

export function Star({on, onClick, label}: {on: boolean; onClick: () => void; label: string}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={on ? '「よく使う」から外す' : '「よく使う」に入れる'}
      className={`h-8 w-8 rounded-md text-lg leading-none transition ${on ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-100 hover:text-amber-400'}`}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

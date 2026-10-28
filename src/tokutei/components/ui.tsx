import {createContext, useContext, useEffect, useRef, useState} from 'react';
import type {ButtonHTMLAttributes, InputHTMLAttributes, ReactNode} from 'react';

// 画面の部品。住宅改修 見積書アプリの src/sasaoka/components/ui.tsx（2026-10-20 の版）を写したもの（同じ見た目・同じ操作感にそろえる）
// 色は機能ごとに1色（見積・提案書作成アプリのデザイン規約と同じ使い分け）。どれも薄い地に濃い字・細い枠
// （ユーザーの指示「ガツンと濃い色だけは、目がチカチカするんで、少し控えて」2026-10-26。前は濃い地に白い字。削除は白い地に赤い字）。
// 同じ働きのボタンは、どの画面でも・住宅改修のアプリ（src/sasaoka の ui.tsx）でも同じ色（ユーザーの指示「同じ内容でボタンの色が違う場合は統一する」2026-10-28）：
//   保存（バックアップ・CSV も）＝softBlue、Excel で保存＝excel（住宅改修の softGreen と同じ）、印刷＝softSky、取り込む・スクショから自動認識＝purple、新規・追加・入れる＝emerald、
//   削除・複製・閉じる・やめる・戻る・販売受注簿に転記・売上伝票依頼書など＝white（rose は使わない＝前の販売見積書の削除）
const COLORS = {
  emerald: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300', // 新規・追加
  blue: 'bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300', // 保存・決定
  rose: 'bg-white hover:bg-rose-50 text-rose-700 border border-rose-300', // 削除
  sky: 'bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300', // 印刷
  softSky: 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300', // 印刷（住宅改修の softSky と同じ）
  softBlue: 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200', // 保存（住宅改修の softBlue と同じ）
  excel: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300', // Excel で保存（薄い緑）
  cyan: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-900 border border-cyan-300', // まとめて印刷
  teal: 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300', // 一覧・管理
  purple: 'bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-300', // メーカー・取り込み
  amber: 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300',
  white: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
} as const;

export type BtnColor = keyof typeof COLORS;

/** ボタンの見た目（リンクをボタンの形で出すときにも使う） */
export function btnClass(color: BtnColor = 'blue', small = false): string {
  const size = small ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2.5 text-sm';
  return `${COLORS[color]} ${size} inline-flex items-center justify-center gap-1.5 rounded-md font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40`;
}

export function Btn({
  color = 'blue',
  small = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {color?: BtnColor; small?: boolean}) {
  return (
    <button type="button" className={`${btnClass(color, small)} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/**
 * 数字の入力欄。打っている途中（空・「1.」など）は文字のまま持ち、数字として読めたときだけ反映する。
 * blankZero：0 のときは空欄に見せ、空にしたら 0 にする（長さなど、入れないこともある欄）
 */
export function NumberInput({
  value,
  onChange,
  className = '',
  min,
  ariaLabel,
  placeholder,
  blankZero = false,
  autoFocus = false,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  min?: number;
  ariaLabel?: string;
  placeholder?: string;
  blankZero?: boolean;
  autoFocus?: boolean;
}) {
  // 入力していないときは「3,360」のように桁区切りで見せ、入力を始めたら「3360」のまま直せるようにする
  const show = (v: number) => (!Number.isFinite(v) || (blankZero && v === 0) ? '' : v.toLocaleString('ja-JP', {maximumFractionDigits: 2}));
  const [text, setText] = useState(() => show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(show(value));
  }, [value, blankZero]);
  const commit = (t: string) => {
    if (blankZero && t.trim() === '') {
      onChange(0);
      return;
    }
    const n = Number(t.normalize('NFKC').replace(/[,，\s¥円]/g, ''));
    if (t.trim() !== '' && Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, n) : n);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        setText(Number.isFinite(value) && !(blankZero && value === 0) ? String(value) : '');
        const el = e.currentTarget;
        // 選ぶのは次の描画のあと（数字を書き換えてから）。その前に Tab で次の欄へ移っていたら選ばない（select() は欄に戻ってしまう）
        requestAnimationFrame(() => document.activeElement === el && el.select());
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

/**
 * 空欄にできる数字の欄（空欄なら null）。介護保険の今年度の残りのように「空欄＝入れていない」と「0」を分けたい欄に使う
 */
export function OptionalNumberInput({
  value,
  onChange,
  className = '',
  ariaLabel,
  placeholder,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const show = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : v.toLocaleString('ja-JP'));
  const [text, setText] = useState(() => show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(show(value));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={() => {
        focused.current = true;
        setText(value === null ? '' : String(value));
      }}
      onBlur={() => {
        focused.current = false;
        setText(show(value));
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') {
          onChange(null);
          return;
        }
        const n = Number(t.normalize('NFKC').replace(/[,，\s¥円]/g, ''));
        if (Number.isFinite(n)) onChange(Math.max(0, n));
      }}
      className={`h-9 rounded-md border border-slate-300 bg-white px-2 text-right tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`}
    />
  );
}

/** いくつかの中から1つを選ぶボタンの並び（負担割合・支払方法など） */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1.5 text-sm font-bold ${value === v ? 'bg-teal-100 text-teal-900 ring-1 ring-inset ring-teal-300' : 'text-slate-600 hover:bg-teal-50'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** −／＋ で数える欄（商品の数量） */
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

export function Star({on, onClick, label}: {on: boolean; onClick: () => void; label: string}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={on ? 'お気に入りから外す' : 'お気に入りに登録する'}
      className={`h-8 w-8 rounded-md text-lg leading-none transition ${on ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-100 hover:text-amber-400'}`}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

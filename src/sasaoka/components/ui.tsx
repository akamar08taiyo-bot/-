import {createContext, useContext, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import type {ButtonHTMLAttributes, DragEvent as ReactDragEvent, InputHTMLAttributes, ReactNode} from 'react';

// 色は機能ごとに1色（見積・提案書作成アプリのデザイン規約と同じ使い分け）。どれも薄い地に濃い字・細い枠。
// 同じ働きのボタンは、どの画面でも・特定福祉用具のアプリ（src/tokutei の ui.tsx）でも同じ色（ユーザーの指示「同じ内容でボタンの色が違う場合は統一する」2026-10-28）：
//   保存（バックアップ・CSV も）＝softBlue、Excel で保存＝softGreen、印刷＝softSky、取り込む＝purple、新規・追加＝emerald、
//   削除・複製・閉じる・やめる・戻る・販売受注簿に転記・売上伝票依頼書・白紙に戻すなど＝white
// （ユーザーの指示「ガツンと濃い色だけは、目がチカチカするんで、少し控えて」2026-10-26。前は濃い地に白い字。削除は白い地に赤い字）
const COLORS = {
  emerald: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300', // 新規・追加
  blue: 'bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300', // 保存・決定
  rose: 'bg-white hover:bg-rose-50 text-rose-700 border border-rose-300', // 削除
  sky: 'bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300', // 印刷
  cyan: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-900 border border-cyan-300', // まとめて印刷
  teal: 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300', // 一覧・管理
  purple: 'bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-300', // メーカー・取り込み
  amber: 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300',
  white: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
  // 薄い色（ユーザーの指示：色を付けるのは保存・Excel・印刷くらいにして、濃い色にしない。削除・白紙に戻す・発注書などは白）
  softBlue: 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200', // 保存
  softGreen: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300', // Excel で保存
  softSky: 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300', // 印刷
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

/** −／＋ で数える欄（取付手間の箇所数・部材の数量） */
export function Stepper({value, onChange, ariaLabel, blankZero = false}: {value: number; onChange: (n: number) => void; ariaLabel?: string; blankZero?: boolean}) {
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
      <NumberInput value={value} onChange={(n) => onChange(roundQty(n))} min={0} ariaLabel={ariaLabel} className="w-14 text-center" blankZero={blankZero} />
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

export function KindBadge({kind, label}: {kind: 'material' | 'labor'; label?: string}) {
  // 元の仕切り計算表の色（商品＝黄、施工費＝青）に合わせる。色は少し薄く（「ガツンと濃い色だけは…控えて」2026-10-26。前は bg-sky-500・bg-yellow-300）
  return kind === 'labor' ? (
    <span className="inline-block whitespace-nowrap rounded bg-sky-200 px-1.5 py-0.5 text-[11px] font-bold text-sky-900">{label ?? '手間'}</span>
  ) : (
    <span className="inline-block rounded bg-yellow-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-800">部材</span>
  );
}

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

// ---------------------------------------------------------------- ファイルを落とせる所（2026-10-23）
// ユーザーの指示「完了写真もドラッグ＆ドロップや貼付けしやすいようにする。介護保険証もそうです。スクリーンショットもそうです。
// ドラッグドロップで貼り付けれるっていうことが認識しやすいように、見やすいようにしてください」：点線の枠と「ここにドロップ・Ctrl+V」、
// ファイルを画面に持ってきたら落とせる所をみな薄い緑に、重ねている所は緑で「ここに離す」

let fileDragging = false;
let dragTimer: ReturnType<typeof setTimeout> | undefined;
const dragListeners = new Set<() => void>();
const hasFiles = (e: {dataTransfer: DataTransfer | null}) => [...(e.dataTransfer?.types ?? [])].includes('Files');
function setFileDragging(on: boolean) {
  clearTimeout(dragTimer);
  if (fileDragging === on) return;
  fileDragging = on;
  for (const l of dragListeners) l();
}
// ファイルを画面の上で動かしているあいだは dragover が続く（画面の外へ出た・やめたときは来なくなる）
const onWindowDragOver = (e: DragEvent) => {
  if (!hasFiles(e)) return;
  setFileDragging(true);
  dragTimer = setTimeout(() => setFileDragging(false), 300);
};
const onWindowDragEnd = () => setFileDragging(false);
// 落とせる所の外で離したファイルを、ブラウザが開いて（アプリから離れて）しまわないように
const guardOver = (e: DragEvent) => {
  if (!hasFiles(e) || e.defaultPrevented || !e.dataTransfer) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'none';
};
const guardDrop = (e: DragEvent) => {
  if (hasFiles(e) && !e.defaultPrevented) e.preventDefault();
};
function subscribeDrag(fn: () => void) {
  dragListeners.add(fn);
  if (dragListeners.size === 1) {
    window.addEventListener('dragover', onWindowDragOver, true);
    window.addEventListener('drop', onWindowDragEnd, true);
    window.addEventListener('dragend', onWindowDragEnd, true);
    window.addEventListener('dragover', guardOver);
    window.addEventListener('drop', guardDrop);
  }
  return () => {
    dragListeners.delete(fn);
    if (dragListeners.size) return;
    window.removeEventListener('dragover', onWindowDragOver, true);
    window.removeEventListener('drop', onWindowDragEnd, true);
    window.removeEventListener('dragend', onWindowDragEnd, true);
    window.removeEventListener('dragover', guardOver);
    window.removeEventListener('drop', guardDrop);
  };
}

/** ファイル（エクスプローラーの写真・画像など）を画面の上でドラッグしているか（落とせる所をみな目立たせる） */
export const useFileDragging = () => useSyncExternalStore(subscribeDrag, () => fileDragging, () => false);

/** ファイルを重ねているときの「ここに離す」（落とせる所の上にかぶせる） */
export function DropOverlay({text = 'ここに離す'}: {text?: string}) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-emerald-100 px-1 text-sm font-bold text-emerald-900">
      {text}
    </span>
  );
}

/**
 * ファイルを落とせる所：点線の枠・言葉（label）・小さな言葉（hint。ふつうは「ここにドロップ・Ctrl+V」）。
 * 押す・Enter でファイルを選ぶ（onPick）。name は読み上げの名前（見える言葉が「ここに離す」に変わっても同じ）
 */
export function DropArea({
  name,
  label,
  hint = 'ここにドロップ・Ctrl+V',
  onFiles,
  onPick,
  big = false,
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrop' | 'onClick' | 'children'> & {name: string; label: ReactNode; hint?: ReactNode; onFiles: (files: File[]) => void; onPick?: () => void; big?: boolean}) {
  const [over, setOver] = useState(false);
  const dragging = useFileDragging();
  useEffect(() => {
    if (!dragging) setOver(false);
  }, [dragging]);
  const onDragOver = (e: ReactDragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setOver(true);
  };
  return (
    <button
      type="button"
      aria-label={name}
      {...rest}
      onClick={onPick}
      data-drop={over ? 'over' : dragging ? 'ready' : undefined}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        setFileDragging(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(files);
      }}
      className={`relative rounded-lg border-2 border-dashed text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
        over ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : dragging ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]' : 'border-sky-400 bg-white text-sky-900 hover:border-emerald-500 hover:bg-emerald-50/60'
      } ${big ? 'px-4 py-3' : 'px-3 py-1'} ${className}`}
    >
      <span className={`block font-bold ${big ? 'text-base' : 'text-sm'}`}>{label}</span>
      {hint && <span className={`block font-normal opacity-80 ${big ? 'text-xs' : 'text-[11px] leading-tight max-sm:hidden'}`}>{hint}</span>}
      {over && <DropOverlay />}
    </button>
  );
}

/**
 * 貼り付け（Ctrl+V）のファイル：画像・PDF（files になければ items から）。文字もあるとき（Excel の表をコピーすると、文字と一緒に表の絵も入る）は貼り付けない。
 * ただし文字がファイルの名前だけのとき（Mac でファイルをコピーすると名前も入る）は、ファイルの貼り付け（CardReader.tsx の CardDrop と同じ決まり）
 */
export function pastedFiles(data: DataTransfer, accept: (f: File) => boolean): File[] {
  const fromItems = [...data.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile());
  const files = (data.files.length ? [...data.files] : fromItems.filter((f): f is File => f !== null)).filter(accept);
  if (files.length === 0) return [];
  const text = data.getData('text/plain').trim();
  if (text && !text.split(/\r?\n/).every((line) => files.some((f) => f.name === line.trim()))) return [];
  return files;
}

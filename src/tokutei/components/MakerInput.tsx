// メーカー名の欄：打ち込めて、「▼」か打った字で候補から選べる（ユーザーの指示「メーカー名は、パナソニックエイジフリー（株）とアロン化成（株）はデフォルトにする。
// それ以外でも選べるようにする」2026-10-26）。候補ははじめの2つ＋商品マスタ・見積もりで使ったメーカー（sales.ts の makerChoices）。
// ブラウザの datalist は環境で見た目・動きが変わるので使わず、自分で候補を出す。候補は画面に固定して出す（入れる所の枠の overflow で切れないように。画面を動かしたら、ついて動く）
import {useEffect, useId, useRef, useState} from 'react';
import {makerKey} from '../sales.ts';

export function MakerInput({
  value,
  onChange,
  choices,
  className = '',
  ariaLabel = 'メーカー',
  placeholder = 'メーカー',
}: {
  value: string;
  onChange: (v: string) => void;
  choices: string[];
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // 打っているあいだは打った字で絞る（▼ で開いたときは全部）
  const [hi, setHi] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{left: number; top: number; width: number} | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setAt({left: r.left, top: r.bottom + 4, width: r.width});
    };
    place();
    // 欄のまわり（画面・入れる所の枠）が動いたら、候補もついて動く（ほかの所＝見積書のプレビューの枠などが動いても閉じない）
    const moved = (e: Event) => {
      const t = e.target;
      if (t === document || (t instanceof Node && boxRef.current && t.contains(boxRef.current))) place();
    };
    window.addEventListener('scroll', moved, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);
  const q = makerKey(value);
  const shown = typed && q ? choices.filter((c) => makerKey(c).includes(q) && c !== value) : choices;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setTyped(false);
    setHi(-1);
  };
  return (
    <div ref={boxRef} className={`relative flex min-w-0 ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
          setHi(-1);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && hi >= 0 && shown[hi]) {
            e.preventDefault();
            pick(shown[hi]);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="h-9 min-w-0 flex-1 rounded-l-md border border-r-0 border-slate-300 bg-white px-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${ariaLabel}を候補から選ぶ`}
        onMouseDown={(e) => e.preventDefault()} // 欄から離れずに開く
        onClick={() => {
          setTyped(false);
          setOpen((o) => !o);
          setHi(-1);
          inputRef.current?.focus();
        }}
        className="h-9 shrink-0 rounded-r-md border border-slate-300 bg-slate-50 px-2 text-xs text-slate-600 hover:bg-slate-100"
      >
        ▼
      </button>
      {open && at && shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${ariaLabel}の候補`}
          style={{left: at.left, top: at.top, minWidth: at.width}}
          className="fixed z-50 max-h-64 w-max max-w-[min(22rem,90vw)] overflow-auto rounded-md border border-slate-300 bg-white py-1 text-sm shadow-lg"
        >
          {shown.map((c, i) => (
            <li
              key={c}
              role="option"
              aria-selected={c === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              className={`cursor-pointer px-3 py-1.5 ${i === hi ? 'bg-slate-100' : 'hover:bg-slate-50'} ${c === value ? 'font-bold text-slate-900' : 'text-slate-700'}`}
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

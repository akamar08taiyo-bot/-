import {useEffect, useRef, useState} from 'react';
import type {InputHTMLAttributes} from 'react';
import {TextInput} from './ui.tsx';

/**
 * 前に入れた値から選べる入力欄（居宅介護支援事業所・ケアマネジャー）。候補はいつもは出さず、右の「▼」で開くリストから選ぶ。
 * リストの各行の「✕」で候補から消す（前の案件に入っている値はそのまま。設定の hiddenSuggest に覚えて、もう出さない）。
 * ユーザーの指示「候補一覧は常時表示しない　リストから選べるようにする。リスト一覧になった場合も消せるようにする」2026-10-28。
 * 前は欄の下に候補を丸いボタンで並べていた。datalist は使わない（スマホで出し方がまちまちなため）
 */
export function SuggestInput({
  value,
  onChange,
  values,
  onHide,
  label,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  values: string[]; // 候補（多い順。消したものは除いてある）
  onHide: (v: string) => void; // 候補から消す
  label: string; // 欄の名前（aria-label。候補の「▼」・リストの名前にも使う）
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = values.filter((v) => v !== value.trim());
  const none = list.length === 0;

  // リストの外を押す・Esc で閉じる。候補がなくなったら閉じる
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => {
    if (none) setOpen(false);
  }, [none]);

  return (
    <div ref={box} className="relative flex min-w-0 gap-1">
      <TextInput value={value} onChange={onChange} className="min-w-0 flex-1" aria-label={label} {...rest} />
      {!none && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`${label}の候補`}
          aria-expanded={open}
          title="前に入れたものから選ぶ"
          className="h-9 shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          ▼
        </button>
      )}
      {open && (
        <ul aria-label={`${label}の候補の一覧`} className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg">
          {list.map((v) => (
            <li key={v} className="flex items-center gap-1 px-1">
              <button
                type="button"
                onClick={() => {
                  onChange(v);
                  setOpen(false);
                }}
                className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm font-normal text-slate-700 hover:bg-teal-50"
                title={v}
              >
                {v}
              </button>
              <button
                type="button"
                onClick={() => onHide(v)}
                aria-label={`${v}を候補から消す`}
                title="候補から消す（前の見積もりの値は消えません）"
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

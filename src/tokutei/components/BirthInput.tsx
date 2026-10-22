import {useEffect, useRef, useState} from 'react';
import {todayIso} from '../util.ts';
import {ageOn, parseDateText, warekiLabel} from '../wareki.ts';

/**
 * 生年月日の欄：和暦でも西暦でも、区切りがなくても打てる（S31.6.10・昭和31年6月10日・1956/6/10・19560610）。
 * 読めたら和暦・西暦・年齢を下に出す（申請書の「明・大・昭」の丸は、この日から決まる）
 */
export function BirthInput({value, onChange}: {value: string; onChange: (iso: string) => void}) {
  const [text, setText] = useState(() => warekiLabel(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(warekiLabel(value));
  }, [value]);
  const bad = text.trim() !== '' && parseDateText(text) === null;
  const age = value ? ageOn(value, todayIso()) : null;
  return (
    <div className="grid gap-1">
      <input
        type="text"
        value={text}
        placeholder="S31.6.10 ／ 昭和31年6月10日"
        aria-label="生年月日"
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          if (!bad) setText(warekiLabel(value));
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const iso = t.trim() ? parseDateText(t) : '';
          if (iso !== null) onChange(iso);
        }}
        className={`h-9 w-full min-w-0 rounded-md border px-2 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${bad ? 'border-rose-300 bg-rose-50' : 'border-slate-300 bg-white'}`}
      />
      {(bad || value) && (
        <span className={`text-[11px] font-normal ${bad ? 'text-rose-600' : 'text-slate-500'}`}>
          {bad ? '日付として読めません（例：S31.6.10）' : `${warekiLabel(value)}（${Number(value.slice(0, 4))}年）${age !== null ? `・${age}歳` : ''}`}
        </span>
      )}
    </div>
  );
}

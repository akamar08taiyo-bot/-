// 申請書・見積書の入れる所の部品：住宅改修の申請書のタブ（src/sasaoka/estimate/ShinseiEditor.tsx）と同じ入れ方・同じ色にする
// （ユーザーの指示「特定福祉用具の場合は、生年月日なども含め、入力の仕方や色など、住宅改修と同じ入力方法にする」2026-10-26）。
//   選ぶ所は丸のボタン（選んだものは濃い枠・薄い黄色、ほかは点線）、フリガナはひらがなで打ってもカタカナ、被保険者番号は申請書と同じ10マス、
//   生年月日は 明治・大正・昭和（初めは昭和）と 年・月・日、郵便番号は 〒。Enter で次の欄（data-nav）
import {Fragment, useEffect, useRef, useState} from 'react';
import type {InputHTMLAttributes, KeyboardEvent} from 'react';
import {padInsuredNo} from '../shinsei.ts';
import {toKatakana} from '../util.ts';
import {fromWareki, warekiOf} from '../wareki.ts';
import {TextInput} from './ui.tsx';

/** 丸のボタンで1つ選ぶ（住宅改修の Circles と同じ形）。clearable なら、選んでいるものをもう一度押すと外す */
export function Circles<T extends string | number>({
  label,
  options,
  value,
  onPick,
  clearable = false,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T | '' | null;
  onPick: (v: T | '') => void;
  clearable?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map(([o, text], k) => (
        <Fragment key={String(o)}>
          {k > 0 && <span className="text-slate-400">・</span>}
          <button
            type="button"
            aria-pressed={value === o}
            onClick={() => (value === o ? clearable && onPick('') : onPick(o))}
            className={`min-w-[2.75rem] rounded-full px-3 py-1 text-sm font-bold transition ${
              value === o ? 'border-2 border-slate-800 bg-amber-50 text-slate-900' : 'border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {text}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * フリガナの欄：ひらがな・半角カタカナで打っても全角カタカナにする（toKatakana）。日本語の変換中は変えず（変えると変換がこわれる）、
 * 確定したとき・貼り付けたとき・欄を離れたときに変える（住宅改修の KanaInput と同じ）
 */
export function KanaInput({value, onChange, ...rest}: {value: string; onChange: (v: string) => void} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const composing = useRef(false);
  const commit = (v: string) => {
    const k = toKatakana(v);
    if (k !== value || k !== v) onChange(k);
  };
  return (
    <TextInput
      value={value}
      onChange={(v) => (composing.current ? onChange(v) : commit(v))}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        commit(e.currentTarget.value);
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      {...rest}
    />
  );
}

/** 被保険者番号：打つ欄と、申請書と同じ10マス（右に寄せ、空いた左のマスは 0）。確定したら10けたにそろえる */
export function InsuredNoInput({value, onChange}: {value: string; onChange: (v: string) => void}) {
  const boxes = value ? [...padInsuredNo(value)] : Array.from({length: 10}, () => '');
  return (
    <>
      <TextInput
        value={value}
        onChange={(v) => onChange(v.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 10))}
        onBlur={() => value && value !== padInsuredNo(value) && onChange(padInsuredNo(value))}
        inputMode="numeric"
        placeholder="10けた"
        className="w-36 font-mono"
        aria-label="被保険者番号"
        data-nav
      />
      <span className="flex" aria-label="被保険者番号の10マス">
        {boxes.map((d, k) => (
          <span key={k} className="grid h-8 w-5 place-items-center border border-l-0 border-slate-400 font-mono text-base first:border-l sm:w-6">
            {d}
          </span>
        ))}
      </span>
    </>
  );
}

const ERAS = [
  ['明治', '明治'],
  ['大正', '大正'],
  ['昭和', '昭和'],
] as const;
type Era = (typeof ERAS)[number][0];
type Parts = {era: string; y: string; m: string; d: string};
const partsOf = (iso: string): Parts => {
  const w = warekiOf(iso);
  return w ? {era: w.era, y: String(w.y), m: String(w.m), d: String(w.d)} : {era: '昭和', y: '', m: '', d: ''};
};
const num = (t: string) => Number(t.normalize('NFKC').replace(/[^\d]/g, ''));

/**
 * 生年月日：元号の丸（明治・大正・昭和。初めは昭和＝ユーザーの指示「昭和がデフォルトにする」、押している元号をもう一度押しても外さない）と、年・月・日の欄。
 * 年・月・日がそろって本当にある日になったら、案件の生年月日（YYYY-MM-DD）にする。全部消したら空。そろうまでは前の値のまま
 */
export function EraBirthInput({value, onChange}: {value: string; onChange: (iso: string) => void}) {
  const [p, setP] = useState<Parts>(() => partsOf(value));
  const last = useRef(value);
  // ほかの所（前のお客様から入れる・住宅改修から）で変わったら、欄を入れ直す
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setP(partsOf(value));
    }
  }, [value]);
  const set = (patch: Partial<Parts>) => {
    const next = {...p, ...patch};
    setP(next);
    const iso = !next.y.trim() && !next.m.trim() && !next.d.trim() ? '' : fromWareki(next.era, num(next.y), num(next.m), num(next.d));
    if (iso !== null && iso !== value) {
      last.current = iso;
      onChange(iso);
    }
  };
  const bad = !!(p.y.trim() && p.m.trim() && p.d.trim()) && fromWareki(p.era, num(p.y), num(p.m), num(p.d)) === null;
  const box = (key: 'y' | 'm' | 'd', label: string, w: string) => (
    <TextInput value={p[key]} onChange={(v) => set({[key]: v})} inputMode="numeric" className={`${w} text-right ${bad ? 'border-rose-300 bg-rose-50' : ''}`} aria-label={`生年月日の${label}`} data-nav />
  );
  return (
    <>
      <Circles<Era> label="元号" options={ERAS} value={(ERAS.some(([e]) => e === p.era) ? p.era : '') as Era | ''} onPick={(era) => era && set({era})} />
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {box('y', '年', 'w-14')}年{box('m', '月', 'w-12')}月{box('d', '日', 'w-12')}日生
      </span>
    </>
  );
}

/** Enter で次の欄へ（data-nav のある欄・選ぶ欄。日本語の変換中は動かさない。住宅改修の申請書のタブと同じ） */
export function nextOnEnter(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
  const el = e.target as HTMLElement;
  if (!el.matches('input')) return;
  const all = [...e.currentTarget.querySelectorAll<HTMLElement>('input[data-nav], select[data-nav]')];
  const next = all[all.indexOf(el) + 1];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

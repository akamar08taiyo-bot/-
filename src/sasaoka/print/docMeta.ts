import {useEffect, useRef, useState} from 'react';

/** 請求書の請求日・請求書番号・お支払期限、見積書の作成日 */
export type DocMeta = {date: string; number: string; due: string};

const META_KEY = 'sasaoka-app:invoice-meta';
const CHANGED = 'sasaoka-app:doc-meta-changed';

function readMeta(key: string, defaultDate: () => string): DocMeta {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    if (all && all[key]) return {date: '', number: '', due: '', ...all[key]};
  } catch {
    /* 初期値にする */
  }
  return {date: defaultDate(), number: '', due: ''};
}

/** 覚えている日付（見積書の一覧に作成日を出すとき）。覚えていなければ '' */
export function readDocDate(key: string): string {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return all && all[key] && typeof all[key].date === 'string' ? all[key].date : '';
  } catch {
    return '';
  }
}

function writeMeta(key: string, meta: DocMeta) {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
    all[key] = meta;
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch {
    /* 覚えられなくても印刷はできる */
  }
}

/**
 * 請求日・請求書番号・お支払期限は月ごとに、見積書の作成日は様邸ごとに覚えておく（次に開いたときも同じものが入る）。
 * key は請求書なら 'YYYY-MM'、見積書なら 'est:様邸のID'。
 * 様邸の画面の見積書のプレビューと印刷の画面のどちらで変えても、もう片方に同じ日が入る
 */
export function useDocMeta(key: string, defaultDate: () => string) {
  const dflt = useRef(defaultDate);
  dflt.current = defaultDate;
  const [meta, setState] = useState<DocMeta>(() => readMeta(key, defaultDate));
  useEffect(() => {
    writeMeta(key, meta);
  }, [key, meta]);
  useEffect(() => {
    const onChanged = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setState(readMeta(key, dflt.current));
    };
    window.addEventListener(CHANGED, onChanged);
    return () => window.removeEventListener(CHANGED, onChanged);
  }, [key]);
  const setMeta = (next: DocMeta) => {
    setState(next);
    writeMeta(key, next);
    window.dispatchEvent(new CustomEvent(CHANGED, {detail: key}));
  };
  return [meta, setMeta] as const;
}

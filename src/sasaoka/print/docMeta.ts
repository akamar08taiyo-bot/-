import {useEffect, useRef, useState} from 'react';
import type {Job} from '../types.ts';
import {isoDate} from '../util.ts';

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

/** 覚えている日付。覚えていなければ '' */
function readDocDate(key: string): string {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return all && all[key] && typeof all[key].date === 'string' ? all[key].date : '';
  } catch {
    return '';
  }
}

function writeMeta(key: string, meta: DocMeta) {
  if (!key) return;
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
    all[key] = meta;
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch {
    /* 覚えられなくても印刷はできる */
  }
}

/**
 * 見積もり作成日：見積書に入れた日（Job.estDate）。入れていなければ、前の版で見積書の右上に入れた日（この端末に覚えていたもの）、
 * それもなければ見積書を作った日（何も入れなければ当日）
 */
export function estimateDateOf(job: Pick<Job, 'id' | 'estDate' | 'createdAt'>): string {
  return job.estDate || readDocDate(`est:${job.id}`) || isoDate(job.createdAt);
}

/**
 * 請求書の請求日・請求書番号・お支払期限は月ごとに覚えておく（次に開いたときも同じものが入る）。key は 'YYYY-MM'（'' なら覚えない）。
 * 見積書の作成日は様邸（Job.estDate）に持つ
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

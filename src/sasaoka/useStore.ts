import {useCallback, useEffect, useRef, useState} from 'react';
import {loadAll, saveKey} from './storage.ts';
import type {DataKey} from './storage.ts';
import type {AppData} from './types.ts';

/**
 * アプリ全体のデータ。変更すると少し待ってから自動で保存する（入力のたびに書き込まない）。
 * 画面を閉じる・別のタブに切り替えるときは、待たずにすぐ保存する。
 */
export function useStore() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const pending = useRef(new Map<DataKey, unknown>());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    loadAll()
      .then(setData)
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const items = [...pending.current.entries()];
    pending.current.clear();
    if (items.length === 0) return;
    Promise.all(items.map(([k, v]) => saveKey(k, v)))
      .then(() => {
        setSaveError('');
        setSavedAt(Date.now());
      })
      .catch(() =>
        setSaveError('保存できませんでした。この端末の空き容量、またはプライベート（シークレット）モードでないことを確認してください。'),
      );
  }, []);

  const update = useCallback(
    <K extends DataKey>(key: K, fn: (prev: AppData[K]) => AppData[K]) => {
      setData((prev) => {
        if (!prev) return prev;
        const nextValue = fn(prev[key]);
        if (nextValue === prev[key]) return prev;
        pending.current.set(key, nextValue);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 400);
        return {...prev, [key]: nextValue};
      });
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  return {data, update, loadError, saveError, savedAt, flush};
}

export type Store = ReturnType<typeof useStore>;
export type Update = Store['update'];

import {useCallback, useEffect, useRef, useState} from 'react';
import {cleanKey, DATA_KEYS, loadAllStamped, loadKeyStamped, loadStamps, saveKeySynced, saveLocal} from './storage.ts';
import type {DataKey} from './storage.ts';
import {mergeKey} from './sync.ts';
import type {AppData} from './types.ts';
import {uid} from './util.ts';

/** 見積書作成・仕切り計算の両アプリ（とそのタブ）に「保存しました」を知らせる */
const CHANNEL = 'taiyo-sasaoka-shikiri';
const ME = uid('tab');

/**
 * アプリ全体のデータ。変更すると少し待ってから自動で保存する（入力のたびに書き込まない）。
 * 画面を閉じる・別のタブやアプリに切り替えるときは、待たずにすぐ保存する。
 * 見積書作成アプリと仕切り計算・請求書アプリは同じデータを使う。もう片方（または別のタブ）が保存したら読み直し、
 * こちらの保存とかさなったときは、両方の変更をまとめて保存する（どちらの変更も消さない）。
 */
export function useStore() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const pending = useRef(new Map<DataKey, unknown>());
  const inFlight = useRef(new Set<DataKey>());
  // 保存場所にあると分かっているもの（読んだ・保存したもの）と、その印。ほかが保存したかどうかは印で分かる
  const base = useRef(new Map<DataKey, unknown>());
  const stamps = useRef(new Map<DataKey, string | undefined>());
  const timer = useRef<number | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    loadAllStamped()
      .then(({data: d, stamps: st}) => {
        for (const k of DATA_KEYS) {
          base.current.set(k, d[k]);
          stamps.current.set(k, st[k]);
        }
        setData(d);
      })
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  const schedule = useRef<() => void>(() => {});

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const items = [...pending.current.entries()];
    pending.current.clear();
    if (items.length === 0) return;
    const saves = items.map(async ([key, value]) => {
      inFlight.current.add(key);
      try {
        const res = await saveKeySynced(key, value, stamps.current.get(key), (theirs) =>
          mergeKey(key, base.current.get(key) as never, value as never, cleanKey(key, theirs)),
        );
        stamps.current.set(key, res.stamp);
        base.current.set(key, res.value);
        if (res.merged) {
          // ほかのアプリ・タブの変更とまとめた。保存しているあいだにまた打っていたら、まとめたものの上に足し直す
          setData((prev) => {
            if (!prev) return prev;
            const cur = prev[key];
            if (cur === value) return {...prev, [key]: res.value};
            const again = mergeKey(key, value as never, cur as never, res.value as never);
            pending.current.set(key, again);
            schedule.current();
            return {...prev, [key]: again};
          });
        }
        channel.current?.postMessage({from: ME, key, stamp: res.stamp});
      } catch {
        saveLocal(key, value); // 失敗したら下で警告を出す
      } finally {
        inFlight.current.delete(key);
      }
    });
    Promise.all(saves)
      .then(() => {
        setSaveError('');
        setSavedAt(Date.now());
      })
      .catch(() => setSaveError('保存できませんでした。この端末の空き容量、またはプライベート（シークレット）モードでないことを確認してください。'));
  }, []);

  schedule.current = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  };

  const update = useCallback(<K extends DataKey>(key: K, fn: (prev: AppData[K]) => AppData[K]) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextValue = fn(prev[key]);
      if (nextValue === prev[key]) return prev;
      pending.current.set(key, nextValue);
      schedule.current();
      return {...prev, [key]: nextValue};
    });
  }, []);

  /** ほかのアプリ・タブが保存した項目を読み直す（こちらに保存前の変更がある項目は、保存するときにまとめるので読み直さない） */
  const reload = useCallback(async (keys: DataKey[]) => {
    const busy = (k: DataKey) => pending.current.has(k) || inFlight.current.has(k);
    for (const key of keys) {
      if (busy(key)) continue;
      try {
        const {value, stamp} = await loadKeyStamped(key);
        if (stamp === stamps.current.get(key) || busy(key)) continue;
        const clean = cleanKey(key, value);
        stamps.current.set(key, stamp);
        base.current.set(key, clean);
        setData((prev) => (prev ? {...prev, [key]: clean} : prev));
      } catch {
        /* 読み直せなくても、保存するときにまとめる */
      }
    }
  }, []);

  const checkOthers = useCallback(async () => {
    const now = await loadStamps();
    const changed = DATA_KEYS.filter((k) => now[k] !== undefined && now[k] !== stamps.current.get(k));
    if (changed.length > 0) await reload(changed);
  }, [reload]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
      else void checkOthers();
    };
    const onFocus = () => void checkOthers();
    window.addEventListener('pagehide', flush);
    window.addEventListener('blur', flush);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onHide);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const ch = new BroadcastChannel(CHANNEL);
        ch.onmessage = (e: MessageEvent) => {
          const m = e.data as {
            from?: string;
            key?: DataKey;
            stamp?: string;
          } | null;
          if (!m || m.from === ME || !m.key || !DATA_KEYS.includes(m.key)) return;
          if (m.stamp !== stamps.current.get(m.key)) void reload([m.key]);
        };
        channel.current = ch;
      } catch {
        /* 使えなければ、画面に戻ったときに読み直す */
      }
    }
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('blur', flush);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onHide);
      channel.current?.close();
      channel.current = null;
    };
  }, [flush, reload, checkOthers]);

  return {data, update, loadError, saveError, savedAt, flush};
}

export type Store = ReturnType<typeof useStore>;
export type Update = Store['update'];

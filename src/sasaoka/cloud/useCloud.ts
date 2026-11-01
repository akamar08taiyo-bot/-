// 常時同期を画面から使う（設定のタブの「☁ スマホ・パソコンの同期」と、上の段の「☁ 同期済み」。App.tsx・CloudSection.tsx）。
// 同じ端末でアプリを2つのタブ（jutaku-mitsumori/ と sasaoka/ も）で開いても、同期するのは1つのタブだけ（navigator.locks）。ほかのタブの保存は、
// 保存の知らせ（BroadcastChannel）で同期するタブに届き、同期するタブがクラウドから入れたものは、ほかのタブにも同じ知らせで届く。

import {useCallback, useEffect, useRef, useState} from 'react';
import {photoIdsInUse, photosArrived} from '../photos.ts';
import {deriveKeys} from './crypto.ts';
import {CloudEngine, errorText, isOffline} from './engine.ts';
import type {CloudState} from './engine.ts';
import {connectFirestore} from './firestore.ts';
import {allSources, clearCloudState, CLOUD_FROM, idbState, JUTAKU_DB, listSource, loadConfig, photoStore, saveConfig, TOKUTEI_DB} from './local.ts';

/** 画面に出す同期のようす。off＝この端末は同期していない、waiting＝ほかのタブで同期している */
export type CloudView = {state: 'off' | 'waiting' | CloudState; at: number | null; message: string};

/** 同期を始める前に見せる件数（クラウドの様邸・この端末の様邸） */
export type CloudPlan = {remoteJobs: number; localJobs: number; commit: () => Promise<void>};

const LOCK = 'taiyo-jutaku-cloud';

export function useCloud() {
  const [view, setView] = useState<CloudView>({state: 'off', at: null, message: ''});
  const engine = useRef<CloudEngine | null>(null);
  const release = useRef<(() => void) | null>(null);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    engine.current?.stop();
    engine.current = null;
    release.current?.();
    release.current = null;
  }, []);

  /** 覚えている設定で同期を始める（ほかのタブが同期していれば、そのタブが閉じるまで待つ） */
  const run = useCallback(async () => {
    const config = await loadConfig();
    if (!config || !alive.current) {
      setView({state: 'off', at: null, message: ''});
      return;
    }
    stop();
    const go = async () => {
      setView((v) => ({...v, state: 'starting', message: ''}));
      try {
        const remote = await connectFirestore(config.space);
        const jobs = listSource('jobs', JUTAKU_DB, 'jobs');
        const e = new CloudEngine({
          remote,
          key: config.key,
          sources: allSources(),
          state: idbState,
          photos: photoStore,
          photoRefs: async () => photoIdsInUse([...(await jobs.read()).values()]),
          onStatus: (s) => alive.current && engine.current === e && setView({state: s.state, at: s.at, message: s.message}),
          onPhotos: photosArrived,
        });
        engine.current = e;
        await e.start();
      } catch (err) {
        if (alive.current) setView({state: isOffline(err) ? 'offline' : 'error', at: null, message: errorText(err)});
      }
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) {
      await go();
      return;
    }
    const ac = new AbortController();
    abort.current = ac;
    setView({state: 'waiting', at: null, message: ''});
    // つかんだら、同期をやめる（release）まで離さない
    locks
      .request(LOCK, {signal: ac.signal}, async () => {
        await go();
        await new Promise<void>((resolve) => (release.current = resolve));
      })
      .catch(() => undefined);
  }, [stop]);

  useEffect(() => {
    alive.current = true;
    void run();
    // この端末で保存した（このタブ・ほかのタブ・🛁 の中の特定福祉用具）→ 少し待って送る
    const chans = [JUTAKU_DB.channel, TOKUTEI_DB.channel].flatMap((name) => {
      try {
        const ch = new BroadcastChannel(name);
        ch.onmessage = (ev: MessageEvent) => {
          if ((ev.data as {from?: string} | null)?.from !== CLOUD_FROM) engine.current?.kick();
        };
        return [ch];
      } catch {
        return [];
      }
    });
    const online = () => void engine.current?.syncNow().catch(() => undefined);
    const visible = () => document.visibilityState === 'visible' && online();
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive.current = false;
      for (const ch of chans) ch.close();
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
      stop();
    };
  }, [run, stop]);

  /**
   * 合言葉を確かめる：鍵を作ってクラウドにつなぎ、その合言葉の置き場所にある様邸の数と、この端末の様邸の数を返す（画面で確かめてから commit で始める）。
   * 同じ合言葉の端末どうしが、同じデータになる
   */
  const prepare = useCallback(
    async (passphrase: string): Promise<CloudPlan> => {
      const {key, space} = await deriveKeys(passphrase);
      const remote = await connectFirestore(space);
      const remoteJobs = await remote.count('jobs');
      const localJobs = (await listSource('jobs', JUTAKU_DB, 'jobs').read()).size;
      return {
        remoteJobs,
        localJobs,
        commit: async () => {
          const old = await loadConfig();
          if (!old || old.space !== space) await clearCloudState(); // 前に別の合言葉で同期していた覚えは使わない
          await saveConfig({space, key, since: {}, startedAt: Date.now()});
          await run();
        },
      };
    },
    [run],
  );

  /** この端末の同期をやめる（この端末のデータ・クラウドのデータはそのまま） */
  const disable = useCallback(async () => {
    stop();
    await clearCloudState();
    setView({state: 'off', at: null, message: ''});
  }, [stop]);

  const syncNow = useCallback(() => engine.current?.syncNow().catch(() => undefined), []);

  return {view, prepare, disable, syncNow};
}

export type Cloud = ReturnType<typeof useCloud>;

// 文字を読む部品（tesseract.js の worker・日本語）を、写真の日付（stampDate.ts）と介護保険証（cardOcr.ts）で使い回す。
// 読み取りの本体・日本語のデータ（あわせて約5MB）は、初めて使うときにネット（jsDelivr。入れた版に合わせた URL）から取ってきてブラウザに覚えさせる。
// 画像はどこにも送らない（読むのはこの端末の中）。1つずつ順に読み、しばらく使わなければ片付ける（メモリを空ける）

import type {Worker} from 'tesseract.js';

let engine: Promise<Worker> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** 読み取りの部品ができるまで待つ時間。ネットが止まったままのときに、いつまでも待たない（同じ部品を使う写真の日付の読み取りも待たせつづける） */
export const ENGINE_TIMEOUT = 180_000;

/**
 * 部品を作って、できるのを待つ。日本語のデータを取ってこられなかったとき、tesseract.js の createWorker は失敗を握りつぶして、いつまでも終わらない。
 * そのとき呼ばれる errorHandler（onError）か時間切れで失敗にする（できたあとの読み取りの失敗は recognize の失敗になるので、ここでは何もしない）。
 * 時間切れのあとでできあがった部品は片付ける
 */
export async function settleWorker<W extends {terminate: () => Promise<unknown>}>(make: (onError: (e: unknown) => void) => Promise<W>, ms: number): Promise<W> {
  let fail: (e: unknown) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => (fail = reject));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('読み取りの部品を用意できませんでした（時間切れ）')), ms)));
  const worker = make((e) => fail(e));
  try {
    return await Promise.race([worker, failed, late]);
  } catch (e) {
    void worker.then((w) => w.terminate()).catch(() => undefined);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function getEngine(): Promise<Worker> {
  if (!engine) {
    const made: Promise<Worker> = (async () => {
      const {createWorker, OEM} = await import('tesseract.js');
      return settleWorker((onError) => createWorker('jpn', OEM.LSTM_ONLY, {errorHandler: onError}), ENGINE_TIMEOUT);
    })();
    engine = made;
    made.catch(() => {
      if (engine === made) engine = null; // ネットにつながらなかったときは、次にまた試す
    });
  }
  return engine;
}

function release() {
  clearTimeout(idle);
  idle = setTimeout(() => {
    const e = engine;
    engine = null;
    void e?.then((w) => w.terminate()).catch(() => undefined);
  }, 60_000);
}

/** 読み取りの部品を使う（ほかの読み取りが終わるのを待って、1つずつ）。設定（ページの分け方など）は使うたびに fn の中で決める */
export function withOcr<T>(fn: (worker: Worker) => Promise<T>): Promise<T> {
  const job = queue.then(async () => {
    clearTimeout(idle);
    try {
      return await fn(await getEngine());
    } finally {
      release();
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

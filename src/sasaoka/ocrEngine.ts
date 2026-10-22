// 文字を読む部品（tesseract.js の worker・日本語）を、写真の日付（stampDate.ts）と介護保険証（cardOcr.ts）で使い回す。
// 読み取りの本体・日本語のデータ（あわせて約5MB）は、初めて使うときにネット（jsDelivr。入れた版に合わせた URL）から取ってきてブラウザに覚えさせる。
// 画像はどこにも送らない（読むのはこの端末の中）。1つずつ順に読み、しばらく使わなければ片付ける（メモリを空ける）

import type {Worker} from 'tesseract.js';

let engine: Promise<Worker> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function getEngine(): Promise<Worker> {
  if (!engine) {
    engine = (async () => {
      const {createWorker, OEM} = await import('tesseract.js');
      return createWorker('jpn', OEM.LSTM_ONLY, {errorHandler: () => undefined});
    })();
    engine.catch(() => {
      engine = null; // ネットにつながらなかったときは、次にまた試す
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

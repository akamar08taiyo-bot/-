// 文字を読む部品（ocrEngine.ts）：部品ができないとき（日本語のデータを取ってこられない・ネットが止まった）に、いつまでも待たない
import assert from 'node:assert/strict';
import test from 'node:test';
import {settleWorker} from '../../src/sasaoka/ocrEngine.ts';

const fake = () => ({terminated: 0, async terminate() {
  this.terminated++;
}});
const never = new Promise<never>(() => undefined);

test('部品：errorHandler が呼ばれたら失敗（tesseract.js の createWorker は日本語のデータを取ってこられないと終わらない）', async () => {
  const t0 = Date.now();
  await assert.rejects(
    settleWorker((onError) => {
      setTimeout(() => onError('TypeError: fetch failed'), 10);
      return never;
    }, 60_000),
    /fetch failed/,
  );
  assert.ok(Date.now() - t0 < 1000);
});

test('部品：時間切れで失敗。あとからできた部品は片付ける。できれば、その部品', async () => {
  await assert.rejects(settleWorker(() => never, 30), /時間切れ/);
  const w = fake();
  await assert.rejects(settleWorker(() => new Promise((ok) => setTimeout(() => ok(w), 60)), 20), /時間切れ/);
  await new Promise((ok) => setTimeout(ok, 80));
  assert.equal(w.terminated, 1);
  const w2 = fake();
  assert.equal(await settleWorker(async () => w2, 1000), w2);
  assert.equal(w2.terminated, 0);
});

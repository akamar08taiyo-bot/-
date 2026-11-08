import assert from 'node:assert/strict';
import test from 'node:test';
import {cleanProducts, cleanSales} from '../../src/tokutei/storage.ts';

// 保存したデータの読み込み（storage.ts）。値はすべて架空

test('この版の知らない項目（新しい版で足した項目）は読み直しても残す（前の版を開いたままのタブの保存で消えないように。2026-11-08）', () => {
  const [s] = cleanSales([{id: 's1', customer: '見本 花子', futureField: 1, items: [{id: 'i1', name: '見本の椅子', futureItem: 'x'}]}]);
  assert.equal((s as unknown as {futureField: number}).futureField, 1);
  assert.equal((s.items[0] as unknown as {futureItem: string}).futureItem, 'x');
  assert.equal(s.customer, '見本 花子'); // 知っている項目は今までどおり整える
  const [p] = cleanProducts([{id: 'p1', name: '見本', futureProduct: true}]);
  assert.equal((p as unknown as {futureProduct: boolean}).futureProduct, true);
});

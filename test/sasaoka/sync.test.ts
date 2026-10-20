import assert from 'node:assert/strict';
import test from 'node:test';
import {cleanJobs, cleanSettings} from '../../src/sasaoka/storage.ts';
import {mergeKey, mergeRecords, mergeValue} from '../../src/sasaoka/sync.ts';

type R = {id: string; v: string; updatedAt?: number};
const r = (id: string, v: string, updatedAt = 0): R => ({id, v, updatedAt});
const ids = (list: R[]) => list.map((x) => `${x.id}:${x.v}`);

test('見積書作成と仕切り計算で同じ一覧を保存したとき：それぞれが変えた・足したものはどちらも残る', () => {
  const base = [r('a', '1'), r('b', '1'), r('c', '1')];
  const mine = [r('a', '2'), base[1], base[2], r('d', 'mine')]; // a を直して d を足した
  const theirs = [r('a', '1'), r('b', '2'), r('c', '1'), r('e', 'theirs')]; // 向こうは b を直して e を足した（読み直したので別のもの）
  assert.deepEqual(ids(mergeRecords(base, mine, theirs)), ['a:2', 'b:2', 'c:1', 'd:mine', 'e:theirs']);
});

test('消したもの：もう片方が直していなければ消え、直していれば残る', () => {
  const base = [r('a', '1'), r('b', '1'), r('c', '1'), r('d', '1')];
  // こちらは a・b を消した。向こうは b を直し、c・d を消した。こちらは d を直していた
  const mine = [base[2], r('d', '2')];
  const theirs = [r('a', '1'), r('b', '2')];
  assert.deepEqual(ids(mergeRecords(base, mine, theirs)), ['d:2', 'b:2']);
});

test('両方で同じ項目を直したときはこちら（あとから保存した方）。直した時刻は新しい方', () => {
  const m = mergeRecords([r('a', '1', 100)], [r('a', 'mine', 200)], [r('a', 'theirs', 300)]);
  assert.deepEqual(m, [{id: 'a', v: 'mine', updatedAt: 300}]);
});

test('同じ見積書の別のところを、見積書作成と仕切り計算で直したとき：両方残る（様邸の項目・箇所・行ごとに比べる）', () => {
  const [base] = cleanJobs([
    {
      id: 'j1',
      customer: '山田',
      updatedAt: 100,
      places: [
        {
          id: 'p1',
          name: '玄関',
          rows: [
            {id: 'r1', kind: 'material', name: '手すり', price: 10000, qty: 1},
            {id: 'r2', kind: 'labor', name: '木', price: 1000, qty: 2},
          ],
        },
        {id: 'p2', name: 'トイレ', rows: [{id: 'r3', kind: 'material', name: 'L型', price: 7800, qty: 1}]},
      ],
    },
  ]);
  const edit = (fn: (j: typeof base) => void) => {
    const j = structuredClone(base);
    fn(j);
    return j;
  };
  // 見積書作成：お客様名を直し、L型を2本にし、玄関に行を足した
  const mine = edit((j) => {
    j.customer = '山田 太郎';
    j.places[1].rows[0].qty = 2;
    j.places[0].rows.push({...j.places[0].rows[0], id: 'r4', name: 'ブラケット', price: 1500});
    j.updatedAt = 200;
  });
  // 仕切り計算：備考を書き、木を3箇所にし、トイレの名前を直し、浴室を足した
  const theirs = edit((j) => {
    j.note = '備考';
    j.places[0].rows[1].qty = 3;
    j.places[1].name = 'トイレ（1階）';
    j.places.push({id: 'p3', name: '浴室', rows: [], kind: 1, photo: 0});
    j.updatedAt = 300;
  });
  const [m] = mergeKey('jobs', [base], [mine], [theirs]);
  assert.equal(m.customer, '山田 太郎');
  assert.equal(m.note, '備考');
  assert.equal(m.updatedAt, 300);
  assert.deepEqual(
    m.places.map((p) => `${p.name}:${p.rows.map((x) => `${x.name}×${x.qty}`).join('・')}`),
    ['玄関:手すり×1・木×3・ブラケット×1', 'トイレ（1階）:L型×2', '浴室:'],
  );
});

test('設定：こちらで変えた項目だけこちら、ほかは向こう', () => {
  const base = cleanSettings({});
  const mine = {...base, estimateRate: 0.75};
  const theirs = {...base, rate: 0.08, staffList: ['久保 匠史']};
  const m = mergeValue(base, mine, theirs);
  assert.equal(m.estimateRate, 0.75);
  assert.equal(m.rate, 0.08);
  assert.deepEqual(m.staffList, ['久保 匠史']);
  assert.deepEqual(mergeKey('settings', base, mine, theirs), m);
});

test('前に読んだものが分からなければ、こちらの今のまま', () => {
  const mine = [r('a', '2')];
  assert.equal(mergeKey('jobs', undefined, mine as never, [r('b', '1')] as never), mine);
});

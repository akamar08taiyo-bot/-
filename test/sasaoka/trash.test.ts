import assert from 'node:assert/strict';
import test from 'node:test';
import {addSamples} from '../../src/sasaoka/samples.ts';
import {backupJson, cleanJobs, cleanKey, parseBackup} from '../../src/sasaoka/storage.ts';
import {mergeKey} from '../../src/sasaoka/sync.ts';
import {
  isTrashed,
  lastTrashAction,
  liveData,
  moveToTrash,
  purgeTrash,
  rememberTrashAction,
  restoreFromTrash,
  trashedJobs,
  undoTrashAction,
} from '../../src/sasaoka/trash.ts';
import {photoIdsInUse} from '../../src/sasaoka/photos.ts';
import type {AppData, Job} from '../../src/sasaoka/types.ts';

// 見本の様邸（名前は見本だけ）。写真の番号を持つ箇所を1つ
const jobs = (): Job[] =>
  cleanJobs([
    {id: 'j1', customer: '見本一', month: '2026-10', createdAt: 1, updatedAt: 1, places: [{id: 'p1', name: '玄関', photos: {before: 'ph-1', after: 'ph-2'}, rows: []}]},
    {id: 'j2', customer: '見本二', month: '2026-10', createdAt: 2, updatedAt: 2, places: []},
    {id: 'j3', customer: '見本三', month: '2026-11', createdAt: 3, updatedAt: 3, places: []},
  ]);
const data = (list: Job[]): AppData => ({materials: [], labor: [], jobs: list, kits: [], settings: cleanKey('settings', undefined)});
const names = (list: Job[]) => list.map((j) => j.customer);

test('ゴミ箱に移す：様邸は一覧に残したまま削除した時刻を付け、画面に出すデータ（liveData）からは除く', () => {
  const before = jobs();
  const after = moveToTrash(before, ['j1', 'j3'], 1000);
  assert.deepEqual(after.map((j) => j.trashedAt), [1000, undefined, 1000]);
  assert.deepEqual(after.map((j) => j.updatedAt), [1000, 2, 1000]);
  assert.equal(after.length, 3); // 消していない
  assert.deepEqual(names(liveData(data(after)).jobs), ['見本二']);
  // ゴミ箱は削除した時刻の新しい順（同じ時刻なら作った順の新しい方から）
  const later = moveToTrash(after, ['j2'], 2000);
  assert.deepEqual(names(trashedJobs(later)), ['見本二', '見本三', '見本一']);
  // もうゴミ箱にあるものは、削除した時刻を変えない。何も変わらなければ同じ並び（保存しない）
  assert.equal(moveToTrash(later, ['j1', 'nothing'], 3000), later);
  // ゴミ箱が空なら、画面に出すデータは同じもの（作り直さない）
  const d = data(before);
  assert.equal(liveData(d), d);
});

test('元に戻す：削除した時刻を外す（月・請求書に入れるかは削除する前のまま）。完全に削除はゴミ箱にあるものだけ', () => {
  const trashed = moveToTrash(
    jobs().map((j) => ({...j, shikiri: true})),
    ['j1', 'j2'],
    1000,
  );
  const back = restoreFromTrash(trashed, ['j1'], 2000);
  assert.equal('trashedAt' in back[0], false);
  assert.deepEqual([back[0].month, back[0].shikiri, back[0].updatedAt], ['2026-10', true, 2000]);
  assert.deepEqual(names(trashedJobs(back)), ['見本二']);
  assert.equal(restoreFromTrash(back, ['j3'], 3000), back); // ゴミ箱にないものは何もしない
  // 完全に削除：ゴミ箱にない様邸（ほかのタブで元に戻した・はじめからゴミ箱にない）は消さない
  const purged = purgeTrash(back, ['j1', 'j2', 'j3']);
  assert.deepEqual(names(purged), ['見本一', '見本三']);
  assert.equal(purgeTrash(purged, ['j1']), purged);
});

test('読み込み・バックアップ：ゴミ箱のまま（削除した時刻でないものは持たない）', () => {
  const [a, b, c] = cleanJobs([
    {id: 'a', trashedAt: 1700000000000},
    {id: 'b', trashedAt: 0},
    {id: 'c', trashedAt: 'x'},
  ]);
  assert.equal(a.trashedAt, 1700000000000);
  assert.equal('trashedAt' in b, false);
  assert.equal('trashedAt' in c, false);
  // バックアップ（すべて）にもゴミ箱の様邸が入り、読み込んでもゴミ箱のまま（なくさない）
  const all = data(moveToTrash(jobs(), ['j2'], 5000));
  const back = parseBackup(backupJson(all));
  assert.deepEqual(back.jobs!.map((j) => [j.id, j.trashedAt]), [['j1', undefined], ['j2', 5000], ['j3', undefined]]);
  // 保存してある形のまま（IndexedDB）読み直しても同じ
  assert.deepEqual(cleanJobs(structuredClone(all.jobs)), all.jobs);
});

test('2つのアプリ（タブ）：片方がゴミ箱に移しても、もう片方の保存で戻らない・消えない（前の版のタブも）', () => {
  const base = jobs();
  // こちら＝ゴミ箱を知らない前の版のタブ：見本二の月を直して保存。向こう＝新しい版：見本一をゴミ箱に移して先に保存
  const mine = base.map((j) => (j.id === 'j2' ? {...j, month: '2026-12', updatedAt: 10} : j));
  const theirs = moveToTrash(base, ['j1'], 20);
  // 前の版の読み込みも、知らない項目（trashedAt）はそのまま持つ（keepNewer）。ここでは今の cleanJobs で読み直す
  const merged = cleanJobs(mergeKey('jobs', base, mine, cleanJobs(structuredClone(theirs))));
  assert.deepEqual(merged.map((j) => [j.id, j.month, j.trashedAt]), [['j1', '2026-10', 20], ['j2', '2026-12', undefined], ['j3', '2026-11', undefined]]);
  // 前の版のタブで、ゴミ箱の様邸そのもの（前の版には一覧に出ている）を直しても、ゴミ箱のまま
  const mine2 = base.map((j) => (j.id === 'j1' ? {...j, customer: '見本一（直した）', updatedAt: 30} : j));
  const [j1] = cleanJobs(mergeKey('jobs', base, mine2, theirs));
  assert.deepEqual([j1.customer, j1.trashedAt], ['見本一（直した）', 20]);
});

test('2つのアプリ（タブ）：元に戻す・完全に削除と、もう片方の変更をまとめる', () => {
  const base = moveToTrash(jobs(), ['j1', 'j2'], 100);
  // こちらで見本一を元に戻した。向こうは同じ見本一の月を直していた → 元に戻った見本一に、向こうの直しも入る
  const mine = restoreFromTrash(base, ['j1'], 200);
  const theirs = base.map((j) => (j.id === 'j1' ? {...j, month: '2026-09', updatedAt: 150} : j));
  const [j1] = cleanJobs(mergeKey('jobs', base, mine, theirs));
  assert.deepEqual([isTrashed(j1), j1.month], [false, '2026-09']);
  // こちらで見本二を完全に削除。向こうが触っていなければ消える
  const purged = purgeTrash(base, ['j2']);
  assert.deepEqual(names(cleanJobs(mergeKey('jobs', base, purged, base))), ['見本一', '見本三']);
  // 向こうが先に見本二を元に戻していたら残す（消したあとで向こうが直したものは消さない。sync.ts の決まり）
  const restored = restoreFromTrash(base, ['j2'], 300);
  const kept = cleanJobs(mergeKey('jobs', base, purged, restored));
  assert.deepEqual(kept.map((j) => [j.id, isTrashed(j)]), [['j1', true], ['j3', false], ['j2', false]]);
});

test('写真の掃除：ゴミ箱の様邸の写真の番号も残す（完全に削除するまで）', () => {
  const all = moveToTrash(jobs(), ['j1'], 100);
  const keep = photoIdsInUse(all);
  assert.ok(keep.has('ph-1') && keep.has('ph-2'));
  // 画面に出すデータ（ゴミ箱を除く）から作ると残らない＝写真の掃除はゴミ箱も入ったデータから作ること
  assert.equal(photoIdsInUse(liveData(data(all)).jobs).has('ph-1'), false);
  assert.equal(photoIdsInUse(purgeTrash(all, ['j1'])).has('ph-1'), false);
});

test('Ctrl+Z：さっきのゴミ箱に移す・元に戻すをやめる（元に戻したのをやめると、前の削除した日のままゴミ箱へ）', () => {
  const list = moveToTrash(jobs(), ['j1', 'j2'], 100);
  const undoTrash = undoTrashAction(list, {kind: 'trash', ids: ['j1', 'j2'], when: new Map()}, 500);
  assert.deepEqual(trashedJobs(undoTrash), []);
  const restored = restoreFromTrash(list, ['j1'], 200);
  const again = undoTrashAction(restored, {kind: 'restore', ids: ['j1'], when: new Map([['j1', 100]])}, 600);
  assert.deepEqual(again.map((j) => j.trashedAt), [100, 100, undefined]);
  rememberTrashAction({kind: 'trash', ids: ['j3'], when: new Map()});
  assert.deepEqual(lastTrashAction()?.ids, ['j3']);
  rememberTrashAction(null);
  assert.equal(lastTrashAction(), null);
});

test('サンプルで試す：足すものだけを返す（画面のデータはゴミ箱を除いたものなので、並びごと置きかえるとゴミ箱が消える）', () => {
  const r = addSamples(data(jobs()), '2026-10');
  assert.deepEqual([r.materials.length, r.jobs.length, r.kits.length], [5, 1, 1]);
  assert.equal(r.jobs[0].customer, '（サンプル）山田');
});

// 常時同期（cloud/）：合言葉から作る鍵・暗号、2台の端末が同じクラウドで様邸・特定福祉用具の案件・部材リスト・写真をそろえること
// （ユーザーの指示「常時同期させる」「受注残管理アプリみたいに、常時同期させる」2026-11-01）。本物の Firebase にはつながない（メモリの中のクラウド。cloudMem.ts）
import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveKeys, normalizePassphrase, open, openJson, seal, sealJson} from '../../src/sasaoka/cloud/crypto.ts';
import {CloudEngine, merge3, same} from '../../src/sasaoka/cloud/engine.ts';
import type {Source} from '../../src/sasaoka/cloud/engine.ts';
import {MemPhotos, MemRemote, MemSource, MemState} from './cloudMem.ts';

const PASS = 'みほん合言葉 2026';
const keys = deriveKeys(PASS);

test('合言葉から鍵と置き場所：同じ合言葉（全角・半角・前後の空白のちがいも）なら同じ置き場所、ちがえば別。置き場所に合言葉は出ない', async () => {
  const a = await keys;
  const b = await deriveKeys(`  ${PASS.normalize('NFKC').replace('2026', '２０２６')}  `);
  const c = await deriveKeys('ちがう合言葉ですよ');
  assert.equal(normalizePassphrase('ＡＢＣ　１'), 'ABC 1');
  assert.match(a.space, /^taiyo-jutaku-[0-9a-f]{32}$/);
  assert.equal(a.space, b.space);
  assert.notEqual(a.space, c.space);
  assert.equal(a.key.extractable, false); // 鍵は取り出せない
});

test('暗号：同じ置き場所・同じ鍵でだけ開ける（別の様邸の場所に移すと開けない）。中にお客様名が見えない。大きな JSON は縮める', async () => {
  const {key} = await keys;
  const other = (await deriveKeys('ちがう合言葉ですよ')).key;
  const job = {id: 'j1', customer: '見本 花子', address: '福岡県見本市1-1', places: Array.from({length: 200}, (_, i) => ({id: `p${i}`, name: '玄関'}))};
  const box = await sealJson(key, 'jobs/j1', job);
  assert.deepEqual(await openJson(key, 'jobs/j1', box), job);
  assert.ok(!Buffer.from(box).toString('utf8').includes('見本') && !Buffer.from(box).includes(Buffer.from('見本 花子')));
  assert.ok(box.length < JSON.stringify(job).length / 3, `縮めていない ${box.length}`);
  await assert.rejects(openJson(key, 'jobs/j2', box));
  await assert.rejects(openJson(other, 'jobs/j1', box));
  const raw = new Uint8Array([1, 2, 3, 250]);
  assert.deepEqual(await open(key, 'photos/ph1', await seal(key, 'photos/ph1', raw)), raw);
  // 同じ中身でも毎回ちがう暗号（IV がちがう）
  assert.ok(!same([...(await sealJson(key, 'jobs/j1', job))], [...box]));
});

test('3つくらべ：片方だけの変更・両方の変更（項目ごと）・消した／直したのぶつかり・前にそろえた中身がないとき', () => {
  const base = {ver: 'v1', value: {id: 'j', a: 1, b: 1, updatedAt: 1}};
  assert.deepEqual(merge3(base, {id: 'j', a: 2, b: 1, updatedAt: 2}, {id: 'j', a: 1, b: 3, updatedAt: 3}), {id: 'j', a: 2, b: 3, updatedAt: 3});
  assert.equal(merge3(base, undefined, base.value), undefined); // この端末で消した・クラウドはそのまま → 消す
  assert.deepEqual(merge3(base, undefined, {id: 'j', a: 9, b: 1, updatedAt: 5}), {id: 'j', a: 9, b: 1, updatedAt: 5}); // 消したがクラウドで直していた → 残す
  // クラウドで消した（消した印）：この端末で直していなければ消す・直していれば残す
  assert.equal(merge3(base, base.value, undefined), base.value); // まだない（消した印でない）→ 残す
  // 前にそろえた中身がない：直した時刻の新しい方
  assert.deepEqual(merge3(undefined, {id: 'j', a: 1, updatedAt: 9}, {id: 'j', a: 2, updatedAt: 3}), {id: 'j', a: 1, updatedAt: 9});
  assert.deepEqual(merge3(undefined, {id: 'j', a: 1, updatedAt: 1}, {id: 'j', a: 2, updatedAt: 3}), {id: 'j', a: 2, updatedAt: 3});
  // 並び（部材リスト）は両方を合わせる。同じ id はクラウド
  assert.deepEqual(
    merge3(
      undefined,
      [
        {id: 'm1', n: 'mine'},
        {id: 'm2', n: 'x'},
      ],
      [
        {id: 'm1', n: 'theirs'},
        {id: 'm3', n: 'y'},
      ],
    ),
    [
      {id: 'm1', n: 'theirs'},
      {id: 'm3', n: 'y'},
      {id: 'm2', n: 'x'},
    ],
  );
});

type Device = {engine: CloudEngine; jobs: MemSource; sales: MemSource; keysSrc: MemSource; photos: MemPhotos; state: MemState; got: string[]; status: string[]};

async function device(remote: MemRemote, init: {jobs?: Record<string, unknown>; sales?: Record<string, unknown>; keys?: Record<string, unknown>} = {}, pass = PASS): Promise<Device> {
  const {key} = pass === PASS ? await keys : await deriveKeys(pass);
  const jobs = new MemSource('jobs', init.jobs);
  const sales = new MemSource('sales', init.sales);
  const keysSrc = new MemSource('keys', init.keys);
  const photos = new MemPhotos();
  const state = new MemState();
  const got: string[] = [];
  const status: string[] = [];
  const refs = async () => new Set(JSON.stringify([...jobs.map.values()]).match(/ph[0-9a-z]{12,24}/g) ?? []);
  const engine = new CloudEngine({
    remote,
    key,
    sources: [jobs, sales, keysSrc] as Source[],
    state,
    photos,
    photoRefs: refs,
    onPhotos: (ids) => got.push(...ids),
    onStatus: (st) => status.push(st.state),
  });
  return {engine, jobs, sales, keysSrc, photos, state, got, status};
}

/** 2台とも、届いたものをまとめ終えるまで待つ */
async function settle(...ds: Device[]) {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5));
    for (const d of ds) await d.engine.idle();
  }
}

const job = (id: string, customer: string, extra: Record<string, unknown> = {}) => ({id, customer, places: [], updatedAt: 1, ...extra});

test('2台の端末：はじめの端末の様邸・案件・部材リストがクラウドへ → あとから始めた端末に入る。クラウドには暗号だけ', async () => {
  const remote = new MemRemote();
  const a = await device(remote, {jobs: {j1: job('j1', '見本 花子')}, sales: {s1: {id: 's1', customer: '見本 花子', updatedAt: 1}}, keys: {'j.materials': [{id: 'm1', name: '見本の手すり'}]}});
  await a.engine.start();
  await settle(a);
  await a.engine.syncNow();
  assert.equal(await remote.count('jobs'), 1);
  assert.equal(await remote.count('sales'), 1);
  assert.equal(await remote.count('keys'), 1);
  for (const d of remote.docs.values()) assert.ok(!Buffer.from(d.v!).includes(Buffer.from('見本')), '暗号にしていない');
  const b = await device(remote);
  await b.engine.start();
  await settle(a, b);
  assert.deepEqual(b.jobs.map.get('j1'), job('j1', '見本 花子'));
  assert.deepEqual(b.sales.map.get('s1'), {id: 's1', customer: '見本 花子', updatedAt: 1});
  assert.deepEqual(b.keysSrc.map.get('j.materials'), [{id: 'm1', name: '見本の手すり'}]);
  // 何も変えなければ書かない
  const w = remote.writes;
  await b.engine.syncNow();
  await a.engine.syncNow();
  assert.equal(remote.writes, w);
  a.engine.stop();
  b.engine.stop();
});

test('同期中：片方で直す・足す・消すと、もう片方にすぐ入る。同じ様邸の別の項目を2台で直しても、両方の変更が残る', async () => {
  const remote = new MemRemote();
  const a = await device(remote, {jobs: {j1: job('j1', '見本 花子', {address: ''}), j2: job('j2', '見本 次郎')}});
  await a.engine.start();
  await settle(a);
  await a.engine.syncNow();
  const b = await device(remote);
  await b.engine.start();
  await settle(a, b);
  // B で住所を直す → A に入る
  b.jobs.map.set('j1', job('j1', '見本 花子', {address: '福岡県見本市1-1', updatedAt: 2}));
  await b.engine.syncNow();
  await settle(a, b);
  assert.equal((a.jobs.map.get('j1') as {address: string}).address, '福岡県見本市1-1');
  // 2台で同じ様邸の別の項目を直す（A は電話、B はフリガナ）→ どちらも残る
  a.jobs.map.set('j1', {...(a.jobs.map.get('j1') as object), tel: '000-0000-0000', updatedAt: 3});
  b.jobs.map.set('j1', {...(b.jobs.map.get('j1') as object), kana: 'ミホン ハナコ', updatedAt: 4});
  await Promise.all([a.engine.syncNow(), b.engine.syncNow()]);
  await settle(a, b);
  for (const d of [a, b]) {
    const j = d.jobs.map.get('j1') as Record<string, unknown>;
    assert.equal(j.tel, '000-0000-0000');
    assert.equal(j.kana, 'ミホン ハナコ');
  }
  // A で足した様邸 → B に。B で消した様邸 → A でも消える
  a.jobs.map.set('j3', job('j3', '見本 三郎'));
  await a.engine.syncNow();
  b.jobs.map.delete('j2');
  await b.engine.syncNow();
  await settle(a, b);
  assert.ok(b.jobs.map.has('j3'));
  assert.ok(!a.jobs.map.has('j2'));
  assert.equal(await remote.count('jobs'), 2); // j2 は消した印
  a.engine.stop();
  b.engine.stop();
});

test('消す・直すのぶつかり：片方が消したあいだに、もう片方が直していれば残す（消えない）', async () => {
  const remote = new MemRemote();
  const a = await device(remote, {jobs: {j1: job('j1', '見本 花子')}});
  await a.engine.start();
  await settle(a);
  await a.engine.syncNow();
  const b = await device(remote);
  await b.engine.start();
  await settle(a, b);
  b.engine.stop(); // B は電波のない所で直す
  b.jobs.map.set('j1', job('j1', '見本 花子', {address: '直した住所', updatedAt: 9}));
  a.jobs.map.delete('j1');
  await a.engine.syncNow();
  await settle(a);
  assert.equal(await remote.count('jobs'), 0);
  const b2 = new CloudEngine({remote, key: (await keys).key, sources: [b.jobs, b.sales, b.keysSrc], state: b.state});
  await b2.start();
  await settle(a, {...b, engine: b2});
  assert.equal((b.jobs.map.get('j1') as {address: string}).address, '直した住所');
  assert.equal((a.jobs.map.get('j1') as {address: string} | undefined)?.address, '直した住所'); // A にも戻る
  a.engine.stop();
  b2.stop();
});

test('電波がないあいだの変更は、つながってから送る。ちがう合言葉の端末は読めない（入れない）', async () => {
  const remote = new MemRemote();
  const a = await device(remote, {jobs: {j1: job('j1', '見本 花子')}});
  remote.offline = true;
  await a.engine.start();
  await settle(a);
  assert.equal(await remote.count('jobs'), 0);
  assert.equal(a.status.at(-1), 'offline'); // 画面に「つながっていません」
  remote.offline = false;
  await a.engine.syncNow();
  assert.equal(await remote.count('jobs'), 1);
  assert.equal(a.status.at(-1), 'idle');
  const x = await device(remote, {}, 'ちがう合言葉ですよ');
  await x.engine.start();
  await settle(a, x);
  assert.equal(x.jobs.map.size, 0);
  a.engine.stop();
  x.engine.stop();
});

test('写真：様邸で使っている写真を暗号にして送り、ほかの端末で取ってくる（番号のまま。届いたら知らせる）', async () => {
  const remote = new MemRemote();
  const pid = 'ph0123456789abcdef';
  const a = await device(remote, {jobs: {j1: job('j1', '見本 花子', {places: [{id: 'p1', photos: {before: pid}}]})}});
  await a.photos.put(pid, new Blob([new Uint8Array([9, 8, 7, 6])], {type: 'image/jpeg'}), 1600, 1200);
  await a.photos.put('ph_not_used_0000000', new Blob([new Uint8Array([1])]), 1, 1);
  await a.engine.start();
  await settle(a);
  await a.engine.syncNow();
  assert.deepEqual([...remote.photos.keys()], [pid]); // 使っていない写真は送らない
  assert.ok(!same([...remote.photos.get(pid)!.data], [9, 8, 7, 6]));
  const b = await device(remote);
  await b.engine.start();
  await settle(a, b);
  const p = await b.photos.get(pid);
  assert.ok(p);
  assert.deepEqual([...new Uint8Array(await p.blob.arrayBuffer())], [9, 8, 7, 6]);
  assert.deepEqual([p.w, p.h, p.blob.type], [1600, 1200, 'image/jpeg']);
  assert.deepEqual(b.got, [pid]);
  // もう一度同期しても送り直さない
  const before = remote.photos.get(pid);
  await b.engine.syncNow();
  assert.equal(remote.photos.get(pid), before);
  a.engine.stop();
  b.engine.stop();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {afterMirrors, copyBeforeToAfter, pairJob, pairPlace, pairsPhotos} from '../../src/sasaoka/photoPair.ts';
import type {Job, Place} from '../../src/sasaoka/types.ts';

const place = (x: Partial<Place> = {}): Place => ({id: 'p1', name: '玄関', kind: 1, ...x}) as Place;
const job = (insurer: Job['insurer'], places: Place[]): Job => ({insurer, places}) as Job;
const line = {type: 'line', x1: 0, y1: 0, x2: 1, y2: 1} as never;

test('改修前と改修後に同じ写真：北九州市だけ（保険者を選んでいなくても住所から）', () => {
  assert.equal(pairsPhotos(job('kitakyushu', [])), true);
  assert.equal(pairsPhotos({insurer: '', address: '福岡県北九州市小倉北区見本町1-1'} as Job), true);
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki', 'fukuoka'] as const) assert.equal(pairsPhotos(job(insurer, [])), false, insurer);
  assert.equal(pairsPhotos(job('', [])), false);
});

test('改修前に写真を入れると改修後にも同じ写真（向き・大きさも）。書き込み・撮影日は写さない', () => {
  // 空の箇所の改修前に入れた
  assert.deepEqual(pairPlace(place(), place({photos: {before: 'a'}})).photos, {before: 'a', after: 'a'});
  // 改修前を差し替えた：改修後が前の改修前をそのまま写したものなら、改修後も差し替える
  const mirrored = place({photos: {before: 'a', after: 'a'}});
  assert.equal(afterMirrors(mirrored), true);
  assert.deepEqual(pairPlace(mirrored, place({photos: {before: 'b', after: 'a'}})).photos, {before: 'b', after: 'b'});
  // 改修前を回した：改修後も同じ向き
  const turned = pairPlace(mirrored, place({photos: {before: 'a', after: 'a'}, photoEdits: {before: {rot: 90, scale: 1}}}));
  assert.deepEqual(turned.photoEdits, {before: {rot: 90, scale: 1}, after: {rot: 90, scale: 1}});
  // 改修前に書き込み・撮影日：改修後には写さない
  const noted = pairPlace(mirrored, place({photos: {before: 'a', after: 'a'}, photoMarks: {before: [line]}, photoDates: {before: '2026-10-29'}}));
  assert.deepEqual([noted.photos, noted.photoMarks, noted.photoDates], [{before: 'a', after: 'a'}, {before: [line]}, {before: '2026-10-29'}]);
  // 改修前を消した：そのまま写した改修後も消す
  assert.equal(pairPlace(mirrored, place()).photos, undefined);
});

test('改修後に線を書き込んだら、改修前を差し替えても・消しても改修後（イメージ図）はそのまま', () => {
  const drawn = place({photos: {before: 'a', after: 'a'}, photoMarks: {after: [line]}});
  assert.equal(afterMirrors(drawn), false);
  assert.deepEqual(pairPlace(drawn, place({photos: {before: 'b', after: 'a'}, photoMarks: {after: [line]}})).photos, {before: 'b', after: 'a'});
  assert.deepEqual(pairPlace(drawn, place({photos: {after: 'a'}, photoMarks: {after: [line]}})).photos, {after: 'a'});
  // 改修後を別に回した（向きがちがう）のも、もう合わせない
  const own = place({photos: {before: 'a', after: 'a'}, photoEdits: {after: {rot: 90, scale: 1}}});
  assert.deepEqual(pairPlace(own, place({photos: {before: 'b', after: 'a'}, photoEdits: {after: {rot: 90, scale: 1}}})).photos, {before: 'b', after: 'a'});
  // 改修後を消していた箇所で改修前を回しても、改修後は出さない（新しい写真を入れたときだけ）
  const alone = place({photos: {before: 'a'}});
  assert.deepEqual(pairPlace(alone, place({photos: {before: 'a'}, photoEdits: {before: {rot: 90, scale: 1}}})).photos, {before: 'a'});
});

test('改修後に写真を入れたら、改修前が空のときだけ改修前にも（工事のあとの本当の写真で改修前を上書きしない）', () => {
  assert.deepEqual(pairPlace(place(), place({photos: {after: 'c'}})).photos, {before: 'c', after: 'c'});
  assert.deepEqual(pairPlace(place({photos: {before: 'a', after: 'a'}}), place({photos: {before: 'a', after: 'c'}})).photos, {before: 'a', after: 'c'});
  // 改修前と改修後を入れ替えた（両方が変わった）ときはそのまま
  assert.deepEqual(pairPlace(place({photos: {before: 'a', after: 'c'}}), place({photos: {before: 'c', after: 'a'}})).photos, {before: 'c', after: 'a'});
});

test('様邸ごと：北九州市の箇所だけ合わせる・何も変わらなければ同じもの', () => {
  const old = job('kitakyushu', [place(), place({id: 'p2'})]);
  const next = job('kitakyushu', [place({photos: {before: 'a'}}), place({id: 'p2'})]);
  const out = pairJob(old, next);
  assert.deepEqual(out.places[0].photos, {before: 'a', after: 'a'});
  assert.equal(out.places[1], next.places[1]);
  assert.equal(pairJob(old, old), old);
  const kanda = job('kanda', next.places);
  assert.equal(pairJob(job('kanda', old.places), kanda), kanda);
  // 写真のない様邸を直しても（名前など）同じもの
  const renamed = job('kitakyushu', [place({name: '廊下'}), place({id: 'p2'})]);
  assert.equal(pairJob(old, renamed), renamed);
});

test('改修前を複製（北九州市の「改修前を複製」）：改修後を改修前と同じ写真・向きと大きさ・並べ方に。改修後の書き込み・撮影日は外し、改修前の書き込みは写さない', () => {
  const p = place({
    photos: {before: 'a', after: 'c'},
    photoEdits: {before: {rot: 90, scale: 0.8}},
    photoMarks: {before: [line], after: [line]},
    photoDates: {after: '2026-11-05'},
  });
  const out = copyBeforeToAfter(p);
  assert.deepEqual(out.photos, {before: 'a', after: 'a'});
  assert.deepEqual(out.photoEdits, {before: {rot: 90, scale: 0.8}, after: {rot: 90, scale: 0.8}});
  assert.deepEqual(out.photoMarks, {before: [line]});
  assert.equal(out.photoDates, undefined);
  assert.equal(afterMirrors(out), true);
  // 改修前が空なら何もしない
  const empty = place({photos: {after: 'c'}});
  assert.equal(copyBeforeToAfter(empty), empty);
});

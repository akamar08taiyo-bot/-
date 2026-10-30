// 様邸のデータ（携帯で作ったものをパソコンへ送るファイル。jobShare.ts）：様邸・写真（番号のまま）・特定福祉用具の案件が、そのまま戻ること
// （ユーザーの指示「携帯で作成したものを、パソコンに送った場合…そのまま（申請書、見積もりなど全て）、共有したい」2026-10-30）
import assert from 'node:assert/strict';
import test from 'node:test';
import {fromBase64, isJobPackage, jobPackageJson, jobPackageName, jobPackageSummary, parseJobPackage, toBase64} from '../../src/sasaoka/jobShare.ts';
import {cleanJobs} from '../../src/sasaoka/storage.ts';

const [job] = cleanJobs([
  {
    id: 'job-1',
    customer: '見本 六郎',
    month: '2026-10',
    insurer: 'kanda',
    places: [
      {id: 'p1', name: '玄関', kind: 1, photo: 1, photos: ['ph-a'], rows: [{id: 'r1', kind: 'material', name: '見本の手すり', qty: 1, listPrice: 10000}]},
      {id: 'p2', name: '浴室', kind: 1, photo: 2, rows: []},
    ],
    planPhoto: 'ph-plan',
    createdAt: 1,
    updatedAt: 2,
  },
]);

test('ファイルの名前は「〇〇様_様邸データ.json」（お客様名のすき間は詰める）', () => {
  assert.equal(jobPackageName(job), '見本六郎様_様邸データ.json');
  assert.equal(jobPackageName({customer: ''}), 'お客様_様邸データ.json');
});

test('様邸・写真（番号・大きさ・中身）・特定福祉用具の案件が、そのまま戻る', () => {
  const bytes = new Uint8Array(70000).map((_, i) => (i * 7) % 256); // 大きな写真でも（少しずつ base64 にする）
  const sale = {id: 's1', customer: '見本 六郎', jutakuJob: 'job-1', items: [{name: '見本のシャワーチェア'}, {name: '見本の浴槽台'}]};
  const text = jobPackageJson(job, [{id: 'ph-a', w: 1600, h: 1200, type: 'image/jpeg', bytes}], sale, new Date('2026-10-30T07:00:00Z'));
  assert.ok(isJobPackage(text));
  const p = parseJobPackage(text);
  assert.deepEqual(p.job, job);
  assert.equal(p.exportedAt, '2026-10-30T07:00:00.000Z');
  assert.deepEqual(
    p.photos.map((x) => [x.id, x.w, x.h, x.type]),
    [['ph-a', 1600, 1200, 'image/jpeg']],
  );
  assert.deepEqual([...p.photos[0].bytes], [...bytes]);
  assert.deepEqual(p.tokutei, sale);
  assert.deepEqual(jobPackageSummary(p), {places: 2, rows: 1, photos: 1, tokuteiItems: 2});
  // 特定福祉用具の案件がない様邸
  const none = parseJobPackage(jobPackageJson(job, [], null));
  assert.equal(none.tokutei, null);
  assert.equal(jobPackageSummary(none).tokuteiItems, null);
});

test('ほかのファイル（バックアップ・壊れた写真）は読まない', () => {
  assert.ok(!isJobPackage('{"kind":"taiyo-sasaoka-shikiri-backup"}'));
  assert.throws(() => parseJobPackage('{"kind":"taiyo-sasaoka-shikiri-backup","job":{}}'), /様邸のデータのファイルではありません/);
  const p = parseJobPackage(JSON.stringify({kind: 'taiyo-jutaku-job', version: 1, job, photos: [{id: 'x', w: 0, h: 10, data: 'AAAA'}, {id: '', w: 1, h: 1, data: 'AAAA'}, null]}));
  assert.deepEqual(p.photos, []);
  assert.deepEqual([...fromBase64(toBase64(new Uint8Array([0, 1, 254, 255])))], [0, 1, 254, 255]);
});

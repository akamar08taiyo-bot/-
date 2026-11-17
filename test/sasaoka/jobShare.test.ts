// 様邸のデータ（携帯で作ったものをパソコンへ送るファイル。jobShare.ts）：様邸・写真（番号のまま）・特定福祉用具の案件が、そのまま戻ること
// （ユーザーの指示「携帯で作成したものを、パソコンに送った場合…そのまま（申請書、見積もりなど全て）、共有したい」2026-10-30）
import assert from 'node:assert/strict';
import test from 'node:test';
import {fromBase64, isJobPackage, jobPackageExtra, jobPackageJson, jobPackageName, jobPackageSummary, parseJobPackage, toBase64} from '../../src/sasaoka/jobShare.ts';
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

test('送った端末の設定にだけある値：申請書で選んだ「＋ 追加」の施工業者と、特定福祉用具の売上月も一緒に送る（2026-11-17 のコードの読み直し）', () => {
  // 前は送られず、受けた端末では別の営業所・事業者番号で申請書を書き、売上見込み・受注残の月が初めの月に戻っていた
  const added = {name: '見本建設　見本営業所', company: '見本建設', office: '見本営業所', jigyoshoNo: '0000000000', postal: '000-0000', address: '見本町', tel: '000-000-0000', manager: '見本 太郎'};
  const other = {...added, name: '見本工務店　別の営業所'};
  const chosen = {...job, shinsei: {...job.shinsei, builderOffice: '見本建設　見本営業所'}} as typeof job;
  const sale = {id: 's1', customer: '見本 六郎', jutakuJob: 'job-1', items: []};
  const extra = jobPackageExtra(chosen, {builders: [added, other], tokuteiSalesMonths: {s1: '2026-12', s2: '2027-01'}}, sale);
  assert.deepEqual(extra, {builders: [added], tokuteiMonth: {id: 's1', month: '2026-12'}});
  const p = parseJobPackage(jobPackageJson(chosen, [], sale, new Date(), extra));
  assert.deepEqual(p.builders, [added]);
  assert.deepEqual(p.tokuteiMonth, {id: 's1', month: '2026-12'});
  // 選んでいない・一覧の営業所（設定にない）・月を直していないときは入れない
  assert.deepEqual(jobPackageExtra(job, {builders: [added], tokuteiSalesMonths: {}}, sale), {});
  const plain = parseJobPackage(jobPackageJson(job, [], null));
  assert.deepEqual([plain.builders, plain.tokuteiMonth], [undefined, undefined]);
});

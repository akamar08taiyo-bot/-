// 住所から郵便番号（ユーザーの指示「住所のみ入力した場合、逆に郵便番号を自動で入力される」2026-10-28）。住所は架空の番地
import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Job} from '../../src/sasaoka/types.ts';
import {withAddressZip, zipCandidates} from '../../src/sasaoka/zip.ts';

const job = (id: string, address: string, zip = ''): Job => ({id, address, shinsei: zip ? ({zip} as Job['shinsei']) : undefined}) as Job;

test('住所から郵便番号：郡・大字があってもなくても、町域まで分かれば町域の番号', () => {
  assert.deepEqual(zipCandidates('苅田町大字新津1番地1'), [{zip: '800-0344', label: '京都郡苅田町新津'}]);
  assert.deepEqual(zipCandidates('福岡県京都郡苅田町新津1-1'), [{zip: '800-0344', label: '京都郡苅田町新津'}]);
  assert.deepEqual(zipCandidates('行橋市中央1-1'), [{zip: '824-0005', label: '行橋市中央'}]);
  assert.deepEqual(zipCandidates('東京都千代田区1-1'), []); // 福岡県だけ
});

test('withAddressZip：住所が変わって郵便番号が空なら入れる・入っていれば変えない・住所が同じなら何もしない', () => {
  const before = [job('a', ''), job('b', '苅田町新津1', ''), job('c', '', '824-0001')];
  const after = [job('a', '苅田町大字新津1番地1'), job('b', '苅田町新津1', ''), job('c', '行橋市中央1-1', '824-0001')];
  const out = withAddressZip(before, after);
  assert.equal(out[0].shinsei?.zip, '800-0344'); // 住所を入れた
  assert.equal(out[1], after[1]); // 住所は同じ（郵便番号を消したままにできる）
  assert.equal(out[2].shinsei?.zip, '824-0001'); // 郵便番号は入っていた
  // 変わらなければ同じ配列
  assert.equal(withAddressZip(after, after), after);
  // 新しい様邸（前にない）も
  assert.equal(withAddressZip([], [job('d', '行橋市中央2-2')])[0].shinsei?.zip, '824-0005');
});

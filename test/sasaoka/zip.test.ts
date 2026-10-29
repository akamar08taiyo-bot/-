// 住所から郵便番号（ユーザーの指示「住所のみ入力した場合、逆に郵便番号を自動で入力される」2026-10-28）。住所は架空の番地
import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Job} from '../../src/sasaoka/types.ts';
import {addressOfZip, isZipHead, withAddressZip, withoutDoubledHead, withZipAddress, zipCandidates} from '../../src/sasaoka/zip.ts';

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

// 郵便番号から住所（ユーザーの指示「郵便番号を入力したら住所がでる、福岡県行橋市大字流松」2026-10-29。流末と解釈）
test('郵便番号から住所：大字を付けて書く町域は「大字」も・付けない町域はそのまま・ハイフンや全角でも', () => {
  assert.equal(addressOfZip('8240043'), '福岡県行橋市大字流末');
  assert.equal(addressOfZip('824-0043'), '福岡県行橋市大字流末');
  assert.equal(addressOfZip('８２４－００４３'), '福岡県行橋市大字流末');
  assert.equal(addressOfZip('824-0005'), '福岡県行橋市中央'); // 中央は大字なし
  assert.equal(addressOfZip('824-0001'), '福岡県行橋市行事');
  assert.equal(addressOfZip('800-0344'), '福岡県京都郡苅田町大字新津');
  assert.equal(addressOfZip('824-0000'), '福岡県行橋市'); // 以下に掲載がない場合：市町村まで
  assert.equal(addressOfZip('8240'), ''); // 7けたでない
  assert.equal(addressOfZip('100-0001'), ''); // 福岡県だけ
  // 住所から郵便番号に戻しても同じ番号
  assert.deepEqual(zipCandidates(addressOfZip('824-0043') + '1-1').map((h) => h.zip), ['824-0043']);
});

test('withZipAddress：郵便番号が変わって住所が空なら入れる・手で入れた住所は変えない・前の番号の住所のままなら替える', () => {
  const before = [job('a', '', ''), job('b', '行橋市中央1-1', ''), job('c', '', '824-0005'), job('d', '', '824-0043')];
  const after = [job('a', '', '8240043'), job('b', '行橋市中央1-1', '824-0043'), job('c', '', '824-0005'), job('d', '', '824-004')];
  const out = withZipAddress(before, after);
  assert.equal(out[0].address, '福岡県行橋市大字流末'); // 住所が空 → 入れる
  assert.equal(out[1], after[1]); // 手で入れた住所は変えない
  assert.equal(out[2], after[2]); // 郵便番号は同じ（住所を消したままにできる）
  assert.equal(out[3], after[3]); // 7けたでない
  // 打ち間違えて直した：住所が前の番号の住所のままなら、新しい番号の住所に
  const typo = [job('e', '福岡県行橋市中央', '824-0005')];
  assert.equal(withZipAddress(typo, [job('e', '福岡県行橋市中央', '824-0043')])[0].address, '福岡県行橋市大字流末');
  // 1字ずつ打ち直した（前の番号は6けた）：住所が郵便番号から入れたままなら替える
  assert.equal(withZipAddress([job('g', '福岡県行橋市中央', '824004')], [job('g', '福岡県行橋市中央', '8240043')])[0].address, '福岡県行橋市大字流末');
  assert.deepEqual([isZipHead('福岡県行橋市中央'), isZipHead('福岡県行橋市'), isZipHead('福岡県行橋市中央1-1'), isZipHead('行橋市中央'), isZipHead('')], [true, true, false, false, false]);
  // 番地まで足したあとは替えない
  assert.equal(withZipAddress([job('f', '福岡県行橋市中央1-1', '824-0005')], [job('f', '福岡県行橋市中央1-1', '824-0043')])[0].address, '福岡県行橋市中央1-1');
  // 変わらなければ同じ配列
  assert.equal(withZipAddress(after, after), after);
  // 住所から郵便番号（withAddressZip）とつないでも、入れた郵便番号は変わらない
  const both = withAddressZip(before, withZipAddress(before, after));
  assert.equal(both[0].shinsei?.zip, '8240043');
});

test('郵便番号から入れた住所のうしろに、住所を頭から打ち直したら、入れた頭を外す（2回にしない）・番地を足したときはそのまま', () => {
  assert.equal(withoutDoubledHead('福岡県京都郡苅田町福岡県京都郡苅田町富久町2-2', '800-0300'), '福岡県京都郡苅田町富久町2-2');
  assert.equal(withoutDoubledHead('福岡県行橋市大字流末行橋市大字流末1-1', '8240043'), '行橋市大字流末1-1');
  assert.equal(withoutDoubledHead('福岡県京都郡苅田町大字新津苅田町新津1-1', '800-0344'), '苅田町新津1-1'); // 郡を外して打っても
  assert.equal(withoutDoubledHead('福岡県行橋市大字流末1-1', '824-0043'), '福岡県行橋市大字流末1-1'); // 番地を足した
  assert.equal(withoutDoubledHead('福岡県行橋市大字流末', '824-0043'), '福岡県行橋市大字流末');
  assert.equal(withoutDoubledHead('北九州市小倉北区1-1', '824-0043'), '北九州市小倉北区1-1'); // 頭で始まらない
  // 1字ずつ打つと「福岡県」まで打ったところで頭が外れる（withZipAddress。住所が変わったときだけ）
  const was = [job('h', '福岡県行橋市大字流末福岡', '824-0043')];
  const now = [job('h', '福岡県行橋市大字流末福岡県', '824-0043')];
  assert.equal(withZipAddress(was, now)[0].address, '福岡県');
  assert.equal(withZipAddress(now, now), now);
});


// 電話番号のハイフン（tel.ts）：ハイフンなしで打っても、打ち終わると自動で入れる（ユーザーの指示「ハイフンなしで入力してもよい。自動でハイフンをいれる」2026-11-05）
import assert from 'node:assert/strict';
import test from 'node:test';
import {telWithHyphens} from '../../src/sasaoka/tel.ts';

test('電話番号：数字だけで打ち終わると市外局番・市内局番・4けたにハイフン（見本の番号）', () => {
  assert.equal(telWithHyphens('0930000000'), '0930-00-0000'); // 行橋（4けたの局番）
  assert.equal(telWithHyphens('0930123456'), '0930-12-3456');
  assert.equal(telWithHyphens('0934000000'), '093-400-0000'); // 北九州（093 のあとが 0 でない＝3けたの局番）
  assert.equal(telWithHyphens('0920000000'), '0920-00-0000'); // 壱岐
  assert.equal(telWithHyphens('0921230000'), '092-123-0000'); // 福岡
  assert.equal(telWithHyphens('0979000000'), '0979-00-0000'); // 中津・豊前
  assert.equal(telWithHyphens('0975000000'), '097-500-0000'); // 大分
  assert.equal(telWithHyphens('0942000000'), '0942-00-0000'); // 久留米
  assert.equal(telWithHyphens('0948000000'), '0948-00-0000'); // 飯塚
  assert.equal(telWithHyphens('0947000000'), '0947-00-0000'); // 田川
  assert.equal(telWithHyphens('0312345678'), '03-1234-5678');
  assert.equal(telWithHyphens('09000000000'), '090-0000-0000'); // 携帯
  assert.equal(telWithHyphens('08012345678'), '080-1234-5678');
  assert.equal(telWithHyphens('05012345678'), '050-1234-5678');
  assert.equal(telWithHyphens('0120000000'), '0120-000-000');
  assert.equal(telWithHyphens('08001234567'), '0800-123-4567');
  assert.equal(telWithHyphens('０９３０００００００'), '0930-00-0000'); // 全角
});

test('電話番号：打っている途中・ハイフンを打った・一覧にない市外局番は打ったまま', () => {
  assert.equal(telWithHyphens('093400000'), '093400000'); // 9けた（打っている途中）
  assert.equal(telWithHyphens('0900000000'), '0900000000'); // 携帯の10けた（あと1けた）
  assert.equal(telWithHyphens('0930-00-0000'), '0930-00-0000');
  assert.equal(telWithHyphens('093-400-0000'), '093-400-0000');
  assert.equal(telWithHyphens('0930 00 0000'), '0930 00 0000');
  assert.equal(telWithHyphens('0544000000'), '0544000000'); // 九州のほかの地方（4けた・5けたの局番と見分けにくい）
  assert.equal(telWithHyphens(''), '');
  assert.equal(telWithHyphens('内線12'), '内線12');
});

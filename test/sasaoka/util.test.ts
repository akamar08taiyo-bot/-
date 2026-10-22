import assert from 'node:assert/strict';
import test from 'node:test';
import {toKatakana} from '../../src/sasaoka/util.ts';

test('フリガナ：ひらがな・半角カタカナで打っても全角カタカナにする（空白・漢字・英数字はそのまま）', () => {
  assert.equal(toKatakana('やまだ　たろう'), 'ヤマダ　タロウ'); // ユーザーの画面と同じ（全角の空白はそのまま）
  assert.equal(toKatakana('やまだ たろう'), 'ヤマダ タロウ');
  assert.equal(toKatakana('ヤマダ　タロウ'), 'ヤマダ　タロウ');
  assert.equal(toKatakana('ゔぃーなす・ぁぃぅぇぉっゃゅょゎゕゖゝゞ'), 'ヴィーナス・ァィゥェォッャュョヮヵヶヽヾ');
  assert.equal(toKatakana('ﾔﾏﾀﾞ ﾀﾛｳ'), 'ヤマダ タロウ'); // 半角カタカナ（濁点はまとめる）
  assert.equal(toKatakana('ﾊﾟﾝ ｰ'), 'パン ー');
  assert.equal(toKatakana('山田 太郎 ABC 123'), '山田 太郎 ABC 123');
  assert.equal(toKatakana(''), '');
});

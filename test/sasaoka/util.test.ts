import assert from 'node:assert/strict';
import test from 'node:test';
import {matchesAll, toKatakana} from '../../src/sasaoka/util.ts';

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

test('部材の検索：品番の「-」のあるなし・大文字小文字・全角は見ない（ユーザーの指示「型番入力では、-がなくてもリストがでるようにする。例 BD-132 BD132 bd132 bd-132」2026-11-03）', () => {
  const hay = 'ディンプル付 Mオーク 2m BD-132 マツ六';
  for (const q of ['BD-132', 'BD132', 'bd132', 'bd-132', 'ＢＤ１３２', 'ＢＤ－１３２', 'ＢＤー１３２', 'bd13', 'BD-13']) assert.ok(matchesAll(hay, q), q);
  assert.ok(matchesAll('35ブラケット横型 BD01G', 'BD-01G')); // 部材リストの品番に「-」がないときも
  // 名前の中の空白のあるなしも見ない（「SD600-90」で「木製踏台 SD 600-90」。ユーザーの指示「スペースを入れなくても商品検索にひっかかるようにする」2026-11-04）
  const step = '木製踏台 SD 600-90 W600XH90~100XD350mm Mオーク 013-7311 マツ六';
  for (const q of ['SD600-90', 'sd60090', 'SD 600-90', '木製踏台SD', 'ＳＤ６００－９０', 'SD600-90 マツ六']) assert.ok(matchesAll(step, q), q);
  assert.ok(!matchesAll(step, 'SD600-80'));
  assert.ok(matchesAll(hay, 'bd132 マツ六')); // ほかの語と一緒でも
  assert.ok(!matchesAll(hay, 'BD-134'));
  assert.ok(!matchesAll(hay, 'bd1320'));
  assert.ok(matchesAll('スロープ', 'スロープ') && !matchesAll('スロープ', 'スロプ')); // カタカナののばす音はそのまま
});

test('見積書のカタログは マツ六・TOTO・矢崎化工 の順（ユーザーの「マツ六、TOTO 、矢崎です」2026-11-04。前の外のサイトのリンク マツ六・TOTO・介援隊 は外した）', async () => {
  const {BOOKS} = await import('../../src/sasaoka/makerCatalogs.ts');
  assert.deepEqual(BOOKS.map((b) => b.maker), ['マツ六', 'TOTO', '矢崎化工']);
});

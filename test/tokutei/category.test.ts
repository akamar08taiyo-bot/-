import assert from 'node:assert/strict';
import test from 'node:test';
import {categoryLabel, guessCategory} from '../../src/tokutei/category.ts';

const cat = (name: string, hint = '') => {
  const g = guessCategory(name, hint);
  return g.sub ? `${g.category}/${g.sub}` : g.category;
};

test('入浴補助用具の細目', () => {
  assert.equal(cat('安寿 折りたたみシャワーベンチ FSフィット'), '入浴補助用具/入浴用いす');
  assert.equal(cat('シャワーチェア ユクリア ワイド'), '入浴補助用具/入浴用いす');
  assert.equal(cat('アロン化成 安寿 浴槽台 ユクリア'), '入浴補助用具/浴槽内いす');
  assert.equal(cat('バスグリップ'), '入浴補助用具/浴槽用手すり');
  assert.equal(cat('浴槽手すり UST-130'), '入浴補助用具/浴槽用手すり');
  assert.equal(cat('バスボード'), '入浴補助用具/入浴台');
  assert.equal(cat('浴室すのこ'), '入浴補助用具/浴室内すのこ');
  assert.equal(cat('浴槽内すのこ'), '入浴補助用具/浴槽内すのこ');
  assert.equal(cat('入浴用介助ベルト'), '入浴補助用具/入浴用介助ベルト');
});

test('腰掛便座・そのほかの種目', () => {
  assert.equal(cat('安寿 家具調トイレセレクトR はねあげ'), '腰掛便座/移動できる便器（ポータブルトイレ）');
  assert.equal(cat('ソフト補高便座'), '腰掛便座/洋式便器の高さを補うもの');
  assert.equal(cat('簡易浴槽 湯ったりさん'), '簡易浴槽');
  assert.equal(cat('スリングシート'), '移動用リフトのつり具の部分');
  assert.equal(cat('段差解消スロープ'), '固定用スロープ');
  assert.equal(cat('固定型歩行器'), '歩行器');
  assert.equal(cat('4点ステッキS'), '歩行補助つえ/多点杖');
  assert.equal(cat('ロフストランドクラッチ'), '歩行補助つえ/ロフストランド・クラッチ');
});

test('対象外のものは種目にせず、理由を返す', () => {
  assert.equal(guessCategory('T字杖 折りたたみ').category, '');
  assert.match(guessCategory('T字杖 折りたたみ').warn, /1本の杖は対象外/);
  assert.match(guessCategory('四輪歩行器 キャスター付').warn, /歩行車は対象外/);
  assert.match(guessCategory('携帯スロープ').warn, /固定用スロープだけ/);
  assert.match(guessCategory('ポータブルトイレ用バケツ').warn, /消耗品・付属品/);
  assert.equal(guessCategory('車いす').category, '');
});

test('価格表の分類の列を先に使う（細目は商品名からも探す）', () => {
  assert.equal(cat('ユクリア ワイド', '入浴補助用具'), '入浴補助用具');
  assert.equal(cat('シャワーベンチ ユクリア', '入浴補助用具'), '入浴補助用具/入浴用いす');
  assert.equal(cat('ユクリア', 'シャワーチェア'), '入浴補助用具/入浴用いす');
});

test('見積書・申請書に書く名前', () => {
  assert.equal(categoryLabel('入浴補助用具', '入浴用いす'), '入浴補助用具（入浴用いす）');
  assert.equal(categoryLabel('簡易浴槽', ''), '簡易浴槽');
  assert.equal(categoryLabel('', ''), '');
});

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

test('介援隊カタログの名前：シャワーキャリーはシャワーチェア（入浴用いす）、ラップポンなどはポータブルトイレ、マット・クッション・リフトは対象外（2026-11-01）', () => {
  const sub = (name: string) => guessCategory(name).sub;
  for (const n of ['シャワーキャリー LX-II', '座位安定シャワーキャリー', '安楽キャリーAAタイプ', '入浴・シャワー用車いす', 'らくらく浴用キャリー', 'シャワーラク4輪自在V SAL', 'シャトレチェアD', 'くるくるチェア D', 'はいらーくチルト', 'ハイベルSW'])
    assert.equal(sub(n), '入浴用いす', n);
  for (const n of ['ラップポン・プリート2', 'ラップポン・オーブ2 自動ラップ', 'さわやかチェア PT', 'さわやかあさひ', '木製きらく 軽〜いトイレ', 'たため〜るA', 'あらえ〜るIII', '安寿 トワレットチェア', '安寿 家具調スマートトイレ NEO はねあげ', '家具調トイレ<座楽>ベーシック', '安寿 ポータブルトイレ ジャスピタ'])
    assert.equal(sub(n), '移動できる便器（ポータブルトイレ）', n);
  for (const n of ['楽スマ スリーベース', 'カルモトリプル', 'エルビスクワド', 'かるがも 4ポイントステッキ', 'クオッドケイン おしゃれ四点式ロータイプ', 'テトラケインα ミディ'])
    assert.equal(sub(n), '多点杖', n);
  for (const n of ['新・入浴用キャリーベルト', 'テイコブ 楽々入浴用 介助ベルト', 'たすけ帯 V型(入浴用)']) assert.equal(sub(n), '入浴用介助ベルト', n);
  assert.equal(sub('バスベンリーデラックス II'), '入浴台');
  assert.equal(sub('可動式入浴台アクアムーブ'), '入浴台');
  assert.equal(sub('マスカット ポールタイプII'), '浴槽用手すり');
  assert.equal(sub('安寿 サニタリエース OD 両用式'), '和式便器を腰掛式にするもの');
  // 浴槽台の「ソフトクッションタイプ」「すべり止めシートタイプ」は浴槽台のまま（クッション・すべり止めの言葉で対象外にしない）
  assert.equal(sub('安寿 ステンレス製浴槽台R ソフトクッションタイプ'), '浴槽内いす');
  assert.equal(sub('安寿 高さ調節付浴槽台R すべり止めシートタイプ'), '浴槽内いす');
  for (const [n, why] of [
    ['すべり止めマット オーバルリンク', /マット/],
    ['安寿 おく楽ぴったりマット', /マット/],
    ['お風呂ピタットシート', /マット/],
    ['入浴サポートクッションII', /クッション/],
    ['バスリフト', /貸与/],
    ['介護リフトつるべーF2Rセット', /貸与/],
  ] as const) {
    const g = guessCategory(n);
    assert.equal(g.category, '', n);
    assert.match(g.warn, why, n);
  }
  // 消耗品
  assert.equal(guessCategory('バケツA型用 袋止めN').category, '');
});

// 2026-11-08 のデバッグで見つけて直したこと（名前はすべて架空の書き方）
test('多点杖・クラッチの別の呼び名／「キャスターなし」は固定式／分類が歩行器でも歩行車・T字杖は対象外', () => {
  for (const n of ['四脚杖', '多脚杖', '4脚杖', 'クアッドケイン', 'トライポッド杖']) assert.deepEqual(guessCategory(n), {category: '歩行補助つえ', sub: '多点杖', warn: ''}, n);
  assert.equal(guessCategory('エルボークラッチ').sub, 'ロフストランド・クラッチ');
  assert.equal(guessCategory('固定型歩行器 キャスター付属なし').category, '歩行器');
  assert.equal(guessCategory('ブレーキ無し 歩行器').category, '歩行器');
  assert.equal(guessCategory('見本 歩行器 キャスター付き').category, '');
  for (const [n, h] of [
    ['見本 ロレータ（4輪歩行車）', '歩行器・歩行車'],
    ['見本 シルバーカー', '歩行器'],
    ['見本 T字杖 伸縮', '歩行補助つえ'],
    ['見本 松葉杖', '歩行補助つえ'],
  ]) {
    const g = guessCategory(n, h);
    assert.equal(g.category, '', n);
    assert.ok(g.warn, n);
  }
  // 名前から分からなければ分類のとおり（前と同じ）
  assert.equal(guessCategory('見本 エルビス', '歩行補助つえ').category, '歩行補助つえ');
});

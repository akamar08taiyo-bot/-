import assert from 'node:assert/strict';
import test from 'node:test';
import {fitLines, fitName, fitText, textEm, wrapEm} from '../../src/sasaoka/print/fit.ts';
import type {Fit} from '../../src/sasaoka/print/fit.ts';
import {KK, YK, YK_ROW} from '../../src/sasaoka/print/formLayout.ts';

const MM_PER_PT = 25.4 / 72;
/** 欄の中（左右の余白 0.8mm・上下の線）に入っているか。字の幅は textEm（印刷の字体の広い方）で */
function inside(f: Fit, widthMm: number, heightMm: number) {
  for (const l of f.lines) assert.ok(textEm(l) * f.pt * MM_PER_PT <= widthMm - 1.6, `${f.pt}pt「${l}」が欄の幅 ${widthMm}mm をこえる`);
  assert.ok(f.lines.length * f.pt * 1.12 * MM_PER_PT <= heightMm - 0.4, `${f.pt}pt ${f.lines.length}行が欄の高さ ${heightMm}mm をこえる`);
}
/** 折り返しても字は消えない（すき間で分けた所のすき間だけ） */
const sameText = (f: Fit, text: string) => assert.equal(f.lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));

const NOTE = '定価123,456円（税抜）×0.8　メーカーの見積書（2026年10月20日付）の金額で、運賃・梱包費を含む';

test('字の幅：大文字・数字は 0.55 より広く数える（W・M は 0.9 em 以上、数字は 0.63 em）。全角は1、半角カナは 0.5', () => {
  assert.ok(textEm('W') >= 0.9 && textEm('M') >= 0.9);
  assert.equal(textEm('0123456789'), 6.3);
  assert.ok(textEm('CS232B+SH232BA#SC1') > 11); // 前は 9.9 と数えて 1〜2px はみ出していた
  assert.equal(textEm('手すり'), 3);
  assert.equal(textEm('ｱｲｳ'), 1.5);
  assert.ok(textEm('il.') < 1);
});

test('折り返し：すき間（言葉の切れ目）があればそこで、なければ字の途中で。手で入れた改行はそのまま', () => {
  assert.deepEqual(wrapEm('マツ六 BD-132 35アッシュ丸棒', 10), ['マツ六 BD-132', '35アッシュ丸棒']);
  assert.deepEqual(wrapEm('あいうえおかきくけこ', 4), ['あいうえ', 'おかきく', 'けこ']);
  assert.deepEqual(wrapEm('手すり\n2m', 10), ['手すり', '2m']);
  assert.deepEqual(wrapEm('', 5), ['']);
});

test('決まった行（備考）：4.5pt より小さくしないと入らないときは欄の中で折り返して、欄に入るいちばん大きい字（前は 2.5pt でも入らず右で切れた）', () => {
  const w = KK.Q + KK.R; // 広域連合用の算出根拠の欄
  const f = fitLines([NOTE], w, 9.67, 10);
  assert.ok(f.pt >= 4.5 && f.lines.length > 1, JSON.stringify(f));
  inside(f, w, 9.67);
  sameText(f, NOTE);
  // 1行ずつ入る備考は今までどおり（折り返さない）
  const two = ['定価14,400円（4m）×0.8', '2800mm÷4000mm＝0.7'];
  assert.deepEqual(fitLines(two, w, 9.67, 10).lines, two);
  // 2行の備考（長い文と長さの計算）でも、どちらの行も欄に入る
  const g = fitLines([NOTE, '2400mm÷4000mm＝0.6'], YK.M, YK_ROW, 11);
  inside(g, YK.M, YK_ROW);
  assert.equal(g.lines[g.lines.length - 1], '2400mm÷4000mm＝0.6');
});

test('1行の欄の長い文字（改修場所・備考）：4.5pt より小さくなるなら、欄の高さに入るだけ折り返す', () => {
  const place = '①玄関から廊下にかけて（上がり框の横）';
  const f = fitText(place, YK.B, YK_ROW, 11);
  assert.ok(f.pt >= 4.5 && f.lines.length === 2, JSON.stringify(f));
  inside(f, YK.B, YK_ROW);
  sameText(f, place);
  // 入る文字はそのまま1行
  assert.deepEqual(fitText('①玄関', YK.B, YK_ROW, 11), {pt: 11, lines: ['①玄関']});
});

test('品名：言葉の切れ目で分けても小さくなりすぎる長い品名は、欄の幅で折り返した方が大きければそちら。どれも欄に入る', () => {
  for (const name of [
    'TOTO CS232B+SH232BA#SC1 ピュアレストQR 組み合わせ便器（床排水200mm）＋ウォシュレット一体形 オフホワイト 手洗いなし',
    'TOTO EWT24KR68#NW1 インテリア・バーF Lタイプ 600×800mm ホワイト 浴室用（ステンレス芯・樹脂被覆）',
    'マツ六 BD-134 BAUHAUS 35アッシュ丸棒 ディンプル付 Mオーク 4m（屋内用・抗菌仕上げ）',
  ]) {
    for (const [w, h, pt, lines] of [
      [YK.C, YK_ROW, 9, 2],
      [KK.D, 9.67, 9, 3],
      [KK.D, 7.98, 9, 3],
    ]) {
      const f = fitName(name, w, h, pt, lines);
      assert.ok(f.pt >= 4.5, `${name} ${w}mm：${f.pt}pt`);
      inside(f, w, h);
      sameText(f, name);
    }
  }
  // 短い品名・言葉の切れ目で2行に分けられる品名は今までどおり
  assert.deepEqual(fitName('マツ六 BD-132 35アッシュ丸棒 ディンプル付 Mオーク 2m', YK.C, YK_ROW, 9, 2).lines, ['マツ六 BD-132 35アッシュ丸棒', 'ディンプル付 Mオーク 2m']);
  assert.deepEqual(fitName('同上施工費', YK.C, YK_ROW, 9, 2), {pt: 9, lines: ['同上施工費']});
});

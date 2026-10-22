import assert from 'node:assert/strict';
import test from 'node:test';
import {parseStampDate, stampCrops} from '../../src/sasaoka/stampDate.ts';

const TODAY = new Date(2026, 9, 22);

test('写真に写った日付の文字（読んだ結果）から日付を取り出す：年月日・令和・スラッシュ・点・2けたの年、読み違い（O→0・l→1・月が読めない）も', () => {
  const cases: [string, string][] = [
    ['2026 年 9 月 17 日 木曜 日', '2026-09-17'], // ユーザーの写真と同じ形（「2026年9月17日木曜日」）
    ['2026年10月5日', '2026-10-05'],
    ['2026年10月5', '2026-10-05'], // 最後の「日」が読めなかった
    ['令 和 8 年 9 月 17 日', '2026-09-17'],
    ['令和元年5月1日', '2019-05-01'],
    ['2026/09/17 14:23', '2026-09-17'],
    ['2026.9.17', '2026-09-17'],
    ['2026-09-17', '2026-09-17'],
    ["'26.09.17", '2026-09-17'],
    ['26.09.17', '2026-09-17'],
    ['R8.9.17', '2026-09-17'],
    ['2O26/O9/l7', '2026-09-17'],
    ['間 問 2026 年 9_17 10:23', '2026-09-17'], // 「月」「日」が読めなかった
    ['２０２６年９月１７日', '2026-09-17'], // 全角の数字
  ];
  for (const [raw, want] of cases) assert.equal(parseStampDate(raw, TODAY), want, raw);
  // 日付でないもの・ない日・今日より先の日付は取らない
  for (const raw of ['', 'l 5', '2026 年 19 月 5 日', '2026年2月30日', '2026年12月1日', '1999/01/01', '関']) assert.equal(parseStampDate(raw, TODAY), '', raw);
  assert.equal(parseStampDate('2026年10月23日', TODAY), '2026-10-23'); // 明日までは取る（時差・日付の変わり目）
});

/** 写真の見本（RGBA）：暗い木目のような地に、明るい大きなかたまり（壁・タオル）と、白い字の行（小さな四角の並び）を置く */
function photo(w: number, h: number, draw: (box: (x: number, y: number, bw: number, bh: number, rgb: [number, number, number]) => void) => void): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([110 + (i % 7) * 3, 80, 50, 255], i * 4);
  draw((x, y, bw, bh, rgb) => {
    for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) px.set([...rgb, 255], (yy * w + xx) * 4);
  });
  return px;
}

test('日付の字の行を切り出す：明るい壁などの大きなかたまりは消し、白い字の並んだ行だけを白黒で（下の帯から。だいだいの字・上の帯も）', () => {
  const W = 600;
  const H = 800;
  const px = photo(W, H, (box) => {
    box(20, 680, 160, 120, [235, 235, 230]); // 下の帯の明るい壁（字より大きい）
    for (let i = 0; i < 10; i++) box(330 + i * 24, 750, 14, 20, [255, 255, 255]); // 右下の日付（字の高さ 20）
  });
  const crops = stampCrops(px, W, H);
  assert.ok(crops.length >= 1);
  const c = crops[0];
  // 字の行だけ（左右 330〜560・上下 750〜770 に余白）。壁は入らない
  assert.ok(c.w < 300 && c.w > 230 && c.h < 40 && c.h >= 20, `${c.w}×${c.h}`);
  const black = c.g.reduce((n, v) => n + (v === 0 ? 1 : 0), 0);
  assert.equal(black, 10 * 14 * 20);
  // だいだいの字（昔のカメラの日付）・上の帯の字
  const orange = photo(W, H, (box) => {
    for (let i = 0; i < 8; i++) box(40 + i * 22, 30, 12, 18, [255, 150, 30]);
  });
  const oc = stampCrops(orange, W, H);
  assert.equal(oc.length, 1);
  assert.equal(oc[0].g.reduce((n, v) => n + (v === 0 ? 1 : 0), 0), 8 * 12 * 18);
  // 日付のない写真は何も切り出さない
  assert.deepEqual(stampCrops(photo(W, H, () => undefined), W, H), []);
});

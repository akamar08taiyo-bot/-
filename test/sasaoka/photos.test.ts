import assert from 'node:assert/strict';
import test from 'node:test';
import {brightLut, exifDate} from '../../src/sasaoka/photos.ts';

/** Exif の入った JPEG の先頭（撮影日時 DateTimeOriginal を Exif の IFD に、tag0132 の日時を最初の IFD に） */
function jpeg({original = '', dateTime = '', big = false}: {original?: string; dateTime?: string; big?: boolean}): DataView {
  const tiff: number[] = [];
  const u16 = (n: number) => (big ? [n >> 8, n & 255] : [n & 255, n >> 8]);
  const u32 = (n: number) => (big ? [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255] : [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  // 最初の IFD（8 から）：Exif の IFD の場所と、tag0132（日時）
  const top = [[0x8769, 4, 1, 0], ...(dateTime ? [[0x0132, 2, 20, 0]] : [])];
  const topSize = 2 + top.length * 12 + 4;
  const sub = [...(original ? [[0x9003, 2, 20, 0]] : [])];
  const subAt = 8 + topSize;
  const subSize = 2 + sub.length * 12 + 4;
  let dataAt = subAt + subSize;
  const data: number[] = [];
  const place = (s: string) => {
    const at = dataAt + data.length;
    data.push(...ascii(s));
    return at;
  };
  top[0][3] = subAt;
  if (dateTime) top[1][3] = place(dateTime);
  if (original) sub[0][3] = place(original);
  tiff.push(...(big ? [0x4d, 0x4d] : [0x49, 0x49]), ...u16(42), ...u32(8));
  tiff.push(...u16(top.length), ...top.flatMap(([tag, type, count, value]) => [...u16(tag), ...u16(type), ...u32(count), ...u32(value)]), ...u32(0));
  tiff.push(...u16(sub.length), ...sub.flatMap(([tag, type, count, value]) => [...u16(tag), ...u16(type), ...u32(count), ...u32(value)]), ...u32(0));
  tiff.push(...data);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9];
  return new DataView(new Uint8Array(bytes).buffer);
}

test('写真の撮影日：JPEG の Exif の撮影日時（DateTimeOriginal、なければ DateTime）を読む。なければ空', () => {
  assert.equal(exifDate(jpeg({original: '2026:10:05 09:30:00'})), '2026-10-05');
  assert.equal(exifDate(jpeg({original: '2026:10:05 09:30:00', big: true})), '2026-10-05'); // ビッグエンディアン（MM）
  assert.equal(exifDate(jpeg({original: '2026:10:05 09:30:00', dateTime: '2026:10:20 12:00:00'})), '2026-10-05'); // 撮影日時が先
  assert.equal(exifDate(jpeg({dateTime: '2026:10:20 12:00:00'})), '2026-10-20');
  assert.equal(exifDate(jpeg({original: '0000:00:00 00:00:00'})), ''); // 入っていない日時
  assert.equal(exifDate(jpeg({})), '');
  assert.equal(exifDate(new DataView(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)), ''); // PNG など
  assert.equal(exifDate(new DataView(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 40]).buffer)), ''); // 途中で切れたファイル
});

test('暗い写真だけ明るくする表（ユーザーの指示「画像は少し暗いので、適宜明るさの調整をおこない、エクセルにおとす」2026-10-22）', () => {
  const px = (r: number, g: number, b: number, n = 64) => Array.from({length: n}, () => [r, g, b, 255]).flat();
  // 明るい写真（平均 200）・平均が 145 に近い写真は直さない
  assert.equal(brightLut(px(200, 200, 200)), null);
  assert.equal(brightLut(px(143, 143, 143)), null);
  // 少し暗い写真（平均 113）：真っ白・真っ黒はそのまま、中ほどを持ち上げる（113 → 145 ほど）
  const lut = brightLut([...px(20, 20, 20, 32), ...px(206, 206, 206, 32)])!;
  assert.ok(lut, '直す');
  assert.deepEqual([lut[0], lut[255]], [0, 255]);
  assert.ok(lut[113] >= 140 && lut[113] <= 150, String(lut[113]));
  assert.ok(lut.every((v, i) => i === 0 || v >= lut[i - 1]), '明るさの順番は変えない');
  // とても暗い写真も、明るくしすぎない（ガンマ 1.8 まで）
  const dark = brightLut(px(10, 10, 10))!;
  assert.equal(dark[10], Math.round(255 * (10 / 255) ** (1 / 1.8)));
});

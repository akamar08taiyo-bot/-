// 介護保険証の読み取り：読んだ文字（tesseract.js の行と語の位置）から項目を取り出す（hokensho.ts）・画像の下ごしらえ（cardImage.ts）。
// 値はすべて架空（見本）。本物の保険証の値はテストに入れない
import assert from 'node:assert/strict';
import test from 'node:test';
import {despeckle, inkAdaptive, otsu, removeLines, rotateGray, scaleGray, textIsVertical, valueRect, verticalLines} from '../../src/sasaoka/cardImage.ts';
import type {Gray} from '../../src/sasaoka/cardImage.ts';
import {findLabels, missedStroke} from '../../src/sasaoka/cardRead.ts';
import {cardScore, fixOcr, insurerOfName, locateValues, parseCard, plausibleTerm, warekiIso} from '../../src/sasaoka/hokensho.ts';
import type {OcrLine, OcrPage} from '../../src/sasaoka/hokensho.ts';

/**
 * 読んだ行を作る：行ごとに欄（[x, 文字]）。語は空白で分け、字の幅 W・行の高さ H。y は行の番号 × 2H（tops で変えられる）
 */
const H = 24;
const W = 24;
function page(rows: [number, string][][], tops?: number[], conf = 90): OcrPage {
  const lines: OcrLine[] = rows.map((cells, i) => {
    const y0 = tops?.[i] ?? i * H * 2;
    const words = cells.flatMap(([x, text]) => {
      let at = x;
      return text.split(' ').filter(Boolean).map((t) => {
        const w = {text: t, x0: at, x1: at + t.length * W, y0, y1: y0 + H, conf};
        at = w.x1 + W * 0.5;
        return w;
      });
    });
    return {words};
  });
  return {lines};
}

// 架空の被保険者証（3つの面を横に並べて読んだ形：1行にほかの面の欄も入る）
const CARD = page([
  [[100, '介護保険被保険者証'], [900, '要介護状態区分等 要介護 3']],
  [[40, '番号 0000123456'], [900, '認定年月日 令和 6 年 3 月 1 日'], [1700, '居宅介護支援事業者 見本ケアプランセンター']],
  [[40, '住所 〒 824-0001'], [900, '認定の有効期間 令和 6 年 4 月 1 日 ～ 令和 9 年 3 月 31 日'], [1700, '届出年月日 令和 6 年 4 月 1 日']],
  [[150, '行橋市中央一丁目 1 番 1 号']],
  [[40, 'フリガナ ミホン ハナコ'], [900, '区分支給限度基準額 令和 6 年 4 月 1 日 ～ 令和 9 年 3 月 31 日']],
  [[40, '氏名 見本 花子']],
  [[40, '生年月日 昭和 13 年 4 月 14 日'], [560, '女']],
  [[40, '交付年月日 令和 6 年 3 月 1 日']],
  [[40, '保険者番号 4 0 9 9 9 9']],
  [[150, '行 橋 市']],
]);

test('保険証：きれいに読めたとき、全部の項目', () => {
  const r = parseCard([CARD]);
  assert.deepEqual(r.info, {
    insuredNo: '0000123456',
    insurerNo: '409999',
    insurer: 'yukuhashi',
    insurerName: '行橋市',
    kana: 'ミホン　ハナコ',
    name: '見本　花子',
    zip: '824-0001',
    address: '行橋市中央一丁目1番1号',
    era: '昭和',
    birthY: '13',
    birthM: '4',
    birthD: '14',
    gender: '女',
    care: '要介護3',
    careFrom: '2024-04-01',
    careTo: '2027-03-31',
    office: '見本ケアプランセンター',
    burden: '',
    burdenFrom: '',
    burdenTo: '',
  });
  assert.deepEqual(r.kinds, ['card']);
  // 事業所の名前は読み違いが多いので、確かめてもらう
  assert.ok(r.unsure.includes('office'));
  assert.ok(!r.unsure.includes('insuredNo') && !r.unsure.includes('careFrom') && !r.unsure.includes('care'));
});

test('保険証：よくある読み違いを直す（令和→念和・信和、昭和→照和・哲和、O→0、~ が読めない、番号の間の空白、ラベルの字の読み違い）', () => {
  const r = parseCard([
    page([
      [[40, '番号 0000 12345 6']],
      [[40, '〒 824-0001 行橋市中央 1 - 1']],
      [[40, '岳名 見本 花子']],
      [[40, '生年月日 照和 13 年 4 月 14 日 女']],
      [[40, '要介護状態区分等 要支援 2']],
      [[40, '認定の海効期間 念和 6 年 4 月 1 日 信和 9 年 3 月 31 日']],
    ]),
  ]);
  assert.equal(r.info.insuredNo, '0000123456');
  assert.equal(r.info.zip, '824-0001');
  assert.equal(r.info.address, '行橋市中央1-1');
  assert.equal(r.info.name, '見本　花子');
  assert.deepEqual([r.info.era, r.info.birthY, r.info.birthM, r.info.birthD, r.info.gender], ['昭和', '13', '4', '14', '女']);
  assert.equal(r.info.care, '要支援2');
  assert.deepEqual([r.info.careFrom, r.info.careTo], ['2024-04-01', '2027-03-31']);
  assert.equal(fixOcr('哲和13年'), '昭和13年');
  assert.equal(fixOcr('2O24'), '2024');
  assert.equal(fixOcr('] 割'), '1 割');
  assert.equal(fixOcr('ﾐﾎﾝ'), 'ミホン'); // 半角カナは全角に
});

test('保険証：ラベルが読めなくても、値の欄の位置から（生年月日の行から上へ：氏名・フリガナ・住所・番号）', () => {
  // 値の欄の左（x=200）がそろっている。ラベルの字は読めずに、ごみになった
  const p = page([
    [[60, '吉'], [200, '0000123456']],
    [[200, '〒 824-0001']],
    [[200, '行橋市中央一丁目 1 番 1 号']],
    [[60, '保'], [200, 'ミホン ハナコ']],
    [[60, '険'], [200, '見本 花子']],
    [[60, '者'], [200, '昭和 13 年 4 月 14 日'], [700, '女']],
  ]);
  const loc = locateValues(p);
  assert.ok(loc);
  assert.equal(loc.values.name?.text, '見本 花子');
  assert.equal(loc.values.kana?.text, 'ミホン ハナコ');
  assert.equal(loc.values.number?.text, '0000123456');
  assert.equal(loc.values.gender?.text, '女');
  const r = parseCard([p]);
  assert.equal(r.info.name, '見本　花子');
  assert.equal(r.info.kana, 'ミホン　ハナコ');
  assert.equal(r.info.insuredNo, '0000123456');
  assert.equal(r.info.address, '行橋市中央一丁目1番1号');
  assert.equal(r.info.gender, '女');
  // 位置から取った氏名・フリガナは、確かめてもらう
  assert.ok(r.unsure.includes('name') && r.unsure.includes('kana'));
});

test('保険証：何回か読んだ値は、形に合って多く読めた値。古い保険証もあれば、有効期間の新しい方と、その要介護度', () => {
  const read = (no: string, name: string, conf: number) => page([[[40, `番号 ${no}`]], [[40, `氏名 ${name}`]], [[40, '生年月日 昭和 13 年 4 月 14 日 女']]], undefined, conf);
  // 3回のうち2回が同じ
  const r = parseCard([read('0000123456', '見本 花子', 60), read('0000128456', '見木 花子', 95), read('0000123456', '見本 花子', 70)]);
  assert.equal(r.info.insuredNo, '0000123456');
  assert.equal(r.info.name, '見本　花子');
  // 2つの保険証（期間がちがう）：新しい方の期間と要介護度
  const old = page([[[40, '要介護状態区分等 要介護 1']], [[40, '認定の有効期間 令和 3 年 4 月 1 日 ～ 令和 4 年 3 月 31 日']]]);
  const now = page([[[40, '要介護状態区分等 要支援 2']], [[40, '認定の有効期間 令和 4 年 4 月 1 日 ～ 令和 7 年 3 月 31 日']]]);
  const r2 = parseCard([old, now]);
  assert.deepEqual([r2.info.careFrom, r2.info.careTo, r2.info.care], ['2022-04-01', '2025-03-31', '要支援2']);
  // 新しい方の要介護度が読めないときは、古い方の値をたしかでないことにする
  const nowNoCare = page([[[40, '認定の有効期間 令和 4 年 4 月 1 日 ～ 令和 7 年 3 月 31 日']]]);
  const r3 = parseCard([old, nowNoCare]);
  assert.equal(r3.info.careTo, '2025-03-31');
  assert.ok(r3.unsure.includes('care'));
});

test('負担割合証：利用者負担の割合（1割・2割・3割。「] 割」は 1割）と適用期間', () => {
  const futan = (v: string) =>
    page([
      [[40, '介護保険負担割合証']],
      [[40, '番号 0000123456']],
      [[40, '利用者負担の割合'], [400, '適用期間']],
      [[60, v], [400, '開始年月日 令和 6 年 8 月 1 日']],
      [[400, '終了年月日 令和 7 年 7 月 31 日']],
    ]);
  for (const [v, want] of [['1 割', '1'], ['２割', '2'], ['3割', '3'], ['] 割', '1']] as const) {
    const r = parseCard([futan(v)]);
    assert.equal(r.info.burden, want, v);
    assert.deepEqual(r.kinds, ['futan']);
  }
  const r = parseCard([futan('1割')]);
  assert.deepEqual([r.info.burdenFrom, r.info.burdenTo], ['2024-08-01', '2025-07-31']);
  // 負担割合証の期間は、認定の有効期間に入れない
  assert.equal(r.info.careFrom, '');
  // 保険証と負担割合証をいっしょに
  const both = parseCard([CARD, futan('2割')]);
  assert.equal(both.info.burden, '2');
  assert.equal(both.info.care, '要介護3');
  assert.deepEqual(both.kinds, ['card', 'futan']);
});

test('保険者：名称から（広域連合の市町は広域連合）。和暦・有効期間のたしかめ', () => {
  assert.deepEqual(insurerOfName('苅 田 町'), {insurer: 'kanda', name: '苅田町'});
  assert.deepEqual(insurerOfName('み や こ 町'), {insurer: 'miyako', name: 'みやこ町'});
  assert.deepEqual(insurerOfName('福岡県介護保険広域連合'), {insurer: 'kouiki', name: '福岡県介護保険広域連合'});
  assert.deepEqual(insurerOfName('築上町'), {insurer: 'kouiki', name: '福岡県介護保険広域連合'});
  assert.deepEqual(insurerOfName('北九州市'), {insurer: '', name: ''});
  assert.equal(warekiIso('令和', '6', '2', '30'), '');
  assert.equal(warekiIso('平成', '元', '1', '8'), '1989-01-08');
  assert.equal(warekiIso('昭和', '13', '4', '14'), '1938-04-14');
  assert.ok(plausibleTerm('2024-04-01', '2027-03-31'));
  assert.ok(!plausibleTerm('2024-04-01', '2027-03-30')); // おわりは月の末日
  assert.ok(!plausibleTerm('2024-04-01', '2030-03-31')); // 4年より長い
  assert.ok(!plausibleTerm('2027-04-01', '2024-03-31'));
  assert.ok(cardScore('介護保険被保険者証 番号 氏名 生年月日') >= 4);
  assert.equal(cardScore('ご 請 求 書'), 0);
});

test('保険証：何も読めないとき・ラベルの位置', () => {
  const r = parseCard([page([[[40, 'あいう']]])]);
  assert.ok(Object.values(r.info).every((v) => v === ''));
  assert.deepEqual(r.kinds, []);
  const L = findLabels(CARD);
  assert.ok(L.number && L.kana && L.name && L.birth && L.care && L.term && L.insurer);
  // 「保険者番号」の「番号」を被保険者番号のラベルにしない
  assert.notEqual(L.number?.y0, L.insurer?.y0);
});

// ---------------------------------------------------------------- 画像

/** 白い画像に黒い四角を描く */
function canvas(w: number, h: number, rects: [number, number, number, number][], bg = 255): Gray {
  const g = new Uint8Array(w * h).fill(bg);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * w + x] = 0;
  return {g, w, h};
}
const ink = (img: Gray) => Uint8Array.from(img.g, (v) => (v < 128 ? 1 : 0));

test('画像：回す・縮める・しきい値・ざらつきを消す', () => {
  const img = canvas(4, 2, [[0, 0, 1, 1]]); // 左上が黒
  assert.equal(rotateGray(img, 90).g[0 * 2 + 1], 0); // 右に回すと右上
  assert.deepEqual([rotateGray(img, 90).w, rotateGray(img, 90).h], [2, 4]);
  assert.equal(rotateGray(img, 180).g[1 * 4 + 3], 0);
  assert.equal(rotateGray(rotateGray(img, 90), 270).g.join(), img.g.join());
  assert.deepEqual([scaleGray(canvas(100, 50, []), 0.5).w, scaleGray(canvas(100, 50, []), 2).h], [50, 100]);
  const t = otsu(canvas(10, 10, [[0, 0, 5, 10]]));
  assert.ok(t >= 0 && t < 255);
  // 1つだけの点は消え、つながった点は残る
  const sp = canvas(20, 20, [[2, 2, 3, 3], [10, 10, 13, 13]]);
  const d = despeckle(ink(sp), 20, 20);
  assert.equal(d.g[2 * 20 + 2], 255);
  assert.equal(d.g[11 * 20 + 11], 0);
});

test('画像：表の罫線を消す（字は残す）・縦の罫線・値のます', () => {
  // 横の線（y=10）・縦の線（x=50, x=150）と、字のかわりの小さな四角
  const img = canvas(200, 60, [[0, 10, 200, 11], [50, 0, 51, 60], [150, 0, 151, 60], [70, 25, 80, 40], [20, 25, 30, 40]]);
  const clean = removeLines(img, ink(img));
  assert.equal(clean.g[10 * 200 + 100], 255); // 横の線は消えた
  assert.equal(clean.g[30 * 200 + 50], 255); // 縦の線も
  assert.equal(clean.g[30 * 200 + 75], 0); // 字は残る
  assert.deepEqual(verticalLines(ink(img), 200, 60, 20, 50), [50, 150]);
  // ラベル（x 20〜30）の右の値のます：縦の線 50 から 150 まで
  const r = valueRect(ink(img), 200, 60, {x0: 20, y0: 25, x1: 30, y1: 40}, {y0: 20, y1: 45});
  assert.deepEqual([r.x0, r.x1], [52, 148]);
});

test('画像：字の行が横か縦か（向きのあたり）・影のある写真の白黒', () => {
  // 横書きのまね：横に並んだ字（四角）の行が3つ
  const rects: [number, number, number, number][] = [];
  for (let row = 0; row < 3; row++) for (let c = 0; c < 12; c++) rects.push([10 + c * 20, 10 + row * 40, 24 + c * 20, 30 + row * 40]);
  const horiz = canvas(260, 130, rects);
  assert.equal(textIsVertical(ink(horiz), horiz.w, horiz.h), false);
  const vert = rotateGray(horiz, 90);
  assert.equal(textIsVertical(ink(vert), vert.w, vert.h), true);
  // 左が暗い（影）写真：地の明るさが 255→120 と変わっても、字（地より 50% 暗い）だけが黒
  const w = 200;
  const h = 60;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = Math.round(120 + (135 * x) / w);
  for (let y = 20; y < 40; y++) for (const x0 of [20, 160]) for (let x = x0; x < x0 + 10; x++) g[y * w + x] = Math.round(g[y * w + x] * 0.5);
  const m = inkAdaptive({g, w, h});
  assert.equal(m[30 * w + 25], 1);
  assert.equal(m[30 * w + 165], 1);
  assert.equal(m[30 * w + 100], 0); // 暗い地は字にしない
  assert.equal(m[5 * w + 10], 0);
});

test('読めなかった字がありそう：字と字の間の縦の画（細い「1」）。あれば、同じ値が形どおりに読めても確かめてもらう', () => {
  // 「和」(x 0〜20) と「3」(x 40〜52) の間に、縦の画（x 28〜30、高さ 18）
  const w = 60;
  const h = 24;
  const ink = new Uint8Array(w * h);
  for (let y = 2; y < 20; y++) for (let x = 28; x < 30; x++) ink[y * w + x] = 1;
  const line = (gapInk: boolean) => [{words: [{text: '和', x0: 0, x1: 20, y0: 0, y1: 22}, {text: '3', x0: 40, x1: 52, y0: 0, y1: 22}], doubt: false}].map((l) => ({...l, words: gapInk ? l.words : l.words}));
  assert.equal(missedStroke(ink, w, h, line(true)), true);
  assert.equal(missedStroke(new Uint8Array(w * h), w, h, line(true)), false);
  // 読めた2回のうち1回に、読めなかった字がありそう → たしかでない
  const read = (doubt: boolean) => ({lines: [{words: [{text: '生年月日', x0: 0, x1: 96, y0: 0, y1: 24}, {text: '昭和', x0: 200, x1: 248, y0: 0, y1: 24}, {text: '3', x0: 270, x1: 282, y0: 0, y1: 24}, {text: '年', x0: 290, x1: 314, y0: 0, y1: 24}, {text: '4', x0: 320, x1: 332, y0: 0, y1: 24}, {text: '月', x0: 340, x1: 364, y0: 0, y1: 24}, {text: '14', x0: 370, x1: 394, y0: 0, y1: 24}, {text: '日', x0: 400, x1: 424, y0: 0, y1: 24}], doubt}]});
  const r = parseCard([read(true), read(false)]);
  assert.equal(r.info.birthY, '3');
  assert.ok(r.unsure.includes('birthY'));
  assert.ok(!parseCard([read(false)]).unsure.includes('birthY'));
});

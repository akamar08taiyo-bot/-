// 介護保険証の読み取り：読んだ文字（tesseract.js の行と語の位置）から項目を取り出す（hokensho.ts）・画像の下ごしらえ（cardImage.ts）。
// 値はすべて架空（見本）。本物の保険証の値はテストに入れない
import assert from 'node:assert/strict';
import test from 'node:test';
import {despeckle, inkAdaptive, otsu, removeLines, rotateGray, scaleGray, textIsVertical, valueRect, verticalLines} from '../../src/sasaoka/cardImage.ts';
import type {Gray} from '../../src/sasaoka/cardImage.ts';
import {findLabels, missedStroke} from '../../src/sasaoka/cardRead.ts';
import {cardScore, fixOcr, insurerOfName, latestOffice, locateValues, officeEntries, parseCard, plausibleBirth, plausibleTerm, warekiIso} from '../../src/sasaoka/hokensho.ts';
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

test('居宅介護支援事業者：何件か届け出ていれば、届出年月日がいちばん新しい名前（上・下どちらでも。ほかの面・施設の日付は見ない）', () => {
  // （三）の面：名前の下に届出年月日。1行に（一）（二）の面の欄も入る。下は介護保険施設の欄（入所の日付）
  const card = (boxes: [string, string][]) =>
    page([
      [[40, '番号 0000123456'], [900, '要介護状態区分等 要介護 3'], [1700, '給付制限 内容']],
      [[40, '住所 〒 824-0001'], [900, '認定年月日 令和 8 年 5 月 1 日'], [1700, '開始年月日 令和 8 年 6 月 1 日']],
      ...boxes.flatMap(([name, date], i): [number, string][][] => [
        [[40, i === 0 ? '氏名 見本 花子' : '生年月日 昭和 13 年 4 月 14 日 女'], ...(i === 0 ? ([[1700, '居宅介護支援事業者']] as [number, string][]) : []), [2100, name]],
        [[900, i === 0 ? '認定の有効期間 令和 6 年 4 月 1 日 ～ 令和 9 年 3 月 31 日' : '区分支給限度基準額'], [2100, `届出年月日 ${date}`]],
      ]),
      [[1700, '介護保険施設等'], [2100, '種類 名称 見本苑']],
      [[2100, '入所等年月日 令和 9 年 1 月 1 日']],
    ]);
  const oldFirst = card([
    ['見本居宅介護支援事業所', '令和 7 年 3 月 1 日'],
    ['見本ケアプランセンター', '令和 8 年 4 月 1 日'],
  ]);
  assert.deepEqual(
    officeEntries(oldFirst).map((e) => [e.name, e.date]),
    [
      ['見本居宅介護支援事業所', '2025-03-01'],
      ['見本ケアプランセンター', '2026-04-01'],
    ],
  );
  assert.equal(parseCard([oldFirst]).info.office, '見本ケアプランセンター');
  const newFirst = card([
    ['見本ケアプランセンター', '令和 8 年 4 月 1 日'],
    ['見本居宅介護支援事業所', '令和 7 年 3 月 1 日'],
  ]);
  assert.equal(parseCard([newFirst]).info.office, '見本ケアプランセンター');
  // 1件だけ（今までどおり）
  assert.equal(parseCard([card([['見本ケアプランセンター', '令和 8 年 4 月 1 日']])]).info.office, '見本ケアプランセンター');
  // 名前と届出年月日が同じ欄に読めたとき
  const oneLine = page([
    [[1700, '居宅介護支援事業者'], [2100, '見本居宅介護支援事業所 届出年月日 令和 7 年 3 月 1 日']],
    [[2100, '見本ケアプランセンター 届出年月日 令和 8 年 4 月 1 日']],
  ]);
  assert.equal(parseCard([oneLine]).info.office, '見本ケアプランセンター');
  // 届出年月日が読めなければ、いちばん下（ますは上から順に書かれる）
  assert.equal(latestOffice(officeEntries(card([['見本居宅介護支援事業所', ''], ['見本ケアプランセンター', '']])))?.name, '見本ケアプランセンター');
  // ラベルの列の字（読み違えた切れはし）が名前の前に付いて1つの欄に読めたとき：名前の列（届出年月日の字の左）から右だけ
  const merged = page([
    [[1800, '見本居宅介護支援事業所']],
    [[1642, '居宅 介護支'], [1800, '届出年月日 令和 5 年 3 月 1 日']],
    [[1642, '信人生時壮'], [1800, '見本ケアプラ ンセンター']],
    [[1643, '手事攻選出年月日令和 6 年 4 月 1 日']],
    [[1799, '届出年月日']],
  ]);
  assert.deepEqual(
    officeEntries(merged).map((e) => [e.name, e.date, e.x0]),
    [
      ['見本居宅介護支援事業所', '2023-03-01', 1800],
      ['見本ケアプランセンター', '2024-04-01', 1800],
    ],
  );
  // 届出年月日の字が欠けて読めなかったときも、その欄の所は覚えておく（cardRead.ts がその欄だけ読み直す）
  const lost = officeEntries(card([
    ['見本居宅介護支援事業所', '令和 7 年 3 月 1 日'],
    ['見本ケアプランセンター', '令和 8 年 4 月日'],
  ]));
  assert.deepEqual(
    lost.map((e) => [e.name, e.date, !!e.dateBox]),
    [
      ['見本居宅介護支援事業所', '2025-03-01', true],
      ['見本ケアプランセンター', '', true],
    ],
  );
  // 切り出して読んだページ（届出年月日なし）に古い名前があっても、全体を読んだページで古いと分かれば選ばない
  const crop = page([[[1700, '居宅介護支援事業者'], [2100, '見本居宅介護支援事業所']]], undefined, 99);
  const r = parseCard([crop, crop, oldFirst]);
  assert.equal(r.info.office, '見本ケアプランセンター');
  assert.ok(r.unsure.includes('office'));
});

test('保険証：ラベルの字が2つの欄に分かれて読めても（「住」「所」・「氏」「名」の間があいた）止まらない', () => {
  const r = parseCard([
    page([
      [[40, '番号 0000123456']],
      [[40, '住'], [200, '所 〒 824-0001 行橋市中央一丁目 1 番 1 号']],
      [[40, 'フ リ'], [200, 'ガナ ミホン ハナコ']],
      [[40, '氏'], [200, '名 見本 花子']],
      [[40, '生年月日 昭和 13 年 4 月 14 日 女']],
    ]),
  ]);
  assert.equal(r.info.insuredNo, '0000123456');
  assert.equal(r.info.address, '行橋市中央一丁目1番1号');
  assert.equal(r.info.kana, 'ミホン　ハナコ');
  assert.equal(r.info.name, '見本　花子');
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

// ---------------------------------------------------------------- 見直しで見つかった読み違い（2026-10-23）

test('読み違いを直す：元号は日付の中（うしろに「6 年」）だけ。氏名・事業所の名前の「合 和」「信和」は令和にしない', () => {
  const card = (name: string) => page([[[40, '番号 0000123456']], [[40, `氏名 ${name}`]], [[40, '生年月日 照和 13 年 4 月 14 日 女']]]);
  for (const n of ['河合 和子', '落合 利夫', '今 和子', '見本 信和']) {
    const r = parseCard([card(n), card(n)]);
    assert.equal(r.info.name, n.replace(' ', '　'));
    assert.equal(r.info.era, '昭和'); // 日付の「照和 13 年」は直す
  }
  assert.equal(fixOcr('医療法人信和会 信和居宅介護支援事業所'), '医療法人信和会 信和居宅介護支援事業所');
  assert.equal(fixOcr('信和 6 年 4 月 1 日'), '令和 6 年 4 月 1 日');
  assert.equal(fixOcr('今和元年5月1日'), '令和元年5月1日');
  assert.equal(fixOcr('令 和 6 年'), '令和 6 年');
  assert.equal(fixOcr('念和 1O 年'), '令和 10 年'); // 数字を直してから元号
});

test('氏名：「被保険者」のラベルの字は1字だけ離れているときだけ除く（「保坂」「保田」の「保」は名前）', () => {
  const card = (name: string) => page([[[40, '番号 0000123456']], [[40, `氏名 ${name}`]]]);
  assert.equal(parseCard([card('保坂 花子')]).info.name, '保坂　花子');
  assert.equal(parseCard([card('保田 一郎')]).info.name, '保田　一郎');
  assert.equal(parseCard([card('保 険 見本 花子')]).info.name, '見本　花子');
});

test('郵便番号：数字の間の「ｰ」「ー」「一」は区切り（全角半角をそろえたあとで直す）', () => {
  for (const z of ['824ｰ0001', '824ー0001', '824一0001', '824 ー 0001']) {
    const r = parseCard([page([[[40, '番号 0000123456']], [[40, `住所 〒 ${z} 行橋市中央一丁目 1 番 1 号`]], [[40, '氏名 見本 花子']]])]);
    assert.equal(r.info.zip, '824-0001', z);
    assert.equal(r.info.address, '行橋市中央一丁目1番1号', z);
  }
  // 住所の漢数字（「中央一丁目」）は変えない
  assert.equal(fixOcr('中央一丁目1ー2'), '中央一丁目1-2');
});

test('和暦：元号の期間にない日付は読み違い（昭和73年・昭和64年1月8日・平成元年1月7日・令和元年4月1日・令和0年）', () => {
  for (const [e, y, m, d] of [['昭和', '73', '4', '14'], ['昭和', '64', '1', '8'], ['平成', '元', '1', '7'], ['令和', '元', '4', '1'], ['平成', '35', '3', '31'], ['大正', '20', '1', '1'], ['令和', '0', '4', '1']])
    assert.equal(warekiIso(e, y, m, d), '', `${e}${y}年${m}月${d}日`);
  assert.equal(warekiIso('昭和', '64', '1', '7'), '1989-01-07');
  assert.equal(warekiIso('平成', '元', '1', '8'), '1989-01-08');
  assert.equal(warekiIso('平成', '31', '4', '30'), '2019-04-30');
  assert.equal(warekiIso('令和', '元', '5', '1'), '2019-05-01');
  assert.equal(warekiIso('大正', '15', '12', '24'), '1926-12-24');
  assert.equal(warekiIso('昭和', '元', '12', '25'), '1926-12-25');
  const r = parseCard([page([[[40, '氏名 見本 花子']], [[40, '生年月日 昭和 73 年 4 月 14 日 女']]])]);
  assert.deepEqual([r.info.era, r.info.birthY], ['', '']);
  const t = parseCard([page([[[40, '認定の有効期間 平成 33 年 4 月 1 日 ～ 平成 36 年 3 月 31 日']]])]);
  assert.deepEqual([t.info.careFrom, t.info.careTo], ['', '']);
});

test('A4 に被保険者証と負担割合証を並べたスキャン：両方として読む（認定の有効期間も負担の割合も）', () => {
  const rows: [number, string][][] = [
    [[100, '介護保険被保険者証'], [900, '要介護状態区分等 要介護 3'], [2400, '介護保険負担割合証']],
    [[40, '番号 0000123456'], [900, '認定年月日 令和 6 年 3 月 1 日'], [2400, '番号 0000123456']],
    [[40, '住所 〒 824-0001'], [900, '認定の有効期間 令和 6 年 4 月 1 日 ～ 令和 9 年 3 月 31 日'], [2400, '利用者負担の割合'], [2800, '適用期間']],
    [[150, '行橋市中央一丁目 1 番 1 号'], [2400, '1 割'], [2800, '開始年月日 令和 8 年 8 月 1 日']],
    [[40, 'フリガナ ミホン ハナコ'], [900, '区分支給限度基準額 令和 6 年 4 月 1 日 ～ 令和 9 年 3 月 31 日'], [2800, '終了年月日 令和 9 年 7 月 31 日']],
    [[40, '氏名 見本 花子']],
    [[40, '生年月日 昭和 13 年 4 月 14 日'], [560, '女']],
  ];
  const r = parseCard([page(rows), page(rows)], '2026-10-23');
  assert.deepEqual(r.kinds, ['card', 'futan']);
  assert.deepEqual([r.info.care, r.info.careFrom, r.info.careTo], ['要介護3', '2024-04-01', '2027-03-31']);
  assert.deepEqual([r.info.burden, r.info.burdenFrom, r.info.burdenTo], ['1', '2026-08-01', '2027-07-31']);
  // 負担割合証だけの画像の、切り出して読んだページ（適用期間の行に「認定の有効期間」のラベルが付くことがある）は、有効期間にしない
  const crop = page([[[40, '利用者負担の割合 1 割']], [[40, '認定の有効期間 令和 8 年 8 月 1 日 ～ 令和 9 年 7 月 31 日']]]);
  const f = parseCard([crop]);
  assert.deepEqual(f.kinds, ['futan']);
  assert.deepEqual([f.info.careFrom, f.info.careTo, f.info.burden], ['', '', '1']);
});

test('生年月日：ラベルの行か、年齢としてありうる日付（古い保険証の認定年月日「平成30年」を生年月日にしない）', () => {
  assert.equal(plausibleBirth('昭和', '13', '2026-10-23'), true);
  assert.equal(plausibleBirth('昭和', '62', '2026-10-23'), true); // 今年で39歳
  assert.equal(plausibleBirth('平成', '元', '2026-10-23'), false);
  assert.equal(plausibleBirth('平成', '30', '2026-10-23'), false);
  assert.equal(plausibleBirth('明治', '30', '2026-10-23'), false); // 129歳
  // 古い保険証：（二）の面の日付（平成）が（一）の面の上の行と同じ行に読めた
  const old = page([
    [[100, '介護保険被保険者証'], [900, '要介護状態区分等 要介護 3']],
    [[40, '番号 0000123456'], [900, '認定年月日 平成 30 年 3 月 1 日']],
    [[40, '住所 〒 824-0001'], [900, '認定の有効期間 平成 30 年 4 月 1 日 ～ 令和 3 年 3 月 31 日']],
    [[150, '行橋市中央一丁目 1 番 1 号']],
    [[40, 'フリガナ ミホン ハナコ']],
    [[40, '氏名 見本 花子']],
    [[40, '生年月日 昭和 13 年 4 月 14 日'], [560, '女']],
  ]);
  assert.equal(locateValues(old, '2026-10-23')?.values.birth?.text, '昭和 13 年 4 月 14 日');
  // （一）と（二）の面が別の行に読めて、（二）の面の行が上にあるとき
  const sep = page(
    [[[40, '番号 0000123456']], [[40, '住所 〒 824-0001']], [[40, 'フリガナ ミホン ハナコ']], [[40, '氏名 見本 花子']], [[40, '生年月日 昭和 13 年 4 月 14 日'], [560, '女']], [[900, '認定年月日 平成 30 年 3 月 1 日']]],
    [48, 96, 144, 192, 240, 40],
  );
  assert.equal(locateValues(sep, '2026-10-23')?.values.birth?.text, '昭和 13 年 4 月 14 日');
  // 切り出して読んだ行に、まちがえて認定年月日が入っても（ラベルは生年月日）、たしかでない値として、全体を読んだ方の生年月日
  const crop = page([[[40, '生年月日'], [400, '平成 30 年 3 月 1 日']]], undefined, 95);
  const r = parseCard([crop, old], '2026-10-23');
  assert.deepEqual([r.info.era, r.info.birthY, r.info.birthM, r.info.birthD], ['昭和', '13', '4', '14']);
  assert.ok(!r.unsure.includes('birthY'));
  // ラベルが読めないとき：年齢としてありうる日付の行
  const noLabel = parseCard([page([[[900, '認定年月日 平成 30 年 3 月 1 日']], [[40, '昭和 13 年 4 月 14 日 女']]])], '2026-10-23');
  assert.deepEqual([noLabel.info.era, noLabel.info.birthY, noLabel.info.gender], ['昭和', '13', '女']);
  // ラベルの行でも、年齢としてありえない日付は、たしかでない
  const young = parseCard([page([[[40, '生年月日 平成 13 年 4 月 14 日 女']]])], '2026-10-23');
  assert.equal(young.info.era, '平成');
  assert.ok(young.unsure.includes('era') && young.unsure.includes('birthY'));
});

test('住所：2行目から（建物名・部屋番号）も、次の項目のラベルの前まで読む', () => {
  const p = page([
    [[40, '番号 0000123456']],
    [[40, '住所 〒 824-0001'], [900, '認定の有効期間 令和 6 年 4 月 1 日 ～ 令和 9 年 3 月 31 日']],
    [[150, '行橋市中央一丁目 1 番 1 号']],
    [[150, '見本ハイツ 101 号']],
    [[40, 'フリガナ ミホン ハナコ']],
    [[40, '氏名 見本 花子']],
    [[40, '生年月日 昭和 13 年 4 月 14 日 女']],
  ]);
  const r = parseCard([p, p]);
  assert.equal(r.info.address, '行橋市中央一丁目1番1号　見本ハイツ101号');
  assert.equal(r.info.kana, 'ミホン　ハナコ');
  // 〒と同じ行に1行目
  const q = page([[[40, '住所 〒 824-0001 行橋市中央一丁目 1 番 1 号']], [[150, '見本ハイツ 101 号']], [[40, '氏名 見本 花子']]]);
  assert.equal(parseCard([q]).info.address, '行橋市中央一丁目1番1号　見本ハイツ101号');
  // ラベルの読めなかったフリガナ・氏名の行（番号がない）は住所にしない
  const k = page([[[40, '住所 〒 824-0001']], [[150, '行橋市中央一丁目 1 番 1 号']], [[150, 'ミホン ハナコ']], [[150, '見本 花子']]]);
  assert.equal(parseCard([k]).info.address, '行橋市中央一丁目1番1号');
});

test('要介護度：選んだ有効期間の保険証のページの読みのうち、多く読めた値（切り出して読んだ1回で決めない。読みがちがえば、たしかでない）', () => {
  const read = (care: string, term = true, source?: number) => ({
    ...page([[[40, `要介護状態区分等 ${care}`]], ...(term ? [[[40, '認定の有効期間 令和 6 年 4 月 1 日 ～ 令和 9 年 3 月 31 日']] as [number, string][]] : [])]),
    source,
  });
  let r = parseCard([read('要介護 3'), read('要介護 2'), read('要介護 2')]);
  assert.equal(r.info.care, '要介護2');
  assert.ok(!r.unsure.includes('care'));
  r = parseCard([read('要介護 3'), read('要介護 2')]);
  assert.ok(r.unsure.includes('care'));
  // 1枚の画像：切り出して読んだページ（期間なし）と全体のページで要介護度がちがう → たしかでない
  r = parseCard([read('要介護 3', false, 0), read('要介護 2', true, 0)]);
  assert.ok(r.unsure.includes('care'));
  // 古い保険証（1枚目）と新しい保険証（2枚目）：新しい方の画像のページ（期間の読めなかったページも）だけ
  const old = {...page([[[40, '要介護状態区分等 要介護 1']], [[40, '認定の有効期間 令和 3 年 4 月 1 日 ～ 令和 6 年 3 月 31 日']]]), source: 0};
  r = parseCard([old, old, read('要支援 2', false, 1), read('要支援 2', true, 1)]);
  assert.deepEqual([r.info.careTo, r.info.care], ['2027-03-31', '要支援2']);
  assert.ok(!r.unsure.includes('care'));
});

test('有効期間：同じ保険証の何回かの読みは多い方（1回の読み違いの「おわり」を新しい保険証にしない）。ちがう保険証どうしは新しい方', () => {
  const read = (to: string, care = '要介護 2', source?: number, from = '令和 6 年 4 月 1 日') => ({...page([[[40, `要介護状態区分等 ${care}`]], [[40, `認定の有効期間 ${from} ～ ${to}`]]]), source});
  let r = parseCard([read('令和 9 年 3 月 31 日'), read('令和 9 年 3 月 31 日'), read('令和 9 年 8 月 31 日', '要介護 3')]);
  assert.deepEqual([r.info.careFrom, r.info.careTo, r.info.care], ['2024-04-01', '2027-03-31', '要介護2']);
  assert.ok(!r.unsure.includes('careTo') && !r.unsure.includes('care'));
  // 2回の読みが1回ずつ → たしかでない
  r = parseCard([read('令和 9 年 3 月 31 日'), read('令和 9 年 8 月 31 日')]);
  assert.ok(r.unsure.includes('careFrom') && r.unsure.includes('careTo'));
  // 同じ画像なら、はじめの日がちがって読めても同じ保険証（新しい方を選ばない）
  r = parseCard([read('令和 9 年 3 月 31 日', '要介護 2', 0), read('令和 9 年 3 月 31 日', '要介護 2', 0), read('令和 9 年 8 月 31 日', '要介護 2', 0, '令和 6 年 9 月 1 日')]);
  assert.equal(r.info.careTo, '2027-03-31');
  // ちがう画像の古い保険証（読めた回数が多くても）と新しい保険証 → 新しい方
  const old = read('令和 6 年 3 月 31 日', '要介護 1', 0, '令和 3 年 4 月 1 日');
  r = parseCard([old, old, old, read('令和 9 年 3 月 31 日', '要支援 1', 1)]);
  assert.deepEqual([r.info.careFrom, r.info.careTo, r.info.care], ['2024-04-01', '2027-03-31', '要支援1']);
});

test('負担割合証：割合と適用期間は組。今日をふくむ期間（なければ一番新しい期間）の割合', () => {
  const futan = (rows: [number, string][][], source?: number) => ({...page([[[40, '介護保険負担割合証']], [[40, '番号 0000123456']], [[40, '利用者負担の割合'], [400, '適用期間']], ...rows]), source});
  // 年度の途中で割合が変わった（2つ目のますも書かれている）
  const two = futan([
    [[60, '2 割'], [400, '開始年月日 令和 7 年 8 月 1 日']],
    [[400, '終了年月日 令和 7 年 12 月 31 日']],
    [[60, '1 割'], [400, '開始年月日 令和 8 年 1 月 1 日']],
    [[400, '終了年月日 令和 8 年 7 月 31 日']],
  ]);
  let r = parseCard([two, two], '2026-10-23');
  assert.deepEqual([r.info.burden, r.info.burdenFrom, r.info.burdenTo], ['1', '2026-01-01', '2026-07-31']);
  r = parseCard([two, two], '2025-10-01');
  assert.deepEqual([r.info.burden, r.info.burdenFrom, r.info.burdenTo], ['2', '2025-08-01', '2025-12-31']);
  // 去年の負担割合証を3回、今年のを2回読んだ → 今年の（今日をふくむ）
  const year = (v: string, y: number) => futan([[[60, v], [400, `開始年月日 令和 ${y} 年 8 月 1 日`]], [[400, `終了年月日 令和 ${y + 1} 年 7 月 31 日`]]]);
  const last = year('2 割', 7);
  const now = year('1 割', 8);
  r = parseCard([last, last, last, now, now], '2026-10-23');
  assert.deepEqual([r.info.burden, r.info.burdenFrom, r.info.burdenTo], ['1', '2026-08-01', '2027-07-31']);
  assert.ok(!r.unsure.includes('burden'));
  // 画像ごと：切り出して読んだページ（期間なし）の割合は、同じ画像の期間のもの
  const crop = (v: string, source: number) => ({...page([[[40, `利用者負担の割合 ${v}`]]]), source});
  r = parseCard([crop('2 割', 0), {...last, source: 0}, crop('1 割', 1), {...now, source: 1}], '2026-10-23');
  assert.deepEqual([r.info.burden, r.info.burdenTo], ['1', '2027-07-31']);
  // 切り出して読んだページに、ちがう割合がいくつも（2つのますを読んだ）→ そのページの割合は使わない
  const both = {...page([[[40, '利用者負担の割合 2 割']], [[40, '利用者負担の割合 1 割']]]), source: 0};
  r = parseCard([both, {...two, source: 0}], '2026-10-23');
  assert.equal(r.info.burden, '1');
  assert.ok(!r.unsure.includes('burden'));
});

test('番号は画像ごとに数える：被保険者証とちがう番号の負担割合証（ほかの方）は、氏名などに使わず、負担の割合はたしかでない', () => {
  const card = (source?: number) => ({...page([[[100, '介護保険被保険者証']], [[40, '番号 0000123456']], [[40, '氏名 見本 花子']], [[40, '要介護状態区分等 要介護 2']]]), source});
  const futan = (no: string, name: string, v: string, source?: number) => ({
    ...page([[[40, '介護保険負担割合証']], [[40, `番号 ${no}`]], [[40, `氏名 ${name}`]], [[40, '利用者負担の割合'], [400, '適用期間']], [[60, v], [400, '開始年月日 令和 8 年 8 月 1 日']], [[400, '終了年月日 令和 9 年 7 月 31 日']]]),
    source,
  });
  // 1枚の画像から2〜3ページ（切り出して読んだページ・全体を読んだページ）
  let r = parseCard([card(0), card(0), futan('0000999999', '見本 太郎', '3 割', 1), futan('0000999999', '見本 太郎', '3 割', 1), futan('0000999999', '見本 太郎', '3 割', 1)], '2026-10-23');
  assert.deepEqual([r.info.insuredNo, r.info.name, r.info.burden], ['0000123456', '見本　花子', '3']);
  assert.ok(r.unsure.includes('insuredNo') && r.unsure.includes('burden'));
  assert.ok(!r.unsure.includes('name'));
  // その方の負担割合証もあれば、そちらの割合（ほかの方の分は使わない）
  r = parseCard([card(0), card(0), futan('0000999999', '見本 太郎', '3 割', 1), futan('0000999999', '見本 太郎', '3 割', 1), futan('0000123456', '見本 花子', '1 割', 2), futan('0000123456', '見本 花子', '1 割', 2)], '2026-10-23');
  assert.equal(r.info.burden, '1');
  assert.ok(!r.unsure.includes('burden'));
  // 画像の分からないページ（テスト）はページごとに数える
  r = parseCard([card(), futan('0000999999', '見本 太郎', '3 割')], '2026-10-23');
  assert.ok(r.unsure.includes('insuredNo') && r.unsure.includes('burden'));
  // 同じ方の被保険者証と負担割合証は、たしか
  r = parseCard([card(0), card(0), futan('0000123456', '見本 花子', '1 割', 1), futan('0000123456', '見本 花子', '1 割', 1)], '2026-10-23');
  assert.ok(!r.unsure.includes('insuredNo') && !r.unsure.includes('burden'));
});

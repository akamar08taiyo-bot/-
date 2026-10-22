import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {applyJutaku, JUTAKU_KEY, readJutaku} from '../../src/tokutei/jutaku.ts';
import {cleanSales} from '../../src/tokutei/storage.ts';

// 住宅改修のアプリの様邸の画面の「🛁 特定福祉用具申請書」のタブから開いたとき（ユーザーの指示「特定福祉用具アプリを出す」、2026-10-22）

const fields = {
  customer: '山田 花子',
  kana: 'ヤマダ　ハナコ',
  insuredNo: '0000366989',
  birthDate: '1948-05-06',
  gender: '女',
  zip: '824-0001',
  address: '福岡県行橋市中央1-1',
  tel: '0930-00-0000',
  careLevel: '要介護２',
  insurer: 'yukuhashi',
  burdenRatio: 2,
  careOffice: '行橋ケアプランセンター',
  careManager: '佐藤 一郎',
};

test('住宅改修からの受け渡し：開いた様邸のものだけ読む。案件に入れられない値は捨てる（要介護の全角の数字はそろえる）', () => {
  assert.equal(JUTAKU_KEY, 'taiyo-tokutei-from-jutaku-v1');
  const raw = JSON.stringify({job: 'j1', fields: {...fields, careLevel: '要介護２', insurer: 'yukuhashi'}});
  assert.deepEqual(readJutaku(raw, 'j1')?.fields, {...fields, careLevel: '要介護2'});
  assert.equal(readJutaku(raw, 'j2'), null); // ほかの様邸
  assert.equal(readJutaku('{', 'j1'), null);
  assert.equal(readJutaku(null, 'j1'), null);
  const odd = readJutaku(JSON.stringify({job: 'j1', fields: {customer: 1, careLevel: '要介護9', insurer: 'other', burdenRatio: 4, birthDate: 'S23.5.6', gender: 'X'}}), 'j1');
  assert.deepEqual(odd?.fields, {});
});

test('その様邸の案件を開く：なければ作る（保険者・お客様の情報入り）。2回目は同じ案件', () => {
  const settings = defaultSettings();
  const h = readJutaku(JSON.stringify({job: 'j1', fields}), 'j1')!;
  const first = applyJutaku([], settings, h, 1000);
  assert.equal(first.sales.length, 1);
  const sale = first.sales[0];
  assert.equal(sale.id, first.id);
  assert.deepEqual([sale.customer, sale.insurer, sale.careLevel, sale.burdenRatio, sale.careManager, sale.jutakuJob], ['山田 花子', 'yukuhashi', '要介護2', 2, '佐藤 一郎', 'j1']);
  assert.ok(sale.quoteNo); // 見積番号・見積日などは新しい案件と同じ
  const again = applyJutaku(first.sales, settings, h, 2000);
  assert.equal(again.id, first.id);
  assert.equal(again.sales, first.sales); // 変わらなければそのまま（保存し直さない）
});

test('住宅改修で変わった値だけ入れ直す。特定福祉用具で手で直した値はそのまま', () => {
  const settings = defaultSettings();
  const h1 = readJutaku(JSON.stringify({job: 'j1', fields}), 'j1')!;
  const {sales, id} = applyJutaku([], settings, h1, 1000);
  // 特定福祉用具で電話番号を直した
  const edited = sales.map((s) => (s.id === id ? {...s, tel: '090-1111-2222'} : s));
  // 住宅改修で住所と電話番号を直した
  const h2 = readJutaku(JSON.stringify({job: 'j1', fields: {...fields, address: '福岡県行橋市大橋1-1', tel: '0930-99-9999'}}), 'j1')!;
  const r = applyJutaku(edited, settings, h2, 3000);
  const s = r.sales.find((x) => x.id === id)!;
  assert.equal(s.address, '福岡県行橋市大橋1-1'); // 住宅改修で変わった
  assert.equal(s.tel, '090-1111-2222'); // ここで直した値を優先
  assert.equal(s.updatedAt, 3000);
  assert.equal(s.jutakuSync?.address, '福岡県行橋市大橋1-1');
  // 別の様邸は別の案件
  const other = applyJutaku(r.sales, settings, {job: 'j2', fields: {customer: '鈴木 次郎'}}, 4000);
  assert.equal(other.sales.length, 2);
  assert.notEqual(other.id, id);
  // 保険者が変わったら個別切り上げも合わせる（みやこ町はオン）
  assert.equal(s.perItem, false);
  const h3 = readJutaku(JSON.stringify({job: 'j1', fields: {...fields, address: '福岡県行橋市大橋1-1', tel: '0930-99-9999', insurer: 'miyako'}}), 'j1')!;
  const m = applyJutaku(r.sales, settings, h3, 5000).sales.find((x) => x.id === id)!;
  assert.deepEqual([m.insurer, m.perItem], ['miyako', true]);
});

test('初めの値のままの項目（負担割合1割・保険者）は、あとで住宅改修で入れた値が入る。ここで選び直した値はそのまま', () => {
  const settings = defaultSettings();
  const {customer, kana} = fields;
  // 住宅改修で負担割合・保険者がまだ分からないときに開いた
  const first = applyJutaku([], settings, {job: 'j1', fields: {customer, kana}}, 1000);
  const made = first.sales[0];
  assert.equal(made.burdenRatio, 1);
  // 住宅改修で負担割合（2割）と保険者（みやこ町）を入れてから、また開いた
  const later = applyJutaku(first.sales, settings, {job: 'j1', fields: {customer, kana, burdenRatio: 2, insurer: 'miyako'}}, 2000);
  const s = later.sales[0];
  assert.deepEqual([s.burdenRatio, s.insurer, s.perItem], [2, 'miyako', true]);
  // ここで負担割合を3割に選び直したら、住宅改修の値（2割）で戻さない
  const edited = later.sales.map((x) => ({...x, burdenRatio: 3 as const}));
  const again = applyJutaku(edited, settings, {job: 'j1', fields: {customer, kana, burdenRatio: 2, insurer: 'miyako'}}, 3000);
  assert.equal(again.sales[0].burdenRatio, 3);
  assert.equal(again.sales, edited); // 変わらなければそのまま
});

test('保存してある案件の jutakuJob・jutakuSync は読み込みで残す', () => {
  const settings = defaultSettings();
  const {sales} = applyJutaku([], settings, readJutaku(JSON.stringify({job: 'j1', fields}), 'j1')!, 1000);
  const back = cleanSales(JSON.parse(JSON.stringify(sales)));
  assert.equal(back[0].jutakuJob, 'j1');
  assert.equal(back[0].jutakuSync?.customer, '山田 花子');
  assert.equal(cleanSales([{id: 's1', customer: 'A'}])[0].jutakuJob, undefined); // 住宅改修から開いていない案件
});

test('住宅改修の理由書の「利用者の身体状況」「介護状況」を受け取る（理由の欄の文例のボタンに使う。住宅改修で直すたびに入れ直す）', () => {
  const settings = defaultSettings();
  const bodyState = '脳梗塞の後遺症で右片麻痺があり、立ち座りや歩行が不安定。';
  const careState = '日中は独居。入浴は長女が週2回介助している。';
  const h = readJutaku(JSON.stringify({job: 'j1', fields: {...fields, bodyState, careState}}), 'j1')!;
  assert.deepEqual([h.fields.bodyState, h.fields.careState], [bodyState, careState]);
  const {sales, id} = applyJutaku([], settings, h, 1000);
  assert.deepEqual([sales[0].bodyState, sales[0].careState], [bodyState, careState]);
  // 住宅改修で身体状況を直した → 入れ直す。介護状況を消した → 消す
  const h2 = readJutaku(JSON.stringify({job: 'j1', fields: {...fields, bodyState: '右片麻痺。浴槽のまたぎが困難。', careState: ''}}), 'j1')!;
  const s = applyJutaku(sales, settings, h2, 2000).sales.find((x) => x.id === id)!;
  assert.deepEqual([s.bodyState, s.careState], ['右片麻痺。浴槽のまたぎが困難。', '']);
  // 文字でないものは捨てる。保存してある値は読み込みで残す
  assert.deepEqual(readJutaku(JSON.stringify({job: 'j1', fields: {bodyState: 1, careState: null}}), 'j1')?.fields, {});
  const back = cleanSales(JSON.parse(JSON.stringify([s])))[0];
  assert.deepEqual([back.bodyState, back.careState], ['右片麻痺。浴槽のまたぎが困難。', undefined]);
  // 前の版の受け渡し（2つがない）で開いても、受け取った値は消さない
  const old = applyJutaku([s], settings, readJutaku(JSON.stringify({job: 'j1', fields}), 'j1')!, 3000).sales[0];
  assert.equal(old.bodyState, '右片麻痺。浴槽のまたぎが困難。');
});

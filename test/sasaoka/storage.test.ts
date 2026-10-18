import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_STAFF, OFFICES, settingsForOffice} from '../../src/sasaoka/defaults.ts';
import {cleanJobs, cleanKits, cleanList, cleanSettings} from '../../src/sasaoka/storage.ts';

test('営業所を選ぶと所長名も入る', () => {
  const s = settingsForOffice(cleanSettings(undefined), '行橋営業所');
  assert.equal(s.manager, '久保 匠史');
  assert.equal(s.tel, '0930-26-9640');
  assert.equal(settingsForOffice(s, '小倉営業所').manager, '森口 賢一');
  assert.ok(OFFICES.every((o) => o.manager), '所長名のない営業所がある');
});

test('所長名を入れる前に保存した設定は、保存してある営業所の所長名になる', () => {
  assert.equal(cleanSettings({officeName: '小倉営業所'}).manager, '森口 賢一');
  assert.equal(cleanSettings({officeName: '（一覧にない営業所）'}).manager, '');
  // 自分で消した・書き換えた所長名はそのまま
  assert.equal(cleanSettings({officeName: '行橋営業所', manager: ''}).manager, '');
  assert.equal(cleanSettings({officeName: '行橋営業所', manager: '久保匠史'}).manager, '久保匠史');
});

test('担当者の候補：最初は 久保・土居・宮村・信田・藤田、保存したものは空・重複を除いて使う', () => {
  assert.deepEqual(DEFAULT_STAFF, ['久保', '土居', '宮村', '信田', '藤田']);
  assert.deepEqual(cleanSettings({}).staffList, DEFAULT_STAFF);
  assert.deepEqual(cleanSettings({staffList: [' 久保 ', '', '土居', '久保', 3]}).staffList, ['久保', '土居', '3']);
  assert.deepEqual(cleanSettings({staffList: []}).staffList, []);
  assert.deepEqual(cleanList(['玄関', '玄関', ' ', 'トイレ']), ['玄関', 'トイレ']);
});

test('様邸の担当：前のバックアップ（担当なし）も読める', () => {
  const [a, b] = cleanJobs([{customer: '山田', staff: '土居'}, {customer: '佐藤'}]);
  assert.equal(a.staff, '土居');
  assert.equal(b.staff, '');
});

test('請求書の消費税：前の版の設定（様邸ごと）は「すべての様邸の合計に最後にかける」に直す', () => {
  assert.equal(cleanSettings({invoiceTaxMode: 'perJob'}).invoiceTaxMode, 'monthly');
  assert.equal(cleanSettings({}).totalTaxRounding, 'floor');
  // 新しい版で保存した設定は、選んだまま
  assert.equal(cleanSettings({invoiceTaxMode: 'perJob', rev: 2}).invoiceTaxMode, 'perJob');
  assert.equal(cleanSettings({rev: 1}).rev, 2);
});

test('見積の設定：最初は定価×0.8', () => {
  const s = cleanSettings({});
  assert.equal(s.estimateRate, 0.8);
  assert.equal(s.estimateWork, '手すり取付工事');
  assert.equal(cleanSettings({estimateRate: '0.75'}).estimateRate, 0.75);
});

test('前のデータの行・部材にも、定価・長さ・見積の単価が入る', () => {
  const [j] = cleanJobs([{customer: '山田', places: [{name: '玄関', rows: [{kind: 'material', name: '手すり', price: 3000, qty: 1}]}]}]);
  const r = j.places[0].rows[0];
  assert.deepEqual([r.listPrice, r.lengthCm, r.estPrice, r.unit], [0, 0, null, '']);
  assert.equal(j.work, '');
  const [r2] = cleanJobs([{places: [{rows: [{kind: 'material', estPrice: '9600', lengthCm: -5}]}]}])[0].places[0].rows;
  assert.deepEqual([r2.estPrice, r2.lengthCm], [9600, 0]);
  assert.deepEqual(cleanKits([{name: '一式', rows: [{kind: 'labor', name: '木', price: 1000, qty: 2}]}, 'x']).map((k) => [k.name, k.rows.length]), [['一式', 1]]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_LABOR, DEFAULT_STAFF, LABOR_REV, OFFICES, settingsForOffice} from '../../src/sasaoka/defaults.ts';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {cleanJobs, cleanKits, cleanLabor, cleanList, cleanMaterials, cleanSettings} from '../../src/sasaoka/storage.ts';
import {staffFull, staffShort, tesuri} from '../../src/sasaoka/util.ts';

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

test('担当者の候補：最初は5人のフルネーム、保存したものは空・重複を除いて使う', () => {
  assert.deepEqual(DEFAULT_STAFF, ['久保 匠史', '土居 翔太', '宮村 茉莉花', '信田 裕太', '藤田 知美']);
  assert.deepEqual(cleanSettings({}).staffList, DEFAULT_STAFF);
  assert.deepEqual(cleanSettings({staffList: [' 久保 ', '', '土居', '久保', 3], rev: 4}).staffList, ['久保', '土居', '3']);
  assert.deepEqual(cleanSettings({staffList: []}).staffList, []);
  // 版4より前に保存した名字だけの候補はフルネームに（見積書に出す）。候補に足した人はそのまま
  assert.deepEqual(cleanSettings({staffList: ['久保', '土居', '宮村', '信田', '藤田', '山本'], rev: 2}).staffList, [...DEFAULT_STAFF, '山本']);
  // 版3（久保・土居だけフルネームにした版）で保存した候補も、残りの3人をフルネームに
  assert.deepEqual(cleanSettings({staffList: ['久保 匠史', '土居 翔太', '宮村', '信田', '藤田'], rev: 3}).staffList, DEFAULT_STAFF);
  // 見積書はフルネーム、請求書・一覧は名字
  assert.equal(staffFull('土居', DEFAULT_STAFF), '土居 翔太'); // 名字だけで入っている前の様邸
  assert.equal(staffFull('土居 翔太', DEFAULT_STAFF), '土居 翔太');
  assert.equal(staffFull('宮村', DEFAULT_STAFF), '宮村 茉莉花');
  assert.equal(staffFull('山本', DEFAULT_STAFF), '山本'); // 候補にない人はそのまま
  assert.equal(staffShort('土居 翔太'), '土居');
  assert.equal(staffShort('土居　翔太'), '土居');
  assert.equal(staffShort(''), '');
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
  assert.equal(cleanSettings({rev: 1}).rev, 4);
});

test('見積の設定：最初は定価×0.8・諸経費10%・施工費1時間2,500円・書式は苅田町・行橋市・みやこ町用', () => {
  const s = cleanSettings({});
  assert.deepEqual([s.estimateRate, s.estimateOverheadRate, s.estimateHourRate, s.estimateForm], [0.8, 0.1, 2500, 'yukuhashi']);
  assert.equal(cleanSettings({estimateRate: '0.75'}).estimateRate, 0.75);
  assert.equal(cleanSettings({estimateForm: 'kouiki'}).estimateForm, 'kouiki');
  assert.equal(cleanSettings({estimateForm: 'x', estimateOverheadRate: -1}).estimateForm, 'yukuhashi');
  assert.equal(cleanSettings({estimateOverheadRate: -1}).estimateOverheadRate, 0);
});

test('見積書の項目：前のデータ（項目なし）も読める', () => {
  const [j] = cleanJobs([{customer: '山田', work: '前の工事内容', places: [{name: '玄関', rows: [{kind: 'material', excluded: true}, {kind: 'labor'}]}]}]);
  assert.deepEqual([j.insuredNo, j.form, j.overhead, j.overheadTarget], ['', '', null, null]);
  assert.deepEqual(cleanJobs([{overhead: 15911, overheadTarget: '2700'}]).map((x) => [x.overhead, x.overheadTarget]), [[15911, 2700]]);
  assert.deepEqual([j.places[0].kind, j.places[0].photo], [1, 0]);
  assert.deepEqual(j.places[0].rows.map((r) => r.excluded), [true, false]);
  const [k] = cleanJobs([{insuredNo: '0000366989', form: 'kouiki', places: [{kind: 3, photo: '2', work: '床材変更'}, {kind: 9, photo: -1}]}]);
  assert.deepEqual([k.insuredNo, k.form], ['0000366989', 'kouiki']);
  assert.deepEqual(k.places.map((p) => [p.kind, p.photo]), [
    [3, 2],
    [1, 0],
  ]);
  // 前の版の工事名称（work）は読まない（見積書の改修内容・工事名称は改修の種類から）
  assert.equal('work' in k.places[0], false);
  // 申請書の項目：前のデータ（項目なし）は空。丸で囲む項目は選べる値のほかは空にする。前の版の丸（shinseiMarks）も読む
  assert.deepEqual(j.shinsei, NO_SHINSEI);
  const [m] = cleanJobs([{shinseiMarks: {gender: '女', era: '平成', care: '要介護2', renovated: 1}}]);
  assert.deepEqual(m.shinsei, {...NO_SHINSEI, gender: '女', care: '要介護2'});
  const [n] = cleanJobs([{shinsei: {kana: 'ヤマダ', birthY: 23, phone: '0930-00-0000', start: '2026-11-05', end: 'x', cost: '198000', gender: '男'}, places: [{name: '玄関', shinseiText: ' 木製手すり '}, {name: 'トイレ', shinseiText: ''}]}]);
  assert.deepEqual(n.shinsei, {...NO_SHINSEI, kana: 'ヤマダ', birthY: '23', phone: '0930-00-0000', start: '2026-11-05', cost: 198000, gender: '男'});
  assert.deepEqual(n.places.map((p) => p.shinseiText), [' 木製手すり ', undefined]); // 申請書に書く文は空なら持たない
});

test('前のデータの行・部材にも、定価・長さ・見積の単価が入る', () => {
  const [j] = cleanJobs([{customer: '山田', places: [{name: '玄関', rows: [{kind: 'material', name: '手すり', price: 3000, qty: 1}]}]}]);
  const r = j.places[0].rows[0];
  assert.deepEqual([r.listPrice, r.lengthCm, r.pieceLengthM, r.estPrice, r.unit], [0, 0, 0, null, '']);
  // 1本の長さを入れる前の行・部材は、商品名から入れる（手間の行には入れない）
  const [j2] = cleanJobs([{places: [{rows: [{kind: 'material', name: '木製手すり 35φ 4m'}, {kind: 'labor', name: '補強板 2m以下'}]}]}]);
  assert.deepEqual(j2.places[0].rows.map((x) => x.pieceLengthM), [4, 0]);
  assert.deepEqual(cleanMaterials([{name: '手すり 2000mm'}, {name: 'ブラケット'}, {name: '手すり 4m', pieceLengthM: 0}]).map((m) => m.pieceLengthM), [2, 0, 0]);
  const [r2] = cleanJobs([{places: [{rows: [{kind: 'material', estPrice: '9600', lengthCm: -5}]}]}])[0].places[0].rows;
  assert.deepEqual([r2.estPrice, r2.lengthCm], [9600, 0]);
  assert.deepEqual(cleanKits([{name: '一式', rows: [{kind: 'labor', name: '木', price: 1000, qty: 2}]}, 'x']).map((k) => [k.name, k.rows.length]), [['一式', 1]]);
});

test('笹岡工務店の請求書に入れるか：前の版の様邸は入れる。見積書作成アプリで入れないままの見積書は入れない', () => {
  assert.equal(cleanJobs([{id: 'a'}])[0].shikiri, true);
  assert.equal(cleanJobs([{id: 'a', shikiri: true}])[0].shikiri, true);
  assert.equal(cleanJobs([{id: 'a', shikiri: false}])[0].shikiri, false);
});

test('発注書で直したところ：前のデータ（なし）は null。直した数・消した行・足した行を読み直せる（前にあった備考は捨てる）', () => {
  assert.equal(cleanJobs([{id: 'j'}])[0].order, null);
  const [j] = cleanJobs([
    {
      id: 'j',
      order: {
        qty: {'bar:a': 2, 'qty:b': '3', bad: 'x', neg: -1},
        removed: ['qty:c', 4],
        added: [{key: 'add:1', name: 'ブラケット', code: 'BR-1', unit: '個', qty: 2, price: 500}, {name: '鍵のない行'}],
        supplier: 'ケアマックス',
        date: '2026-10-20',
        note: '午前中に納品', // 前の版の備考。発注書に出さなくなったので読み込まない
      },
    },
  ]);
  assert.deepEqual(j.order?.qty, {'bar:a': 2, 'qty:b': 3});
  assert.deepEqual(j.order?.removed, ['qty:c']);
  assert.deepEqual(
    j.order?.added.map((l) => [l.key.startsWith('add:'), l.name, l.qty]),
    [
      [true, 'ブラケット', 2],
      [true, '鍵のない行', 1],
    ],
  );
  assert.deepEqual([j.order?.supplier, j.order?.date], ['ケアマックス', '2026-10-20']);
  assert.ok(j.order && !('note' in j.order));
});

test('保険者：前のデータ（なし）は住所・書式から入れる。選んだものはそのまま', () => {
  const [a, b, c, d, e] = cleanJobs([
    {id: 'a', form: 'yukuhashi', address: '行橋市中央1-1'},
    {id: 'b', form: 'kouiki', address: ''},
    {id: 'c', form: 'yukuhashi', address: ''},
    {id: 'd', insurer: 'miyako', form: 'yukuhashi', address: '行橋市'},
    {id: 'e', insurer: 'other', form: '', address: '苅田町'},
  ]);
  assert.deepEqual([a.insurer, b.insurer, c.insurer, d.insurer, e.insurer], ['yukuhashi', 'kouiki', '', 'miyako', 'kanda']);
});

test('取付手間の見積の単価：踏台 木 は 2,000円（ユーザーの指示）。前の版の設定は laborRev が 0（読み込んだあと、空のままの見積の単価を直す）', () => {
  assert.equal(DEFAULT_LABOR.find((l) => l.id === 'l07')?.estPrice, 2000);
  assert.equal(cleanSettings(undefined).laborRev, LABOR_REV); // 新しく始めたときは最新（マスタも最初から 2,000）
  assert.equal(cleanSettings({officeName: '行橋営業所'}).laborRev, 0); // 前の版で保存した設定
  assert.equal(cleanSettings({laborRev: LABOR_REV}).laborRev, LABOR_REV);
  // 前の版で保存したマスタは、見積の単価の空欄（null）をそのまま読む（直すのは App.tsx で一度だけ）
  assert.equal(cleanLabor([{id: 'l07', name: '踏台 木', price: 1500, estPrice: null}])[0].estPrice, null);
  assert.equal(cleanLabor([{id: 'l07', name: '踏台 木', price: 1500}])[0].estPrice, 2000); // 見積の単価の項目がなければマスタの初期値
});

test('「手摺」ではなく「手すり」（ユーザーの指示）：施工費の初期値・前の版の設定は tesuri が false（読み込んだあと、保存してある名前を一度だけ直す）', () => {
  assert.deepEqual(['安寿框手摺', '木製手摺り 4m', '手摺 I型', '手すり', 'L型手すり'].map(tesuri), ['安寿框手すり', '木製手すり 4m', '手すり I型', '手すり', 'L型手すり']);
  assert.equal(DEFAULT_LABOR.find((l) => l.id === 'l17')?.name, '安寿框手すり');
  assert.ok(!DEFAULT_LABOR.some((l) => l.name.includes('手摺')));
  assert.equal(cleanSettings({officeName: '行橋営業所'}).tesuri, false); // 前の版で保存した設定
  assert.equal(cleanSettings({tesuri: true}).tesuri, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {CATEGORIES, docLabel} from '../../src/tokutei/category.ts';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {pastReasons, reasonExamples} from '../../src/tokutei/reasons.ts';
import {customerKey, customerPatch, frequentValues, newSale, pastCustomers, sameYearSales} from '../../src/tokutei/sales.ts';
import type {Sale} from '../../src/tokutei/types.ts';
import {ageOn, fiscalYearOf, parseDateText, warekiLabel, warekiOf} from '../../src/tokutei/wareki.ts';
import {addressOfZip, zipCandidates, zipLabel} from '../../src/tokutei/zip.ts';

// 入力を1回にするための「連動」の部品（ユーザーの指示「入力できるところ、連動できる部分は徹底的に分析し、無駄を省けるようにする」）

test('生年月日は和暦でも西暦でも、区切りがなくても読める', () => {
  for (const t of ['S31.6.10', 's31/6/10', '昭31.6.10', '昭和31年6月10日', '昭和31年6月10日生', 'Ｓ３１．６．１０', '1956/6/10', '1956-06-10', '1956年6月10日', '19560610', 'S310610']) {
    assert.equal(parseDateText(t), '1956-06-10', t);
  }
  assert.equal(parseDateText('昭和元年12月26日'), '1926-12-26');
  assert.equal(parseDateText('T15.12.24'), '1926-12-24');
  assert.equal(parseDateText('昭和64年1月7日'), '1989-01-07');
  assert.equal(parseDateText('昭和64年1月8日'), null); // その日は平成元年
  assert.equal(parseDateText('S31.2.30'), null); // ない日
  assert.equal(parseDateText('あいう'), null);
});

test('和暦の書き方・年齢・年度', () => {
  assert.deepEqual(warekiOf('1956-06-10'), {era: '昭和', short: '昭', y: 31, m: 6, d: 10});
  assert.equal(warekiLabel('1926-12-25'), '昭和元年12月25日');
  assert.equal(warekiLabel('2026-10-22'), '令和8年10月22日');
  assert.equal(warekiOf('1912-07-29')?.era, '明治');
  assert.equal(ageOn('1956-06-10', '2026-06-09'), 69);
  assert.equal(ageOn('1956-06-10', '2026-06-10'), 70);
  assert.equal(fiscalYearOf('2027-03-31'), 2026);
  assert.equal(fiscalYearOf('2027-04-01'), 2027);
});

test('住所から郵便番号（福岡県）。大字・郡は省いて書いてもよい', () => {
  assert.deepEqual(zipCandidates('行橋市大字流末1327番地'), [{zip: '824-0043', label: '行橋市流末'}]);
  assert.deepEqual(zipCandidates('福岡県行橋市流末1327'), [{zip: '824-0043', label: '行橋市流末'}]);
  assert.equal(zipCandidates('苅田町富久町1丁目')[0]?.zip.slice(0, 3), '800');
  assert.equal(zipCandidates('京都郡みやこ町豊津1000')[0]?.zip, '824-0121');
  assert.equal(zipCandidates('みやこ町犀川上伊良原1234番地5')[0]?.zip, '824-0252');
  // 町域が分からなければ市区町村の番号
  assert.deepEqual(zipCandidates('行橋市どこか1-2'), [{zip: '824-0000', label: '行橋市'}]);
  assert.deepEqual(zipCandidates('東京都千代田区1-1'), []);
  assert.equal(addressOfZip('8240043'), '行橋市流末');
  assert.equal(addressOfZip('824-0043'), '行橋市流末');
  assert.equal(addressOfZip('1000001'), '');
  assert.equal(zipLabel('８２４００４３'), '824-0043');
});

test('書類の種目は種目だけ（細目は書かない。ユーザーの指示「リストはシンプルに、入浴補助用具、腰掛便座などシンプルで良い」）', () => {
  assert.equal(docLabel('腰掛便座', '移動できる便器（ポータブルトイレ）'), '腰掛便座');
  assert.equal(docLabel('入浴補助用具', '入浴用いす'), '入浴補助用具');
  assert.equal(docLabel('歩行器', ''), '歩行器');
});

const S = defaultSettings();
function sale(over: Partial<Sale>): Sale {
  return {...newSale([], S, 'yukuhashi'), ...over};
}

test('前のお客様から入れる：同じ方は1つ（被保険者番号は0を足してそろえる）・商品と日付は写さない', () => {
  const a1 = sale({id: 'a1', customer: '見本 花子', insuredNo: '1234567', updatedAt: 1, careManager: '見本 太郎'});
  const a2 = sale({id: 'a2', customer: '見本 花子', insuredNo: '0001234567', updatedAt: 3, careManager: '見本 次郎'});
  const b = sale({id: 'b', customer: '見本 一郎', updatedAt: 2, birthDate: '1940-01-01'});
  const cur = sale({id: 'c', updatedAt: 9});
  assert.equal(customerKey(a1), customerKey(a2));
  assert.deepEqual(
    pastCustomers([a1, a2, b, cur], cur).map((x) => x.id),
    ['a2', 'b'],
  );
  const patch = customerPatch(a2);
  assert.equal(patch.careManager, '見本 次郎');
  assert.equal('items' in patch || 'applyDate' in patch || 'quoteNo' in patch, false);
});

test('今年度の残り：同じ方・同じ年度・申請した案件だけ', () => {
  const base = {customer: '見本 花子', insuredNo: '1234567'};
  const done = sale({...base, id: 'd', status: '集金', deliveryDate: '2026-05-01'});
  const quote = sale({...base, id: 'q', status: '見積', estimateDate: '2026-06-01'});
  const lastYear = sale({...base, id: 'l', status: '集金', deliveryDate: '2026-03-31'});
  const other = sale({customer: '見本 一郎', id: 'o', status: '集金', deliveryDate: '2026-05-01'});
  const cur = sale({...base, id: 'c', estimateDate: '2026-10-22'});
  assert.deepEqual(
    sameYearSales([done, quote, lastYear, other, cur], cur).map((x) => x.id),
    ['d'],
  );
});

test('よく使う値・前に書いた理由', () => {
  const list = [
    sale({id: '1', careOffice: 'A居宅', careManager: '甲'}),
    sale({id: '2', careOffice: 'A居宅', careManager: '乙'}),
    sale({id: '3', careOffice: 'B居宅', careManager: '丙'}),
  ];
  assert.deepEqual(frequentValues(list, (x) => x.careOffice), ['A居宅', 'B居宅']);
  assert.deepEqual(frequentValues(list, (x) => x.careManager, (x) => x.careOffice === 'A居宅'), ['甲', '乙']);
  assert.ok(reasonExamples('入浴補助用具', '入浴用いす')[0].texts[0].includes('シャワーチェア'));
  assert.ok(reasonExamples('歩行器', '').length > 0);
  const withReason = sale({id: 'r', updatedAt: 5, items: [{...newItem(), category: '入浴補助用具', sub: '入浴用いす', reason: '自分で書いた理由'}]});
  assert.deepEqual(pastReasons([withReason], '入浴補助用具', '入浴用いす'), ['自分で書いた理由']);
  assert.deepEqual(pastReasons([withReason], '入浴補助用具', '入浴用いす', 'r'), []);
});

function newItem() {
  return {id: 'i', productId: null, name: 'x', maker: '', code: '', tais: '', category: '', sub: '', unit: '台', supplier: '', taxType: '10%' as const, listPrice: 0, cost: 0, qty: 1, discountRate: 20, unitPrice: null, reason: ''};
}

test('理由の文例：よく使う用具は10ずつ・ほかは5つ・約100字（ユーザーの指示「シャワーチェアで10個、浴槽台で10個、腰掛け便座で10個…ポータブルトイレ…夜間のみなのか、日中もなのか…和式から洋式」2026-10-26）', () => {
  const all = (g: {texts: string[]}[]) => g.flatMap((x) => x.texts);
  for (const c of CATEGORIES) {
    const keys = c.subs.length && c.name !== '歩行補助つえ' ? c.subs.map((s) => [c.name, s] as const) : [[c.name, ''] as const];
    for (const [cat, sub] of keys) {
      const groups = reasonExamples(cat, sub);
      for (const g of groups) {
        assert.ok(g.texts.length >= 5, `${cat} ${sub} ${g.label}：${g.texts.length}`);
        for (const t of g.texts) assert.ok(t.length >= 85 && t.length <= 115, `${g.label}：${t.length}字「${t.slice(0, 12)}…」`);
        // 当たり障りのない、みんなが使える文（ユーザーの指示「文例は当たり障りのないみんなが使えるものにする」2026-10-26）：病名・家族の事情を書かない
        for (const t of g.texts) assert.doesNotMatch(t, /麻痺|円背|心肺|認知|家族|退院|夫|妻|娘|息子/, `${g.label}「${t.slice(0, 12)}…」`);
      }
      assert.equal(new Set(all(groups)).size, all(groups).length);
    }
  }
  const labels = (cat: string, sub: string, name = '') => reasonExamples(cat, sub, name).map((g) => `${g.label}${g.texts.length}`);
  assert.deepEqual(labels('入浴補助用具', '入浴用いす'), ['シャワーチェア10']);
  assert.deepEqual(labels('入浴補助用具', '浴槽内いす'), ['浴槽台10']);
  assert.deepEqual(labels('入浴補助用具', '浴槽用手すり'), ['浴槽用手すり10']);
  assert.deepEqual(labels('入浴補助用具', '入浴台'), ['バスボード（入浴台）10']);
  assert.deepEqual(labels('腰掛便座', '移動できる便器（ポータブルトイレ）'), ['ポータブルトイレ（夜間のみ）10', 'ポータブルトイレ（日中も）10']);
  assert.deepEqual(labels('腰掛便座', '和式便器を腰掛式にするもの'), ['和式から洋式（据置式便座）10']);
  assert.deepEqual(labels('腰掛便座', '洋式便器の高さを補うもの'), ['補高便座10']);
  assert.deepEqual(labels('腰掛便座', '立ち上がりを補助するもの'), ['昇降便座（立ち上がり補助）10']);
  // シャワーチェアは両ひじ掛けの形が中心（ユーザーの指示「メインは両肘ありの分」）
  assert.ok(reasonExamples('入浴補助用具', '入浴用いす')[0].texts.filter((t) => t.includes('ひじ掛け')).length >= 5);
  // 夜間のみの文例は夜間の話、日中もの文例は日中の話
  const [night, day] = reasonExamples('腰掛便座', '移動できる便器（ポータブルトイレ）');
  for (const t of night.texts) assert.ok(t.includes('夜'), t);
  for (const t of day.texts) assert.ok(/日中|終日|一人の時間|日々|おむつ|移乗|退院|場所/.test(t), t);
  // 種目だけ選んだ手入れの商品は、商品名から細目を見る（シャワーチェア → 入浴用いす、浴槽台 → 浴槽内いす）
  assert.deepEqual(reasonExamples('入浴補助用具', '', '見本のシャワーチェア'), reasonExamples('入浴補助用具', '入浴用いす'));
  assert.deepEqual(reasonExamples('入浴補助用具', '', '浴槽台 見本'), reasonExamples('入浴補助用具', '浴槽内いす'));
  // 商品名から分からなければ、細目ごとの文例を見出しごとに全部（よく使う順）
  assert.deepEqual(labels('入浴補助用具', '', '見本の用具').slice(0, 4), ['シャワーチェア10', '浴槽台10', '浴槽用手すり10', 'バスボード（入浴台）10']);
  assert.deepEqual(labels('腰掛便座', '', '見本の用具'), ['ポータブルトイレ（夜間のみ）10', 'ポータブルトイレ（日中も）10', '和式から洋式（据置式便座）10', '補高便座10', '昇降便座（立ち上がり補助）10']);
  // 選んだ種目の文例だけ（ユーザーの指示「歩行補助杖を選択したのに、シャワーチェアの文例がでる。腰掛便座の文例か」2026-10-26）。商品名が別の用具に見えても出さない
  assert.deepEqual(labels('歩行補助つえ', '', '見本 シャワーチェア 両ひじ掛け'), ['歩行補助つえ5']);
  assert.deepEqual(labels('歩行補助つえ', '', '見本 ポータブルトイレ'), ['歩行補助つえ5']);
  assert.deepEqual(labels('歩行補助つえ', '', '見本の多点杖'), ['多点杖5']); // 商品名から推した細目がその種目のものなら使う
  assert.deepEqual(labels('腰掛便座', '', '見本 シャワーチェア').slice(0, 1), ['ポータブルトイレ（夜間のみ）10']);
  assert.ok(!labels('腰掛便座', '', '見本 シャワーチェア').some((x) => x.startsWith('シャワーチェア')));
  // 前の種目の細目が残っていても（入浴用いすのまま歩行補助つえに）使わない
  assert.deepEqual(labels('歩行補助つえ', '入浴用いす'), ['歩行補助つえ5']);
  // 種目を選んでいなければ、商品名から推した種目の文例
  assert.equal(labels('', '', '見本 シャワーチェア')[0], 'シャワーチェア10');
  assert.deepEqual(labels('', ''), []);
});

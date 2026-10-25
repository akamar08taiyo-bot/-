import assert from 'node:assert/strict';
import test from 'node:test';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {TOKUTEI_KEY, tokuteiFields, tokuteiUrl, writeTokutei} from '../../src/sasaoka/tokuteiLink.ts';
import type {Job} from '../../src/sasaoka/types.ts';

// 様邸の画面の「🛁 特定福祉用具申請書」のタブ（ユーザーの指示「特定福祉用具アプリを出す」、2026-10-22）。
// 受け渡しの形は特定福祉用具の src/tokutei/jutaku.ts（ブランチ claude/care-insurance-auto-transfer-3z0c9n）と同じにしておく

// 架空の方（見本）
const job = (extra: Partial<Job> = {}): Job => ({
  id: 'j1', month: '2026-10', customer: ' 見本　花子 ', suffix: '様邸', staff: '', date: '', address: '福岡県行橋市中央1-1 ', note: '', insuredNo: '0000123456',
  insurer: 'yukuhashi', form: 'yukuhashi', overhead: null, overheadTarget: null, shikiri: true, places: [],
  shinsei: {...NO_SHINSEI, kana: 'ミホン　ハナコ', era: '昭和', birthY: '１３', birthM: '4', birthD: '14', gender: '女', care: '要介護1', zip: '824-0001', phone: '0930-00-0000',
    reasonOffice: '見本居宅介護支援事業所', reasonName: '見本 一郎', burden: '2'},
  createdAt: 1, updatedAt: 1, ...extra,
});

test('特定福祉用具に渡すお客様の情報：特定福祉用具の案件の項目の名前で（生年月日は西暦）', () => {
  assert.deepEqual(tokuteiFields(job()), {
    customer: '見本　花子',
    kana: 'ミホン　ハナコ',
    insuredNo: '0000123456',
    birthDate: '1938-04-14',
    gender: '女',
    zip: '824-0001',
    address: '福岡県行橋市中央1-1',
    tel: '0930-00-0000',
    careLevel: '要介護1',
    insurer: 'yukuhashi',
    burdenRatio: 2,
    careOffice: '見本居宅介護支援事業所',
    careManager: '見本 一郎',
  });
});

test('生活保護（介護ソフトの画面の給付情報が「生保」）は、生活保護のときだけ welfare: true を渡す', () => {
  assert.equal(tokuteiFields(job({shinsei: {...job().shinsei, welfare: true}})).welfare, true);
  assert.ok(!('welfare' in tokuteiFields(job())));
  assert.ok(!('welfare' in tokuteiFields(job({shinsei: {...job().shinsei, welfare: false}}))));
});

test('介護保険証から入れた認定の有効期間・保険者番号も渡す（入っていなければ渡さない）', () => {
  const f = tokuteiFields(job({shinsei: {...job().shinsei, careFrom: '2024-04-01', careTo: '2027-03-31', insurerNo: ' 409999 '}}));
  assert.deepEqual([f.careFrom, f.careTo, f.insurerNo], ['2024-04-01', '2027-03-31', '409999']);
  assert.ok(!('careFrom' in tokuteiFields(job())));
});

test('まだ入っていない様邸：空のまま渡す。保険者・負担割合は分からなければ渡さない（特定福祉用具の初めの値のまま）', () => {
  const blank = tokuteiFields({...job({customer: '', address: '', insuredNo: '', insurer: '', form: ''}), shinsei: undefined});
  assert.deepEqual(blank, {customer: '', kana: '', insuredNo: '', birthDate: '', gender: '', zip: '', address: '', tel: '', careLevel: '', careOffice: '', careManager: ''});
  // 保険者は住所の市町村からも決まる（申請書の保険者と同じ）
  assert.equal(tokuteiFields(job({insurer: '', form: '', address: '福岡県京都郡苅田町富久町1-1'})).insurer, 'kanda');
});

test('タブの中に出す URL と localStorage の受け渡し（その様邸の id で）', () => {
  assert.equal(tokuteiUrl('j 1'), '../tokutei/index.html#jutaku=j%201&embed=1&view=shinsei');
  assert.equal(tokuteiUrl('j 1', 'quote'), '../tokutei/index.html#jutaku=j%201&embed=1&view=quote'); // 販売見積書のタブ
  const store = new Map<string, string>();
  const g = globalThis as {localStorage?: unknown};
  const before = g.localStorage;
  g.localStorage = {setItem: (k: string, v: string) => store.set(k, v)};
  try {
    assert.equal(writeTokutei(job()), true);
    const saved = JSON.parse(store.get(TOKUTEI_KEY) ?? '{}');
    assert.equal(TOKUTEI_KEY, 'taiyo-tokutei-from-jutaku-v1');
    assert.equal(saved.job, 'j1');
    assert.equal(saved.fields.customer, '見本　花子');
    g.localStorage = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    assert.equal(writeTokutei(job()), false); // 書けなくても止まらない（特定福祉用具は一覧から）
  } finally {
    g.localStorage = before;
  }
});

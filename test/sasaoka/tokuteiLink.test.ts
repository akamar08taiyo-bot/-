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

test('特定福祉用具から住宅改修へ（⇔）：中のアプリが送った項目を様邸に入れる。請求書に入れるか・見積もり作成日は変えない', async () => {
  const {readFromTokutei, withTokuteiFields, TO_JUTAKU} = await import('../../src/sasaoka/tokuteiLink.ts');
  // ユーザーの指示「特定福祉用具の申請書を入力した場合であっても、住宅改修申請書、理由書、見積もりなどに、名前や住所なども転記されるようにする。⇔」2026-10-26
  const blank = job({customer: '', address: '', insuredNo: '', shikiri: false, estDate: '', shinsei: {...NO_SHINSEI}});
  const m = readFromTokutei({
    type: TO_JUTAKU,
    job: 'j1',
    fields: {customer: '見本 次郎', kana: 'ミホン　ジロウ', insuredNo: '0000000001', birthDate: '1938-04-14', gender: '男', zip: '800-0300', address: '福岡県京都郡苅田町富久町1-1', tel: '093-000-0000', careLevel: '要介護2', burdenRatio: 3, careOffice: '見本居宅', careManager: '見本 三郎', insurer: 'kanda', welfare: true},
  });
  assert.ok(m);
  const next = withTokuteiFields(blank, m!.fields);
  assert.deepEqual([next.customer, next.address, next.insuredNo, next.insurer, next.form], ['見本 次郎', '福岡県京都郡苅田町富久町1-1', '0000000001', 'kanda', 'yukuhashi']);
  const si = next.shinsei!;
  assert.deepEqual([si.kana, si.era, si.birthY, si.birthM, si.birthD, si.gender, si.zip, si.phone, si.care, si.burden, si.reasonOffice, si.reasonName, si.welfare], ['ミホン　ジロウ', '昭和', '13', '4', '14', '男', '800-0300', '093-000-0000', '要介護2', '3', '見本居宅', '見本 三郎', true]);
  // 金額のない様邸は請求書に入れない（shikiri・見積もり作成日はそのまま）
  assert.equal(next.shikiri, false);
  assert.equal(next.estDate, '');
  // 同じ値なら同じ様邸（保存し直さない）。生年月日は同じ日なら元号の書き方を変えない
  assert.equal(withTokuteiFields(next, m!.fields), next);
  const j0 = job(); // 生年月日は「昭和１３年」（全角）で入っている
  assert.equal(withTokuteiFields(j0, {birthDate: '1938-04-14'}), j0);
  // 大正・明治も。平成からの日付・空は空に
  assert.deepEqual(['era', 'birthY'].map((k) => (withTokuteiFields(blank, {birthDate: '1920-01-02'}).shinsei as unknown as Record<string, string>)[k]), ['大正', '9']);
  assert.equal(withTokuteiFields(blank, {birthDate: '1990-01-01'}).shinsei?.birthY ?? '', '');
  // 形のちがう・知らない値は捨てる
  assert.equal(readFromTokutei({type: 'other', job: 'j1', fields: {}}), null);
  assert.deepEqual(readFromTokutei({type: TO_JUTAKU, job: 'j1', fields: {customer: 1, insurer: 'other', burdenRatio: 4, gender: 'X', birthDate: 'S13'}})?.fields, {});
});

test('担当（ユーザーの指示「受注残に入れるとき当然担当名のところ、紐付けて受注残に飛ばせるように」2026-10-26）：様邸の担当を渡す・特定福祉用具で選び直した担当を様邸に入れる', async () => {
  const {readFromTokutei, withTokuteiFields, TO_JUTAKU} = await import('../../src/sasaoka/tokuteiLink.ts');
  assert.equal(tokuteiFields(job({staff: ' 見本 太郎 '})).staff, '見本 太郎');
  assert.ok(!('staff' in tokuteiFields(job()))); // 担当がなければ渡さない（特定福祉用具の案件の担当のまま）
  const m = readFromTokutei({type: TO_JUTAKU, job: 'j1', fields: {staff: '見本 次郎'}});
  assert.deepEqual(m?.fields, {staff: '見本 次郎'});
  const j0 = job({staff: '見本 太郎'});
  assert.equal(withTokuteiFields(j0, m!.fields).staff, '見本 次郎');
  assert.equal(withTokuteiFields(j0, {staff: '見本 太郎'}), j0); // 同じなら変えない
  assert.deepEqual(readFromTokutei({type: TO_JUTAKU, job: 'j1', fields: {staff: ' '}})?.fields, {}); // 空の担当では消さない
});

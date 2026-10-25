// 介護保険証から読んだ値を様邸に入れる（cardApply.ts）。値はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {addCardRead, addExtraRead, applyCard, applyExtra, birthText, currentExtra, currentOf, defaultPicks, EXTRA_FIELDS, extraPicks, extraText, fieldText, NO_EXTRA, softRead, staffGuess, staffMatch, termText} from '../../src/sasaoka/cardApply.ts';
import type {ExtraInfo} from '../../src/sasaoka/cardApply.ts';
import {NO_SOFT} from '../../src/sasaoka/careSoft.ts';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {NO_CARD} from '../../src/sasaoka/hokensho.ts';
import type {CardInfo, CardKey} from '../../src/sasaoka/hokensho.ts';
import type {Job} from '../../src/sasaoka/types.ts';

const job = (extra: Partial<Job> = {}): Job => ({
  id: 'j1', month: '2026-10', customer: '', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '',
  insurer: 'yukuhashi', form: 'yukuhashi', overhead: null, overheadTarget: null, shikiri: true, places: [], shinsei: {...NO_SHINSEI},
  createdAt: 1, updatedAt: 1, ...extra,
});
const READ: CardInfo = {
  ...NO_CARD,
  insuredNo: '0000123456', insurerNo: '409999', insurer: 'kanda', insurerName: '苅田町', kana: 'ミホン　ハナコ', name: '見本　花子',
  zip: '800-0300', address: '京都郡苅田町富久町一丁目1番1号', era: '昭和', birthY: '13', birthM: '4', birthD: '14', gender: '女',
  care: '要介護2', careFrom: '2024-04-01', careTo: '2027-03-31', office: '見本ケアプランセンター', burden: '1',
};

test('保険証の値：見せ方（生年月日・有効期間・保険者・負担割合）', () => {
  assert.equal(birthText(READ), '昭和13年4月14日');
  assert.equal(termText('2024-04-01', '2027-03-31'), '令和6年4月1日～令和9年3月31日');
  assert.equal(termText('2019-05-01', '2020-03-31'), '令和元年5月1日～令和2年3月31日');
  assert.equal(fieldText(READ, 'insurer'), '苅田町');
  assert.equal(fieldText(READ, 'burden'), '1割');
  assert.equal(fieldText(READ, 'careTerm'), '令和6年4月1日～令和9年3月31日');
});

test('保険証の値：はじめにチェックする行（今が空・読めた値がたしか。保険者は今が空のときだけ。同じ値は入れない）', () => {
  // 空の様邸：保険者のほかは全部
  const p = defaultPicks(job({insurer: undefined, form: 'yukuhashi'}), READ, []);
  assert.ok(['insuredNo', 'kana', 'name', 'birth', 'gender', 'zip', 'address', 'care', 'careTerm', 'insurer', 'insurerNo', 'office', 'burden'].every((f) => p.has(f as never)));
  // 保険者を選んである様邸は、保険者を変えない（様式が変わる）。氏名は今と同じ（空白のちがいだけ）なら入れない
  const j = job({customer: '見本 花子', insuredNo: '0000999999'});
  const p2 = defaultPicks(j, READ, ['insuredNo', 'kana']);
  assert.ok(!p2.has('insurer'));
  assert.ok(!p2.has('name'));
  // 今の番号があって、読めた番号がたしかでないときは上書きしない。フリガナは今が空なので入れる
  assert.ok(!p2.has('insuredNo'));
  assert.ok(p2.has('kana'));
});

test('保険証の値：様邸に入れる（申請書・理由書・見積書の共通の欄と申請書の項目）', () => {
  const j = job({note: 'そのまま', shinsei: {...NO_SHINSEI, phone: '0930-00-0000', owner: '見本　太郎'}});
  const all = new Set(['insuredNo', 'kana', 'name', 'birth', 'gender', 'zip', 'address', 'care', 'careTerm', 'insurer', 'insurerNo', 'office', 'burden'] as const);
  const next = applyCard(j, READ, all);
  assert.equal(next.insuredNo, '0000123456');
  assert.equal(next.customer, '見本　花子');
  assert.equal(next.address, '京都郡苅田町富久町一丁目1番1号');
  assert.equal(next.insurer, 'kanda');
  assert.equal(next.form, 'yukuhashi');
  assert.equal(next.note, 'そのまま');
  assert.deepEqual(
    {...next.shinsei},
    {...NO_SHINSEI, phone: '0930-00-0000', owner: '見本　太郎', kana: 'ミホン　ハナコ', era: '昭和', birthY: '13', birthM: '4', birthD: '14', gender: '女', zip: '800-0300', care: '要介護2', careFrom: '2024-04-01', careTo: '2027-03-31', insurerNo: '409999', reasonOffice: '見本ケアプランセンター', burden: '1'},
  );
  // 広域連合に変えると、見積書の書式も広域連合
  assert.equal(applyCard(j, {...READ, insurer: 'kouiki'}, new Set(['insurer'])).form, 'kouiki');
  // 選ばなかった行は入れない
  const some = applyCard(j, READ, new Set(['name']));
  assert.equal(some.customer, '見本　花子');
  assert.equal(some.insuredNo, '');
  assert.equal(some.shinsei.kana, '');
  // 平成生まれは元号を空に（申請書は明治・大正・昭和）
  assert.equal(applyCard(j, {...READ, era: '平成', birthY: '2'}, new Set(['birth'])).shinsei.era, '');
  // 今の値（確かめる画面の右の列）
  const cur = currentOf(next);
  assert.equal(cur.insurerName, '苅田町');
  assert.equal(cur.office, '見本ケアプランセンター');
});

test('保険証の値：2019年1〜4月の日付は平成（令和は5月1日から）', () => {
  assert.equal(termText('2019-04-01', '2023-03-31'), '平成31年4月1日～令和5年3月31日');
  assert.equal(termText('2019-04-30', '2019-05-01'), '平成31年4月30日～令和元年5月1日');
});

test('保険証の値：元号を選んでいない生年月日（申請書では昭和）は今の値があることにする。たしかでない読みで上書きしない', () => {
  const j = job({shinsei: {...NO_SHINSEI, era: '', birthY: '13', birthM: '4', birthD: '14'}});
  assert.equal(fieldText(currentOf(j), 'birth'), '昭和13年4月14日');
  const unsureBirth = {...READ, birthY: '18'};
  assert.ok(!defaultPicks(j, unsureBirth, ['era', 'birthY', 'birthM', 'birthD']).has('birth'));
  // 同じ生年月日を読んだときは、入れる行にしない（同じ）
  assert.ok(!defaultPicks(j, READ, []).has('birth'));
  // 生年月日がまだないときは、元号も空のまま（今の値なし）
  assert.equal(fieldText(currentOf(job()), 'birth'), '');
});

test('保険証の値：確かめる画面で全角の数字で打ち直した番号も数字で入れる', () => {
  const next = applyCard(job({insuredNo: '0000999999'}), {...READ, insuredNo: '００００１２３４５６', insurerNo: '４０９９９９'}, new Set(['insuredNo', 'insurerNo'] as const));
  assert.equal(next.insuredNo, '0000123456');
  assert.equal(next.shinsei.insurerNo, '409999');
});

test('保険証の値：今の住所が読んだ住所で始まる（建物名まで入っている）ときは、はじめから入れる行にしない', () => {
  const j = job({address: '京都郡苅田町富久町一丁目1番1号 見本ハイツ101号'});
  assert.ok(!defaultPicks(j, READ, []).has('address'));
  // ちがう住所なら入れる行
  assert.ok(defaultPicks(job({address: '京都郡苅田町富久町二丁目2番2号'}), READ, []).has('address'));
});

// ---------------------------------------------------------------- 介護ソフトの画面から（2026-10-23。値はすべて架空）

test('介護ソフトの画面から読んだ結果を確かめる画面の形に（保険証の項目と、保険証にない項目）', () => {
  const r = softRead({
    info: {
      ...NO_SOFT, name: '見本　春子', kana: 'ミホン　ハルコ', era: '昭和', birthY: '17', birthM: '5', birthD: '6', age: '84', gender: '女', staff: '見本太郎',
      zip: '824-0000', address: '福岡県行橋市見本町1丁目2-3', phone: '0930-00-0000', office: '見本ケアプランセンター', manager: '見本　一郎', officeTel: '0930-00-1111',
      care: '要介護2', careFrom: '2025-10-22', careTo: '2026-10-31', insurerName: '行橋市', insurer: 'yukuhashi', insuredNo: '0000987654', kind: '生保', rate: '90', burden: '1', welfare: 'yes',
    },
    unsure: ['kana', 'manager', 'address'],
    score: 10,
  });
  assert.equal(r.info.name, '見本　春子');
  assert.equal(r.info.office, '見本ケアプランセンター');
  assert.equal(r.info.insurerNo, ''); // 介護ソフトの画面には保険者番号はない
  assert.deepEqual(r.unsure, ['kana', 'address']);
  assert.deepEqual(r.kinds, []);
  assert.deepEqual(r.soft, {extra: {phone: '0930-00-0000', staff: '見本太郎', reasonName: '見本　一郎', reasonTel: '0930-00-1111', welfare: 'yes'}, unsure: ['reasonName']});
});

test('担当は担当者の候補と同じ名前のときだけ（空白のちがい・前のごみは気にしない）', () => {
  const list = ['見本 太郎', '試験 次郎'];
  assert.equal(staffMatch('見本太郎', list), '見本 太郎');
  assert.equal(staffMatch('業 見本 太郎', list), '見本 太郎');
  assert.equal(staffMatch('見本', list), '');
  assert.equal(staffMatch('', list), '');
});

test('担当：候補の名前に近い読み違い（姓の1字目が同じ・ちがう字が半分まで・ほかより近い）は、その人を選んで確かめてもらう', () => {
  const list = ['見本 太郎', '試験 次郎', '見本 花子'];
  assert.deepEqual(staffGuess('見本 太朗', list), {name: '見本 太郎', exact: false});
  assert.deepEqual(staffGuess('見本 区中', list), {name: '', exact: false}); // 見本 太郎・見本 花子 のどちらとも同じくらい
  assert.deepEqual(staffGuess('試験 区中', list), {name: '試験 次郎', exact: false});
  assert.deepEqual(staffGuess('見本太郎', list), {name: '見本 太郎', exact: true});
  assert.deepEqual(staffGuess('区中 太郎', list), {name: '', exact: false}); // 姓の1字目がちがう
});

test('保険証にない項目のはじめのチェック：今とちがい、今が空か読めた値がたしかなとき。電話はハイフンのちがいは同じ', () => {
  const v: ExtraInfo = {phone: '0930-00-0000', staff: '見本 太郎', reasonName: '見本　一郎', reasonTel: '0930-00-1111', welfare: 'yes'};
  assert.deepEqual([...extraPicks(job(), v, [])].sort(), ['phone', 'reasonName', 'reasonTel', 'staff', 'welfare']);
  // 今の値があって、読めた値がたしかでなければ入れない（読み違いで上書きしない）
  const filled = job({staff: '試験 次郎', shinsei: {...NO_SHINSEI, phone: '0930-11-1111', reasonName: '試験　花子'}});
  assert.deepEqual([...extraPicks(filled, v, ['phone', 'reasonName', 'staff'])].sort(), ['reasonTel', 'welfare']);
  assert.deepEqual([...extraPicks(filled, v, [])].sort(), ['phone', 'reasonName', 'reasonTel', 'staff', 'welfare']);
  // 同じ値（電話のハイフンなし・生活保護でない＝なし）は入れない
  const same = job({shinsei: {...NO_SHINSEI, phone: '0930000000'}});
  assert.deepEqual([...extraPicks(same, {...NO_EXTRA, phone: '0930-00-0000', welfare: 'no'}, [])], []);
  // 担当の候補にない名前（v.staff は空にして渡す）は入れない
  assert.deepEqual([...extraPicks(job(), {...NO_EXTRA, staff: ''}, [])], []);
});

test('保険証にない項目を様邸に入れる：申請書の電話番号・理由書の作成者の氏名と連絡先・担当（候補にあるときだけ）・生活保護', () => {
  const v: ExtraInfo = {phone: '0930-00-0000', staff: '見本太郎', reasonName: '見本　一郎', reasonTel: '0930-00-1111', welfare: 'yes'};
  const all = new Set(EXTRA_FIELDS.map((f) => f.field));
  const j = applyExtra(job(), v, all, ['見本 太郎']);
  assert.equal(j.shinsei?.phone, '0930-00-0000');
  assert.equal(j.shinsei?.reasonName, '見本　一郎');
  assert.equal(j.shinsei?.welfare, true);
  assert.equal(j.riyu?.tel, '0930-00-1111');
  assert.equal(j.staff, '見本 太郎');
  // 候補にない担当は入れない。生活保護でなければ持たない
  const k = applyExtra(job({staff: '試験 次郎', shinsei: {...NO_SHINSEI, welfare: true}}), {...v, staff: '見本太郎', welfare: 'no'}, all, ['試験 次郎']);
  assert.equal(k.staff, '試験 次郎');
  assert.equal(k.shinsei?.welfare, undefined);
  // 今の値（保険証にない項目）
  assert.deepEqual(currentExtra(j), {phone: '0930-00-0000', staff: '見本 太郎', reasonName: '見本　一郎', reasonTel: '0930-00-1111', welfare: 'yes'});
  assert.equal(extraText(currentExtra(k), 'welfare'), 'なし');
});

test('追加で読み取る：空いた欄は足す・黄色の欄はたしかな読み（か同じ読み）で替える・たしかな欄と手で直した欄はそのまま', () => {
  const cur: CardInfo = {...NO_CARD, name: '見本　春子', kana: 'ミキン　カコ', insuredNo: '', care: '要介護1', burden: ''};
  const add = {info: {...NO_CARD, name: '見本　春美', kana: 'ミホン　ハルコ', insuredNo: '0000001234', insurer: 'kanda' as const, insurerName: '苅田町', burden: '2' as const, care: '要介護2' as const}, unsure: [] as CardKey[], kinds: [] as ('card' | 'futan')[]};
  const r = addCardRead(cur, ['kana'], new Set(), add);
  assert.deepEqual([r.info.name, r.info.kana, r.info.insuredNo, r.info.insurer, r.info.insurerName, r.info.burden, r.info.care], ['見本　春子', 'ミホン　ハルコ', '0000001234', 'kanda', '苅田町', '2', '要介護1']);
  assert.deepEqual(r.unsure, []);
  assert.deepEqual(r.changed.sort(), ['burden', 'insuredNo', 'insurer', 'kana']);
  // 手で直した欄は変えない。追加の読みもたしかでなければ、黄色の欄は替えない（空の欄は黄色で足す）
  const r2 = addCardRead(cur, ['kana'], new Set(['insuredNo']), {...add, unsure: ['kana', 'burden']});
  assert.deepEqual([r2.info.kana, r2.info.insuredNo, r2.info.burden], ['ミキン　カコ', '', '2']);
  assert.deepEqual(r2.unsure.sort(), ['burden', 'kana']);
  // 同じ読みが2回なら、たしかに
  const r3 = addCardRead(cur, ['kana'], new Set(), {...add, info: {...NO_CARD, kana: 'ミキン　カコ'}, unsure: ['kana']});
  assert.deepEqual([r3.info.kana, r3.unsure, r3.changed], ['ミキン　カコ', [], ['kana']]);
});

test('追加で読み取る（保険証にない項目）：電話はハイフンのちがいは同じ読み', () => {
  const cur: ExtraInfo = {...NO_EXTRA, phone: '0900000111', reasonName: ''};
  const r = addExtraRead(cur, ['phone'], new Set(), {extra: {...NO_EXTRA, phone: '090-000-0111', reasonName: '試験　一郎', reasonTel: '0930-00-1111'}, unsure: []});
  assert.deepEqual([r.extra.phone, r.extra.reasonName, r.extra.reasonTel, r.unsure], ['0900000111', '試験　一郎', '0930-00-1111', []]);
});

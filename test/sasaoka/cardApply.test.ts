// 介護保険証から読んだ値を様邸に入れる（cardApply.ts）。値はすべて架空
import assert from 'node:assert/strict';
import test from 'node:test';
import {applyCard, birthText, currentOf, defaultPicks, fieldText, termText} from '../../src/sasaoka/cardApply.ts';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {NO_CARD} from '../../src/sasaoka/hokensho.ts';
import type {CardInfo} from '../../src/sasaoka/hokensho.ts';
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

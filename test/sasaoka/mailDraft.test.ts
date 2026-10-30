// 「✉ メールで送付」のメール（mailDraft.ts）：件名・本文・mailto: の長さ・スマホかどうか（ユーザーの指示「メールで送付…基本的には一括で全てメールできるような形に」2026-10-30）
import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {buildMailto, docsMail, isMobileDevice, MAILTO_MAX, mailtoFits} from '../../src/sasaoka/mailDraft.ts';
import type {Job} from '../../src/sasaoka/types.ts';

const job = (customer: string, staff = ''): Job => ({customer, suffix: '様邸', staff}) as Job;
const s = {...defaultSettings(), company: '見本商事株式会社', officeName: '見本営業所', tel: '0000-00-0000'};

test('件名・本文：お客様名と選んだ書類（タブの順）、付けるファイルの名前、会社・営業所・担当・電話', () => {
  const m = docsMail(job('見本 花子', '見本 一郎'), s, ['住宅改修申請書', '工事見積書'], ['見本花子様住宅改修申請書.xlsx', '見本花子様住宅改修見積書.xlsx']);
  assert.equal(m.subject, '見本 花子様 住宅改修申請書・工事見積書の送付');
  assert.deepEqual(m.body.split('\n'), [
    'お世話になっております。',
    '見本 花子様の住宅改修申請書・工事見積書をお送りします。',
    'ご確認のほど、よろしくお願いいたします。',
    '',
    '（添付）',
    '・見本花子様住宅改修申請書.xlsx',
    '・見本花子様住宅改修見積書.xlsx',
    '',
    '見本商事株式会社 見本営業所',
    '担当：見本 一郎',
    'TEL 0000-00-0000',
  ]);
  // お客様名・担当がなければ、その所は書かない
  const blank = docsMail(job(''), s, ['理由書'], ['お客様住宅改修理由書.xlsx']);
  assert.equal(blank.subject, '理由書の送付');
  assert.equal(blank.body.split('\n')[1], '理由書をお送りします。');
  assert.ok(!blank.body.includes('担当：'));
});

test('mailto:：件名・本文を符号にする（改行は %0D%0A）。メールのソフトに渡せる長さを超えるときは、添付の名前の並びを外す', () => {
  const url = buildMailto({subject: '件名', body: '1行目\n2行目'});
  assert.equal(url, `mailto:?subject=${encodeURIComponent('件名')}&body=${encodeURIComponent('1行目')}%0D%0A${encodeURIComponent('2行目')}`);
  const many = Array.from({length: 40}, (_, i) => `見本花子様の長い名前のファイル${i}.xlsx`);
  const m = docsMail(job('見本 花子'), s, ['住宅改修申請書'], many);
  assert.ok(mailtoFits(m) && buildMailto(m).length <= MAILTO_MAX);
  assert.ok(!m.body.includes('（添付）'));
});

test('スマホ・タブレット（共有メニュー）か：iPhone・Android・指で触れる iPad（Macintosh の名前）はスマホ、Windows・Mac のパソコンはちがう', () => {
  const nav = (userAgent: string, maxTouchPoints = 0) => ({userAgent, maxTouchPoints}) as Navigator;
  assert.ok(isMobileDevice(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)));
  assert.ok(isMobileDevice(nav('Mozilla/5.0 (Linux; Android 14)', 5)));
  assert.ok(isMobileDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)));
  assert.ok(!isMobileDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)));
  assert.ok(!isMobileDevice(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 10)));
  assert.ok(!isMobileDevice(null));
});

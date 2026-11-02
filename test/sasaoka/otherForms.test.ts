import assert from 'node:assert/strict';
import test from 'node:test';
import {OTHER_FORMS} from '../../src/sasaoka/otherForms.ts';

test('ほかの市の申請書：久留米市・飯塚市・大分市・田川市の順に、住宅改修と福祉用具購入の公式のページ（https・市か広域連合のサイト）', () => {
  assert.deepEqual(OTHER_FORMS.map((f) => f.city), ['久留米市', '飯塚市', '大分市', '田川市']);
  const sites: Record<string, RegExp> = {
    kurume: /^https:\/\/www\.city\.kurume\.fukuoka\.jp\//,
    iizuka: /^https:\/\/(www\.)?city\.iizuka\.lg\.jp\//,
    oita: /^https:\/\/www\.city\.oita\.oita\.jp\//,
    tagawa: /^https:\/\/www\.fukuoka-kaigo\.jp\//, // 田川市は福岡県介護保険広域連合
  };
  for (const f of OTHER_FORMS) {
    for (const l of f.links) assert.match(l.url, sites[f.id], `${f.city}：${l.url}`);
    assert.ok(f.links.some((l) => l.label.includes('住宅改修')), `${f.city} の住宅改修`);
    assert.ok(f.links.some((l) => l.label.includes('福祉用具購入')), `${f.city} の福祉用具購入`);
    assert.equal(new Set(f.links.map((l) => l.url)).size, f.links.length);
  }
  // 田川市だけ広域連合（このアプリの広域連合の書式で作れる）
  assert.deepEqual(OTHER_FORMS.filter((f) => f.kouiki).map((f) => f.city), ['田川市']);
});

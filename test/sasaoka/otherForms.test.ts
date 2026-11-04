import assert from 'node:assert/strict';
import test from 'node:test';
import {OTHER_FORMS} from '../../src/sasaoka/otherForms.ts';

test('ほかの市の申請書：久留米市・飯塚市・大分市・田川市の順に、まだ作れない書類の公式のページ（https・市か広域連合のサイト）', () => {
  assert.deepEqual(OTHER_FORMS.map((f) => f.city), ['久留米市', '飯塚市', '大分市', '田川市']);
  const sites: Record<string, RegExp> = {
    kurume: /^https:\/\/www\.city\.kurume\.fukuoka\.jp\//,
    iizuka: /^https:\/\/(www\.)?city\.iizuka\.lg\.jp\//,
    oita: /^https:\/\/www\.city\.oita\.oita\.jp\//,
    tagawa: /^https:\/\/www\.fukuoka-kaigo\.jp\//, // 田川市は福岡県介護保険広域連合
  };
  for (const f of OTHER_FORMS) {
    for (const l of f.links) assert.match(l.url, sites[f.id], `${f.city}：${l.url}`);
    // このアプリで作れる書類のリンクは外す（ユーザーの指示「大分、田川など、できたもののリンクは外して」2026-11-04）
    assert.equal(f.links.some((l) => l.label.includes('住宅改修')), !f.make, `${f.city} の住宅改修`);
    // 福祉用具購入は田川市（広域連合）・久留米市・大分市（2026-11-04 にいただいた様式）を特定福祉用具のアプリで作れる。飯塚市だけまだ
    assert.equal(f.links.some((l) => l.label.includes('福祉用具購入')), f.id === 'iizuka', `${f.city} の福祉用具購入`);
    assert.equal(new Set(f.links.map((l) => l.url)).size, f.links.length);
  }
  // 飯塚市の福祉用具購入は新しいページ（ユーザーの「飯塚市の福祉用具購入が開けません」2026-11-04）
  assert.equal(OTHER_FORMS.find((f) => f.id === 'iizuka')!.links.find((l) => l.label.includes('福祉用具購入'))!.url, 'https://www.city.iizuka.lg.jp/site/shinsei/1803.html');
  assert.deepEqual(OTHER_FORMS.find((f) => f.id === 'tagawa')!.links, []);
  assert.deepEqual(OTHER_FORMS.find((f) => f.id === 'oita')!.links, []);
  // このアプリで作れる書式：久留米市・飯塚市・大分市はいただいた様式（大分市は 2026-11-04）、田川市は広域連合の書式（2026-11-02）
  assert.deepEqual(OTHER_FORMS.filter((f) => f.make).map((f) => [f.city, f.make]), [['久留米市', 'kurume'], ['飯塚市', 'iizuka'], ['大分市', 'oita'], ['田川市', 'kouiki']]);
});

// 初めの設定（defaults.ts）：請求先（工務店）は行橋営業所だけ笹岡工務店、ほかの営業所は空（設定で入れる）。
// ユーザーの指示「笹岡工務店を使っているところ以外でも一緒にみんなが使えるようにしたいので、限定的になるのはやめてください。金額などはもちろんそのまま」2026-10-26
import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_LABOR, defaultSettings} from '../../src/sasaoka/defaults.ts';

const withOffice = <T>(office: string | null, fn: () => T): T => {
  const g = globalThis as {localStorage?: unknown};
  const before = g.localStorage;
  g.localStorage = {getItem: (k: string) => (k === 'taiyo_portal_session' && office ? JSON.stringify({office}) : null)};
  try {
    return fn();
  } finally {
    g.localStorage = before;
  }
};

test('請求先（工務店）：行橋営業所は笹岡工務店、ほかの営業所は空。施工費の単価はどの営業所も同じ', () => {
  assert.equal(withOffice('行橋営業所', defaultSettings).clientName, '笹岡工務店');
  assert.equal(withOffice(null, defaultSettings).clientName, '笹岡工務店'); // ポータルから開いていない（行橋営業所として）
  const kokura = withOffice('小倉営業所', defaultSettings);
  assert.equal(kokura.clientName, '');
  assert.equal(kokura.officeName, '小倉営業所');
  // 金額はそのまま（取付手間の単価表は1つ。木 1,000円・見積 1,500円）
  const wood = DEFAULT_LABOR.find((l) => l.name === '木');
  assert.deepEqual([wood?.price, wood?.estPrice], [1000, 1500]);
});

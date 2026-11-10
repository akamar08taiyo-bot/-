// （株）イヤーズ デモアプリ（ユーザーの指示「申請書、見積もりツールを（株）イヤーズ専用で…サンプルURLを渡し、こちらが主導権を握れるようにする。
// 正式なものができるまではずっと使わせない」2026-11-10）：止めるスイッチの判定と、役所の原本から社内の字を消すこと
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {DEFAULT_STAFF, OFFICES} from '../../src/sasaoka/company.ts';
import * as demoCompany from '../../src/sasaoka/demo/company.ts';
import {DEMO} from '../../src/sasaoka/demo/flag.ts';
import {demoVerdict, todayIso} from '../../src/sasaoka/demo/gate.ts';
import {scrubTemplate} from '../../src/sasaoka/demo/scrub.ts';

test('止めるスイッチ：使える・止めた・期限が過ぎた・読めない', () => {
  assert.deepEqual(demoVerdict({enabled: true, until: '2027-01-31'}, '2026-11-10'), {ok: true, until: '2027-01-31'});
  assert.equal(demoVerdict({enabled: true, until: '2027-01-31'}, '2027-01-31').ok, true); // 期限の日までは使える
  const exp = demoVerdict({enabled: true, until: '2027-01-31'}, '2027-02-01');
  assert.equal(exp.ok, false);
  assert.match((exp as {message: string}).message, /2027年1月31日まで.*終わりました/);
  const off = demoVerdict({enabled: false, until: '2027-01-31', message: '正式版の準備中です'}, '2026-11-10');
  assert.deepEqual(off, {ok: false, reason: 'off', message: '正式版の準備中です'});
  assert.equal((demoVerdict({enabled: 'true', until: '2027-01-31'}, '2026-11-10') as {reason: string}).reason, 'off'); // 文字の "true" は使えない
  assert.equal((demoVerdict({enabled: true}, '2026-11-10') as {reason: string}).reason, 'bad');
  assert.equal((demoVerdict({enabled: true, until: '2027/01/31'}, '2026-11-10') as {reason: string}).reason, 'bad');
  assert.equal((demoVerdict(null, '2026-11-10') as {reason: string}).reason, 'bad');
  assert.equal(todayIso(new Date(2026, 10, 5)), '2026-11-05');
});

test('今までのアプリのビルド・テストではデモにならない（__DEMO__ がない）', () => {
  assert.equal(DEMO, false);
});

test('デモの会社ごとの値に社内の値を入れない（営業所・担当者・仕切り・登録番号・原本の営業所の字）', () => {
  assert.equal(demoCompany.COMPANY_NAME, '株式会社イヤーズ'); // デモを使う会社の名前（ユーザーの答え「名前が変わって（株）イヤーズ」）
  assert.ok(!/太陽|シルバーサービス/.test(demoCompany.COMPANY_NAME));
  assert.equal(demoCompany.REG_NO, '');
  assert.equal(demoCompany.DEFAULT_OFFICE, '');
  assert.deepEqual(demoCompany.OFFICES, []);
  assert.deepEqual(demoCompany.DEFAULT_STAFF, []);
  assert.equal(demoCompany.STAFF_FULL_NAMES.size, 0);
  assert.deepEqual(Object.values(demoCompany.ORIGINAL_OFFICE_TEXTS), ['', '', '', '']);
  assert.ok(demoCompany.DEFAULT_LABOR.every((l) => l.price === 0 && l.note === '見本の単価'));
});

test('原本から社内の字を消す：会社名・営業所・所長・担当者・作成者。ふりがなの位置がずれないよう、字の数は同じ', () => {
  const dir = new URL('../../src/sasaoka/shinsei/', import.meta.url);
  const secrets = ['太陽', 'シルバーサービス', ...OFFICES.flatMap((o) => [o.name, o.manager, o.manager.replace(' ', '　'), o.tel]), ...DEFAULT_STAFF.map((n) => n.replace(' ', '　'))];
  for (const name of ['kanda', 'yukuhashi', 'miyako', 'kouiki', 'riyu', 'fukuoka', 'kitakyushu', 'kurume', 'iizuka', 'oita']) {
    const raw = new Uint8Array(readFileSync(new URL(`${name}.xltx`, dir)));
    const before = unzipSync(raw);
    const after = unzipSync(scrubTemplate(raw));
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), name);
    for (const [part, data] of Object.entries(after)) {
      if (!/\.(xml|rels)$/.test(part)) continue;
      const xml = strFromU8(data);
      for (const s of secrets) assert.ok(!xml.includes(s), `${name} ${part}`);
      if (part === 'xl/sharedStrings.xml') {
        // 共有の文字の数と、1つずつの長さ（<t> の中の字の数）は同じ
        const lens = (x: string) => [...x.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').replace(/<[^>]+>/g, '')].length);
        assert.deepEqual(lens(xml), lens(strFromU8(before[part])), name);
      }
    }
  }
});

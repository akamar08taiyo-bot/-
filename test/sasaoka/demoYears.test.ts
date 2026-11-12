// （株）イヤーズ デモアプリ（ユーザーの指示「申請書、見積もりツールを（株）イヤーズ専用で…サンプルURLを渡し、こちらが主導権を握れるようにする。
// 正式なものができるまではずっと使わせない」2026-11-10）：止めるスイッチの判定と、役所の原本から社内の字を消すこと
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {DEFAULT_STAFF, OFFICES} from '../../src/sasaoka/company.ts';
import * as demoCompany from '../../src/sasaoka/demo/company.ts';
import {DEMO, DEMO_JOB_VIEWS} from '../../src/sasaoka/demo/flag.ts';
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

test('デモの様邸の画面は住宅改修申請書と平面図だけ（工事見積書・理由書・発注書・特定福祉用具は出さない）', () => {
  // ユーザーの指示「見積もり作成機能はなくそうかな…申請書と、平面図のみで」「理由書作成へ連動する機能については不要」2026-11-12
  assert.deepEqual([...DEMO_JOB_VIEWS], ['shinsei', 'madori']);
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

// （株）イヤーズは下請けなので、申請書の施工業者は元請け（ユーザーの指示「元請けの業者の名前をリストから選んで、入れる…リストも1回登録したら、
// もうあとはプルダウンから選べるだけ」2026-11-12）。デモのビルドの shinseiSettings は withPrime を使う（テストでは DEMO にならないので関数を直接見る）
test('元請け：選んだ元請け・初めの元請け・元請けがなければ施工業者の欄は空ける', async () => {
  const {primeKey, primeName, withPrime} = await import('../../src/sasaoka/shinseiOffice.ts');
  const {cleanSettings} = await import('../../src/sasaoka/storage.ts');
  const a = {name: primeName('見本株式会社', '見本営業所'), company: '見本株式会社', office: '見本営業所', jigyoshoNo: '0000000000', postal: '800-0000', address: '福岡県見本市', tel: '000-000-0000', manager: '見本 一郎'};
  const b = {name: primeName('見本工務店', ''), company: '見本工務店', office: '', jigyoshoNo: '', postal: '', address: '', tel: '', manager: ''};
  assert.equal(a.name, '見本株式会社　見本営業所');
  assert.equal(b.name, '見本工務店'); // 営業所がなければ会社名だけ
  assert.equal(primeKey('', [a, b]), a.name); // 選んでいなければ初めの元請け
  assert.equal(primeKey(b.name, [a, b]), b.name);
  assert.equal(primeKey('外した元請け', [a, b]), a.name); // 一覧から外した元請けは初めの元請け
  assert.equal(primeKey('', []), '');
  const own = {company: '株式会社イヤーズ', officeName: '本社', manager: '見本 太郎', postal: '800-0001', address: '福岡県見本町', tel: '000-0000-0000'};
  const s = withPrime({...own, builders: [a, b]}, '');
  assert.deepEqual([s.company, s.officeName, s.manager, s.postal, s.address, s.tel, s.builderKey], ['見本株式会社', '見本営業所', '見本 一郎', '800-0000', '福岡県見本市', '000-000-0000', a.name]);
  const s2 = withPrime({...own, builders: [a, b]}, b.name);
  assert.deepEqual([s2.company, s2.officeName], ['見本工務店', '']);
  // 元請けがまだないときは、自社（下請け）の名前を施工業者に書かない
  const none = withPrime({...own, builders: []}, '');
  assert.deepEqual([none.company, none.officeName, none.address, none.tel, none.manager], ['', '', '', '', '']);
  // 保存して読み直しても元請けの営業所名（office）が残る。今までのアプリの営業所（office なし）はそのまま
  const kept = cleanSettings({builders: [a, b, {name: '小倉営業所', jigyoshoNo: '1', postal: '', address: '', tel: '', manager: ''}]}).builders ?? [];
  assert.deepEqual(kept.map((x) => [x.name, x.company, x.office]), [[a.name, '見本株式会社', '見本営業所'], [b.name, '見本工務店', ''], ['小倉営業所', undefined, undefined]]);
});

test('元請け：苅田町・行橋市の委任状、行橋市の受領委任払、みやこ町の承認届出書の施工業者の欄', async () => {
  const {primeOfficeCells} = await import('../../src/sasaoka/shinsei.ts');
  const o = {company: '見本建設株式会社', name: '見本営業所', address: '福岡市中央区天神', tel: '092-000-0000', manager: '見本　一郎'};
  assert.deepEqual(primeOfficeCells({sheet: '委任状', office: ['C10', 'C12', 'C14']}, o), [
    ['C10', '　福岡市中央区天神'],
    ['C12', '　電話番号　092-000-0000'],
    ['C14', '　見本建設株式会社\n　　　　　　　　　　見本営業所\n　　　　　　　　見本　一郎　㊞'],
  ]);
  assert.deepEqual(primeOfficeCells({sheet: '住改・受領委任払', office: ['AB14', 'H28', 'H29', 'H30']}, o).map(([, t]) => t), [
    '見本建設株式会社\n見本営業所',
    '福岡市中央区天神',
    '見本建設株式会社\n見本営業所　見本　一郎',
    '092-000-0000',
  ]);
  assert.deepEqual(primeOfficeCells({sheet: '住宅改修承認届出書', office: ['N17', 'N18', 'N19', 'N35']}, o).map(([, t]) => t), [
    '見本建設株式会社　見本営業所',
    '福岡市中央区天神',
    '092-000-0000',
    '（本人との関係：事業者）電話番号　092-000-0000',
  ]);
  // 営業所のない元請けは、行の終わりの空白を詰める。元請けがなければ書かない（原本の空白のまま）
  assert.deepEqual(primeOfficeCells({sheet: '住改・受領委任払', office: ['AB14']}, {...o, name: ''}), [['AB14', '見本建設株式会社']]);
  assert.deepEqual(primeOfficeCells({sheet: '住宅改修承認届出書', office: ['N17']}, {...o, name: ''}), [['N17', '見本建設株式会社']]);
  assert.deepEqual(primeOfficeCells({sheet: '委任状', office: ['C10']}, {company: '', name: '', address: '', tel: '', manager: ''}), []);
});

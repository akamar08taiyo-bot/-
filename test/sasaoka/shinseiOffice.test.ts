import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultSettings, OFFICES, settingsForOffice} from '../../src/sasaoka/defaults.ts';
import {shinseiSettings} from '../../src/sasaoka/shinsei.ts';
import {shinseiOfficeName} from '../../src/sasaoka/shinseiOffice.ts';
import type {Job} from '../../src/sasaoka/types.ts';

// ユーザーの指示（2026-11-05）「大分の申請書は、大分営業所／久留米は久留米営業所／飯塚は飯塚営業所／田川は田川営業所／
// 北九州は、小倉南、小倉、八幡東、八幡西／福岡は、福岡東、福岡南、福岡西／こちらの該当営業所と所長にする」

test('申請書の営業所：1つの営業所の市はその営業所・北九州市と福岡市は設定の営業所がその中ならそのまま、なければ区の近くの営業所', () => {
  for (const [insurer, office] of [['oita', '大分営業所'], ['kurume', '久留米営業所'], ['iizuka', '飯塚営業所']]) {
    assert.equal(shinseiOfficeName(insurer, '', '行橋営業所'), office, insurer);
  }
  assert.equal(shinseiOfficeName('kitakyushu', '小倉北区', '行橋営業所'), '小倉営業所');
  assert.equal(shinseiOfficeName('kitakyushu', '門司区', '行橋営業所'), '小倉営業所');
  assert.equal(shinseiOfficeName('kitakyushu', '戸畑区', '行橋営業所'), '八幡東営業所');
  assert.equal(shinseiOfficeName('kitakyushu', '若松区', '行橋営業所'), '八幡西営業所');
  assert.equal(shinseiOfficeName('kitakyushu', '', '行橋営業所'), '小倉南営業所');
  assert.equal(shinseiOfficeName('kitakyushu', '小倉北区', '八幡西営業所'), '八幡西営業所'); // 設定の営業所が北九州市の中ならそのまま
  assert.equal(shinseiOfficeName('fukuoka', '博多区', '行橋営業所'), '福岡東営業所');
  assert.equal(shinseiOfficeName('fukuoka', '南区', '行橋営業所'), '福岡南営業所');
  assert.equal(shinseiOfficeName('fukuoka', '早良区', '行橋営業所'), '福岡西営業所');
  assert.equal(shinseiOfficeName('fukuoka', '早良区', '福岡南営業所'), '福岡南営業所');
  // 田川は広域連合の田川市・田川郡だけ
  assert.equal(shinseiOfficeName('kouiki', '田川市', '行橋営業所'), '田川営業所');
  assert.equal(shinseiOfficeName('kouiki', '福智町', '行橋営業所'), '田川営業所');
  assert.equal(shinseiOfficeName('kouiki', '豊前市', '行橋営業所'), null);
  for (const insurer of ['yukuhashi', 'kanda', 'miyako']) assert.equal(shinseiOfficeName(insurer, '', '行橋営業所'), null, insurer);
});

test('申請書の営業所：替えるときは営業所の一覧の所長・住所・電話に。設定の営業所のままなら設定（直した所長など）のまま', () => {
  const job = (insurer: Job['insurer'], address: string) => ({insurer, form: '', address, shinsei: {}}) as unknown as Job;
  const s = settingsForOffice(defaultSettings(), '行橋営業所');
  for (const [insurer, address, office] of [
    ['oita', '大分県大分市見本町1-1', '大分営業所'],
    ['kurume', '福岡県久留米市見本町1-1', '久留米営業所'],
    ['iizuka', '福岡県飯塚市見本1-1', '飯塚営業所'],
    ['kitakyushu', '福岡県北九州市八幡西区見本1-1', '八幡西営業所'],
    ['fukuoka', '福岡県福岡市東区見本1-1', '福岡東営業所'],
    ['kouiki', '福岡県田川市見本1-1', '田川営業所'],
  ] as const) {
    const o = OFFICES.find((x) => x.name === office)!;
    const got = shinseiSettings(job(insurer, address), s);
    assert.deepEqual([got.officeName, got.manager, got.postal, got.address, got.tel], [o.name, o.manager, o.postal, o.address, o.tel], insurer);
    assert.equal(got.company, s.company);
  }
  // 行橋市・広域連合の豊前市は設定のまま
  assert.equal(shinseiSettings(job('yukuhashi', '福岡県行橋市見本1-1'), s), s);
  assert.equal(shinseiSettings(job('kouiki', '福岡県豊前市見本1-1'), s), s);
  // 設定の営業所のまま：設定で直した所長を使う
  const mine = {...settingsForOffice(defaultSettings(), '大分営業所'), manager: '見本 次郎'};
  assert.equal(shinseiSettings(job('oita', '大分県大分市見本町1-1'), mine).manager, '見本 次郎');
});

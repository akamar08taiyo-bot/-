// （株）イヤーズ デモアプリ（npm run build:years → dist-years/。ユーザーの指示「申請書、見積もりツールを（株）イヤーズ専用で作ろう…サンプルURLを渡し、
// こちらが主導権を握れるようにする。正式なものができるまではずっと使わせない。ツールのどこかにイヤーズ（株）デモアプリみたいな感じでいれる。今までのアプリは絶対に残しておく」2026-11-10）：
//   ・止めるスイッチ（status.json）：使える → 開く／止めた・期限が過ぎた → 開かない／読めない → 開かない（もう一度確かめる で開く）
//   ・画面：上に「（株）イヤーズ デモアプリ」・ポータルへ戻る／売上見込み／工務店請求書／特定福祉用具／カタログ／営業所の一覧を出さない
//   ・保存場所：今までのアプリ（同じサイト）のデータ（ポータルの営業所など）を読まない・書かない（名前の頭に years-demo:）
//   ・書類（申請書・理由書の Excel）に社内の字（会社名・営業所・所長・担当者）が出ない
// usage: node e2e-years.mjs <サイトのURL（/years-demo/ に dist-years を置いたもの）> <出力フォルダ>。お客様は架空のサンプル
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const STATUS = 'https://akamar08taiyo-bot.github.io/years-demo/status.json';
const errors = [];

// 社内の字（company.ts から読む。値そのものはログに出さない）
const company = await readFile(new URL('../../src/sasaoka/company.ts', import.meta.url), 'utf8');
const secrets = [
  '太陽',
  'シルバーサービス',
  ...company.matchAll(/(?:name|manager|tel): '([^']+)'/g),
  ...(company.split('DEFAULT_STAFF')[1]?.split(']')[0].matchAll(/'([^']+)'/g) ?? []),
]
  .map((m) => (typeof m === 'string' ? m : m[1]))
  .flatMap((t) => [t, t.replace(' ', '　')])
  .filter((t) => t.length >= 2);

/** status：status.json の中身（null＝読めない） */
async function open(status, viewport = {width: 1366, height: 900}) {
  const ctx = await browser.newContext({viewport, locale: 'ja-JP', acceptDownloads: true});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const state = {status};
  await ctx.route((u) => u.href.startsWith(STATUS), (r) => (state.status ? r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(state.status)}) : r.abort()));
  // 今までのアプリ（同じサイト）が保存したもの
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${site}/years-demo/index.html`);
  return {ctx, page, state};
}

// ---------------- 使える
{
  const {ctx, page} = await open({enabled: true, until: '2099-12-31', message: ''});
  const name = page.locator('[data-demo-name]');
  await name.waitFor();
  assert.equal((await name.innerText()).trim(), '（株）イヤーズ デモアプリ');
  assert.equal(await page.getByText('業務アプリポータルへ戻る').count(), 0);
  assert.equal(await page.title(), '（株）イヤーズ デモアプリ｜申請書・見積書作成');
  // ポータルの営業所（今までのアプリのデータ）は読まない
  assert.match(await page.locator('header').innerText(), /営業所未設定/);
  // メニュー：売上見込み・工務店請求書は出さない
  await page.getByRole('button', {name: /☰ メニュー/}).click();
  const menu = await page.getByRole('menu').allInnerTexts().catch(() => []);
  const menuText = menu.join(' ') || (await page.locator('body').innerText());
  assert.ok(!/売上見込み|工務店請求書/.test(menuText), menuText.slice(0, 200));
  await page.keyboard.press('Escape');
  await page.screenshot({path: path.join(outDir, 'years-list.png')});
  // 新規作成：久留米市・飯塚市・大分市は出さない（ユーザーの指示「久留米、飯塚、大分市の申請書はもう除いてください」2026-11-10）
  {
    const btns = (await page.getByRole('region', {name: '新規作成'}).getByRole('button').allInnerTexts()).map((t) => t.trim());
    assert.ok(!btns.some((t) => /久留米|飯塚|大分|田川|の申請書/.test(t)), JSON.stringify(btns)); // 「📑 田川市の申請書」も出さない（「田川市の申請書の部分も不要」）
    assert.ok(btns.includes('＋ 苅田町') && btns.includes('＋ 広域連合'), JSON.stringify(btns));
  }
  // 新しい様邸（苅田町）：タブは住宅改修だけ。介援隊のカタログのボタンはない
  await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 苅田町', exact: true}).click();
  const tabs = await page.locator('[data-job-tabs] [role="tab"]').allInnerTexts();
  assert.deepEqual(tabs.map((t) => t.trim()), ['📝 住宅改修申請書', '📋 工事見積書', '📄 理由書', '📐 平面図']);
  assert.equal(await page.getByRole('button', {name: '📖 カタログを表示'}).count(), 0);
  const form = page.getByRole('form', {name: '申請書'});
  // 保険者を選ぶ欄にも出さない
  const insurers = await page.getByLabel('保険者', {exact: true}).first().locator('option').allInnerTexts();
  assert.ok(insurers.length >= 6 && !insurers.some((t) => /久留米|飯塚|大分/.test(t)), JSON.stringify(insurers));
  await form.getByLabel('被保険者氏名').fill('見本 花子');
  const works = form.locator('[data-field="works"]');
  await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '玄関'});
  await page.keyboard.type('600');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1200);
  await page.screenshot({path: path.join(outDir, 'years-shinsei.png')});
  // 申請書・理由書の Excel に社内の字が出ない
  const xlsxText = async () => {
    const dl = page.waitForEvent('download', {timeout: 60000});
    return dl;
  };
  await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).first().click();
  const dlg = page.getByRole('dialog', {name: 'Excelで保存'});
  const labels = await dlg.getByRole('checkbox').evaluateAll((els) => els.map((e) => e.closest('label')?.innerText.trim().split('\n')[0] ?? ''));
  assert.ok(!labels.some((l) => /特定福祉用具|販売見積書/.test(l)), JSON.stringify(labels));
  await dlg.getByRole('checkbox', {name: /^理由書/}).check();
  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await dlg.getByRole('button', {name: /保存する/}).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {timeout: 60000});
  await page.waitForTimeout(1500);
  assert.equal(downloads.length, 2, `保存したファイル ${downloads.length}`);
  for (const d of downloads) {
    const p = path.join(outDir, d.suggestedFilename());
    await d.saveAs(p);
    const files = unzipSync(new Uint8Array(await readFile(p)));
    let hits = 0;
    for (const [part, data] of Object.entries(files)) {
      if (!/\.(xml|rels)$/.test(part)) continue;
      const xml = strFromU8(data);
      for (const s of secrets) if (xml.includes(s)) hits++;
    }
    assert.equal(hits, 0, `${d.suggestedFilename()} に社内の字`);
  }
  void xlsxText;
  // 設定：営業所の一覧（社内）は出さない
  await page.goto(`${site}/years-demo/index.html#tab=settings`);
  await page.locator('[data-demo-name]').waitFor();
  await page.getByRole('button', {name: /☰ メニュー/}).click();
  await page.getByRole('menuitem', {name: /設定/}).or(page.getByRole('button', {name: /⚙ 設定/})).first().click();
  await page.getByText('自社の情報').first().waitFor();
  assert.equal(await page.getByText('（選んでください）').count(), 0);
  // 保存場所：今までのアプリの名前の保存場所はない（頭に years-demo:）。ポータルの営業所はそのまま
  const stores = await page.evaluate(async () => {
    const dbs = (await indexedDB.databases()).map((d) => d.name);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return {dbs, keys};
  });
  assert.ok(stores.dbs.length > 0 && stores.dbs.every((n) => n.startsWith('years-demo:')), JSON.stringify(stores.dbs));
  assert.ok(stores.keys.filter((k) => k !== 'taiyo_portal_session').every((k) => k.startsWith('years-demo:')), JSON.stringify(stores.keys));
  assert.ok(stores.keys.includes('taiyo_portal_session'));
  log('使える：（株）イヤーズ デモアプリの名前・社内のものを出さない・保存場所を分ける・Excel に社内の字が出ない OK');
  await ctx.close();
}

// ---------------- 止めた・期限が過ぎた・読めない
for (const [status, re] of [
  [{enabled: false, until: '2099-12-31', message: ''}, /現在お使いいただけません/],
  [{enabled: true, until: '2020-01-31', message: ''}, /2020年1月31日まで.*終わりました/],
  [{enabled: false, until: '2099-12-31', message: '正式版の準備中です。'}, /正式版の準備中です/],
]) {
  const {ctx, page} = await open(status);
  const lock = page.getByRole('alertdialog', {name: 'デモを使えません'});
  await lock.waitFor();
  assert.match(await lock.innerText(), re);
  assert.equal(await page.locator('[data-demo-name]').count(), 0);
  assert.equal(await page.locator('header').count(), 0); // アプリの本体は読み込まない
  await ctx.close();
}
{
  const {ctx, page, state} = await open(null);
  const lock = page.getByRole('alertdialog', {name: 'デモを使えません'});
  await lock.waitFor();
  assert.match(await lock.innerText(), /確認ができませんでした/);
  await page.screenshot({path: path.join(outDir, 'years-lock.png')});
  state.status = {enabled: true, until: '2099-12-31'};
  await lock.getByRole('button', {name: 'もう一度確かめる'}).click();
  await page.locator('[data-demo-name]').waitFor();
  assert.equal(await lock.count(), 0);
  await ctx.close();
}
log('止めた・期限が過ぎた・読めない：開かない（読めないときは もう一度確かめる で開く）OK');

// ---------------- スマホ
{
  const {ctx, page} = await open({enabled: true, until: '2099-12-31'}, {width: 390, height: 844});
  await page.locator('[data-demo-name]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.screenshot({path: path.join(outDir, 'years-phone.png')});
  await ctx.close();
}
log('スマホの幅で横にはみ出さない OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-years: all OK');

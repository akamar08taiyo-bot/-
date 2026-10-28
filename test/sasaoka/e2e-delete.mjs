// 様邸の画面のどのタブにも「削除」（白いボタン）があること（ユーザーの指示「住宅改修申請書、販売申請書、理由書、工事見積書全てに削除ボタンを設置する。
// ボタンの色は統一する。他にも同じ内容でボタンの色が違う場合は統一する」2026-10-28）：
//   住宅改修申請書・工事見積書・理由書の「削除」は様邸をゴミ箱に移す（「○○様邸をゴミ箱に移しますか？」）。
//   特定福祉用具申請書・販売見積書のタブ（中は特定福祉用具のアプリ）の「削除」は、その特定福祉用具の見積もり・申請書を消す（白。前の販売見積書は赤い字）。
//   特定福祉用具のアプリの「🖨 カタログを印刷」は印刷の色（薄い水色）
//   特定福祉用具の2つのタブには「← 見積もりの一覧へ」「👤 前のお客様から入れる」を出さない（ユーザーの指示「赤枠の部分は不要です」2026-10-28）。
//   販売見積書の「削除」のあとも一覧は出さず、その様邸の新しい案件（お客様の名前は様邸から）を開く
// usage: node e2e-delete.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html・<サイト>/tokutei/index.html。tokutei がなければ住宅改修のタブだけ確かめる）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const asked = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => {
  asked.push(d.message());
  void d.accept();
});
const withTokutei = (await fetch(`${site}/tokutei/index.html`).catch(() => null))?.ok === true;
const WHITE = 'rgb(255, 255, 255)';
const bg = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundColor);

await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
await page.getByRole('form', {name: '申請書'}).waitFor();
await page.keyboard.type('みほん　ごろう');
await page.keyboard.press('Enter');
await page.keyboard.type('見本 五郎');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);

// 住宅改修の3つのタブ：白い「削除」
for (const tab of ['📝 住宅改修申請書', '📋 工事見積書', '📄 理由書']) {
  await page.getByRole('tab', {name: tab}).click();
  const del = page.getByRole('button', {name: '削除', exact: true});
  await del.waitFor();
  assert.equal(await del.count(), 1, tab);
  assert.equal(await bg(del), WHITE, tab);
}
log('住宅改修申請書・工事見積書・理由書に白い「削除」OK');

// 特定福祉用具の2つのタブ：上の段（住宅改修のほかのタブと同じ所）の白い「削除」。押すと中のアプリが特定福祉用具の案件を消す。
// 中のアプリの上の段は出さない（同じボタンが2つにならないように。ユーザーの指示「各タブでEXCEL印刷や保存など…統一する」2026-10-28）。カタログを印刷は薄い水色
if (withTokutei) {
  const frame = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
  const del = page.getByRole('group', {name: '保存・印刷・削除'}).getByRole('button', {name: '削除', exact: true});
  for (const tab of ['🛁 特定福祉用具申請書', '🏷 販売見積書']) {
    await page.getByRole('tab', {name: tab}).click();
    await page.getByRole('tab', {name: tab, selected: true}).waitFor();
    await del.waitFor();
    assert.equal(await bg(del), WHITE, tab);
    await frame.getByLabel('商品名').first().waitFor({timeout: 15000});
    assert.equal(await frame.getByRole('button', {name: '削除', exact: true}).count(), 0, tab);
    assert.equal(await frame.getByRole('group', {name: '保存・印刷・削除'}).count(), 0, tab);
    // 申請書のタブは上の段の2段目（Excel・印刷・削除の真下）、販売見積書のタブは中のアプリの右の欄
    const cat = tab === '🛁 特定福祉用具申請書' ? page.getByRole('group', {name: 'そのほかの機能'}).getByRole('button', {name: '🖨 カタログを印刷'}) : frame.getByRole('button', {name: '🖨 カタログを印刷'}).first();
    assert.match(await cat.getAttribute('class'), /bg-sky-50/, tab);
    assert.equal(await frame.getByRole('button', {name: '📖 カタログを印刷'}).count(), 0, tab);
    assert.equal(await frame.getByRole('button', {name: '← 見積もりの一覧へ'}).count(), 0, tab);
    assert.equal(await frame.getByRole('button', {name: '👤 前のお客様から入れる'}).count(), 0, tab);
    assert.equal(await frame.getByRole('button', {name: '複製', exact: true}).count(), 0, tab); // 様邸のタブの中には複製を出さない（「ここの複製ボタンは不要」2026-10-28）
  }
  await page.screenshot({path: path.join(outDir, 'delete-01-hanbai.png')});
  log('特定福祉用具申請書・販売見積書に白い「削除」（上の段）・中のアプリの上の段はなし・一覧へ／前のお客様から入れるはなし OK');

  // 販売見積書の「削除」→ 確かめ → 一覧ではなく、この様邸の新しい案件（名前は様邸から）
  await frame.getByLabel('商品名').first().fill('見本の杖');
  await page.waitForTimeout(800);
  await del.click();
  for (let i = 0; i < 50 && !asked.some((m) => m.includes('特定福祉用具')); i++) await page.waitForTimeout(100);
  assert.match(asked.at(-1), /特定福祉用具の見積もり・申請書を消します/);
  await page.waitForFunction(() => document.querySelector('iframe[data-tokutei]')?.contentDocument?.querySelector('[aria-label="商品名"]')?.value === '', null, {timeout: 10000});
  assert.equal(await frame.getByRole('textbox', {name: '見積もりを検索'}).count(), 0); // 一覧ではない
  assert.match(await frame.getByRole('textbox', {name: 'お客様名'}).inputValue(), /見本 五郎/);
  log('販売見積書の「削除」のあとは様邸の新しい案件（一覧は出さない）OK');
}

// 理由書のタブの「削除」→ 確かめてゴミ箱へ → 一覧に戻る
await page.getByRole('tab', {name: '📄 理由書'}).click();
await page.screenshot({path: path.join(outDir, 'delete-02-riyu.png')});
await page.getByRole('button', {name: '削除', exact: true}).click();
assert.equal(asked.at(-1), '見本 五郎様邸をゴミ箱に移しますか？');
await page.waitForFunction(() => !location.hash.includes('job='));
await page.locator('[aria-live] > div', {hasText: 'ゴミ箱に移しました'}).waitFor();
assert.match(await page.getByRole('navigation').getByRole('button', {name: /ゴミ箱/}).innerText(), /1/);
log('理由書の「削除」→ ゴミ箱 OK');

await browser.close();
if (errors.length) {
  console.log('ERRORS:', errors);
  process.exit(1);
}
console.log('ERRORS: なし');

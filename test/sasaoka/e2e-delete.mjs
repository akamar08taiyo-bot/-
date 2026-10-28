// 様邸の画面のどのタブにも「削除」（白いボタン）があること（ユーザーの指示「住宅改修申請書、販売申請書、理由書、工事見積書全てに削除ボタンを設置する。
// ボタンの色は統一する。他にも同じ内容でボタンの色が違う場合は統一する」2026-10-28）：
//   住宅改修申請書・工事見積書・理由書の「削除」は様邸をゴミ箱に移す（「○○様邸をゴミ箱に移しますか？」）。
//   特定福祉用具申請書・販売見積書のタブ（中は特定福祉用具のアプリ）の「削除」は、その特定福祉用具の見積もり・申請書を消す（白。前の販売見積書は赤い字）。
//   特定福祉用具のアプリの「🖨 カタログを印刷」は印刷の色（薄い水色）
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

// 特定福祉用具の2つのタブ：中のアプリの白い「削除」（申請書のタブにも）。カタログを印刷は薄い水色
if (withTokutei) {
  const frame = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
  for (const tab of ['🛁 特定福祉用具申請書', '🏷 販売見積書']) {
    await page.getByRole('tab', {name: tab}).click();
    const del = frame.getByRole('button', {name: '削除', exact: true});
    await del.waitFor({timeout: 15000});
    assert.equal(await bg(del), WHITE, tab);
    const cat = frame.getByRole('button', {name: '🖨 カタログを印刷'}).first();
    assert.match(await cat.getAttribute('class'), /bg-sky-50/, tab);
    assert.equal(await frame.getByRole('button', {name: '📖 カタログを印刷'}).count(), 0, tab);
  }
  await page.screenshot({path: path.join(outDir, 'delete-01-hanbai.png')});
  log('特定福祉用具申請書・販売見積書に白い「削除」・カタログを印刷は薄い水色 OK');
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
